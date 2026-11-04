// Confere os totais do mensal com dados locais, sem API ou banco.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..'),source=fs.readFileSync(path.join(root,'assets/js/pcp-cirurgico.js'),'utf8');
const box={scrollTop:0,scrollLeft:0,innerHTML:'',table:{style:{}},querySelector(){return this.table;}};
const status={},host={querySelector:selector=>selector==='p'?status:box,closest:()=>null};
const context={window:{},ApiScreen:{escape:String},PcpMulti:{values:v=>String(v||'').split(',').filter(Boolean),includes:(v,x)=>!v||v.split(',').includes(x)},requestAnimationFrame:fn=>fn(),ResizeObserver:class{observe(){}}};
vm.runInNewContext(source.replace('return {mount};','return {mount,createProductivityMonthly};'),context);
const row=(data,empresa_codigo,quantidade_cabecas)=>({data,empresa_codigo,quantidade_cabecas});
const goal=(code,month,value)=>({indicador_codigo:'PROD_'+code,referencia_mes:'2026-'+month+'-01',valor_meta:value,ativo:true});
const state={status:'ready',limit:'2026-10-28',rows:[row('2026-01-02','10',100),row('2026-01-02','111',200),row('2026-02-02','10',50),row('2026-02-02','111',0),row('2026-10-29','10',999999),row('2025-01-02','10',999999)],pesos:[
 {data:'2026-01-02',empresa_codigo:'10',peso_vivo:300},{data:'2026-01-02',empresa_codigo:'111',peso_vivo:600},{data:'2026-02-02',empresa_codigo:'10',peso_vivo:150},{data:'2026-02-02',empresa_codigo:'111',peso_vivo:0},{data:'2026-10-29',empresa_codigo:'10',peso_vivo:999999}
],metas:[goal('AN_T1_SEX','01',60),goal('AN_T2_SEX','01',40),goal('RA_SEX','01',220),goal('AN_T1_SEG','02',30),goal('AN_T2_SEG','02',30),goal('RA_SEG','02',20)]};
const fields={Ano:{value:'2026',options:[{value:'2025'},{value:'2026'}]},Grupo:{value:''}};
const monthly=context.window.PcpCirurgico.createProductivityMonthly(host,fields,()=>state,()=> '2026-11');
const getRow=attribute=>box.innerHTML.match(new RegExp('<tr[^>]*'+attribute+'[^>]*>(.*?)</tr>'))[1];
const cells=html=>[...html.matchAll(/<td[^>]*>(.*?)<\/td>/g)].map(m=>m[1]);
function expectCell(html,aves,weight,meta,difference){
 assert.match(html,new RegExp('cg-monthly-quantity"><strong[^>]*>'+aves+'<'));
 assert.match(html,new RegExp('Peso \\(kg\\)</span><strong>'+weight+'<'));
 assert.match(html,new RegExp('>Meta</span><span>'+meta+'<'));
 assert.match(html,new RegExp('>Diferença</span><strong[^>]*>'+difference+'<'));
}
monthly.render();
assert.match(box.innerHTML,/>Total do mês</);
assert.equal((box.innerHTML.match(/data-cg-total-year=/g)||[]).length,1);
expectCell(cells(getRow('data-cg-month-period="2026-01"'))[2],300,900,320,-20);
expectCell(cells(getRow('data-cg-month-period="2026-02"'))[2],50,150,80,-30);
const annual=cells(getRow('data-cg-total-year="2026"'));
expectCell(annual[0],150,450,160,-10);expectCell(annual[1],200,600,240,-40);expectCell(annual[2],350,'1\\.050',400,-50);
assert.doesNotMatch(box.innerHTML,/999\.999/,'D−1 e ano selecionado limitam os totais');
const empty=cells(getRow('data-cg-month-period="2026-03"'))[2];
assert.match(empty,/cg-monthly-quantity">—/);assert.doesNotMatch(empty,/cg-prod-(?:good|bad)/);
// Meta incompleta não ganha cor nem referência parcial no consolidado.
state.metas=state.metas.filter(m=>m.indicador_codigo!=='PROD_RA_SEX');monthly.render();
const incomplete=cells(getRow('data-cg-month-period="2026-01"'))[2];
assert.match(incomplete,/>Meta<\/span><span>—</);assert.doesNotMatch(incomplete,/cg-prod-(?:good|bad)/);
// A rolagem horizontal e vertical é preservada durante atualizações.
box.scrollTop=120;box.scrollLeft=180;state.pesos[0].peso_vivo=301;monthly.render();
assert.equal(box.scrollTop,120);assert.equal(box.scrollLeft,180);
fields.Ano.value='';monthly.render();assert.equal((box.innerHTML.match(/data-cg-total-year=/g)||[]).length,2);
const css=fs.readFileSync(path.join(root,'assets/css/pcp.css'),'utf8');
assert.match(css,/#cgProdutividade \.cg-monthly-scroll\{[^}]*overflow:auto/);
assert.match(css,/#cgProdutividade \.cg-monthly-pivot\{[^}]*min-width:0/);
console.log('OK: totais mensais e anuais por empresa e consolidados, peso sem meta, D−1, ausência, metas incompletas e rolagem horizontal.');
