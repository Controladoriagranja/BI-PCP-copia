// Mede chamadas e reconcilia a carga anual; transporte local, sem API/banco reais.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..'),source=fs.readFileSync(path.join(root,'assets/js/pcp-cirurgico.js'),'utf8');
const fixture=require('./fixtures/produtividade-novembro-2026.json');
const periods=Array.from({length:12},(_,i)=>({year:2026,month:i+1})),limit='2026-11-03';
const rows=Array.from({length:11},(_,i)=>fixture.rows.map(row=>({...row,data_referencia:'2026-'+String(i+1).padStart(2,'0')+row.data_referencia.slice(7)}))).flat();
const metas=Array.from({length:11},(_,i)=>fixture.metas.filter(row=>row.referencia_mes==='2026-11-01').map(row=>({...row,referencia_mes:'2026-'+String(i+1).padStart(2,'0')+'-01'}))).flat();
const catalog={ok:true,tabelas:['diario_industria','diario_industria_turnos'].map(tabela=>({tabela,colunas:['data_referencia','empresa_codigo','empresa','turno_codigo','secao','descricao','quantidade']}))};
function transport(size=1000){
 const calls=[];
 async function get(endpoint,params={},options={}){
  calls.push({endpoint,params,signal:options.signal});
  if(options.signal?.aborted)throw Object.assign(new Error('Cancelada'),{name:'AbortError'});
  if(endpoint==='/api/pcp/tabelas')return catalog;
  const table=endpoint.split('/').pop();
  const selected=table==='metas'?metas.filter(row=>row.referencia_mes>=params.inicio&&row.referencia_mes<=params.fim):rows.filter(row=>row.fonte===table&&row.data_referencia>=params.inicio&&row.data_referencia<=params.fim&&row.descricao===params.descricao&&(!params.turno||row.turno_codigo===params.turno));
  return {ok:true,tabela:table,total:selected.length,pagina:params.pagina,tamanho:size,dados:selected.slice((params.pagina-1)*size,params.pagina*size)};
 }
 return {get,calls};
}
function app(text){
 const context={window:{},ApiScreen:{escape:String},PcpMulti:{values:v=>String(v||'').split(',').filter(Boolean)},APP_CONFIG:{endpoints:{modelo:'/api/pcp/tabelas',tabelaModelo:'/api/pcp/dados/'}},DOMException:class extends Error{constructor(message,name){super(message);this.name=name;}}};
 vm.runInNewContext(text.replace('return {mount};','return {mount,productivityHeads,productivityWeight,productivityTargets};'),context);
 return context.window.PcpCirurgico;
}
async function annual(text,size=1000){
 const api=app(text),{get,calls}=transport(size),signal={aborted:false};
 const result=await Promise.all([
  api.productivityHeads.load(get,periods,'',signal,false,limit,'diario'),
  api.productivityTargets.load(get,periods,signal,false,limit),
  api.productivityWeight.load(get,periods,'',signal,false,limit,'diario'),
  api.productivityHeads.load(get,periods,'10',signal,false,limit),
  api.productivityWeight.load(get,periods,'10',signal,false,limit)
 ]);
 return {result:JSON.parse(JSON.stringify(result)),calls};
}
module.exports=(async()=>{
 const fast=await annual(source);
 assert.equal(fast.calls.length,8,'Carga anual: um catálogo, seis buscas de dados e uma de metas, antes de páginas extras');
 assert.equal(fast.calls.filter(call=>call.endpoint==='/api/pcp/tabelas').length,1);
 assert.ok(fast.calls.filter(call=>call.params.descricao).every(call=>call.params.inicio==='2026-01-01'&&call.params.fim===limit),'Período contínuo anual limitado a D−1');
 const paginated=await annual(source,3);
 assert.deepEqual(paginated.result,fast.result,'Paginação não altera dados, turnos, peso ou metas');
 assert.ok(paginated.calls.some(call=>call.params.pagina>1));
 const api=app(source),{get,calls}=transport(),signal={aborted:false};
 const gap=await api.productivityHeads.load(get,[{year:2026,month:1},{year:2026,month:3}],'',signal,false,limit,'diario');
 assert.ok(gap.every(row=>['01','03'].includes(row.data.slice(5,7))),'Meses não selecionados não entram no intervalo');
 assert.equal(calls.filter(call=>call.params.descricao).length,2,'Intervalos separados permanecem separados');
 const previousCatalogs=calls.filter(call=>call.endpoint==='/api/pcp/tabelas').length;
 await api.productivityWeight.load(get,[{year:2026,month:1}],'',signal,false,limit,'diario');
 assert.equal(calls.filter(call=>call.endpoint==='/api/pcp/tabelas').length,previousCatalogs,'Compartilha catálogo na mesma carga');
 await api.productivityHeads.load(get,[{year:2026,month:1}],'',{aborted:false},false,limit,'diario');
 assert.equal(calls.filter(call=>call.endpoint==='/api/pcp/tabelas').length,previousCatalogs+1,'Nova carga consulta um catálogo novo');
 let failures=0;const retryGet=async(endpoint,params,options)=>{if(endpoint==='/api/pcp/tabelas'&&failures++===0)throw Error('Falha simulada');return get(endpoint,params,options);};
 await assert.rejects(api.productivityHeads.load(retryGet,periods,'10',signal,false,limit),/Falha simulada/);
 await api.productivityHeads.load(retryGet,periods,'10',signal,false,limit);
 const report={optimizedRequests:fast.calls.length,paginatedRequests:paginated.calls.length,resultsPreserved:true,transport:'simulado',limit};
 if(process.env.PCP_PERF_BASELINE){
  const before=await annual(fs.readFileSync(process.env.PCP_PERF_BASELINE,'utf8'));
  assert.deepEqual(fast.result,before.result,'Resultados integrais antes/depois devem ser idênticos');
  report.previousRequests=before.calls.length;
  report.reductionPercent=Math.round((1-fast.calls.length/before.calls.length)*10000)/100;
 }
 if(process.env.PCP_PERF_OUTPUT){fs.mkdirSync(path.dirname(process.env.PCP_PERF_OUTPUT),{recursive:true});fs.writeFileSync(process.env.PCP_PERF_OUTPUT,JSON.stringify(report,null,2));}
 console.log(JSON.stringify(report));
 console.log('OK: menos chamadas, resultados preservados, D−1, paginação, meses separados, catálogo por carga e recuperação de falhas.');
})();
