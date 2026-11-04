-- Diagnóstico de novembro/2026: SOMENTE SELECT, sem alterações no banco.
-- Executar no bi_granja e enviar os três resultados.
-- Não trocar a regra do calendário antes de conferir as seções e os turnos.

-- 1. Banco, D−1 oficial e presença da fonte complementar da Real Alimentos.
SELECT current_database() AS banco,
       (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date - 1 AS dados_ate,
       to_regclass('pcp.dados_gerais')::text AS fonte_complementar_real;

-- 2. Registros originais de novembro nas duas fontes confirmadas.
-- Não somar seções: Abate pode repetir ou englobar Recepção e Compra.
-- COALESCE serve só para localizar datas no diagnóstico. As datas originais
-- ficam visíveis para detectar data_referencia ausente ou divergente.
-- Inclui variações de Cabeças e Peso Vivo para detectar mudanças de descrição.
WITH registros AS (
    SELECT 'diario_industria'::text AS fonte,
           data_referencia, data, empresa, empresa_codigo, unidade_codigo,
           turno_codigo, secao, descricao, quantidade, arquivo_origem
    FROM pcp.diario_industria
    WHERE coalesce(data_referencia, data) >= DATE '2026-11-01'
      AND coalesce(data_referencia, data) < LEAST(
          DATE '2026-12-01',
          (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date
      )
      AND (lower(trim(descricao)) LIKE 'cabe%'
           OR lower(trim(descricao)) LIKE 'peso%vivo%')
    UNION ALL
    SELECT 'diario_industria_turnos',
           data_referencia, data, empresa, empresa_codigo, unidade_codigo,
           turno_codigo, secao, descricao, quantidade, arquivo_origem
    FROM pcp.diario_industria_turnos
    WHERE coalesce(data_referencia, data) >= DATE '2026-11-01'
      AND coalesce(data_referencia, data) < LEAST(
          DATE '2026-12-01',
          (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date
      )
      AND (lower(trim(descricao)) LIKE 'cabe%'
           OR lower(trim(descricao)) LIKE 'peso%vivo%')
)
SELECT fonte, data_referencia, data, empresa, empresa_codigo, unidade_codigo,
       turno_codigo, secao, descricao, quantidade, arquivo_origem
FROM registros
ORDER BY coalesce(data_referencia, data), empresa, fonte,
         turno_codigo, descricao, secao, quantidade DESC NULLS LAST;

-- 3. Metas de outubro e novembro: comparar referência, tela e situação.
-- Não restringir tela/ativo: isso permite identificar metas existentes que
-- não atendem ao contrato da consulta. Não cria nem atualiza nenhuma meta.
SELECT referencia_mes, indicador_codigo, indicador_nome, tela,
       valor_meta, unidade, comparacao, ativo, tabela_origem, coluna_origem
FROM pcp.metas
WHERE referencia_mes >= DATE '2026-10-01'
  AND referencia_mes < DATE '2026-12-01'
  AND indicador_codigo LIKE 'PROD_%'
ORDER BY referencia_mes, indicador_codigo;
