# Tabela de Mergulho CBMMG — Documento de Requisitos Técnicos

Versão do aplicativo: 4.3.0 · Versão dos dados: 1.0.0 (transcrição de 29/09/2026) · Integridade das tabelas (FNV-1a): `D1F341DD`

> A versão oficial e vigente dos documentos do CBMMG prevalece sobre qualquer implementação computacional. Este aplicativo é ferramenta de apoio e não substitui o supervisor de mergulho.

## 1. Fontes analisadas

| Documento | Conteúdo | Situação |
|---|---|---|
| ITO 12 – Operações Submersas, 2ª ed., CBMMG (aprovada em 12/09/2024), PDF de 98 páginas | Texto integral (itens 1 a 9), Figuras 1–5, Apêndices A–C, Anexos A–C | Lido integralmente, inclusive figuras (fórmulas das Figuras 1–4 e fluxograma da Figura 5) |
| TABELAS.PDF (3 páginas) | Idêntico às páginas 91–93 da ITO 12: Anexo A (Tabelas 1, 2 e 3 NOAA 2010), Anexo B (ajuste profundidade/altitude, NOAA 2010), Anexo C (grupo de entrada por altitude, Minas Gerais 2022) | Tabelas são imagens; transcritas célula a célula a partir da imagem original (1785×2331 px) |
| NOAA Diving Manual (texto) | Procedimentos que explicam o uso das tabelas | **Não recebido.** Ver seção 9 |

## 2. Arquitetura

Aplicação web de página única, sem dependências externas de código, entregue como um arquivo HTML autocontido (funciona offline depois de aberto/salvo; a única dependência de rede é a fonte tipográfica, com alternativa local).

```
src/data.js      Dados tabulares transcritos (somente dados, com proveniência)
src/engine.js    Motor de cálculo: funções puras + registro de regras (RULES),
                 divergências (DIVERGENCES) e informações ausentes (MISSING)
src/flow.js      Fluxo em passos (0 a 5): estado do assistente → resultados por
                 passo, usando apenas o motor; gera o relatório PDF
src/pdf.js       Gerador de PDF próprio (sem dependências, funciona offline)
src/ui.js        Interface do assistente em passos (celular)
src/logo*.b64    Brasão do CBMMG (recortado da tela fornecida pelo usuário)
src/index.template.html   Estrutura e estilos
build.js         Gera dist/index.html (arquivo único)
tests/engine.test.js      29 testes do motor
tests/flow.test.js        11 testes do fluxo, de vários mergulhadores, da autonomia e do PDF
```

Fluxo em camadas, sem atalhos entre elas:

```
entrada (UI, validação por campo)
  → interpretação da tabela/regra (adjustDepth, altitudeGroup, t1Lookup, t2Lookup, t3Lookup)
  → cálculo (computeDive, computeSeries, computePlan, autonomy, tcsCalc, teamLevel)
  → resultado + rastreio (Tracer: cada passo com ID de regra e origem)
  → perfil gráfico (buildProfile → SVG)
  → plano de mergulho (computePlan → proposta → revisão → registro)
```

O motor não conhece a interface; a interface não contém regra técnica além de limites de validação de entrada e alertas de condição (correnteza, contaminação), cada um com ID de regra.

## 3. Estruturas de dados

**Tabela 1** (`T1`): 12 linhas (12,2 a 39,6 m / 40 a 130 pés) × 16 colunas (A–O, Z). Célula = número (TF sem parada), `{bt, stop}` (TF com parada de `stop` min a 6,1 m) ou `null` (cinza). `ndl` = valor circulado.
**Tabela 2** (`T2_ROWS`): por novo grupo (linha), faixas `"h:mm-h:mm"` da coluna do próprio grupo até Z — espelha a impressão.
**Tabela 3** (`T3`): por grupo, 12 células `[TNR, ajuste]` ou `null`.
**Anexo B** (`ALT_COLS`, `ALT_ROWS`): 10 altitudes × 37 profundidades reais.
**Anexo C** (`ALT_GROUP`): 10 pares altitude → grupo.

**Resultado de mergulho** (`computeDive`): `adjusted`, `table1{rowDepth,rowFt,ndl}`, `tnr`, `tfe`, `maxBT`, `group`, `stops[{depth,minutes,kind,rule}]`, `ttd`, `totalTime`, `surfaceMin`, `profile{segments}`, `status` (`ok` | `excepcional` | `bloqueio`), `alerts[{level,text,rule}]`, `trace.steps[{rule,origem,texto,valor}]`, `contingency`.

**Registro do histórico** (localStorage, também exportável em JSON/texto): `id`, `tipo`, `criadoEm`, `versoes{aplicativo,dados,hashTabelas,documentos,configuracao}`, `entradaUsuario` (cópia integral), `resultado{status,resumo,mergulhos[],tempoSubmersoDia_min,equipe,alertas[]}`, `regrasUtilizadas[{id,origem,referencia}]`, `rastreio[{mergulho,origem,regra,passo}]`, `revisao` (planos).

Cada informação exibida leva uma etiqueta de origem: **Informado** (usuário), **Calculado** (sistema), **NOAA**, **ITO 12**, **Interpretação** (pendente de validação). Passando o cursor/tocando a etiqueta aparece a referência exata.

## 4. Componentes principais (versão 4 – assistente em passos, até 6 mergulhadores)

| Passo | O militar faz | O aplicativo mostra | Fonte |
|---|---|---|---|
| 0 – Orientações gerais | Lê | Tabela profundidade × qualificação × guarnição e regras de toda operação | ITO 12, item 4, Quadro 1, itens 3.6, 3.46, 3.63, 6, 7.2, 7.4 b, 7.10.7 |
| 1 – Teve alteração de altitude? | Sim/Não; se Sim, a diferença de altitude; sempre a altitude do local. Botão "?" com o passo a passo no Google Earth | — | Anexos B e C |
| 2 – Meça a profundidade | Profundidade medida (poita, profundímetro, sonda) | — | — |
| 3 – Resultado (automático) + mergulhadores | Registra de 1 a 6 mergulhadores (nome, descanso no local em minutos quando houve aumento de altitude, e TCS opcional) e confere o cilindro (padrão S80, 11,2 L, 200 bar) | Grupo pela altitude (Anexo C), profundidade corrigida, tempo máximo sem descanso (pior caso) e, por mergulhador, o grupo de entrada após o descanso, tempo máximo pela tabela, parada de 5 m, equipe exigida e, para cada mergulhador, autonomia × tabela → tempo máximo | Anexo C, Anexo B, Tabelas 1/3, ITO 3.6, 3.17, 3.46, item 4 |
| 4 – Mergulhar (por mergulhador) | Tempo total de fundo | Tempo máximo (menor entre tabela e cilindro); grupo após o mergulho e paradas atualizados a cada dígito | Tabela 1, ITO 3.6, 3.62, 3.25, 4.4 |
| 5 – Novo mergulho? (por mergulhador) | Não → encerra esse mergulhador. Sim → intervalo e profundidade | **Tempo máximo em destaque**, já limitado pelo cilindro; intervalo mínimo quando não houver tempo | Tabelas 2 e 3, ITO 3.32, 3.6 |
| Relatório | Dados opcionais (ocorrência, local, supervisor) | Situação de cada mergulhador, botão "Continuar" para quem está em andamento, PDF | — |

**Layout para PC e tablet (v4.3).** O mesmo arquivo se adapta à largura da tela. Celular (até 639 px): layout original. Tablet (640–999 px): coluna única mais larga. PC (1000 px ou mais): barra lateral vermelha fixa com o brasão e a lista dos passos (o passo atual em destaque) e o conteúdo em duas colunas — à esquerda os resultados (tempo máximo, tabela × cilindro, aviso de autonomia), à direita a entrada de dados e o resultado do que é digitado; as telas de tabela ocupam toda a largura. Só CSS e invólucros de colunas: nenhuma regra de cálculo mudou.

**Vários mergulhadores.** Os passos 0 a 3 são comuns à guarnição (mesma altitude, mesmo local). A partir do Passo 4, cada mergulhador tem sua própria sequência, intervalos e grupo. Uma barra de botões no topo dos passos 4 e 5 mostra cada mergulhador com o grupo atual e permite alternar entre eles; o "+" adiciona outro (até 6). O 1º mergulho de cada um usa a profundidade medida no Passo 2; os seguintes, a profundidade informada no Passo 5.

**Autonomia do cilindro.** Em toda tela que mostra tempo máximo aparecem: o valor pela tabela, o valor pelo cilindro e o aviso fixo "O tempo máximo de fundo está limitado à autonomia do cilindro… reserva de 50 bar". Com a TCS informada, o número em destaque já é o menor dos dois (fica laranja quando o cilindro é o limite). Fórmula da ITO 12, item 3.6, na profundidade corrigida (ITO 7.1), arredondada para baixo; cada mergulho considerado com cilindro na pressão inicial informada. Sem TCS, o app mostra o limite da tabela e manda controlar pelo manômetro.

**Minha posição na tabela.** O botão "Ver na tabela" / "Ver meu grupo na tabela" (Passos 3, 4 e 5) abre as tabelas usadas naquele mergulho, na ordem do cálculo, com a célula em amarelo e a explicação de cada leitura: Anexo C (grupo pela altitude), Anexo B (profundidade corrigida), Tabela 2 (intervalo), Tabela 3 (residual e tempo máximo) e Tabela 1 (grupo após o mergulho).

**Descanso no local (v4.1, individual desde a v4.2).** Quando há aumento de altitude, o grupo do Anexo C é apenas o ponto de partida. O tempo que o militar permanece no local antes do 1º mergulho é tratado como intervalo de superfície: o aplicativo entra na Tabela 2 pela coluna do grupo do Anexo C e obtém o grupo de entrada. Menos de 10 min mantém o grupo; acima da última faixa da coluna (até 15h50) dá grupo A; mais de 15h50 elimina o residual (ITO 3.32). Regra INT-12, adotada por orientação do usuário e pendente de validação normativa. O descanso é informado para cada mergulhador no Passo 3, em minutos, e é obrigatório quando houve aumento de altitude; cada um tem seu próprio grupo de entrada. O Passo 3 mostra, para a guarnição, o tempo máximo sem descanso (pior caso).

**Diferença de altitude × altitude do local:** a diferença de altitude vencida no deslocamento define o grupo de entrada (Anexo C); a altitude do local do mergulho corrige a profundidade (Anexo B). Por isso o Passo 1 pede as duas.

**Relatório PDF:** identificação, Passo 1, cada mergulho (intervalo, profundidade medida e corrigida, grupo antes, tempo máximo com a fonte, tempo realizado, paradas, grupo após, situação), totais do dia, critérios e linha de assinatura do supervisor. Rodapé com versão do aplicativo e hash das tabelas.

## 5. Regras de cálculo implementadas

1. **Profundidade corrigida** — Anexo B com a profundidade real e a altitude (ITO 7.1: limites e autonomia usam a corrigida; equipe usa a real).
2. **Grupo inicial** — Anexo C se houve deslocamento terrestre com ganho de altitude (INT-04); grupo informado manualmente passa pela Tabela 2 com o IS informado; havendo os dois, adota-se o maior (INT-11).
3. **Mergulho não repetitivo** — Tabela 1 com o TF; linha = profundidade tabelada igual ou imediatamente superior (INT-01; abaixo de 12,2 m usa 12,2 m – INT-07); coluna = primeira célula ≥ TF, ignorando células cinzas.
4. **Mergulho repetitivo** — Tabela 2 (grupo × IS) → novo grupo; Tabela 3 (grupo × profundidade) → TNR e ajuste; TF > ajuste = bloqueio; TFE = TNR + TF; Tabela 1 com o TFE → grupo final (legenda NOAA). Célula cinza na Tabela 3 = não há repetitivo sem parada.
5. **IS** — < 10 min: mergulho único com maior profundidade e TF = TF1 + IS + TF2 (INT-02); > 15h50: novo mergulho sem residual (ITO 3.32); acima do último valor da coluna mas ≤ 15h50: grupo A (INT-03). IS pelos horários quando não informado.
6. **Paradas** — célula de parada da Tabela 1: X min a 6,1 m, status "exposição excepcional" e exigência de equipe nível 4 (DIV-06); profundidade real ou corrigida > 18 m: 3 min a 5 m (ITO 3.46, INT-09).
7. **Subida** — velocidade configurável até 18 m/min (ITO 3.63); TTD = profundidade real ÷ velocidade + paradas; tempo total = TF + TTD.
8. **Tempo diário** — soma dos tempos totais ≤ 240 min (ITO 7.10.7).
9. **Autonomia** — V × (P_inicial − 50) ÷ (TCS × (1 + prof. corrigida/10)), arredondada para baixo (ITO 3.6, INT-05, INT-06). Sem TCS medida, não é calculada. TF > autonomia = bloqueio.
10. **TCS** — (bar consumidos × V ÷ P_abs) ÷ minutos (ITO 3.61).
11. **IS necessário** — percorre a coluna do grupo atual na Tabela 2, do menor IS ao maior, até o primeiro grupo cujo ajuste na Tabela 3 comporte o TF desejado; depois de 15h50, limite sem parada da Tabela 1.
12. **Equipe** — Quadro 1/item 4/Figura 5: >8 m nível 2; >18 m nível 3; >30 m, descompressivo ou confinado nível 4; águas impróprias nível 3; cadáver ≥ 18 h nível 3; condições perigosas excluem o nível 1; efetivo mínimo 3 (+1 remoto/perigoso) ou 4.
13. **Alertas de condição** — correnteza > 1,03 m/s (2 nós) bloqueia (7.4 b, 3.16 d); cadáver ≥ 20 h → roupa seca/full face (item 5); início antes das 8 h (item 6); pressão inicial ≠ 200 bar; TCS ≥ 40 L/min (7.2.1).

Nenhum resultado é exibido enquanto faltar dado obrigatório ou houver valor inválido: a tela mostra "Dados insuficientes" com a lista do que falta.

## 6. Tabela de correspondência entre regras e fontes

| ID | Origem | Referência na fonte | Regra | Implementação | Testes |
|---|---|---|---|---|---|
| NOAA-T1 | NOAA | Tabela 1 – Tempo de fundo com grupo de repetição (ITO 12, Anexo A, p. 91) | Determina o grupo de repetição pela profundidade e tempo de fundo; valor circulado = tempo máximo sem parada. | t1Lookup | T-DATA-01, T-NOAA-01..04, T-SER-01 |
| NOAA-T1-DECO | NOAA | Tabela 1, células vermelho/preto (Anexo A, p. 91) | Tempo de fundo para parada descompressiva: minutos necessários a 20 pés ou 6,1 metros. | t1Lookup, computeDive (paradas) | T-NOAA-01..03, T-SER-07 |
| NOAA-T2 | NOAA | Tabela 2 – Tempo de intervalo de superfície (Anexo A, p. 91) | Entre de cima para baixo na coluna do grupo; desça até o intervalo realizado; à esquerda está o novo grupo. | t2Lookup, siOptions, requiredSI | T-DATA-03, T-NOAA-05, T-NOAA-08, T-SER-01 |
| NOAA-T3 | NOAA | Tabela 3 – Tempo para mergulho repetitivo (Anexo A, p. 91) | Vermelho: tempo de nitrogênio residual (TNR). Preto: ajuste do tempo do mergulho repetitivo sem parada – o próximo mergulho não deve exceder esse tempo. | t3Lookup, computeDive | T-DATA-02, T-NOAA-06, T-SER-01, T-SER-05 |
| NOAA-TFE | NOAA | Legenda do Anexo A, p. 91 | TNR + PTF (tempo de fundo do mergulho repetitivo) = TFE (tempo de fundo equivalente). Use o TFE para determinar o próximo tempo de mergulho e o grupo de repetição. | computeDive | T-SER-01, T-SER-03 |
| NOAA-T3-12 | NOAA | Nota vertical da Tabela 3 (Anexo A, p. 91) | Mergulhos repetitivos com profundidades inferiores a 12,2 m devem utilizar os parâmetros adotados para 12,2 m. | t1Lookup, t3Lookup | T-NOAA-06 |
| NOAA-AVISO | NOAA | Aviso do Anexo A, p. 91 | Mesmo que as tabelas sejam cumpridas rigorosamente, não há garantias de que não ocorrerá doença descompressiva. O uso conservador é recomendado. | UI.disclaimer | — |
| NOAA-B | NOAA | Tabela de ajuste de profundidade/altitude (ITO 12, Anexo B, p. 92) | Profundidade corrigida conforme altitude, em metros. | adjustDepth | T-DATA-04, T-NOAA-07, T-SER-03 |
| ITO-C | ITO | ITO 12, Anexo C, p. 93 | Após deslocamento terrestre com aumento de altitude, observar o grupo repetitivo de entrada conforme a altitude. | altitudeGroup, computeSeries | T-DATA-05, T-NOAA-07, T-SER-03 |
| ITO-7.1 | ITO | ITO 12, item 7.1, p. 46 | Para a escolha das equipes avalia-se a profundidade real; os ajustes de altitude são empregados para cálculos de autonomia de gás, limites não descompressivos e planejamento. | computeDive, UI.dayComputation (equipe pela prof. real) | T-SER-03, T-EQ-01 |
| ITO-3.32 | ITO | ITO 12, item 3.32, p. 21 | IS entre 10 min e 15h50. Inferior a 10 min equivale a um mergulho único; acima de 15h50 considera-se novo mergulho, com novo planejamento. | t2Lookup, computeSeries, computePlan | T-NOAA-05, T-SER-02 |
| ITO-3.46 | ITO | ITO 12, item 3.46, p. 24 | Após qualquer mergulho profundo (superior a 18 m), parada de 3 minutos a 5 metros antes de chegar à superfície. | computeDive (parada 5 m/3 min) | T-SER-01 |
| ITO-3.63 | ITO | ITO 12, itens 3.56 e 3.63, p. 27 e 29 | Velocidade máxima de subida de 18 m/min. | computeDive, buildProfile, validação | T-VAL-01 |
| ITO-3.62 | ITO | ITO 12, item 3.62, p. 29 | Tempo de fundo: desde a saída da superfície até o instante em que deixa o fundo, em minutos. | computeDive (TF inclui descida) | — |
| ITO-3.25 | ITO | ITO 12, item 3.25, p. 20 | Exposição excepcional: tempo de fundo e/ou profundidade além dos limites da tabela de limites sem descompressão. | computeDive (status) | T-NOAA-03, T-SER-07 |
| ITO-4.4 | ITO | ITO 12, itens 4 e 4.4, Quadro 1, p. 32–37 | Mergulhos descompressivos ou acima de 30 m: equipe nível 4 (mergulho técnico), acionada pelo CEB mediante solicitação do COB. | computeDive, teamLevel | T-SER-07, T-EQ-01 |
| ITO-7.8h | ITO | ITO 12, item 7.8 h, p. 56 | O planejamento deve conter cálculos de contingência para exposição excepcional: reserva de emergência, paradas e tempo de subida. | contingência no resultado e plano | — |
| ITO-7.10.7 | ITO | ITO 12, itens 7.10.2 (p. 62) e 7.10.7 (p. 65) | Tempo máximo submerso diário por mergulhador, incluindo a descompressão: 240 minutos (4 horas). | computeSeries (tempo diário) | T-SER-04 |
| ITO-3.6 | ITO | ITO 12, item 3.6 e Figuras 1–2, p. 14–15 | Autonomia = volume do cilindro × pressão de trabalho ÷ (consumo individual × pressão absoluta). Iniciar com 200 bar; reserva de 50 bar não entra no cálculo. | autonomy, computePlan | T-ITO-01, T-PLAN-02, T-VAL-01 |
| ITO-3.61 | ITO | ITO 12, item 3.61 e Figuras 3–4, p. 28–29 | TCS = (consumo em bar × volume do cilindro ÷ pressão absoluta) ÷ tempo de atividade submerso. | tcsCalc | T-ITO-02 |
| ITO-3.17 | ITO | ITO 12, item 3.17, p. 18 | Cilindro S80 usado no CBMMG: 11,2 litros, pressão máxima de trabalho 200 bar. | valor inicial do cilindro, alerta >200 bar | — |
| ITO-7.2.1 | ITO | ITO 12, item 7.2.1, p. 50 | Mergulho dependente: o supervisor deve certificar TCS inferior a 40 L/min. | UI.dayComputation (alerta TCS ≥ 40) | — |
| ITO-Q1 | ITO | ITO 12, item 4 e Quadro 1, p. 31–33 | Nível 1: até 8 m, águas adequadas, sem condições perigosas. Nível 2: 8–18 m, águas adequadas. Nível 3: acima de 18 m até o limite não descompressivo, ou águas impróprias. Nível 4: acima de 30 m, descompressivo, confinado/teto. | teamLevel | T-EQ-01 |
| ITO-4 | ITO | ITO 12, item 4, p. 31–32 | Equipe mínima: 3 militares até 8 m (+1 em local remoto/condições perigosas); no mínimo 4 acima de 8 m. | teamLevel (efetivo mínimo) | T-EQ-01 |
| ITO-3.16 | ITO | ITO 12, item 3.16, p. 17–18 | Condições perigosas, entre elas correnteza superior a 3,7 km/h (1,03 m/s). | UI.validateConditions, teamLevel | T-EQ-01 |
| ITO-7.4b | ITO | ITO 12, item 7.4 b, p. 52 | Não mergulhe em cursos d’água com velocidade superior a 2 nós. | UI.conditionAlerts | — |
| ITO-3.41 | ITO | ITO 12, itens 3.41 e 3.43, p. 23–24 | Mergulho profundo: acima de 18 m. Narcose comum a partir de 30 m, podendo surgir a partir de 18 m. | teamLevel, computeDive | T-EQ-01 |
| ITO-3.42 | ITO | ITO 12, item 3.42, p. 23 | Mergulho técnico: acima de 30 m ou ambientes específicos (cavernas, naufrágios). | teamLevel, t1Lookup (>39,6 m) | T-EQ-01 |
| ITO-6 | ITO | ITO 12, item 6, p. 42 | Via de regra, as operações devem ser iniciadas às 8 horas e executadas enquanto a luminosidade natural permitir. | computeDive (início < 8h) | — |
| ITO-5 | ITO | ITO 12, item 5 e Figura 5, p. 39–40 e 60 | Na recuperação de cadáver, cerca de 20 h após a notificação a água pode se tornar imprópria: priorizar roupa seca e full face. Figura 5: a partir de 18 h, recuperação de cadáver por equipe nível 3. | teamLevel, UI.conditionAlerts | T-EQ-01 |
| ITO-FIG5 | ITO | ITO 12, Figura 5 (notas), p. 60 | Qualquer mergulho em água contaminada até 30 m deve ser executado pela equipe nível 3. | teamLevel | T-EQ-01 |
| ITO-4.3.1 | ITO | ITO 12, item 4.3.1, p. 35 | Em águas impróprias para banho, até 18 m, o mergulho pode ser executado por militar credenciado com treinamento específico para roupa seca. | teamLevel (informação) | — |
| ITO-6-SEG | ITO | ITO 12, item 6, p. 42–43 | Para cada mergulhador submerso, um mergulhador de segurança em condições de pronto empenho; comunicação direta com o apoio de superfície (cabo guia ou fonia). | UI.procedures | — |
| ITO-8.2t | ITO | ITO 12, itens 7.10.1, 7.10.7 e 8.2 t, p. 61–72 | Registrar no REDS tempo de fundo, profundidade e dados do mergulho repetitivo; preencher a caderneta de mergulho individual. | UI.procedures, histórico/exportação | — |
| ITO-7.10.3 | ITO | ITO 12, item 7.10.3, p. 62 | Encerrar a operação quando o tempo de fundo tiver sido limitado na profundidade sem encontrar o objeto, ou quando a profundidade extrapolar o limite de segurança. | UI.procedures | — |
| ITO-9 | ITO | ITO 12, itens 9.4 a 9.6, p. 77–82 | Plano de emergência: primeiros socorros (ITO 23), COBOM 193, oxigênio próximo de 100%, paciente consciente não deve sentar, transporte aéreo se a mais de 1 h e/ou 50 km do hospital de referência. | UI.procedures, tela ITO 12 | — |
| INT-01 | INT | Interpretação conservadora (não enunciada nas fontes fornecidas) | Valor não tabelado (profundidade, altitude): usa-se o valor tabelado imediatamente superior; tempo de fundo: a menor célula igual ou superior ao tempo realizado. | adjustDepth, altitudeGroup, t1Lookup, t3Lookup | T-NOAA-04, T-NOAA-07 |
| INT-02 | INT | Interpretação conservadora de ITO 3.32 + 3.62 | IS < 10 min: mergulho único com a maior profundidade e TF = TF anterior + IS + TF seguinte (tempo desde a saída da superfície até deixar o fundo). | computeSeries (combinação) | T-SER-02 |
| INT-03 | INT | Interpretação conservadora de ITO 3.32 + Tabela 2 | IS maior que o último valor da coluna do grupo, mas até 15h50: mantém-se o grupo A. | t2Lookup, siOptions | T-NOAA-05 |
| INT-04 | INT | Interpretação conservadora do Anexo C | O grupo de entrada por altitude é aplicado como grupo anterior ao 1º mergulho, sem crédito do tempo de permanência na altitude pela Tabela 2. | computeSeries | T-SER-03 |
| INT-05 | INT | Derivada dos exemplos das Figuras 2 e 4 da ITO 12 | Pressão absoluta (ATA) = 1 + profundidade/10 (13 m → 2,3 ATA; 2 m → 1,2 ATA). | autonomy, tcsCalc | T-ITO-01, T-ITO-02 |
| INT-06 | INT | Consistente com a Figura 2 (26,09 → 26 min) | Autonomia arredondada para baixo, em minutos inteiros. | autonomy | T-ITO-01 |
| INT-07 | INT | Extensão conservadora da nota da Tabela 3 | Mergulho não repetitivo com profundidade (ajustada) inferior a 12,2 m usa a linha de 12,2 m da Tabela 1. | t1Lookup | T-NOAA-04 |
| INT-09 | INT | Interpretação conservadora de ITO 3.46 | A parada de 3 min a 5 m é aplicada quando a profundidade real OU a ajustada excede 18 m. | computeDive | (plano de teste manual MV-04) |
| INT-10 | INT | Parâmetro gráfico (não definido nas fontes) | A velocidade de descida é apenas ilustrativa no gráfico; não altera nenhum cálculo (o TF já inclui a descida – ITO 3.62). | buildProfile | — |
| INT-11 | INT | Interpretação conservadora | Havendo grupo informado manualmente e grupo por altitude, usa-se o grupo mais alto (maior carga residual). | computeSeries | — |

## 7. Divergências identificadas (não resolvidas automaticamente)

| ID | Divergência | Tratamento no aplicativo |
|---|---|---|
| DIV-01 | ITO 3.60 (TTNR: IS < 12 h) × ITO 3.32 e Tabela 2 (até 15h50) | Usa 15h50 (3.32 e tabela coincidem); alerta sempre que IS > 12 h |
| DIV-02 | ITO 7.8 c e 7.10.3 citam "Anexo C" para ajuste de altitude e TLSD; 8.3 a cita "Anexo D"; 7.8 cita checklist "Anexo B" | Usa a tabela pelo conteúdo (Anexos A e B; Apêndices B e C) |
| DIV-03 | Quadro 1 (N1 até 8; N2 9–18; N3 19+) × texto do item 4 (>8, até 18, >18) | Usa o texto; alerta entre 8–9 m e 18–19 m |
| DIV-04 | Anexo B em 304,8/609,6… m × Anexo C em 300/600… m | Cada tabela com suas faixas; ambas exibidas |
| DIV-05 | Anexo B, coluna 304,8 m deixa de repetir a profundidade real a partir de 45,7 m | Sem efeito prático (>39,6 m é bloqueado); transcrito sem correção |
| DIV-06 | NOAA prevê descompressão; ITO limita equipes 1–3 ao não descompressivo | Descompressão só como contingência/exposição excepcional (nível 4) |
| DIV-07 | Parada NOAA 6,1 m × parada ITO 5 m/3 min | Ambas exibidas em sequência; combinação a validar |
| DIV-08 | Tabelas "NOAA (2010)" × referência bibliográfica NOAA 4ª ed. (2001) | Usa somente os valores impressos nos anexos |

## 8. Casos de teste

Execute `node --test tests/*.test.js` (42 testes, todos aprovados na entrega).

| ID | O que verifica | Origem do valor esperado |
|---|---|---|
| T-DATA-01 | Tabela 1: dimensões, ordem crescente, valor circulado = maior célula sem parada | Estrutura do Anexo A |
| T-DATA-02 | Tabela 3: TNR + ajuste = limite sem parada, nas 107 células | Consistência interna NOAA (audita a transcrição) |
| T-DATA-03 | Tabela 2: faixas contínuas de :10 ao máximo em todas as 16 colunas; Z→A termina em 15:50 | Consistência interna (audita a transcrição) |
| T-DATA-04/05 | Anexos B e C monotônicos; coluna 304,8 m igual à profundidade real até 44,2 m | Estrutura dos anexos |
| T-DATA-06 | Hash `D1F341DD` | Detecta qualquer alteração silenciosa das tabelas |
| T-ITO-01 | Autonomia 11,2 L × 150 bar ÷ (28 × 2,3) = 26 min | ITO 12, Figura 2 |
| T-ITO-02 | TCS 30 bar × 11,2 L ÷ 1,2 ÷ 10 min = 28 L/min | ITO 12, Figura 4 |
| T-NOAA-01..08 | Leituras célula a célula: limites, parada, cinzas, fora da tabela, intermediários, Tabelas 2 e 3, Anexos B e C, IS necessário | Células do Anexo A/B citadas no teste |
| T-SER-01..07 | Repetitivo completo, IS < 10 min, grupo de altitude, 240 min, TF acima do ajuste, IS por horários, descompressivo | Encadeamento das tabelas |
| T-VAL-01 | TF fracionário, profundidade negativa, subida > 18 m/min, altitude ausente, TCS ausente, pressão ≤ reserva | Validação |
| T-EQ-01 | Níveis e efetivos da equipe | ITO 12, item 4, Quadro 1, Figura 5 |
| T-PLAN-01..03 | TF desejado acima do limite, autonomia limitante, IS insuficiente | Plano |
| T-SER-08 | Diferença de altitude (Anexo C) separada da altitude do local (Anexo B) | Anexos B e C |
| F-10 | Autonomia limita o tempo máximo (13 m, TCS 28 → 25 min contra 125 min da tabela) | ITO 12, item 3.6 |
| F-11 | Cada mergulhador tem sequência e grupo próprios | Encadeamento das tabelas |
| F-12 | Descanso no local: obrigatório com aumento de altitude; < 10 min mantém o grupo; 2:00 a partir de D → B (máximo 107 min a 13,7 m); > 15h50 sem residual; motor e fluxo usam o mesmo grupo | Anexo C + Tabela 2 |
| F-13 | Descanso individual: grupos de entrada diferentes por mergulhador; descanso obrigatório e só em minutos quando houve subida; Passo 3 no pior caso | Anexo C + Tabela 2 |
| F-01..09 | Fluxo em passos: validação do Passo 1, máximo sem grupo e com grupo, sequência completa, intervalo < 10 min, profundidade fora da tabela, exposição excepcional e geração do PDF | Encadeamento das tabelas |

Verificação manual sugerida (MV) para a validação pelo Oficial de Mergulho, comparando com a tabela impressa:
MV-01: 18 m, 850 m de altitude, 20 min → corrigida 21,3 m, grupo E. IS 1:30 → D; 12 m por 25 min → corrigida 13,7 m, TNR 32, TFE 57, grupo H.
MV-02: grupo G, IS 30 min, 15 m por 20 min ao nível do mar → TNR 49, TFE 69, grupo J; próximo a 18 m por 30 min → IS mínimo 4:22 (grupo E, máximo 31 min).
MV-03: 18,3 m por 70 min → 14 min a 6,1 m, exposição excepcional.
MV-04: 15 m a 900 m com deslocamento → corrigida 18,3 m, grupo de entrada B, TF máximo 46 min, parada de 3 min a 5 m aplicada por INT-09.

## 9. Informações ausentes — solicitar

1. **NOAA Diving Manual (texto)**, que o pedido indicava como fonte técnica: só chegaram as tabelas reproduzidas na ITO 12. Ele é necessário para substituir as interpretações INT-01 a INT-11 por regras com fonte.
2. Regra de leitura de valores não tabelados (profundidade, altitude, tempo) — hoje INT-01.
3. Procedimento para IS inferior a 10 min — hoje INT-02.
4. Procedimentos em altitude: altitude de origem para o Anexo C (militares de BH já partem de ~850 m), crédito do tempo na altitude pela Tabela 2 e profundidade das paradas em altitude — hoje INT-04.
5. Velocidade de subida NOAA e velocidade de descida.
6. Conduta para descompressão omitida / subida de emergência em relação às tabelas.
7. Regras para deslocamento em altitude ou voo após o mergulho (a ITO 9.6.1 r cita o risco sem regra).
8. Correções para água doce, frio ou esforço (nenhuma é aplicada).
9. Exemplos resolvidos oficiais para validação independente.
10. Decisão normativa do CBMMG sobre cada interpretação INT-*.

## 10. Limitações conhecidas

- Transcrição manual de imagens: auditada pelos testes de consistência interna e por comparação visual da tela "Consulta à tabela" com o Anexo A, mas deve ser conferida por um segundo militar antes do uso operacional.
- Interpretações INT-* não constam textualmente nas fontes; todas foram escolhidas pelo critério mais conservador e aparecem marcadas nos resultados.
- O aplicativo não substitui computador de mergulho, não monitora o mergulho em tempo real e não planeja mergulho descompressivo (nível 4).
- Histórico salvo apenas no aparelho (localStorage): limpar o navegador apaga os registros. Exporte para arquivar.
- O relatório PDF é gerado no próprio aparelho; na página publicada, o download pede confirmação ao usuário.
- Condições da ocorrência e plano de mergulho detalhado continuam implementados no motor, mas saíram da tela para simplificar a operação.
- A autonomia considera cada mergulho iniciado com cilindro na pressão inicial informada; se o mesmo cilindro for reutilizado sem recarga, o militar deve controlar pelo manômetro.
- A fonte Inter é carregada da internet; offline é usada a fonte do sistema.
- O brasão foi recortado da captura de tela fornecida (resolução limitada); substituir pelo arquivo oficial, se disponível.

## 11. Instruções de uso e validação

**Uso em campo:** abra o link publicado ou o arquivo `index.html` salvo no celular (funciona sem internet). Siga os passos de 0 a 5. No Passo 5, responda Não para encerrar e baixar o relatório PDF.

**Validação antes da adoção:**
1. Conferir, célula a célula, a tela "Consulta à tabela" contra os Anexos A, B e C impressos da ITO 12 vigente.
2. Executar `node --test tests/*.test.js` e confirmar 42 aprovados e hash `D1F341DD`.
3. Refazer à mão os casos MV-01 a MV-04 com a tabela impressa.
4. Deliberar sobre as divergências DIV-01 a DIV-08 e as interpretações INT-01 a INT-11; registrar a decisão e, se necessário, ajustar `engine.js` e os testes.
5. A cada nova edição da ITO 12 ou das tabelas: atualizar `data.js`, `DATA_VERSION`, o hash esperado em T-DATA-06 e esta documentação.

**Manutenção:** editar arquivos em `src/`, rodar `node build.js` para gerar `dist/index.html` e rodar os testes.
