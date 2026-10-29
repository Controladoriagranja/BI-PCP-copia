// Testes locais, com dados fictícios. Não acessam API ou banco.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../assets/js/pcp-cirurgico.js'),'utf8');
const context={window:{},ApiScreen:{escape:String},DOMException:class extends Error{constructor(message,name){super(message);this.name=name;}},APP_CONFIG:{endpoints:{modelo:'/api/pcp/tabelas',tabelaModelo:'/api/pcp/dados/'}},PcpMulti:{values:v=>String(v||'').split(',').filter(Boolean)}};
vm.runInNewContext(source.replace('return {mount};','return {mount,productivityTargets,productivityHeads,productivityReferenceMarkup};'),context);
const targets=context.window.PcpCirurgico.productivityTargets;
const weekdays=['SEG','TER','QUA','QUI','SEX','SAB'];
const base={'AN_T1':[65000,65000,65000,65000,65000,60000],'AN_T2':[55000,55000,50000,45000,45000,null],'RA':[80000,80000,80000,80000,80000,60000]};
const metas=Object.entries(base).flatMap(([series,values])=>values.flatMap((value,index)=>value==null?[]:[{
 indicador_codigo:'PROD_'+series+'_'+weekdays[index],referencia_mes:'2026-10-01',valor_meta:value,ativo:true,unidade:'aves',comparacao:'>=',tela:'calendario_producao_produtividade'
}]));
const row=(date,value,company='10')=>({data:date,empresa_codigo:company,quantidade_cabecas:value});
const grade=(rows,units='',company='10',goals=metas)=>JSON.parse(JSON.stringify(targets.grade(company,rows,goals,units)));
const reference=context.window.PcpCirurgico.productivityReferenceMarkup;
const positive=reference(114402,grade([row('2026-10-01',114402)]));
assert.match(positive,/>Meta<\/span><span>110\.000<\/span>/);
assert.match(positive,/class="cg-prod-good">\+4\.402<\/strong>/);
assert.match(reference(58363,grade([row('2026-10-03',58363)])),/class="cg-prod-bad">-1\.637<\/strong>/);
assert.match(reference(120000,grade([row('2026-10-05',120000)])),/class="cg-prod-good">0<\/strong>/);
const noGoal=reference(100,{meta:null,className:''});
assert.match(noGoal,/>Meta<\/span><span>—<\/span>/);assert.match(noGoal,/<strong>—<\/strong>/);
assert.doesNotMatch(noGoal,/NaN|Infinity|\+100/,'Sem meta não inventa diferença');
assert.deepEqual(grade([row('2026-10-05',120000)]),{className:'cg-prod-good',meta:120000});
assert.deepEqual(grade([row('2026-10-05',119999)]),{className:'cg-prod-bad',meta:120000});
assert.deepEqual(grade([row('2026-10-05',65000)],'1'),{className:'cg-prod-good',meta:65000});
assert.deepEqual(grade([row('2026-10-05',54999)],'2'),{className:'cg-prod-bad',meta:55000});
assert.deepEqual(grade([row('2026-10-03',60000)]),{className:'cg-prod-good',meta:60000});
assert.equal(grade([row('2026-10-03',0)],'2').className,'','Sábado 2T vazio não vira meta zero');
assert.equal(grade([row('2026-10-04',100)]).className,'','Domingo não possui meta');
assert.equal(grade([]).className,'','Ausência de realização não tem cor');
assert.equal(grade([row('2026-10-05',0)]).className,'cg-prod-bad','Zero realizado compara com a meta');
assert.equal(grade([row('2025-10-06',999999)]).className,'','Não transporta metas entre meses ou anos');
assert.deepEqual(grade([row('2026-10-05',119999),row('2026-10-06',120000)]),{className:'cg-prod-bad',meta:240000},'Somente os dois dias realizados entram na soma');
assert.deepEqual(grade([row('2026-10-05',80000,'111')],'111','111'),{className:'cg-prod-good',meta:80000});
assert.equal(grade([row('2026-10-05',79999,'111')],'111','111').className,'cg-prod-bad');
assert.deepEqual(grade([row('2026-10-05',80000,'111'),row('2026-10-05',999999,'10')],'','111'),{className:'cg-prod-good',meta:80000},'Avalia cada empresa separadamente');
const september=metas.map(m=>({...m,referencia_mes:'2026-09-01',valor_meta:m.indicador_codigo.includes('AN_T1')?70000:m.indicador_codigo.includes('AN_T2')?60000:m.valor_meta}));
assert.deepEqual(grade([row('2026-09-28',125000),row('2026-10-01',110000)],'','10',[...metas,...september]),{className:'cg-prod-bad',meta:240000},'Semana cheia usa a referência de cada mês');
assert.equal(grade([row('2026-09-28',125000),row('2026-10-01',110000)]).className,'','Período com mês sem meta não ganha cor parcial');
assert.equal(grade([row('2026-10-05',120000)],'10','10',[]).className,'');

module.exports=(async()=>{
 // Amostra real enviada pelo usuário em 29/10/2026. Recepção/Compra NÃO se somam a Abate.
 const raw=(date,turn,section,value)=>({data_referencia:date,empresa:'Ave Nova',empresa_codigo:'1',unidade_codigo:'10',turno_codigo:turn,secao:section,descricao:'Cabeças',quantidade:value});
 const records=[raw('2026-10-01','1','Abate - Total',63393),raw('2026-10-01','1','Recepção de Aves Vivas',63393),raw('2026-10-01','2','Abate - Total',51009),raw('2026-10-01','2','Recepção de Aves Vivas',51009),raw('2026-10-03','1','Abate - Total',58363),raw('2026-10-03','1','Recepção de Aves Vivas',58363),raw('2026-10-09','1','Abate - Total',63804),raw('2026-10-09','1','Compra de Aves Vivas',39501),raw('2026-10-09','1','Recepção de Aves Vivas',24303),raw('2026-10-09','2','Abate - Total',45111),raw('2026-10-09','2','Recepção de Aves Vivas',45111)];
 const catalog={ok:true,tabelas:['diario_industria_turnos','diario_industria','dados_gerais'].map(tabela=>({tabela,colunas:['data_referencia','empresa','empresa_codigo','turno_codigo','secao','descricao','quantidade']}))};
 const get=async(endpoint,params)=>{
  if(endpoint==='/api/pcp/tabelas')return catalog;
  const table=endpoint.split('/').pop();
  if(table==='diario_industria_turnos')assert.equal(params.secao,'Abate - Total');
  else assert.equal(params.secao,undefined,'Não introduz filtro de seção na Real Alimentos');
  const real={data_referencia:'2026-10-09',empresa:'Real Alimentos',empresa_codigo:'111',descricao:'Cabeças',quantidade:table==='dados_gerais'?80500:80560};
  // Deliberadamente devolve todas as seções e turnos: o cliente também valida os registros.
  const dados=table==='diario_industria_turnos'?records:[real];
  return {ok:true,tabela:table,pagina:1,tamanho:1000,total:dados.length,dados};
 };
 const heads=context.window.PcpCirurgico.productivityHeads;
 const load=units=>heads.load(get,[{year:2026,month:10}],units,{aborted:false},false,'2026-10-28');
 const all=await load('');
 assert.deepEqual(Array.from(all.filter(r=>r.empresa_codigo==='10'),r=>r.quantidade_cabecas),[114402,58363,108915]);
 assert.deepEqual(Array.from(await load('10'),r=>r.quantidade_cabecas),[114402,58363,108915]);
 assert.deepEqual(Array.from(await load('1'),r=>r.quantidade_cabecas),[63393,58363,63804]);
 assert.deepEqual(Array.from(await load('2'),r=>r.quantidade_cabecas),[51009,45111]);
 assert.deepEqual(Array.from(await load('111'),r=>r.quantidade_cabecas),[80560]);
 // O total mensal volta ao diário comum, inclusive onde não existe histórico por turno.
 const historyCalls=[];
 const historyGet=async(endpoint,params)=>{
  if(endpoint==='/api/pcp/tabelas')return catalog;
  const table=endpoint.split('/').pop();historyCalls.push(table);
  if(table==='diario_industria_turnos')return get(endpoint,params);
  const real={data_referencia:'2026-10-09',empresa:'Real Alimentos',empresa_codigo:'111',descricao:'Cabeças',quantidade:table==='dados_gerais'?80500:80560};
  const dados=table==='dados_gerais'?[real]:[
   raw('2026-01-02','0','Abate - Total',100),raw('2026-01-02','0','Recepção de Aves Vivas',100),
   raw('2026-01-03','0','Abate - Total',200),raw('2026-02-02','0','Abate - Total',300),
   raw('2026-10-01','0','Abate - Total',114402),raw('2026-10-29','0','Abate - Total',999999),real
  ];
  return {ok:true,tabela:table,pagina:1,tamanho:1000,total:dados.length,dados};
 };
 const historyPeriods=[{year:2026,month:1},{year:2026,month:2},{year:2026,month:10}];
 const monthly=await heads.load(historyGet,historyPeriods,'',{aborted:false},false,'2026-10-28','diario');
 const historyAN=monthly.filter(r=>r.empresa_codigo==='10');
 assert.deepEqual(Array.from(historyAN,r=>r.quantidade_cabecas),[100,200,300,114402]);
 assert.equal(historyAN.filter(r=>r.data.startsWith('2026-01')).reduce((sum,r)=>sum+r.quantidade_cabecas,0),300,'Janeiro recuperado do diário comum sem duplicar seções');
 assert.equal(historyCalls.includes('diario_industria_turnos'),false,'Total mensal não depende do histórico de turnos');
 assert.equal(monthly.find(r=>r.empresa_codigo==='111').quantidade_cabecas,80560);
 const monthlyTurn=await heads.load(historyGet,historyPeriods,'1',{aborted:false},false,'2026-10-28','diario');
 assert.deepEqual(Array.from(monthlyTurn,r=>r.quantidade_cabecas),[63393,58363,63804],'Seleção explícita de turno continua respeitando o turno');
 console.log('OK: mensal total usa diário comum, recupera meses anteriores, preserva MAX diário e D−1; calendário e filtro explícito de turno usam a fonte por turnos.');
 const day1=all.find(r=>r.data==='2026-10-01'&&r.empresa_codigo==='10');
 assert.equal(targets.grade('10',[day1],metas,'').meta,110000);
 assert.equal(targets.grade('10',[day1],metas,'').className,'cg-prod-good');
 assert.equal(targets.grade('10',[(await load('1'))[0]],metas,'1').className,'cg-prod-bad');
 console.log('OK: amostra real de 01, 03 e 09/10 reconciliada, sem dupla contagem de Recepção/Compra; filtros Todos, A.N., 1T, 2T e R.A. preservados.');
 const response=(dados,total=dados.length,pagina=1,tamanho=1000)=>({ok:true,tabela:'metas',dados,total,pagina,tamanho});
 let called=false;
 const loaded=await targets.load(async(endpoint,params)=>{
  called=true;assert.equal(endpoint,'/api/pcp/dados/metas');
  assert.equal(params.inicio,'2026-09-01');assert.equal(params.fim,'2026-10-01');
  assert.equal(params.tela,'calendario_producao_produtividade');assert.equal(params.ativo,'true');
  return response(metas);
 },[{year:2026,month:10}],{},true,'2026-10-28');
 assert.equal(called,true);assert.equal(loaded.length,17);
 for(const bad of [{...metas[0],valor_meta:-1},{...metas[0],valor_meta:''},{...metas[0],valor_meta:true},{...metas[0],referencia_mes:'2026-13-01'}]){
  await assert.rejects(targets.load(async()=>response([bad]),[{year:2026,month:10}],{},false,'2026-10-28'),/incompatíveis/);
 }
 await assert.rejects(targets.load(async()=>response([metas[0],metas[0]]),[{year:2026,month:10}],{},false,'2026-10-28'),/duplicadas/);
 let pages=0;
 const paged=await targets.load(async(endpoint,params)=>{
  pages++;return response(metas.slice((params.pagina-1)*2,params.pagina*2),metas.length,params.pagina,2);
 },[{year:2026,month:10}],{},false,'2026-10-28');
 assert.equal(pages,9);assert.equal(paged.length,17,'Leitura de metas usa todas as páginas');
 const scoped=await targets.load(async()=>response([metas[0],{...metas[0],tela:'rendimento'},{...metas[0],ativo:false},{...metas[0],referencia_mes:'2025-10-01'}]),[{year:2026,month:10}],{},false,'2026-10-28');
 assert.equal(scoped.length,1,'Metas de outra tela, inativas ou fora do mês não afetam Produtividade');
 const adjacent=await targets.load(async()=>response([...metas,...september]),[{year:2026,month:10}],{},true,'2026-10-28');
 assert.equal(adjacent.length,34,'Semana cheia inclui a referência de setembro, dia 1');
 await assert.rejects(targets.load(async()=>response([metas[0]],2,1,1000),[{year:2026,month:10}],{},false,'2026-10-28'),/Paginação/);
 await assert.rejects(targets.load(async(endpoint,params)=>response([metas[params.pagina-1]],params.pagina===1?2:3,params.pagina,1),[{year:2026,month:10}],{},false,'2026-10-28'),/mudaram/);
 await assert.rejects(targets.load(async()=>{throw Error('Não consultar após cancelar');},[{year:2026,month:10}],{aborted:true},false,'2026-10-28'),error=>error.name==='AbortError');
 await targets.load(async()=>{throw Error('Não consultar futuro');},[{year:2026,month:11}],{},false,'2026-10-28');
 console.log('OK: metas diárias, turnos, sábado vazio, domingo, zero realizado, ausência, somas, empresas separadas, vigência mensal, semana cheia, D−1 e contrato da API.');
})();
