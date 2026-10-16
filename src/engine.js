/*
 * MOTOR DE CÁLCULO — funções puras, sem dependência de interface.
 * Fluxo: entrada -> interpretação da tabela/regra -> cálculo -> resultado (+ rastreabilidade).
 * Toda decisão registra um passo de rastreio com o identificador da regra (RULES).
 * Regras "INT-*" são interpretações de leitura NÃO enunciadas textualmente nas fontes,
 * adotadas pelo critério mais conservador e pendentes de validação normativa.
 */
(function (root) {
  'use strict';
  var D = (typeof module !== 'undefined' && module.exports) ? require('./data.js') : root.DIVE_DATA;

  var APP_VERSION = '4.3.0';
  var EPS = 1e-9;
  var MAX_SI_MIN = 15 * 60 + 50;      // ITO 3.32 / Tabela 2 (15:50)
  var MIN_SI_MIN = 10;                // ITO 3.32
  var MAX_ASCENT = 18;                // ITO 3.56 e 3.63 (m/min)
  var DAILY_MAX_MIN = 240;            // ITO 7.10.2 e 7.10.7
  var RESERVE_BAR = 50;               // ITO 3.6
  var START_BAR = 200;                // ITO 3.6

  // ------------------------------------------------------------------ Regras
  var RULES = {
    'NOAA-T1':   { fonte: 'NOAA', ref: 'Tabela 1 – Tempo de fundo com grupo de repetição (ITO 12, Anexo A, p. 91)', txt: 'Determina o grupo de repetição pela profundidade e tempo de fundo; valor circulado = tempo máximo sem parada.' },
    'NOAA-T1-DECO': { fonte: 'NOAA', ref: 'Tabela 1, células vermelho/preto (Anexo A, p. 91)', txt: 'Tempo de fundo para parada descompressiva: minutos necessários a 20 pés ou 6,1 metros.' },
    'NOAA-T2':   { fonte: 'NOAA', ref: 'Tabela 2 – Tempo de intervalo de superfície (Anexo A, p. 91)', txt: 'Entre de cima para baixo na coluna do grupo; desça até o intervalo realizado; à esquerda está o novo grupo.' },
    'NOAA-T3':   { fonte: 'NOAA', ref: 'Tabela 3 – Tempo para mergulho repetitivo (Anexo A, p. 91)', txt: 'Vermelho: tempo de nitrogênio residual (TNR). Preto: ajuste do tempo do mergulho repetitivo sem parada – o próximo mergulho não deve exceder esse tempo.' },
    'NOAA-TFE':  { fonte: 'NOAA', ref: 'Legenda do Anexo A, p. 91', txt: 'TNR + PTF (tempo de fundo do mergulho repetitivo) = TFE (tempo de fundo equivalente). Use o TFE para determinar o próximo tempo de mergulho e o grupo de repetição.' },
    'NOAA-T3-12':{ fonte: 'NOAA', ref: 'Nota vertical da Tabela 3 (Anexo A, p. 91)', txt: 'Mergulhos repetitivos com profundidades inferiores a 12,2 m devem utilizar os parâmetros adotados para 12,2 m.' },
    'NOAA-AVISO':{ fonte: 'NOAA', ref: 'Aviso do Anexo A, p. 91', txt: 'Mesmo que as tabelas sejam cumpridas rigorosamente, não há garantias de que não ocorrerá doença descompressiva. O uso conservador é recomendado.' },
    'NOAA-B':    { fonte: 'NOAA', ref: 'Tabela de ajuste de profundidade/altitude (ITO 12, Anexo B, p. 92)', txt: 'Profundidade corrigida conforme altitude, em metros.' },
    'ITO-C':     { fonte: 'ITO', ref: 'ITO 12, Anexo C, p. 93', txt: 'Após deslocamento terrestre com aumento de altitude, observar o grupo repetitivo de entrada conforme a altitude.' },
    'ITO-7.1':   { fonte: 'ITO', ref: 'ITO 12, item 7.1, p. 46', txt: 'Para a escolha das equipes avalia-se a profundidade real; os ajustes de altitude são empregados para cálculos de autonomia de gás, limites não descompressivos e planejamento.' },
    'ITO-3.32':  { fonte: 'ITO', ref: 'ITO 12, item 3.32, p. 21', txt: 'IS entre 10 min e 15h50. Inferior a 10 min equivale a um mergulho único; acima de 15h50 considera-se novo mergulho, com novo planejamento.' },
    'ITO-3.46':  { fonte: 'ITO', ref: 'ITO 12, item 3.46, p. 24', txt: 'Após qualquer mergulho profundo (superior a 18 m), parada de 3 minutos a 5 metros antes de chegar à superfície.' },
    'ITO-3.63':  { fonte: 'ITO', ref: 'ITO 12, itens 3.56 e 3.63, p. 27 e 29', txt: 'Velocidade máxima de subida de 18 m/min.' },
    'ITO-3.62':  { fonte: 'ITO', ref: 'ITO 12, item 3.62, p. 29', txt: 'Tempo de fundo: desde a saída da superfície até o instante em que deixa o fundo, em minutos.' },
    'ITO-3.25':  { fonte: 'ITO', ref: 'ITO 12, item 3.25, p. 20', txt: 'Exposição excepcional: tempo de fundo e/ou profundidade além dos limites da tabela de limites sem descompressão.' },
    'ITO-4.4':   { fonte: 'ITO', ref: 'ITO 12, itens 4 e 4.4, Quadro 1, p. 32–37', txt: 'Mergulhos descompressivos ou acima de 30 m: equipe nível 4 (mergulho técnico), acionada pelo CEB mediante solicitação do COB.' },
    'ITO-7.8h':  { fonte: 'ITO', ref: 'ITO 12, item 7.8 h, p. 56', txt: 'O planejamento deve conter cálculos de contingência para exposição excepcional: reserva de emergência, paradas e tempo de subida.' },
    'ITO-7.10.7':{ fonte: 'ITO', ref: 'ITO 12, itens 7.10.2 (p. 62) e 7.10.7 (p. 65)', txt: 'Tempo máximo submerso diário por mergulhador, incluindo a descompressão: 240 minutos (4 horas).' },
    'ITO-3.6':   { fonte: 'ITO', ref: 'ITO 12, item 3.6 e Figuras 1–2, p. 14–15', txt: 'Autonomia = volume do cilindro × pressão de trabalho ÷ (consumo individual × pressão absoluta). Iniciar com 200 bar; reserva de 50 bar não entra no cálculo.' },
    'ITO-3.61':  { fonte: 'ITO', ref: 'ITO 12, item 3.61 e Figuras 3–4, p. 28–29', txt: 'TCS = (consumo em bar × volume do cilindro ÷ pressão absoluta) ÷ tempo de atividade submerso.' },
    'ITO-3.17':  { fonte: 'ITO', ref: 'ITO 12, item 3.17, p. 18', txt: 'Cilindro S80 usado no CBMMG: 11,2 litros, pressão máxima de trabalho 200 bar.' },
    'ITO-7.2.1': { fonte: 'ITO', ref: 'ITO 12, item 7.2.1, p. 50', txt: 'Mergulho dependente: o supervisor deve certificar TCS inferior a 40 L/min.' },
    'ITO-Q1':    { fonte: 'ITO', ref: 'ITO 12, item 4 e Quadro 1, p. 31–33', txt: 'Nível 1: até 8 m, águas adequadas, sem condições perigosas. Nível 2: 8–18 m, águas adequadas. Nível 3: acima de 18 m até o limite não descompressivo, ou águas impróprias. Nível 4: acima de 30 m, descompressivo, confinado/teto.' },
    'ITO-4':     { fonte: 'ITO', ref: 'ITO 12, item 4, p. 31–32', txt: 'Equipe mínima: 3 militares até 8 m (+1 em local remoto/condições perigosas); no mínimo 4 acima de 8 m.' },
    'ITO-3.16':  { fonte: 'ITO', ref: 'ITO 12, item 3.16, p. 17–18', txt: 'Condições perigosas, entre elas correnteza superior a 3,7 km/h (1,03 m/s).' },
    'ITO-7.4b':  { fonte: 'ITO', ref: 'ITO 12, item 7.4 b, p. 52', txt: 'Não mergulhe em cursos d’água com velocidade superior a 2 nós.' },
    'ITO-3.41':  { fonte: 'ITO', ref: 'ITO 12, itens 3.41 e 3.43, p. 23–24', txt: 'Mergulho profundo: acima de 18 m. Narcose comum a partir de 30 m, podendo surgir a partir de 18 m.' },
    'ITO-3.42':  { fonte: 'ITO', ref: 'ITO 12, item 3.42, p. 23', txt: 'Mergulho técnico: acima de 30 m ou ambientes específicos (cavernas, naufrágios).' },
    'ITO-6':     { fonte: 'ITO', ref: 'ITO 12, item 6, p. 42', txt: 'Via de regra, as operações devem ser iniciadas às 8 horas e executadas enquanto a luminosidade natural permitir.' },
    'ITO-5':     { fonte: 'ITO', ref: 'ITO 12, item 5 e Figura 5, p. 39–40 e 60', txt: 'Na recuperação de cadáver, cerca de 20 h após a notificação a água pode se tornar imprópria: priorizar roupa seca e full face. Figura 5: a partir de 18 h, recuperação de cadáver por equipe nível 3.' },
    'ITO-FIG5':  { fonte: 'ITO', ref: 'ITO 12, Figura 5 (notas), p. 60', txt: 'Qualquer mergulho em água contaminada até 30 m deve ser executado pela equipe nível 3.' },
    'ITO-4.3.1': { fonte: 'ITO', ref: 'ITO 12, item 4.3.1, p. 35', txt: 'Em águas impróprias para banho, até 18 m, o mergulho pode ser executado por militar credenciado com treinamento específico para roupa seca.' },
    'ITO-6-SEG': { fonte: 'ITO', ref: 'ITO 12, item 6, p. 42–43', txt: 'Para cada mergulhador submerso, um mergulhador de segurança em condições de pronto empenho; comunicação direta com o apoio de superfície (cabo guia ou fonia).' },
    'ITO-8.2t':  { fonte: 'ITO', ref: 'ITO 12, itens 7.10.1, 7.10.7 e 8.2 t, p. 61–72', txt: 'Registrar no REDS tempo de fundo, profundidade e dados do mergulho repetitivo; preencher a caderneta de mergulho individual.' },
    'ITO-7.10.3':{ fonte: 'ITO', ref: 'ITO 12, item 7.10.3, p. 62', txt: 'Encerrar a operação quando o tempo de fundo tiver sido limitado na profundidade sem encontrar o objeto, ou quando a profundidade extrapolar o limite de segurança.' },
    'ITO-9':     { fonte: 'ITO', ref: 'ITO 12, itens 9.4 a 9.6, p. 77–82', txt: 'Plano de emergência: primeiros socorros (ITO 23), COBOM 193, oxigênio próximo de 100%, paciente consciente não deve sentar, transporte aéreo se a mais de 1 h e/ou 50 km do hospital de referência.' },
    'INT-01':    { fonte: 'INT', ref: 'Interpretação conservadora (não enunciada nas fontes fornecidas)', txt: 'Valor não tabelado (profundidade, altitude): usa-se o valor tabelado imediatamente superior; tempo de fundo: a menor célula igual ou superior ao tempo realizado.' },
    'INT-02':    { fonte: 'INT', ref: 'Interpretação conservadora de ITO 3.32 + 3.62', txt: 'IS < 10 min: mergulho único com a maior profundidade e TF = TF anterior + IS + TF seguinte (tempo desde a saída da superfície até deixar o fundo).' },
    'INT-03':    { fonte: 'INT', ref: 'Interpretação conservadora de ITO 3.32 + Tabela 2', txt: 'IS maior que o último valor da coluna do grupo, mas até 15h50: mantém-se o grupo A.' },
    'INT-04':    { fonte: 'INT', ref: 'Interpretação conservadora do Anexo C', txt: 'Se o tempo de descanso no local não for informado, o grupo de entrada por altitude é aplicado ao 1º mergulho sem crédito pela Tabela 2.' },
    'INT-12':    { fonte: 'INT', ref: 'Orientação do usuário (Oficial) aplicada à Tabela 2 e ao Anexo C – pendente de validação normativa', txt: 'O tempo de descanso no local antes do 1º mergulho é tratado como intervalo de superfície: a partir do grupo do Anexo C, a Tabela 2 dá o grupo de entrada. Menos de 10 min: mantém o grupo do Anexo C; mais de 15h50: sem nitrogênio residual (ITO 3.32).' },
    'INT-05':    { fonte: 'INT', ref: 'Derivada dos exemplos das Figuras 2 e 4 da ITO 12', txt: 'Pressão absoluta (ATA) = 1 + profundidade/10 (13 m → 2,3 ATA; 2 m → 1,2 ATA).' },
    'INT-06':    { fonte: 'INT', ref: 'Consistente com a Figura 2 (26,09 → 26 min)', txt: 'Autonomia arredondada para baixo, em minutos inteiros.' },
    'INT-07':    { fonte: 'INT', ref: 'Extensão conservadora da nota da Tabela 3', txt: 'Mergulho não repetitivo com profundidade (ajustada) inferior a 12,2 m usa a linha de 12,2 m da Tabela 1.' },
    'INT-09':    { fonte: 'INT', ref: 'Interpretação conservadora de ITO 3.46', txt: 'A parada de 3 min a 5 m é aplicada quando a profundidade real OU a ajustada excede 18 m.' },
    'INT-10':    { fonte: 'INT', ref: 'Parâmetro gráfico (não definido nas fontes)', txt: 'A velocidade de descida é apenas ilustrativa no gráfico; não altera nenhum cálculo (o TF já inclui a descida – ITO 3.62).' },
    'INT-11':    { fonte: 'INT', ref: 'Interpretação conservadora', txt: 'Havendo grupo informado manualmente e grupo por altitude, usa-se o grupo mais alto (maior carga residual).' }
  };

  var DIVERGENCES = [
    { id: 'DIV-01', titulo: 'Validade do IS para mergulho repetitivo', a: 'ITO 3.60: a TTNR fornece grupos para IS maiores que 10 min e menores que 12 h.', b: 'ITO 3.32 e Tabela 2 (NOAA): IS de 10 min a 15h50.', tratamento: 'O app usa a Tabela 2 e o item 3.32 (15h50), que coincidem entre si, e exibe esta divergência sempre que o IS estiver entre 12h e 15h50.' },
    { id: 'DIV-02', titulo: 'Referências internas de anexos', a: 'ITO 7.8 c manda ajustar a profundidade "conforme tabela contida no Anexo C"; 7.10.3 cita as TLSD como "Anexo C"; 8.3 a cita caderneta no "Anexo D"; 7.8 cita checklist no "Anexo B".', b: 'Conteúdo real: ajuste profundidade/altitude = Anexo B; TLSD = Anexo A; caderneta = Apêndice C; checklist = Apêndice B.', tratamento: 'O app usa a tabela pelo conteúdo (Anexo B para profundidade, Anexo A para TLSD) e registra a divergência.' },
    { id: 'DIV-03', titulo: 'Limites de profundidade das equipes', a: 'Quadro 1: nível 1 até 8 m; nível 2 entre 9 e 18 m; nível 3 entre 19 m e o limite não descompressivo.', b: 'Texto do item 4: nível 2 acima de 8 m (4.2: até 18 m); nível 3 acima de 18 m.', tratamento: 'O app usa os limites do texto (> 8 m e > 18 m) e alerta quando a profundidade real cai entre 8 e 9 m ou entre 18 e 19 m.' },
    { id: 'DIV-04', titulo: 'Faixas de altitude diferentes entre anexos', a: 'Anexo B: 304,8 / 609,6 / 914,4 … 3047,9 m.', b: 'Anexo C: 300 / 600 / 900 … 3000 m.', tratamento: 'Cada tabela é consultada com suas próprias faixas (INT-01). Altitudes entre 300 e 304,8 m (etc.) caem em linhas de posições diferentes; o app mostra ambas as consultas.' },
    { id: 'DIV-05', titulo: 'Anomalia na coluna 304,8 m do Anexo B', a: 'Até 44,2 m a coluna 304,8 m repete a profundidade real.', b: 'A partir de 45,7 m os valores divergem (45,7 → 48,8; 47,2 → 51,8 …).', tratamento: 'Sem efeito prático: profundidades corrigidas acima de 39,6 m estão fora da Tabela 1 e são bloqueadas. Transcrito sem correção.' },
    { id: 'DIV-06', titulo: 'Mergulho descompressivo', a: 'NOAA Tabela 1: prevê tempos de fundo com parada descompressiva a 6,1 m.', b: 'ITO 12: equipes 1–3 limitadas ao limite não descompressivo; descompressivo = exposição excepcional e equipe nível 4 via CEB (3.25, 4.4, Quadro 1).', tratamento: 'O app nunca propõe mergulho descompressivo como plano normal. A informação NOAA é exibida como contingência (ITO 7.8 h) e o resultado recebe o status de exposição excepcional.' },
    { id: 'DIV-07', titulo: 'Parada NOAA × parada ITO', a: 'NOAA: parada descompressiva a 6,1 m (quando a célula exigir).', b: 'ITO 3.46: parada de 3 min a 5 m após mergulho superior a 18 m.', tratamento: 'Quando ambas se aplicam, o app exibe as duas (6,1 m e depois 5 m). A ITO não define a combinação: validar com o supervisor.' },
    { id: 'DIV-08', titulo: 'Edição das tabelas NOAA', a: 'Anexos A e B: "Fonte: NOAA (2010)", "Copyright © 2010 by NOAA/BPC".', b: 'Referências da ITO: NOAA Diving Manual, 4ª edição, 2001.', tratamento: 'O app usa exclusivamente os valores impressos nos anexos. A edição exata deve ser confirmada pelo CBMMG.' }
  ];

  var MISSING = [
    { id: 'AUS-01', item: 'NOAA Diving Manual (texto com procedimentos)', motivo: 'Foi informado que seria fornecido, mas só chegaram as tabelas reproduzidas na ITO 12. Sem ele não há fonte textual para as regras INT-01 a INT-11.' },
    { id: 'AUS-02', item: 'Regra de leitura para valores intermediários', motivo: 'Profundidade, altitude e tempo não tabelados (INT-01).' },
    { id: 'AUS-03', item: 'Procedimento para IS inferior a 10 min', motivo: 'A ITO diz apenas que "equivale a um mergulho único" (INT-02).' },
    { id: 'AUS-04', item: 'Procedimentos de altitude', motivo: 'Altitude de origem para o Anexo C, profundidade das paradas em altitude. O crédito do descanso na altitude segue orientação do usuário (INT-12), sem texto da fonte.' },
    { id: 'AUS-05', item: 'Velocidades de subida (NOAA) e descida', motivo: 'Apenas a ITO define 18 m/min como máxima de subida.' },
    { id: 'AUS-06', item: 'Descompressão omitida e subida de emergência em relação às tabelas', motivo: 'Não há procedimento nas fontes.' },
    { id: 'AUS-07', item: 'Deslocamento em altitude/voo após o mergulho', motivo: 'ITO 9.6.1 r cita o risco, sem regra ou tabela.' },
    { id: 'AUS-08', item: 'Correções para água doce, frio ou esforço', motivo: 'Não constam nas fontes; nenhuma correção é aplicada.' },
    { id: 'AUS-09', item: 'Exemplos resolvidos oficiais das tabelas', motivo: 'Necessários para validação independente; os testes atuais usam casos derivados célula a célula.' },
    { id: 'AUS-10', item: 'Decisão normativa do CBMMG sobre as interpretações INT-*', motivo: 'Até a validação, elas permanecem marcadas como pendentes em todos os resultados.' }
  ];

  // ------------------------------------------------------------------ Utilitários
  function r1(x) { return Math.round(x * 10) / 10; }
  function isNum(x) { return typeof x === 'number' && isFinite(x); }
  function isInt(x) { return isNum(x) && Math.floor(x) === x; }
  function fmt1(x) { return isNum(x) ? r1(x).toFixed(1).replace('.', ',') : '—'; }

  function hm2min(s) {
    if (s === null || s === undefined) return null;
    var m = String(s).trim().match(/^(\d{0,2}):(\d{2})$/);
    if (!m) return null;
    var h = m[1] === '' ? 0 : parseInt(m[1], 10), mm = parseInt(m[2], 10);
    if (mm > 59) return null;
    return h * 60 + mm;
  }
  function min2hm(t) {
    if (!isNum(t)) return '—';
    var neg = t < 0; t = Math.abs(Math.round(t));
    var h = Math.floor(t / 60), m = t % 60;
    return (neg ? '-' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  }
  function clock(t) { // minutos desde 00:00 -> HH:MM (mod 24h)
    if (!isNum(t)) return '—';
    var x = ((Math.round(t) % 1440) + 1440) % 1440;
    var h = Math.floor(x / 60), m = x % 60;
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  }
  function durTxt(minutes) { // 1,7 -> "1 min 42 s"
    if (!isNum(minutes)) return '—';
    var s = Math.round(minutes * 60), m = Math.floor(s / 60), r = s % 60;
    if (m === 0) return r + ' s';
    return m + ' min' + (r ? ' ' + r + ' s' : '');
  }
  function parseRange(str) {
    var p = str.split('-');
    return [hm2min(p[0]), hm2min(p[1])];
  }
  function gIdx(g) { return D.GROUPS.indexOf(g); }

  function dataHash() { // FNV-1a 32 bits sobre os dados tabulares
    var s = JSON.stringify([D.T1, D.T2_ROWS, D.T3, D.ALT_COLS, D.ALT_ROWS, D.ALT_GROUP, D.DEPTHS_M, D.T1_STOP_DEPTH_M]);
    var h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return ('00000000' + h.toString(16)).slice(-8).toUpperCase();
  }

  function Tracer() { this.steps = []; this.rules = {}; }
  Tracer.prototype.add = function (rule, origem, texto, valor) {
    this.steps.push({ rule: rule, origem: origem, texto: texto, valor: valor === undefined ? null : valor });
    if (rule) this.rules[rule] = true;
  };
  function alert(level, text, rule) { return { level: level, text: text, rule: rule || null }; }

  // ------------------------------------------------------------------ Consultas de tabela
  /** Anexo B: profundidade corrigida pela altitude. */
  function adjustDepth(realDepth, altitude) {
    var out = { ok: false, errors: [], trace: new Tracer() };
    if (!isNum(realDepth) || realDepth <= 0) { out.errors.push('Profundidade real deve ser um número maior que zero.'); return out; }
    if (!isNum(altitude) || altitude < 0) { out.errors.push('Altitude deve ser um número igual ou maior que zero.'); return out; }
    var maxAlt = D.ALT_COLS[D.ALT_COLS.length - 1];
    if (altitude > maxAlt + EPS) { out.errors.push('Altitude acima de ' + fmt1(maxAlt) + ' m: fora do Anexo B.'); return out; }
    var maxDepth = D.ALT_ROWS[D.ALT_ROWS.length - 1][0];
    if (realDepth > maxDepth + EPS) { out.errors.push('Profundidade real acima de ' + fmt1(maxDepth) + ' m: fora do Anexo B.'); return out; }
    var col = 0; while (D.ALT_COLS[col] < altitude - EPS) col++;
    var row = 0; while (D.ALT_ROWS[row][0] < realDepth - EPS) row++;
    var val = D.ALT_ROWS[row][1][col];
    if (val === null) { out.errors.push('O Anexo B não tem valor para ' + fmt1(D.ALT_ROWS[row][0]) + ' m a ' + fmt1(D.ALT_COLS[col]) + ' m de altitude.'); return out; }
    if (Math.abs(D.ALT_ROWS[row][0] - realDepth) > EPS || Math.abs(D.ALT_COLS[col] - altitude) > EPS)
      out.trace.add('INT-01', 'INT', 'Valores não tabelados arredondados para cima: profundidade ' + fmt1(realDepth) + ' → linha ' + fmt1(D.ALT_ROWS[row][0]) + ' m; altitude ' + Math.round(altitude) + ' → coluna ' + fmt1(D.ALT_COLS[col]) + ' m.');
    out.trace.add('NOAA-B', 'NOAA', 'Anexo B: linha ' + fmt1(D.ALT_ROWS[row][0]) + ' m × coluna ' + fmt1(D.ALT_COLS[col]) + ' m → profundidade corrigida ' + fmt1(val) + ' m.', val);
    out.ok = true; out.adjusted = val; out.row = row; out.col = col;
    out.rowDepth = D.ALT_ROWS[row][0]; out.colAlt = D.ALT_COLS[col];
    return out;
  }

  /** Anexo C: grupo de entrada por altitude. */
  function altitudeGroup(altitude) {
    var out = { ok: false, errors: [], trace: new Tracer() };
    if (!isNum(altitude) || altitude < 0) { out.errors.push('Altitude inválida.'); return out; }
    var last = D.ALT_GROUP[D.ALT_GROUP.length - 1][0];
    if (altitude > last + EPS) { out.errors.push('Altitude acima de ' + last + ' m: fora do Anexo C.'); return out; }
    var i = 0; while (D.ALT_GROUP[i][0] < altitude - EPS) i++;
    if (Math.abs(D.ALT_GROUP[i][0] - altitude) > EPS)
      out.trace.add('INT-01', 'INT', 'Altitude ' + Math.round(altitude) + ' m arredondada para a linha ' + D.ALT_GROUP[i][0] + ' m do Anexo C.');
    out.trace.add('ITO-C', 'ITO', 'Anexo C: ' + D.ALT_GROUP[i][0] + ' m → grupo repetitivo de entrada ' + D.ALT_GROUP[i][1] + '.', D.ALT_GROUP[i][1]);
    out.ok = true; out.group = D.ALT_GROUP[i][1]; out.rowAlt = D.ALT_GROUP[i][0];
    return out;
  }

  function depthIndex(depthAdj) {
    var i = 0; while (i < D.DEPTHS_M.length && D.DEPTHS_M[i] < depthAdj - EPS) i++;
    return i < D.DEPTHS_M.length ? i : -1;
  }

  /** Tabela 1: grupo / limite / parada para um tempo (TF ou TFE). */
  function t1Lookup(depthAdj, time, repetitive) {
    var out = { ok: false, errors: [], trace: new Tracer() };
    if (!isNum(depthAdj) || depthAdj <= 0) { out.errors.push('Profundidade inválida para a Tabela 1.'); return out; }
    if (!isInt(time) || time < 1) { out.errors.push('Tempo de fundo deve ser um número inteiro de minutos (≥ 1).'); return out; }
    var ri = depthIndex(depthAdj);
    if (ri < 0) { out.errors.push('Profundidade corrigida ' + fmt1(depthAdj) + ' m excede 39,6 m: fora da Tabela 1 (mergulho técnico – ITO 3.42 / nível 4).'); return out; }
    if (depthAdj < D.DEPTHS_M[0] - EPS) {
      out.trace.add(repetitive ? 'NOAA-T3-12' : 'INT-07', repetitive ? 'NOAA' : 'INT', 'Profundidade ' + fmt1(depthAdj) + ' m inferior a 12,2 m → usada a linha de 12,2 m.');
    } else if (Math.abs(D.DEPTHS_M[ri] - depthAdj) > EPS) {
      out.trace.add('INT-01', 'INT', 'Profundidade ' + fmt1(depthAdj) + ' m não tabelada → linha imediatamente superior ' + fmt1(D.DEPTHS_M[ri]) + ' m (' + D.DEPTHS_FT[ri] + ' pés).');
    }
    var row = D.T1[ri];
    out.rowIdx = ri; out.rowDepth = D.DEPTHS_M[ri]; out.rowFt = D.DEPTHS_FT[ri]; out.ndl = row.ndl;
    var ci = -1, cell = null;
    for (var c = 0; c < row.cells.length; c++) {
      var v = row.cells[c]; if (v === null) continue;
      var bt = (typeof v === 'number') ? v : v.bt;
      if (bt >= time) { ci = c; cell = v; break; }
    }
    if (ci < 0) {
      var lastVal = null; for (var k = row.cells.length - 1; k >= 0; k--) if (row.cells[k] !== null) { lastVal = typeof row.cells[k] === 'number' ? row.cells[k] : row.cells[k].bt; break; }
      out.errors.push('Tempo ' + time + ' min excede a maior entrada da Tabela 1 para ' + fmt1(D.DEPTHS_M[ri]) + ' m (' + lastVal + ' min): fora da tabela.');
      out.outOfTable = true; return out;
    }
    out.ok = true; out.colIdx = ci; out.group = D.GROUPS[ci];
    out.cellTime = typeof cell === 'number' ? cell : cell.bt;
    out.withinNDL = time <= row.ndl;
    if (Math.abs(out.cellTime - time) > EPS)
      out.trace.add('INT-01', 'INT', 'Tempo ' + time + ' min não tabelado → célula imediatamente superior (' + out.cellTime + ' min).');
    if (typeof cell === 'number') {
      out.deco = null;
      out.trace.add('NOAA-T1', 'NOAA', 'Tabela 1: ' + fmt1(D.DEPTHS_M[ri]) + ' m / ' + out.cellTime + ' min → grupo ' + out.group + '. Limite sem parada nesta linha: ' + row.ndl + ' min.', out.group);
    } else {
      out.deco = { depth: D.T1_STOP_DEPTH_M, minutes: cell.stop };
      out.trace.add('NOAA-T1-DECO', 'NOAA', 'Tabela 1: ' + fmt1(D.DEPTHS_M[ri]) + ' m / ' + cell.bt + ' min → parada descompressiva de ' + cell.stop + ' min a 6,1 m; grupo ' + out.group + '. Limite sem parada: ' + row.ndl + ' min.', out.group);
    }
    return out;
  }

  /** Tabela 2: novo grupo após intervalo de superfície. */
  function t2Lookup(group, si) {
    var out = { ok: false, errors: [], trace: new Tracer() };
    var gi = gIdx(group);
    if (gi < 0) { out.errors.push('Grupo de repetição inválido: ' + group + '.'); return out; }
    if (!isInt(si) || si < 0) { out.errors.push('Intervalo de superfície deve ser um número inteiro de minutos (≥ 0).'); return out; }
    out.ok = true;
    if (si < MIN_SI_MIN) {
      out.kind = 'unico';
      out.trace.add('ITO-3.32', 'ITO', 'IS de ' + si + ' min (< 10 min): equivale a um mergulho único.');
      return out;
    }
    if (si > MAX_SI_MIN) {
      out.kind = 'novo'; out.group = null;
      out.trace.add('ITO-3.32', 'ITO', 'IS de ' + min2hm(si) + ' (> 15h50): novo mergulho, sem nitrogênio residual da tabela; adotar novo planejamento.');
      return out;
    }
    for (var hi = gi; hi >= 0; hi--) {
      var h = D.GROUPS[hi];
      var rng = parseRange(D.T2_ROWS[h][gi - hi]);
      if (si >= rng[0] && si <= rng[1]) {
        out.kind = 'grupo'; out.group = h; out.range = rng;
        out.trace.add('NOAA-T2', 'NOAA', 'Tabela 2: coluna ' + group + ', IS ' + min2hm(si) + ' na faixa ' + min2hm(rng[0]) + '–' + min2hm(rng[1]) + ' → novo grupo ' + h + '.', h);
        return out;
      }
    }
    var lastMax = parseRange(D.T2_ROWS.A[gi])[1];
    out.kind = 'grupo'; out.group = 'A'; out.range = [lastMax + 1, MAX_SI_MIN]; out.beyondColumn = true;
    out.trace.add('INT-03', 'INT', 'IS ' + min2hm(si) + ' excede o último valor da coluna ' + group + ' (' + min2hm(lastMax) + ') mas não 15h50 → mantido o grupo A.', 'A');
    return out;
  }

  /**
   * Grupo após o tempo de descanso no local (altitude), antes do 1º mergulho.
   * kind: 'sem-credito' (< 10 min: mantém o grupo do Anexo C), 'grupo' (Tabela 2), 'novo' (> 15h50: sem residual).
   */
  function altitudeRest(group, rest) {
    var out = { ok: true, trace: new Tracer(), kind: null, group: group };
    if (rest < MIN_SI_MIN) {
      out.kind = 'sem-credito';
      out.trace.add('INT-12', 'INT', 'Descanso de ' + rest + ' min (< 10 min, início da Tabela 2): mantido o grupo ' + group + ' do Anexo C.');
      return out;
    }
    var t2 = t2Lookup(group, rest);
    merge(out.trace, t2.trace);
    out.kind = t2.kind; out.group = t2.kind === 'grupo' ? t2.group : null; out.beyondColumn = !!t2.beyondColumn;
    out.trace.add('INT-12', 'INT', 'Descanso no local creditado pela Tabela 2 a partir do grupo de altitude ' + group + (out.group ? ' → grupo ' + out.group : ' → sem nitrogênio residual') + '.');
    return out;
  }

  /** Tabela 3: TNR e ajuste (TF máximo) do mergulho repetitivo. */
  function t3Lookup(group, depthAdj) {
    var out = { ok: false, errors: [], trace: new Tracer() };
    var gi = gIdx(group);
    if (gi < 0) { out.errors.push('Grupo inválido.'); return out; }
    var ci = depthIndex(depthAdj);
    if (ci < 0) { out.errors.push('Profundidade corrigida ' + fmt1(depthAdj) + ' m excede 39,6 m: fora da Tabela 3.'); return out; }
    if (depthAdj < D.DEPTHS_M[0] - EPS) out.trace.add('NOAA-T3-12', 'NOAA', 'Profundidade ' + fmt1(depthAdj) + ' m < 12,2 m → parâmetros de 12,2 m.');
    else if (Math.abs(D.DEPTHS_M[ci] - depthAdj) > EPS) out.trace.add('INT-01', 'INT', 'Profundidade ' + fmt1(depthAdj) + ' m → coluna imediatamente superior ' + fmt1(D.DEPTHS_M[ci]) + ' m.');
    out.colIdx = ci; out.colDepth = D.DEPTHS_M[ci];
    var cell = D.T3[group][ci];
    if (!cell) {
      out.errors.push('A Tabela 3 não tem entrada para o grupo ' + group + ' a ' + fmt1(D.DEPTHS_M[ci]) + ' m (célula cinza): não há mergulho repetitivo sem parada nesta condição.');
      out.trace.add('NOAA-T3', 'NOAA', 'Tabela 3: grupo ' + group + ' × ' + fmt1(D.DEPTHS_M[ci]) + ' m → sem valor (célula cinza).');
      out.noEntry = true; return out;
    }
    out.ok = true; out.tnr = cell[0]; out.abt = cell[1];
    out.trace.add('NOAA-T3', 'NOAA', 'Tabela 3: grupo ' + group + ' × ' + fmt1(D.DEPTHS_M[ci]) + ' m → TNR ' + cell[0] + ' min; TF máximo do mergulho repetitivo ' + cell[1] + ' min.', cell);
    return out;
  }

  /** Opções de IS para o próximo mergulho: cada faixa de IS → grupo → TF máximo. */
  function siOptions(group, depthAdj) {
    var gi = gIdx(group), opts = [];
    if (gi < 0) return opts;
    for (var hi = gi; hi >= 0; hi--) {
      var h = D.GROUPS[hi];
      var rng = parseRange(D.T2_ROWS[h][gi - hi]);
      var c = t3Lookup(h, depthAdj);
      opts.push({ from: rng[0], to: rng[1], group: h, tnr: c.ok ? c.tnr : null, maxBT: c.ok ? c.abt : null, rule: 'NOAA-T2/NOAA-T3' });
    }
    var lastMax = parseRange(D.T2_ROWS.A[gi])[1];
    if (lastMax < MAX_SI_MIN) {
      var cA = t3Lookup('A', depthAdj);
      opts.push({ from: lastMax + 1, to: MAX_SI_MIN, group: 'A', tnr: cA.ok ? cA.tnr : null, maxBT: cA.ok ? cA.abt : null, rule: 'INT-03' });
    }
    var ri = depthIndex(depthAdj);
    opts.push({ from: MAX_SI_MIN + 1, to: null, group: null, tnr: 0, maxBT: ri >= 0 ? D.T1[ri].ndl : null, rule: 'ITO-3.32' });
    return opts;
  }

  /** IS mínimo para permitir um TF desejado no próximo mergulho. */
  function requiredSI(group, depthAdj, bt) {
    var opts = siOptions(group, depthAdj);
    for (var i = 0; i < opts.length; i++) {
      if (opts[i].maxBT !== null && opts[i].maxBT >= bt) return { ok: true, minSI: opts[i].from, group: opts[i].group, maxBT: opts[i].maxBT, rule: opts[i].rule };
    }
    return { ok: false, reason: 'O TF desejado excede o limite sem parada da Tabela 1 mesmo sem nitrogênio residual.' };
  }

  // ------------------------------------------------------------------ Gás
  function pAbs(depth) { return 1 + depth / 10; } // INT-05

  function autonomy(p) {
    var out = { ok: false, errors: [], alerts: [], trace: new Tracer() };
    if (!isNum(p.volL) || p.volL <= 0) out.errors.push('Volume do cilindro inválido.');
    if (!isNum(p.pIni) || p.pIni <= 0) out.errors.push('Pressão inicial inválida.');
    if (!isNum(p.tcs) || p.tcs <= 0) out.errors.push('Informe a TCS medida do mergulhador (L/min) para calcular a autonomia.');
    if (!isNum(p.depth) || p.depth <= 0) out.errors.push('Profundidade inválida para autonomia.');
    if (out.errors.length) return out;
    if (p.pIni < START_BAR) out.alerts.push(alert('atencao', 'Pressão inicial de ' + p.pIni + ' bar: a ITO determina iniciar os mergulhos com 200 bar.', 'ITO-3.6'));
    if (p.pIni > START_BAR) out.alerts.push(alert('atencao', 'Pressão inicial acima de 200 bar (pressão máxima de trabalho do S80 – ITO 3.17). Confira o valor.', 'ITO-3.17'));
    var usable = p.pIni - RESERVE_BAR;
    if (usable <= 0) { out.errors.push('Pressão inicial não supera a reserva de 50 bar: não há ar utilizável.'); return out; }
    var pa = pAbs(p.depth);
    var exact = (p.volL * usable) / (p.tcs * pa);
    out.ok = true; out.exact = exact; out.minutes = Math.floor(exact + EPS); out.pAbs = pa; out.usable = usable;
    out.trace.add('ITO-3.6', 'ITO', 'Ar utilizável = ' + p.pIni + ' − 50 (reserva) = ' + usable + ' bar.');
    out.trace.add('INT-05', 'INT', 'Pressão absoluta a ' + fmt1(p.depth) + ' m = 1 + ' + fmt1(p.depth) + '/10 = ' + pa.toFixed(2).replace('.', ',') + ' ATA.');
    out.trace.add('ITO-3.6', 'ITO', 'Autonomia = ' + String(p.volL).replace('.', ',') + ' L × ' + usable + ' bar ÷ (' + String(p.tcs).replace('.', ',') + ' L/min × ' + pa.toFixed(2).replace('.', ',') + ') = ' + exact.toFixed(2).replace('.', ',') + ' min.');
    out.trace.add('INT-06', 'INT', 'Autonomia considerada: ' + out.minutes + ' min (arredondada para baixo).', out.minutes);
    return out;
  }

  function tcsCalc(p) {
    var out = { ok: false, errors: [], trace: new Tracer() };
    if (!isNum(p.deltaBar) || p.deltaBar <= 0) out.errors.push('Consumo em bar deve ser maior que zero.');
    if (!isNum(p.volL) || p.volL <= 0) out.errors.push('Volume do cilindro inválido.');
    if (!isNum(p.depth) || p.depth < 0) out.errors.push('Profundidade da aferição inválida.');
    if (!isNum(p.minutes) || p.minutes <= 0) out.errors.push('Tempo de aferição deve ser maior que zero.');
    if (out.errors.length) return out;
    var pa = pAbs(p.depth);
    var litros = p.deltaBar * p.volL / pa;
    out.ok = true; out.value = litros / p.minutes; out.litros = litros; out.pAbs = pa;
    out.trace.add('INT-05', 'INT', 'Pressão absoluta a ' + fmt1(p.depth) + ' m = ' + pa.toFixed(2).replace('.', ',') + ' ATA.');
    out.trace.add('ITO-3.61', 'ITO', 'TCS = (' + p.deltaBar + ' bar × ' + String(p.volL).replace('.', ',') + ' L ÷ ' + pa.toFixed(2).replace('.', ',') + ') ÷ ' + p.minutes + ' min = ' + out.value.toFixed(1).replace('.', ',') + ' L/min.', out.value);
    return out;
  }

  // ------------------------------------------------------------------ Equipe (ITO 12, item 4 / Quadro 1 / Figura 5)
  function teamLevel(p) {
    var reasons = [], rules = {}, level = 1, alerts = [];
    function up(l, why, rule) { if (l > level) level = l; reasons.push(why); rules[rule] = true; }
    var depth = p.realDepth;
    if (!isNum(depth) || depth <= 0) return { ok: false, errors: ['Profundidade real inválida.'] };
    if (depth > 8) up(2, 'Profundidade real acima de 8 m.', 'ITO-Q1');
    if (depth > 18) up(3, 'Profundidade real acima de 18 m (mergulho profundo).', 'ITO-3.41');
    if (depth > 30) up(4, 'Profundidade real acima de 30 m (mergulho técnico).', 'ITO-3.42');
    if (p.deco) up(4, 'Condição descompressiva / exposição excepcional.', 'ITO-4.4');
    if (p.confined) up(4, 'Ambiente confinado ou com teto.', 'ITO-4.4');
    if (p.water === 'impropria') up(3, 'Águas impróprias/contaminadas (roupa seca e full face).', 'ITO-FIG5');
    if (p.water === 'desconhecida') alerts.push(alert('atencao', 'Balneabilidade desconhecida: confirmar antes do empenho; em águas contaminadas, isolamento corporal completo (roupa seca e full face) – ITO 7.4 d.', 'ITO-FIG5'));
    if (p.operation === 'cadaver' && isNum(p.hours) && p.hours >= 18) up(3, 'Recuperação de cadáver com 18 h ou mais desde a notificação (potencial de contaminação).', 'ITO-5');
    if (p.dangerous && level < 2) up(2, 'Condições perigosas: a equipe nível 1 não pode operar (ITO 4.1.1).', 'ITO-3.16');
    if ((depth > 8 && depth < 9) || (depth > 18 && depth < 19)) alerts.push(alert('atencao', 'Profundidade entre as faixas do Quadro 1 e do texto do item 4 (ver DIV-03).', 'ITO-Q1'));
    if (p.water === 'impropria' && depth <= 18 && level === 3 && !p.deco && !p.confined)
      alerts.push(alert('info', 'Até 18 m em águas impróprias, o mergulho pode ser executado por militar credenciado com treinamento específico para roupa seca (ITO 4.3.1).', 'ITO-4.3.1'));
    var minTeam = level === 1 ? (p.remote || p.dangerous ? 4 : 3) : (level === 4 ? null : 4);
    rules['ITO-4'] = true;
    var qual = {
      1: 'Mergulhadores: curso de formação (60 h/a). Supervisor/guia: credenciamento.',
      2: 'Mergulhadores: credenciamento. Supervisor/guia: qualificação.',
      3: 'Toda a equipe: qualificação e treinamento para uso de roupa seca.',
      4: 'Toda a equipe: qualificação + curso de mergulho técnico. Acionamento pelo CEB via COB.'
    }[level];
    return { ok: true, level: level, minTeam: minTeam, qual: qual, reasons: reasons, rules: Object.keys(rules), alerts: alerts };
  }

  // ------------------------------------------------------------------ Perfil
  function buildProfile(realDepth, bt, stops, ascentRate, descentRate) {
    var pts = [{ t: 0, d: 0, phase: 'inicio' }];
    var tDesc = Math.min(realDepth / descentRate, bt);
    pts.push({ t: tDesc, d: realDepth, phase: 'descida' });
    pts.push({ t: bt, d: realDepth, phase: 'fundo' });
    var t = bt, cur = realDepth, segs = [];
    segs.push({ phase: 'descida', t0: 0, t1: tDesc, d0: 0, d1: realDepth });
    segs.push({ phase: 'fundo', t0: tDesc, t1: bt, d0: realDepth, d1: realDepth });
    stops.forEach(function (s) {
      if (s.depth >= cur) return;
      var tt = (cur - s.depth) / ascentRate;
      segs.push({ phase: 'subida', t0: t, t1: t + tt, d0: cur, d1: s.depth });
      t += tt; cur = s.depth;
      pts.push({ t: t, d: cur, phase: 'subida' });
      segs.push({ phase: 'parada', t0: t, t1: t + s.minutes, d0: cur, d1: cur, label: s.label, kind: s.kind, minutes: s.minutes, rule: s.rule });
      t += s.minutes;
      pts.push({ t: t, d: cur, phase: 'parada' });
    });
    var tf = cur / ascentRate;
    segs.push({ phase: 'subida', t0: t, t1: t + tf, d0: cur, d1: 0 });
    t += tf; pts.push({ t: t, d: 0, phase: 'superficie' });
    return { points: pts, segments: segs, total: t, descentTime: tDesc };
  }

  // ------------------------------------------------------------------ Mergulho único
  /**
   * p: { realDepth, bt, altitude, preGroup, preGroupRule, ascentRate, descentRate, startMin, endMin }
   */
  function computeDive(p) {
    var tr = new Tracer(), alerts = [], errors = [];
    var res = { input: p, trace: tr, alerts: alerts, errors: errors, status: 'bloqueio' };
    tr.add(null, 'USUARIO', 'Profundidade real ' + fmt1(p.realDepth) + ' m; TF ' + p.bt + ' min; altitude ' + (isNum(p.altitude) ? Math.round(p.altitude) : '—') + ' m' + (p.preGroup ? '; grupo anterior ' + p.preGroup : '') + '.');
    if (!isInt(p.bt) || p.bt < 1) errors.push('Tempo de fundo deve ser um número inteiro de minutos (≥ 1).');
    var asc = isNum(p.ascentRate) ? p.ascentRate : MAX_ASCENT;
    if (!(asc > 0)) errors.push('Velocidade de subida inválida.');
    if (asc > MAX_ASCENT + EPS) errors.push('Velocidade de subida acima de 18 m/min (máximo da ITO 3.63).');
    var desc = isNum(p.descentRate) && p.descentRate > 0 ? p.descentRate : null;
    if (!desc) errors.push('Velocidade de descida (ilustrativa) inválida.');
    var adj = adjustDepth(p.realDepth, p.altitude);
    merge(tr, adj.trace); errors.push.apply(errors, adj.errors);
    if (errors.length) return res;
    res.adjusted = adj.adjusted; res.adjustedRowDepth = adj.rowDepth; res.adjustedColAlt = adj.colAlt;
    tr.add('ITO-7.1', 'ITO', 'Limites e autonomia calculados com a profundidade corrigida (' + fmt1(adj.adjusted) + ' m); escolha da equipe pela profundidade real.');

    // Nitrogênio residual (mergulho repetitivo ou grupo de altitude)
    var tfe = p.bt;
    res.repetitive = !!p.preGroup;
    if (p.preGroup) {
      var t3 = t3Lookup(p.preGroup, adj.adjusted);
      merge(tr, t3.trace);
      if (!t3.ok) { errors.push.apply(errors, t3.errors); return res; }
      res.tnr = t3.tnr; res.maxBT = t3.abt;
      tfe = t3.tnr + p.bt;
      tr.add('NOAA-TFE', 'NOAA', 'TFE = TNR ' + t3.tnr + ' + PTF ' + p.bt + ' = ' + tfe + ' min.', tfe);
      if (p.bt > t3.abt) alerts.push(alert('bloqueio', 'TF de ' + p.bt + ' min excede o ajuste da Tabela 3 (' + t3.abt + ' min): "o próximo mergulho não deve exceder esse tempo".', 'NOAA-T3'));
    }
    res.tfe = tfe;

    var t1 = t1Lookup(adj.adjusted, tfe, !!p.preGroup);
    merge(tr, t1.trace);
    res.table1 = t1.ok || t1.rowDepth ? { rowDepth: t1.rowDepth, rowFt: t1.rowFt, ndl: t1.ndl, colIdx: t1.colIdx, cellTime: t1.cellTime } : null;
    if (!t1.ok) {
      errors.push.apply(errors, t1.errors);
      alerts.push(alert('bloqueio', 'Fora das tabelas fornecidas: não há resultado válido. Exposição excepcional / mergulho técnico (nível 4).', 'ITO-3.25'));
      return res;
    }
    res.group = t1.group; res.ndl = t1.ndl;
    if (!p.preGroup) res.maxBT = t1.ndl;

    // Paradas
    var stops = [];
    if (t1.deco) {
      stops.push({ depth: t1.deco.depth, minutes: t1.deco.minutes, kind: 'deco', label: 'Parada descompressiva NOAA', rule: 'NOAA-T1-DECO' });
      alerts.push(alert('bloqueio', 'Limite sem parada excedido (TFE ' + tfe + ' > ' + t1.ndl + ' min). Exposição excepcional: a NOAA exige ' + t1.deco.minutes + ' min a 6,1 m. Pela ITO, mergulho descompressivo só com equipe nível 4 (CEB).', 'ITO-4.4'));
      if (isNum(p.altitude) && p.altitude > 304.8) alerts.push(alert('atencao', 'Parada descompressiva em altitude: as fontes não definem correção da profundidade de parada (AUS-04).', 'INT-01'));
    }
    var deep = p.realDepth > 18 + EPS, deepAdj = adj.adjusted > 18 + EPS;
    if (deep || deepAdj) {
      stops.push({ depth: 5, minutes: 3, kind: 'seguranca', label: 'Parada de segurança ITO', rule: 'ITO-3.46' });
      tr.add('ITO-3.46', 'ITO', 'Mergulho acima de 18 m: parada de 3 min a 5 m.');
      if (!deep && deepAdj) tr.add('INT-09', 'INT', 'Profundidade real ≤ 18 m, mas corrigida > 18 m: parada aplicada de forma conservadora.');
      if (t1.deco) alerts.push(alert('atencao', 'Parada NOAA (6,1 m) e parada ITO (5 m) aplicadas em sequência; a combinação não é definida nas fontes (DIV-07).', 'ITO-3.46'));
    }
    stops.sort(function (a, b) { return b.depth - a.depth; });
    res.stops = stops;

    var prof = buildProfile(p.realDepth, p.bt, stops, asc, desc);
    tr.add('INT-10', 'INT', 'Gráfico: descida ilustrativa a ' + desc + ' m/min.');
    res.profile = prof;
    var stopMin = stops.reduce(function (s, x) { return s + x.minutes; }, 0);
    res.ascentTravel = p.realDepth / asc;
    res.ttd = res.ascentTravel + stopMin;
    res.totalTime = p.bt + res.ttd;
    tr.add('ITO-3.63', 'ITO', 'Subida a ' + asc + ' m/min: deslocamento ' + durTxt(res.ascentTravel) + ' + paradas ' + stopMin + ' min = TTD ' + durTxt(res.ttd) + '.', res.ttd);
    tr.add(null, 'CALC', 'Tempo total do mergulho = TF ' + p.bt + ' + TTD ' + durTxt(res.ttd) + ' = ' + durTxt(res.totalTime) + '.', res.totalTime);
    if (prof.descentTime >= p.bt - EPS) alerts.push(alert('atencao', 'TF menor ou igual ao tempo de descida ilustrativo: confira o TF (inclui a descida – ITO 3.62).', 'ITO-3.62'));

    // Horários
    if (isNum(p.startMin)) {
      res.leaveBottom = p.startMin + p.bt;
      res.surfaceMin = p.startMin + res.totalTime;
      if (p.startMin < 8 * 60) alerts.push(alert('info', 'Início antes das 8h: via de regra as operações iniciam às 8h (ITO 6).', 'ITO-6'));
      if (isNum(p.endMin)) {
        var real = p.endMin - p.startMin; if (real < 0) real += 1440;
        res.realTotal = real;
        if (real + EPS < res.totalTime) alerts.push(alert('atencao', 'Horário de término informado (' + clock(p.endMin) + ') é anterior ao mínimo calculado (' + clock(res.surfaceMin) + ') com a subida e as paradas previstas.', 'ITO-3.63'));
        res.surfaceMin = Math.max(res.surfaceMin, p.startMin + real);
      }
    }

    // Status
    var hasBlock = alerts.some(function (a) { return a.level === 'bloqueio'; });
    res.status = hasBlock ? (t1.deco ? 'excepcional' : 'bloqueio') : 'ok';
    function near(d, lim) { return d === 0 ? 'TF igual ao ' + lim + ': sem margem.' : 'TF a ' + d + ' min do ' + lim + '.'; }
    if (!hasBlock && p.preGroup && res.maxBT - p.bt <= 2) alerts.push(alert('atencao', near(res.maxBT - p.bt, 'limite da Tabela 3'), 'NOAA-T3'));
    if (!hasBlock && !p.preGroup && t1.ndl - p.bt <= 2) alerts.push(alert('atencao', near(t1.ndl - p.bt, 'limite sem parada'), 'NOAA-T1'));
    if (p.realDepth > 18) alerts.push(alert('info', 'Mergulho profundo (> 18 m): atenção à narcose; contato prévio com unidade de saúde com câmara hiperbárica (ITO 9.4).', 'ITO-3.41'));

    // Contingência (exposição excepcional) — ITO 7.8 h
    var row = D.T1[t1.rowIdx];
    res.contingency = row.cells.map(function (c, i) { return c && typeof c === 'object' ? { bt: c.bt, stop: c.stop, group: D.GROUPS[i] } : null; }).filter(Boolean);
    return res;
  }

  function merge(tr, other) { other.steps.forEach(function (s) { tr.add(s.rule, s.origem, s.texto, s.valor); }); }

  // ------------------------------------------------------------------ Série de mergulhos
  /**
   * s: { altitude, travelGain, manualGroup, manualSI, ascentRate, descentRate,
   *      dives: [{ realDepth, bt, si, start, end }] }  (si = IS antes do mergulho, k ≥ 1)
   */
  function computeSeries(s) {
    var out = { dives: [], alerts: [], errors: [], trace: new Tracer() };
    if (!s.dives || !s.dives.length) { out.errors.push('Nenhum mergulho informado.'); return out; }
    if (!isNum(s.altitude)) { out.errors.push('Informe a altitude do local (m).'); return out; }

    // Grupo inicial
    var pre = null, preRule = null, candidates = [];
    if (s.travelGain) {
      // gainAltitude: diferença de altitude vencida no deslocamento (Anexo C); sem ela usa a altitude do local.
      var ag = altitudeGroup(isNum(s.gainAltitude) ? s.gainAltitude : s.altitude);
      merge(out.trace, ag.trace);
      if (!ag.ok) { out.errors.push.apply(out.errors, ag.errors); return out; }
      out.altitudeGroup = ag.group;
      if (isInt(s.altRest) && s.altRest >= 0) {
        // Tempo de descanso no local antes do 1º mergulho: creditado pela Tabela 2 a partir do grupo do Anexo C.
        var rt = altitudeRest(ag.group, s.altRest);
        merge(out.trace, rt.trace);
        out.restGroup = rt.group; out.restKind = rt.kind;
        if (rt.group) candidates.push({ g: rt.group, rule: rt.kind === 'grupo' ? 'NOAA-T2' : 'ITO-C' });
      } else {
        candidates.push({ g: ag.group, rule: 'ITO-C' });
        out.trace.add('INT-04', 'INT', 'Grupo de altitude ' + ag.group + ' aplicado antes do 1º mergulho, sem crédito do tempo na altitude (descanso não informado).');
      }
    }
    if (s.manualGroup) {
      if (gIdx(s.manualGroup) < 0) { out.errors.push('Grupo informado inválido.'); return out; }
      if (!isInt(s.manualSI)) { out.errors.push('Informe o IS (min) desde o mergulho que gerou o grupo ' + s.manualGroup + '.'); return out; }
      var mt = t2Lookup(s.manualGroup, s.manualSI);
      merge(out.trace, mt.trace);
      if (!mt.ok) { out.errors.push.apply(out.errors, mt.errors); return out; }
      if (mt.kind === 'unico') { out.errors.push('IS inferior a 10 min após o mergulho anterior: registre-o na mesma série para combinar os mergulhos (ITO 3.32).'); return out; }
      if (mt.kind === 'grupo') candidates.push({ g: mt.group, rule: 'NOAA-T2' });
      if (mt.kind === 'grupo' && s.manualSI > 12 * 60) out.alerts.push(alert('atencao', 'IS acima de 12 h: ver divergência DIV-01 (ITO 3.60 × 3.32).', 'ITO-3.32'));
    }
    if (candidates.length) {
      candidates.sort(function (a, b) { return gIdx(b.g) - gIdx(a.g); });
      pre = candidates[0].g; preRule = candidates[0].rule;
      if (candidates.length > 1 && candidates[0].g !== candidates[1].g) out.trace.add('INT-11', 'INT', 'Grupos candidatos ' + candidates.map(function (c) { return c.g; }).join(' e ') + ' → adotado ' + pre + ' (maior).');
    }
    out.initialGroup = pre;

    var eff = []; // mergulhos efetivos (após combinações)
    var prevSurface = null;
    for (var k = 0; k < s.dives.length; k++) {
      var dv = s.dives[k];
      var startMin = hm2min(dv.start), endMin = hm2min(dv.end);
      var input = { realDepth: dv.realDepth, bt: dv.bt, altitude: s.altitude, ascentRate: s.ascentRate, descentRate: s.descentRate, startMin: startMin, endMin: endMin, index: k };
      var siUsed = null, siNote = null;
      if (k > 0) {
        var last = eff[eff.length - 1];
        if (!last || last.res.status === 'bloqueio' || !last.res.group) {
          out.dives.push({ index: k, blocked: true, errors: ['Mergulho anterior sem resultado válido: não é possível calcular este mergulho.'] });
          continue;
        }
        siUsed = isInt(dv.si) ? dv.si : null;
        if (isNum(startMin) && isNum(prevSurface)) {
          var calc = startMin - prevSurface; if (calc < 0) calc += 1440;
          calc = Math.floor(calc + EPS);
          if (siUsed === null) { siUsed = calc; siNote = 'IS calculado pelos horários.'; }
          else if (Math.abs(calc - siUsed) > 1) out.alerts.push(alert('atencao', 'Mergulho ' + (k + 1) + ': IS informado (' + siUsed + ' min) difere do IS pelos horários (' + calc + ' min). Usado o informado.', 'ITO-3.32'));
        }
        if (siUsed === null) { out.dives.push({ index: k, blocked: true, errors: ['Informe o intervalo de superfície (min) ou os horários de início dos mergulhos.'] }); continue; }
        var t2 = t2Lookup(last.res.group, siUsed);
        if (!t2.ok) { out.dives.push({ index: k, blocked: true, errors: t2.errors }); continue; }
        if (t2.kind === 'unico') {
          // INT-02: combinar com o mergulho efetivo anterior
          var li = last.input;
          var combined = { realDepth: Math.max(li.realDepth, dv.realDepth), bt: li.bt + siUsed + dv.bt, altitude: s.altitude, ascentRate: s.ascentRate, descentRate: s.descentRate, startMin: li.startMin, endMin: endMin, preGroup: li.preGroup, index: k };
          var cr = computeDive(combined);
          merge(cr.trace, t2.trace);
          cr.trace.add('INT-02', 'INT', 'Combinado com o mergulho ' + (li.index + 1) + ': prof. ' + fmt1(combined.realDepth) + ' m; TF ' + li.bt + ' + IS ' + siUsed + ' + ' + dv.bt + ' = ' + combined.bt + ' min.');
          eff[eff.length - 1] = { input: combined, res: cr, merged: true };
          out.dives.push({ index: k, mergedInto: li.index, si: siUsed, res: cr });
          prevSurface = isNum(cr.surfaceMin) ? cr.surfaceMin : null;
          continue;
        }
        input.preGroup = t2.group;
        var r = computeDive(input);
        var t2tr = new Tracer(); merge(t2tr, t2.trace); merge(t2tr, r.trace); r.trace = t2tr;
        if (t2.kind === 'grupo' && siUsed > 12 * 60) r.alerts.push(alert('atencao', 'IS acima de 12 h: ver DIV-01.', 'ITO-3.32'));
        if (siNote) r.trace.add(null, 'CALC', siNote, siUsed);
        r.si = siUsed; r.siGroup = t2.group; r.siKind = t2.kind;
        eff.push({ input: input, res: r });
        out.dives.push({ index: k, si: siUsed, res: r });
        prevSurface = isNum(r.surfaceMin) ? r.surfaceMin : null;
      } else {
        input.preGroup = pre; input.preGroupRule = preRule;
        var r0 = computeDive(input);
        eff.push({ input: input, res: r0 });
        out.dives.push({ index: 0, res: r0 });
        prevSurface = isNum(r0.surfaceMin) ? r0.surfaceMin : null;
      }
    }

    // Totais do dia (mergulhos efetivos)
    var sub = 0, valid = true;
    eff.forEach(function (e) { if (isNum(e.res.totalTime)) sub += e.res.totalTime; else valid = false; });
    out.effective = eff;
    out.submerged = valid ? sub : null;
    if (valid) {
      out.trace.add('ITO-7.10.7', 'ITO', 'Tempo submerso no dia: ' + durTxt(sub) + ' de 240 min.', sub);
      if (sub > DAILY_MAX_MIN) out.alerts.push(alert('bloqueio', 'Tempo submerso diário (' + Math.ceil(sub) + ' min) excede 240 min (ITO 7.10.7).', 'ITO-7.10.7'));
      else if (sub > DAILY_MAX_MIN - 30) out.alerts.push(alert('atencao', 'Tempo submerso diário próximo do limite: ' + Math.ceil(sub) + ' de 240 min.', 'ITO-7.10.7'));
    }
    var lastEff = eff[eff.length - 1];
    out.finalGroup = lastEff && lastEff.res.status !== 'bloqueio' ? lastEff.res.group : null;
    out.finalSurface = lastEff ? lastEff.res.surfaceMin : null;
    return out;
  }

  // ------------------------------------------------------------------ Plano
  /**
   * plan: série + { desiredBT por mergulho ('max' ou número), volL, pIni, tcs, conditions }
   * Gera TF proposto = min(desejado, limite da tabela, autonomia) e recalcula a série.
   */
  function computePlan(plan) {
    var proposed = [], group = null;
    // grupo inicial igual ao da série
    var seed = computeSeries({ altitude: plan.altitude, travelGain: plan.travelGain, manualGroup: plan.manualGroup, manualSI: plan.manualSI, ascentRate: plan.ascentRate, descentRate: plan.descentRate, dives: [{ realDepth: plan.dives[0] ? plan.dives[0].realDepth : 1, bt: 1 }] });
    if (seed.errors.length) return { ok: false, errors: seed.errors };
    group = seed.initialGroup;
    var perDive = [];
    for (var k = 0; k < plan.dives.length; k++) {
      var pd = plan.dives[k], info = { index: k, notes: [] };
      var adj = adjustDepth(pd.realDepth, plan.altitude);
      if (!adj.ok) { return { ok: false, errors: ['Mergulho ' + (k + 1) + ': ' + adj.errors.join(' ')] }; }
      var pre = group;
      if (k > 0) {
        if (!group) return { ok: false, errors: ['Mergulho ' + k + ' sem grupo válido; não é possível planejar o seguinte.'] };
        if (!isInt(pd.si)) return { ok: false, errors: ['Mergulho ' + (k + 1) + ': informe o IS planejado (min).'] };
        if (pd.si < MIN_SI_MIN) return { ok: false, errors: ['Mergulho ' + (k + 1) + ': IS planejado inferior a 10 min. Planeje como um único mergulho (ITO 3.32).'] };
        var t2 = t2Lookup(group, pd.si);
        pre = t2.kind === 'grupo' ? t2.group : null;
      }
      var limit, limitRule;
      if (pre) {
        var t3 = t3Lookup(pre, adj.adjusted);
        if (!t3.ok) { limit = 0; limitRule = 'NOAA-T3'; info.notes.push(alert('bloqueio', 'Grupo ' + pre + ' sem entrada na Tabela 3 a ' + fmt1(adj.adjusted) + ' m: não há TF sem parada disponível com este IS.', 'NOAA-T3')); }
        else { limit = t3.abt; limitRule = 'NOAA-T3'; }
      } else {
        var ri = depthIndex(adj.adjusted);
        if (ri < 0) return { ok: false, errors: ['Mergulho ' + (k + 1) + ': profundidade corrigida ' + fmt1(adj.adjusted) + ' m fora da Tabela 1 (acima de 39,6 m).'] };
        limit = D.T1[ri].ndl; limitRule = 'NOAA-T1';
      }
      info.limit = limit; info.limitRule = limitRule; info.adjusted = adj.adjusted; info.preGroup = pre;
      var auto = null;
      if (isNum(plan.tcs) && plan.tcs > 0) {
        auto = autonomy({ volL: plan.volL, pIni: plan.pIni, tcs: plan.tcs, depth: adj.adjusted });
        info.autonomy = auto;
      }
      var desired = pd.desiredBT === 'max' ? null : pd.desiredBT;
      if (desired !== null && (!isInt(desired) || desired < 1)) return { ok: false, errors: ['Mergulho ' + (k + 1) + ': TF desejado deve ser inteiro (≥ 1) ou "máximo".'] };
      var prop = desired === null ? limit : Math.min(desired, limit);
      var limitedBy = desired !== null && desired <= limit ? 'desejado' : 'tabela';
      if (desired !== null && desired > limit) info.notes.push(alert('atencao', 'TF desejado (' + desired + ' min) excede o limite (' + limit + ' min, ' + (limitRule === 'NOAA-T3' ? 'Tabela 3' : 'Tabela 1') + '). Proposto: ' + limit + ' min.', limitRule));
      if (auto && auto.ok && auto.minutes < prop) { prop = auto.minutes; limitedBy = 'autonomia'; info.notes.push(alert('atencao', 'TF limitado pela autonomia de ar (' + auto.minutes + ' min – ITO 3.6).', 'ITO-3.6')); }
      if (!auto) info.notes.push(alert('atencao', 'Autonomia não calculada: informe a TCS do mergulhador. O TF proposto não considera o consumo de ar.', 'ITO-3.6'));
      info.proposedBT = prop; info.limitedBy = limitedBy;
      if (k > 0 && desired !== null) {
        var req = requiredSI(group, adj.adjusted, desired);
        info.requiredSI = req;
        if (req.ok && pd.si < req.minSI) info.notes.push(alert('atencao', 'Para o TF desejado de ' + desired + ' min seria necessário IS de pelo menos ' + min2hm(req.minSI) + ' (grupo ' + (req.group || 'sem residual') + ').', 'NOAA-T2'));
        if (!req.ok) info.notes.push(alert('atencao', req.reason, 'NOAA-T1'));
      }
      if (k > 0) info.siOptions = siOptions(group, adj.adjusted);
      perDive.push(info);
      proposed.push({ realDepth: pd.realDepth, bt: prop > 0 ? prop : 1, si: pd.si, start: pd.start });
      // atualiza grupo para o próximo
      var single = computeDive({ realDepth: pd.realDepth, bt: prop > 0 ? prop : 1, altitude: plan.altitude, preGroup: pre, ascentRate: plan.ascentRate, descentRate: plan.descentRate });
      group = single.status === 'bloqueio' ? null : single.group;
      if (prop <= 0) group = null;
    }
    var series = computeSeries({ altitude: plan.altitude, travelGain: plan.travelGain, manualGroup: plan.manualGroup, manualSI: plan.manualSI, ascentRate: plan.ascentRate, descentRate: plan.descentRate, dives: proposed });
    return { ok: true, perDive: perDive, series: series, proposed: proposed };
  }

  var API = {
    APP_VERSION: APP_VERSION, RULES: RULES, DIVERGENCES: DIVERGENCES, MISSING: MISSING,
    MAX_ASCENT: MAX_ASCENT, DAILY_MAX_MIN: DAILY_MAX_MIN, MAX_SI_MIN: MAX_SI_MIN, MIN_SI_MIN: MIN_SI_MIN,
    RESERVE_BAR: RESERVE_BAR, START_BAR: START_BAR,
    adjustDepth: adjustDepth, altitudeGroup: altitudeGroup, t1Lookup: t1Lookup, t2Lookup: t2Lookup, t3Lookup: t3Lookup,
    siOptions: siOptions, requiredSI: requiredSI, autonomy: autonomy, tcsCalc: tcsCalc, teamLevel: teamLevel,
    computeDive: computeDive, computeSeries: computeSeries, altitudeRest: altitudeRest, computePlan: computePlan, buildProfile: buildProfile,
    hm2min: hm2min, min2hm: min2hm, clock: clock, durTxt: durTxt, fmt1: fmt1, dataHash: dataHash, parseRange: parseRange,
    DATA: D
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.DiveEngine = API;
})(typeof window !== 'undefined' ? window : this);
