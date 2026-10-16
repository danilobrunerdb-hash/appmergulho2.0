# Tabela de Mergulho CBMMG

Assistente web, pensado para celular, que aplica as tabelas de mergulho NOAA (2010) reproduzidas na **ITO 12 – Operações Submersas (2ª ed., CBMMG, 2024)**. Até 6 mergulhadores por operação, posição de cada um na tabela, tempo máximo de fundo limitado pela tabela e pela autonomia do cilindro, e relatório em PDF.

> **Ferramenta de apoio.** A versão oficial e vigente da ITO 12 prevalece sobre este aplicativo. Mesmo cumprindo as tabelas, não há garantia contra doença descompressiva (NOAA). Regras marcadas como interpretação estão pendentes de validação pelo CBMMG.

## Uso

Abra `dist/index.html` em qualquer navegador (funciona sem internet e sem instalação). O fluxo tem 6 passos:

0. Orientações gerais (profundidade × qualificação × guarnição)
1. Teve alteração de altitude? (diferença de altitude)
2. Profundidade medida
3. Resultado automático e registro dos mergulhadores (com o descanso de cada um, em minutos)
4. Tempo de fundo de cada mergulhador
5. Novo mergulho? (intervalo e profundidade → tempo máximo) ou encerrar e gerar o PDF

## Desenvolvimento

Requer Node.js 22 ou superior. Não há dependências.

```bash
npm test        # 42 testes do motor, do fluxo e do PDF
npm run build   # gera dist/index.html a partir de src/
```

| Arquivo | Conteúdo |
|---|---|
| `src/data.js` | Tabelas transcritas dos Anexos A, B e C da ITO 12 (somente dados) |
| `src/engine.js` | Motor de cálculo, regras com fonte, divergências e informações ausentes |
| `src/flow.js` | Fluxo em passos, vários mergulhadores, autonomia e relatório |
| `src/pdf.js` | Gerador de PDF próprio |
| `src/ui.js`, `src/index.template.html` | Interface |
| `docs/REQUISITOS_TECNICOS.md` | Requisitos, regras × fontes, divergências, testes, limitações e validação |

Qualquer alteração em `src/data.js` muda o hash de integridade das tabelas (`D1F341DD`), exibido no aplicativo e verificado pelo teste T-DATA-06.

## Publicar no Vercel

O repositório já tem `vercel.json` (build `npm run build`, saída `dist/`). No Vercel: **Add New → Project →** importe o repositório e clique em **Deploy**, sem alterar nada.

Se `package.json` não estiver na raiz do repositório (por exemplo, dentro de uma pasta `tabela-mergulho-cbmmg/`), informe essa pasta em **Settings → Build and Deployment → Root Directory**.
