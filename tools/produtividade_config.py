"""Configuração compartilhada dos utilitários PCP; nunca registra credenciais."""
from __future__ import annotations

import importlib.util
import os
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def carregar_env(arquivo: Path | None = None) -> None:
    arquivo = arquivo or ROOT / '.env'
    if not arquivo.exists():
        return
    for linha in arquivo.read_text(encoding='utf-8-sig').splitlines():
        linha = linha.strip()
        if not linha or linha.startswith('#'):
            continue
        chave, separador, valor = linha.removeprefix('export ').partition('=')
        chave, valor = chave.strip(), valor.strip()
        if not separador or not re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]*', chave):
            raise ValueError('Linha inválida no arquivo de configuração.')
        if valor[:1] in {'"', "'"}:
            if len(valor) < 2 or valor[-1] != valor[0]:
                raise ValueError('Aspas inválidas no arquivo de configuração.')
            valor = valor[1:-1]
        else:
            valor = re.split(r'\s+#', valor, maxsplit=1)[0].rstrip()
        os.environ.setdefault(chave, valor)


def parametros_banco() -> dict | str:
    caminho = os.environ.get('PCP_CONFIG_BANCO')
    if caminho:
        arquivo = Path(caminho).expanduser().resolve()
        spec = importlib.util.spec_from_file_location('_config_pcp_produtividade', arquivo)
        if spec is None or spec.loader is None:
            raise ValueError('Configuração PCP não localizada.')
        modulo = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(modulo)
        return {destino: getattr(modulo, origem) for destino, origem in (
            ('host', 'DB_HOST'), ('port', 'DB_PORT'), ('dbname', 'DB_NAME'),
            ('user', 'DB_USER'), ('password', 'DB_PASSWORD'))}
    if os.environ.get('PCP_DATABASE_URL'):
        return os.environ['PCP_DATABASE_URL']
    faltantes = [nome for nome in ('PGHOST', 'PGDATABASE', 'PGUSER', 'PGPASSWORD') if not os.environ.get(nome)]
    if faltantes:
        raise ValueError('Configuração ausente: ' + ', '.join(faltantes))
    return {'host': os.environ['PGHOST'], 'dbname': os.environ['PGDATABASE'],
            'user': os.environ['PGUSER'], 'password': os.environ['PGPASSWORD'],
            'port': os.environ.get('PGPORT', '5432')}


def conectar(*, somente_leitura: bool = False):
    import psycopg
    parametros = parametros_banco()
    opcoes = '-c statement_timeout=30000 -c lock_timeout=10000'
    if somente_leitura:
        opcoes += ' -c default_transaction_read_only=on'
    extras = {'connect_timeout': 8, 'options': opcoes}
    return psycopg.connect(parametros, **extras) if isinstance(parametros, str) else psycopg.connect(**parametros, **extras)
