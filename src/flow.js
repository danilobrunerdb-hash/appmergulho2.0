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
 *  Cilindro: op.cyl vale para o 1º mergulho; do 2º em diante cada mergulho tem { volL, pIni } próprios,
 *  volume pré-preenchido com 11,2 L (editável) e pressão digitada pelo militar (cilindro trocado, parcialmente cheio ou o mesmo já usado).
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
      r.safetyStop = r.depth > 18;   // CBMMG: parada de segurança pela profundidade REAL (medida) – INT-09
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

  /** Cilindro usado no mergulho k do mergulhador i: o do Passo 3 no 1º; nos seguintes, o informado antes de cada um. */
  function cylFor(op, i, k) {
    if (!k) return op.cyl;
    var d = op.divers[i] && op.divers[i].dives[k];
    return d ? { volL: d.volL, pIni: d.pIni } : { volL: '', pIni: '' };
  }
  function cylCheck(c) {
    var e = {}, v = num(c.volL), p = num(c.pIni);
    if (v === null) e.volL = 'Informe o volume do cilindro (L).';
    else if (isNaN(v) || v <= 0) e.volL = 'Volume inválido.';
    if (p === null) e.pIni = 'Informe a pressão do cilindro no manômetro (bar).';
    else if (isNaN(p) || p <= E.RESERVE_BAR) e.pIni = 'Pressão deve ser maior que a reserva de 50 bar.';
    else if (p > 300) e.pIni = 'Pressão acima de 300 bar: confira o valor.';
    return e;
  }
  /** Erros do cilindro de um mergulho seguinte (k ≥ 1), com as chaves dos campos. */
  function diveCylErrors(op, i, k) {
    var e = cylCheck(cylFor(op, i, k)), o = {}, base = 'divers.' + i + '.dives.' + k + '.';
    Object.keys(e).forEach(function (f) { o[base + f] = e[f]; });
    return o;
  }
  /** Autonomia do cilindro (ITO 12, item 3.6) na profundidade corrigida. null = TCS não informada. */
  function autonomyFor(op, i, adjDepth, k) {
    var tcs = num(op.divers[i].tcs);
    if (tcs === null) return null;
    var c = cylFor(op, i, k || 0);
    var r = E.autonomy({ volL: num(c.volL), pIni: num(c.pIni), tcs: tcs, depth: adjDepth });
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
    // (os cilindros dos mergulhos seguintes são validados no Passo 5, por diveCylErrors)
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

  // ---------------------------------------------------------------- perfil de mergulho
  var PROFILE_DESCENT = 18;   // m/min – descida apenas ilustrativa (a ITO não define; ver INT-10)
  /** Mergulhos concluídos de um mergulhador, com a linha do tempo de cada um (descida, fundo, subida a 18 m/min e paradas). */
  function profileOf(op, i) {
    var out = compute(diverState(op, i));
    var dives = out.dives.filter(function (r) { return r.done && r.bt > 0; }).map(function (r) {
      var stops = (r.stops || []).slice().sort(function (a, b) { return b.depth - a.depth; });
      var td = Math.min(r.depth / PROFILE_DESCENT, r.bt), t = r.bt, cur = r.depth, segs = [];
      segs.push({ ph: 'descida', t0: 0, t1: td, d0: 0, d1: r.depth });
      segs.push({ ph: 'fundo', t0: td, t1: r.bt, d0: r.depth, d1: r.depth });
      stops.forEach(function (st) {
        if (st.depth >= cur) return;
        var ta = (cur - st.depth) / E.MAX_ASCENT;
        segs.push({ ph: 'subida', t0: t, t1: t + ta, d0: cur, d1: st.depth }); t += ta; cur = st.depth;
        segs.push({ ph: 'parada', kind: st.kind, minutes: st.minutes, t0: t, t1: t + st.minutes, d0: cur, d1: cur }); t += st.minutes;
      });
      segs.push({ ph: 'subida', t0: t, t1: t + cur / E.MAX_ASCENT, d0: cur, d1: 0 }); t += cur / E.MAX_ASCENT;
      return { k: r.k, depth: r.depth, adjusted: r.adjusted, bt: r.bt, si: r.k ? r.si : null, merged: !!r.merged, stops: stops,
        preGroup: r.preGroup || null, groupAfter: r.groupAfter || null, status: r.status, blocked: !!r.blocked, segs: segs, duration: t };
    });
    return { name: diverName(op, i), dives: dives, submerged: out.series && out.series.submerged != null ? Math.ceil(out.series.submerged) : null };
  }
  var PCOL = { adj: '#0B5A8A', adjBg: '#D3E6F3', water: '#EEF5FA', surface: '#5B9BC7', grid: '#DCE5EC', line: '#0D2B3E', deco: '#B3121C', stop: '#C27C00', text: '#14212C', muted: '#5F6E7A', label: '#334155' };
  /**
   * Geometria do perfil (coordenadas com origem no topo, como SVG). Usada pelo app (SVG) e pelo PDF.
   * Tempo na horizontal (cada mergulho em escala própria; intervalos de superfície fora de escala) e
   * profundidade na vertical, para baixo. Retorna { w, h, items: [line|text|rect] }.
   */
  function profileLayout(prof, W, H, opt) {
    opt = opt || {};
    var it = [], n = prof.dives.length;
    var f = opt.fs || 1, L = 46, R = 14, T = Math.round(12 + 22 * f), B = Math.round(30 * f), pw = W - L - R, ph = H - T - B;
    var Y1 = T - 7 - 12 * f, Y2 = T - 7;   // duas linhas de rótulos acima da superfície
    var maxD = 0; prof.dives.forEach(function (d) { maxD = Math.max(maxD, d.depth); });
    var step = maxD > 30 ? 10 : 5, top = Math.max(10, Math.ceil((maxD * 1.3 + 3) / step) * step);   // folga abaixo do fundo para os rótulos
    function y(d) { return T + d / top * ph; }
    it.push({ t: 'rect', x: L, y: T, w: pw, h: ph, fill: PCOL.water });
    for (var g = step; g <= top; g += step) { it.push({ t: 'line', pts: [[L, y(g)], [L + pw, y(g)]], color: PCOL.grid, width: 0.8 }); }
    for (g = 0; g <= top; g += step) it.push({ t: 'text', x: L - 6, y: y(g) + 3.5, s: String(g), size: 9, anchor: 'end', color: PCOL.muted });
    it.push({ t: 'text', x: 2, y: Y1, s: 'Prof. (m)', size: 8.5, anchor: 'start', color: PCOL.muted });
    it.push({ t: 'text', x: L + pw, y: H - 6, s: 'Tempo →', size: 8.5, anchor: 'end', color: PCOL.muted });
    if (!n) { it.push({ t: 'text', x: L + pw / 2, y: T + ph / 2, s: 'Nenhum mergulho registrado', size: 10, anchor: 'middle', color: PCOL.muted }); return { w: W, h: H, items: it }; }
    var lead = Math.min(22, pw * 0.04), siW = n > 1 ? Math.min(78, pw * 0.15) : 0;
    var avail = pw - 2 * lead - (n - 1) * siW, totDur = 0;
    prof.dives.forEach(function (d) { totDur += d.duration; });
    var x = L + lead, path = [[L, T]], first = true, over = [];
    prof.dives.forEach(function (d, j) {
      if (!first) { // intervalo de superfície (fora de escala)
        var xs = x, xe = x + siW, mid = (xs + xe) / 2;
        it.push({ t: 'line', pts: [[mid - 7, T + 5], [mid - 1, T - 5]], color: PCOL.muted, width: 1 });
        it.push({ t: 'line', pts: [[mid + 1, T + 5], [mid + 7, T - 5]], color: PCOL.muted, width: 1 });
        it.push({ t: 'text', x: mid, y: Y1, s: d.merged ? 'IS ' + d.si + ' min' : 'Intervalo', size: 8, anchor: 'middle', color: PCOL.muted });
        it.push({ t: 'text', x: mid, y: Y2, s: d.merged ? '(mesmo mergulho)' : E.min2hm(d.si), size: 8.5, anchor: 'middle', color: PCOL.label, bold: !d.merged });
        x = xe;
      }
      first = false;
      var wd = avail * (0.6 / n + 0.4 * d.duration / totDur), sc = wd / d.duration, x0 = x;
      function px(t) { return x0 + t * sc; }
      path.push([x0, T]);
      var stopTxt = [], firstStop = null;
      d.segs.forEach(function (sg) {
        path.push([px(sg.t1), y(sg.d1)]);
        if (sg.ph === 'parada') {
          var c = sg.kind === 'deco' ? PCOL.deco : PCOL.stop;
          over.push({ t: 'line', pts: [[px(sg.t0), y(sg.d0)], [px(sg.t1), y(sg.d1)]], color: c, width: 3.4 });
          if (!firstStop) firstStop = sg;
          stopTxt.push({ s: 'parada ' + sg.minutes + ' min a ' + E.fmt1(sg.d0) + ' m', size: 8, color: c, bold: true });
        }
      });
      var bot = d.segs[1], bx0 = px(bot.t0), bx1 = px(bot.t1), by = y(d.depth), bmid = (bx0 + bx1) / 2, dmid = (x0 + px(d.duration)) / 2;
      it.push({ t: 'text', x: dmid, y: Y1, s: 'Mergulho ' + (d.k + 1), size: 9.5, anchor: 'middle', color: PCOL.text, bold: true });
      it.push({ t: 'text', x: dmid, y: Y2, s: d.groupAfter ? 'grupo ' + (d.preGroup || '–') + ' → ' + d.groupAfter : '', size: 8, anchor: 'middle', color: PCOL.muted });
      // profundidade real (medida) acima do fundo; logo abaixo do fundo, a corrigida pela altitude (Anexo B) em destaque
      var realTxt = 'real ' + E.fmt1(d.depth) + ' m', realFits = realTxt.length * 9 * 0.6 * f <= bx1 - bx0 - 6;
      // se o fundo for estreito, o rótulo da profundidade real desce para a pilha abaixo do fundo
      it.push({ t: 'text', x: bmid, y: realFits ? by - 6 : by + 13 * f, s: realTxt, size: 9, anchor: 'middle', color: PCOL.text, bold: true });
      var adjTxt = 'corrigida ' + E.fmt1(d.adjusted) + ' m', aw = adjTxt.length * 8.5 * 0.62 * f + 12 * f, ay = by + (realFits ? 14 : 28) * f;
      it.push({ t: 'rect', x: bmid - aw / 2, y: ay - 10 * f, w: aw, h: 13.5 * f, fill: PCOL.adjBg, r: 3 });
      it.push({ t: 'text', x: bmid, y: ay, s: adjTxt, size: 8.5, anchor: 'middle', color: PCOL.adj, bold: true });
      // marcação do tempo de fundo: da saída da superfície até deixar o fundo (ITO 3.62)
      var ty = ay + 12 * f;
      it.push({ t: 'line', pts: [[x0, ty - 3], [x0, ty + 3]], color: PCOL.muted, width: 0.8 });
      it.push({ t: 'line', pts: [[bx1, ty - 3], [bx1, ty + 3]], color: PCOL.muted, width: 0.8 });
      it.push({ t: 'line', pts: [[x0, ty], [bx1, ty]], color: PCOL.muted, width: 0.8, dash: true });
      it.push({ t: 'text', x: (x0 + bx1) / 2, y: ty + 11 * f, s: 'TF ' + d.bt + ' min', size: 8.5, anchor: 'middle', color: d.status === 'ok' ? PCOL.label : PCOL.deco, bold: true });
      // rótulos das paradas: dentro do mergulho, à esquerda da subida, se couberem; senão, abaixo do TF
      if (firstStop) {
        var est = 0; stopTxt.forEach(function (o) { est = Math.max(est, o.s.length * o.size * 0.6 * f); });
        var xs = px(firstStop.t0) - 6, leftWall = x0 + (bx0 - x0) * (firstStop.d0 / d.depth) + 6, inside = xs - est >= leftWall;
        var sy = inside ? y(firstStop.d0) + 13 * f : ty + 23 * f;
        stopTxt.forEach(function (o) {
          it.push({ t: 'text', x: inside ? xs : (x0 + bx1) / 2, y: sy, s: o.s, size: o.size, anchor: inside ? 'end' : 'middle', color: o.color, bold: !!o.bold });
          sy += 11 * f;
        });
      }
      x = px(d.duration);
      path.push([x, T]);
    });
    path.push([L + pw, T]);
    it.push({ t: 'line', pts: [[L, T], [L + pw, T]], color: PCOL.surface, width: 1.4 });
    it.push({ t: 'line', pts: path, color: PCOL.line, width: 2.2, join: true });
    it.push.apply(it, over);   // paradas destacadas por cima do perfil
    return { w: W, h: H, items: it };
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
    doc.kv('Cilindro do 1º mergulho', String(op.cyl.volL).replace('.', ',') + ' L · ' + op.cyl.pIni + ' bar (reserva de 50 bar não utilizada)', 'ITO 12, itens 3.6 e 3.17');

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
        var au = autonomyFor(op, i, r.adjusted, r.k), mx = effectiveMax(r.limit, au), cy = cylFor(op, i, r.k);
        doc.para('Mergulho ' + (r.k + 1) + (r.merged ? ' (somado ao anterior – intervalo < 10 min)' : ''), { size: 10, bold: true, after: 2 });
        if (r.k > 0) doc.kv('Intervalo de superfície antes', E.min2hm(r.si) + ' (h:mm)');
        if (r.k > 0) doc.kv('Cilindro deste mergulho', String(cy.volL || '—').replace('.', ',') + ' L · ' + (cy.pIni || '—') + ' bar', 'Volume e pressão informados antes do mergulho' + (num(dv.tcs) != null ? '; TCS informada no 1º mergulho' : ''));
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

    doc.ensure(300);   // título, explicação e o 1º perfil na mesma página
    doc.heading('Perfis de mergulho');
    doc.para('Tempo na horizontal e profundidade na vertical. O traçado usa a profundidade real (medida); em destaque azul, a profundidade corrigida pela altitude (Anexo B), que é a usada nas tabelas (limites e grupos). A parada de segurança de 3 min a 5 m considera a profundidade real medida acima de 18 m (ITO 12, item 3.46; critério do CBMMG). Cada mergulho está em escala própria de tempo; os intervalos de superfície estão fora de escala. TF = tempo de fundo, da saída da superfície até deixar o fundo (ITO 12, item 3.62). Subida a 18 m/min; descida ilustrativa.', { size: 8, color: '#64748B' });
    op.divers.forEach(function (dv, i) {
      var prof = profileOf(op, i), CH = 196;
      doc.ensure(CH + 26);
      doc.y -= 4; doc.text(prof.name + (prof.submerged != null ? '  ·  submerso no dia: ' + prof.submerged + ' de 240 min' : ''), 42, doc.y - 10, 10, true, '#0F172A'); doc.y -= 16;
      drawProfilePdf(doc, profileLayout(prof, 595.28 - 84, CH), 42, doc.y);
      doc.y -= CH + 12;
    });

    doc.heading('Critérios utilizados');
    ['O tempo máximo de fundo é o MENOR entre o limite da tabela e a autonomia do cilindro; a reserva de 50 bar nunca entra no cálculo (ITO 12, item 3.6).',
      'A autonomia de cada mergulho usa o volume e a pressão do cilindro informados antes dele: no 1º mergulho, os do cilindro da operação; nos seguintes, o volume confirmado (11,2 L por padrão) e a pressão lida no manômetro e digitada novamente (cilindro trocado, parcialmente carregado ou o mesmo já usado). A TCS de cada mergulhador, informada no 1º mergulho, vale para todos os mergulhos dele. A ITO 12, item 3.6, determina iniciar com 200 bar.',
      'Autonomia = volume × (pressão inicial − 50 bar) ÷ (TCS × pressão absoluta na profundidade corrigida), arredondada para baixo.',
      'Subida com velocidade máxima de 18 m/min (ITO 12, itens 3.56 e 3.63).',
      'Tempo de fundo: da submersão até deixar o fundo (ITO 12, item 3.62).',
      'Parada de 3 min a 5 m após mergulho com profundidade real (medida) acima de 18 m (ITO 12, item 3.46). Para essa parada, o CBMMG considera a profundidade real, e não a corrigida pela altitude.',
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

  /** Desenha a geometria do perfil no PDF (origem do layout no topo-esquerdo em x0, yTop). */
  function drawProfilePdf(doc, lay, x0, yTop) {
    lay.items.forEach(function (o) {
      if (o.t === 'rect') doc.rect(x0 + o.x, yTop - o.y - o.h, o.w, o.h, o.fill);
      else if (o.t === 'line') doc.poly(o.pts.map(function (p) { return [x0 + p[0], yTop - p[1]]; }), o.color, o.width * 0.75, o.dash);
      else if (o.t === 'text' && o.s) {
        var sz = o.size * 0.82, w = PDF.width(o.s, sz, o.bold), tx = o.anchor === 'middle' ? o.x - w / 2 : o.anchor === 'end' ? o.x - w : o.x;
        doc.text(o.s, x0 + tx, yTop - o.y, sz, !!o.bold, o.color);
      }
    });
  }

  var FLOW = { newState: newState, compute: compute, report: report, minutes: minutes, num: num,
    MAX_DIVERS: MAX_DIVERS, newOp: newOp, newDiver: newDiver, diverName: diverName, diverState: diverState, siteOut: siteOut,
    autonomyFor: autonomyFor, cylFor: cylFor, diveCylErrors: diveCylErrors, profileOf: profileOf, profileLayout: profileLayout, restNote: restNote, restError: restError, effectiveMax: effectiveMax, cylErrors: cylErrors };
  if (typeof module !== 'undefined' && module.exports) module.exports = FLOW; else root.DiveFlow = FLOW;
})(typeof window !== 'undefined' ? window : this);
