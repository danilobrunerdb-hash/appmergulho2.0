/*
 * DADOS TABULARES — transcrição literal das imagens dos documentos fornecidos.
 * NÃO ALTERAR sem registrar no controle de versão e atualizar DATA_VERSION.
 * Qualquer alteração muda o hash exibido no aplicativo (verificação de integridade).
 *
 * Fontes:
 *  - ITO 12 (2ª ed., CBMMG, 12/09/2024), Anexo A, p. 91 — "Tabelas de Limites Sem
 *    Descompressão (TLSD)", Fonte: NOAA (2010), "Copyright © 2010 by NOAA/BPC".
 *  - ITO 12, Anexo B, p. 92 — "Tabela de Ajuste de Profundidade/Altitude", Fonte: NOAA (2010).
 *  - ITO 12, Anexo C, p. 93 — "Tabela para Grupos Repetitivos – Adaptação à Altitude",
 *    Fonte: Minas Gerais (2022).
 *  O arquivo TABELAS.PDF fornecido contém exatamente as páginas 91–93 da ITO 12.
 */
(function (root) {
  'use strict';

  var DATA_VERSION = '1.0.0 (transcrição de 29/09/2026)';

  var GROUPS = ['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','Z'];

  // Linhas de profundidade das Tabelas 1 e 3 (metros e pés, conforme impresso).
  var DEPTHS_M  = [12.2, 13.7, 15.2, 16.8, 18.3, 21.3, 24.4, 27.4, 30.5, 33.5, 36.6, 39.6];
  var DEPTHS_FT = [40,   45,   50,   55,   60,   70,   80,   90,   100,  110,  120,  130];

  /*
   * TABELA 1 — TEMPO DE FUNDO COM GRUPO DE REPETIÇÃO (Anexo A).
   * Cada linha = 16 colunas (A..O, Z). Valores:
   *   número        -> tempo de fundo (min) sem parada; a coluna é o grupo de repetição
   *   {bt, stop}    -> célula vermelha/preta: "tempo de fundo para parada descompressiva" (bt)
   *                    e "minutos necessários a 20 pés ou 6,1 metros" (stop)
   *   null          -> célula cinza (sem valor)
   * ndl = valor circulado ("tempo máximo sem parada").
   */
  function d(bt, stop) { return { bt: bt, stop: stop }; }
  var T1 = [
    { ndl: 163, cells: [12,20,27,36,44,53,63,73,84,95,108,121,135,151,163,d(180,14)] },          // 12,2 m / 40 pés
    { ndl: 125, cells: [11,17,24,31,39,46,55,63,72,82,92,102,114,125,d(130,2),d(150,25)] },       // 13,7 / 45
    { ndl: 92,  cells: [9,15,21,28,34,41,48,56,63,71,80,89,92,d(100,4),d(110,8),d(130,34)] },     // 15,2 / 50
    { ndl: 74,  cells: [8,14,19,25,31,37,43,50,56,63,71,74,d(80,4),d(90,10),d(100,17),null] },    // 16,8 / 55
    { ndl: 60,  cells: [7,12,17,22,28,33,39,45,51,57,60,d(65,2),null,d(80,14),d(90,23),null] },   // 18,3 / 60
    { ndl: 48,  cells: [6,10,14,19,23,28,32,37,42,47,48,d(55,9),d(60,14),d(70,24),null,null] },   // 21,3 / 70
    { ndl: 39,  cells: [5,9,12,16,20,24,28,32,36,39,d(45,10),null,d(50,17),d(60,30),null,null] }, // 24,4 / 80
    { ndl: 30,  cells: [4,7,11,14,17,21,24,28,30,d(35,4),null,d(40,14),d(45,23),null,null,null] },// 27,4 / 90
    { ndl: 25,  cells: [4,6,9,12,15,18,21,25,null,d(30,3),null,d(35,15),d(40,26),null,null,null] },// 30,5 / 100
    { ndl: 20,  cells: [3,6,8,11,14,16,19,20,d(25,3),null,d(30,14),null,d(35,27),null,null,null] },// 33,5 / 110
    { ndl: 15,  cells: [3,5,7,10,12,15,null,d(20,2),null,d(25,8),null,d(30,24),null,null,null,null] },// 36,6 / 120
    { ndl: 10,  cells: [2,4,6,9,10,null,d(15,1),null,d(20,4),null,d(25,17),null,null,null,null,null] } // 39,6 / 130
  ];
  var T1_STOP_DEPTH_M = 6.1; // "minutos necessários a 20 pés ou 6,1 metros" (legenda da Tabela 1)

  /*
   * TABELA 2 — TEMPO DE INTERVALO DE SUPERFÍCIE (Anexo A).
   * Transcrita linha a linha como impressa. Linha = NOVO grupo (A no topo, Z embaixo).
   * Cada linha começa na coluna do próprio grupo e vai até Z.
   * Formato "mín-máx" em h:mm (":10" = 0:10). Leitura da fonte: "Entre na Tabela 2 de cima
   * para baixo; desça para encontrar o tempo de intervalo de superfície realizado; vá para a
   * esquerda para encontrar a letra do próximo grupo repetitivo."
   */
  var PATTERN = ['0:10-0:52','0:53-1:44','1:45-2:37','2:38-3:29','3:30-4:21','4:22-5:13',
                 '5:14-6:06','6:07-6:58','6:59-7:50','7:51-8:42','8:43-9:34','9:35-10:27','10:28-11:19'];
  var T2_ROWS = {
    A: ['0:10-2:20','1:17-3:36','2:12-4:31','3:04-5:23','3:56-6:15','4:49-7:08','5:41-8:00','6:33-8:52',
        '7:25-9:44','8:17-10:36','9:10-11:29','10:02-12:21','10:54-13:13','11:46-14:05','12:38-14:58','13:31-15:50'],
    B: ['0:10-1:16','0:56-2:11','1:48-3:03','2:40-3:55','3:32-4:48','4:24-5:40','5:17-6:32','6:09-7:24',
        '7:01-8:16','7:53-9:09','8:45-10:01','9:38-10:53','10:30-11:45','11:22-12:37','12:14-13:30'],
    C: ['0:10-0:55','0:53-1:47','1:45-2:39','2:38-3:31','3:30-4:23','4:22-5:16','5:14-6:08','6:07-7:00',
        '6:59-7:52','7:51-8:44','8:43-9:37','9:35-10:29','10:28-11:21','11:20-12:13'],
    D: PATTERN.slice(0, 13),
    E: PATTERN.slice(0, 12),
    F: PATTERN.slice(0, 11),
    G: PATTERN.slice(0, 10),
    H: PATTERN.slice(0, 9),
    I: PATTERN.slice(0, 8),
    J: PATTERN.slice(0, 7),
    K: PATTERN.slice(0, 6),
    L: PATTERN.slice(0, 5),
    M: PATTERN.slice(0, 4),
    N: PATTERN.slice(0, 3),
    O: PATTERN.slice(0, 2),
    Z: PATTERN.slice(0, 1)
  };
  // Observação de transcrição: as linhas D..Z repetem exatamente a mesma sequência de
  // faixas, deslocada uma coluna por linha; foram conferidas visualmente célula a célula
  // (ver docs/REQUISITOS_TECNICOS.md, seção Transcrição). O teste T-DATA-03 verifica a
  // continuidade de cada coluna.

  /*
   * TABELA 3 — TEMPO PARA MERGULHO REPETITIVO (Anexo A).
   * Linhas = grupo (A..Z); colunas = DEPTHS_M. Célula [tnr, ajuste] ou null (cinza).
   *   tnr    = "números vermelhos (superior): tempo de nitrogênio residual – TNR"
   *   ajuste = "números pretos (inferior): ajuste do tempo do mergulho repetitivo sem parada
   *             para descompressão – o próximo mergulho não deve exceder esse tempo"
   * Nota vertical da fonte: "Mergulhos repetitivos com profundidades inferiores a 12,2 metros
   * devem utilizar os parâmetros adotados para 12,2 metros."
   */
  var T3 = {
    A: [[13,150],[12,113],[11,81],[10,64],[9,51],[8,40],[7,32],[6,24],[5,20],[5,15],[5,10],[4,6]],
    B: [[21,142],[18,107],[17,75],[15,59],[14,46],[12,36],[10,29],[9,21],[8,17],[8,12],[7,8],[6,4]],
    C: [[29,134],[25,100],[23,69],[20,54],[19,41],[16,32],[14,25],[12,18],[11,14],[10,10],[9,6],[9,1]],
    D: [[37,126],[32,93],[29,63],[26,48],[24,36],[20,28],[18,21],[16,14],[14,11],[13,7],[12,3],null],
    E: [[45,118],[40,85],[35,57],[32,42],[29,31],[25,23],[22,17],[19,11],[17,8],[16,4],[14,1],null],
    F: [[55,108],[48,77],[42,50],[38,36],[35,25],[29,19],[25,14],[22,8],[20,5],[18,2],null,null],
    G: [[64,99],[56,69],[49,43],[44,30],[40,20],[34,14],[29,10],[26,4],[23,2],null,null,null],
    H: [[74,89],[64,61],[57,35],[51,23],[46,14],[39,9],[33,6],[29,1],null,null,null,null],
    I: [[85,78],[73,52],[65,27],[58,16],[52,8],[44,4],[38,1],null,null,null,null,null],
    J: [[97,66],[83,42],[73,19],[65,9],[58,2],null,null,null,null,null,null,null],
    K: [[109,54],[93,32],[81,11],[72,2],null,null,null,null,null,null,null,null],
    L: [[122,41],[104,21],[90,2],null,null,null,null,null,null,null,null,null],
    M: [[136,27],[115,10],null,null,null,null,null,null,null,null,null,null],
    N: [[152,11],null,null,null,null,null,null,null,null,null,null,null],
    O: [null,null,null,null,null,null,null,null,null,null,null,null],
    Z: [null,null,null,null,null,null,null,null,null,null,null,null]
  };

  /*
   * ANEXO B — TABELA DE AJUSTE DE PROFUNDIDADE/ALTITUDE.
   * Colunas = altitude (m) conforme impresso; linhas = profundidade real (m).
   * null = célula em branco (sem valor impresso).
   */
  var ALT_COLS = [304.8, 609.6, 914.4, 1219.1, 1523.9, 1828.7, 2133.5, 2438.3, 2743.1, 3047.9];
  var ALT_ROWS = [
    [3.0,  [3.0,4.6,4.6,4.6,4.6,4.6,4.6,4.6,4.6,4.6]],
    [4.6,  [4.6,6.1,6.1,6.1,6.1,6.1,6.1,7.6,7.6,7.6]],
    [6.1,  [6.1,7.6,7.6,7.6,7.6,7.6,9.1,9.1,9.1,9.1]],
    [7.6,  [7.6,9.1,9.1,9.1,10.7,10.7,10.7,10.7,10.7,12.2]],
    [9.1,  [9.1,10.7,10.7,10.7,12.2,12.2,12.2,13.7,13.7,13.7]],
    [10.7, [10.7,12.2,12.2,13.7,13.7,13.7,15.2,15.2,15.2,18.3]],
    [12.2, [12.2,13.7,13.7,15.2,15.2,15.2,16.8,16.8,18.3,18.3]],
    [13.7, [13.7,15.2,16.8,16.8,16.8,18.3,18.3,21.3,21.3,21.3]],
    [15.2, [15.2,16.8,18.3,18.3,21.3,21.3,21.3,21.3,21.3,24.4]],
    [16.8, [16.8,18.3,21.3,21.3,21.3,21.3,24.4,24.4,24.4,24.4]],
    [18.3, [18.3,21.3,21.3,21.3,24.4,24.4,24.4,27.4,27.4,27.4]],
    [19.8, [19.8,21.3,24.4,24.4,24.4,27.4,27.4,27.4,30.5,30.5]],
    [21.3, [21.3,24.4,24.4,27.4,27.4,27.4,30.5,30.5,30.5,33.5]],
    [22.9, [22.9,27.4,27.4,27.4,30.5,30.5,30.5,33.5,33.5,33.5]],
    [24.4, [24.4,27.4,27.4,30.5,30.5,30.5,33.5,33.5,36.6,36.6]],
    [25.9, [25.9,30.5,30.5,30.5,33.5,33.5,36.6,36.6,36.6,39.6]],
    [27.4, [27.4,30.5,33.5,33.5,33.5,36.6,36.6,39.6,39.6,42.7]],
    [29.0, [29.0,33.5,33.5,33.5,36.6,36.6,39.6,39.6,42.7,42.7]],
    [30.5, [30.5,33.5,36.6,36.6,39.6,39.6,39.6,42.7,42.7,45.7]],
    [32.0, [32.0,36.6,36.6,39.6,39.6,42.7,42.7,45.7,45.7,48.8]],
    [33.5, [33.5,36.6,39.6,39.6,42.7,42.7,45.7,45.7,48.8,48.8]],
    [35.1, [35.1,39.6,39.6,42.7,42.7,45.7,45.7,48.8,51.8,51.8]],
    [36.6, [36.6,39.6,42.7,42.7,45.7,45.7,48.8,51.8,51.8,54.9]],
    [38.1, [38.1,42.7,42.7,45.7,48.8,48.8,51.8,51.8,54.9,57.9]],
    [39.6, [39.6,42.7,45.7,48.8,48.8,51.8,51.8,54.9,57.9,57.9]],
    [41.1, [41.1,45.7,48.8,48.8,51.8,51.8,54.9,57.9,57.9,61.0]],
    [42.7, [42.7,48.8,48.8,51.8,51.8,54.9,57.9,57.9,61.0,64.0]],
    [44.2, [44.2,48.8,51.8,51.8,54.9,57.9,57.9,61.0,64.0,null]],
    [45.7, [48.8,51.8,51.8,54.9,57.9,57.9,61.0,64.0,null,null]],
    [47.2, [51.8,51.8,54.9,54.9,57.9,61.0,64.0,null,null,null]],
    [48.8, [51.8,54.9,54.9,57.9,61.0,61.0,null,null,null,null]],
    [50.3, [54.9,54.9,57.9,61.0,61.0,null,null,null,null,null]],
    [51.8, [54.9,57.9,57.9,61.0,null,null,null,null,null,null]],
    [53.3, [57.9,57.9,61.0,null,null,null,null,null,null,null]],
    [54.9, [57.9,61.0,64.0,null,null,null,null,null,null,null]],
    [56.4, [61.0,61.0,null,null,null,null,null,null,null,null]],
    [57.9, [61.0,null,null,null,null,null,null,null,null,null]]
  ];

  /* ANEXO C — Grupo repetitivo de entrada por altitude (após deslocamento terrestre com ganho de altitude). */
  var ALT_GROUP = [[300,'A'],[600,'B'],[900,'B'],[1200,'C'],[1500,'D'],[1800,'E'],[2100,'E'],[2400,'F'],[2700,'G'],[3000,'H']];

  var DATA = {
    DATA_VERSION: DATA_VERSION,
    GROUPS: GROUPS, DEPTHS_M: DEPTHS_M, DEPTHS_FT: DEPTHS_FT,
    T1: T1, T1_STOP_DEPTH_M: T1_STOP_DEPTH_M, T2_ROWS: T2_ROWS, T3: T3,
    ALT_COLS: ALT_COLS, ALT_ROWS: ALT_ROWS, ALT_GROUP: ALT_GROUP,
    DOCS: {
      ito: 'ITO 12 – Operações Submersas, 2ª ed., CBMMG, aprovada em 12/09/2024 (PDF recebido: 98 p.)',
      noaa: 'Tabelas NOAA (2010) reproduzidas nos Anexos A e B da ITO 12 (TABELAS.PDF = p. 91–93)',
      noaaManual: 'NOAA Diving Manual — NÃO FORNECIDO (ver Informações ausentes)'
    }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = DATA;
  else root.DIVE_DATA = DATA;
})(typeof window !== 'undefined' ? window : this);
