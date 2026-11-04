// Prioridade de seção solicitada pelo usuário: Abate, depois Recepção, sem outras seções.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../assets/js/pcp-cirurgico.js'),'utf8');
const context={window:{},ApiScreen:{escape:String},PcpMulti:{values:v=>String(v||'').split(',').filter(Boolean)},APP_CONFIG:{endpoints:{modelo:'/api/pcp/tabelas',tabelaModelo:'/api/pcp/dados/'}},DOMException:class extends Error{}};
vm.runInNewContext(source.replace('return {mount};','return {mount,productivityHeads,productivityWeight};'),context);
const app=context.window.PcpCirurgico;
const row=(value,secao,turno_codigo='1',empresa='Ave Nova',data_referencia='2026-11-02',descricao='Cabeças')=>({quantidade:value,secao,turno_codigo,empresa,data_referencia,descricao,empresa_codigo:'1'});
const turns=[
 row(500,'Compra de Aves Vivas'),row(100,'Recepção de Aves Vivas'),row(40,'Abate - Total'),row(50,'Abate - Total'),
 row(400,'Compra de Aves Vivas','2'),row(30,'Recepção de Aves Vivas','2'),row(20,'Recepção de Aves Vivas','2'),
 row(0,'Abate - Total','1','Ave Nova','2026-11-03'),row(999,'Recepção de Aves Vivas','1','Ave Nova','2026-11-03'),
 row(500,'Compra de Aves Vivas','1','Ave Nova','2026-11-04'),
 row(null,'Abate - Total','1','Ave Nova','2026-11-05'),row(10,'Recepção de Aves Vivas','1','Ave Nova','2026-11-05'),
 row(999999,'Abate - Total','1','Ave Nova','2026-11-02','Cabeças Plano'),
 row(1000,'Recepção de Aves Vivas','1','Ave Nova','2026-11-02','Peso Vivo para Rendimento'),row(900,'Abate - Total','1','Ave Nova','2026-11-02','Peso Vivo para Rendimento')
];
const common=[row(200,'Compra de Aves Vivas'),row(70,'Recepção de Aves Vivas'),row(30,'Recepção de Aves Vivas','1','Real Alimentos')];
const extra=[row(10,'Abate - Total','1','Real Alimentos')];
const catalog={ok:true,tabelas:['diario_industria','diario_industria_turnos','dados_gerais'].map(tabela=>({tabela,colunas:['secao','descricao','quantidade','data_referencia','empresa_codigo','empresa','turno_codigo']}))};
const api=reverse=>async(endpoint,params)=>{
 if(endpoint==='/api/pcp/tabelas')return catalog;
 assert.equal(params.secao,undefined,'Todas as páginas devem ser lidas antes de escolher a seção');
 const table=endpoint.split('/').pop(),raw=table==='diario_industria_turnos'?turns:table==='dados_gerais'?extra:common;
 const rows=(reverse?[...raw].reverse():raw).filter(r=>r.descricao===params.descricao),size=2;
 return {ok:true,tabela:table,total:rows.length,pagina:params.pagina,tamanho:size,dados:rows.slice((params.pagina-1)*size,params.pagina*size)};
};
const periods=[{year:2026,month:11}],signal={aborted:false};
module.exports=(async()=>{
 for(const reverse of [false,true]){
  const get=api(reverse),load=(unit,source='turnos')=>app.productivityHeads.load(get,periods,unit,signal,false,'2026-11-05',source);
  const rows=await load('10');
  assert.deepEqual(Array.from(rows,r=>[r.data,r.quantidade_cabecas]),[['2026-11-02',80],['2026-11-03',0],['2026-11-05',10]]);
  assert.equal(rows.some(r=>r.data==='2026-11-04'),false,'Sem Abate ou Recepção, mantém ausência de produção e não usa Compra');
  assert.equal((await load('1'))[0].quantidade_cabecas,50,'Abate vence mesmo com Quantidade menor');
  assert.equal((await load('2'))[0].quantidade_cabecas,30,'MAX de Recepção quando não há Abate no turno');
  assert.equal((await load('111'))[0].quantidade_cabecas,10,'Prioridade entre fontes da Real Alimentos');
  assert.deepEqual(Array.from(await load('','diario'),r=>[r.empresa_codigo,r.quantidade_cabecas]),[['10',70],['111',10]],'Mensal aplica a prioridade por empresa/dia');
  assert.equal((await app.productivityWeight.load(get,periods,'1',signal,false,'2026-11-05'))[0].peso_vivo,1000,'Peso mantém MAX sem prioridade de seção');
 }
 console.log('OK: Abate antes de Recepção, MAX na seção escolhida, zero válido, sem outras seções, paginação/ordem independentes, cada turno/dia/empresa, calendário e mensal; Peso preservado.');
})();
