# Produtividade: layout e Unidade / Turno — 04/11/2026

Alterações locais limitadas ao BI-PCP copia, em Comparativo x Cirúrgico Geral,
aba Produtividade. Nada foi publicado, e não houve mudança em SQL, endpoints ou banco.

## Comportamento

- Calendário em toda a largura, com segunda a sábado, Total semanal e os totais
  existentes. Células crescem verticalmente para separar A.N. e R.A.
- Acumulado mensal abaixo do calendário, em toda a largura, sem rolagem lateral.
  Mantém meses nas linhas e total anual, rolagem vertical e cores do portal.
- Em espaços menores, semanas e linhas mensais se reorganizam com rótulos de
  dia/empresa, sem ocultar valores. Não se usou `overflow-x:hidden` como solução.
- Um único seletor Unidade / Turno, com nove opções: Ave Nova, Real Alimentos ou
  Real + Ave Nova, cada uma com Todos os turnos, 1º turno ou 2º turno.
- A seleção filtra calendário, detalhamento, totais semanais, mensal e anual.
  Nas combinações, empresas continuam separadas, com consolidado apenas na coluna
  Total do mês/final anual já existente.
- Grupo e Ano continuam aplicáveis ao mensal. Mês, Dia e Semana cheia mantêm seu
  comportamento anterior: ajustam o calendário, sem restringir os meses do acumulado.
- Limpar filtros restaura Ave Nova — Todos os turnos e desmarca Semana cheia.
- Trocar para Rendimento restaura o nome Unidade, suas opções e seleção múltipla,
  além do layout e das tabelas anteriores. O CSS novo dos filtros só atua na
  classe de modo `cg-productivity-filters`.

## Fontes e limites

As regras numéricas não foram redefinidas. Cabeças continua com prioridade
Abate - Total, depois Recepção de Aves Vivas, MAX dentro da seção e sem duplicar
seções. Peso continua com a seleção anterior. D−1 permanece obrigatório.

Todos os turnos preserva as fontes de consolidação anteriores: calendário da Ave
Nova soma 1T+2T; seu mensal usa o diário comum consolidado. Real Alimentos usa seu
diário consolidado e complemento compatível já existente, sem somar registros
consolidados com seus turnos.

Um turno explícito só aceita `turno_codigo` correspondente e empresa identificada.
Para a Real, consulta as fontes compatíveis do catálogo que tenham a coluna,
incluindo diario_industria_turnos, diario_industria e dados_gerais. Registros sem
turno não são convertidos em 1T/2T. Duplicações entre fontes são resolvidas pela
mesma prioridade/MAX por empresa/data/turno.

Os registros reais da Real enviados anteriormente são consolidados, sem turno.
Se a API não disponibilizar registros identificados para uma seleção específica,
a tela informa a ausência e não usa o consolidado como substituto.

As metas disponíveis da Real são consolidadas (`PROD_RA_*`), não metas de turno.
Na seleção de 1T/2T da Real, Aves/Peso podem ser exibidos quando identificados;
Meta e Diferença ficam sem referência, com aviso. Não houve rateio de meta nem
criação de valores. As metas por turno da Ave Nova continuam aplicáveis.

## Testes

`tools/test_pcp_productivity_browser.py` monta o relatório real no Edge headless,
com perfil isolado no workspace e API local simulada. Usa a amostra SQL de
novembro para Ave Nova/consolidados e dados **sintéticos** de turnos da Real,
um deles na tabela de turnos e outro no diário comum, para validar identificação.
Também testa a ausência desses registros. Não acessa sessão do usuário ou API real.

Foram aprovadas as nove opções em viewports de **1366, 1440, 1920, 1024, 600 e
492 px**. Foram verificados:

- Largura da página, dos dois relatórios e das células sem transbordamento lateral.
- Números dentro dos limites dos cards; menu do seletor aberto sem expandir a página.
- Mensal abaixo do calendário; meses e anual coerentes com cada seleção.
- Empresas separadas e ausência de uso do consolidado como turno da Real.
- Grupo, Dia, Semana cheia, setas sincronizadas com Mês e Limpar filtros.
- Opções, seleção múltipla, marcação da tabela e estilo dos filtros de Rendimento
  preservados após alternar as abas.

Oito suítes JavaScript de regressão continuam aprovadas: Cabeças, mensal, filtro
único de mês/unidade, metas, peso, totais, novembro e prioridade de seção.
Capturas locais revisadas para o calendário e a tabela abaixo dele. Os resultados
detalhados ficam em `outputs/produtividade-layout/results.json` (ignorado pelo Git).

Exemplo de execução, com um Python já instalado:

```powershell
python -B tools/test_pcp_productivity_browser.py
node tests/test_pcp_productivity_heads.cjs
node tests/test_pcp_productivity_monthly.cjs
node tests/test_pcp_productivity_month_filter.cjs
node tools/test_produtividade_metas.cjs
node tools/test_pcp_productivity_weight.cjs
node tools/test_pcp_productivity_totals.cjs
node tools/test_pcp_productivity_november.cjs
node tools/test_pcp_productivity_section_priority.cjs
```

O teste de navegador exige Microsoft Edge instalado. Nenhuma dependência foi
instalada para executá-lo. Em ambiente que impeça o processo gráfico do navegador,
é necessário executar esse teste fora do sandbox, mantendo o perfil isolado.

## Arquivos

Interface: `assets/js/pcp-cirurgico.js`, `assets/css/pcp.css`, `index.html` (versões
de cache). Apoio: este documento, `PRODUTIVIDADE_METAS.md`, novo teste de navegador,
e ajustes nos testes de mensal, totais e amostra de novembro para a nova seleção.
