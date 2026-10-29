-- Executar no banco bi_granja e enviar os cinco resultados.
-- Apenas leitura: não cria objetos nem insere/atualiza dados.
BEGIN READ ONLY;
SET LOCAL TIME ZONE 'America/Sao_Paulo';

-- 1. Banco e limite de realização.
SELECT current_database() AS banco,
       (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date - 1 AS dados_ate;

-- 2. Estrutura real das três tabelas utilizadas.
SELECT table_name, ordinal_position, column_name, data_type,
       is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'pcp'
  AND table_name IN ('metas', 'diario_industria', 'diario_industria_turnos')
ORDER BY table_name, ordinal_position;

-- 3. Índices existentes; conferir unicidade de indicador_codigo + referencia_mes.
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'pcp' AND tablename = 'metas'
ORDER BY indexname;

-- 4. Duplicidades das metas solicitadas. Resultado vazio = sem duplicidades.
SELECT indicador_codigo, referencia_mes, count(*) AS quantidade,
       array_agg(DISTINCT tela) AS telas
FROM pcp.metas
WHERE indicador_codigo ~ '^PROD_(AN_T1|AN_T2|RA)_(SEG|TER|QUA|QUI|SEX|SAB)$'
GROUP BY indicador_codigo, referencia_mes
HAVING count(*) > 1
ORDER BY referencia_mes, indicador_codigo;

-- 5. Reconciliação diária A.N.: fonte anterior MAX x SUM(1T) + SUM(2T) de Abate - Total.
-- Abate - Total engloba Recepção e Compra. Não somar novamente essas duas seções.
-- O nome original identifica a empresa antes do código de importação,
-- seguindo a regra já existente no portal.
WITH antigo_base AS (
    SELECT data_referencia::date AS data, quantidade,
           regexp_replace(lower(coalesce(empresa::text, '')), '[^a-z0-9]', '', 'g') AS nome,
           ltrim(coalesce(empresa_codigo::text, ''), '0') AS codigo
    FROM pcp.diario_industria
    WHERE descricao = 'Cabeças'
      AND data_referencia::date >= DATE '2026-10-01'
      AND data_referencia::date < LEAST(DATE '2026-11-01', CURRENT_DATE)
), novo_base AS (
    SELECT data_referencia::date AS data, quantidade, turno_codigo::text AS turno,
           regexp_replace(lower(coalesce(empresa::text, '')), '[^a-z0-9]', '', 'g') AS nome,
           ltrim(coalesce(empresa_codigo::text, ''), '0') AS codigo
    FROM pcp.diario_industria_turnos
    WHERE descricao = 'Cabeças' AND secao = 'Abate - Total'
      AND turno_codigo::text IN ('1', '2')
      AND data_referencia::date >= DATE '2026-10-01'
      AND data_referencia::date < LEAST(DATE '2026-11-01', CURRENT_DATE)
), antigo AS (
    SELECT data, max(quantidade) AS diario_anterior
    FROM antigo_base
    WHERE nome LIKE '%avenova%' OR nome IN ('an', '10', '010')
       OR (codigo = '10' AND nome NOT IN ('ra', 'real', '111', '0111')
           AND nome NOT LIKE '%realalimentos%')
    GROUP BY data
), novo AS (
    SELECT data,
           sum(quantidade) FILTER (WHERE turno = '1') AS turno_1,
           sum(quantidade) FILTER (WHERE turno = '2') AS turno_2,
           sum(quantidade) AS total_novo
    FROM novo_base
    WHERE nome LIKE '%avenova%' OR nome IN ('an', '10', '010')
       OR (codigo = '10' AND nome NOT IN ('ra', 'real', '111', '0111')
           AND nome NOT LIKE '%realalimentos%')
    GROUP BY data
)
SELECT coalesce(a.data, n.data) AS data,
       n.turno_1, n.turno_2, n.total_novo, a.diario_anterior,
       n.total_novo - a.diario_anterior AS diferenca,
       CASE WHEN n.total_novo IS NULL OR a.diario_anterior IS NULL THEN 'Sem base comparável'
            WHEN n.total_novo = a.diario_anterior THEN 'Igual'
            ELSE 'Diferente' END AS resultado
FROM antigo a FULL JOIN novo n ON n.data = a.data
ORDER BY coalesce(a.data, n.data);

COMMIT;
