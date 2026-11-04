# Produtividade: layout e Unidade / Turno — 04/11/2026

Alterações locais limitadas ao BI-PCP copia, em Comparativo x Cirúrgico Geral,
aba Produtividade. Nada foi publicado, e não houve mudança em SQL, endpoints ou banco.

## Comportamento

- Calendário em toda a largura, com segunda a sábado, Total semanal e os totais
  existentes. Na seleção Real Alimentos + Ave Nova, cada dia, detalhamento e total
  mostram um único consolidado A.N. + R.A., somando Aves, Peso e Meta. Diferença
  soma os saldos com seus sinais, equivalente a Aves totais menos Meta total.
- Acumulado mensal abaixo do calendário, em toda a largura, sem rolagem lateral.
  Mantém meses nas linhas e total anual, rolagem vertical e cores do portal.
- Em espaços menores, semanas e linhas mensais se reorganizam com rótulos de
  dia/empresa, sem ocultar valores. Não se usou `overflow-x:hidden` como solução.
- Um único seletor Unidade / Turno, com exatamente cinco opções, nesta ordem:
  Ave Nova; 1° Turno - AN; 2° Turno - AN; Real Alimentos; Real Alimentos + Ave Nova.
- A seleção filtra calendário, detalhamento, totais semanais, mensal e anual.
  No mensal, as colunas das empresas e Total do mês/final anual continuam
  disponíveis; a coluna Total soma os indicadores das duas empresas.
- As linhas dos meses alternam branco/bege em todas as células comuns, inclusive
  Mês; Total do mês conserva seu vinho claro, assim como o total anual.
- Grupo e Ano continuam aplicáveis ao mensal. Mês, Dia e Semana cheia mantêm seu
  comportamento anterior: ajustam o calendário, sem restringir os meses do acumulado.
- Limpar filtros restaura Ave Nova e desmarca Semana cheia.
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

As opções 1° Turno - AN e 2° Turno - AN só aceitam `turno_codigo` correspondente
e empresa Ave Nova identificada. As metas por turno da Ave Nova continuam
aplicáveis. Não há opções de turno individual da Real; seus valores e metas
permanecem consolidados. Não houve rateio de meta nem criação de valores.

## Testes

`tools/test_pcp_productivity_browser.py` monta o relatório real no Edge headless,
com perfil isolado no workspace e API local simulada. Usa a amostra SQL de
novembro para Ave Nova, turnos da Ave Nova e Real consolidada. Não acessa sessão
do usuário ou API real. Confere os cinco nomes e sua ordem exata no seletor.

Foram aprovadas as cinco opções em viewports de **1366, 1440, 1920, 1024, 600 e
492 px**. Foram verificados:

- Largura da página, dos dois relatórios e das células sem transbordamento lateral.
- Números dentro dos limites dos cards; menu do seletor aberto sem expandir a página.
- Mensal abaixo do calendário; meses e anual coerentes com cada seleção.
- Consolidação por dia, detalhamento e totais em Real Alimentos + Ave Nova,
  incluindo saldo negativo resultante de uma diferença positiva e outra negativa.
- Fundo de mês uniforme entre Mês e empresas, alternância branco/bege e
  preenchimento de Total do mês preservado.
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
