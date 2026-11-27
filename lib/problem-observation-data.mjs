import crypto from 'node:crypto';
import {isRealEvidence,isResearchComment} from '../js/evidence-kind.js';
import {demandLanguage} from '../js/demand-rules.js';
import {currentPrice} from './product-scope.mjs';
import {approvedSalesDocuments} from './sales-knowledge.mjs';
export const digest=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
export const clean=(v,max=1500)=>String(v??'').trim().slice(0,max);
const anonymous=v=>clean(v,6000).replace(/\b1[3-9]\d{9}\b/g,'[电话已隐藏]').replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi,'[邮箱已隐藏]');
export const SOURCE_LABELS={customer:'客户咨询（匿名提炼）',own:'自己作品评论',external:'公开评论',service:'服务现场记录',search:'搜索线索（不代表需求量）',market:'市场与对标观点',hypothesis:'待验证假设',answer:'答案资料'};
export const ANGLES={compare:'比较',contrast:'反差',risk:'风险',judgment:'判断',process:'过程与演示'};

// No private inbound conversation is sent to a model. It must first be anonymized by its owner.
export function observationCatalog(customer, acquisition={}, scope) {
  const sources=[],seen=new Set(),coveredSignals=new Set(),works=(acquisition.works||[]).filter(w=>w.customerId===customer.id&&isRealEvidence(w));
  const add=(id,kind,text,extra={})=>{text=anonymous(text);if(!text||seen.has(id))return;seen.add(id);const row={id,kind,text,...extra};sources.push({...row,revision:digest(row)});};
  for(const t of customer.demandTopics||[]){
    const signal=(acquisition.signals||[]).find(s=>s.id===t.evidenceId&&s.customerId===customer.id);
    if(t.kind==='comment'&&(!signal||!isResearchComment(signal,works)))continue;
    if(t.kind!=='comment'){
      const lead=(acquisition.leads||[]).find(l=>l.id===t.leadId&&l.customerId===customer.id&&isRealEvidence(l));
      if(!lead)continue;
      if(t.kind==='message'&&!(lead.messages||[]).some(m=>m.id===t.evidenceId&&m.direction==='inbound'))continue;
      if(t.kind==='signal'&&(!signal||!isResearchComment(signal,works)))continue;
    }
    if(signal)coveredSignals.add(signal.id);
    add('demand:'+t.id,t.kind==='comment'?(signal?.publicationAttribution?.publicationId?'own':'external'):'customer',t.title,{at:t.updatedAt||t.createdAt,origin:'人工匿名提炼',recordId:t.evidenceId,publicationId:signal?.publicationAttribution?.publicationId||''});
  }
  const recordKeys=new Set();
  for(const s of acquisition.signals||[]){
    if(coveredSignals.has(s.id)||s.customerId!==customer.id||!isResearchComment(s,works)||demandLanguage(s.text||'').seller)continue;
    const key=s.recordId?JSON.stringify([s.platform,s.workId,s.recordId]):s.id;
    if(recordKeys.has(key))continue;recordKeys.add(key);
    const w=works.find(w=>w.id===s.workId),publicationId=s.publicationAttribution?.publicationId||'';
    add('signal:'+s.id,publicationId?'own':'external',s.text,{at:s.publishedAt||s.collectedAt||'',url:s.url||w?.url||'',workId:s.workId||'',platform:s.platform||'',accountKey:s.authorId?digest([s.platform,s.authorId]):'',publicationId,recordId:s.id,parentId:s.parentRecordId||'',origin:s.sourceType||'导入记录'});
  }
  for(const w of works)add('work:'+w.id,'market',[w.title,w.description].filter(Boolean).join('\n'),{at:w.publishedAt||'',url:w.url||'',workId:w.id,platform:w.platform||'',origin:w.source==='manual_paste'?'粘贴参考，未独立核验':'已取得的参考作品'});
  for(const b of customer.keywordLibraries||[])for(const k of b.items||[])add(`keyword:${b.id}:${k.id}`,'search',k.keyword,{at:b.createdAt,origin:b.expansion?.provider==='5118'?'5118 官方查询，按各字段口径核对':b.expansion?'搜索引擎建议，非站内搜索量':'导入词库，按原始来源核对'});
  for(const n of customer.observationNotes||[])if(!n.archived && (n.kind!=='answer' || !scope?.productIds?.length))add('note:'+n.id,n.kind,n.text,{at:n.observedAt||n.createdAt,url:n.url||'',origin:n.source,problemId:n.problemId||''});
  for(const f of customer.factCards||[])if(f.status==='confirmed' && !scope?.productIds?.length)add('fact:'+f.id,'answer',f.text,{origin:f.source||'用户确认的事实卡'});
  const products=(acquisition.products||[]).filter(p=>p.customerId===customer.id && p.status==='active' && (!scope?.productIds?.length || scope.productIds.includes(p.id)));
  const productIds=products.map(p=>p.id);
  const skus=(acquisition.skus||[]).filter(s=>s.customerId===customer.id && s.status==='active' && productIds.includes(s.productId));
  for(const p of products) if(p.source) {
    const price=skus.some(s=>s.productId===p.id) ? '' : currentPrice(p).priceTerms;
    add('product:'+p.id,'answer',[p.name,p.facts,price].filter(Boolean).join('\n'),{origin:p.source});
  }
  const skuIds=skus.filter(s=>!scope?.productIds?.length || scope.skuIds?.includes(s.id)).map(s=>s.id);
  for(const d of approvedSalesDocuments({acquisition},customer.id,{productIds,skuIds})) if(d.source) {
    const product=products.find(p=>p.id===d.productId),sku=skus.find(s=>s.id===d.skuId);
    const scopeLabel=[product?.name,sku?.name].filter(Boolean).join(' · ');
    const origin=[d.source,scopeLabel && '适用于'+scopeLabel,d.revision && '版本 '+d.revision].filter(Boolean).join(' · ');
    add('document:'+d.id,'answer',[d.title,d.body].filter(Boolean).join('\n'),{origin,
      ...(d.productId?{productId:d.productId}:{}),...(d.skuId?{skuId:d.skuId}:{}),...(scopeLabel?{scopeLabel}:{})});
  }
  return sources;
}

// Round robin by source kind and work; do not let one viral post occupy the whole sample.
export function observationSample(catalog,limit=120) {
  const groups=new Map();
  for(const s of [...catalog].sort((a,b)=>String(b.at||'').localeCompare(String(a.at||''))||a.id.localeCompare(b.id))){const key=s.kind+':'+(s.workId||'other');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(s);}
  const byKind=new Map();for(const [key,rows] of groups){const kind=rows[0].kind;if(!byKind.has(kind))byKind.set(kind,[]);byKind.get(kind).push(rows);}
  const selected=[];let progress=true,round=0;
  while(selected.length<limit&&progress){progress=false;for(const buckets of byKind.values()){const available=buckets.filter(b=>b.length);if(!available.length)continue;const bucket=available[round%available.length];selected.push(bucket.shift());progress=true;if(selected.length===limit)break;}round++;}
  return selected;
}
export function businessSearchTerms(customer, acquisition={}) {
  const products=(acquisition.products||[]).filter(p=>p.customerId===customer.id&&p.status==='active').map(p=>p.name);
  const offering=String(customer.pitch||'').split(/[。；，,;\n]/)[0].replace(/^(我们|本店)?(专注于|主营|提供|专做)/,'').trim();
  const subject=products[0] || (customer.observationSettings?.seeds||[])[0] || offering || customer.name;
  const city=customer.city?.trim();
  const local=city && subject && !subject.includes(city) ? city+' '+subject : subject;
  const questions=observationCatalog(customer,acquisition).filter(row=>['customer','own','external'].includes(row.kind)&&row.text.length<=60)
    .sort((a,b)=>String(b.at||'').localeCompare(String(a.at||'')));
  const savedTerm=[...(customer.keywordLibraries||[])].reverse().map(batch=>batch.items?.find(r=>r.keyword?.length<=60)?.keyword).find(Boolean);
  const terms=[local,questions[0]?.text,...(customer.observationSettings?.seeds||[]),savedTerm,...products,customer.hunt!=='其他行业'&&customer.hunt,offering,subject&&subject+' 怎么选',subject&&subject+' 适合谁'];
  return [...new Set(terms.filter(Boolean).map(v=>anonymous(v).replace(/[\r\n]/g,' ').slice(0,80).trim()).filter(Boolean))].slice(0,3);
}

export function observationPlan(customer,acquisition={}) {
  const cfg=customer.observationSettings||{},catalog=observationCatalog(customer,acquisition),counts=Object.fromEntries(Object.keys(SOURCE_LABELS).map(k=>[k,catalog.filter(s=>s.kind===k).length]));
  const products=(acquisition.products||[]).filter(p=>p.customerId===customer.id&&p.status==='active').map(p=>p.name);
  const seeds=(cfg.seeds?.length?cfg.seeds:[...products,customer.hunt]).filter(Boolean).slice(0,5);
  const discovered=[...new Set(catalog.filter(s=>['customer','own','external'].includes(s.kind)).map(s=>s.text).filter(t=>t.length<=60))].slice(0,5);
  return {settings:cfg,counts,seeds,queries:[...new Set([...seeds.flatMap(s=>[s+' 怎么选',s+' 使用问题',s+' 实际经历']),...discovered])].slice(0,20),scope:cfg.scope||[customer.pitch,customer.city].filter(Boolean).join(' · '),hypothesis:true,
    next:catalog.length?'先整理已有材料；新结果重复时停止补采，出现关键分歧再定向查找。':'尚无观察材料：记录一次实际咨询或服务经历，或到作品发现按建议词寻找公开原文。',
    sampling:'按来源类型和作品轮流抽取，优先近期记录；平台未提供的排序、日期和身份保留未知。搜索建议与同行观点不计为客户提问。',
    privateMessages:(acquisition.leads||[]).filter(l=>l.customerId===customer.id&&isRealEvidence(l)).reduce((n,l)=>n+(l.messages||[]).filter(m=>m.direction==='inbound').length,0)};
}
export function problemCurrent(problem,catalog){const byId=new Map(catalog.map(s=>[s.id,s]));return !problem.archived&&!problem.mergedInto&&(problem.evidence||[]).every(e=>byId.get(e.id)?.revision===e.revision)&&(problem.answerEvidence||[]).every(e=>byId.get(e.id)?.revision===e.revision);}
export function problemAnswerFacts(snapshot) {
  return (snapshot.answerEvidence||[]).map(e=>({id:'problem:'+e.id,text:e.quote,source:e.origin,status:'confirmed',
    scope:[e.scopeLabel,...(snapshot.uncertainties||[])].filter(Boolean).join('；')}));
}
export function problemSource(customer,acquisition,key,scope){
  const split=String(key).split('|');if(split.length!==2)return null;
  const p=(customer.observedProblems||[]).find(p=>p.id===split[0]),a=p?.angles?.find(a=>a.id===split[1]);
  if(!p||!a||!problemCurrent(p,observationCatalog(customer,acquisition,scope)))return null;
  return problemAngleSource(p,a);
}
function problemAngleSource(p,a){
  const snapshot={source:'真实问题研究',problemId:p.id,angleId:a.id,title:a.title,why:p.whyNow,reader:p.reader,situation:p.situation,question:p.question,angleType:a.type,coreAnswer:p.coreAnswer,takeaway:p.takeaway,evidence:p.evidence,answerEvidence:p.answerEvidence,uncertainties:p.uncertainties,status:p.status,review:p.review||null};
  return {basis:digest(snapshot),snapshot};
}
export function problemFeedback(customer,acquisition,problemId,feedback={}){
  const problemIds=new Set([problemId]);let changed=true;while(changed){changed=false;for(const p of customer.observedProblems||[])if(p.mergedInto&&problemIds.has(p.mergedInto)&&!problemIds.has(p.id)){problemIds.add(p.id);changed=true;}}
  const packs=[...(customer.drops||[]),...(customer.packs||[])].filter(p=>problemIds.has(p.topicSnapshot?.source?.problemId)),ids=new Set(packs.map(p=>p.id));
  const publications=(acquisition.publications||[]).filter(p=>p.customerId===customer.id&&ids.has(p.packId)&&p.status==='published'&&isRealEvidence(p));
  const pubIds=new Set(publications.map(p=>p.id));
  return {drafts:packs.map(p=>({id:p.id,title:p.topicSnapshot.title,angleId:p.topicSnapshot.source.angleId})),publications:publications.map(p=>({id:p.id,packId:p.packId,platform:p.platform,accountId:p.accountId,url:p.url,publishedAt:p.publishedAt})),
    outcomes:packs.flatMap(p=>Object.entries(p.outcomes||{}).flatMap(([key,rows])=>(Array.isArray(rows)?rows:[]).filter(r=>pubIds.has(r.publicationId)).map(r=>({...r,packId:p.id,contentKey:key})))),
    comments:(acquisition.signals||[]).filter(s=>s.customerId===customer.id&&pubIds.has(s.publicationAttribution?.publicationId)&&isResearchComment(s,acquisition.works)).map(s=>({id:s.id,publicationId:s.publicationAttribution.publicationId,text:anonymous(s.text)})),
    inquiries:(acquisition.leads||[]).filter(l=>l.customerId===customer.id&&isRealEvidence(l)).flatMap(l=>(l.messages||[]).filter(m=>m.direction==='inbound'&&pubIds.has(m.publicationId)).map(m=>({id:m.id,leadId:l.id,publicationId:m.publicationId}))),
    legacyFeedback:Object.entries(feedback).filter(([key])=>packs.some(p=>key.startsWith(p.id+'::'))).map(([key,value])=>({key,value})),note:'逐发布版本展示，不累加重叠统计窗口；评论与人工咨询可能重叠，不能相加为人数或推断因果。'};
}
export function observationView(customer,acquisition={},feedback={}){
  const catalog=observationCatalog(customer,acquisition);
  return {plan:observationPlan(customer,acquisition),catalog,problems:(customer.observedProblems||[]).map(p=>({...p,current:problemCurrent(p,catalog),angleBasis:Object.fromEntries((p.angles||[]).map(a=>[a.id,problemAngleSource(p,a).basis])),feedback:problemFeedback(customer,acquisition,p.id,feedback)})),runs:customer.observationRuns||[]};
}
