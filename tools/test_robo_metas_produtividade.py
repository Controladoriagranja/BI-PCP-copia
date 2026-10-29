"""Testes locais: planilhas temporárias e conexão simulada, sem banco real."""
import copy
import sys
import tempfile
import unittest
from contextlib import contextmanager
from datetime import date
from decimal import Decimal
from pathlib import Path
from unittest.mock import MagicMock

from openpyxl import Workbook

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import robo_metas_produtividade as robo
from reconciliar_produtividade import comparar, consultar


class Cursor:
    def __init__(self, conn):
        self.conn = conn
        self.rows = []
        self.rowcount = 0

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def execute(self, sql, params=()):
        self.conn.queries.append(sql)
        assert sql.count('%s') == len(params)
        query = ' '.join(sql.lower().split())
        assert not query.startswith(('create ', 'alter ', 'drop ', 'truncate ', 'delete '))
        self.rows, self.rowcount = [], 0
        if query.startswith('select current_database'):
            self.rows = [(self.conn.database,)]
        elif query.startswith('select is_identity'):
            self.rows = [('YES' if self.conn.identity else 'NO', None)]
        elif 'information_schema.columns' in query:
            self.rows = [(c,) for c in self.conn.columns]
        elif 'select exists' in query:
            self.rows = [(self.conn.unique,)]
        elif 'having count(*)>1' in query:
            self.rows = [('duplicada',)] if self.conn.duplicate else []
        elif query.startswith('select indicador_codigo,referencia_mes,tela'):
            self.rows = [(code, month, value['tela']) for (code, month), value in self.conn.data.items() if code in robo.CODIGOS]
        elif query.startswith('update pcp.metas set ativo=false'):
            code, month, screen = params
            old = self.conn.data.get((code, month))
            if old and old['tela'] == screen and old['ativo'] is not False:
                old['ativo'] = False
                self.rowcount = 1
        elif query.startswith('update pcp.metas set indicador_nome'):
            code, month, screen = params[7:10]
            new = dict(zip(('nome', 'tela', 'tabela', 'coluna', 'valor', 'unidade', 'comparacao'), params[:7]), ativo=True)
            old = self.conn.data.get((code, month))
            if old and old['tela'] == screen and old != new:
                self.conn.data[(code, month)] = new
                self.rowcount = 1
        elif query.startswith('insert into pcp.metas'):
            code, month = params[0], params[8]
            if (code, month) not in self.conn.data:
                self.conn.data[(code, month)] = dict(zip(('nome', 'tela', 'tabela', 'coluna', 'valor', 'unidade', 'comparacao'), params[1:8]), ativo=True)
                self.rowcount = 1
        elif not query.startswith('lock table'):
            raise AssertionError(query)

    def fetchall(self):
        return self.rows

    def fetchone(self):
        return self.rows[0]


class Connection:
    def __init__(self):
        self.data, self.queries = {}, []
        self.database, self.columns = 'bi_granja', robo.COLUNAS.copy()
        self.unique, self.duplicate = False, False
        self.identity = True

    def cursor(self):
        return Cursor(self)

    @contextmanager
    def transaction(self):
        before = copy.deepcopy(self.data)
        try:
            yield
        except Exception:
            self.data = before
            raise


class MetasTests(unittest.TestCase):
    def workbook(self, path, change=None):
        wb = Workbook()
        ws = wb.active
        ws.append(['Dia', '1T', '2T', 'Real Alimentos'])
        for day, first, second, real in [('SEGUNDA-FEIRA',65000,55000,80000),('terça',65000,55000,80000),('Quarta',65000,50000,80000),('quinta',65000,45000,80000),('sexta',65000,45000,80000),('SABADO',60000,None,60000)]:
            ws.append([day, first, second, real])
        if change:
            ws[change[0]] = change[1]
        wb.save(path)
        wb.close()

    def values(self):
        return {code: None if code == 'PROD_AN_T2_SAB' else Decimal(65000) for code in robo.CODIGOS}

    def test_excel_headers_days_blank_and_copy(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'metas.xlsx'
            self.workbook(path)
            original = path.read_bytes()
            values = robo.ler_planilha(path)
            self.assertEqual(path.read_bytes(), original)
            self.assertEqual(len(values), 18)
            self.assertEqual(values['PROD_AN_T1_SEG'], Decimal(65000))
            self.assertIsNone(values['PROD_AN_T2_SAB'])

    def test_invalid_excel_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'metas.xlsx'
            for change in [('B1','Turno 1'),('A3','segunda'),('A3',None),('A7','domingo'),('B2',-1),('B2','65000'),('B2','=65000')]:
                with self.subTest(change=change):
                    self.workbook(path, change)
                    with self.assertRaises(ValueError):
                        robo.ler_planilha(path)

    def test_numbers(self):
        for value in (-1, float('nan'), float('inf'), True, 'dez'):
            with self.assertRaises(ValueError):
                robo.validar_numero(value, 'B2')
        self.assertEqual(robo.validar_numero(0, 'B2'), 0)
        self.assertIsNone(robo.validar_numero(' ', 'B2'))

    def test_initial_idempotence_and_unrelated_rows(self):
        conn = Connection()
        conn.data[('REND_EXISTENTE',date(2026,10,1))] = {'tela':'rendimento','valor':123}
        first = robo.gravar(conn, self.values(), date(2026,10,29))
        self.assertEqual(first['inseridas'], 17 * 12)
        self.assertFalse(first['indice_unico'])
        before = copy.deepcopy(conn.data)
        second = robo.gravar(conn, self.values(), date(2026,10,29))
        self.assertEqual(conn.data, before)
        self.assertEqual((second['inseridas'],second['atualizadas'],second['desativadas']), (0,0,0))
        self.assertEqual(second['preservadas'], 17 * 9)
        self.assertEqual(conn.data[('REND_EXISTENTE',date(2026,10,1))], {'tela':'rendimento','valor':123})
        self.assertNotIn(('PROD_AN_T2_SAB',date(2026,10,1)), conn.data)

    def test_updates_preserve_history_and_deactivate_blank(self):
        conn = Connection()
        values = self.values()
        robo.gravar(conn, values, date(2026,10,29))
        values['PROD_AN_T1_SEG'], values['PROD_AN_T2_SEG'] = Decimal(66000), None
        result = robo.gravar(conn, values, date(2026,10,29))
        self.assertEqual((result['atualizadas'],result['desativadas']), (3,3))
        self.assertEqual(conn.data[('PROD_AN_T1_SEG',date(2026,9,1))]['valor'], 65000)
        self.assertEqual(conn.data[('PROD_AN_T1_SEG',date(2026,10,1))]['valor'], 66000)
        self.assertTrue(conn.data[('PROD_AN_T2_SEG',date(2026,9,1))]['ativo'])
        self.assertFalse(conn.data[('PROD_AN_T2_SEG',date(2026,10,1))]['ativo'])
        conn.unique = True
        self.assertTrue(robo.gravar(conn, values, date(2026,10,29))['indice_unico'])

    def test_schema_database_duplicates_and_foreign_screen_cancel(self):
        for defect in ('database','columns','duplicate','screen','identity'):
            conn = Connection()
            if defect == 'database': conn.database = 'outro'
            elif defect == 'columns': conn.columns.remove('referencia_mes')
            elif defect == 'duplicate': conn.duplicate = True
            elif defect == 'identity': conn.identity = False
            else: conn.data[('PROD_AN_T1_SEG',date(2026,10,1))] = {'tela':'outra'}
            before = copy.deepcopy(conn.data)
            with self.assertRaises(ValueError):
                robo.gravar(conn, self.values(), date(2026,10,29))
            self.assertEqual(conn.data, before)

    def test_next_year_keeps_previous_year_untouched(self):
        conn = Connection()
        robo.gravar(conn, self.values(), date(2026,10,29))
        history = copy.deepcopy(conn.data)
        values = {code: None if value is None else Decimal(70000) for code,value in self.values().items()}
        result = robo.gravar(conn, values, date(2027,1,2))
        self.assertEqual(result['inseridas'],17 * 12)
        self.assertEqual(result['preservadas'],17 * 12)
        self.assertTrue(all(conn.data[key] == value for key,value in history.items()))
        self.assertEqual(conn.data[('PROD_AN_T1_SEG',date(2027,1,1))]['valor'],70000)

    def test_reconciliation_sums_both_turns_and_preserves_absence(self):
        def row(value, turn=None, day='2026-10-09', name='Ave Nova'):
            return {'data':day,'empresa':'Ave Nova' if name == 'Ave Nova' else name,'empresa_codigo':'10','quantidade':value,'turno':turn}
        result = comparar([row(69414),row(108915)], [row(40000,1),row(29414,1),row(39501,2),row(999999,3),row(80560,1,name='Real Alimentos'),row(0,1,'2026-10-10')])
        self.assertEqual(result[0]['an_novo_total'], 108915)
        self.assertEqual(result[0]['diferenca'], 0)
        self.assertEqual(result[1]['an_novo_total'], 0)
        self.assertIsNone(result[1]['diferenca'])

    def test_reconciliation_query_filters_abate_only_for_turns(self):
        conn = MagicMock()
        cursor = conn.cursor.return_value.__enter__.return_value
        columns = [(c,) for c in ('data_referencia','empresa_codigo','empresa','descricao','quantidade','turno_codigo','secao')]
        cursor.fetchall.side_effect = [columns, [(date(2026,10,1),'1','Ave Nova',63393,'1')]]
        result = consultar(conn,'diario_industria_turnos',date(2026,10,1),date(2026,10,28))
        query, params = cursor.execute.call_args.args
        self.assertIn('secao=%s',query)
        self.assertEqual(params,('Cabeças',date(2026,10,1),date(2026,10,28),'Abate - Total'))
        self.assertEqual(result[0]['quantidade'],63393)


if __name__ == '__main__':
    unittest.main(verbosity=2)
