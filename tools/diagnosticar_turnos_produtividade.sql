-- Diagnóstico somente de leitura. Não remove, corrige ou consolida registros.
BEGIN READ ONLY;
SET LOCAL TIME ZONE 'America/Sao_Paulo';

-- 1. Identificar quais seções/códigos de Cabeças compõem cada turno.
-- Três datas: dois dias úteis e um sábado com apenas 1º turno.
SELECT data_referencia, empresa, empresa_codigo, turno_codigo,
       secao, codigo, descricao, quantidade, unidade_codigo, local_codigo,
       origem, arquivo_origem, fonte_arquivo, chave_hash
FROM pcp.diario_industria_turnos
WHERE descricao = 'Cabeças'
  AND turno_codigo IN ('1', '2')
  AND data_referencia IN (DATE '2026-10-01', DATE '2026-10-03', DATE '2026-10-09')
ORDER BY data_referencia, empresa, turno_codigo, secao, codigo, quantidade DESC;

-- 2. Confirmar geração automática do id antes de qualquer INSERT de metas.
-- column_default NULL também pode significar coluna IDENTITY; não inferir ausência de geração.
SELECT column_name, data_type, is_nullable, column_default,
       is_identity, identity_generation, is_generated
FROM information_schema.columns
WHERE table_schema = 'pcp' AND table_name = 'metas' AND column_name = 'id';

COMMIT;
