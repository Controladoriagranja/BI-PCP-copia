-- Diagnóstico somente de leitura, antes de incluir Peso Vivo na Produtividade.
BEGIN READ ONLY;
SET LOCAL TIME ZONE 'America/Sao_Paulo';

-- 1. Quais descrições/seções existem, para quais empresas e períodos?
-- A API enviada também menciona Peso Vivo(-D+A); conferir se as empresas usam
-- descrições diferentes antes de definir uma equivalência entre os indicadores.
WITH registros AS (
    SELECT 'diario_industria'::text AS fonte, empresa, secao, descricao,
           coalesce(data_referencia,data) AS dia, quantidade
    FROM pcp.diario_industria WHERE descricao ILIKE '%peso%vivo%'
    UNION ALL
    SELECT 'diario_industria_turnos', empresa, secao, descricao,
           coalesce(data_referencia,data), quantidade
    FROM pcp.diario_industria_turnos WHERE descricao ILIKE '%peso%vivo%'
)
SELECT fonte,empresa,secao,descricao,min(dia) AS primeiro_dia,max(dia) AS ultimo_dia,
       count(*) AS registros,count(quantidade) AS com_quantidade,
       min(quantidade) AS menor_quantidade,max(quantidade) AS maior_quantidade
FROM registros
WHERE dia >= DATE '2026-01-01' AND dia < CURRENT_DATE
GROUP BY fonte,empresa,secao,descricao
ORDER BY empresa,descricao,fonte,secao;

-- 2. Linhas reais em duas datas já usadas na conferência de Cabeças.
-- Não agrupar nem somar nesta etapa: identificar repetições e o campo numérico.
WITH registros AS (
    SELECT 'diario_industria'::text AS fonte, data_referencia, data, empresa,
           turno_codigo, secao, descricao, quantidade, valor_texto, arquivo_origem
    FROM pcp.diario_industria
    WHERE descricao IN ('Peso Vivo para Rendimento','Peso Vivo(-D+A)')
    UNION ALL
    SELECT 'diario_industria_turnos',data_referencia,data,empresa,
           turno_codigo,secao,descricao,quantidade,valor_texto,arquivo_origem
    FROM pcp.diario_industria_turnos
    WHERE descricao IN ('Peso Vivo para Rendimento','Peso Vivo(-D+A)')
)
SELECT * FROM registros
WHERE coalesce(data_referencia,data) IN (DATE '2026-10-01',DATE '2026-10-09')
ORDER BY coalesce(data_referencia,data),empresa,fonte,turno_codigo,secao,descricao;

COMMIT;
