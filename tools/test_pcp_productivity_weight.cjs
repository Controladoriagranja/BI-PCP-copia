// Consulta simulada e amostras reais fornecidas pelo usuário; sem API/banco reais.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../assets/js/pcp-cirurgico.js'),'utf8');
const context={window:{},ApiScreen:{escape:String},APP_CONFIG:{endpoints:{modelo:'/api/pcp/tabelas',tabelaModelo:'/api/pcp/dados/'}},PcpMulti:{values:v=>String(v||'').split(',').filter(Boolean)},DOMException:class extends Error{constructor(message,name){super(message);this.name=name;}}};
vm.runInNewContext(source.replace('return {mount};','return {mount,productivityWeight,productivityWeightMarkup};'),context);
const {productivityWeight:weight,productivityWeightMarkup:markup}=context.window.PcpCirurgico;
const row=(date,company,turn,section,value,description='Peso Vivo para Rendimento')=>({data_referencia:date,empresa:company,empresa_codigo:company==='Ave Nova'?'1':'111',turno_codigo:turn,secao:section,descricao:description,quantidade:value});
const common=[
 row('2026-10-01','Ave Nova',null,'Abate - Total',339866),row('2026-10-01','Ave Nova',null,'Recepção de Aves Vivas',339866),
 row('2026-10-01','Real Alimentos',null,'Recepção de Aves Vivas',238560),
 row('2026-10-09','Ave Nova',null,'Abate - Total',282001),row('2026-10-09','Ave Nova',null,'Compra de Aves Vivas',110303),row('2026-10-09','Ave Nova',null,'Recepção de Aves Vivas',171698),
 row('2026-10-09','Real Alimentos',null,'Recepção de Aves Vivas',226798),
 // Casos sintéticos de zero, descrição diferente, nulo e dia posterior ao limite.
 row('2026-10-02','Ave Nova',null,'Recepção de Aves Vivas',0),
 row('2026-10-01','Ave Nova',null,'Abate - Total',99999999,'Peso Vivo(-D+A)'),
 row('2026-10-01','Ave Nova',null,'Abate - Total',114402,'Cabeças'),
 {...row('2026-10-01','Ave Nova',null,'Abate - Total',null),valor_texto:'999999'},
 row('2026-10-29','Ave Nova',null,'Abate - Total',99999999)
];
const turns=[
 row('2026-10-01','Ave Nova','1','Abate - Total',184709),row('2026-10-01','Ave Nova','1','Recepção de Aves Vivas',184709),
 row('2026-10-01','Ave Nova','2','Abate - Total',155157),row('2026-10-01','Ave Nova','2','Recepção de Aves Vivas',155157),
 row('2026-10-09','Ave Nova','1','Compra de Aves Vivas',110303),row('2026-10-09','Ave Nova','1','Recepção de Aves Vivas',63094),row('2026-10-09','Ave Nova','1','Abate - Total',173396),
 row('2026-10-09','Ave Nova','2','Recepção de Aves Vivas',108605),row('2026-10-09','Ave Nova','2','Abate - Total',108605),
 row('2026-10-02','Ave Nova','1','Recepção de Aves Vivas',0),
 row('2026-10-01','Ave Nova','1','Abate - Total',99999999,'Peso Vivo(-D+A)'),
 row('2026-10-01','Ave Nova','3','Abate - Total',99999999),
 // Histórico sem Abate e semana cheia: dados fictícios para testar cobertura.
 row('2026-07-30','Ave Nova','1','Recepção de Aves Vivas',101),row('2026-07-30','Ave Nova','2','Recepção de Aves Vivas',99),
 row('2026-09-30','Ave Nova','1','Recepção de Aves Vivas',5000),
 row('2026-10-29','Ave Nova','1','Abate - Total',99999999)
];
const catalog={ok:true,tabelas:['diario_industria','diario_industria_turnos'].map(tabela=>({tabela,colunas:['descricao','quantidade','data_referencia','empresa','empresa_codigo','turno_codigo','secao']}))};
const calls=[];
async function get(endpoint,params){
 if(endpoint==='/api/pcp/tabelas')return catalog;
 assert.equal(params.descricao,'Peso Vivo para Rendimento','Filtro exato da nova descrição');
 assert.equal(params.secao,undefined,'Peso não exclui histórico de Recepção');
 const table=endpoint.split('/').pop(),rows=table==='diario_industria'?common:turns,size=2;
 calls.push({table,params});
 // Devolve todas as descrições/turnos: validação local também deve rejeitar os demais.
 return {ok:true,tabela:table,pagina:params.pagina,tamanho:size,total:rows.length,dados:rows.slice((params.pagina-1)*size,params.pagina*size)};
}
const periods=[{year:2026,month:10}],signal={aborted:false};
const values=rows=>Array.from(rows,r=>r.peso_vivo);
module.exports=(async()=>{
 const calendar=await weight.load(get,periods,'10',signal,false,'2026-10-28');
 assert.deepEqual(values(calendar),[339866,0,282001]);
 assert.deepEqual(values(await weight.load(get,periods,'1',signal,false,'2026-10-28')),[184709,0,173396]);
 assert.deepEqual(values(await weight.load(get,periods,'2',signal,false,'2026-10-28')),[155157,108605]);
 assert.deepEqual(values(await weight.load(get,periods,'111',signal,false,'2026-10-28')),[238560,226798]);
 const monthly=await weight.load(get,periods,'',signal,false,'2026-10-28','diario');
 assert.deepEqual(Array.from(monthly,r=>[r.empresa_codigo,r.peso_vivo]),[['10',339866],['111',238560],['10',0],['10',282001],['111',226798]]);
 assert.equal(monthly.filter(r=>r.empresa_codigo==='10').reduce((sum,r)=>sum+r.peso_vivo,0),621867);
 assert.equal(monthly.filter(r=>r.empresa_codigo==='111').reduce((sum,r)=>sum+r.peso_vivo,0),465358);
 assert.equal(calls.some(c=>c.params.pagina>1),true,'Maior valor considera todas as páginas');
 assert.deepEqual(values(await weight.load(get,[{year:2026,month:7}],'10',signal,false,'2026-10-28')),[200],'Recepção histórica usa MAX por turno e soma os turnos');
 const complete=await weight.load(get,periods,'10',signal,true,'2026-10-28');
 assert.equal(complete[0].data,'2026-09-30');assert.equal(complete[0].peso_vivo,5000);
 assert.equal(calendar.some(r=>r.data>'2026-10-28'),false);
 await weight.load(async()=>{throw Error('Não consultar futuro');},[{year:2026,month:11}],'10',signal,false,'2026-10-28');
 assert.match(markup(339866),/Peso \(kg\).*339\.866/);
 assert.match(markup(0),/<strong>0<\/strong>/);assert.match(markup(null),/<strong>—<\/strong>/);
 assert.doesNotMatch(markup(339866),/Meta|Diferença|cg-prod-good|cg-prod-bad/,'Peso não usa metas/cores de Aves');
 console.log('OK: Peso Vivo para Rendimento exato, quantidade, MAX por empresa/dia/turno, soma dos turnos, diário comum mensal, amostras reais, histórico, paginação, D−1 e peso sem meta.');
})();
