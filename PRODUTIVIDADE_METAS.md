# Produtividade: aves por turno e referências mensais

Implementação limitada ao projeto **BI-PCP copia**, na opção **Produtividade** do
Comparativo x Cirúrgico Geral. As fórmulas e as consultas de Rendimento não foram
alteradas. Data da conferência: **29/10/2026**, fuso America/Sao_Paulo.

## Regra da fonte, confirmada com os resultados SQL enviados

Ave Nova usa `pcp.diario_industria_turnos`, com:

```sql
WHERE descricao = 'Cabeças'
  AND secao = 'Abate - Total'
  AND turno_codigo IN ('1', '2')
```

Soma `quantidade` por empresa/data/turno. Todos/Ave Nova mostram a soma dos dois
turnos em uma única linha A.N.; selecionar 1º ou 2º turno restringe a fonte e a meta.
`data_referencia` é a data civil. O limite permanece o `data_limite` D−1 retornado
pelo relatório, inclusive em semana cheia e no acumulado mensal.

O diagnóstico mostrou que **Recepção + Compra já estão incluídas em Abate - Total**.
Somar todas essas seções produzia exatamente o dobro nos 23 dias de outubro
consultados pelo usuário. A seleção de Abate evita essa contagem repetida.
Os nomes de Descrição, Quantidade e Seção são conferidos pelo catálogo antes da
consulta; divergências não produzem valores substitutos.

A identificação mantém a regra existente do portal: o nome original da empresa
prevalece sobre o metadado de importação. Nos dados enviados, Ave Nova tem
`empresa_codigo='1'` e `unidade_codigo='10'`; o filtro não confunde o código da
empresa importada com a opção de 1º turno.

Real Alimentos permanece com a regra anterior: maior quantidade por empresa/dia,
com `diario_industria` e o complemento `dados_gerais` quando confirmado pelo catálogo.
Essa preservação foi expressamente confirmada pelo usuário.

### Reconciliação com dados reais enviados pelo usuário

| Data | A.N. 1T, Abate | A.N. 2T, Abate | Total corrigido | Diário anterior | Diferença |
|---|---:|---:|---:|---:|---:|
| 01/10/2026 | 63.393 | 51.009 | 114.402 | 114.402 | 0 |
| 03/10/2026 | 58.363 | — | 58.363 | 58.363 | 0 |
| 09/10/2026 | 63.804 | 45.111 | 108.915 | 108.915 | 0 |

Os valores provêm dos resultados SQL colados na conversa, não de uma conexão local.
O segundo turno ausente no sábado permanece ausente. A conferência completa de
outubro, com o filtro de Abate, está na consulta 5 de
`tools/conferir_produtividade.sql`; os demais dias corrigidos ainda precisam desse retorno.

## Metas e cores

- Metas lidas exclusivamente dos 18 códigos `PROD_AN_T1_*`, `PROD_AN_T2_*` e `PROD_RA_*`,
  para segunda a sábado, com `tela='calendario_producao_produtividade'` e `ativo=true`.
- Cada mês usa sua própria `referencia_mes`; nenhuma meta é transportada entre meses.
- Meta de A.N. total: 1T + 2T. Células vazias da planilha não viram zero.
- Verde: realizado maior ou igual à meta. Vermelho: abaixo. Somente o número em
  negrito recebe cor; os fundos rosados de totais permanecem como estavam.
- Cada empresa considera seus próprios dias com registro, inclusive quantidade zero.
  Sem registro e domingo não acrescentam meta. A ausência não cria produção zero.
- Aplicação nos dias, totais semanais, rodapé por dia da semana, total do mês e
  tabela mensal. Semana cheia consulta as referências dos meses adjacentes.
- Se um período incluir mês sem referência daquela empresa, o total fica sem cor,
  evitando comparar o realizado completo com uma meta incompleta. Se só uma parte
  da referência diária estiver em branco, soma-se a parte preenchida, conforme solicitado.
- Sem metas ou com falha na consulta de metas, os dados de produção continuam
  disponíveis, sem classificação por cor. Não há metas de teste embutidas no frontend.

As legendas ficam no cabeçalho dos dois blocos, sem ocupar as setas. O tema escuro
usa cores de texto próprias. Mês continua com seleção única no calendário; o mensal
ignora Mês, Dia e Semana cheia, preservando o comportamento existente.

## Integração com a API atual, conferida no ZIP enviado

O frontend usa o mesmo `apiGet`, Worker e sessão CENTRAL. A leitura nova é:

```text
GET /api/pcp/dados/metas?inicio=2026-10-01&fim=2026-10-01&tela=calendario_producao_produtividade&ativo=true&pagina=1&tamanho=1000
```

O arquivo `api_zootecnico(2).zip` enviado pelo usuário contém uma versão mais atual
que a cópia local anteriormente consultada. Nessa versão:

- `pcp_dados/api_pcp.py` já inclui `metas` em `TABELAS_API`.
- `coluna_data('metas')` retorna `referencia_mes`.
- A rota `/dados/{tabela}` aceita filtros pelas colunas existentes, como `tela` e
  `ativo`, e pagina usando `referencia_mes` e `id`, compatíveis com `pcp.metas`.
- A conexão dessa rota já é somente de leitura.
- `servico_zootecnico.py` já registra esse router no serviço 8010.

Por isso, a implementação final reutiliza essa rota e sua autenticação atual.
Os limites são o primeiro dia dos meses consultados, pois `referencia_mes` não é
a data de produção. Semana cheia inclui também o primeiro dia do mês adjacente.
Todas as páginas são lidas e validadas; referências duplicadas, inválidas, de outra
tela, inativas ou fora do período não produzem uma classificação indevida.

**Não é necessário alterar a API, adicionar rota ou reconstruir o container para
essa integração.** A proposta anterior de rota dedicada foi substituída pela
consulta já disponível na API enviada. O módulo provisório criado nesta sessão
foi retirado. Nenhum arquivo do ZIP ou de outro projeto foi modificado.
O `backend/main.py` histórico desta cópia também permaneceu intacto.

O usuário confirmou a carga SQL com **17 metas ativas em cada mês de 2026**,
totalizando **204 referências**. Para colocar o frontend atualizado no ar:

1. No GitHub Desktop, selecionar **BI-PCP copia** e revisar suas alterações.
2. Fazer commit e push para a branch usada no GitHub Pages.
3. Aguardar a publicação e abrir Comparativo x Cirúrgico Geral > Produtividade,
   pela sessão CENTRAL habitual. Recarregar com Ctrl+F5.
4. Conferir dias, turnos, totais e mensal. Exemplo com as metas fornecidas:
   01/10 A.N. total 114.402 vs 110.000: verde; 1T 63.393 vs 65.000: vermelho;
   2T 51.009 vs 45.000: verde; 03/10 total 58.363 vs 60.000: vermelho.
5. Se as cores não aparecerem, em F12 > Network procurar `dados/metas`. A chamada
   deve responder 200 usando a sessão já autenticada. Copiar o status e a mensagem
   do erro, sem compartilhar o header Authorization. O comportamento publicado
   ainda depende desse teste autenticado, não executado nesta sessão.

O registro da inspeção do ZIP fica em
`outputs/validacao-api-produtividade/analise_api_atual.json`, com hash do arquivo e
as capacidades verificadas. O ZIP foi lido sem extração de arquivos de ambiente.

## Robô: configuração e execução

Dependências: Python 3.10+, `openpyxl`, `psycopg` 3 e `tzdata` no Windows.
O teste local utilizou Python 3.12. Criar/usar o ambiente virtual deste projeto:

```powershell
py -3 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r tools/requirements-produtividade.txt
```

Preencher o `.env` local com os campos necessários de `.env.produtividade.example`,
preservando eventuais configurações existentes. `.env` e `.venv/` já são ignorados
pelo Git. O código não contém credenciais e não modifica permissões de arquivos.
Configuração por `PGHOST`, `PGPORT`, `PGDATABASE=bi_granja`, `PGUSER`, `PGPASSWORD`;
alternativamente `PCP_DATABASE_URL` ou `PCP_CONFIG_BANCO` apontando para um arquivo
Python existente com `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`.
Variáveis do ambiente prevalecem sobre o arquivo. Não enviar senhas pela conversa.

```dotenv
METAS_PRODUTIVIDADE_XLSX=\\192.168.1.193\BI_Granja\Planilhas_BI\Metas-PCP\metas_produtividade.xlsx
METAS_PRODUTIVIDADE_LOG=outputs/metas-produtividade/robo.log
```

A primeira aba deve ter B1=`1T`, C1=`2T`, D1=`Real Alimentos`; A2:A7 contém segunda
a sábado, aceitando caixa/acentos e o sufixo `-feira`. Os valores devem ser números
não negativos ou vazios. Texto numérico e fórmulas são recusados para impedir
valores interpretados sem cálculo. A planilha inteira é validada antes da conexão
de escrita. Sua leitura ocorre em uma cópia temporária, sem salvar no original.

```powershell
# Só validar o Excel, sem conectar ao banco:
.\tools\executar_metas_produtividade.bat --validar

# Validar e importar em uma única transação:
.\tools\executar_metas_produtividade.bat

# Reconciliação somente de leitura, após configurar a conexão:
.\.venv\Scripts\python.exe tools/reconciliar_produtividade.py --inicio 2026-10-01 --fim 2026-10-31
```

O .bat usa `PCP_PYTHON`, quando definido no ambiente Windows, depois o Python de
`.venv`, e por último `py -3`. `--env caminho` permite configuração alternativa
na chamada direta ao Python. O relatório CSV e o log ficam em `outputs/`, ignorado pelo Git.

O robô confirma banco, colunas, geração automática de `id`, índice único e ausência
de duplicidades/conflitos de tela. A tabela confirmada possui
`uq_pcp_metas_indicador_mes` e `id IDENTITY ALWAYS`; o INSERT omite `id`.
Update + insert são serializados em uma transação, com timeout de espera de 10s.
O bloqueio de escrita é breve e não impede as leituras do relatório.

Primeira carga, definida pela ausência dos 18 códigos: jan/2026 até dez do ano
corrente. Depois, só mês atual/futuros; meses passados existentes não são tocados.
Na virada do ano, cria os meses do novo ano. Valor vazio não insere uma linha;
se já houver meta atual/futura, desativa essa referência. Meses passados permanecem
intactos. Não há DELETE ou DDL. Atualiza o timestamp somente quando a linha muda.

O log registra data/hora, inseridas, atualizadas, desativadas, preservadas e erros.
Falha de validação ou SQL cancela a transação. Erros do driver não imprimem DSN/senhas.

### Alternativa manual enquanto não há configuração de conexão

`tools/carga_inicial_metas_produtividade.sql` contém a carga transacional dos
valores de teste fornecidos pelo usuário. É uma alternativa opcional à primeira
importação do Excel, **já executada pelo usuário no Adminer**, com 17 referências
ativas por mês de 2026 confirmadas no resultado enviado.
Em banco sem esses códigos, em 2026, produz 204 referências ativas: 17 por mês;
sábado 2T vazio não cria meta. Repete a preservação do histórico e dos demais
indicadores. A planilha permanece a fonte mantida pelos responsáveis para o robô.

## Agendar no Windows

No Agendador de Tarefas, criar uma tarefa diária com a conta que já tenha acesso
à pasta de rede. Definir o horário desejado no gatilho, por exemplo **06:00**.
Esse horário é configurável no próprio Agendador.

- Programa: `%SystemRoot%\System32\cmd.exe`
- Argumentos: `/d /c ""C:\Users\vchaves\Documents\GitHub\BI-PCP copia\tools\executar_metas_produtividade.bat""`
- Iniciar em: `C:\Users\vchaves\Documents\GitHub\BI-PCP copia`

Testar a execução manual com essa mesma conta antes de agendar. A tarefa não foi
criada nesta sessão; não foram alterados acessos, ACLs ou proprietários de pastas.

## Validação executada e limites

```powershell
node tools/test_produtividade_metas.cjs
.\.venv\Scripts\python.exe tools/test_robo_metas_produtividade.py
```

- Teste JavaScript com a amostra real enviada: Todos, Ave Nova, 1T, 2T e Real;
  Abate não soma novamente Recepção/Compra, mesmo se a API devolver todas as seções.
- Testes de referências: igualdade/acima/abaixo, sábado 2T vazio, domingo, zero
  realizado, sem registro, empresas separadas, vigência mensal, semana cheia,
  mês sem meta, resposta duplicada/inválida e limite D−1.
- Regressões locais em `tests/`: paginação, limites D−1, filtros de mês e ano,
  setas, limpeza, único calendário, arraste/responsividade do mensal, cores nos
  dias/totais/mensal, cancelamento de respostas antigas e seleção de Rendimento.
- Nove testes Python com Excel temporário e conexão simulada: validação, célula
  vazia, arquivo original preservado, idempotência, histórico, virada do ano,
  outros indicadores intactos, transação, esquema/identity e reconciliação.

Os testes de cálculo/importação são locais. A carga manual real foi executada pelo
usuário e seus totais foram retornados na conversa. O agente não abriu conexão de
escrita no banco. Não houve importação da planilha final da rede, cujo acesso não estava disponível à sessão.
Não houve teste visual em navegador autenticado nem publicação. A reconciliação
de três dias reais é a tabela acima; os demais cenários usam fixtures de teste.

## SQL e arquivos

Executados pelo usuário e retornados na conversa: SELECT do banco/D−1, colunas das
três tabelas, índices de `pcp.metas`, duplicidades, reconciliação de outubro, linhas
por seção/turno e `is_identity`. As somas sem seção deram dobro; as três amostras
com Abate reconciliam. O usuário também executou a carga manual transacional de
metas, com INSERT/UPDATE restritos aos códigos previstos, sem DELETE ou DDL.
O robô permanece preparado para as importações futuras; a leitura do frontend
reutiliza a rota existente de SELECT da API.

Arquivos de interface alterados:

- `assets/js/pcp-cirurgico.js`: fonte Abate/turnos da A.N., metas e classificação,
  legendas; nomes completos dos turnos apenas em Produtividade.
- `assets/css/pcp.css`: cores legíveis e legendas limitadas a `#cgProdutividade`.
- `index.html`: versões de cache desses dois arquivos.

Arquivos criados para esta implementação:

- `tools/produtividade_config.py`, `tools/robo_metas_produtividade.py`.
- `tools/requirements-produtividade.txt`, `tools/executar_metas_produtividade.bat`.
- `tools/reconciliar_produtividade.py`, `tools/conferir_produtividade.sql`.
- `tools/diagnosticar_turnos_produtividade.sql`, `tools/carga_inicial_metas_produtividade.sql`.
- `tools/test_produtividade_metas.cjs`, `tools/test_robo_metas_produtividade.py`.
- `.env.produtividade.example`, este documento.

Também atualizadas as suítes locais existentes
`tests/test_pcp_productivity_heads.cjs`, `tests/test_pcp_productivity_monthly.cjs` e
`tests/test_pcp_productivity_month_filter.cjs`; a pasta `tests/` já era ignorada pelo Git.
