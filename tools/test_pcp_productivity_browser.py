"""Testes locais em Edge headless, com API simulada e perfil isolado no workspace."""
from __future__ import annotations

import argparse
import functools
import html
import json
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import re
import subprocess
import threading

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'outputs/produtividade-layout'
EDGE = Path('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe')

SCRIPT = r'''
window.errors=[];window.addEventListener('error',e=>errors.push(e.message));
window.ThemeManager={refresh(){}};
window.ApiScreen={escape:v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))};
const fixture=__FIXTURE__;
window.apiGet=async(endpoint,p={})=>{
 if(endpoint==='/api/pcp/comparativo/cirurgico-geral')return {ok:true,anos:[2025,2026],ano:2026,mes:Number(String(p.mes||11).split(',')[0]),data_limite:fixture.limit,ultima_atualizacao:'2026-11-04T08:00:00-03:00',indicadores:[{ordem:1,nome:'Família Asa + Volta',meta:.0883}],dias:['2026-11-02','2026-11-03'].map(data=>({data,valores:{'1':[.08],'2':[.09],'10':[.085],'111':[.087]}})),mensal:[{mes:'2026-11',valores:{'1':[.08],'2':[.09],'10':[.085],'111':[.087]}}],semanal:[]};
 if(endpoint==='/api/pcp/tabelas')return {ok:true,tabelas:['diario_industria','diario_industria_turnos'].map(tabela=>({tabela,colunas:['data_referencia','empresa','empresa_codigo','unidade_codigo','turno_codigo','secao','descricao','quantidade']}))};
 const tabela=endpoint.split('/').pop();
 const rows=tabela==='metas'?fixture.metas.filter(r=>r.referencia_mes>=p.inicio&&r.referencia_mes<=p.fim&&r.tela===p.tela&&r.ativo):
  fixture.rows.filter(r=>r.fonte===tabela&&r.data_referencia>=p.inicio&&r.data_referencia<=p.fim&&r.descricao===p.descricao&&(!p.turno||r.turno_codigo===p.turno));
 const tamanho=3,pagina=p.pagina||1;
 return {ok:true,tabela,total:rows.length,tamanho,pagina,dados:rows.slice((pagina-1)*tamanho,pagina*tamanho)};
};
'''

TEST = r'''
(async()=>{
 const results=[];
 const assert=(condition,message)=>{if(!condition)throw Error(message);};
 const flush=async()=>{await new Promise(r=>setTimeout(r,40));};
 try{
  await flush();
  const unit=document.getElementById('cgUnidade'),flag=value=>document.querySelector('input[name="cgTipoIndicador"][value="'+value+'"]');
  unit.value='1,111';unit.dispatchEvent(new Event('change',{bubbles:true}));await flush();
  const rendimentoMarkup=()=>document.getElementById('cgDiario').innerHTML.replace(/ style="[^"]*"/g,'');
  const originalOptions=[...unit.options].map(o=>[o.value,o.textContent]),originalRendimento=rendimentoMarkup();
  const renditionStyle=()=>['display','gridTemplateColumns','padding'].map(key=>getComputedStyle(document.querySelector('.cg-filters'))[key]);
  const originalStyle=renditionStyle();
  flag('produtividade').click();await flush();
  assert(JSON.stringify([...unit.options].map(o=>o.textContent))===JSON.stringify(['Ave Nova','1° Turno - AN','2° Turno - AN','Real Alimentos']),'Quatro opções com nomes e ordem exatos');
  assert(unit.closest('label').firstChild.textContent==='Unidade / Turno','Nome do filtro único');
  const expected={'10':[222318],'1':[113244],'2':[109074],'111':[142587],'10,111':[364905],'1,111':[255831],'2,111':[251661]};
  assert(document.getElementById('cgGrupo').closest('label').hidden,'Grupo oculto somente em Produtividade');
  assert([...document.querySelectorAll('.cg-production-grid tbody [data-cg-week]')].map(cell=>cell.dataset.cgWeek).join(',')==='2026-W45,2026-W46,2026-W47,2026-W48,2026-W49','Semanas ISO nas linhas do calendário');
  const parse=element=>Number(element.textContent.replace(/[^\d-]/g,''));
  function checkLayout(value){
   const root=document.getElementById('cgProdutividade'),calendar=root.firstElementChild,monthly=root.lastElementChild;
   assert(document.documentElement.scrollWidth<=innerWidth,'Rolagem horizontal da página em '+value+': '+document.documentElement.scrollWidth+'/'+innerWidth);
   for(const selector of ['.cg-production-scroll','.cg-monthly-scroll']){
    const box=root.querySelector(selector);assert(box.scrollWidth<=box.clientWidth+1,'Rolagem horizontal '+selector+' em '+value+': '+box.scrollWidth+'/'+box.clientWidth);
   }
   assert(monthly.getBoundingClientRect().top>=calendar.getBoundingClientRect().bottom,'Mensal precisa estar abaixo do calendário');
   for(const cell of root.querySelectorAll('.cg-production-grid td,.cg-monthly-pivot td'))
    if(cell.getBoundingClientRect().width>0)assert(cell.scrollWidth<=cell.clientWidth+1,'Número ultrapassa célula '+value+' '+cell.textContent.trim());
   const bounds=root.getBoundingClientRect();
   for(const card of [calendar,monthly]){const rect=card.getBoundingClientRect();assert(rect.left>=bounds.left+5&&rect.right<=bounds.right-5,'Folga lateral discreta nos dois cards');}
   for(const number of root.querySelectorAll('strong')){
    const rect=number.getBoundingClientRect();if(rect.width===0)continue;
    assert(rect.left>=bounds.left-1&&rect.right<=bounds.right+1,'Número fora do card: '+number.textContent);
   }
   return {viewport:innerWidth,pageWidth:document.documentElement.scrollWidth,calendarWidth:Math.round(calendar.getBoundingClientRect().width),monthlyWidth:Math.round(monthly.getBoundingClientRect().width)};
  }
  for(const [value,totals] of Object.entries(expected)){
   const menu=document.getElementById('cgUnidadeMulti');
   unit.value='10';unit.dispatchEvent(new Event('change',{bubbles:true}));await flush();
   if(!menu.classList.contains('open'))menu.querySelector('button').click();
   assert(document.documentElement.scrollWidth<=innerWidth,'Menu do filtro provoca transbordamento');
   const clickUnit=async(code)=>{document.querySelector('#cgUnidadeMulti input[type="checkbox"][value="'+code+'"]').click();await flush();};
   if(value==='111'){await clickUnit('111');await clickUnit('10');}
   else{for(const code of value.split(',')){if(code!=='10')await clickUnit(code);}}
   if(value==='10,111')assert(menu.querySelector('.checkbox-multiselect-label').textContent==='Real Alimentos + Ave Nova','Resumo combinado sem opção pronta');
   if(menu.classList.contains('open'))menu.querySelector('button').click();
   assert(unit.value===value,'Seleção múltipla normalizada '+value);
   const totalCell=document.querySelector('[data-cg-total="month"]');
   const actual=[...totalCell.querySelectorAll('.cg-production-heads>span>strong')].map(parse);
   assert(JSON.stringify(actual)===JSON.stringify(totals),'Total do calendário '+value+': '+actual+' / '+totals);
   const monthRow=document.querySelector('[data-cg-month-period="2026-11"]');
   const annualRow=document.querySelector('[data-cg-total-year="2026"]');
   const values=row=>[row.querySelector('[data-cg-month-an-total] .cg-monthly-quantity>strong'),row.querySelector('td[data-cg-label="Real Alimentos"]>.cg-monthly-quantity>strong'),row.querySelector('td[data-cg-label="Total do mês"]>.cg-monthly-quantity>strong'),row.querySelector('td[data-cg-label="Total geral do ano"]>.cg-monthly-quantity>strong')].filter(Boolean).map(parse);
   const monthlyExpected=[222318,142587,364905];
   const monthlyTable=document.querySelector('.cg-monthly-pivot');
   assert(JSON.stringify([...monthlyTable.querySelectorAll('thead th')].map(cell=>cell.textContent))===JSON.stringify(['Mês','Ave Nova','Real Alimentos','Total do mês']),'Mensal sempre com as duas empresas e total, seleção '+value);
   assert(monthlyTable.querySelectorAll('[data-cg-month-period]').length===12,'Mensal sempre com os 12 meses, seleção '+value);
   assert(JSON.stringify(values(monthRow))===JSON.stringify(monthlyExpected),'Mensal '+value+': '+values(monthRow));
   assert(JSON.stringify(values(annualRow))===JSON.stringify(monthlyExpected),'Anual '+value);
   assert(JSON.stringify([...monthRow.querySelectorAll('[data-cg-month-turn] .cg-monthly-quantity>strong')].map(parse))===JSON.stringify([113244,109074]),'Detalhes mensais sempre com os dois turnos');
   assert(JSON.stringify([...monthRow.querySelectorAll('[data-cg-month-turn] .cg-prod-weight strong')].map(parse))===JSON.stringify([360210,339005]),'Pesos dos turnos sem alterar consolidado');
   assert(JSON.stringify([...monthRow.querySelectorAll('[data-cg-month-turn] .cg-prod-reference>span:first-child>span:last-child')].map(parse))===JSON.stringify([130000,110000]),'Metas mensais por turno');
   if(innerWidth>=1100){
    const tops=[...document.querySelectorAll('.cg-productivity-filters .cg-filter-grid>label:not([hidden]) .checkbox-multiselect-trigger,.cg-productivity-filters .cg-filter-actions,.cg-productivity-filters #cgLimpar')].map(el=>el.getBoundingClientRect().bottom);
    assert(tops.length>=6&&Math.max(...tops)-Math.min(...tops)<=3,'Filtros, flags e limpar na mesma linha: '+tops);
   }
   if(value==='10,111'){
    const stripes=[...document.querySelectorAll('.cg-monthly-pivot tr[data-cg-month-period]')].slice(0,3);
    const backgrounds=stripes.map(row=>[...row.children].map(cell=>getComputedStyle(cell).backgroundColor));
    assert(backgrounds.every(row=>row.every(color=>color===row[0])),'Cada mês deve ter fundo uniforme, incluindo a coluna Mês');
    assert(backgrounds[0][0]!==backgrounds[1][0]&&backgrounds[0][0]===backgrounds[2][0],'Alternância branco/bege entre meses');
    const annualColors=[...annualRow.children].map(cell=>getComputedStyle(cell).backgroundColor);
    assert(annualColors.every(color=>color===annualColors[0])&&annualColors[0]!==backgrounds[0][0]&&annualColors[0]!==backgrounds[1][0],'Total anual mantém o destaque vinho claro');
    const day3=document.querySelector('[data-cg-day="2026-11-03"]');
    assert(day3.querySelectorAll('.cg-production-heads>span').length===1,'Exibir um total consolidado por dia');
    assert(parse(day3.querySelector('.cg-production-heads>span>strong'))===189477,'Somar aves por dia');
    assert(parse(day3.querySelector('.cg-prod-reference>span:first-child>span:last-child'))===200000,'Somar metas por dia');
    assert(parse(day3.querySelector('.cg-prod-reference strong'))===-10523,'Somar diferença positiva e negativa sem perder sinais');
    assert(parse(day3.querySelector('.cg-production-day-weight strong'))===589555,'Somar pesos por dia');
    day3.click();await flush();
    const detail=document.querySelector('.cg-production-detail');
    assert(!detail.hidden&&detail.querySelectorAll('dl>div').length===1,'Detalhamento também consolidado');
    assert(parse(detail.querySelector('dd>strong'))===189477,'Aves no detalhamento');
    assert(parse(detail.querySelector('.cg-prod-reference strong'))===-10523,'Diferença no detalhamento');
    day3.click();await flush();
   }
   results.push({unit:value,...checkLayout(value)});
  }
  // Dia limita o calendário, enquanto o mensal mantém os meses completos do recorte.
  unit.value='10,111';unit.dispatchEvent(new Event('change',{bubbles:true}));await flush();
  const day=document.getElementById('cgDia');day.value='2026-11-02';day.dispatchEvent(new Event('change',{bubbles:true}));await flush();
  assert(JSON.stringify([...document.querySelectorAll('[data-cg-total="month"] .cg-production-heads>span>strong')].map(parse))===JSON.stringify([175428]),'Filtro de dia no calendário com empresas consolidadas');
  assert(parse(document.querySelector('[data-cg-month-period="2026-11"] [data-cg-month-an-total] .cg-monthly-quantity>strong'))===222318,'Dia preserva recorte mensal');
  day.value='';day.dispatchEvent(new Event('change',{bubbles:true}));
  const menu=document.getElementById('cgUnidadeMulti');
  unit.value='10';unit.dispatchEvent(new Event('change',{bubbles:true}));await flush();
  if(!menu.classList.contains('open'))menu.querySelector('button').click();
  menu.querySelector('input[value="1"]').click();await flush();assert(unit.value==='1','Primeiro turno isolado');
  menu.querySelector('input[value="2"]').click();await flush();assert(unit.value==='10','Dois turnos se tornam Ave Nova total');
  assert(menu.querySelector('input[value="10"]').checked&&!menu.querySelector('input[value="1"]').checked&&!menu.querySelector('input[value="2"]').checked,'Checkboxes refletem normalização');
  menu.querySelector('button').click();
  document.getElementById('cgSemanaCheia').click();await flush();assert(document.getElementById('cgSemanaCheia').checked,'Semana cheia');
  document.querySelector('[data-cg-month="1"]').click();await flush();assert(document.getElementById('cgMes').value==='12','Seta sincroniza mês');
  document.querySelector('[data-cg-month="-1"]').click();await flush();assert(document.getElementById('cgMes').value==='11','Seta anterior');
  // Limpar restaura Ave Nova, mês único e semana cheia desmarcada.
  document.getElementById('cgLimpar').click();await flush();assert(unit.value==='10','Limpar unidade');assert(!document.getElementById('cgSemanaCheia').checked,'Limpar semana cheia');
  flag('rendimento').click();await flush();
  assert(JSON.stringify([...unit.options].map(o=>[o.value,o.textContent]))===JSON.stringify(originalOptions),'Restaurar opções originais de Rendimento');
  assert(unit.value==='1,111','Restaurar seleção múltipla de Rendimento');
  assert(!document.getElementById('cgGrupo').closest('label').hidden,'Grupo restaurado em Rendimento');
  assert(rendimentoMarkup()===originalRendimento,'Preservar tabela de Rendimento');
  assert(JSON.stringify(renditionStyle())===JSON.stringify(originalStyle),'Preservar layout de filtros de Rendimento');
  flag('produtividade').click();await flush();unit.value='10,111';unit.dispatchEvent(new Event('change',{bubbles:true}));await flush();
  if(new URLSearchParams(location.search).has('monthly')){const style=document.createElement('style');style.textContent='.page-header,.filter-card,#estadoConsulta,#cgProdutividade>article:first-child{display:none!important}';document.head.append(style);const box=document.querySelector('.cg-monthly-scroll');box.scrollTop=box.scrollHeight;window.scrollTo(0,0);await flush();}
  assert(!errors.length,'Erros JS: '+errors.join('; '));
  document.getElementById('test-result').textContent=JSON.stringify({ok:true,width:innerWidth,selections:results.length,results,rendimentoPreserved:true});
 }catch(e){document.getElementById('test-result').textContent=JSON.stringify({ok:false,message:e.message,stack:e.stack,errors});}
})();
'''


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--widths', default='1366,1440,1920,1024,600,492')
    parser.add_argument('--monthly', action='store_true', help='Capturar o acumulado mensal na imagem')
    parser.add_argument('--height', type=int, default=900)
    args = parser.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    fixture = json.loads((ROOT / 'tools/fixtures/produtividade-novembro-2026.json').read_text(encoding='utf-8'))
    page = '''<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/assets/css/app.css"><link rel="stylesheet" href="/assets/vendor/geist/index.css"><link rel="stylesheet" href="/assets/css/pcp.css"></head>
<body class="pcp-report"><div class="app-shell"><header class="page-header"><div><h1>Comparativo x Cirúrgico Geral</h1><p></p></div><div class="header-toolbar"></div></header>
<section class="card filter-card"></section><div id="mensagemErro" class="hidden"></div><p id="estadoConsulta"></p><main id="pcpConteudo"></main></div><pre id="test-result" hidden>PENDING</pre>
<script src="/assets/js/config.js"></script><script>__SCRIPT__</script><script src="/assets/js/filters.js"></script><script src="/assets/js/pcp-multiselect.js"></script>
<script src="/assets/js/pcp-report-model.js"></script><script src="/assets/js/pcp-cirurgico.js"></script><script src="/assets/js/pcp-report.js"></script><script>__TEST__</script></body></html>'''
    page = page.replace('__SCRIPT__', SCRIPT.replace('__FIXTURE__', json.dumps(fixture, ensure_ascii=False))).replace('__TEST__', TEST)
    (OUT / 'preview.html').write_text(page, encoding='utf-8')
    handler = functools.partial(QuietHandler, directory=str(ROOT))
    server = ThreadingHTTPServer(('127.0.0.1', 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    all_results = []
    try:
        for width in map(int, args.widths.split(',')):
            url = f'http://127.0.0.1:{server.server_port}/outputs/produtividade-layout/preview.html?relatorio=g8'
            if args.monthly:
                url += '&monthly=1'
            suffix = '-monthly' if args.monthly else ''
            command = [str(EDGE), '--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
                       '--disable-background-networking', f'--user-data-dir={OUT / ("profile-"+str(width))}',
                       f'--window-size={width+24},{args.height}', '--force-device-scale-factor=1', '--virtual-time-budget=20000',
                       f'--screenshot={OUT / (str(width)+suffix+".png")}', '--dump-dom', url]
            result = subprocess.run(command, capture_output=True, timeout=60)
            markup = result.stdout.decode('utf-8', errors='replace')
            (OUT / f'{width}.html').write_text(markup, encoding='utf-8')
            match = re.search(r'<pre id="test-result"[^>]*>(.*?)</pre>', markup, re.S)
            if not match or match[1] == 'PENDING':
                value = {'ok': False, 'width': width, 'message': 'Teste não finalizou', 'browser_exit': result.returncode,
                         'stderr': result.stderr.decode('utf-8', errors='replace')[-1000:]}
            else:
                value = json.loads(html.unescape(match[1]))
            all_results.append(value)
            summary = {key: value[key] for key in ('ok','width','selections','rendimentoPreserved') if key in value}
            print(json.dumps(summary if value['ok'] else value, ensure_ascii=False))
    finally:
        server.shutdown()
    result_name = 'results-monthly.json' if args.monthly else ('results.json' if args.height == 900 else 'results-visual.json')
    (OUT / result_name).write_text(json.dumps(all_results, indent=2, ensure_ascii=False), encoding='utf-8')
    raise SystemExit(0 if all(r['ok'] for r in all_results) else 1)


if __name__ == '__main__':
    main()
