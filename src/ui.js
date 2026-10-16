/* INTERFACE v4 — assistente em passos, até 6 mergulhadores, posição na tabela, autonomia do cilindro */
(function () {
  'use strict';
  var E = window.DiveEngine, D = E.DATA, F = window.DiveFlow;
  var app = document.getElementById('app');
  var KEY = 'cbmmg-mergulho-operacao-v4';
  var dlP = (window.claude && window.claude.use) ? window.claude.use('downloads') : Promise.resolve(null);

  function load() { try { var v = JSON.parse(localStorage.getItem(KEY)); if (v && v.op && v.ui && v.op.divers && v.op.divers.length) return v; } catch (e) {} return null; }
  var saved = load();
  var op = saved ? saved.op : F.newOp();
  op.divers.forEach(function (d) { if (d.rest == null) d.rest = op.altRest != null ? String(op.altRest) : ''; });   // v4.1 → descanso individual
  var ui = saved ? saved.ui : { step: 0 };          // 0..3 | 'd' (mergulhador ativo) | 'end'
  var view = null;                                  // null | 'ref' | { table: { i, k } }
  var helpOpen = {}, touched = {};
  function save() { try { localStorage.setItem(KEY, JSON.stringify({ op: op, ui: ui })); } catch (e) {} }

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var f1 = E.fmt1;
  function toast(t) { var el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); el.textContent = t; document.body.appendChild(el); setTimeout(function () { el.remove(); }, 2800); }
  var ICON = {
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>',
    book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 5h6a4 4 0 0 1 4 4v11a3 3 0 0 0-3-3H2z"/><path d="M22 5h-6a4 4 0 0 0-4 4v11a3 3 0 0 1 3-3h7z"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M9 4v16M15 4v16"/></svg>',
    tank: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="6" width="10" height="16" rx="5"/><path d="M10 6V3h4v3M12 3h4"/></svg>'
  };

  // ---------------------------------------------------------------- utilidades de estado
  function dvOut(i) { return F.compute(F.diverState(op, i)); }
  function siteO() { return F.siteOut(op); }
  function name(i) { return F.diverName(op, i); }
  function act() { return op.active; }
  function pos() { return op.divers[act()].pos; }
  function finished(i) { var d = op.divers[i].dives; return d[d.length - 1].next === 'nao'; }
  function lastGroup(o) { var g = null; o.dives.forEach(function (r) { if (r.done && r.groupAfter) g = r.groupAfter; }); return g; }
  function setP(path, v) { var k = path.split('.'), x = op; for (var i = 0; i < k.length - 1; i++) x = x[k[i]]; x[k[k.length - 1]] = v; }
  function showErr(path, msg) {
    var e = document.getElementById('e-' + path), i = document.getElementById(path);
    if (e) e.textContent = msg || '';
    if (i) { if (msg) i.setAttribute('aria-invalid', 'true'); else i.removeAttribute('aria-invalid'); }
  }

  // ---------------------------------------------------------------- moldura e campos
  var STEP_NAMES = ['Orientações gerais', 'Altitude', 'Profundidade', 'Resultado e mergulhadores', 'Tempo de fundo', 'Novo mergulho'];
  /** Duas colunas no PC; no celular, um bloco abaixo do outro (sem mudança visual). */
  function cols(a, b) { return '<div class="cols"><div class="colA">' + a + '</div><div class="colB">' + b + '</div></div>'; }
  function frame(o, bodyHtml) {
    var dots = '', list = '';
    if (o.step != null) for (var i = 0; i <= 5; i++) {
      dots += '<i class="' + (i === o.step ? 'on' : i < o.step ? 'done' : '') + '"></i>';
      list += '<li class="' + (i === o.step ? 'on' : i < o.step ? 'done' : '') + '"' + (i === o.step ? ' aria-current="step"' : '') + '><span>' + i + '</span>' + STEP_NAMES[i] + '</li>';
    }
    return '<div class="sheet' + (o.wide ? ' wide' : '') + '"><header class="top' + (o.big ? ' big' : '') + '">' +
      (o.back ? '<button class="ib l" data-a="back" aria-label="Voltar">' + ICON.back + '</button>' : '') +
      (o.close ? '<button class="ib r" data-a="closeview" aria-label="Fechar">' + ICON.x + '</button>' : '<button class="ib r" data-a="ref" aria-label="Tabelas e ITO 12">' + ICON.book + '</button>') +
      '<img src="' + window.CBMMG_LOGO + '" alt="Brasão do Corpo de Bombeiros Militar de Minas Gerais">' +
      '<h1>' + esc(o.title) + '</h1><p>' + esc(o.sub) + '</p>' + (dots ? '<div class="dots" aria-hidden="true">' + dots + '</div><ol class="steplist" aria-label="Passos">' + list + '</ol>' : '') +
      '<p class="side-foot">ITO 12 (2ª ed., 2024) · Tabelas NOAA 2010<br>Ferramenta de apoio</p>' +
      '</header><div class="body">' + bodyHtml + '</div></div>';
  }
  function field(path, label, value, o) {
    o = o || {};
    var open = !!helpOpen[path];
    return '<div class="field' + (o.cls ? ' ' + o.cls : '') + '"><label class="lbl" for="' + path + '">' + esc(label) + (o.q ? ' <button type="button" class="q" data-a="help" data-h="' + path + '" aria-label="Como obter este valor" aria-expanded="' + open + '">?</button>' : '') + '</label>' +
      (o.q && open ? o.q : '') +
      '<div class="unit"><input id="' + path + '" data-p="' + path + '" inputmode="' + (o.mode || 'decimal') + '" autocomplete="off" value="' + esc(value) + '" placeholder="' + esc(o.ph || '') + '"' + (o.small ? ' class="sm"' : '') + '><span>' + esc(o.unit || '') + '</span></div>' +
      '<div class="err" id="e-' + path + '"></div></div>';
  }

  var HELP_ALT = '<div class="help"><b>Como obter a altitude pelo Google Earth</b><ol>' +
    '<li>Abra o Google Earth (aplicativo ou earth.google.com).</li>' +
    '<li>Localize o <b>ponto de partida</b> da guarnição (quartel ou último ponto de permanência) e posicione o cursor/marcador sobre ele. A <b>elevação do terreno</b> aparece na barra de informações (na versão para computador, no canto inferior direito, junto às coordenadas). Anote o valor.</li>' +
    '<li>Faça o mesmo no <b>local do mergulho</b>.</li>' +
    '<li><b>Diferença de altitude = altitude do local do mergulho − altitude do ponto de partida.</b> Se o resultado for zero ou negativo, não houve aumento de altitude: marque Não.</li></ol></div>';
  var HELP_REST = '<div class="help"><b>Por que o descanso importa</b><ol>' +
    '<li>Ao subir de altitude, o mergulhador chega ao local com nitrogênio residual, expresso pelo grupo do <b>Anexo C</b>.</li>' +
    '<li>O tempo que ele permanece no local antes de mergulhar funciona como um <b>intervalo de superfície</b>: o aplicativo entra na <b>Tabela 2</b> pela coluna desse grupo e encontra o novo grupo.</li>' +
    '<li>Informe o tempo <b>em minutos</b> (ex.: 2 horas = 120).</li>' +
    '<li>Menos de 10 min: mantém o grupo do Anexo C. Mais de 950 min (15h50): sem nitrogênio residual.</li></ol></div>';
  var HELP_TCS = '<div class="help"><b>Taxa de consumo de superfície (ITO 12, item 3.61)</b><ol>' +
    '<li>Com o mergulhador parado em pouca profundidade (ex.: 2 m), anote a pressão do manômetro no início e após um tempo (ex.: 10 min).</li>' +
    '<li><b>TCS = (bar consumidos × volume do cilindro ÷ pressão absoluta) ÷ minutos.</b> Pressão absoluta = 1 + profundidade ÷ 10.</li>' +
    '<li>Exemplo da ITO (Fig. 4): 30 bar em 10 min a 2 m com S80 → (30 × 11,2 ÷ 1,2) ÷ 10 = <b>28 L/min</b>.</li></ol></div>';

  // ---------------------------------------------------------------- blocos reutilizáveis
  function tableBtn(i, k, label) { return '<button class="btn alt tbtn" data-a="table" data-i="' + i + '" data-k="' + k + '">' + ICON.grid + (label || 'Ver na tabela') + '</button>'; }
  var AIR_NOTE = '<div class="air" role="note">' + ICON.tank + '<div><b>O tempo máximo de fundo está limitado à autonomia do cilindro.</b> Encerre o fundo no que vier primeiro: o tempo da tabela ou o manômetro chegando a <b>50 bar</b> (reserva intocável – ITO 12, item 3.6).</div></div>';

  /** Destaque do tempo máximo: menor entre tabela e autonomia do cilindro do mergulhador i. */
  function maxBlock(r, i, label) {
    var h = '';
    if (r.blocked) {
      h += '<div class="hero red"><small>' + esc(label) + '</small><b>0 <span>min</span></b><em>Não há mergulho sem parada nestas condições</em></div>';
      return h + '<div class="al stop">' + esc(r.blockMsg || '') + '</div>';
    }
    var au = i == null ? null : F.autonomyFor(op, i, r.adjusted), mx = F.effectiveMax(r.limit, au);
    var byAir = mx.by === 'autonomia';
    h += '<div class="hero ' + (byAir ? 'amber' : 'green') + '"><small>' + esc(label) + '</small><b>' + mx.value + ' <span>min</span></b><em>' + (byAir ? 'Limitado pela autonomia do cilindro' : esc(r.limit.src)) + '</em></div>';
    h += '<div class="fuel"><div' + (!byAir ? ' class="win"' : '') + '><small>Pela tabela</small><b>' + r.limit.value + ' min</b></div><div' + (byAir ? ' class="win"' : '') + '><small>Pelo cilindro</small><b>' +
      (i == null ? 'ver cada mergulhador' : au && au.ok ? au.minutes + ' min' : au ? 'dados inválidos' : 'TCS não informada') + '</b></div></div>';
    h += AIR_NOTE;
    if (i != null && !au) h += '<p class="fine">Informe a TCS do mergulhador no Passo 3 para o aplicativo calcular a autonomia do cilindro.</p>';
    if (r.safetyStop) h += '<div class="al warn"><b>Parada obrigatória:</b> 3 min a 5 m antes de subir (mergulho acima de 18 m – ITO 12, item 3.46).</div>';
    r.alerts.forEach(function (a) { h += '<div class="al ' + (a.level === 'bloqueio' ? 'stop' : 'warn') + '">' + esc(a.text) + '</div>'; });
    return h;
  }
  function teamRow(r) { var t = r.team && r.team.ok ? r.team : null; return t ? '<div><dt>Equipe exigida (prof. real)</dt><dd>Nível ' + t.level + ' · ' + (t.minTeam ? t.minTeam + ' BM' : 'CEB') + '</dd></div>' : ''; }

  function chips() {
    return '<div class="chips" role="tablist" aria-label="Mergulhadores">' + op.divers.map(function (d, i) {
      var o = dvOut(i), g = lastGroup(o), fin = finished(i);
      return '<button role="tab" class="chip' + (i === act() ? ' on' : '') + '" data-a="pick" data-i="' + i + '" aria-selected="' + (i === act()) + '"><span class="g' + (fin ? ' fin' : '') + '">' + (g || '–') + '</span>' + esc(name(i)) + (fin ? ' ✓' : '') + '</button>';
    }).join('') + (op.divers.length < F.MAX_DIVERS ? '<button class="chip add" data-a="adddiver" aria-label="Adicionar mergulhador">+</button>' : '') + '</div>';
  }

  // ---------------------------------------------------------------- passos 0 a 3 (comuns a todos)
  function step0() {
    var rows = [
      ['0 a 8 m', '<b>Não credenciado</b> (formação 60 h/a). Supervisor credenciado. Só águas próprias, sem condições perigosas.', '3 BM<br><small>4 se local remoto</small>', 1],
      ['8 a 18 m', 'Equipe <b>credenciada</b>. Supervisor e guia qualificados.', '4 BM', 2],
      ['18 a 30 m', 'Equipe <b>qualificada</b> + roupa seca. Sem passar do limite sem parada.', '4 BM ou mais', 3],
      ['Água imprópria', 'Roupa seca e full face, até 30 m. Até 18 m: credenciado com treino em roupa seca.', '4 BM', 3],
      ['Acima de 30 m', '<b>Mergulho técnico</b> (também descompressivo, caverna, teto). Acionar CEB via COB.', 'CEB', 4]
    ];
    return frame({ title: 'TABELA DE MERGULHO', sub: 'Passo 0 · Orientações gerais', step: 0, big: true },
      cols('<h2>Profundidade × equipe exigida</h2><div class="tw"><table class="o"><colgroup><col class="c1"><col><col class="c3"></colgroup><thead><tr><th>Prof.</th><th>Qualificação</th><th>Guarnição</th></tr></thead><tbody>' +
      rows.map(function (r) { return '<tr><td>' + r[0] + '<br><span class="tag">Nível ' + r[3] + '</span></td><td>' + r[1] + '</td><td>' + r[2] + '</td></tr>'; }).join('') +
      '</tbody></table></div><p class="fine">ITO 12, item 4 e Quadro 1. Profundidade real (medida), não a corrigida.</p>',
      '<h2>Regras de toda operação</h2><ul class="r">' +
      '<li>Um mergulhador de segurança pronto para cada mergulhador submerso, com comunicação por cabo guia ou fonia.</li>' +
      '<li>Não mergulhe com correnteza acima de 2 nós (≈ 1 m/s) ou com chuva forte prevista.</li>' +
      '<li>Iniciar com 200 bar; reserva de 50 bar intocável. <b>O tempo de fundo nunca passa da autonomia do cilindro.</b></li>' +
      '<li>Subida a no máximo 18 m/min. Acima de 18 m: parada de 3 min a 5 m.</li>' +
      '<li>Máximo de 240 min submerso por dia, por mergulhador.</li>' +
      '<li>DEA e cilindro de oxigênio obrigatórios no local.</li></ul>' +
      '<button class="btn" data-a="go" data-to="1">Iniciar</button>' +
      (op.started ? '<button class="link" data-a="reset">Começar um novo dia de mergulho</button>' : '') +
      '<p class="fine" style="margin:14px 0 0;text-align:center">Ferramenta de apoio. A versão oficial e vigente da ITO 12 prevalece.</p>'));
  }

  function step1() {
    return frame({ title: 'Teve alteração de altitude?', sub: 'Passo 1 · Altitude', step: 1, back: true },
      '<p class="ask">A guarnição subiu de altitude no deslocamento até o local do mergulho?</p>' +
      '<div class="yn"><button data-a="set" data-p="altChange" data-v="sim" aria-pressed="' + (op.altChange === 'sim') + '">SIM</button><button data-a="set" data-p="altChange" data-v="nao" aria-pressed="' + (op.altChange === 'nao') + '">NÃO</button></div>' +
      '<div class="err" id="e-altChange" style="margin:-10px 0 16px"></div>' +
      (op.altChange === 'sim' ? field('altDiff', 'Diferença de altitude', op.altDiff, { unit: 'm', ph: 'Ex.: 600', q: HELP_ALT }) +
        '<p class="fine" style="margin-top:-8px">O tempo de descanso no local é informado para cada mergulhador no Passo 3.</p>' : '') +
      (op.altChange ? field('siteAlt', 'Altitude do local do mergulho', op.siteAlt, { unit: 'm', ph: 'Ex.: 850', q: op.altChange === 'sim' ? null : HELP_ALT }) +
        '<p class="fine" style="margin-top:-8px">Usada para corrigir a profundidade (Anexo B). Ao nível do mar, digite 0.</p>' : '') +
      '<button class="btn" data-a="next1">Continuar</button>');
  }

  function step2() {
    return frame({ title: 'Meça a profundidade', sub: 'Passo 2 · Profundidade', step: 2, back: true },
      '<div class="note">Meça a profundidade real do local de mergulho com <b>poita e cabo</b>, <b>profundímetro</b>, sonda ou equipamento equivalente. Use a <b>maior</b> profundidade da área de busca.</div>' +
      field('depth', 'Profundidade medida', op.depth, { unit: 'm', ph: '0,0' }) +
      '<button class="btn" data-a="next2">Calcular</button>');
  }

  function diversCard() {
    var h = '<h2 id="mergulhadores" style="margin-top:22px">Mergulhadores <span class="count">' + op.divers.length + ' de ' + F.MAX_DIVERS + '</span></h2>';
    op.divers.forEach(function (d, i) {
      h += '<div class="diver"><div class="dnum">' + (i + 1) + '</div><div class="dfields">' +
        field('divers.' + i + '.name', 'Posto/graduação e nome', d.name, { ph: 'Ex.: Cb BM Silva', mode: 'text', small: true }) +
        (op.altChange === 'sim' ? field('divers.' + i + '.rest', 'Descanso no local (em minutos)', d.rest, { unit: 'min', ph: 'Ex.: 90', mode: 'numeric', small: true, q: HELP_REST }) : '') +
        field('divers.' + i + '.tcs', 'TCS (consumo de ar)', d.tcs, { unit: 'L/min', ph: 'Ex.: 22', small: true, q: HELP_TCS }) +
        '<div class="dmax" id="dmax-' + i + '">' + diverMax(i) + '</div></div>' + (op.divers.length > 1 ? '<button class="x" data-a="rmdiver" data-i="' + i + '" aria-label="Remover ' + esc(name(i)) + '">' + ICON.x + '</button>' : '') + '</div>';
    });
    if (op.divers.length < F.MAX_DIVERS) h += '<button class="btn line" data-a="adddiver">+ Adicionar mergulhador</button>';
    h += '<div class="cyl"><span class="lbl">Cilindro de cada mergulho</span><div class="two">' +
      field('cyl.volL', 'Volume', op.cyl.volL, { unit: 'L', small: true }) + field('cyl.pIni', 'Pressão inicial', op.cyl.pIni, { unit: 'bar', mode: 'numeric', small: true }) + '</div>' +
      '<p class="fine" style="margin:-8px 0 0">Padrão do CBMMG: S80, 11,2 L, 200 bar (ITO 12, item 3.17). A reserva de 50 bar não entra na autonomia.</p></div>';
    return h;
  }

  /** Resumo do tempo máximo do 1º mergulho de um mergulhador (tabela × cilindro). */
  function diverMax(i) {
    var o = dvOut(i);
    if (o.restMissing) return '<span class="muted">Informe o descanso em minutos para calcular o grupo de entrada.</span>';
    var r = o.dives[0], s1 = o.step1;
    var g = s1.entryGroup ? 'Grupo de entrada <b>' + (s1.startGroup || '—') + '</b>' + (s1.startGroup ? '' : ' (sem residual)') + ' · ' : '';
    if (r && r.blocked) return g + '<span class="muted">' + esc(r.blockMsg || '') + '</span>';
    if (!r || !r.limit || !r.limit.ok) return g;
    var au = F.autonomyFor(op, i, r.adjusted), mx = F.effectiveMax(r.limit, au);
    if (!au) return g + '<span class="muted">Sem TCS: máximo de <b>' + r.limit.value + ' min</b> pela tabela; controle o ar pelo manômetro.</span>';
    if (!au.ok) return g + '<span class="muted">Confira a TCS e o cilindro.</span>';
    return g + 'Autonomia <b>' + au.minutes + ' min</b> · tabela ' + r.limit.value + ' min → máximo <b class="' + (mx.by === 'autonomia' ? 'amb' : '') + '">' + mx.value + ' min</b>' + (mx.by === 'autonomia' ? ' (pelo cilindro)' : '');
  }

  function step3() {
    var o = siteO(), r = o.dives[0], s1 = o.step1;
    if (!s1.ok) { ui.step = 1; toast('Complete o Passo 1'); return render(); }   // ex.: dados salvos antes do campo de descanso
    if (!r || r.adjusted == null) { ui.step = 2; return render(); }
    return frame({ title: 'Resultado', sub: 'Passo 3 · Calculado automaticamente', step: 3, back: true }, cols(
      '<div class="pair"><div class="hero"><small>Grupo pela altitude</small><b>' + (s1.entryGroup || '—') + '</b><em>' + (s1.entryGroup ? 'Anexo C · antes do descanso' : 'Sem alteração') + '</em></div>' +
      '<div class="hero"><small>Profundidade corrigida</small><b>' + f1(r.adjusted) + '<span> m</span></b><em>Anexo B · real ' + f1(r.depth) + '</em></div></div>' +
      maxBlock(r, null, s1.entryGroup ? 'Tempo máximo sem descanso' : 'Tempo máximo pela tabela') +
      (s1.entryGroup ? '<p class="fine">Valor sem descanso (pior caso). O descanso de cada mergulhador reduz o grupo e aumenta o tempo: veja o resultado de cada um no cartão do mergulhador.</p>' : '') +
      '<div class="list">' + teamRow(r) + '</div>' + tableBtn(-1, 0),
      (r.blocked && !s1.entryGroup ? '<button class="btn alt" data-a="go" data-to="2" style="margin-top:12px">Rever profundidade</button>' :
        diversCard() + '<button class="btn" data-a="startdive" style="margin-top:18px">Iniciar mergulhos</button>')));
  }

  // ---------------------------------------------------------------- passos 4 e 5 (por mergulhador)
  /** Resultado do Passo 4 (grupo após o mergulho e botão), recalculado a cada dígito do tempo de fundo. */
  function res4Parts(i, k, r) {
    var au = F.autonomyFor(op, i, r.adjusted), res = '';
    if (r.done) {
      if (r.blocked || r.status !== 'ok') {
        res = '<div class="hero red"><small>Grupo após o mergulho</small><b>' + (r.groupAfter || '—') + '</b><em>Fora do limite sem parada</em></div>';
        (r.stops || []).filter(function (s) { return s.kind === 'deco'; }).forEach(function (s) { res += '<div class="al stop"><b>Exposição excepcional:</b> a Tabela 1 (NOAA) exige parada de ' + s.minutes + ' min a ' + f1(s.depth) + ' m. Pela ITO 12, mergulho descompressivo só com Equipe Nível 4. Encerre e comunique o comando.</div>'; });
        if (r.blocked && r.blockMsg) res += '<div class="al stop">' + esc(r.blockMsg) + '</div>';
      } else {
        res = '<div class="hero"><small>Grupo após o mergulho</small><b>' + r.groupAfter + '</b><em>Tabela 1 (NOAA)' + (r.res && r.res.tfe !== r.bt ? ' · tempo equivalente ' + r.res.tfe + ' min' : '') + '</em></div>' +
          (r.stops.length ? '<div class="al warn"><b>Antes de subir:</b> ' + r.stops.map(function (s) { return 'parada de ' + s.minutes + ' min a ' + f1(s.depth) + ' m'; }).join(', ') + '.</div>' : '');
        if (r.bt > r.limit.value) res += '<div class="al stop">Tempo de fundo acima do máximo da tabela (' + r.limit.value + ' min).</div>';
      }
      if (au && au.ok && r.bt > au.minutes) res += '<div class="al stop">Tempo de fundo acima da autonomia calculada do cilindro (' + au.minutes + ' min). Verifique o consumo e se a reserva de 50 bar foi usada.</div>';
      res += tableBtn(i, k, 'Ver meu grupo na tabela');
    }
    var ok = r.done && !r.blocked && r.status === 'ok';
    var btn = ok ? '<button class="btn" data-a="topos" data-s="5" data-k="' + k + '">Continuar</button>' : r.done ? '<button class="btn" data-a="enddiver" data-k="' + k + '">Encerrar mergulhos de ' + esc(name(i)) + '</button>' : '<button class="btn" data-a="next4">Registrar tempo de fundo</button>';
    return { res: res, btn: btn };
  }

  function step4() {
    var i = act(), k = pos().k, o = dvOut(i), r = o.dives[k], d = op.divers[i].dives[k];
    if (!r || r.adjusted == null) { op.divers[i].pos = k ? { step: 5, k: k - 1 } : { step: 4, k: 0 }; if (!k) { ui.step = 3; } return render(); }
    if (r.blocked && !r.done) // ex.: descanso insuficiente para a profundidade (grupo de entrada sem tempo na Tabela 3)
      return frame({ title: name(i), sub: 'Passo 4 · Mergulho ' + (k + 1), step: 4, back: true }, chips() + maxBlock(r, i, 'Tempo máximo de fundo') + tableBtn(i, k) +
        '<button class="btn" data-a="go" data-to="3">Rever descanso ou profundidade</button>');
    var au = F.autonomyFor(op, i, r.adjusted), mx = F.effectiveMax(r.limit, au), parts = res4Parts(i, k, r);
    return frame({ title: name(i), sub: 'Passo 4 · Mergulho ' + (k + 1), step: 4, back: true },
      chips() + cols(
      '<div class="pair"><div class="hero ' + (mx && mx.by === 'autonomia' ? 'amber' : '') + '"><small>Tempo máximo</small><b>' + (mx ? mx.value : 0) + '<span> min</span></b><em>' + (mx && mx.by === 'autonomia' ? 'pelo cilindro' : 'pela tabela') + '</em></div>' +
      '<div class="hero"><small>Grupo antes</small><b>' + (r.preGroup || '—') + '</b><em>' + (r.merged || r.preKind === 'unico' ? 'mesmo mergulho' : r.preGroup ? 'nitrogênio residual' : 'sem residual') + '</em></div></div>' +
      (mx ? '<div class="fuel"><div' + (mx.by === 'tabela' ? ' class="win"' : '') + '><small>Pela tabela</small><b>' + r.limit.value + ' min</b></div><div' + (mx.by === 'autonomia' ? ' class="win"' : '') + '><small>Pelo cilindro</small><b>' + (au && au.ok ? au.minutes + ' min' : 'TCS não informada') + '</b></div></div>' : '') +
      AIR_NOTE +
      (!r.done ? tableBtn(i, k) : ''),
      '<div class="note"><b>Tempo de fundo</b> começa quando o mergulhador <b>submerge</b> e termina quando ele <b>começa a subir</b>, deixando o fundo.</div>' +
      field('divers.' + i + '.dives.' + k + '.bt', 'Tempo total de fundo', d.bt, { unit: 'min', ph: '0', mode: 'numeric' }) +
      '<div id="res4">' + parts.res + '</div><div id="act4">' + parts.btn + '</div>'));
  }

  function step5() {
    var i = act(), k = pos().k, dv = op.divers[i], d = dv.dives[k], o = dvOut(i), r = o.dives[k];
    if (!r || !r.done) { dv.pos = { step: 4, k: k }; return render(); }
    var nxt = dv.dives[k + 1], h = '';
    h += '<div class="list"><div><dt>Mergulho ' + (k + 1) + '</dt><dd>' + f1(r.depth) + ' m · ' + r.bt + ' min</dd></div><div><dt>Grupo atual</dt><dd>' + r.groupAfter + '</dd></div>' +
      (o.series && o.series.submerged != null ? '<div><dt>Submerso no dia</dt><dd>' + Math.ceil(o.series.submerged) + ' de 240 min</dd></div>' : '') + '</div>';
    h += tableBtn(i, k, 'Ver meu grupo na tabela');
    var h2 = '';
    h2 += '<p class="ask" style="margin-top:18px">' + esc(name(i)) + ' vai realizar novo mergulho?</p><div class="yn"><button data-a="next5" data-v="sim" aria-pressed="' + (d.next === 'sim') + '">SIM</button><button data-a="next5" data-v="nao" aria-pressed="' + (d.next === 'nao') + '">NÃO</button></div>';
    if (d.next === 'sim' && nxt) {
      var base = 'divers.' + i + '.dives.' + (k + 1) + '.';
      h2 += field(base + 'si', 'Intervalo de superfície', nxt.si, { ph: '90 ou 1:30', mode: 'text' }) +
        '<p class="fine" style="margin-top:-10px">Da chegada à superfície até a nova submersão, em minutos (90) ou horas (1:30).</p>' +
        field(base + 'depth', 'Profundidade do novo mergulho', nxt.depth, { unit: 'm', ph: '0,0' }) +
        '<div id="res5">' + next5Html(i, o, k) + '</div>';
    }
    if (d.next === 'nao') h2 += '<button class="btn" data-a="enddiver" data-k="' + k + '">Encerrar mergulhos de ' + esc(name(i)) + '</button>';
    return frame({ title: name(i), sub: 'Passo 5 · Novo mergulho?', step: 5, back: true }, chips() + cols(h, h2));
  }
  function next5Html(i, o, k) {
    var n = o.dives[k + 1];
    if (!n || n.adjusted == null || Object.keys(n.errors).length) return '<button class="btn" disabled>Mergulhar</button>';
    var h = maxBlock(n, i, 'Tempo máximo de fundo');
    if (n.blocked && n.preKind === 'grupo') {
      var opts = E.siOptions(o.dives[k].groupAfter, n.adjusted).filter(function (x) { return x.maxBT > 0; });
      if (opts.length) h += '<div class="al warn">Com intervalo de pelo menos <b>' + E.min2hm(opts[0].from) + '</b> o tempo máximo pela tabela passa a ' + opts[0].maxBT + ' min.</div>';
    }
    if (n.preKind === 'unico') h += '<div class="al warn">Intervalo menor que 10 min: conta como o <b>mesmo mergulho</b> (ITO 12, 3.32).</div>';
    if (n.preKind === 'novo') h += '<div class="al ok">Intervalo acima de 15h50: <b>novo mergulho</b>, sem nitrogênio residual.</div>';
    h += '<div class="list"><div><dt>Grupo após o intervalo</dt><dd>' + (n.preGroup || '—') + '</dd></div><div><dt>Profundidade corrigida</dt><dd>' + f1(n.adjusted) + ' m</dd></div>' + teamRow(n) + '</div>';
    h += tableBtn(i, k + 1);
    h += n.blocked ? '<button class="btn" disabled style="margin-top:12px">Mergulhar</button>' : '<button class="btn" data-a="topos" data-s="4" data-k="' + (k + 1) + '" style="margin-top:12px">Mergulhar</button>';
    return h;
  }

  // ---------------------------------------------------------------- encerramento
  function stepEnd() {
    var h = '', pend = 0;
    op.divers.forEach(function (dv, i) {
      var o = dvOut(i), done = o.dives.filter(function (r) { return r.done; }), fin = finished(i);
      if (!fin) pend++;
      h += '<div class="endd"><div class="endh"><span class="g">' + (lastGroup(o) || '–') + '</span><b>' + esc(name(i)) + '</b><em>' + (fin ? 'Encerrado' : 'Em andamento') + '</em></div><div class="list">' +
        (done.length ? done.map(function (r) { return '<div><dt>Mergulho ' + (r.k + 1) + (r.k ? '<br><span class="fine">após ' + E.min2hm(r.si) + ' de intervalo</span>' : '') + '</dt><dd>' + f1(r.depth) + ' m · ' + r.bt + ' min<br>grupo ' + (r.groupAfter || '—') + '</dd></div>'; }).join('') : '<div><dt>Nenhum mergulho registrado</dt><dd></dd></div>') +
        (o.series && o.series.submerged != null ? '<div><dt>Submerso no dia</dt><dd>' + Math.ceil(o.series.submerged) + ' de 240 min</dd></div>' : '') + '</div>' +
        (!fin ? '<button class="btn alt sm" data-a="pick" data-i="' + i + '">Continuar ' + esc(name(i)) + '</button>' : '') + '</div>';
    });
    return frame({ title: 'Relatório da operação', sub: op.divers.length + ' mergulhador(es)' + (pend ? ' · ' + pend + ' em andamento' : ''), back: true },
      cols(h, '<p class="ask" style="font-size:1rem;margin-top:18px">Dados do relatório (opcional)</p>' +
      metaField('meta.ocorrencia', 'Ocorrência / REDS', op.meta.ocorrencia) + metaField('meta.local', 'Local', op.meta.local) + metaField('meta.supervisor', 'Supervisor de mergulho', op.meta.supervisor) +
      '<button class="btn" data-a="pdf">Baixar relatório PDF</button><button class="link" data-a="reset">Começar um novo dia de mergulho</button>'));
  }
  function metaField(p, l, v) { return '<div class="field"><label class="lbl" for="' + p + '">' + esc(l) + '</label><input id="' + p + '" data-p="' + p + '" class="sm" value="' + esc(v) + '"></div>'; }

  // ---------------------------------------------------------------- tabelas (com destaque da posição)
  function T1(hit) { // hit: { row, col, rowOnly }
    return '<table class="g"><thead><tr><th class="rh">m</th>' + D.GROUPS.map(function (g, j) { return '<th' + (hit && hit.col === j ? ' class="hl"' : '') + '>' + g + '</th>'; }).join('') + '</tr></thead><tbody>' + D.T1.map(function (row, i) {
      var inRow = hit && hit.row === i;
      return '<tr><th class="rh' + (inRow ? ' hl' : '') + '">' + f1(D.DEPTHS_M[i]) + '</th>' + row.cells.map(function (c, j) {
        var h = inRow && hit.col === j ? ' hit' : inRow ? ' hlr' : '';
        return c === null ? '<td class="x' + h + '"></td>' : typeof c === 'number' ? '<td class="' + (c === row.ndl ? 'n' : '') + h + '">' + c + '</td>' : '<td class="d' + h + '"><em>' + c.bt + '</em>' + c.stop + '</td>';
      }).join('') + '</tr>'; }).join('') + '</tbody></table>';
  }
  function T2(hit) { // hit: { col (grupo anterior), row (novo grupo) }
    return '<table class="g"><thead><tr><th class="rh">Novo ↓</th>' + D.GROUPS.map(function (g, j) { return '<th' + (hit && hit.col === j ? ' class="hl"' : '') + '>' + g + '</th>'; }).join('') + '</tr></thead><tbody>' + D.GROUPS.map(function (hg, hi) {
      return '<tr><th class="rh' + (hit && hit.row === hi ? ' hl' : '') + '">' + hg + '</th>' + D.GROUPS.map(function (g, gi) {
        var h = hit && hit.row === hi && hit.col === gi ? ' hit' : hit && hit.col === gi ? ' hlr' : '';
        if (gi < hi) return '<td class="x' + h + '"></td>';
        var r = E.parseRange(D.T2_ROWS[hg][gi - hi]); return '<td class="' + h + '">' + E.min2hm(r[0]) + '<br>' + E.min2hm(r[1]) + '</td>';
      }).join('') + '</tr>'; }).join('') + '</tbody></table>';
  }
  function T3(hit) { // hit: { row (grupo), col (profundidade) }
    return '<table class="g"><thead><tr><th class="rh">Grupo</th>' + D.DEPTHS_M.map(function (m, j) { return '<th' + (hit && hit.col === j ? ' class="hl"' : '') + '>' + f1(m) + '</th>'; }).join('') + '</tr></thead><tbody>' + D.GROUPS.map(function (g, gi) {
      var inRow = hit && hit.row === gi;
      return '<tr><th class="rh' + (inRow ? ' hl' : '') + '">' + g + '</th>' + D.T3[g].map(function (c, j) {
        var h = inRow && hit.col === j ? ' hit' : inRow ? ' hlr' : '';
        return c ? '<td class="t' + h + '"><span class="rr">' + c[0] + '</span><span>' + c[1] + '</span></td>' : '<td class="x' + h + '"></td>';
      }).join('') + '</tr>'; }).join('') + '</tbody></table>';
  }
  function TB(hit) {
    return '<table class="g"><thead><tr><th class="rh">Real</th>' + D.ALT_COLS.map(function (c, j) { return '<th' + (hit && hit.col === j ? ' class="hl"' : '') + '>' + Math.round(c) + '</th>'; }).join('') + '</tr></thead><tbody>' + D.ALT_ROWS.map(function (r, i) {
      var inRow = hit && hit.row === i;
      return '<tr><th class="rh' + (inRow ? ' hl' : '') + '">' + f1(r[0]) + '</th>' + r[1].map(function (v, j) { var h = inRow && hit.col === j ? ' hit' : inRow ? ' hlr' : ''; return v === null ? '<td class="x' + h + '"></td>' : '<td class="' + h + '">' + f1(v) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table>';
  }
  function TC(hitAlt) { return '<table class="g" style="width:100%"><thead><tr><th>Diferença de altitude até</th><th>Grupo</th></tr></thead><tbody>' + D.ALT_GROUP.map(function (x) { var h = hitAlt === x[0] ? ' class="hit"' : ''; return '<tr><td' + h + '>' + x[0] + ' m</td><td' + h + '><b>' + x[1] + '</b></td></tr>'; }).join('') + '</tbody></table>'; }

  function tableView(i, k) {
    // i = -1: resultado do Passo 3 (comum a todos, 1º mergulho)
    var o = i < 0 ? siteO() : dvOut(i), r = o.dives[k], s1 = o.step1;
    if (!r || r.adjusted == null) return frame({ title: 'Minha posição na tabela', sub: 'Sem dados', close: true }, '<p>Complete os passos anteriores.</p>');
    var who = i < 0 ? 'Todos os mergulhadores · 1º mergulho' : name(i) + ' · Mergulho ' + (k + 1);
    var current = r.done ? r.groupAfter : r.preGroup, h = '', n = 0;
    h += '<div class="hero"><small>' + (r.done ? 'Grupo após este mergulho' : 'Grupo antes deste mergulho') + '</small><b>' + (current || '—') + '</b><em>' + (current ? 'Destacado em amarelo nas tabelas abaixo' : 'Sem nitrogênio residual') + '</em></div>';
    function sec(title, text, inner) { n++; return '<div class="tsec"><h2><span class="sn">' + n + '</span>' + title + '</h2><p class="fine">' + text + '</p><div class="tb">' + inner + '</div></div>'; }
    if (k === 0 && s1.entryGroup) {
      var restTxt = s1.restKind === 'sem-credito' ? ' Descanso de ' + s1.rest + ' min (menos de 10 min): o grupo é mantido.' : s1.restKind === 'novo' ? ' Descanso de ' + s1.rest + ' min (mais de 15h50): sem nitrogênio residual.' : s1.restKind === 'nao-informado' ? ' Sem descanso considerado: o descanso é individual de cada mergulhador.' : '';
      h += sec('Grupo pela altitude – Anexo C', 'Diferença de altitude de ' + Math.round(s1.gain) + ' m → linha até ' + s1.entryRow + ' m → grupo <b>' + s1.entryGroup + '</b>.' + restTxt, TC(s1.entryRow));
      if (s1.restKind === 'grupo') {
        var ec = D.GROUPS.indexOf(s1.entryGroup);
        h += sec('Descanso no local – Tabela 2', 'Coluna do grupo <b>' + s1.entryGroup + '</b>, descanso de ' + s1.rest + ' min (' + E.min2hm(s1.rest) + ' na tabela) → grupo de entrada <b>' + s1.startGroup + '</b>' + (s1.restBeyond ? ' (descanso maior que a última faixa da coluna: grupo A).' : '.'), T2(s1.restBeyond ? { col: ec, row: -1 } : { col: ec, row: D.GROUPS.indexOf(s1.startGroup) }));
      }
    }
    h += sec('Profundidade corrigida – Anexo B', 'Profundidade real ' + f1(r.depth) + ' m (linha ' + f1(r.adj.rowDepth) + ') e altitude ' + Math.round(s1.site) + ' m (coluna ' + Math.round(r.adj.colAlt) + ') → <b>' + f1(r.adjusted) + ' m</b>.', TB({ row: r.adj.row, col: r.adj.col }));
    if (r.preKind === 'grupo' && r.t2) {
      var prev = o.dives[k - 1].groupAfter;
      h += sec('Intervalo de superfície – Tabela 2', 'Coluna do grupo <b>' + prev + '</b>, intervalo de ' + E.min2hm(r.si) + ' → novo grupo <b>' + r.preGroup + '</b>.', T2({ col: D.GROUPS.indexOf(prev), row: D.GROUPS.indexOf(r.preGroup) }));
    }
    if (r.preGroup && r.preKind !== 'unico') {
      var t3 = E.t3Lookup(r.preGroup, r.adjusted);
      h += sec('Mergulho repetitivo – Tabela 3', 'Grupo <b>' + r.preGroup + '</b> a ' + f1(D.DEPTHS_M[t3.colIdx]) + ' m → ' + (t3.ok ? 'nitrogênio residual <b>' + t3.tnr + ' min</b> (vermelho) e tempo máximo <b>' + t3.abt + ' min</b> (preto).' : 'sem valor: não há mergulho sem parada.'), T3({ row: D.GROUPS.indexOf(r.preGroup), col: t3.colIdx }));
    }
    var t1row, t1col = null, t1text;
    if (r.done && r.res && r.res.table1) {
      t1row = D.DEPTHS_M.indexOf(r.res.table1.rowDepth); t1col = r.res.table1.colIdx;
      t1text = 'Linha ' + f1(r.res.table1.rowDepth) + ' m, ' + (r.res.tfe !== r.bt ? 'tempo equivalente ' + r.res.tfe + ' min (residual + fundo)' : 'tempo de fundo ' + r.bt + ' min') + ' → célula ' + r.res.table1.cellTime + ' → grupo <b>' + r.groupAfter + '</b>.';
    } else {
      var l1 = E.t1Lookup(r.adjusted, 1, !!r.preGroup);
      t1row = l1.rowIdx; t1col = r.preGroup ? null : D.T1[l1.rowIdx].cells.indexOf(l1.ndl);
      t1text = 'Linha ' + f1(D.DEPTHS_M[l1.rowIdx]) + ' m. ' + (r.preGroup ? 'O grupo após o mergulho sai desta linha quando o tempo de fundo for registrado.' : 'Valor em vermelho: limite sem parada (' + l1.ndl + ' min). O grupo após o mergulho sai desta linha.');
    }
    h += sec('Grupo de repetição – Tabela 1', t1text, T1({ row: t1row, col: t1col }));
    h += AIR_NOTE;
    return frame({ title: 'Minha posição na tabela', sub: who, close: true, wide: true }, h + '<button class="btn" data-a="closeview" style="margin-top:14px">Voltar</button>');
  }

  // ---------------------------------------------------------------- referência (ícone de livro)
  function refView() {
    function sec(t, inner, note) { return '<details><summary>' + t + '</summary><div class="tb">' + inner + '</div><p class="fine">' + note + '</p></details>'; }
    return frame({ title: 'Tabelas e ITO 12', sub: 'Consulta', close: true, wide: true },
      sec('Tabela 1 – Grupo de repetição', T1(), 'Vermelho: limite sem parada. Escuro: tempo de fundo (em cima) e minutos de parada a 6,1 m. NOAA (2010), Anexo A da ITO 12.') +
      sec('Tabela 2 – Intervalo de superfície', T2(), 'Faixas em h:mm. Entre na coluna do grupo, desça até o intervalo, a linha é o novo grupo. NOAA, Anexo A.') +
      sec('Tabela 3 – Mergulho repetitivo', T3(), 'Vermelho: nitrogênio residual. Preto: tempo máximo de fundo do mergulho repetitivo. Abaixo de 12,2 m use 12,2 m. NOAA, Anexo A.') +
      sec('Anexo B – Profundidade corrigida', TB(), 'Linha: profundidade real (m). Coluna: altitude do local (m). NOAA, Anexo B da ITO 12.') +
      sec('Anexo C – Grupo pela altitude', TC(), 'Após deslocamento terrestre com aumento de altitude. ITO 12, Anexo C.') +
      '<details><summary>Autonomia do cilindro (ITO 12, item 3.6)</summary><ul class="r"><li>Autonomia = volume × (pressão inicial − 50 bar) ÷ (TCS × pressão absoluta).</li><li>Pressão absoluta = 1 + profundidade corrigida ÷ 10.</li><li>Exemplo da ITO (Fig. 2): 11,2 L × 150 bar ÷ (28 L/min × 2,3) = 26 min.</li><li>O tempo máximo de fundo é sempre o menor entre a tabela e a autonomia.</li></ul></details>' +
      '<details><summary>Plano de emergência (ITO 12, item 9)</summary><ul class="r"><li>Primeiros socorros conforme ITO 23 e COBOM 193 (horário, local, estado do militar).</li><li>Oxigênio o mais próximo possível de 100%; paciente consciente não deve sentar.</li><li>A mais de 1 h e/ou 50 km do hospital de referência: transporte aéreo.</li><li>Sintomas podem surgir até 24 h depois: o próprio militar aciona o 193.</li></ul></details>' +
      '<details><summary>Critérios pendentes de validação</summary><ul class="r">' +
      ['Valores não tabelados: usa-se o valor tabelado imediatamente superior.', 'Intervalo < 10 min: mesmo mergulho, somando o tempo (ITO 3.32).', 'Intervalo maior que a última faixa da coluna e até 15h50: grupo A.', 'Tempo de descanso no local antes do 1º mergulho tratado como intervalo de superfície (Tabela 2) a partir do grupo do Anexo C.', 'Parada de 5 m quando a profundidade real OU a corrigida passa de 18 m.', 'Autonomia arredondada para baixo e calculada na profundidade corrigida; cada mergulho com cilindro na pressão inicial informada.'].map(function (t) { return '<li>' + t + '</li>'; }).join('') +
      '</ul><p class="fine">Interpretações conservadoras, não escritas nas fontes recebidas. Divergências e detalhes no documento técnico.</p></details>' +
      '<p class="fine" style="margin-top:14px">Integridade das tabelas: <b>' + E.dataHash() + '</b> · App ' + E.APP_VERSION + '. Confira com a ITO 12 impressa.</p>');
  }

  // ---------------------------------------------------------------- render e navegação
  function render() {
    var html;
    if (view === 'ref') html = refView();
    else if (view && view.table) html = tableView(view.table.i, view.table.k);
    else if (ui.step === 'end') html = stepEnd();
    else if (ui.step === 'd') html = pos().step === 5 ? step5() : step4();
    else html = [step0, step1, step2, step3][ui.step]();
    if (html === undefined) return;
    app.innerHTML = html + '<p class="foot">ITO 12 (2ª ed., 2024) · Tabelas NOAA 2010 · Ferramenta de apoio</p>';
    if (view && view.table) app.querySelectorAll('.tb').forEach(function (box) { // centraliza a célula destacada
      var hit = box.querySelector('.hit'); if (!hit) return;
      box.scrollLeft = Math.max(0, hit.offsetLeft - box.clientWidth / 2 + hit.offsetWidth / 2);
      box.scrollTop = Math.max(0, hit.offsetTop - box.clientHeight / 2 + hit.offsetHeight / 2);
    });
    save();
  }
  function go(step) { ui.step = step; view = null; helpOpen = {}; render(); window.scrollTo(0, 0); }
  function toPos(s, k) { op.divers[act()].pos = { step: s, k: k }; go('d'); }

  function validate1() {
    var e = siteO().step1.errors;
    ['altChange', 'altDiff', 'siteAlt'].forEach(function (p) { showErr(p, e[p]); });
    return !Object.keys(e).length;
  }

  // ---------------------------------------------------------------- eventos
  app.addEventListener('input', function (ev) {
    var p = ev.target.getAttribute('data-p'); if (!p) return;
    setP(p, ev.target.value); save(); showErr(p, '');
    var mb = p.match(/^divers\.(\d+)\.dives\.(\d+)\.bt$/);
    if (mb && ui.step === 'd' && pos().step === 4 && +mb[1] === act() && +mb[2] === pos().k) {
      var bi = +mb[1], bk = +mb[2], br = dvOut(bi).dives[bk];
      if (br && br.adjusted != null) {
        var pr = res4Parts(bi, bk, br), r4 = document.getElementById('res4'), a4 = document.getElementById('act4');
        if (r4) r4.innerHTML = pr.res; if (a4) a4.innerHTML = pr.btn;
        showErr(p, br.errors.bt || '');
        var ch = app.querySelector('.chips'); if (ch) ch.outerHTML = chips();
      }
    }
    var m = p.match(/^divers\.(\d+)\.dives\.(\d+)\.(si|depth)$/);
    if (m && ui.step === 'd' && pos().step === 5) {
      var i = +m[1], k = pos().k, o = dvOut(i), box = document.getElementById('res5');
      if (box) box.innerHTML = next5Html(i, o, k);
      var n = o.dives[k + 1], base = 'divers.' + i + '.dives.' + (k + 1) + '.';
      if (n) { showErr(base + 'si', touched[base + 'si'] && n.errors.si || ''); showErr(base + 'depth', touched[base + 'depth'] && n.errors.depth || ''); }
    }
    var tm = p.match(/^(?:divers\.(\d+)\.(?:tcs|rest)|cyl\.(?:volL|pIni))$/);
    if (tm && ui.step === 3) { op.divers.forEach(function (_, i) { var el = document.getElementById('dmax-' + i); if (el) el.innerHTML = diverMax(i); }); }
    if (/^divers\.\d+\.name$/.test(p)) { var row = ev.target.closest('.diver'); if (row) { var x = row.querySelector('[data-a=rmdiver]'); if (x) x.setAttribute('aria-label', 'Remover ' + (ev.target.value || 'mergulhador')); } }
  });
  app.addEventListener('focusout', function (ev) {
    var p = ev.target.getAttribute && ev.target.getAttribute('data-p'); if (!p) return;
    touched[p] = true;
    var m = p.match(/^divers\.(\d+)\.dives\.(\d+)\.(si|depth)$/);
    if (m && ui.step === 'd') { var n = dvOut(+m[1]).dives[+m[2]]; if (n) showErr(p, n.errors[m[3]] || ''); }
    if (/^cyl\.|\.tcs$|\.rest$/.test(p)) { var ce = F.cylErrors(op); showErr(p, ce[p] || ''); }
  });
  app.addEventListener('keydown', function (ev) {
    if (ev.key !== 'Enter' || !ev.target.getAttribute('data-p')) return;
    var b = app.querySelector('.btn:not([disabled]):not(.alt):not(.line)'); if (b) { ev.preventDefault(); ev.target.blur(); b.click(); }
  });

  app.addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-a]'); if (!b) return;
    var a = b.getAttribute('data-a');
    if (a === 'ref') { view = 'ref'; render(); window.scrollTo(0, 0); return; }
    if (a === 'table') { view = { table: { i: +b.getAttribute('data-i'), k: +b.getAttribute('data-k') } }; render(); window.scrollTo(0, 0); return; }
    if (a === 'closeview') { view = null; render(); window.scrollTo(0, 0); return; }
    if (a === 'help') { var hp = b.getAttribute('data-h'); helpOpen[hp] = !helpOpen[hp]; render(); return; }
    if (a === 'back') {
      if (ui.step === 'end') return go('d');
      if (ui.step === 'd') { var ps = pos(); if (ps.step === 5) return toPos(4, ps.k); if (ps.k) return toPos(5, ps.k - 1); return go(3); }
      return go(Math.max(0, ui.step - 1));
    }
    if (a === 'go') { var to = +b.getAttribute('data-to'); if (to === 1) op.started = true; return go(to); }
    if (a === 'set') { setP(b.getAttribute('data-p'), b.getAttribute('data-v')); if (op.altChange === 'nao') { op.altDiff = ''; op.altRest = ''; } render(); return; }
    if (a === 'next1') { if (validate1()) go(2); else { var f = app.querySelector('[aria-invalid="true"]'); if (f) f.focus(); } return; }
    if (a === 'next2') { var r = siteO().dives[0]; if (!r || r.errors.depth) { showErr('depth', r ? r.errors.depth : 'Informe a profundidade medida.'); return; } return go(3); }
    if (a === 'adddiver') {
      if (op.divers.length >= F.MAX_DIVERS) { toast('Máximo de ' + F.MAX_DIVERS + ' mergulhadores.'); return; }
      op.divers.push(F.newDiver());
      if (ui.step !== 3) { ui.step = 3; view = null; }
      render(); var el = document.getElementById('divers.' + (op.divers.length - 1) + '.name'); if (el) { el.scrollIntoView({ block: 'center' }); el.focus(); }
      return;
    }
    if (a === 'rmdiver') {
      var ri = +b.getAttribute('data-i'), started = op.divers[ri].dives.some(function (d) { return String(d.bt).trim() !== ''; });
      if (started && !confirm('Remover ' + name(ri) + ' e os mergulhos já registrados?')) return;
      op.divers.splice(ri, 1); if (op.active >= op.divers.length) op.active = op.divers.length - 1; render(); return;
    }
    if (a === 'startdive') {
      var ce = F.cylErrors(op), keys = Object.keys(ce);
      if (keys.length) { keys.forEach(function (p) { showErr(p, ce[p]); }); var fe = document.getElementById(keys[0]); if (fe) { fe.scrollIntoView({ block: 'center' }); fe.focus(); } return; }
      var first = 0; for (var q = 0; q < op.divers.length; q++) if (!finished(q)) { first = q; break; }
      op.active = first; return go('d');
    }
    if (a === 'pick') { op.active = +b.getAttribute('data-i'); return go('d'); }
    if (a === 'topos') return toPos(+b.getAttribute('data-s'), +b.getAttribute('data-k'));
    if (a === 'next4') {
      var k = pos().k, d = dvOut(act()).dives[k], path = 'divers.' + act() + '.dives.' + k + '.bt';
      if (d && d.errors.bt) { showErr(path, d.errors.bt); return; }
      if (!d || !d.done) { showErr(path, 'Informe o tempo de fundo em minutos.'); return; }
      render(); var rr = document.getElementById('res4'); if (rr) rr.scrollIntoView({ block: 'center', behavior: 'smooth' }); return;
    }
    if (a === 'next5') {
      var dv = op.divers[act()], kk = pos().k, v = b.getAttribute('data-v');
      dv.dives[kk].next = v;
      if (v === 'sim' && !dv.dives[kk + 1]) dv.dives.push({ depth: op.depth, bt: '', si: '', next: '' });
      if (v === 'nao') dv.dives = dv.dives.slice(0, kk + 1);
      render(); return;
    }
    if (a === 'enddiver') {
      var dv2 = op.divers[act()], ke = +b.getAttribute('data-k');
      dv2.dives[ke].next = 'nao'; dv2.dives = dv2.dives.slice(0, ke + 1); dv2.pos = { step: 5, k: ke };
      for (var j = 0; j < op.divers.length; j++) if (!finished(j)) { op.active = j; break; }
      return go('end');
    }
    if (a === 'reset') { if (confirm('Apagar os dados de todos os mergulhadores e começar um novo dia?')) { op = F.newOp(); ui = { step: 0 }; go(0); } return; }
    if (a === 'pdf') return pdf(b);
  });

  function pdf(btn) {
    var bytes;
    try { bytes = F.report(op, { logoJpg: window.CBMMG_LOGO_JPG }); } catch (e) { toast('Não foi possível gerar o relatório.'); return; }
    var d = new Date(), fname = 'relatorio-mergulho-' + d.getFullYear() + ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2) + '-' + ('0' + d.getHours()).slice(-2) + ('0' + d.getMinutes()).slice(-2) + '.pdf';
    var blob = new Blob([bytes], { type: 'application/pdf' });
    btn.disabled = true;
    dlP.then(function (dl) {
      if (dl) return dl.save({ filename: fname, data: blob }).then(function () { toast('Relatório salvo'); }, function (e) { if (e && e.code === 'declined') toast('Download cancelado'); else fallback(); });
      fallback();
    }).catch(fallback).then(function () { btn.disabled = false; });
    function fallback() {
      try { var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = fname; document.body.appendChild(a); a.click(); a.remove(); toast('Relatório gerado'); }
      catch (e) { toast('Download indisponível neste navegador.'); }
    }
  }

  render();
})();
