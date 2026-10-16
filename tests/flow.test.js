const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const F = require('../src/flow.js');

function st(o) { return Object.assign(F.newState(), o); }

test('F-01 Passo 1 exige resposta e altitude do local', () => {
  const o = F.compute(st({}));
  assert.equal(o.step1.ok, false);
  assert.ok(o.step1.errors.altChange && o.step1.errors.siteAlt);
});

test('F-02 Sem alteração de altitude: sem grupo, máximo pela Tabela 1', () => {
  const o = F.compute(st({ altChange: 'nao', siteAlt: '0', dives: [{ depth: '18,3', bt: '', si: '', next: '' }] }));
  const d = o.dives[0];
  assert.equal(d.preGroup, null); assert.equal(d.adjusted, 18.3); assert.equal(d.limit.value, 60);
  assert.equal(d.safetyStop, true); assert.equal(d.done, undefined);
});

test('F-03 Com diferença de altitude: grupo do Anexo C e máximo pela Tabela 3', () => {
  const o = F.compute(st({ altChange: 'sim', altDiff: '600', altRest: '0', siteAlt: '850', dives: [{ depth: '12', bt: '', si: '', next: '' }] }));
  assert.equal(o.step1.entryGroup, 'B');
  const d = o.dives[0];
  assert.equal(d.adjusted, 13.7); assert.equal(d.limit.value, 107); assert.equal(d.limit.tnr, 18);
});

test('F-04 Sequência completa: mergulho, intervalo, novo mergulho e encerramento', () => {
  const o = F.compute(st({ altChange: 'nao', siteAlt: '0', dives: [
    { depth: '18,3', bt: '40', si: '', next: 'sim' },
    { depth: '15,2', bt: '30', si: '1:00', next: 'nao' }] }));
  assert.equal(o.dives[0].groupAfter, 'H');
  assert.equal(o.dives[1].preGroup, 'G'); assert.equal(o.dives[1].limit.value, 43);
  assert.equal(o.dives[1].groupAfter, 'K'); assert.equal(o.finished, true);
});

test('F-05 Intervalo < 10 min: tempo restante do mesmo mergulho', () => {
  const o = F.compute(st({ altChange: 'nao', siteAlt: '0', dives: [
    { depth: '12', bt: '20', si: '', next: 'sim' }, { depth: '10', bt: '', si: '5', next: '' }] }));
  assert.equal(o.dives[1].preKind, 'unico');
  assert.equal(o.dives[1].limit.value, 163 - 20 - 5);
});

test('F-06 Profundidade fora da tabela bloqueia', () => {
  const o = F.compute(st({ altChange: 'nao', siteAlt: '0', dives: [{ depth: '42', bt: '', si: '', next: '' }] }));
  assert.equal(o.dives[0].blocked, true);
});

test('F-07 Relatório PDF válido com vários mergulhadores', () => {
  const op = F.newOp();
  Object.assign(op, { altChange: 'sim', altDiff: '600', siteAlt: '850', depth: '18', meta: { ocorrencia: 'REDS 2026-000123', local: 'Represa – teste', supervisor: '1º Sgt Fulano' } });
  op.divers = [
    { name: 'Cb BM Alfa', tcs: '22', rest: '30', dives: [{ bt: '20', next: 'sim' }, { depth: '12', bt: '25', si: '90', next: 'nao' }] },
    { name: 'Sd BM Bravo', tcs: '', rest: '0', dives: [{ bt: '25', next: 'nao' }] },
    { name: '', tcs: '', rest: '200', dives: [{ bt: '', next: '' }] }];
  const logo = fs.readFileSync(__dirname + '/../src/logo_jpg.b64', 'utf8').trim();
  const bytes = F.report(op, { logoJpg: logo, now: new Date('2026-10-07T12:00:00') });
  const txt = Buffer.from(bytes).toString('latin1');
  assert.ok(txt.startsWith('%PDF-1.4')); assert.ok(txt.trimEnd().endsWith('%%EOF'));
  fs.writeFileSync(process.env.PDF_OUT || path.join(os.tmpdir(), 'relatorio-teste.pdf'), bytes);
});

test('F-08 TF acima do máximo em repetitivo: não fica OK, relatório não quebra', () => {
  const s = st({ altChange: 'nao', siteAlt: '0', dives: [
    { depth: '18,3', bt: '40', si: '', next: 'sim' }, { depth: '18,3', bt: '30', si: '30', next: 'nao' }] });
  const o = F.compute(s);
  assert.equal(o.dives[1].limit.value, 14); assert.notEqual(o.dives[1].status, 'ok'); // TFE 76 > 60: exige parada (excepcional)
  const op = F.newOp(); Object.assign(op, { altChange: 'nao', siteAlt: '0', depth: '18,3' });
  op.divers[0].dives = [{ bt: '40', next: 'sim' }, { depth: '18,3', bt: '30', si: '30', next: 'nao' }];
  assert.ok(F.report(op, {}).length > 1000);
});

test('F-09 Exposição excepcional: grupo calculado e parada NOAA informada', () => {
  const o = F.compute(st({ altChange: 'nao', siteAlt: '0', dives: [{ depth: '18,3', bt: '70', si: '', next: '' }] }));
  assert.equal(o.dives[0].status, 'excepcional'); assert.equal(o.dives[0].stops[0].depth, 6.1);
});

test('F-10 Autonomia limita o tempo máximo de fundo', () => {
  const op = F.newOp(); Object.assign(op, { altChange: 'nao', siteAlt: '0', depth: '13' });
  op.divers[0].tcs = '28';
  const o = F.compute(F.diverState(op, 0)), r = o.dives[0];
  assert.equal(r.adjusted, 13.7); assert.equal(r.limit.value, 125);
  const au = F.autonomyFor(op, 0, r.adjusted);           // 11,2 × 150 ÷ (28 × 2,37) = 25,3 → 25
  assert.equal(au.minutes, 25);
  assert.deepEqual(F.effectiveMax(r.limit, au), { value: 25, by: 'autonomia' });
  assert.equal(F.autonomyFor(Object.assign(F.newOp(), { divers: [F.newDiver()] }), 0, 13.7), null);
});

test('F-11 Cada mergulhador tem sua própria sequência e grupo', () => {
  const op = F.newOp(); Object.assign(op, { altChange: 'nao', siteAlt: '0', depth: '18,3' });
  op.divers = [{ name: 'A', tcs: '', dives: [{ bt: '20' }] }, { name: 'B', tcs: '', dives: [{ bt: '50' }] }];
  assert.equal(F.compute(F.diverState(op, 0)).dives[0].groupAfter, 'D');
  assert.equal(F.compute(F.diverState(op, 1)).dives[0].groupAfter, 'I');
  assert.equal(F.diverName(op, 1), 'B'); op.divers[1].name = ' '; assert.equal(F.diverName(op, 1), 'Mergulhador 2');
});

test('F-12 Descanso no local reduz o grupo de altitude pela Tabela 2 antes do 1º mergulho', () => {
  const base = { altChange: 'sim', altDiff: '1500', siteAlt: '850' };
  const run = (rest) => F.compute(st(Object.assign({}, base, { altRest: rest, dives: [{ depth: '12', bt: '', si: '', next: '' }] })));
  const miss = F.compute(st(Object.assign({}, base, { altRest: '', needRest: true, dives: [{ depth: '12', bt: '', si: '', next: '' }] })));
  assert.ok(miss.step1.ok); assert.equal(miss.restMissing, true); assert.equal(miss.dives.length, 0); // obrigatório por mergulhador
  const a = run('5');   assert.equal(a.step1.entryGroup, 'D'); assert.equal(a.step1.startGroup, 'D'); // < 10 min: sem crédito
  const b = run('2:00'); assert.equal(b.step1.startGroup, 'B'); assert.equal(b.dives[0].preGroup, 'B'); // coluna D, 1:48–3:03 → B
  assert.equal(b.dives[0].limit.value, 125 - 18);             // Tabela 3: B a 13,7 m → TNR 18, máximo 107
  const c = run('16:00'); assert.equal(c.step1.startGroup, null); assert.equal(c.dives[0].limit.value, 125); // > 15h50: sem residual
  // o motor usa o mesmo grupo para o grupo após o mergulho
  const d = F.compute(st(Object.assign({}, base, { altRest: '2:00', dives: [{ depth: '12', bt: '20', si: '', next: '' }] })));
  assert.equal(d.series.initialGroup, 'B'); assert.equal(d.dives[0].res.tnr, 18);
});

test('F-13 Descanso individual: cada mergulhador tem seu grupo de entrada', () => {
  const op = F.newOp(); Object.assign(op, { altChange: 'sim', altDiff: '1500', siteAlt: '850', depth: '12' });
  op.divers = [F.newDiver(), F.newDiver(), F.newDiver()];
  op.divers[0].rest = '5'; op.divers[1].rest = '120'; op.divers[2].rest = '';
  assert.equal(F.compute(F.diverState(op, 0)).dives[0].preGroup, 'D');   // < 10 min: mantém D
  assert.equal(F.compute(F.diverState(op, 1)).dives[0].preGroup, 'B');   // 120 min a partir de D → B
  assert.equal(F.compute(F.diverState(op, 2)).restMissing, true);
  const e = F.cylErrors(op);
  assert.ok(e['divers.2.rest']); assert.ok(!e['divers.0.rest']); assert.ok(!e['divers.1.rest']);
  op.divers[2].rest = '1:30'; assert.ok(F.cylErrors(op)['divers.2.rest']);  // somente minutos
  assert.equal(F.siteOut(op).dives[0].preGroup, 'D');                       // passo 3 (comum): pior caso, sem descanso
  op.altChange = 'nao'; assert.deepEqual(F.cylErrors(op), {});              // sem subida: descanso não é pedido
});
