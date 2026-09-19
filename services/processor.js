const { MeliClient } = require('./meli');
const { loadConfig } = require('./config');
const { appendHistory, saveRecommendations, loadRecommendations, loadCosts } = require('./storage');
const { ensureFreshAuth, sessionToAuth, syncAuthToSession } = require('./token');

const DAY_MS = 86400000;
const STOPWORDS = new Set('de da do das dos para com sem em no na nos nas e a o as os um uma original novo nova produto kit cor tamanho modelo marca unidade unidades mercado livre envio frete profissional liso'.split(' '));

function normalize(v){ return String(v||'').replace(/\s+/g,' ').trim(); }
function truncate(v,max=60){ const c=normalize(v); if(c.length<=max)return c; const x=c.slice(0,max+1),p=x.lastIndexOf(' '); return (p>max*.65?x.slice(0,p):c.slice(0,max)).trim(); }
function isoDate(d){ return d.toISOString().replace(/\.\d{3}Z$/,'Z'); }
function median(v){ const a=v.filter(Number.isFinite).sort((x,y)=>x-y); if(!a.length)return null; const m=Math.floor(a.length/2); return a.length%2?a[m]:(a[m-1]+a[m])/2; }
function average(v){ const a=v.filter(Number.isFinite); return a.length?a.reduce((s,x)=>s+x,0)/a.length:null; }
function tokenize(t){ return normalize(t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').split(' ').filter(x=>x.length>=2&&!STOPWORDS.has(x)); }
function extractVisits(data,id){ if(typeof data==='number')return data; if(Array.isArray(data)){const r=data.find(x=>String(x.id||x.item_id||'')===String(id))||data[0];return Number(r?.total_visits??r?.visits??r?.total??0)||0;} return Number(data?.total_visits??data?.visits??data?.total??data?.[id]??0)||0; }
function attrValues(item){ return (item.attributes||[]).filter(a=>a.value_name).map(a=>normalize(a.value_name)).filter(Boolean); }

function buildQueries(item){
  const tokens=tokenize(item.title);
  const attrs=attrValues(item).flatMap(tokenize);
  const unique=a=>[...new Set(a)].filter(Boolean);
  const qs=[
    tokens.slice(0,7).join(' '),
    tokens.slice(0,5).join(' '),
    tokens.slice(0,4).join(' '),
    unique([...tokens.slice(0,3),...attrs.slice(0,2)]).slice(0,5).join(' '),
    tokens.slice(0,3).join(' '),
    tokens.slice(0,2).join(' ')
  ];
  return unique(qs.map(normalize)).filter(q=>q.length>=4);
}

function similarity(a,b){
  const A=new Set(tokenize(a)),B=new Set(tokenize(b)); if(!A.size||!B.size)return 0;
  let hit=0; for(const x of A)if(B.has(x))hit++;
  return hit/Math.min(A.size,B.size);
}

async function researchMarket(client,item,userId,config){
  const queries=buildQueries(item), minSample=Math.min(5,Math.max(3,Number(config.competitorMinSample||4)));
  let best={query:'',results:[],level:0};
  for(let i=0;i<queries.length;i++){
    try{
      const data=await client.searchMarketplace(queries[i],{limit:Math.max(Number(config.competitorLimit||10)*2,20),siteId:process.env.MELI_SITE_ID||'MLB'});
      const raw=(data.results||[]).filter(x=>String(x.seller?.id||'')!==String(userId));
      const filtered=raw.filter(x=>similarity(item.title,x.title)>=0.28).slice(0,Number(config.competitorLimit||10));
      const chosen=filtered.length>=minSample?filtered:raw.filter(x=>similarity(item.title,x.title)>=0.18).slice(0,Number(config.competitorLimit||10));
      if(chosen.length>best.results.length) best={query:queries[i],results:chosen,level:i+1};
      if(chosen.length>=minSample){ best={query:queries[i],results:chosen,level:i+1}; break; }
    }catch(e){ console.warn('Busca mercado:',queries[i],e.response?.data?.message||e.message); }
  }
  const prices=best.results.map(x=>Number(x.price)).filter(x=>x>0);
  const med=median(prices), avg=average(prices), current=Number(item.price||0);
  return {
    query:best.query, searchLevel:best.level, attemptedQueries:queries, count:best.results.length,
    medianPrice:med, averagePrice:avg, minPrice:prices.length?Math.min(...prices):null,
    maxPrice:prices.length?Math.max(...prices):null,
    differenceToMedianPct:(med>0&&current>0)?((current-med)/med*100):null,
    samples:best.results.slice(0,8).map(x=>({id:x.id,title:x.title,price:Number(x.price||0),permalink:x.permalink,thumbnail:x.thumbnail}))
  };
}

function buildDescription(item){
  const attrs=(item.attributes||[]).filter(a=>a.value_name&&!['GTIN','SELLER_SKU'].includes(a.id)).slice(0,12);
  const lines=[normalize(item.title),'','Características:'];
  for(const a of attrs) lines.push(`• ${a.name||a.id}: ${a.value_name}`);
  lines.push('','Antes da compra, confira medidas, modelo e compatibilidade informados no anúncio.');
  return lines.join('\n');
}

function suggestTitle(item,competitors){
  if(Number(item.sold_quantity||0)>0)return null;
  const base=tokenize(item.title), freq=new Map();
  for(const c of competitors)for(const t of new Set(tokenize(c.title)))freq.set(t,(freq.get(t)||0)+1);
  const market=[...freq.entries()].sort((a,b)=>b[1]-a[1]).map(([t])=>t);
  const attrs=attrValues(item).flatMap(tokenize);
  const ordered=[...base.slice(0,5),...market.filter(t=>!base.includes(t)).slice(0,4),...attrs.filter(t=>!base.includes(t)).slice(0,3)];
  let proposed=truncate([...new Set(ordered)].join(' ').replace(/\b\w/g,m=>m.toUpperCase()),60);
  if(!proposed || proposed.toLowerCase()===normalize(item.title).toLowerCase()){
    // Mesmo sem amostra, reorganiza o título com termos objetivos já existentes no próprio anúncio.
    proposed=truncate([...new Set([...base.slice(0,7),...attrs.slice(0,3)])].join(' ').replace(/\b\w/g,m=>m.toUpperCase()),60);
  }
  return proposed && proposed.toLowerCase()!==normalize(item.title).toLowerCase()?proposed:null;
}

function safeFloor(cost,config){
  const variable=(Number(config.marketplaceFeePct||0)+Number(config.taxPct||0)+Number(config.minMarginPct||0))/100;
  if(!(cost>0)||!(Number(config.marketplaceFeePct)>0)||variable>=.95)return null;
  return (Number(cost)+Number(config.fixedFee||0)+Number(config.packagingCost||0))/(1-variable);
}
function priceSuggestion(item,market,cost,config){
  const current=Number(item.price||0), med=Number(market.medianPrice||0);
  if(!(current>0)||!(med>0))return null;
  const diff=(current-med)/med*100;
  if(diff<5) return {type:'price',before:current,after:null,approvable:false,reason:`Seu preço está ${Math.abs(diff).toFixed(1)}% ${diff>=0?'acima':'abaixo'} da mediana. Não há motivo suficiente para reduzir agora.`};
  const floor=safeFloor(cost,config), maxDrop=Math.max(0,Number(config.maxPriceDropPct||0))/100;
  if(!floor)return {type:'price',before:current,after:null,approvable:false,requiresCost:true,reason:`Seu preço está ${diff.toFixed(1)}% acima da mediana, mas a redução fica bloqueada até informar custo e tarifa ML.`};
  const target=Math.max(med,floor,current*(1-maxDrop)),after=Math.round(target*100)/100;
  if(after>=current)return {type:'price',before:current,after:null,approvable:false,floor:Math.round(floor*100)/100,reason:'A concorrência está abaixo, mas não existe redução segura dentro da margem configurada.'};
  return {type:'price',before:current,after,approvable:true,floor:Math.round(floor*100)/100,reason:`Sugestão respeita mediana, piso financeiro e queda máxima de ${config.maxPriceDropPct}% por alteração.`};
}
function scoreItem({ageDays,visits30,sales30,stock},c){let s=0;if(ageDays>=c.minAgeDays)s+=20;if(sales30===0)s+=30;if(visits30<=c.lowVisits30)s+=30;else if(sales30===0&&visits30>=c.highVisits30)s+=25;else if(sales30===0)s+=15;if(stock>0)s+=10;return Math.min(100,s);}
function diagnosis(v,s,c){if(s>0)return'Anúncio com vendas recentes';if(v<=c.lowVisits30)return'Baixa exposição';if(v>=c.highVisits30)return'Baixa conversão';return'Estagnação';}
async function resolveAuth(x){const source=x?.access_token?(x.user?sessionToAuth(x):x):null;const a=await ensureFreshAuth(source);if(x?.access_token&&x.user)syncAuthToSession(a,x);return a;}
function sleep(ms){return new Promise(r=>setTimeout(r,ms));}

async function analyzeAccount(authOrSession,options={}){
  const config=await loadConfig(),auth=await resolveAuth(authOrSession),userId=auth.user?.id;if(!userId)throw new Error('Usuário não identificado');
  // Limpa a fila anterior imediatamente: filtros novos nunca reaproveitam recomendações antigas.
  await saveRecommendations({generatedAt:new Date().toISOString(),summary:{scanned:0,candidates:0,status:'running'},items:[]});
  const client=new MeliClient(auth.access_token),costs=await loadCosts(),now=new Date(),from=new Date(now.getTime()-Number(config.lookbackDays||30)*DAY_MS);
  let recentSales={};try{recentSales=await client.getRecentSalesByItems(userId,isoDate(from),isoDate(now));}catch(e){console.warn('Pedidos recentes:',e.response?.data?.message||e.message);}
  const maxItems=Math.min(Math.max(Number(options.maxItems||500),1),1000),items=[];let offset=0,scanned=0;
  while(scanned<maxItems){
    const search=await client.searchItems(userId,{limit:50,offset,status:'active'}),ids=search.results||[];if(!ids.length)break;
    for(const id of ids){
      if(scanned>=maxItems)break;scanned++;
      try{
        const item=await client.getItem(id),ageDays=Math.max(0,Math.floor((Date.now()-new Date(item.date_created).getTime())/DAY_MS)),stock=Number(item.available_quantity||0);
        let visits30=0;try{visits30=extractVisits(await client.getVisitsRange(id,isoDate(from),isoDate(now)),id);}catch{}
        const sales30=Number(recentSales[id]||0),score=scoreItem({ageDays,visits30,sales30,stock},config);
        if(score<Number(config.minScore||55)||stock<=0||ageDays<Number(config.minAgeDays||0))continue;
        const market=await researchMarket(client,item,userId,config),suggestions=[],diag=diagnosis(visits30,sales30,config);
        if(diag==='Baixa exposição'&&Number(item.sold_quantity||0)===0){
          const proposed=suggestTitle(item,market.samples);
          if(proposed)suggestions.push({type:'title',before:normalize(item.title),after:proposed,approvable:true,editable:true,reason:market.count?`Baixa exposição. O título foi reconstruído usando termos do anúncio e da amostra encontrada pela busca “${market.query}”.`:'Baixa exposição. Sem amostra confiável, a proposta usa somente termos e atributos já existentes no seu anúncio.'});
        }
        let desc='';try{desc=(await client.getDescription(id))?.plain_text||'';}catch{}
        const proposedDesc=buildDescription(item);
        if(desc.trim().length<250||diag!=='Anúncio com vendas recentes') suggestions.push({type:'description',before:desc,after:proposedDesc,approvable:true,editable:true,reason:'Sugestão editável baseada nos atributos reais do anúncio.'});
        const p=priceSuggestion(item,market,Number(costs[id]||0),config);if(p)suggestions.push(p);
        const pics=(item.pictures||[]).map(p=>({id:p.id,url:p.secure_url||p.url})).filter(p=>p.url);
        suggestions.push({type:'pictures',before:pics.length,after:null,approvable:false,reason:pics.length<4?'Galeria curta. Revise se as fotos mostram produto, detalhes, medidas e uso.':'Quantidade de fotos adequada; a ferramenta mostra a galeria para revisão visual, sem sugerir troca apenas pela quantidade.',pictures:pics.slice(0,8)});
        items.push({id,title:item.title,score,diagnosis:diag,metrics:{ageDays,visits30,sales30,soldTotal:Number(item.sold_quantity||0),stock,price:Number(item.price||0)},market,cost:costs[id]||null,suggestions});
        await sleep(100);
      }catch(e){await appendHistory({runType:options.runType||'manual-analysis',action:'analysis_error',id,reason:e.response?.data?.message||e.message});}
    }
    offset+=ids.length;if(ids.length<50)break;
  }
  items.sort((a,b)=>b.score-a.score);
  const payload={generatedAt:new Date().toISOString(),summary:{scanned,candidates:items.length,lookbackDays:config.lookbackDays,status:'complete'},items};
  await saveRecommendations(payload);await appendHistory({runType:options.runType||'manual-analysis',action:'analysis_summary',scanned,candidates:items.length});return payload;
}

async function applyRecommendation(authOrSession,itemId,type,customAfter){
  const auth=await resolveAuth(authOrSession),client=new MeliClient(auth.access_token),saved=await loadRecommendations(),rec=saved.items.find(x=>x.id===itemId);
  if(!rec)throw new Error('Recomendação não encontrada. Analise a conta novamente.');
  const s=rec.suggestions.find(x=>x.type===type);if(!s)throw new Error('Sugestão não encontrada');if(!s.approvable)throw new Error('Sugestão somente informativa.');
  let after=customAfter!=null?customAfter:s.after;
  const latest=await client.getItem(itemId);
  if(type==='title'){after=truncate(after,60);if(!after)throw new Error('Título vazio.');if(Number(latest.sold_quantity||0)>0)throw new Error('Título protegido: anúncio já possui vendas.');await client.updateItem(itemId,{title:after});}
  else if(type==='description'){after=String(after||'').trim();if(!after)throw new Error('Descrição vazia.');await client.updateDescription(itemId,after);}
  else if(type==='price'){after=Number(after);const c=await loadConfig(),cost=Number((await loadCosts())[itemId]||0),floor=safeFloor(cost,c),latestPrice=Number(latest.price||0),dropFloor=latestPrice*(1-Math.max(0,Number(c.maxPriceDropPct||0))/100);if(!floor)throw new Error('Preço bloqueado: informe custo e tarifa ML.');if(!(after>0)||after<floor-.001)throw new Error('Preço abaixo do piso financeiro.');if(after<dropFloor-.001)throw new Error('Redução maior que o limite permitido.');await client.updateItem(itemId,{price:after});}
  else throw new Error('Tipo não suportado');
  s.after=after;s.appliedAt=new Date().toISOString();s.approvable=false;await saveRecommendations(saved);
  await appendHistory({runType:'approved',action:'updated',id:itemId,title:rec.title,changedFields:[type],changes:{[type]:{before:s.before,after}}});return{ok:true,itemId,type,after};
}
module.exports={analyzeAccount,applyRecommendation,safeFloor};
