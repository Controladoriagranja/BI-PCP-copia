// Reconciliação local da amostra SQL enviada em 04/11/2026.
// O transporte é simulado; não representa consulta à API publicada.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..'),source=fs.readFileSync(path.join(root,'assets/js/pcp-cirurgico.js'),'utf8');
const fixture=require('./fixtures/produtividade-novembro-2026.json');
const element=()=>({hidden:false,innerHTML:'',addEventListener(){},querySelectorAll:()=>[],lastElementChild:{append(){}}});
const monthsHost=element(),detail=element(),notice=element(),calendarRoot=element();
calendarRoot.querySelector=selector=>({'.cg-production-months':monthsHost,'.cg-production-detail':detail,'.cg-production-notice':notice}[selector]);
const PcpMulti={values:v=>String(v||'').split(',').filter(Boolean),includes:(v,x)=>!v||String(v).split(',').includes(String(x))};
const context={window:{},ApiScreen:{escape:String},PcpMulti,APP_CONFIG:{endpoints:{modelo:'/api/pcp/tabelas',tabelaModelo:'/api/pcp/dados/'}},DOMException,
 document:{createElement:tag=>tag==='section'?calendarRoot:element(),addEventListener(){}},requestAnimationFrame:fn=>fn(),ResizeObserver:class{observe(){}}};
vm.runInNewContext(source.replace('return {mount};','return {mount,productivityHeads,productivityWeight,productivityTargets,createProductivityCalendar,createProductivityMonthly};'),context);
const app=context.window.PcpCirurgico,periods=[{year:2026,month:11}],signal={aborted:false};
const catalog={ok:true,tabelas:['diario_industria','diario_industria_turnos'].map(tabela=>({tabela,colunas:['data_referencia','empresa_codigo','empresa','turno_codigo','secao','descricao','quantidade']}))};
async function get(endpoint,params){
 if(endpoint==='/api/pcp/tabelas')return catalog;
 const table=endpoint.split('/').pop();
 const rows=table==='metas'?fixture.metas.filter(r=>r.referencia_mes>=params.inicio&&r.referencia_mes<=params.fim&&r.ativo&&r.tela===params.tela):
  fixture.rows.filter(r=>r.fonte===table&&r.data_referencia>=params.inicio&&r.data_referencia<=params.fim&&r.descricao===params.descricao&&(!params.turno||r.turno_codigo===params.turno)&&(!params.secao||r.secao===params.secao));
 const size=3;
 return {ok:true,tabela:table,total:rows.length,pagina:params.pagina,tamanho:size,dados:rows.slice((params.pagina-1)*size,params.pagina*size)};
}
const fields={Ano:{value:'2026',options:[{value:'2026'}]},Mes:{value:'11'},Dia:{value:''},Unidade:{value:'10'},Grupo:{value:''},SemanaCheia:{checked:false}};
let state;const calendar=app.createProductivityCalendar({prepend(){}},fields,()=>{},()=>false,()=>state);calendar.root.hidden=false;
const checks=[];
const format=value=>value.toLocaleString('pt-BR',{maximumFractionDigits:6});
function check(html,expected,company,period){
 const [aves,weight,meta,difference]=expected;
 for(const [indicator,value,pattern] of [
  ['Aves',aves,new RegExp('>'+format(aves).replaceAll('.','\\.')+'(?:</strong> <small>aves| <small>aves</small></strong>)')],
  ['Peso (kg)',weight,new RegExp('>'+format(weight).replaceAll('.','\\.')+'</strong>')],
  ['Meta',meta,new RegExp('>Meta</span><span>'+format(meta).replaceAll('.','\\.')+'</span>')],
  ['Diferença',difference,new RegExp('>'+(difference>0?'\\+':'')+format(difference).replaceAll('.','\\.')+'</strong>')]
 ]){assert.match(html,pattern,company+' '+period+' '+indicator);checks.push({empresa:company,periodo:period,indicador:indicator,banco:value,api:'NÃO CONFERIDA — transporte simulado',interface_local:value,situacao:'OK LOCAL — publicação pendente'});}
}
const expected={
 '10':{name:'Ave Nova',days:[[101373,333330,120000,-18627],[120945,365885,120000,945]],total:[222318,699215,240000,-17682]},
 '1':{name:'Ave Nova — 1º turno',days:[[51699,168652,65000,-13301],[61545,191558,65000,-3455]],total:[113244,360210,130000,-16756]},
 '2':{name:'Ave Nova — 2º turno',days:[[49674,164678,55000,-5326],[59400,174327,55000,4400]],total:[109074,339005,110000,-926]},
 '111':{name:'Real Alimentos',days:[[74055,253435,80000,-5945],[68532,223670,80000,-11468]],total:[142587,477105,160000,-17413]}
};
module.exports=(async()=>{
 const metas=await app.productivityTargets.load(get,periods,signal,false,fixture.limit);assert.equal(metas.length,17);
 for(const [unit,values] of Object.entries(expected)){
  fields.Unidade.value=unit;
  state={status:'ready',limit:fixture.limit,metas,rows:await app.productivityHeads.load(get,periods,unit,signal,false,fixture.limit),pesos:await app.productivityWeight.load(get,periods,unit,signal,false,fixture.limit)};
  calendar.render();
  for(const [index,date] of ['2026-11-02','2026-11-03'].entries()){
   const html=monthsHost.innerHTML.match(new RegExp('<button[^>]*data-cg-day="'+date+'"[\\s\\S]*?</button>'))[0];
   check(html,values.days[index],values.name,date);
  }
  for(const kind of ['week-0','month']){
   const html=monthsHost.innerHTML.match(new RegExp('data-cg-total="'+kind+'"[^>]*>([\\s\\S]*?)</td>'))[1];
   check(html,values.total,values.name,kind==='month'?'Novembro até 03/11':'Semana de 01 a 07/11 até D−1');
  }
 }
 // O mensal mantém o diário comum e as duas empresas, sem o filtro de turno.
 const monthlyState={status:'ready',limit:fixture.limit,metas,rows:await app.productivityHeads.load(get,periods,'',signal,false,fixture.limit,'diario'),pesos:await app.productivityWeight.load(get,periods,'',signal,false,fixture.limit,'diario')};
 fields.Unidade.value='both';
 const box={innerHTML:'',scrollTop:0,scrollLeft:0,querySelector:()=>({style:{}})},status={};
 const monthly=app.createProductivityMonthly({querySelector:s=>s==='p'?status:box,closest:()=>null},fields,()=>monthlyState,()=> '2026-11');monthly.render();
 const monthlyRow=box.innerHTML.match(/<tr data-cg-month-period="2026-11"[^>]*>(.*?)<\/tr>/)[1],cells=[...monthlyRow.matchAll(/<td[^>]*>(.*?)<\/td>/g)].map(m=>m[1]);
 check(cells[0],[222318,699213,240000,-17682],'Ave Nova','Mensal novembro até 03/11');
 check(cells[1],[142587,477105,160000,-17413],'Real Alimentos','Mensal novembro até 03/11');
 check(cells[2],[364905,1176318,400000,-35095],'Ave Nova + Real Alimentos','Mensal novembro até 03/11');
 // Diferença real entre fontes: não corrigir artificialmente os pesos.
 assert.equal(expected['10'].total[1]-monthlyState.pesos.filter(r=>r.empresa_codigo==='10').reduce((sum,r)=>sum+r.peso_vivo,0),2);
 assert.equal(checks.length,76);
 if(process.env.PCP_AUDIT_OUTPUT){
  const out=path.resolve(process.env.PCP_AUDIT_OUTPUT);fs.mkdirSync(path.dirname(out),{recursive:true});
  const columns=Object.keys(checks[0]),escape=v=>'"'+String(v).replaceAll('"','""')+'"';
  fs.writeFileSync(out,'\uFEFF'+[columns.map(escape).join(';'),...checks.map(r=>columns.map(c=>escape(r[c])).join(';'))].join('\n')+'\n','utf8');
 }
 console.log('OK: 76 comparações locais nos dias, semanas, totais do calendário e mensal; quatro opções de unidade; 17 metas de novembro; diferença de 2 kg entre fontes preservada. API real não consultada.');
})();
