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
assert.equal((monthHost.innerHTML.match(/<th scope="col">/g) || []).length, 7);
assert.match(monthHost.innerHTML, /<abbr title="Segunda-feira">Seg/);
assert.match(monthHost.innerHTML, /<tbody><tr>(<td class="cg-production-outside" aria-hidden="true"><\/td>){3}<td><button[^>]*data-cg-day="2024-02-01"/);
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
let toggle, creations = 0, scrolls = 0;
const integration = source.slice(source.indexOf('  const yieldPanels='), source.indexOf("  indicatorFlags.setAttribute('aria-label'"));
vm.runInNewContext(integration, {
  content: { children: panels }, fields,
  createProductivityCalendar() { creations++; return { root: productivityRoot, render() {} }; },
  PcpPeriodFlags: { create(id, initial, callback) { assert.equal(initial, 'rendimento'); toggle = callback; return {}; } },
  requestAnimationFrame: callback => callback(), scrollTablesToLatest: () => scrolls++, load() {}, refreshHeads() {}, loading: false
});
const filterState = JSON.stringify(fields);
for (let attempt = 0; attempt < 3; attempt++) {
  toggle('produtividade'); assert.ok(panels.every(p => p.hidden)); assert.equal(productivityRoot.hidden, false);
  toggle('rendimento'); assert.ok(panels.every(p => !p.hidden)); assert.equal(productivityRoot.hidden, true);
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
console.log('OK: isolamento e alternância, filtros, seleção, navegação, limites de anos, multisseleção e meses de 28/29/30/31 dias.');
