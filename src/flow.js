/*
 * FLUXO EM PASSOS — transforma o estado do assistente (o que o militar digitou)
 * em resultados por passo, usando somente o motor de cálculo (engine.js).
 *
 * Estado de UM mergulhador (compute):
 *  { altChange: 'sim'|'nao'|'', altDiff, siteAlt,
 *    dives: [{ depth, bt, si, next: 'sim'|'nao'|'' }] }   // si = intervalo ANTES do mergulho (k ≥ 1)
 * Operação (até 6 mergulhadores):
 *  { altChange, altDiff, siteAlt, depth, cyl: { volL, pIni },
 *    divers: [{ name, tcs, dives: [...], pos }], active, meta: { ocorrencia, local, supervisor } }
 */
(function (root) {
  'use strict';
  var E = (typeof module !== 'undefined' && module.exports) ? require('./engine.js') : root.DiveEngine;
  var PDF = (typeof module !== 'undefined' && module.exports) ? require('./pdf.js') : root.MiniPDF;
  var D = E.DATA;

  function num(v) { if (v == null) return null; var s = String(v).trim().replace(',', '.'); if (s === '') return null; return /^-?\d+(\.\d+)?$/.test(s) ? parseFloat(s) : NaN; }
  function minutes(v) { // "90" ou "1:30"
    if (v == null || String(v).trim() === '') return null;
    var s = String(v).trim();
    if (s.indexOf(':') >= 0) { var m = E.hm2min(s.length === 4 && s[1] === ':' ? '0' + s : s); return m == null ? NaN : m; }
    var n = num(s); return (n == null || isNaN(n) || Math.floor(n) !== n) ? NaN : n;
  }
  function newState() { return { started: false, altChange: '', altDiff: '', altRest: '', siteAlt: '', dives: [{ depth: '', bt: '', si: '', next: '' }], meta: { ocorrencia: '', local: '', supervisor: '' } }; }

  function limitFor(group, adjDepth) { // TF máximo sem parada para um grupo (ou sem grupo) numa profundidade corrigida
    if (group) {
      var t3 = E.t3Lookup(group, adjDepth);
      return t3.ok ? { ok: true, value: t3.abt, tnr: t3.tnr, src: 'Tabela 3 (NOAA) · grupo ' + group, rule: 'NOAA-T3' } : { ok: false, error: t3.errors.join(' ') };
    }
    var t1 = E.t1Lookup(adjDepth, 1, false);
    return t1.ok ? { ok: true, value: t1.ndl, tnr: 0, src: 'Tabela 1 (NOAA) · linha ' + E.fmt1(t1.rowDepth) + ' m', rule: 'NOAA-T1' } : { ok: false, error: t1.errors.join(' ') };
  }

  function compute(st) {
    var out = { step1: { ok: false, errors: {} }, dives: [], series: null, alerts: [], finished: false };
    var s1 = out.step1;
    // ---------------- PASSO 1
    if (st.altChange !== 'sim' && st.altChange !== 'nao') s1.errors.altChange = 'Responda Sim ou Não.';
    var site = num(st.siteAlt), gain = null;
    if (site === null) s1.errors.siteAlt = 'Informe a altitude do local do mergulho (0 ao nível do mar).';
    else if (isNaN(site) || site < 0 || site > 3047.9) s1.errors.siteAlt = 'Entre 0 e 3.047,9 m (limite do Anexo B).';
    if (st.altChange === 'sim') {
      gain = num(st.altDiff);
      if (gain === null) s1.errors.altDiff = 'Informe a diferença de altitude.';
      else if (isNaN(gain) || gain <= 0) s1.errors.altDiff = 'A diferença deve ser maior que zero. Se não houve subida, marque Não.';
      else if (gain > 3000) s1.errors.altDiff = 'Acima de 3.000 m: fora do Anexo C.';
      var rest = minutes(st.altRest);   // descanso INDIVIDUAL do mergulhador (validado em restError)
    }
    s1.ok = !Object.keys(s1.errors).length;
    s1.site = site; s1.gain = gain;
    if (!s1.ok) return out;
    if (gain) {
      var ag = E.altitudeGroup(gain); s1.entryGroup = ag.group; s1.entryRow = ag.rowAlt;
      // descanso no local antes do 1º mergulho: crédito pela Tabela 2 a partir do grupo do Anexo C (INT-12)
      if (rest !== null && !isNaN(rest) && rest >= 0) {
        var rt = E.altitudeRest(ag.group, rest);
        s1.rest = rest; s1.restKind = rt.kind; s1.startGroup = rt.group; s1.restBeyond = !!rt.beyondColumn;
      } else {
        // sem descanso informado: grupo do Anexo C sem crédito (pior caso)
        s1.rest = null; s1.restKind = 'nao-informado'; s1.startGroup = ag.group;
        if (st.needRest) { out.restMissing = true; out.restError = restError(st.altRest); return out; }
      }
    } else { s1.entryGroup = null; s1.startGroup = null; }

    // ---------------- mergulhos
    var seriesIn = [];      // mergulhos com TF informado, em sequência
    var series = null;
    for (var k = 0; k < st.dives.length; k++) {
      var d = st.dives[k], r = { k: k, errors: {}, alerts: [] };
      out.dives.push(r);
      // grupo e situação ANTES deste mergulho
      var prevRes = null;
      if (k > 0) {
        var prevDive = out.dives[k - 1];
        if (!prevDive.done || prevDive.blocked) { r.locked = true; break; }
        prevRes = prevDive;
        r.si = minutes(d.si);
        if (r.si === null) r.errors.si = 'Informe o intervalo de superfície.';
        else if (isNaN(r.si) || r.si < 0) r.errors.si = 'Use minutos (ex.: 90) ou h:mm (ex.: 1:30).';
      }
      r.depth = num(d.depth);
      if (r.depth === null) r.errors.depth = 'Informe a profundidade medida.';
      else if (isNaN(r.depth) || r.depth <= 0) r.errors.depth = 'Profundidade inválida.';
      else if (r.depth > 57.9) r.errors.depth = 'Acima de 57,9 m: fora do Anexo B. Mergulho técnico (Equipe Nível 4).';
      if (Object.keys(r.errors).length) break;

      // PASSO 3 (k = 0) / PASSO 5 (k ≥ 1): resultados automáticos
      r.adj = E.adjustDepth(r.depth, site);
      if (!r.adj.ok) { r.errors.depth = r.adj.errors.join(' '); break; }
      r.adjusted = r.adj.adjusted;
      if (k === 0) { r.preGroup = s1.startGroup; r.preKind = s1.startGroup ? 'altitude' : 'nenhum'; }
      else {
        var t2 = E.t2Lookup(prevRes.groupAfter, r.si);
        r.preKind = t2.kind; r.preGroup = t2.kind === 'grupo' ? t2.group : null; r.t2 = t2;
      }
      if (r.preKind === 'unico') {
        // IS < 10 min: conta como o mesmo mergulho (ITO 3.32; INT-02)
        var eff = series.effective[series.effective.length - 1].input;
        var cDepth = Math.max(eff.realDepth, r.depth), cAdj = E.adjustDepth(cDepth, site);
        var lim = cAdj.ok ? limitFor(eff.preGroup, cAdj.adjusted) : { ok: false, error: cAdj.errors.join(' ') };
        if (lim.ok) { r.limit = Object.assign({}, lim, { value: lim.value - eff.bt - r.si, src: 'Intervalo < 10 min: tempo restante do mesmo mergulho (ITO 3.32)' }); }
        else r.limit = lim;
      } else r.limit = limitFor(r.preGroup, r.adjusted);
      if (!r.limit.ok) { r.blocked = true; r.blockMsg = r.limit.error; }
      else if (r.limit.value <= 0) { r.blocked = true; r.blockMsg = 'Não há tempo de fundo disponível sem parada descompressiva nestas condições. Aumente o intervalo de superfície ou reduza a profundidade.'; }
      r.safetyStop = r.depth > 18 || r.adjusted > 18;
      r.team = E.teamLevel({ realDepth: r.depth, water: 'propria' });
      if (r.depth > 30) r.alerts.push({ level: 'bloqueio', text: 'Acima de 30 m: mergulho técnico, somente Equipe Nível 4 (CEB).' });
      if (r.blocked) break;

      // PASSO 4: tempo de fundo
      r.bt = num(d.bt);
      if (r.bt === null) break;
      if (isNaN(r.bt) || r.bt < 1 || Math.floor(r.bt) !== r.bt) { r.errors.bt = 'Use minutos inteiros (ex.: 25).'; break; }
      seriesIn.push({ realDepth: r.depth, bt: r.bt, si: k ? r.si : undefined });
      series = E.computeSeries({ altitude: site, travelGain: !!gain, gainAltitude: gain || undefined, altRest: gain && s1.rest != null ? s1.rest : undefined, ascentRate: E.MAX_ASCENT, descentRate: 18, dives: seriesIn });
      var sd = series.dives[k];
      if (!sd || sd.blocked || !sd.res || sd.res.status === 'bloqueio') {
        r.done = true; r.blocked = true;
        r.blockMsg = sd && sd.res ? sd.res.errors.concat(sd.res.alerts.filter(function (a) { return a.level === 'bloqueio'; }).map(function (a) { return a.text; })).join(' ') : (sd && sd.errors || series.errors).join(' ');
        r.res = sd && sd.res; r.status = sd && sd.res ? sd.res.status : 'bloqueio'; r.stops = sd && sd.res && sd.res.stops || []; break;
      }
      r.res = sd.res; r.merged = sd.mergedInto != null; r.done = true;
      r.groupAfter = sd.res.group; r.status = sd.res.status;
      r.stops = sd.res.stops || [];
      sd.res.alerts.forEach(function (a) { if (a.level !== 'info' && a.rule !== 'NOAA-T1' && a.rule !== 'NOAA-T3') r.alerts.push(a); });
      if (r.bt > r.limit.value && r.status === 'ok') r.alerts.push({ level: 'atencao', text: 'Tempo de fundo acima do máximo indicado.' });
      // PASSO 5: decisão
      r.next = d.next;
      if (d.next !== 'sim') { if (d.next === 'nao') out.finished = true; break; }
    }
    out.series = series;
    if (series) series.alerts.forEach(function (a) { if (a.level !== 'info') out.alerts.push(a); });
    return out;
  }

  // ---------------------------------------------------------------- operação com até 6 mergulhadores
  var MAX_DIVERS = 6;
  function newDiver(n) { return { name: '', tcs: '', rest: '', dives: [{ depth: '', bt: '', si: '', next: '' }], pos: { step: 4, k: 0 } }; }
  function newOp() {
    return { started: false, altChange: '', altDiff: '', altRest: '', siteAlt: '', depth: '', cyl: { volL: '11,2', pIni: '200' },
      divers: [newDiver()], active: 0, meta: { ocorrencia: '', local: '', supervisor: '' } };
  }
  function diverName(op, i) { var n = (op.divers[i].name || '').trim(); return n || 'Mergulhador ' + (i + 1); }
  // estado do assistente de UM mergulhador: o 1º mergulho usa a profundidade medida no Passo 2
  function diverState(op, i) {
    var dv = op.divers[i];
    return { altChange: op.altChange, altDiff: op.altDiff, altRest: dv.rest, needRest: true, siteAlt: op.siteAlt,
      dives: dv.dives.map(function (d, k) { return k === 0 ? { depth: op.depth, bt: d.bt, si: '', next: d.next } : d; }) };
  }
  function siteOut(op) { return compute({ altChange: op.altChange, altDiff: op.altDiff, altRest: '', siteAlt: op.siteAlt, dives: [{ depth: op.depth, bt: '', si: '', next: '' }] }); }

  /** Autonomia do cilindro (ITO 12, item 3.6) na profundidade corrigida. null = TCS não informada. */
  function autonomyFor(op, i, adjDepth) {
    var tcs = num(op.divers[i].tcs);
    if (tcs === null) return null;
    var r = E.autonomy({ volL: num(op.cyl.volL), pIni: num(op.cyl.pIni), tcs: tcs, depth: adjDepth });
    return r;
  }
  /** Tempo máximo efetivo = o menor entre a tabela e a autonomia do cilindro. */
  function effectiveMax(limit, auto) {
    if (!limit || !limit.ok) return null;
    if (auto && auto.ok && auto.minutes < limit.value) return { value: auto.minutes, by: 'autonomia' };
    return { value: limit.value, by: 'tabela' };
  }
  function cylErrors(op) {
    var e = {}, v = num(op.cyl.volL), p = num(op.cyl.pIni);
    if (v === null || isNaN(v) || v <= 0) e['cyl.volL'] = 'Volume inválido.';
    if (p === null || isNaN(p) || p <= E.RESERVE_BAR) e['cyl.pIni'] = 'Pressão deve ser maior que a reserva de 50 bar.';
    else if (p > 300) e['cyl.pIni'] = 'Pressão acima de 300 bar: confira o valor.';
    op.divers.forEach(function (d, i) {
      var t = num(d.tcs); if (t !== null && (isNaN(t) || t <= 0)) e['divers.' + i + '.tcs'] = 'TCS inválida (L/min).';
      if (op.altChange === 'sim') { var re = restError(d.rest); if (re) e['divers.' + i + '.rest'] = re; }
    });
    return e;
  }

  /** Erro do tempo de descanso (em minutos) ou '' se válido. */
  function restError(v) {
    var m = minutes(v);
    if (m === null) return 'Informe o descanso em minutos (0 se o mergulho começar logo na chegada).';
    if (isNaN(m) || m < 0 || String(v).indexOf(':') >= 0) return 'Digite apenas minutos inteiros. Ex.: 1h30 = 90.';
    return '';
  }
  /** Explicação curta de como o descanso alterou o grupo de altitude. */
  function restNote(s1) {
    if (!s1.entryGroup) return '';
    if (s1.restKind === 'sem-credito') return 'Descanso inferior a 10 min: mantido o grupo do Anexo C';
    if (s1.restKind === 'novo') return 'Descanso superior a 15h50: sem nitrogênio residual (ITO 12, item 3.32)';
    return 'Tabela 2 (NOAA), coluna do grupo ' + s1.entryGroup + (s1.restBeyond ? ' – além da última faixa: grupo A' : '');
  }

  // ---------------------------------------------------------------- relatório PDF
  function report(op, opts) {
    opts = opts || {};
    var now = opts.now || new Date(), s1 = siteOut(op).step1;
    var doc = PDF.create({ jpegB64: opts.logoJpg, jpegW: 160, jpegH: 160, footer: 'App ' + E.APP_VERSION + ' · tabelas ' + E.dataHash() + ' · emitido em ' + now.toLocaleString('pt-BR') });
    doc.header('RELATÓRIO DE MERGULHO', 'Corpo de Bombeiros Militar de Minas Gerais · ITO 12 · Tabelas NOAA (2010)');
    doc.heading('Identificação');
    doc.kv('Data e hora do relatório', now.toLocaleString('pt-BR'));
    doc.kv('Ocorrência / REDS', op.meta.ocorrencia || '—');
    doc.kv('Local', op.meta.local || '—');
    doc.kv('Supervisor de mergulho', op.meta.supervisor || '—');
    doc.kv('Mergulhadores registrados', String(op.divers.length));

    doc.heading('Local e altitude');
    doc.kv('Houve aumento de altitude no deslocamento?', op.altChange === 'sim' ? 'Sim' : 'Não');
    if (s1.gain) doc.kv('Diferença de altitude', E.fmt1(s1.gain) + ' m');
    doc.kv('Altitude do local do mergulho', E.fmt1(s1.site) + ' m');
    doc.kv('Grupo pela diferença de altitude', s1.entryGroup || 'Nenhum', s1.entryGroup ? 'ITO 12, Anexo C (linha ' + s1.entryRow + ' m)' : '');
    doc.kv('Profundidade medida do local', E.fmt1(num(op.depth)) + ' m');
    doc.kv('Cilindro', String(op.cyl.volL).replace('.', ',') + ' L · ' + op.cyl.pIni + ' bar (reserva de 50 bar não utilizada)', 'ITO 12, itens 3.6 e 3.17');

    op.divers.forEach(function (dv, i) {
      var out = compute(diverState(op, i));
      doc.heading(diverName(op, i));
      doc.kv('TCS informada', num(dv.tcs) != null ? String(dv.tcs).replace('.', ',') + ' L/min' : 'Não informada – autonomia não calculada');
      var ds1 = out.step1;
      if (ds1.entryGroup) {
        doc.kv('Descanso no local antes do 1º mergulho', ds1.rest != null ? ds1.rest + ' min' : 'Não informado');
        doc.kv('Grupo de entrada após o descanso', ds1.rest != null ? (ds1.startGroup || 'Nenhum (sem nitrogênio residual)') : '—', ds1.rest != null ? restNote(ds1) : '');
      }
      var done = out.dives.filter(function (r) { return r.done; });
      if (!done.length) { doc.para('Nenhum mergulho registrado.', { size: 9, color: '#64748B' }); return; }
      done.forEach(function (r) {
        var au = autonomyFor(op, i, r.adjusted), mx = effectiveMax(r.limit, au);
        doc.para('Mergulho ' + (r.k + 1) + (r.merged ? ' (somado ao anterior – intervalo < 10 min)' : ''), { size: 10, bold: true, after: 2 });
        if (r.k > 0) doc.kv('Intervalo de superfície antes', E.min2hm(r.si) + ' (h:mm)');
        doc.kv('Profundidade medida / corrigida', E.fmt1(r.depth) + ' m / ' + E.fmt1(r.adjusted) + ' m', 'Anexo B (NOAA) da ITO 12');
        doc.kv('Grupo antes do mergulho', r.preGroup || 'Nenhum', r.preKind === 'altitude' ? 'Anexo C e descanso no local (Tabela 2)' : r.preKind === 'grupo' ? 'Tabela 2 (NOAA)' : r.preKind === 'novo' ? 'Intervalo > 15h50: novo mergulho (ITO 3.32)' : '');
        doc.kv('Tempo máximo pela tabela', r.limit.value + ' min', r.limit.src);
        doc.kv('Autonomia do cilindro', au && au.ok ? au.minutes + ' min' : 'Não calculada', 'ITO 12, item 3.6');
        if (mx) doc.kv('Tempo máximo de fundo considerado', mx.value + ' min', mx.by === 'autonomia' ? 'Limitado pela autonomia do cilindro' : 'Limitado pela tabela' + (au && au.ok ? '' : '; respeitar também a autonomia do cilindro'));
        doc.kv('Tempo de fundo realizado', r.bt + ' min');
        doc.kv('Paradas', r.stops.length ? r.stops.map(function (x) { return E.fmt1(x.depth) + ' m por ' + x.minutes + ' min'; }).join(' + ') : 'Nenhuma', r.stops.some(function (x) { return x.kind === 'deco'; }) ? 'Tabela 1 (NOAA) – exposição excepcional' : r.stops.length ? 'ITO 12, item 3.46' : '');
        doc.kv('Grupo de repetição após o mergulho', r.groupAfter || '—', 'Tabela 1 (NOAA)');
        doc.kv('Situação', r.blocked ? 'FORA DOS LIMITES DAS TABELAS' : r.status === 'excepcional' ? 'EXPOSIÇÃO EXCEPCIONAL' : 'Dentro dos limites');
        if (r.blocked && r.blockMsg) doc.para(r.blockMsg, { size: 8.5, color: '#B91C1C', indent: 6, after: 0 });
        r.alerts.forEach(function (a) { doc.para('• ' + a.text, { size: 8.5, color: a.level === 'bloqueio' ? '#B91C1C' : '#92400E', indent: 6, after: 0 }); });
        if (au && au.ok && r.bt > au.minutes) doc.para('• Tempo de fundo registrado acima da autonomia calculada do cilindro.', { size: 8.5, color: '#B91C1C', indent: 6, after: 0 });
      });
      var sub = out.series && out.series.submerged, last = done[done.length - 1];
      doc.kv('Tempo submerso no dia', sub != null ? Math.ceil(sub) + ' de 240 min' : '—', 'ITO 12, itens 7.10.2 e 7.10.7');
      doc.kv('Grupo final', last.groupAfter || '—');
      out.alerts.forEach(function (a) { doc.para('• ' + a.text, { size: 8.5, color: '#B91C1C', indent: 6, after: 0 }); });
    });

    doc.heading('Critérios utilizados');
    ['O tempo máximo de fundo é o MENOR entre o limite da tabela e a autonomia do cilindro; a reserva de 50 bar nunca entra no cálculo (ITO 12, item 3.6).',
      'Cada mergulho é considerado iniciado com o cilindro na pressão inicial informada (ITO 12, item 3.6: iniciar com 200 bar).',
      'Autonomia = volume × (pressão inicial − 50 bar) ÷ (TCS × pressão absoluta na profundidade corrigida), arredondada para baixo.',
      'Subida com velocidade máxima de 18 m/min (ITO 12, itens 3.56 e 3.63).',
      'Tempo de fundo: da submersão até deixar o fundo (ITO 12, item 3.62).',
      'Parada de 3 min a 5 m após mergulho acima de 18 m (ITO 12, item 3.46).',
      'Intervalo de superfície: de 10 min a 15h50; abaixo de 10 min é o mesmo mergulho, acima de 15h50 é novo mergulho (ITO 12, item 3.32).',
      'Valores não tabelados são arredondados para o valor tabelado imediatamente superior (critério conservador, pendente de validação).',
      'Grupo pela diferença de altitude do deslocamento (Anexo C), reduzido pelo tempo de descanso de cada mergulhador no local conforme a Tabela 2 (critério pendente de validação); profundidade corrigida pela altitude do local (Anexo B).'
    ].forEach(function (t) { doc.para('• ' + t, { size: 8.5, color: '#334155', after: 0 }); });
    doc.y -= 6;
    doc.para('Mesmo que as tabelas sejam cumpridas rigorosamente, não há garantias de que não ocorrerá doença descompressiva; o uso conservador é recomendado (NOAA). A versão oficial e vigente dos documentos do CBMMG prevalece sobre este aplicativo.', { size: 8.5, color: '#64748B' });

    doc.ensure(70); doc.y -= 46;
    doc.line(150, doc.y, 445, doc.y, '#0F172A', 0.8);
    var lbl = 'Supervisor de mergulho' + (op.meta.supervisor ? ' – ' + op.meta.supervisor : '');
    doc.text(lbl, (595.28 - PDF.width(lbl, 9)) / 2, doc.y - 12, 9, false, '#334155');
    return doc.build();
  }

  var FLOW = { newState: newState, compute: compute, report: report, minutes: minutes, num: num,
    MAX_DIVERS: MAX_DIVERS, newOp: newOp, newDiver: newDiver, diverName: diverName, diverState: diverState, siteOut: siteOut,
    autonomyFor: autonomyFor, restNote: restNote, restError: restError, effectiveMax: effectiveMax, cylErrors: cylErrors };
  if (typeof module !== 'undefined' && module.exports) module.exports = FLOW; else root.DiveFlow = FLOW;
})(typeof window !== 'undefined' ? window : this);
