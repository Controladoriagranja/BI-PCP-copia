"""Compara MAX diário antigo com SUM(1T)+SUM(2T) de Abate - Total da A.N.; somente SELECT."""
from __future__ import annotations

import argparse
import csv
import unicodedata
from datetime import date, datetime, timedelta
from decimal import Decimal
from pathlib import Path
from zoneinfo import ZoneInfo

from produtividade_config import ROOT, carregar_env, conectar


def empresa(row):
    nome = unicodedata.normalize('NFKD', str(row.get('empresa') or '')).encode('ascii', 'ignore').decode().lower()
    nome = ''.join(c for c in nome if c.isalnum())
    if nome in {'an', 'avenova'} or 'avenova' in nome:
        return '10'
    if nome in {'ra', 'real', 'realalimentos'} or 'realalimentos' in nome:
        return '111'
    return str(row.get('empresa_codigo') or '').lstrip('0')


def consultar(conn, tabela, inicio, fim):
    if tabela not in {'diario_industria', 'diario_industria_turnos'}:
        raise ValueError('Tabela fora da reconciliação autorizada.')
    with conn.cursor() as cur:
        cur.execute('SELECT column_name FROM information_schema.columns WHERE table_schema=%s AND table_name=%s', ('pcp', tabela))
        colunas = {r[0] for r in cur.fetchall()}
        exigidas = {'data_referencia', 'empresa_codigo', 'descricao', 'quantidade'}
        if tabela.endswith('_turnos'):
            exigidas.update({'turno_codigo', 'secao'})
        if not exigidas <= colunas:
            raise ValueError('Estrutura divergente em pcp.' + tabela + ': ' + ', '.join(sorted(exigidas - colunas)))
        # Os identificadores interpolados pertencem exclusivamente à lista fixa acima.
        nome = 'empresa' if 'empresa' in colunas else 'NULL AS empresa'
        turno = 'turno_codigo' if 'turno_codigo' in colunas else 'NULL AS turno_codigo'
        filtro_secao = ' AND secao=%s' if tabela.endswith('_turnos') else ''
        params = ('Cabeças', inicio, fim) + (('Abate - Total',) if filtro_secao else ())
        cur.execute(f'SELECT data_referencia,empresa_codigo,{nome},quantidade,{turno} FROM pcp.{tabela} '
                    'WHERE descricao=%s AND data_referencia>=%s AND data_referencia<=%s' + filtro_secao, params)
        return [dict(zip(('data', 'empresa_codigo', 'empresa', 'quantidade', 'turno'), r)) for r in cur.fetchall()]


def comparar(antigo, novo):
    antigos, turnos = {}, {}
    for row in antigo:
        if empresa(row) != '10' or row['quantidade'] is None:
            continue
        dia, valor = str(row['data'])[:10], Decimal(str(row['quantidade']))
        antigos[dia] = max(antigos[dia], valor) if dia in antigos else valor
    for row in novo:
        if empresa(row) != '10' or str(row['turno']) not in {'1', '2'} or row['quantidade'] is None:
            continue
        dia, turno, valor = str(row['data'])[:10], str(row['turno']), Decimal(str(row['quantidade']))
        turnos.setdefault(dia, {})[turno] = turnos.get(dia, {}).get(turno, Decimal(0)) + valor
    resultado = []
    for dia in sorted(set(antigos) | set(turnos)):
        valores = turnos.get(dia, {})
        total = sum(valores.values(), Decimal(0)) if valores else None
        anterior = antigos.get(dia)
        resultado.append({'data': dia, 'an_1t': valores.get('1'), 'an_2t': valores.get('2'),
                          'an_novo_total': total, 'an_diario_anterior': anterior,
                          'diferenca': total - anterior if total is not None and anterior is not None else None})
    return resultado


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--env', type=Path)
    parser.add_argument('--inicio', type=date.fromisoformat, default=date(2026, 10, 1))
    parser.add_argument('--fim', type=date.fromisoformat, default=date(2026, 10, 31))
    parser.add_argument('--saida', type=Path, default=ROOT / 'outputs/metas-produtividade/reconciliacao-an-out2026.csv')
    args = parser.parse_args(argv)
    carregar_env(args.env)
    fim = min(args.fim, datetime.now(ZoneInfo('America/Sao_Paulo')).date() - timedelta(days=1))
    if args.inicio > fim:
        raise ValueError('Recorte sem datas realizadas até D−1.')
    with conectar(somente_leitura=True) as conn:
        conn.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')
        resultado = comparar(consultar(conn, 'diario_industria', args.inicio, fim),
                             consultar(conn, 'diario_industria_turnos', args.inicio, fim))
    args.saida.parent.mkdir(parents=True, exist_ok=True)
    with args.saida.open('w', newline='', encoding='utf-8-sig') as arquivo:
        writer = csv.DictWriter(arquivo, fieldnames=['data', 'an_1t', 'an_2t', 'an_novo_total', 'an_diario_anterior', 'diferenca'], delimiter=';')
        writer.writeheader(); writer.writerows(resultado)
    print({'dias': len(resultado), 'dias_com_diferenca': sum(r['diferenca'] not in (None, 0) for r in resultado),
           'dias_sem_base_comparavel': sum(r['diferenca'] is None for r in resultado), 'arquivo': str(args.saida)})


if __name__ == '__main__':
    main()
