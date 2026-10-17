/*
 * Testes automatizados — execute com:  node --test tests/
 * Convenção dos IDs:
 *   T-DATA-*  integridade da transcrição (consistência interna das tabelas)
 *   T-ITO-*   exemplos numéricos presentes na ITO 12 (Figuras 2 e 4)
 *   T-NOAA-*  leituras célula a célula das tabelas (casos derivados; ver AUS-09)
 *   T-SER-*   mergulhos repetitivos / séries
 *   T-VAL-*   validação de entradas
 *   T-EQ-*    nível de equipe (ITO 12, item 4)
 *   T-PLAN-*  plano de mergulho
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../src/engine.js');
const D = E.DATA;

// ---------------------------------------------------------------- Integridade
test('T-DATA-01 Tabela 1: 12 linhas × 16 colunas, crescente, limite circulado = maior célula sem parada', () => {
  assert.equal(D.T1.length, 12);
  D.T1.forEach((row, i) => {
    assert.equal(row.cells.length, 16, 'linha ' + D.DEPTHS_M[i]);
    let prev = 0, lastNum = null;
    row.cells.forEach(c => {
      if (c === null) return;
      const v = typeof c === 'number' ? c : c.bt;
      assert.ok(v > prev, 'crescente na linha ' + D.DEPTHS_M[i]); prev = v;
      if (typeof c === 'number') lastNum = c; else assert.ok(c.bt > row.ndl && c.stop > 0);
    });
    assert.equal(lastNum, row.ndl, 'limite da linha ' + D.DEPTHS_M[i]);
  });
});

test('T-DATA-02 Tabela 3: TNR + ajuste = limite sem parada da Tabela 1 (todas as células)', () => {
  let n = 0;
  D.GROUPS.forEach(g => D.T3[g].forEach((c, i) => {
    if (!c) return; n++;
    assert.equal(c[0] + c[1], D.T1[i].ndl, `grupo ${g}, ${D.DEPTHS_M[i]} m`);
  }));
  assert.equal(n, 107); // A–C:12, D–E:11, F:10, G:9, H:8, I:7, J:5, K:4, L:3, M:2, N:1
});

test('T-DATA-03 Tabela 2: faixas contínuas em cada coluna, de :10 até o máximo; Z→A termina em 15:50', () => {
  D.GROUPS.forEach((g, gi) => {
    let expectedMin = 10;
    for (let hi = gi; hi >= 0; hi--) {
      const [a, b] = E.parseRange(D.T2_ROWS[D.GROUPS[hi]][gi - hi]);
      assert.equal(a, expectedMin, `coluna ${g}, linha ${D.GROUPS[hi]}`);
      assert.ok(b > a);
      expectedMin = b + 1;
    }
  });
  assert.equal(E.parseRange(D.T2_ROWS.A[15])[1], 15 * 60 + 50);
});

test('T-DATA-04 Anexo B: não decrescente por linha e coluna; coluna 304,8 m = profundidade real até 44,2 m', () => {
  D.ALT_ROWS.forEach(([depth, vals], r) => {
    let p = 0;
    vals.forEach(v => { if (v === null) return; assert.ok(v >= p); p = v; });
    if (depth <= 44.2) assert.equal(vals[0], depth);
    if (r > 0) vals.forEach((v, c) => { const up = D.ALT_ROWS[r - 1][1][c]; if (v !== null && up !== null) assert.ok(v >= up); });
  });
});

test('T-DATA-05 Anexo C: grupos não decrescentes com a altitude', () => {
  let p = -1;
  D.ALT_GROUP.forEach(([, g]) => { const i = D.GROUPS.indexOf(g); assert.ok(i >= p); p = i; });
});

test('T-DATA-06 Hash dos dados tabulares (detecta alteração silenciosa)', () => {
  assert.equal(E.dataHash(), 'D1F341DD');
});

// ---------------------------------------------------------------- Exemplos da ITO
test('T-ITO-01 Autonomia – Figura 2: 11,2 L × 150 bar ÷ (28 L/min × 2,3 ATA) = 26 min', () => {
  const r = E.autonomy({ volL: 11.2, pIni: 200, tcs: 28, depth: 13 });
  assert.ok(r.ok);
  assert.equal(r.usable, 150);
  assert.ok(Math.abs(r.pAbs - 2.3) < 1e-9);
  assert.equal(r.minutes, 26);
});

test('T-ITO-02 TCS – Figura 4: 30 bar × 11,2 L ÷ 1,2 ATA ÷ 10 min = 28 L/min', () => {
  const r = E.tcsCalc({ deltaBar: 30, volL: 11.2, depth: 2, minutes: 10 });
  assert.ok(r.ok);
  assert.ok(Math.abs(r.litros - 280) < 1e-9);
  assert.ok(Math.abs(r.value - 28) < 1e-9);
});

// ---------------------------------------------------------------- Leituras NOAA
test('T-NOAA-01 Tabela 1: 12,2 m / 163 min → O no limite; 164 min → Z com 14 min a 6,1 m', () => {
  const a = E.t1Lookup(12.2, 163); assert.equal(a.group, 'O'); assert.equal(a.deco, null); assert.ok(a.withinNDL);
  const b = E.t1Lookup(12.2, 164); assert.equal(b.group, 'Z'); assert.deepEqual(b.deco, { depth: 6.1, minutes: 14 });
});

test('T-NOAA-02 Tabela 1: 18,3 m – 60 → K; 61 → L (2 min); 66 → N (14 min, célula M cinza)', () => {
  assert.equal(E.t1Lookup(18.3, 60).group, 'K');
  const l = E.t1Lookup(18.3, 61); assert.equal(l.group, 'L'); assert.equal(l.deco.minutes, 2);
  const n = E.t1Lookup(18.3, 66); assert.equal(n.group, 'N'); assert.equal(n.deco.minutes, 14);
});

test('T-NOAA-03 Tabela 1: 39,6 m – 10 → E; 11 → G (1 min); 26 → fora da tabela', () => {
  assert.equal(E.t1Lookup(39.6, 10).group, 'E');
  assert.equal(E.t1Lookup(39.6, 11).deco.minutes, 1);
  const x = E.t1Lookup(39.6, 26); assert.equal(x.ok, false); assert.ok(x.outOfTable);
});

test('T-NOAA-04 Tabela 1: valores intermediários (INT-01) e profundidade < 12,2 m (INT-07)', () => {
  const a = E.t1Lookup(13, 20); assert.equal(a.rowDepth, 13.7); assert.equal(a.group, 'C'); assert.ok(a.trace.rules['INT-01']);
  const b = E.t1Lookup(10, 12); assert.equal(b.rowDepth, 12.2); assert.equal(b.group, 'A'); assert.ok(b.trace.rules['INT-07']);
  assert.equal(E.t1Lookup(40, 5).ok, false);
});

test('T-NOAA-05 Tabela 2: leituras de faixa, limites e casos especiais', () => {
  assert.equal(E.t2Lookup('D', 52).group, 'D');
  assert.equal(E.t2Lookup('D', 53).group, 'C');
  assert.equal(E.t2Lookup('D', 60).group, 'C');
  assert.equal(E.t2Lookup('Z', 950).group, 'A');
  assert.equal(E.t2Lookup('Z', 951).kind, 'novo');
  assert.equal(E.t2Lookup('B', 9).kind, 'unico');
  const a = E.t2Lookup('A', 141); assert.equal(a.group, 'A'); assert.ok(a.beyondColumn); assert.ok(a.trace.rules['INT-03']);
  assert.equal(E.t2Lookup('K', 9 * 60 + 10).group, 'A');
  assert.equal(E.t2Lookup('K', 9 * 60 + 9).group, 'B');
});

test('T-NOAA-06 Tabela 3: TNR/ajuste, célula cinza e profundidade < 12,2 m', () => {
  const e = E.t3Lookup('E', 18.3); assert.equal(e.tnr, 29); assert.equal(e.abt, 31);
  const g = E.t3Lookup('D', 39.6); assert.equal(g.ok, false); assert.ok(g.noEntry);
  const c = E.t3Lookup('C', 5); assert.equal(c.tnr, 29); assert.equal(c.abt, 134); assert.ok(c.trace.rules['NOAA-T3-12']);
  assert.equal(E.t3Lookup('O', 12.2).ok, false);
});

test('T-NOAA-07 Anexo B e Anexo C', () => {
  assert.equal(E.adjustDepth(18, 850).adjusted, 21.3);
  assert.equal(E.adjustDepth(10, 0).adjusted, 10.7);
  assert.equal(E.adjustDepth(3, 3047.9).adjusted, 4.6);
  assert.equal(E.adjustDepth(58, 0).ok, false);
  assert.equal(E.adjustDepth(5, 3100).ok, false);
  assert.equal(E.adjustDepth(44.2, 3047.9).ok, false); // célula em branco
  assert.equal(E.altitudeGroup(850).group, 'B');
  assert.equal(E.altitudeGroup(1200).group, 'C');
  assert.equal(E.altitudeGroup(3001).ok, false);
});

test('T-NOAA-08 IS necessário: grupo G → 18,3 m por 30 min exige IS ≥ 1:45 (grupo E, ajuste 31)', () => {
  const r = E.requiredSI('G', 18.3, 30);
  assert.ok(r.ok); assert.equal(r.minSI, 105); assert.equal(r.group, 'E'); assert.equal(r.maxBT, 31);
  const x = E.requiredSI('A', 18.3, 61); assert.equal(x.ok, false);
});

// ---------------------------------------------------------------- Séries
const base = { altitude: 0, travelGain: false, ascentRate: 18, descentRate: 18 };

test('T-SER-01 Repetitivo: 18,3 m/40 → H; IS 60 → G; 15,2 m/30 → TNR 49, TFE 79 → K', () => {
  const s = E.computeSeries({ ...base, dives: [{ realDepth: 18.3, bt: 40 }, { realDepth: 15.2, bt: 30, si: 60 }] });
  assert.equal(s.dives[0].res.group, 'H');
  assert.deepEqual(s.dives[0].res.stops.map(x => x.depth), [5]); // ITO 3.46 (> 18 m)
  const d2 = s.dives[1].res;
  assert.equal(d2.input.preGroup, 'G'); assert.equal(d2.tnr, 49); assert.equal(d2.tfe, 79); assert.equal(d2.group, 'K');
  assert.equal(d2.status, 'ok');
});

test('T-SER-02 IS < 10 min: combinação em mergulho único (INT-02)', () => {
  const s = E.computeSeries({ ...base, dives: [{ realDepth: 12, bt: 20 }, { realDepth: 10, bt: 10, si: 5 }] });
  const c = s.dives[1];
  assert.equal(c.mergedInto, 0);
  assert.equal(c.res.input.bt, 35); assert.equal(c.res.group, 'D');
  assert.equal(s.effective.length, 1);
});

test('T-SER-03 Deslocamento com ganho de altitude (Anexo C) aplicado ao 1º mergulho', () => {
  const s = E.computeSeries({ ...base, altitude: 850, travelGain: true, dives: [{ realDepth: 12, bt: 30 }] });
  assert.equal(s.initialGroup, 'B');
  const r = s.dives[0].res;
  assert.equal(r.adjusted, 13.7); assert.equal(r.tnr, 18); assert.equal(r.tfe, 48); assert.equal(r.group, 'G');
});

test('T-SER-04 Limite diário de 240 min (ITO 7.10.7)', () => {
  const s = E.computeSeries({ ...base, dives: [{ realDepth: 3, bt: 120 }, { realDepth: 3, bt: 60, si: 16 * 60 }, { realDepth: 3, bt: 70, si: 16 * 60 }] });
  assert.ok(s.alerts.some(a => a.rule === 'ITO-7.10.7' && a.level === 'bloqueio'));
});

test('T-SER-05 TF repetitivo acima do ajuste da Tabela 3 é bloqueado', () => {
  const s = E.computeSeries({ ...base, dives: [{ realDepth: 18.3, bt: 40 }, { realDepth: 18.3, bt: 25, si: 30 }] });
  const r = s.dives[1].res; // H→H (IS 30), ajuste H@18,3 = 14
  assert.equal(r.maxBT, 14);
  assert.notEqual(r.status, 'ok');
});

test('T-SER-06 Horários: IS calculado pela chegada à superfície e início seguinte', () => {
  const s = E.computeSeries({ ...base, dives: [{ realDepth: 12.2, bt: 30, start: '08:00' }, { realDepth: 12.2, bt: 20, start: '09:31' }] });
  // superfície = 08:00 + 30 + 12,2/18 min (0,68) → 08:30,68 ; IS = floor(60,32) = 60
  assert.equal(s.dives[1].si, 60);
});

test('T-SER-07 Mergulho descompressivo recebe status de exposição excepcional (não OK)', () => {
  const s = E.computeSeries({ ...base, dives: [{ realDepth: 18.3, bt: 70 }] });
  const r = s.dives[0].res;
  assert.equal(r.status, 'excepcional'); assert.equal(r.stops[0].depth, 6.1); assert.equal(r.stops[0].minutes, 14);
});

// ---------------------------------------------------------------- Validação
test('T-VAL-01 Entradas inválidas não produzem resultado', () => {
  assert.equal(E.computeDive({ realDepth: 10, bt: 12.5, altitude: 0, ascentRate: 18, descentRate: 18 }).status, 'bloqueio');
  assert.equal(E.computeDive({ realDepth: -1, bt: 10, altitude: 0, ascentRate: 18, descentRate: 18 }).status, 'bloqueio');
  const fast = E.computeDive({ realDepth: 10, bt: 10, altitude: 0, ascentRate: 20, descentRate: 18 });
  assert.equal(fast.status, 'bloqueio'); assert.ok(fast.errors.some(e => /18 m\/min/.test(e)));
  assert.equal(E.computeSeries({ ...base, altitude: null, dives: [{ realDepth: 10, bt: 10 }] }).errors.length, 1);
  assert.equal(E.autonomy({ volL: 11.2, pIni: 200, tcs: null, depth: 10 }).ok, false);
  assert.equal(E.autonomy({ volL: 11.2, pIni: 40, tcs: 20, depth: 10 }).ok, false);
});

// ---------------------------------------------------------------- Equipes
test('T-EQ-01 Nível de equipe (Quadro 1 / item 4 / Figura 5)', () => {
  const t = (p) => E.teamLevel({ water: 'propria', ...p });
  assert.equal(t({ realDepth: 8 }).level, 1); assert.equal(t({ realDepth: 8 }).minTeam, 3);
  const b = t({ realDepth: 8.5 }); assert.equal(b.level, 2); assert.ok(b.alerts.length);
  assert.equal(t({ realDepth: 25 }).level, 3);
  assert.equal(t({ realDepth: 35 }).level, 4);
  assert.equal(t({ realDepth: 10, water: 'impropria' }).level, 3);
  const dg = t({ realDepth: 5, dangerous: true }); assert.equal(dg.level, 2); assert.equal(dg.minTeam, 4);
  assert.equal(t({ realDepth: 5, operation: 'cadaver', hours: 20 }).level, 3);
  assert.equal(t({ realDepth: 5, remote: true }).minTeam, 4);
});

// ---------------------------------------------------------------- Plano
test('T-PLAN-01 TF desejado acima do limite é reduzido ao limite, com alerta', () => {
  const p = E.computePlan({ ...base, volL: 11.2, pIni: 200, tcs: null, dives: [{ realDepth: 18.3, desiredBT: 80 }] });
  assert.ok(p.ok); assert.equal(p.perDive[0].proposedBT, 60); assert.equal(p.series.dives[0].res.status, 'ok');
});

test('T-PLAN-02 Autonomia limita o TF proposto', () => {
  const p = E.computePlan({ ...base, volL: 11.2, pIni: 200, tcs: 28, dives: [{ realDepth: 13, desiredBT: 'max' }] });
  // prof. corrigida 13,7 m (altitude 0 → linha 13,7) → P = 2,37 ATA → 11,2×150/(28×2,37) = 25,3 → 25 min
  assert.equal(p.perDive[0].proposedBT, 25); assert.equal(p.perDive[0].limitedBy, 'autonomia');
});

test('T-PLAN-03 IS planejado insuficiente gera alerta com IS necessário', () => {
  const p = E.computePlan({ ...base, volL: 11.2, pIni: 200, tcs: null, dives: [{ realDepth: 18.3, desiredBT: 40 }, { realDepth: 18.3, desiredBT: 30, si: 30 }] });
  const n = p.perDive[1].notes.find(a => /IS de pelo menos/.test(a.text));
  assert.ok(n);
  assert.equal(p.perDive[1].proposedBT, 14); // H@18,3 após IS 30 (H) → ajuste 14
});

test('T-SER-08 Diferença de altitude (Anexo C) separada da altitude do local (Anexo B)', () => {
  const s = E.computeSeries({ ...base, altitude: 850, travelGain: true, gainAltitude: 1300, dives: [{ realDepth: 12, bt: 20 }] });
  assert.equal(s.initialGroup, 'D');          // 1.300 m → linha 1.500 m do Anexo C → D (INT-01)
  assert.equal(s.dives[0].res.adjusted, 13.7); // 12 m a 850 m → Anexo B, coluna 914,4 m
});
