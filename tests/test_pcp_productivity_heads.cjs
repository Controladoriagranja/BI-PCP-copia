// Executar com node tests/test_pcp_productivity_heads.cjs. Sem API ou banco reais.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const source = fs.readFileSync(path.join(__dirname, '../assets/js/pcp-cirurgico.js'), 'utf8');
const index = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
for (const asset of ['assets/js/pcp-cirurgico.js', 'assets/css/pcp.css']) {
  const version = crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, '..', asset))).digest('hex').slice(0, 12);
  assert.ok(index.includes(asset + '?v=' + version), `Atualizar versão de ${asset} no index para evitar cache antigo`);
}
const APP_CONFIG = { endpoints: { modelo: '/api/pcp/tabelas', tabelaModelo: '/api/pcp/dados/' } };
const context = { window: {}, ApiScreen: { escape: String }, APP_CONFIG,
  PcpMulti: { values: value => String(value ?? '').split(',').filter(Boolean) },
  DOMException: class extends Error { constructor(message, name) { super(message); this.name = name; } }
};
vm.runInNewContext(source.replace('return {mount};', 'return {mount,productivityHeads};'), context);
const rawHeads = context.window.PcpCirurgico.productivityHeads;
// Cada cenário informa um limite de dados; os históricos usam um limite posterior às suas datas fictícias.
const heads = { load: (get, periods, units, signal, fullWeek = false, limit = '2099-12-31') => rawHeads.load(get, periods, units, signal, fullWeek, limit) };
const table = name => ({ tabela: name,
  colunas: { descricao: 'text', quantidade: 'double precision', data_referencia: 'date', empresa_codigo: 'text', empresa: 'text', turno_codigo: 'text' },
  mapeamento: [{ coluna: 'descricao', nome_original: 'Descrição' }, { coluna: 'quantidade', nome_original: 'Quantidade' }]
});
const catalog = { ok: true, tabelas: [table('diario_industria'), table('diario_industria_turnos')] };
const row = (quantity, company = '10', overrides = {}) => ({
  data_referencia: '2026-10-09', empresa_codigo: company,
  empresa: company === '10' ? 'Ave Nova' : 'Real Alimentos',
  descricao: 'Cabeças', quantidade: quantity, indicador: 'Recepção de Aves Vivas', ...overrides
});
const records = [
  row(69414), row(39501, '10', { indicador: 'Abate - Total' }),
  row('108915.0', '10', { indicador: 'Outro indicador' }), row(80560, '111'),
  row(999999999, '10', { descricao: 'Kg' }), row(null), row(''), row('NaN'),
  row(0, '10', { data_referencia: '2026-10-10' }), row(999999999, '', { empresa: 'Sem identificação' }),
  row(50000, '10', { data_referencia: '2026-10-09T23:59:00-03:00' }),
  row(999999999, '10', { data_referencia: '2026-09-30' }), row(999999999, '10', { data_referencia: '2026-02-30' })
];
const periods = [{ year: 2026, month: 10 }];
const signal = { aborted: false };
const plain = value => JSON.parse(JSON.stringify(value));
function api(data = records, metadata = catalog) {
  const calls = [];
  const get = async (endpoint, params, options) => {
    calls.push({ endpoint, params }); assert.equal(options.signal, signal);
    if(endpoint === APP_CONFIG.endpoints.modelo) return metadata;
    assert.equal(params.descricao, 'Cabeças', 'Filtra pela coluna Descrição');
    assert.equal(params.indicador, undefined, 'Não confunde Descrição com indicador');
    assert.equal(params.inicio, '2026-10-01'); assert.equal(params.fim, '2026-10-31');
    const rows = data.filter(r => !params.empresa || r.empresa_codigo === params.empresa);
    const size = 2; // MAX deve considerar todas as páginas, mesmo com limite do servidor.
    return { ok: true, tabela: endpoint.split('/').pop(), pagina: params.pagina, tamanho: size, total: rows.length,
      dados: rows.slice((params.pagina - 1) * size, params.pagina * size) };
  };
  return { get, calls };
}
module.exports = (async () => {
  const all = api();
  const result = plain(await heads.load(all.get, periods, '', signal));
  assert.deepEqual(result, [
    { data: '2026-10-09', empresa_codigo: '10', empresa: 'Ave Nova', quantidade_cabecas: 108915 },
    { data: '2026-10-09', empresa_codigo: '111', empresa: 'Real Alimentos', quantidade_cabecas: 80560 },
    { data: '2026-10-10', empresa_codigo: '10', empresa: 'Ave Nova', quantidade_cabecas: 0 }
  ]);
  assert.equal(new Set(result.map(r => r.empresa_codigo + r.data)).size, result.length);
  assert.ok(all.calls.filter(c => c.params.pagina).length > 1);
  const selected = api();
  assert.deepEqual(plain(await heads.load(selected.get, periods, '10,111', signal)), result);
  assert.ok(selected.calls.filter(c => c.params.pagina).every(c => c.params.empresa === undefined), 'Não depende do código de importação para consultar a empresa');
  const shifts = api([row(69414, '10', { turno_codigo: '1' }), row(39501, '10', { turno_codigo: '2' }), row(80560, '111')]);
  const shifted = plain(await heads.load(shifts.get, periods, '1,111', signal));
  assert.deepEqual(shifted.map(r => [r.empresa_codigo, r.quantidade_cabecas]), [['10', 69414], ['111', 80560]]);
  assert.ok(shifts.calls.some(c => c.endpoint.endsWith('diario_industria_turnos') && c.params.turno === '1'));
  const bothShifts = api([row(69414, '10', { turno_codigo: '1' }), row(39501, '10', { turno_codigo: '2' })]);
  assert.equal((await heads.load(bothShifts.get, periods, '1,2', signal))[0].quantidade_cabecas, 69414);
  const lastPage = api([row(1), row(2), row(108915)]);
  assert.equal((await heads.load(lastPage.get, periods, '10', signal))[0].quantidade_cabecas, 108915);
  const empty = api([]); assert.deepEqual(plain(await heads.load(empty.get, periods, '', signal)), []);

  // Empresa original é respeitada mesmo quando os metadados possuem outros códigos.
  const importedCodes = api([row(108915, '01', { empresa: 'AVE NOVA' }), row(80560, '10', { empresa: 'Real Alimentos' })]);
  assert.deepEqual(plain(await heads.load(importedCodes.get, periods, '', signal)).map(r => [r.empresa_codigo, r.quantidade_cabecas]), [['10', 108915], ['111', 80560]]);
  assert.deepEqual(plain(await heads.load(importedCodes.get, periods, '10', signal)).map(r => r.empresa_codigo), ['10']);
  assert.deepEqual(plain(await heads.load(importedCodes.get, periods, '111', signal)).map(r => r.empresa_codigo), ['111']);
  assert.deepEqual(plain(await heads.load(importedCodes.get, periods, '10,111', signal)).map(r => r.empresa_codigo), ['10', '111']);

  // Real também pode estar no relatório diário Dados gerais, confirmado pelo catálogo.
  const splitCatalog = { ...catalog, tabelas: [...catalog.tabelas, table('dados_gerais')] };
  const sourceCalls = [];
  const splitSources = async (endpoint, params) => {
    if (endpoint === APP_CONFIG.endpoints.modelo) return splitCatalog;
    const sourceTable = endpoint.split('/').pop(); sourceCalls.push(sourceTable);
    assert.equal(params.empresa, undefined);
    assert.equal(params.descricao, 'Cabeças');
    const dados = sourceTable === 'dados_gerais' ? [row(80560, '10', { empresa: 'REAL' })] : [row(108915, '10', { empresa: 'Avenova' })];
    return { ok: true, tabela: sourceTable, total: dados.length, pagina: 1, tamanho: 1000, dados };
  };
  assert.deepEqual(plain(await heads.load(splitSources, periods, '', signal)).map(r => [r.empresa_codigo, r.quantidade_cabecas]), [['10', 108915], ['111', 80560]]);
  assert.deepEqual(sourceCalls, ['diario_industria', 'dados_gerais']);
  assert.deepEqual(plain(await heads.load(splitSources, periods, '10', signal)).map(r => r.empresa_codigo), ['10']);
  assert.deepEqual(plain(await heads.load(splitSources, periods, '111', signal)).map(r => r.empresa_codigo), ['111']);

  const missing = structuredClone(catalog); delete missing.tabelas[0].colunas.descricao;
  const invalid = api([], missing);
  await assert.rejects(heads.load(invalid.get, periods, '', signal), /Colunas/);
  assert.equal(invalid.calls.length, 1, 'Valida o catálogo antes de consultar os registros');
  const missingDate = structuredClone(catalog); delete missingDate.tabelas[0].colunas.data_referencia;
  await assert.rejects(heads.load(api([], missingDate).get, periods, '', signal), /Data ou empresa/);
  const missingTurn = structuredClone(catalog); delete missingTurn.tabelas[1].colunas.turno_codigo;
  await assert.rejects(heads.load(api([], missingTurn).get, periods, '1', signal), /Turno/);

  // Se o mapeamento real usar outros nomes, os filtros e a leitura seguem o catálogo.
  const renamed = structuredClone(catalog);
  renamed.tabelas[0].colunas.descricao_real = renamed.tabelas[0].colunas.descricao; delete renamed.tabelas[0].colunas.descricao;
  renamed.tabelas[0].mapeamento[0].coluna = 'descricao_real';
  const renamedGet = async (endpoint, params) => endpoint === APP_CONFIG.endpoints.modelo ? renamed : (
    assert.equal(params.descricao_real, 'Cabeças'),
    { ok: true, tabela: 'diario_industria', pagina: 1, tamanho: 1000, total: 1, dados: [{ ...row(108915), descricao: 'Kg', descricao_real: 'Cabeças' }] }
  );
  assert.equal((await heads.load(renamedGet, periods, '', signal))[0].quantidade_cabecas, 108915);

  const incomplete = async endpoint => endpoint === APP_CONFIG.endpoints.modelo ? catalog : ({ ok: true, tabela: 'diario_industria', pagina: 1, tamanho: 1000, total: 2, dados: [row(1)] });
  await assert.rejects(heads.load(incomplete, periods, '', signal), /Paginação/);
  const changed = async (endpoint, params) => endpoint === APP_CONFIG.endpoints.modelo ? catalog : ({ ok: true, tabela: 'diario_industria', pagina: params.pagina, tamanho: 1, total: params.pagina === 1 ? 2 : 3, dados: [row(1)] });
  await assert.rejects(heads.load(changed, periods, '', signal), /mudou durante/);
  await assert.rejects(heads.load(async () => { throw Error('Sem sessão'); }, periods, '', signal), /Sem sessão/);
  await assert.rejects(heads.load(async endpoint => {
    assert.equal(endpoint, APP_CONFIG.endpoints.modelo, 'Cancelamento impede consulta de registros'); return catalog;
  }, periods, '', { aborted: true }), error => error.name === 'AbortError');

  const boundaryRows = [row(100, '10', { data_referencia: '2026-09-28' }), row(10), row(999, '10', { data_referencia: '2026-11-01' })];
  const boundaryApi = (start, end, rows = boundaryRows) => async (endpoint, params) => {
    if (endpoint === APP_CONFIG.endpoints.modelo) return catalog;
    assert.equal(params.inicio, start); assert.equal(params.fim, end);
    return { ok: true, tabela: endpoint.split('/').pop(), total: rows.length, pagina: 1, tamanho: 1000, dados: rows };
  };
  const regular = await heads.load(boundaryApi('2026-10-01', '2026-10-31'), periods, '', signal, false);
  assert.deepEqual(plain(regular).map(r => r.data), ['2026-10-09']);
  const complete = await heads.load(boundaryApi('2026-09-27', '2026-10-31'), periods, '', signal, true);
  assert.deepEqual(plain(complete).map(r => r.data), ['2026-09-28', '2026-10-09']);
  await heads.load(boundaryApi('2024-01-28', '2024-03-02', []), [{ year: 2024, month: 2 }], '', signal, true);
  await heads.load(boundaryApi('2026-12-27', '2027-02-06', []), [{ year: 2027, month: 1 }], '', signal, true);
  const overlapGet = async (endpoint, params) => endpoint === APP_CONFIG.endpoints.modelo ? catalog : ({
    ok: true, tabela: endpoint.split('/').pop(), total: 1, pagina: 1, tamanho: 1000, dados: [row(70, '10', { data_referencia: '2026-10-31' })]
  });
  const overlap = await heads.load(overlapGet, [{ year: 2026, month: 10 }, { year: 2026, month: 11 }], '', signal, true);
  assert.equal(overlap.length, 1, 'Semanas compartilhadas por meses selecionados não duplicam o registro diário');
  assert.equal(overlap[0].quantidade_cabecas, 70);

  await assert.rejects(rawHeads.load(api().get, periods, '', signal), /Data limite/);
  await assert.rejects(rawHeads.load(api().get, periods, '', signal, false, '2026-02-30'), /Data limite/);
  const cutoffRows = [row(119543, '10', { data_referencia: '2026-10-27' }), row(26334, '10', { data_referencia: '2026-10-28' }), row(20064, '111', { data_referencia: '2026-10-28' })];
  const cutoffApi = boundaryApi('2026-10-01', '2026-10-27', cutoffRows);
  const cutoffResult = await rawHeads.load(cutoffApi, periods, '', signal, false, '2026-10-27');
  assert.deepEqual(plain(cutoffResult).map(r => r.data), ['2026-10-27'], 'Ignora registros após D−1 mesmo se a API os devolver');
  const cutoffComplete = await rawHeads.load(boundaryApi('2026-09-27', '2026-10-27', cutoffRows), periods, '', signal, true, '2026-10-27');
  assert.deepEqual(plain(cutoffComplete).map(r => r.data), ['2026-10-27']);
  let futureCalls = 0;
  const futureResult = await rawHeads.load(async () => { futureCalls++; throw Error('Não consultar mês futuro'); }, [{ year: 2026, month: 11 }], '', signal, false, '2026-10-27');
  assert.equal(futureCalls, 0); assert.equal(futureResult.length, 0);
  const cutoffYear = await rawHeads.load(boundaryApi('2026-12-27', '2026-12-31', [row(10, '10', { data_referencia: '2027-01-01' })]), [{ year: 2027, month: 1 }], '', signal, true, '2026-12-31');
  assert.equal(cutoffYear.length, 0, 'Semana cheia também respeita D−1 na virada de ano');

  // A apresentação e todos os totais também devem rejeitar dados posteriores ao limite.
  const displayedState = { status:'ready', limit:'2026-10-27', rows:[
    {data:'2026-10-27',empresa_codigo:'10',empresa:'Ave Nova',quantidade_cabecas:119543},
    {data:'2026-10-27',empresa_codigo:'111',empresa:'Real Alimentos',quantidade_cabecas:70952},
    {data:'2026-10-28',empresa_codigo:'10',empresa:'Ave Nova',quantidade_cabecas:26334},
    {data:'2026-10-28',empresa_codigo:'111',empresa:'Real Alimentos',quantidade_cabecas:20064}
  ] };
  const displayed = {
    getHeads: () => displayedState, fields:{Grupo:{value:''},Unidade:{value:''},Dia:{value:''}},
    selectedHeadCompanies: () => ['10','111'], headCompanies:{'10':'Ave Nova','111':'Real Alimentos'},
    PcpMulti:{includes:(value,item) => !value || value.split(',').includes(String(item))}
  };
  const dailyCode = source.slice(source.indexOf('  function dayHeads(date){'), source.indexOf('  function headsMarkup(rows){'));
  const totalCode = source.slice(source.indexOf('  function totals(dates){'), source.indexOf('  function totalCell(dates,kind,label){'));
  vm.runInNewContext(dailyCode + totalCode, displayed);
  assert.equal(displayed.dayHeads('2026-10-28').length, 0);
  assert.equal(displayed.dayHeads('2026-10-27').length, 2);
  assert.deepEqual(plain(displayed.totals(['2026-10-27','2026-10-28'])).map(r => r.quantidade_cabecas), [119543,70952], 'Totais não incluem os valores parciais do dia 28');
  displayedState.limit='2026-10-28';
  assert.deepEqual(plain(displayed.totals(['2026-10-27','2026-10-28'])).map(r => r.quantidade_cabecas), [145877,91016]);

  // Consultas antigas não podem repor valores de outro recorte ou outra flag.
  const pending = [];
  const state = {
    headsState: { status: 'idle', rows: [] }, headsKey: '', headsGeneration: 0, headsController: null,
    indicatorMode: 'rendimento', data: { data_limite: '2026-10-27' }, loading: false, fields: { Unidade: { value: '' } },
    productivity: { periods: () => periods, render() {} }, apiGet() {},
    AbortController: class { constructor() { this.signal = { aborted: false }; } abort() { this.signal.aborted = true; } },
    productivityHeads: { load(get, periods, units, signal, fullWeek, limit) { return new Promise((resolve, reject) => pending.push({ resolve, reject, signal, fullWeek, limit })); } }
  };
  const controller = source.slice(source.indexOf('  async function refreshHeads('), source.indexOf('  const dialog='));
  vm.runInNewContext(controller, state);
  await state.refreshHeads(); assert.equal(pending.length, 0, 'Rendimento não consulta Cabeças');
  state.indicatorMode = 'produtividade'; const first = state.refreshHeads();
  assert.equal(state.headsState.status, 'loading');
  assert.equal(pending[0].limit, '2026-10-27', 'Usa a mesma data limite apresentada no cabeçalho');
  state.fields.Unidade.value = '111'; const second = state.refreshHeads();
  assert.equal(pending[0].signal.aborted, true);
  pending[0].resolve([row(999)]); await first;
  assert.equal(state.headsState.status, 'loading', 'Resposta antiga descartada');
  pending[1].resolve(result); await second; assert.equal(state.headsState.status, 'ready');
  await state.refreshHeads(); assert.equal(pending.length, 2, 'Mesmo recorte não repete consulta');
  const third = state.refreshHeads(true); assert.equal(state.headsState.rows.length, 0);
  pending[2].reject(Error('Sem sessão')); await third;
  assert.equal(state.headsState.status, 'error'); assert.equal(state.headsState.rows.length, 0);
  const fourth = state.refreshHeads(true); state.indicatorMode = 'rendimento'; await state.refreshHeads();
  assert.equal(pending[3].signal.aborted, true);
  pending[3].resolve(result); await fourth;
  assert.equal(state.headsState.status, 'idle'); assert.equal(state.headsState.rows.length, 0);
  state.indicatorMode = 'produtividade'; state.fields.SemanaCheia = { checked: false };
  const fifth = state.refreshHeads(); assert.equal(pending[4].fullWeek, false);
  pending[4].resolve(result); await fifth;
  state.fields.SemanaCheia.checked = true;
  const sixth = state.refreshHeads(); assert.equal(pending[5].fullWeek, true, 'Semana cheia invalida o recorte e solicita dias vizinhos');
  pending[5].resolve(result); await sixth;
  state.data.data_limite = '2026-10-28';
  const seventh = state.refreshHeads(); assert.equal(pending[6].limit, '2026-10-28', 'Mudança do limite invalida os dados anteriores');
  pending[6].resolve(result); await seventh;
  assert.equal(state.headsState.limit, '2026-10-28');
  state.data = null; await state.refreshHeads();
  assert.equal(pending.length, 7, 'Não consulta produtividade antes de obter o limite do relatório');
  assert.equal(state.headsState.rows.length, 0);
  console.log('OK: MAX por empresa/data, Descrição exata, paginação completa, empresas e turnos separados, catálogo, datas civis, nulos e erros.');
  console.log('OK: consultas de Semana cheia incluem dias adjacentes, anos diferentes e não duplicam registros em períodos sobrepostos.');
  console.log('OK: D−1 limita consultas, registros, semanas completas e meses futuros conforme o cabeçalho.');
})();
