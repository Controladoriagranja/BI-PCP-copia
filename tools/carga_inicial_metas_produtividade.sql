-- Carga manual OPCIONAL com os valores de teste fornecidos pelo usuário.
-- Alternativa à primeira execução do robô enquanto o .env não está configurado.
-- Não altera estrutura, não informa id e não altera indicadores de outras telas.
-- Primeira carga: jan/2026 a dez do ano corrente. Depois: mês atual/futuros.
BEGIN;
SET LOCAL TIME ZONE 'America/Sao_Paulo';
SET LOCAL lock_timeout = '10s';
DO $carga$
DECLARE
    v_codigos text[];
    v_inicial boolean;
    v_atual date := date_trunc('month', CURRENT_DATE)::date;
    v_mes date;
    v_codigo text;
    v_nome text;
    v_tabela text;
    r record;
BEGIN
    IF current_database() <> 'bi_granja' THEN
        RAISE EXCEPTION 'Banco diferente de bi_granja; carga cancelada';
    END IF;
    SELECT array_agg('PROD_' || s.serie || '_' || d.dia) INTO v_codigos
    FROM (VALUES ('AN_T1'),('AN_T2'),('RA')) s(serie)
    CROSS JOIN (VALUES ('SEG'),('TER'),('QUA'),('QUI'),('SEX'),('SAB')) d(dia);

    LOCK TABLE pcp.metas IN SHARE ROW EXCLUSIVE MODE;
    IF EXISTS (SELECT 1 FROM pcp.metas WHERE indicador_codigo=ANY(v_codigos)
               GROUP BY indicador_codigo,referencia_mes HAVING count(*)>1) THEN
        RAISE EXCEPTION 'Metas PROD_ duplicadas; carga cancelada';
    END IF;
    IF EXISTS (SELECT 1 FROM pcp.metas WHERE indicador_codigo=ANY(v_codigos)
               AND tela IS DISTINCT FROM 'calendario_producao_produtividade') THEN
        RAISE EXCEPTION 'Código PROD_ pertence a outra tela; carga cancelada';
    END IF;
    SELECT NOT EXISTS (SELECT 1 FROM pcp.metas WHERE indicador_codigo=ANY(v_codigos)) INTO v_inicial;

    FOR v_mes IN
        SELECT g::date FROM generate_series(DATE '2026-01-01',
            make_date(extract(year FROM CURRENT_DATE)::int,12,1), INTERVAL '1 month') g
        WHERE v_inicial OR g::date>=v_atual
        UNION
        SELECT referencia_mes FROM pcp.metas
        WHERE indicador_codigo=ANY(v_codigos) AND referencia_mes>=v_atual
    LOOP
        FOR r IN SELECT * FROM (VALUES
            ('AN_T1','SEG','segunda',65000::numeric), ('AN_T1','TER','terca',65000),
            ('AN_T1','QUA','quarta',65000), ('AN_T1','QUI','quinta',65000),
            ('AN_T1','SEX','sexta',65000), ('AN_T1','SAB','sabado',60000),
            ('AN_T2','SEG','segunda',55000), ('AN_T2','TER','terca',55000),
            ('AN_T2','QUA','quarta',50000), ('AN_T2','QUI','quinta',45000),
            ('AN_T2','SEX','sexta',45000), ('AN_T2','SAB','sabado',NULL),
            ('RA','SEG','segunda',80000), ('RA','TER','terca',80000),
            ('RA','QUA','quarta',80000), ('RA','QUI','quinta',80000),
            ('RA','SEX','sexta',80000), ('RA','SAB','sabado',60000)
        ) p(serie,dia,nome_dia,valor)
        LOOP
            v_codigo := 'PROD_' || r.serie || '_' || r.dia;
            v_nome := 'Produtividade ' || CASE r.serie
                WHEN 'AN_T1' THEN 'Ave Nova 1º turno' WHEN 'AN_T2' THEN 'Ave Nova 2º turno'
                ELSE 'Real Alimentos' END || ' - ' || r.nome_dia;
            v_tabela := CASE WHEN r.serie='RA' THEN 'diario_industria' ELSE 'diario_industria_turnos' END;
            IF r.valor IS NULL THEN
                UPDATE pcp.metas SET ativo=false,atualizado_em=CURRENT_TIMESTAMP
                WHERE indicador_codigo=v_codigo AND referencia_mes=v_mes
                  AND tela='calendario_producao_produtividade' AND ativo IS DISTINCT FROM false;
            ELSE
                UPDATE pcp.metas SET indicador_nome=v_nome,tabela_origem=v_tabela,
                    coluna_origem='quantidade',valor_meta=r.valor,unidade='aves',comparacao='>=',
                    observacao=NULL,ativo=true,atualizado_em=CURRENT_TIMESTAMP
                WHERE indicador_codigo=v_codigo AND referencia_mes=v_mes
                  AND tela='calendario_producao_produtividade'
                  AND (indicador_nome,tabela_origem,coluna_origem,valor_meta,unidade,comparacao,observacao,ativo)
                    IS DISTINCT FROM (v_nome,v_tabela,'quantidade',r.valor,'aves','>=',NULL,true);
                INSERT INTO pcp.metas (indicador_codigo,indicador_nome,tela,tabela_origem,coluna_origem,
                    valor_meta,unidade,comparacao,referencia_mes,observacao,ativo,criado_em,atualizado_em)
                SELECT v_codigo,v_nome,'calendario_producao_produtividade',v_tabela,'quantidade',
                    r.valor,'aves','>=',v_mes,NULL,true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
                WHERE NOT EXISTS (SELECT 1 FROM pcp.metas WHERE indicador_codigo=v_codigo AND referencia_mes=v_mes);
            END IF;
        END LOOP;
    END LOOP;
END;
$carga$;
COMMIT;

SELECT referencia_mes,count(*) FILTER (WHERE ativo) AS metas_ativas
FROM pcp.metas WHERE tela='calendario_producao_produtividade'
  AND indicador_codigo ~ '^PROD_(AN_T1|AN_T2|RA)_(SEG|TER|QUA|QUI|SEX|SAB)$'
GROUP BY referencia_mes ORDER BY referencia_mes;
