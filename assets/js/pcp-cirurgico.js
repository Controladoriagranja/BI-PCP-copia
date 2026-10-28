"use strict";
window.PcpCirurgico=(()=>{
 const esc=ApiScreen.escape,pct=v=>v==null?'—':(v*100).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+'%';
 const cols={'1':'1º turno - AN','2':'2º turno - AN','10':'Ave Nova - AN','111':'Real Alimentos'};
 // Fonte bruta já publicada. Nenhum indicador ou peso de Rendimento participa desta seleção.
 const productivityHeads=(()=>{
  function schema(catalog,table){
   const entry=catalog.tabelas?.find(t=>t.tabela===table);
   if(!entry)throw Error('Fonte de Cabeças não disponível no catálogo PCP.');
   const columns=Array.isArray(entry.colunas)?entry.colunas.map(c=>typeof c==='string'?c:c.nome):Object.keys(entry.colunas||{});
   const original=name=>{
    const matches=(entry.mapeamento||[]).filter(m=>String(m.nome_original).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()===name);
    const column=matches.length===1?matches[0].coluna:name;
    if(matches.length>1||!columns.includes(column))throw Error('Colunas de Cabeças não confirmadas pelo catálogo PCP.');
    return column;
   };
   const description=original('descricao'),quantity=original('quantidade');
   if(!columns.includes('data_referencia')||!columns.includes('empresa_codigo'))throw Error('Data ou empresa não confirmada no catálogo PCP.');
   if(table==='diario_industria_turnos'&&!columns.includes('turno_codigo'))throw Error('Turno não confirmado no catálogo PCP.');
   return {description,quantity,date:'data_referencia',company:'empresa_codigo',name:columns.includes('empresa')?'empresa':null};
  }
  function civilDate(value){
   const match=/^(\d{4}-\d{2}-\d{2})(?:$|[T ])/.exec(String(value??''));
   if(!match)return null;
   const parsed=new Date(match[1]+'T00:00:00Z');
   return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===match[1]?match[1]:null;
  }
  function quantity(value){
   if(typeof value==='number')return Number.isFinite(value)?value:null;
   if(typeof value!=='string'||!/^[-+]?\d+(?:\.\d+)?$/.test(value.trim()))return null;
   const number=Number(value);return Number.isFinite(number)?number:null;
  }
  function collect(target,rows,columns,params){
   for(const row of rows){
    if(row[columns.description]!=='Cabeças')continue;
    const date=civilDate(row[columns.date]),company=String(row[columns.company]??'').trim(),value=quantity(row[columns.quantity]);
    if(!date||!company||value===null||date<params.inicio||date>params.fim)continue;
    if(params.empresa&&company!==params.empresa)continue;
    if(params.turno&&String(row.turno_codigo)!==params.turno)continue;
    const key=company+'|'+date,previous=target.get(key),name=String((columns.name&&row[columns.name])||({'10':'Ave Nova','111':'Real Alimentos'}[company])||company);
    // MAX, inclusive entre páginas: nunca somar nem escolher o primeiro registro.
    if(!previous||value>previous.quantidade_cabecas||(value===previous.quantidade_cabecas&&name<previous.empresa))target.set(key,{data:date,empresa_codigo:company,empresa:name,quantidade_cabecas:value});
   }
  }
  function scopes(units){
   const selected=PcpMulti.values(units);
   if(!selected.length)return [{table:'diario_industria'}];
   return selected.map(key=>key==='1'||key==='2'?{table:'diario_industria_turnos',empresa:'10',turno:key}:key==='10'||key==='111'?{table:'diario_industria',empresa:key}:null).filter(Boolean);
  }
  async function load(get,periods,units,signal){
   if(!periods.length)return [];
   const catalog=await get(APP_CONFIG.endpoints.modelo,{}, {silent:true,signal});
   if(!catalog.ok||!Array.isArray(catalog.tabelas))throw Error('Catálogo PCP indisponível.');
   const target=new Map();
   for(const scope of scopes(units)){
    const columns=schema(catalog,scope.table),{table,...filters}=scope;
    for(const {year,month} of periods){
     const prefix=year+'-'+String(month).padStart(2,'0'),params={...filters,inicio:prefix+'-01',fim:prefix+'-'+new Date(Date.UTC(year,month,0)).getUTCDate(),[columns.description]:'Cabeças'};
     let page=1,expectedTotal=null,received=0;
     do{
      if(signal.aborted)throw new DOMException('Consulta cancelada','AbortError');
      const result=await get(APP_CONFIG.endpoints.tabelaModelo+encodeURIComponent(table),{...params,pagina:page,tamanho:1000},{silent:true,signal});
      if(!result.ok||result.tabela!==table||!Array.isArray(result.dados)||!Number.isSafeInteger(result.total)||result.total<0||!Number.isSafeInteger(result.tamanho)||result.tamanho<1||result.pagina!==page)throw Error('Resposta de Cabeças incompleta.');
      if(expectedTotal===null)expectedTotal=result.total;
      if(result.total!==expectedTotal||result.dados.length>result.tamanho)throw Error('A fonte de Cabeças mudou durante a consulta. Atualize novamente.');
      received+=result.dados.length;
      if(received>expectedTotal||(received<expectedTotal&&result.dados.length!==result.tamanho))throw Error('Paginação de Cabeças incompleta.');
      collect(target,result.dados,columns,params);
      if(received===expectedTotal)break;
      page++;
     }while(true);
    }
   }
   return [...target.values()].sort((a,b)=>a.data.localeCompare(b.data)||a.empresa_codigo.localeCompare(b.empresa_codigo));
  }
  return {load};
 })();
 function createProductivityCalendar(content,fields,onNavigate,isLoading,getHeads=()=>({status:'idle',rows:[]})){
  const root=document.createElement('section');root.id='cgProdutividade';root.hidden=true;
  root.innerHTML='<article class="card pcp-report-panel"><header class="cg-production-header"><h2>Calendário de Produção</h2><nav aria-label="Navegação do calendário"><button type="button" data-cg-month="-1" aria-label="Mês anterior">←</button><button type="button" data-cg-month="1" aria-label="Próximo mês">→</button></nav></header><p class="cg-production-notice">Indicadores de produtividade ainda não disponíveis.</p><div class="cg-production-months"></div></article><article class="card pcp-report-panel cg-production-detail" hidden aria-live="polite" aria-atomic="true"></article><article class="card pcp-report-panel"><header><h2>Acumulado mensal</h2></header></article>';
  content.prepend(root);
  const monthsHost=root.querySelector('.cg-production-months'),detail=root.querySelector('.cg-production-detail');
  const weekdays=['Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado','Domingo'];
  const monthName=(year,month)=>new Date(Date.UTC(year,month-1,1)).toLocaleDateString('pt-BR',{month:'long',year:'numeric',timeZone:'UTC'});
  let selectedDay='',visibleDays=new Set();
  const formatHeads=value=>value.toLocaleString('pt-BR',{maximumFractionDigits:6});
  const dayHeads=date=>getHeads().status==='ready'&&PcpMulti.includes(fields.Grupo?.value,'producao')?getHeads().rows.filter(row=>row.data===date):[];
  function emptyMessage(){
   const status=getHeads().status;
   return status==='loading'?'Consultando quantidade de cabeças…':status==='error'?'Não foi possível consultar Cabeças. Use Atualizar para tentar novamente.':status!=='ready'?'Quantidade de cabeças ainda não consultada.':!PcpMulti.includes(fields.Grupo?.value,'producao')?'Cabeças não pertence ao grupo selecionado.':'Sem registros de Cabeças para esta data e filtros.';
  }
  function periods(){
   const years=PcpMulti.values(fields.Ano.value),months=PcpMulti.values(fields.Mes.value);
   return (years.length?years:[...fields.Ano.options].map(o=>o.value)).flatMap(year=>(months.length?months:Array.from({length:12},(_,i)=>String(i+1))).map(month=>({year:Number(year),month:Number(month)}))).filter(p=>Number.isInteger(p.year)&&p.year>=1000&&p.year<=9999&&Number.isInteger(p.month)&&p.month>=1&&p.month<=12).sort((a,b)=>a.year-b.year||a.month-b.month);
  }
  function targetMonth(direction){
   const list=periods();if(!list.length)return null;
   const edge=direction<0?list[0]:list[list.length-1],date=new Date(Date.UTC(edge.year,edge.month-1+direction,1));
   const year=date.getUTCFullYear(),month=date.getUTCMonth()+1;
   return [...fields.Ano.options].some(o=>Number(o.value)===year)?{year,month}:null;
  }
  function renderDetail(){
   detail.hidden=!selectedDay;
   if(selectedDay){const date=new Date(selectedDay+'T00:00:00Z').toLocaleDateString('pt-BR',{day:'2-digit',month:'long',year:'numeric',timeZone:'UTC'}),rows=dayHeads(selectedDay);detail.innerHTML='<header><h2>Detalhamento do dia · '+esc(date)+'</h2></header>'+(rows.length?'<dl class="cg-production-heads-detail">'+rows.map(row=>'<div><dt>'+esc(row.empresa)+' · Cabeças</dt><dd>'+esc(formatHeads(row.quantidade_cabecas))+'</dd></div>').join('')+'</dl><p class="cg-production-notice">Maior Quantidade entre os registros com Descrição = Cabeças, por empresa e dia.</p>':'<p class="cg-production-notice">'+esc(emptyMessage())+'</p>');}
   for(const button of monthsHost.querySelectorAll('[data-cg-day]'))button.setAttribute('aria-pressed',String(button.dataset.cgDay===selectedDay));
  }
  function render(){
   if(root.hidden)return;
   const notice=root.querySelector('.cg-production-notice'),state=getHeads();
   notice.textContent=state.status==='ready'&&PcpMulti.includes(fields.Grupo?.value,'producao')?'Cabeças · maior quantidade por empresa e dia.':emptyMessage();
   visibleDays=new Set();
   monthsHost.innerHTML=periods().map(({year,month})=>{
    const key=year+'-'+String(month).padStart(2,'0'),label=monthName(year,month),offset=(new Date(Date.UTC(year,month-1,1)).getUTCDay()+6)%7,count=new Date(Date.UTC(year,month,0)).getUTCDate(),cells=Math.ceil((offset+count)/7)*7;
    const slots=Array.from({length:cells},(_,index)=>{
     const day=index-offset+1;if(day<1||day>count)return '<td class="cg-production-outside" aria-hidden="true"></td>';
     const date=key+'-'+String(day).padStart(2,'0'),allowed=PcpMulti.includes(fields.Dia.value,date);
     if(allowed)visibleDays.add(date);
     const rows=allowed?dayHeads(date):[],summary=rows.map(row=>row.empresa+': '+formatHeads(row.quantidade_cabecas)+' cabeças').join('; ');
     return '<td><button type="button" data-cg-day="'+date+'" aria-pressed="false" aria-label="'+esc(day+' de '+label+' · '+(allowed?(summary||emptyMessage()):'Fora do filtro de dia'))+'"'+(allowed?'':' disabled')+'><span class="cg-production-day-number">'+day+'</span>'+(rows.length?'<span class="cg-production-heads">'+rows.map(row=>'<span><span>'+esc(row.empresa)+'</span><strong>'+esc(formatHeads(row.quantidade_cabecas))+' <small>cab.</small></strong></span>').join('')+'</span>':'<span class="cg-production-empty" aria-hidden="true">—</span>')+'</button></td>';
    });
    return '<div class="cg-production-month"><h3>'+esc(label)+'</h3><div class="cg-production-scroll"><table class="cg-production-grid"><caption class="cg-production-sr">Calendário de Produção · '+esc(label)+'</caption><thead><tr>'+weekdays.map(day=>'<th scope="col"><abbr title="'+day+'">'+day.slice(0,3)+'</abbr></th>').join('')+'</tr></thead><tbody>'+Array.from({length:cells/7},(_,week)=>'<tr>'+slots.slice(week*7,week*7+7).join('')+'</tr>').join('')+'</tbody></table></div></div>';
   }).join('');
   if(!visibleDays.has(selectedDay))selectedDay='';
   renderDetail();
   for(const button of root.querySelectorAll('[data-cg-month]'))button.disabled=isLoading()||!targetMonth(Number(button.dataset.cgMonth));
  }
  root.addEventListener('click',event=>{
   const day=event.target.closest('[data-cg-day]');
   if(day&&!day.disabled){selectedDay=day.dataset.cgDay;renderDetail();return;}
   const arrow=event.target.closest('[data-cg-month]');
   if(arrow&&!arrow.disabled){const target=targetMonth(Number(arrow.dataset.cgMonth));if(target){selectedDay='';onNavigate(target);}}
  });
  return {root,render,periods};
 }
 function mount(){
  const mobile=PcpMobileScroll.active();
  const filter=document.querySelector('.filter-card');filter.className='card pcp-comparativo-filtros cg-filters';
  filter.innerHTML='<div class="pcp-comparativo-filter-head"><h2>Filtros</h2><div><button type="button" id="cgAtualizar" class="button">Atualizar</button><button type="button" id="cgLimpar" class="button">Limpar filtros</button></div></div><div class="cg-filter-grid"><label>Grupo<select id="cgGrupo"><option value="">Todos</option><option value="familias">Famílias e miúdos</option><option value="producao">Produção e perdas</option></select></label><label>Ano<select id="cgAno"></select></label><label>Mês<select id="cgMes">'+Array.from({length:12},(_,i)=>'<option value="'+(i+1)+'">'+new Date(2026,i,1).toLocaleDateString('pt-BR',{month:'long'})+'</option>').join('')+'</select></label><label>Dia<select id="cgDia"><option value="">Todos</option></select></label><label>Unidade<select id="cgUnidade"><option value="">Todas</option><option value="10">Ave Nova</option><option value="1">1º turno - AN</option><option value="2">2º turno - AN</option><option value="111">Real Alimentos</option></select></label></div>';

  const content=document.getElementById('pcpConteudo');content.className='pcp-report-panels';content.innerHTML='<article class="card pcp-report-panel"><header><h2>Indicadores por dia</h2></header><div id="cgDiario" class="cg-scroll"></div></article><article class="card pcp-report-panel"><header><h2>Acumulado mensal</h2><div hidden><p>Razões calculadas pelos pesos acumulados até D−1. A seleção de dia limita o quadro diário; o acumulado mantém o mês escolhido.</p><p>Condenação: menor ou igual à meta. Demais indicadores: maior ou igual à meta. Ausência de base é apresentada como —.</p></div></header><div id="cgMensal" class="cg-scroll"></div></article>';
  const ids=['Ano','Mes','Dia','Unidade','Grupo'],fields=Object.fromEntries(ids.map(k=>[k,document.getElementById('cg'+k)]));let data=null,generation=0,controller,loading=false;
  let headsState={status:'idle',rows:[]},headsKey='',headsGeneration=0,headsController=null;
  const yieldPanels=[...content.children];
  const productivity=createProductivityCalendar(content,fields,({year,month})=>{
   fields.Ano.value=String(year);fields.Mes.value=String(month);fields.Dia.value='';load();
  },()=>loading,()=>headsState);
  let indicatorMode='rendimento';
  const indicatorFlags=PcpPeriodFlags.create('cgTipoIndicador',indicatorMode,mode=>{
   indicatorMode=mode;
   for(const panel of yieldPanels)panel.hidden=mode==='produtividade';
   productivity.root.hidden=mode!=='produtividade';productivity.render();
   refreshHeads();
   if(mode==='rendimento')requestAnimationFrame(scrollTablesToLatest);
  },[['rendimento','Rendimento'],['produtividade','Produtividade']]);
  indicatorFlags.setAttribute('aria-label','Tipo de indicador');
  indicatorFlags.querySelector('legend').textContent='Tipo de indicador';
  const indicatorToolbar=document.createElement('div');
  indicatorToolbar.style.cssText='display:flex;justify-content:flex-end;margin-top:12px';
  indicatorToolbar.append(indicatorFlags);
  filter.append(indicatorToolbar);
  async function refreshHeads(force=false){
   if(indicatorMode!=='produtividade'){
    if(headsController){headsGeneration++;headsController.abort();headsController=null;}
    headsKey='';headsState={status:'idle',rows:[]};
    return;
   }
   const periods=productivity.periods(),units=fields.Unidade.value,key=JSON.stringify([periods,units]);
   if(!force&&headsKey===key)return;
   headsKey=key;const id=++headsGeneration;headsController?.abort();headsController=new AbortController();
   headsState={status:'loading',rows:[]};productivity.render();
   try{
    const rows=await productivityHeads.load(apiGet,periods,units,headsController.signal);
    if(id!==headsGeneration)return;
    headsState={status:'ready',rows};
   }catch(e){
    if(id!==headsGeneration)return;
    headsState={status:'error',rows:[]};
   }finally{if(id===headsGeneration){headsController=null;productivity.render();}}
  }
  const dialog=document.createElement('dialog');dialog.className='cg-dialog';dialog.setAttribute('aria-labelledby','cgGraficoTitulo');dialog.innerHTML='<header class="cg-dialog-header"><div><h2 id="cgGraficoTitulo"></h2><p id="cgGraficoContexto"></p></div><div class="cg-dialog-actions"><button type="button" class="button" id="cgMaximizar" aria-pressed="false">Maximizar</button><button type="button" class="button cg-dialog-close">Fechar</button></div></header><div class="cg-chart-filters"><input type="hidden" id="cgGraficoModo" value="dias"><div id="cgCampoDias"><span>Dias · seleção múltipla</span><div id="cgGraficoDias" class="checkbox-multiselect"></div></div><div id="cgCampoSemanas" class="hidden"><span>Semanas · seleção múltipla</span><div id="cgGraficoSemanas" class="checkbox-multiselect"></div></div><div id="cgCampoUnidades"><span>Unidades · seleção múltipla</span><div id="cgGraficoUnidades" class="checkbox-multiselect"></div></div><button type="button" id="cgGraficoLimpar" class="button">Limpar seleção</button></div><div id="cgGraficoLinhas" class="cg-line-chart" aria-label="Evolução diária do indicador"></div>';document.body.append(dialog);
  const chartEl=dialog.querySelector('.cg-line-chart');let lineChart=null,activeIndicator=null,graphPeriod='',graphUnit='',referenceVisible=true,drilledWeek=null,savedDays=null,visibleWeekRows=[],mobileLinePeriod='';
  const graphFields=[{id:'cgGraficoDias',apiKey:'dias',multi:true,search:true},{id:'cgGraficoSemanas',apiKey:'semanas',multi:true,search:true},{id:'cgGraficoUnidades',apiKey:'unidades',multi:true,search:true}],graphMode=dialog.querySelector('#cgGraficoModo');
  const graphFilters=new FilterController({fields:graphFields,includeDependentRefresh:false,onChange:()=>renderLine()});graphFilters.register();
  function syncLineFilters(){
   if(graphUnit!==fields.Unidade.value||!graphFilters.getState(graphFields[2]).options.length){graphUnit=fields.Unidade.value;graphFilters.renderMultiOptions(graphFields[2],Object.entries(cols).map(([value,label])=>({value,label})),selectedColumns());}
   const period=data.ano+'-'+data.mes+'-'+fields.Dia.value,reset=period!==graphPeriod;if(reset){drilledWeek=null;savedDays=null;}graphPeriod=period;
   graphFilters.renderMultiOptions(graphFields[0],data.dias.map(d=>({value:d.data,label:d.data.split('-').reverse().join('/')})),reset?(PcpMulti.values(fields.Dia.value)):undefined);
   graphFilters.renderMultiOptions(graphFields[1],(data.semanal||[]).map(w=>({value:w.chave,label:w.ano+' · Semana '+w.semana+' ('+w.inicio.slice(8)+'/'+w.inicio.slice(5,7)+' a '+w.fim.slice(8)+'/'+w.fim.slice(5,7)+')'})),reset?(fields.Dia.value?(data.semanal||[]).filter(w=>w.dias.some(d=>PcpMulti.includes(fields.Dia.value,d))).map(w=>w.chave):[]):undefined);
  }
  const periodFlags=PcpPeriodFlags.create('periodoCirurgico','dia',mode=>{clearDrill();graphMode.value=mode==='dia'?'dias':'semanas';graphMode.onchange();});periodFlags.classList.add('cg-period-flags');dialog.querySelector('.cg-chart-filters').append(periodFlags);
  function clearDrill(){drilledWeek=null;if(savedDays){graphFilters.renderMultiOptions(graphFields[0],graphFilters.getState(graphFields[0]).options,savedDays);savedDays=null;}}
  const drillBar=PcpWeekDrill.bar(()=>{clearDrill();graphMode.value='semanas';PcpWeekDrill.flags(periodFlags,'semana');graphMode.onchange();});dialog.insertBefore(drillBar.element,chartEl);
  graphMode.onchange=()=>{graphFilters.closeAll();dialog.querySelector('#cgCampoDias').classList.toggle('hidden',graphMode.value!=='dias');dialog.querySelector('#cgCampoSemanas').classList.toggle('hidden',graphMode.value!=='semanas');renderLine();};
  dialog.querySelector('#cgGraficoLimpar').onclick=()=>{clearDrill();for(const f of graphFields){graphFilters.renderMultiOptions(f,graphFilters.getState(f).options,f.apiKey==='unidades'?selectedColumns():[]);}graphFilters.closeAll();renderLine();};
  function selectedColumns(){const selected=PcpMulti.values(fields.Unidade.value);return selected.length?Object.keys(cols).filter(k=>selected.includes(k)):Object.keys(cols);}
  function renderLine(){
   if(!data||!dialog.open||activeIndicator==null)return;const indicator=data.indicadores.find(r=>r.ordem===activeIndicator);if(!indicator)return;
   const weekly=graphMode.value==='semanas',selected=graphFilters.values()[weekly?'semanas':'dias']||[],rows=(weekly?(data.semanal||[]):data.dias).filter(d=>(!selected.length||selected.includes(weekly?d.chave:d.data))&&(weekly||!drilledWeek||PcpWeekDrill.key(d.data)===drilledWeek)),keys=Object.keys(cols).filter(k=>!graphFilters.values().unidades||graphFilters.values().unidades.includes(k)),palette={'1':'#7961ad','2':'#359b91','10':'#168cff','111':'#ed1515'};
   visibleWeekRows=weekly?rows:[];drillBar.update(weekly,drilledWeek);
   dialog.querySelector('#cgGraficoTitulo').textContent=indicator.nome;
   dialog.querySelector('#cgGraficoContexto').textContent=(weekly?'Evolução semanal · ':'Evolução diária · ')+([...fields.Mes.selectedOptions].map(o=>o.textContent).join(', ')||'Todos os meses')+'/'+(fields.Ano.value||'Todos os anos')+' · Cirúrgico: '+pct(indicator.meta)+(indicator.ordem===11?' · Menor ou igual é favorável':' · Maior ou igual é favorável')+(weekly?' · Semanas dentro do mês selecionado':'');
   if(!lineChart){lineChart=echarts.init(chartEl);lineChart.on('legendselectchanged',event=>{referenceVisible=event.selected['Cirúrgico']!==false;const chosen=Object.keys(cols).filter(k=>event.selected[cols[k]]!==false);if(chosen.length){graphFilters.renderMultiOptions(graphFields[2],graphFilters.getState(graphFields[2]).options,chosen);}renderLine();});PcpWeekDrill.bind(lineChart,()=>graphMode.value==='semanas',()=>visibleWeekRows,row=>{savedDays=graphFilters.values().dias||[];drilledWeek=row.chave;graphFilters.renderMultiOptions(graphFields[0],graphFilters.getState(graphFields[0]).options,row.dias.map(String));graphMode.value='dias';PcpWeekDrill.flags(periodFlags,'dia');graphMode.onchange();},()=>{if(drilledWeek)drillBar.back();});}lineChart.resize();
   const width=chartEl.clientWidth,height=chartEl.clientHeight,top=68,bottom=68,plotHeight=Math.max(100,height-top-bottom),values=rows.flatMap(d=>keys.map(k=>d.valores[k]?.[indicator.ordem-1])).filter(v=>v!=null&&Number.isFinite(v));
   const low=Math.min(indicator.meta,...values),high=Math.max(indicator.meta,...values),span=Math.max(high-low,Math.abs(high)*.04,.0001),minimum=low-span*.23,maximum=high+span*.23;
   // Reserva uma posição para cada rótulo, mesmo quando os pontos coincidem.
   const slots=rows.map(d=>{
    const positions=keys.map(k=>({key:k,value:d.valores[k]?.[indicator.ordem-1]})).filter(p=>p.value!=null).map(p=>({...p,y:top+(maximum-p.value)/(maximum-minimum)*plotHeight-15})).sort((a,b)=>a.y-b.y);
    positions.forEach((p,i)=>{p.y=Math.max(top+12,p.y,i?positions[i-1].y+22:0);});
    for(let i=positions.length-1;i>=0;i--)positions[i].y=Math.min(positions[i].y,top+plotHeight-12,i<positions.length-1?positions[i+1].y-22:Infinity);
    return Object.fromEntries(positions.map(p=>[p.key,p.y]));
   });
   const series=Object.keys(cols).map(k=>({name:cols[k],type:'line',showSymbol:true,symbol:'circle',symbolSize:6,connectNulls:false,zlevel:0,itemStyle:{color:palette[k]},lineStyle:{width:2},data:rows.map(d=>d.valores[k]?.[indicator.ordem-1]??null)}));
   series.push({name:'Cirúrgico',type:'line',symbol:'none',zlevel:0,itemStyle:{color:'#292929'},lineStyle:{color:'#292929',type:'dashed',width:2},data:rows.map(()=>indicator.meta)});
   // Camada exclusiva acima de todas as linhas: nenhum rótulo fica encoberto.
   keys.forEach(k=>series.push({name:cols[k],type:'scatter',symbolSize:0,silent:true,zlevel:3,tooltip:{show:false},data:rows.map(d=>d.valores[k]?.[indicator.ordem-1]??null),label:{show:true,color:'#252525',fontSize:10,backgroundColor:'#fff',borderColor:palette[k],borderWidth:1,padding:[3,4],borderRadius:2,formatter:p=>p.value==null?'':pct(p.value)},labelLayout:p=>({x:Math.max(96,Math.min(width-38,p.rect.x)),y:slots[p.dataIndex]?.[k]??top+12,align:'center',verticalAlign:'middle',hideOverlap:false})}));
   const capacity=Math.max(2,Math.floor((width-120)/76)),zoom=rows.length>capacity;
   const period=indicator.ordem+'|'+weekly+'|'+rows.map(d=>weekly?d.chave:d.data).join('|'),mobileZoom=mobile?PcpMobileScroll.config(lineChart,rows.length,mobileLinePeriod!==period,{left:70,right:40,filterMode:'filter'}):[];mobileLinePeriod=period;
   lineChart.setOption({animation:false,legend:{top:8,left:12,right:12,type:'scroll',selectedMode:'multiple',selected:{...Object.fromEntries(Object.keys(cols).map(k=>[cols[k],keys.includes(k)])),'Cirúrgico':referenceVisible},data:[...Object.values(cols),'Cirúrgico'],textStyle:{fontSize:11}},tooltip:{show:!mobile,triggerOn:mobile?'none':'mousemove|click',trigger:'axis',axisPointer:{show:!mobile},formatter:params=>'<b>'+esc(params[0]?.axisValueLabel||'')+'</b><br>'+params.filter(p=>p.seriesType==='line').map(p=>p.marker+esc(p.seriesName)+': '+esc(pct(p.value))).join('<br>')},grid:{left:70,right:40,top,bottom},xAxis:{type:'category',triggerEvent:true,boundaryGap:false,data:rows.map(d=>weekly?'Sem. '+d.semana:d.data.slice(8)+'/'+d.data.slice(5,7)),axisLabel:{fontSize:11,margin:14,cursor:weekly||drilledWeek?'pointer':'default'},axisTick:{show:false}},yAxis:{type:'value',min:minimum,max:maximum,axisLabel:{fontSize:11,formatter:v=>pct(v)},splitLine:{lineStyle:{type:'dotted',color:'#e6ddd7'}}},dataZoom:mobile?mobileZoom:zoom?[{type:'inside',startValue:0,endValue:capacity-1,filterMode:'filter'},{type:'slider',height:18,bottom:8,startValue:0,endValue:capacity-1,filterMode:'filter'}]:[],series,graphic:!values.length?[{type:'text',left:'center',top:'middle',style:{text:'Sem dados do indicador para os filtros selecionados.',fill:'#756d68',fontSize:12}}]:[]},{notMerge:true});
   chartEl.setAttribute('aria-label',(weekly?'Evolução semanal de ':'Evolução diária de ')+indicator.nome);

  }
  function openLine(order){if(!data)return;activeIndicator=order;mobileLinePeriod='';if(!dialog.open)dialog.showModal();renderLine();}
  content.addEventListener('click',event=>{const button=event.target.closest('[data-cg-indicator]');if(button)openLine(Number(button.dataset.cgIndicator));});
  dialog.querySelector('.cg-dialog-close').onclick=()=>dialog.close();dialog.addEventListener('close',()=>{if(!dialog.open){activeIndicator=null;graphFilters.closeAll();dialog.classList.remove('cg-maximized');const maximize=dialog.querySelector('#cgMaximizar');maximize.textContent='Maximizar';maximize.setAttribute('aria-pressed','false');if(document.fullscreenElement===dialog)document.exitFullscreen().catch(()=>{});}});dialog.addEventListener('click',event=>{const r=dialog.getBoundingClientRect();if(event.target===dialog&&(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom))dialog.close();});
  dialog.querySelector('#cgMaximizar').onclick=()=>{graphFilters.closeAll();const expanded=dialog.classList.toggle('cg-maximized');const button=dialog.querySelector('#cgMaximizar');button.textContent=expanded?'Restaurar':'Maximizar';button.setAttribute('aria-pressed',String(expanded));if(expanded&&dialog.requestFullscreen){dialog.requestFullscreen().catch(()=>{});}else if(!expanded&&document.fullscreenElement===dialog){document.exitFullscreen().catch(()=>{});}requestAnimationFrame(()=>{lineChart?.resize();renderLine();});};
  const chartObserver=new ResizeObserver(()=>renderLine());chartObserver.observe(chartEl);
  const now=new Date();fields.Ano.innerHTML='<option>'+now.getFullYear()+'</option>';fields.Mes.value=now.getMonth()+1;
  function scrollTablesToLatest(){for(const id of ['cgDiario','cgMensal']){const element=document.getElementById(id);if(mobile&&element.querySelector('table')){const cells=element.querySelector('thead tr')?.cells,fixed=cells?cells[0].getBoundingClientRect().width+cells[1].getBoundingClientRect().width:140,count=selectedColumns().length,width=Math.max(30,(element.clientWidth-fixed)/count);const table=element.querySelector('table');table.style.setProperty('--cg-day-column',width+'px');table.style.width=(fixed+(table.querySelectorAll('col').length-2)*width)+'px';table.querySelectorAll('col').forEach((col,i)=>{if(i>1)col.style.width=width+'px';});PcpMobileScroll.table(element,{latest:true,snap:count*width});}element.scrollLeft=element.scrollWidth;}}
  if(mobile)document.querySelector('#cgDiario').previousElementSibling.insertAdjacentHTML('beforeend','<p class="ef-mobile-units">AN · Ave Nova &nbsp; / &nbsp; RA · Real Alimentos<br>1º / 2º · Turnos da Ave Nova</p>');
  const tableObserver=new ResizeObserver(()=>scrollTablesToLatest());for(const id of ['cgDiario','cgMensal'])tableObserver.observe(document.getElementById(id));
  function render(){
   refreshHeads();
   productivity.render();
   if(!data)return;const keys=selectedColumns(),rows=data.indicadores.filter(r=>PcpMulti.includes(fields.Grupo.value,r.ordem<=8?'familias':'producao'));
   function table(blocks,monthly){
    if(!blocks.length)return '<p class="pcp-report-notice">Sem dados para o período selecionado.</p>';
    const header=blocks.map((b,bi)=>'<th '+('class="cg-day-group cg-day-band-'+bi%2+'" ')+'colspan="'+keys.length+'">'+esc(monthly?b.mes.split('-').reverse().join('/'):b.data.split('-').reverse().join('/'))+'</th>').join('');
    return '<table class="cg-table"><colgroup><col class="cg-indicator-col"><col class="cg-reference-col">'+blocks.map(()=>keys.map(()=>'<col>').join('')).join('')+'</colgroup><thead><tr><th rowspan="2">Indicador</th><th rowspan="2">Cirúrgico</th>'+header+'</tr><tr>'+blocks.map((b,bi)=>keys.map((k,ki)=>'<th'+(' class="cg-day-band-'+bi%2+(ki===0?' cg-day-start':'')+'"')+'>'+esc(mobile?({'1':'1º AN','2':'2º AN','10':'AN','111':'RA'}[k]||cols[k]):cols[k])+'</th>').join('')).join('')+'</tr></thead><tbody>'+rows.map(r=>'<tr><th><button type="button" class="cg-indicator-button" data-cg-indicator="'+r.ordem+'" aria-haspopup="dialog" title="Ver evolução em gráfico de linhas">'+esc(r.nome)+'</button></th><td class="cg-target">'+pct(r.meta)+'</td>'+blocks.map((b,bi)=>keys.map((k,ki)=>{const v=b.valores[k]?.[r.ordem-1],good=v!=null&&(r.ordem===11?v<=r.meta:v>=r.meta);return '<td class="'+(v==null?'':good?'cg-good':'cg-bad')+(' cg-day-band-'+bi%2+(ki===0?' cg-day-start':''))+'" title="'+(v==null?'Sem base disponível':good?'Dentro da referência cirúrgica':'Fora da referência cirúrgica')+'">'+pct(v)+'</td>';}).join('')).join('')+'</tr>').join('')+'</tbody></table>';
   }
   document.getElementById('cgDiario').innerHTML=table(data.dias.filter(d=>PcpMulti.includes(fields.Dia.value,d.data)),false);document.getElementById('cgMensal').innerHTML=table(data.mensal,true);syncLineFilters();renderLine();requestAnimationFrame(scrollTablesToLatest);
  }
  async function load(){
   const id=++generation;if(controller)controller.abort();controller=new AbortController();loading=true;
   refreshHeads(true);
   productivity.render();
   try{const result=await apiGet('/api/pcp/comparativo/cirurgico-geral',{ano:fields.Ano.value||[...fields.Ano.options].map(o=>o.value).join(','),mes:fields.Mes.value||Array.from({length:12},(_,i)=>i+1).join(',')},{silent:true,signal:controller.signal});if(id!==generation)return;if(!result.ok)throw new Error('Consulta não concluída');data=result;
    fields.Ano.innerHTML=result.anos.map(y=>'<option value="'+y+'">'+y+'</option>').join('');fields.Ano.value=result.ano;fields.Mes.value=result.mes;const day=fields.Dia.value;fields.Dia.innerHTML='<option value="">Todos</option>'+result.dias.map(d=>'<option value="'+d.data+'">'+d.data.split('-').reverse().join('/')+'</option>').join('');fields.Dia.value=PcpMulti.values(day).filter(v=>result.dias.some(d=>d.data===v)).join(',');
    render();PcpReportHeader.update(result.ultima_atualizacao);document.getElementById('mensagemErro').classList.add('hidden');document.getElementById('estadoConsulta').textContent='Dados reais · até '+result.data_limite.split('-').reverse().join('/')+' (D−1)';
   }catch(e){if(id!==generation||e.name==='AbortError')return;if(e.status===401||e.status===403){data=null;lineChart?.clear();if(dialog.open)dialog.close();document.getElementById('cgDiario').replaceChildren();document.getElementById('cgMensal').replaceChildren();}const error=document.getElementById('mensagemErro');error.textContent='Não foi possível atualizar o comparativo. '+(data?'A última consulta permanece visível.':'');error.classList.remove('hidden');}
   finally{if(id===generation){loading=false;productivity.render();}}
  }
  fields.Ano.onchange=fields.Mes.onchange=()=>{fields.Dia.value='';load();};fields.Dia.onchange=fields.Unidade.onchange=fields.Grupo.onchange=render;document.getElementById('cgAtualizar').onclick=load;document.getElementById('cgLimpar').onclick=()=>{fields.Grupo.value=fields.Unidade.value=fields.Dia.value='';fields.Ano.value=now.getFullYear();fields.Mes.value=now.getMonth()+1;load();};setInterval(()=>{if(!document.hidden&&!loading)load();},60000);document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!loading)load();});PcpMulti.enhance(filter);load();
 }
 return {mount};
})();
