# Conferência da Produtividade — 04/11/2026

Escopo: BI-PCP copia, Produtividade do Comparativo x Cirúrgico Geral.
Foco de novembro confirmado pelo usuário. Sem mudanças no design, no banco,
nos endpoints, em Rendimento ou nos filtros existentes.

## Evidência e causa

Foram recebidos 46 registros SQL de 02 e 03/11/2026 e 34 metas de outubro/novembro.
Há 16 registros com as descrições exatas utilizadas: `Cabeças` e
`Peso Vivo para Rendimento`. Novembro possui 17 metas ativas compatíveis.
`Cabeças - Mortos`, `Cabeças Plano` e outras descrições de peso não entram no cálculo.

O calendário exigia `secao = 'Abate - Total'` na leitura de Cabeças da Ave Nova.
Todos os registros de novembro enviados estão em `Recepção de Aves Vivas`.
Assim, nas opções Ave Nova, 1º turno e 2º turno, os dois dias ficavam sem Aves;
Meta e Diferença também ficavam vazias por dependerem da realização.
O peso não exigia essa seção e continuava preenchido. O mensal, que usa o diário
comum sem restrição de seção, também encontrava os registros.

## Correção local

Regra final confirmada pelo usuário: na leitura com `descricao = 'Cabeças'`,
procurar **Abate - Total** primeiro; sem valor numérico, procurar **Recepção de
Aves Vivas**. Usar MAX dentro da seção escolhida, por empresa/data/turno, e somar
somente os valores dos turnos selecionados. A prioridade vale também por
empresa/data no mensal e na Real Alimentos. Abate com zero é válido, mesmo se
Recepção tiver valor positivo. Sem valor nas duas seções, manter o tratamento
atual de dia sem produção; não buscar Compra nem outras seções.
Isso recupera novembro sem duplicar seções de outubro. Peso não recebeu essa
prioridade e mantém sua seleção anterior. Não houve troca automática de fonte.

As metas não foram criadas ou modificadas. O cálculo usa as referências existentes
de novembro e continua como realizado menos meta. Os totais somam as referências
dos dias realizados. Peso mantém a regra e as fontes anteriores, sem meta.

## Resultados da amostra

| Unidade | Data | Aves | Peso (kg), calendário | Meta | Diferença |
|---|---|---:|---:|---:|---:|
| Ave Nova | 02/11/2026 | 101.373 | 333.330 | 120.000 | −18.627 |
| Ave Nova | 03/11/2026 | 120.945 | 365.885 | 120.000 | +945 |
| Ave Nova — 1º turno | 02/11/2026 | 51.699 | 168.652 | 65.000 | −13.301 |
| Ave Nova — 1º turno | 03/11/2026 | 61.545 | 191.558 | 65.000 | −3.455 |
| Ave Nova — 2º turno | 02/11/2026 | 49.674 | 164.678 | 55.000 | −5.326 |
| Ave Nova — 2º turno | 03/11/2026 | 59.400 | 174.327 | 55.000 | +4.400 |
| Real Alimentos | 02/11/2026 | 74.055 | 253.435 | 80.000 | −5.945 |
| Real Alimentos | 03/11/2026 | 68.532 | 223.670 | 80.000 | −11.468 |

| Acumulado da amostra até 03/11 | Aves | Peso (kg), mensal | Meta | Diferença |
|---|---:|---:|---:|---:|
| Ave Nova | 222.318 | 699.213 | 240.000 | −17.682 |
| Real Alimentos | 142.587 | 477.105 | 160.000 | −17.413 |
| Total | 364.905 | 1.176.318 | 400.000 | −35.095 |

### Divergência entre as fontes de peso

| Empresa | Data | Diário comum (kg) | Soma dos turnos (kg) | Diferença |
|---|---|---:|---:|---:|
| Ave Nova | 02/11/2026 | 333.329 | 333.330 | +1 |
| Ave Nova | 03/11/2026 | 365.884 | 365.885 | +1 |

Os 2 kg acumulados de diferença já existem nos registros enviados. O calendário
preserva a soma dos turnos (699.215 kg); o mensal preserva o diário comum
(699.213 kg), conforme as fontes solicitadas anteriormente. Não se ajustou
artificialmente nenhum valor. A causa anterior à importação não foi determinada.

## Fontes e transformações

| Indicador/área | Origem | Transformação |
|---|---|---|
| Aves A.N., calendário | `pcp.diario_industria_turnos` | Cabeças; Abate antes de Recepção; MAX na seção por empresa/dia/turno, depois soma dos turnos selecionados |
| Peso A.N., calendário | `pcp.diario_industria_turnos` | Descrição exata Peso Vivo para Rendimento; MAX por empresa/dia/turno, depois soma |
| Aves e peso R.A. | `pcp.diario_industria`, complemento `dados_gerais` quando compatível | Cabeças: Abate antes de Recepção, MAX na seção por empresa/dia. Peso: MAX sem prioridade |
| Aves e peso mensal | `pcp.diario_industria`; complemento da R.A. preservado | Cabeças com prioridade Abate/Recepção; Peso sem prioridade; MAX por empresa/dia; soma dos dias; ambas as empresas |
| Meta | `pcp.metas` | Código da unidade/turno/dia da semana, mês da data, tela correta, ativo |
| Diferença | JavaScript | Realizado − meta, sem inventar referência ausente |
| Totais semanais, mensais e anuais | JavaScript | Agregação dos dias do recorte até D−1; referências por dia realizado |

Rotas existentes: `/api/pcp/tabelas`, `/api/pcp/dados/diario_industria`,
`/api/pcp/dados/diario_industria_turnos`, `/api/pcp/dados/dados_gerais` quando
disponível e `/api/pcp/dados/metas`. Nenhuma rota foi alterada.

## Validação e limites

- `tools/test_pcp_productivity_november.cjs` executa 92 comparações locais da
  renderização contra valores esperados da amostra SQL: 40 indicadores diários,
  40 nos totais semanais/do calendário e 12 no mensal das duas empresas/consolidado,
  incluindo a exibição consolidada Real Alimentos + Ave Nova e saldos com sinais.
  Resultado: **zero divergências locais após a correção**.
- A API é simulada com os registros SQL, inclusive filtros e paginação de três
  registros. Isso exercita os mesmos leitores e renderizadores do relatório,
  mas **não comprova a resposta da API publicada**.
- Sete outras suítes JavaScript passaram, incluindo prioridade com valores de
  Abate menores, zero válido, ausência nas duas seções, ordem/paginação e as amostras reais de outubro,
  turnos, Real Alimentos, metas, pesos, totais anuais, datas, paginação, D−1,
  semanas compartilhadas, filtros e seleção de Rendimento. Dez testes Python
  passaram, incluindo a ferramenta de reconciliação com a mesma prioridade.
- A execução gera, quando solicitado por `PCP_AUDIT_OUTPUT`, CSV com colunas
  empresa, período, indicador, banco, API, interface local e situação. Nesta
  sessão: `outputs/auditoria-produtividade-novembro/conferencia-local.csv`.
- A amostra não permite reconciliar todos os meses/anos reais, o total anual
  completo ou eventual complemento R.A. em `dados_gerais`. Ausência de registros
  em uma exportação parcial não foi declarada como SEM DADO NA ORIGEM.
- Não houve acesso à API autenticada, conferência visual da página publicada,
  publicação nem escrita no banco. Essas etapas continuam pendentes.

## Publicação

Republicar apenas `assets/js/pcp-cirurgico.js` e `index.html` para aplicar esta
correção; o índice tem a versão de cache atualizada. Não é necessária alteração
no CSS ou implantação de backend para esta correção.

Arquivos de apoio atualizados: documentação, reconciliação SQL/Python e seus testes.
A amostra reproduzível está em `tools/fixtures/produtividade-novembro-2026.json`.
