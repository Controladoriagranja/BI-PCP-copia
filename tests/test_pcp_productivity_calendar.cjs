// Testes locais sem API, navegador, dependências ou dados reais.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../assets/js/pcp-cirurgico.js'), 'utf8');
new vm.Script(source);

class Element {
  constructor() { this.hidden = false; this.html = ''; this.buttons = []; this.listeners = {}; }
  set innerHTML(value) {
    this.html = value;
    this.buttons = [...value.matchAll(/<button\b([^>]*)>/g)].map(([, attrs]) => ({
      dataset: { cgDay: /data-cg-day="([^"]+)"/.exec(attrs)?.[1] },
      disabled: /\bdisabled\b/.test(attrs),
      setAttribute(name, value) { this[name] = value; }
    }));
  }
  get innerHTML() { return this.html; }
  querySelector(selector) { return this.children[selector]; }
  querySelectorAll(selector) { return selector === '[data-cg-month]' ? this.arrows : this.buttons; }
  addEventListener(type, handler) { this.listeners[type] = handler; }
  clickDay(date) {
    const button = this.children['.cg-production-months'].buttons.find(b => b.dataset.cgDay === date);
    assert.ok(button, `Dia ${date} deve existir`);
    this.listeners.click({ target: { closest: s => s === '[data-cg-day]' ? button : null } });
  }
  clickArrow(direction) {
    const button = this.arrows.find(b => b.dataset.cgMonth === String(direction));
    this.listeners.click({ target: { closest: s => s === '[data-cg-month]' ? button : null } });
  }
}
const document = {
  createElement() {
    const element = new Element();
    element.children = { '.cg-production-months': new Element(), '.cg-production-detail': new Element(), '.cg-production-notice': new Element() };
    element.arrows = [-1, 1].map(direction => ({ dataset: { cgMonth: String(direction) } }));
    return element;
  }
};
const PcpMulti = {
  values: value => String(value ?? '').split(',').filter(Boolean),
  includes: (value, item) => !value || String(value).split(',').includes(String(item))
};
const esc = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const helper = source.slice(source.indexOf(' function createProductivityCalendar('), source.indexOf(' function mount(){'));
const companyHelpers = source.slice(source.indexOf(' const headCompanies='), source.indexOf(' // Fonte bruta'));
const create = vm.runInNewContext(companyHelpers + helper + '\ncreateProductivityCalendar;', { document, PcpMulti, esc });
const fields = { Ano: { value: '2024', options: [2023, 2024, 2025].map(value => ({ value: String(value) })) }, Mes: { value: '2' }, Dia: { value: '' } };
let loading = false;
const calendar = create({ prepend() {} }, fields, ({ year, month }) => {
  fields.Ano.value = String(year); fields.Mes.value = String(month); fields.Dia.value = ''; calendar.render();
}, () => loading);
assert.equal(calendar.root.hidden, true, 'Calendário começa oculto em Rendimento');
calendar.root.hidden = false;
const monthHost = calendar.root.children['.cg-production-months'];
const detail = calendar.root.children['.cg-production-detail'];
const render = (year, month, day = '') => {
  fields.Ano.value = year; fields.Mes.value = month; fields.Dia.value = day; calendar.render();
};
calendar.render();
assert.equal(monthHost.buttons.length, 29, 'Fevereiro bissexto tem 29 dias');
assert.equal((monthHost.innerHTML.match(/<th scope="col">/g) || []).length, 8);
assert.match(monthHost.innerHTML, /<thead><tr><th scope="col"><abbr title="Domingo">Dom/);
assert.match(monthHost.innerHTML, /<abbr title="Segunda-feira">Seg/);
assert.match(monthHost.innerHTML, /<tbody><tr>(<td class="cg-production-outside" aria-hidden="true"><\/td>){4}<td><button[^>]*data-cg-day="2024-02-01"/);
assert.equal(detail.hidden, true);
calendar.root.clickDay('2024-02-29');
assert.equal(detail.hidden, false);
assert.match(detail.innerHTML, /29 de fevereiro de 2024/);
assert.match(detail.innerHTML, /Quantidade de cabeças ainda não consultada/);
assert.equal(monthHost.buttons.find(b => b.dataset.cgDay === '2024-02-29')['aria-pressed'], 'true');
render('2023', '2');
assert.equal(monthHost.buttons.length, 28, 'Fevereiro comum tem 28 dias');
assert.equal(detail.hidden, true, 'Troca de período remove detalhe anterior');
render('2024', '4'); assert.equal(monthHost.buttons.length, 30);
render('2024', '10'); assert.equal(monthHost.buttons.length, 31);
render('2024', '2', '2024-02-10');
assert.deepEqual(monthHost.buttons.filter(b => !b.disabled).map(b => b.dataset.cgDay), ['2024-02-10']);
calendar.root.clickDay('2024-02-11'); assert.equal(detail.hidden, true, 'Dia fora do filtro não abre detalhe');
calendar.root.clickDay('2024-02-10'); assert.equal(detail.hidden, false);
render('2024', '2', '2024-02-11'); assert.equal(detail.hidden, true, 'Filtro remove detalhe incompatível');
render('2024', '1,2'); assert.equal(monthHost.buttons.length, 60, 'Multisseleção mantém os dois meses');
render('2023,2024', '2'); assert.equal(monthHost.buttons.length, 57, 'Multisseleção mantém os dois anos');
render('2024', ''); assert.equal(monthHost.buttons.length, 366, 'Todos os meses em ano bissexto');
render('2024', '12'); calendar.root.clickArrow(1);
assert.equal(fields.Ano.value, '2025'); assert.equal(fields.Mes.value, '1');
calendar.root.clickArrow(-1); assert.equal(fields.Ano.value, '2024'); assert.equal(fields.Mes.value, '12');
render('2023', '1'); assert.equal(calendar.root.arrows[0].disabled, true, 'Respeita os anos disponíveis');
render('2025', '12'); assert.equal(calendar.root.arrows[1].disabled, true);
render('2024', '2'); loading = true; calendar.render();
assert.ok(calendar.root.arrows.every(b => b.disabled), 'Evita navegação concorrente durante consulta');
loading = false; calendar.render();
const previousHTML = monthHost.innerHTML;
calendar.root.hidden = true; fields.Mes.value = '3'; calendar.render();
assert.equal(monthHost.innerHTML, previousHTML, 'Não renderiza calendário com Rendimento ativo');
calendar.root.hidden = false; calendar.render(); assert.equal(monthHost.buttons.length, 31);
assert.doesNotMatch(monthHost.innerHTML, /cg-good|cg-bad|cg-indicator-button|\d+[%]/, 'Não apresenta rendimento ou desempenho sem dados');

// Alternância usa as mesmas instâncias de tabelas, sem reconstruir Rendimento.
const panels = [{ hidden: false, innerHTML: 'diário original' }, { hidden: false, innerHTML: 'mensal original' }];
const productivityRoot = { hidden: true };
const weekFilter = { hidden: true };
let toggle, creations = 0, scrolls = 0;
const integration = source.slice(source.indexOf('  const yieldPanels='), source.indexOf("  indicatorFlags.setAttribute('aria-label'"));
vm.runInNewContext(integration, {
  content: { children: panels }, fields, indicatorWeekFilter: weekFilter,
  createProductivityCalendar() { creations++; return { root: productivityRoot, render() {} }; },
  PcpPeriodFlags: { create(id, initial, callback) { assert.equal(initial, 'rendimento'); toggle = callback; return {}; } },
  requestAnimationFrame: callback => callback(), scrollTablesToLatest: () => scrolls++, load() {}, refreshHeads() {}, loading: false
});
const filterState = JSON.stringify(fields);
for (let attempt = 0; attempt < 3; attempt++) {
  toggle('produtividade'); assert.ok(panels.every(p => p.hidden)); assert.equal(productivityRoot.hidden, false);
  assert.equal(weekFilter.hidden, false);
  toggle('rendimento'); assert.ok(panels.every(p => !p.hidden)); assert.equal(productivityRoot.hidden, true);
  assert.equal(weekFilter.hidden, true, 'Filtro de Semana cheia não aparece em Rendimento');
}
assert.equal(creations, 1, 'Alternância não duplica calendário');
assert.equal(scrolls, 3);
assert.equal(JSON.stringify(fields), filterState, 'Alternância preserva filtros');
assert.deepEqual(panels.map(p => p.innerHTML), ['diário original', 'mensal original']);

// Valores são os mesmos no calendário e no detalhe, sem consolidar empresas.
let headsState = { status: 'ready', rows: [
  { data: '2024-02-09', empresa_codigo: '10', empresa: 'Ave Nova', quantidade_cabecas: 108915 },
  { data: '2024-02-09', empresa_codigo: '111', empresa: 'Real Alimentos', quantidade_cabecas: 80560 }
] };
fields.Grupo = { value: '' }; fields.Ano.value = '2024'; fields.Mes.value = '2'; fields.Dia.value = '';
const filled = create({ prepend() {} }, fields, () => {}, () => false, () => headsState);
filled.root.hidden = false; filled.render();
const filledHost = filled.root.children['.cg-production-months'];
assert.match(filledHost.innerHTML, /Ave Nova<\/span><strong>108\.915/);
assert.match(filledHost.innerHTML, /Real Alimentos<\/span><strong>80\.560/);
assert.ok(filledHost.innerHTML.indexOf('Ave Nova</span><strong>108.915') < filledHost.innerHTML.indexOf('Real Alimentos</span><strong>80.560'), 'Ave Nova fica acima da Real');
fields.Unidade = { value: '10' }; filled.render();
assert.match(filledHost.innerHTML, /108\.915/); assert.doesNotMatch(filledHost.innerHTML, /Real Alimentos<\/span><strong>/);
fields.Unidade.value = '111'; filled.render();
assert.match(filledHost.innerHTML, /80\.560/); assert.doesNotMatch(filledHost.innerHTML, /Ave Nova<\/span><strong>/);
fields.Unidade.value = '1'; filled.render();
assert.match(filledHost.innerHTML, /108\.915/); assert.doesNotMatch(filledHost.innerHTML, /Real Alimentos<\/span><strong>/);
fields.Unidade.value = ''; filled.render();
filled.root.clickDay('2024-02-09');
const filledDetail = filled.root.children['.cg-production-detail'];
assert.match(filledDetail.innerHTML, /Ave Nova · Cabeças<\/dt><dd>108\.915/);
assert.match(filledDetail.innerHTML, /Real Alimentos · Cabeças<\/dt><dd>80\.560/);
assert.doesNotMatch(filledDetail.innerHTML, /189\.475/);
headsState.rows = headsState.rows.filter(row => row.empresa_codigo === '10'); filled.render();
assert.match(filledHost.innerHTML, /Real Alimentos<\/span><strong>—/, 'Empresa sem registro mantém linha identificada com traço');
assert.match(filled.root.children['.cg-production-notice'].textContent, /Real Alimentos: sem registros/);
filled.root.clickDay('2024-02-10'); assert.match(filledDetail.innerHTML, /Sem registros de Cabeças/);
fields.Grupo.value = 'familias'; filled.render(); assert.doesNotMatch(filledHost.innerHTML, /108\.915|80\.560/);
fields.Grupo.value = 'producao'; filled.render(); assert.match(filledHost.innerHTML, /108\.915/);
headsState = { status: 'loading', rows: [] }; filled.render();
assert.doesNotMatch(filledHost.innerHTML, /108\.915|80\.560/);
headsState = { status: 'error', rows: [] }; filled.render();
assert.match(filledDetail.innerHTML, /Não foi possível consultar Cabeças/);

// Totais somam os máximos diários por empresa, sem combinar empresas diferentes.
fields.Ano.value = '2026'; fields.Ano.options = [2025, 2026, 2027].map(value => ({ value: String(value) }));
fields.Mes.value = '10'; fields.Dia.value = ''; fields.Unidade.value = ''; fields.Grupo.value = '';
fields.SemanaCheia = { checked: false };
const dailyValues = [
  ['2026-09-27', 2, 1], ['2026-09-28', 100, 50],
  ['2026-10-01', 10, 5], ['2026-10-02', 20, 7], ['2026-10-03', 0, null],
  ['2026-10-04', 3, 4], ['2026-10-05', 30, 8], ['2026-10-09', 40, 9],
  ['2026-10-31', 7, 2], ['2026-11-01', 999, 999]
];
headsState = { status: 'ready', rows: dailyValues.flatMap(([data, an, ra]) => [
  { data, empresa_codigo: '10', empresa: 'Ave Nova', quantidade_cabecas: an },
  ...(ra == null ? [] : [{ data, empresa_codigo: '111', empresa: 'Real Alimentos', quantidade_cabecas: ra }])
]) };
filled.render();
const cellTotals = kind => {
  const cell = new RegExp('data-cg-total="' + kind + '">([\\s\\S]*?)</td>').exec(filledHost.innerHTML)?.[1];
  assert.ok(cell, `Total ${kind} deve existir`);
  return Object.fromEntries([...cell.matchAll(/<span><span>([^<]+)<\/span><strong>([^<]+)/g)].map(([, company, value]) => [company, value.trim() === '—' ? null : Number(value.replaceAll('.', ''))]));
};
assert.deepEqual(cellTotals('week-0'), { 'Ave Nova': 30, 'Real Alimentos': 12 });
assert.deepEqual(cellTotals('week-1'), { 'Ave Nova': 73, 'Real Alimentos': 21 });
assert.deepEqual(cellTotals('weekday-0'), { 'Ave Nova': 3, 'Real Alimentos': 4 });
assert.deepEqual(cellTotals('weekday-1'), { 'Ave Nova': 30, 'Real Alimentos': 8 });
assert.deepEqual(cellTotals('weekday-5'), { 'Ave Nova': 60, 'Real Alimentos': 16 });
assert.deepEqual(cellTotals('month'), { 'Ave Nova': 110, 'Real Alimentos': 35 });
assert.match(filledHost.innerHTML, /Total do mês/);
assert.doesNotMatch(filledHost.innerHTML, /data-cg-day="2026-09-28"/);
assert.equal(filledHost.buttons.length, 31);
for (const company of ['Ave Nova', 'Real Alimentos']) {
  assert.equal(Array.from({ length: 5 }, (_, week) => cellTotals('week-' + week)[company] ?? 0).reduce((a, b) => a + b), cellTotals('month')[company]);
  assert.equal(Array.from({ length: 7 }, (_, day) => cellTotals('weekday-' + day)[company] ?? 0).reduce((a, b) => a + b), cellTotals('month')[company]);
}
fields.SemanaCheia.checked = true; filled.render();
assert.equal(filledHost.buttons.length, 35);
assert.equal(filledHost.buttons[0].dataset.cgDay, '2026-09-27');
assert.equal(filledHost.buttons.at(-1).dataset.cgDay, '2026-10-31');
assert.deepEqual(cellTotals('week-0'), { 'Ave Nova': 132, 'Real Alimentos': 63 });
assert.deepEqual(cellTotals('weekday-1'), { 'Ave Nova': 130, 'Real Alimentos': 58 });
assert.deepEqual(cellTotals('month'), { 'Ave Nova': 212, 'Real Alimentos': 86 });
assert.match(filledHost.innerHTML, /Total do período/);
filled.root.clickDay('2026-09-28'); assert.match(filledDetail.innerHTML, /28 de setembro de 2026/);
fields.SemanaCheia.checked = false; filled.render(); assert.equal(filledDetail.hidden, true);
fields.SemanaCheia.checked = true; fields.Dia.value = '2026-10-02'; filled.render();
assert.deepEqual(cellTotals('month'), { 'Ave Nova': 20, 'Real Alimentos': 7 });
fields.Dia.value = ''; fields.Unidade.value = '111'; filled.render();
assert.deepEqual(cellTotals('month'), { 'Real Alimentos': 86 });
fields.Unidade.value = ''; fields.Dia.value = '2026-10-03'; filled.render();
assert.deepEqual(cellTotals('month'), { 'Ave Nova': 0, 'Real Alimentos': null }, 'Diferencia zero real de ausência de registros');
fields.Dia.value = ''; fields.Grupo.value = 'familias'; filled.render();
assert.deepEqual(cellTotals('month'), {}, 'Totais respeitam o filtro de grupo');
fields.Grupo.value = '';
fields.Ano.value = '2024'; fields.Mes.value = '2'; filled.render();
assert.equal(filledHost.buttons[0].dataset.cgDay, '2024-01-28');
assert.equal(filledHost.buttons.at(-1).dataset.cgDay, '2024-03-02');
fields.Ano.value = '2027'; fields.Mes.value = '1'; filled.render();
assert.equal(filledHost.buttons[0].dataset.cgDay, '2026-12-27');
assert.equal(filledHost.buttons.at(-1).dataset.cgDay, '2027-02-06');

// Conferência dos totais de Cabeças apresentados nos dois prints de referência.
const octoberHeads = { 1:114402,2:109714,3:58363,5:118114,6:120632,7:114319,8:119237,9:108915,10:59704,13:103020,14:119095,15:112662,16:111702,17:61392,19:118068,20:113355,21:113635,22:110015,23:107646,24:60309,26:117212,27:119543,28:70719 };
headsState = { status: 'ready', rows: Object.entries(octoberHeads).map(([day, value]) => ({ data:'2026-10-'+day.padStart(2,'0'),empresa_codigo:'10',empresa:'Ave Nova',quantidade_cabecas:value })) };
headsState.rows.push(...[['2026-09-28',118809],['2026-09-29',120101],['2026-09-30',123757]].map(([data, value]) => ({data,empresa_codigo:'10',empresa:'Ave Nova',quantidade_cabecas:value})));
fields.Ano.value='2026'; fields.Mes.value='10'; fields.Unidade.value='10'; fields.SemanaCheia.checked=false; filled.render();
assert.equal(cellTotals('month')['Ave Nova'],2361773);
assert.equal(cellTotals('weekday-1')['Ave Nova'],353394);
assert.equal(cellTotals('week-0')['Ave Nova'],282479);
fields.SemanaCheia.checked=true; filled.render();
assert.equal(cellTotals('month')['Ave Nova'],2724440);
assert.equal(cellTotals('weekday-1')['Ave Nova'],472203);
assert.equal(cellTotals('week-0')['Ave Nova'],645146);
console.log('OK: isolamento e alternância, filtros, seleção, navegação, limites de anos, multisseleção e meses de 28/29/30/31 dias.');
console.log('OK: totais por empresa/semana/dia da semana/mês, Semana cheia, limites entre anos e meses e distinção entre zero e ausência.');
console.log('OK: totais dos prints reproduzidos: 2.361.773 no mês e 2.724.440 com Semana cheia.');
