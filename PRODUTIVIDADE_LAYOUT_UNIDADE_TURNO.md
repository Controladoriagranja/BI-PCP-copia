# Produtividade: layout e Unidade / Turno — 05/11/2026

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
- Um único seletor Unidade / Turno, com seleção múltipla e quatro opções:
  Ave Nova; 1° Turno - AN; 2° Turno - AN; Real Alimentos.
  Selecionar 1T e 2T marca Ave Nova automaticamente, sem duplicar os turnos.
  Selecionar Ave Nova e Real mantém as duas caixas marcadas e mostra o resumo
  Real Alimentos + Ave Nova; não há uma quinta opção pronta no menu.
  Também são aceitas Real com apenas 1T ou 2T da Ave Nova.
- A seleção filtra apenas calendário, detalhamento e seus totais semanais e do
  período. O acumulado mensal mantém obrigatoriamente os 12 meses do ano selecionado,
  as colunas Ave Nova, Real Alimentos e Total do mês, além dos totais anuais.
  Unidade / Turno não altera as colunas, valores, metas ou consulta do acumulado.
- As linhas dos meses alternam branco/bege em todas as células comuns, inclusive
  Mês e Total do mês. Somente a linha Total do ano mantém o vinho claro.
- Calendário e acumulado têm margem lateral de 6 px por lado para deixar uma
  pequena folga de rolagem junto aos cards.
- Grupo fica oculto e sem restrição somente em Produtividade; seleção e campo
  originais são restaurados em Rendimento. Os demais filtros, Semana cheia,
  flags e Limpar filtros ficam na mesma linha no desktop e se reorganizam
  nas telas estreitas. Ano continua aplicável ao mensal. Unidade / Turno, Mês,
  Dia e Semana cheia não restringem os meses ou empresas do acumulado.
- A primeira coluna do calendário identifica cada semana pelo número ISO do
  ano, calculado pela segunda-feira da linha, inclusive na virada do ano.
- Em cada mês e no total anual, a célula Ave Nova contém 1° Turno - AN,
  2° Turno - AN e Total, com Peso, Aves, Meta e Diferença. Os turnos são
  detalhes adicionais de diario_industria_turnos; o Total continua no diário
  comum. A divergência de peso entre as fontes não foi corrigida nem ocultada.
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
do usuário ou API real. Confere os quatro nomes e sua ordem exata no seletor.

Foram aprovadas as sete combinações válidas das quatro opções em viewports de **1366, 1440, 1920, 1024, 600 e
492 px**. Foram verificados:

- Largura da página, dos dois relatórios e das células sem transbordamento lateral.
- Números dentro dos limites dos cards; menu do seletor aberto sem expandir a página.
- Mensal abaixo do calendário; 12 meses, Ave Nova, Real Alimentos e total das duas
  em todas as sete combinações de Unidade / Turno, com valores e metas invariantes.
- Consolidação por dia, detalhamento e totais em Real Alimentos + Ave Nova,
  incluindo saldo negativo resultante de uma diferença positiva e outra negativa.
- Fundo de mês uniforme entre Mês, empresas e Total do mês, alternância branco/bege,
  Total do ano em vinho claro e folga lateral discreta nos dois cards.
- Grupo oculto somente em Produtividade, Dia, Semana cheia, setas sincronizadas
  com Mês, Limpar filtros, semanas ISO e detalhes mensais/anuais por turno.
- Opções, seleção múltipla, marcação da tabela e estilo dos filtros de Rendimento
  preservados após alternar as abas.

Nove suítes JavaScript de regressão aprovadas: Cabeças, mensal, filtro único de
mês, metas, peso, totais, novembro, prioridade de seção e seleção múltipla/semanas.
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
node tools/test_pcp_productivity_selection.cjs
```

O teste de navegador exige Microsoft Edge instalado. Nenhuma dependência foi
instalada para executá-lo. Em ambiente que impeça o processo gráfico do navegador,
é necessário executar esse teste fora do sandbox, mantendo o perfil isolado.

## Arquivos

Interface: `assets/js/pcp-cirurgico.js`, `assets/css/pcp.css`, `index.html` (versões
de cache). Apoio: este documento, `PRODUTIVIDADE_METAS.md`, novo teste de navegador,
e ajustes nos testes de mensal, totais e amostra de novembro para a nova seleção.

## Backup anterior a esta alteração

`outputs/backups/produtividade-antes-20261105-082102/projeto.zip` contém 126
arquivos anteriores à edição. `manifesto.json` registra o SHA-256 de cada arquivo,
conferido contra o ZIP. Backup local ignorado pelo Git, sem publicar ou alterar
permissões. Não inclui `.git`, caches, saídas de testes ou arquivo `.env`.

## Desempenho do primeiro carregamento — 05/11/2026

A carga anual fazia chamadas mensais sequenciais dentro de cada fonte/turno.
Cabeças e Peso também repetiam o catálogo. A leitura agora reúne intervalos
contínuos em um único intervalo, limitado a D−1, sem incluir lacunas entre meses
não selecionados. Mantém os filtros, a paginação e as regras numéricas anteriores.
O catálogo é compartilhado somente entre chamadas com a mesma função de transporte
e o mesmo AbortSignal; uma nova carga usa um catálogo novo. Falhas podem ser
repetidas sem reaproveitar uma promessa rejeitada. Não há cache persistente de
dados ou sessão. API, SQL, banco e Rendimento não foram alterados.

O teste `tools/test_pcp_productivity_performance.cjs` compara os resultados
completos contra a versão anterior. Usa a amostra de novembro replicada em janeiro
a novembro para simular a carga anual até 03/11/2026: 71 chamadas antes e 8 depois
(88,73% menos), com páginas de 1.000 registros. Com páginas de apenas 3 registros,
as páginas adicionais continuam sendo lidas e os resultados permanecem idênticos.
Isso mede chamadas em transporte simulado, não o tempo da API publicada.
O relatório fica em `outputs/produtividade-desempenho/comparacao.json`.

Foram aprovadas dez suítes JavaScript e o teste de interface com sete combinações
nas larguras de 1366, 1440 e 1920 px após a otimização. Os 12 meses, turnos,
consolidados, metas e diferenças mantêm o conteúdo anterior.

Backup imediatamente anterior à otimização: `outputs/backups/produtividade-antes-desempenho-20261105-135313`,
com JavaScript, index e manifesto SHA-256. O ZIP anterior aos ajustes de layout
também permanece disponível no caminho registrado acima. Nada foi publicado.
