import {createHash} from 'node:crypto';
import {csvRows} from '../js/csv.js';
import {isRealEvidence} from '../js/evidence-kind.js';
import {publicationIdentity} from './publication-identity.mjs';
import {readWorkspace,writeWorkspace} from './workspace.mjs';

const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const orderKey = (shop,orderId) => JSON.stringify([shop,orderId]);
const signedCents = value => Math.round(Number(value)*100);
function text(value,label,limit) {
  if(typeof value!=='string' || !value.trim() || value.trim().length>limit) throw new Error('请填写'+label+'（最多'+limit+'字）');
  return value.trim();
}
function shopCalendar(timeZone) {
  let formatter;
  try {formatter=new Intl.DateTimeFormat('en-US',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'});}
  catch {throw new Error('请填写有效的店铺时区，例如 Asia/Shanghai');}
  return instant=>{
    const parts=Object.fromEntries(formatter.formatToParts(instant).map(part=>[part.type,part.value]));
    return [parts.year,parts.month,parts.day].join('-');
  };
}
export function validateOrderPublicationDate(orders,publicationId,publishedAt) {
  const firstByZone=new Map();
  for(const order of orders || []) {
    if(order.publication?.publicationId!==publicationId) continue;
    const zone=order.timeZone || 'Asia/Shanghai',first=firstByZone.get(zone);
    if(!first || order.date<first) firstByZone.set(zone,order.date);
  }
  for(const [zone,first] of firstByZone) {
    if(shopCalendar(zone)(new Date(publishedAt))>first) throw new Error('发布时间不能晚于已归属订单的支付日期，请先核对订单来源');
  }
}
function day(value,today) {
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10)===value;
  if(!valid || value>today) throw new Error('日期需为有效的年-月-日，并且不能晚于店铺当地今天');
  return value;
}
function money(value) {
  if(!/^\d+(?:\.\d{1,2})?$/.test(value) || Number(value)>1e10) throw new Error('金额需为人民币非负数，最多两位小数');
  return signedCents(value);
}
const columns = {
  orderId:['订单号','order_id'],refundId:['退款号','refund_id'],date:['日期','date'],
  amount:['金额','amount'],url:['作品链接','url'],platform:['平台','platform'],currency:['币种','currency'],
};
function parseRows(input,today) {
  const rows=csvRows(input);
  if(rows.length<2 || rows.length>501) throw new Error('每次导入 1 至 500 笔流水');
  const headers=rows.shift().map(h=>h.trim());
  const positions={};
  for(const [name,aliases] of Object.entries(columns)) {
    const matches=headers.flatMap((h,i)=>aliases.includes(h)?[i]:[]);
    if(matches.length>1) throw new Error('重复列名“'+aliases[0]+'”');
    if(matches.length) positions[name]=matches[0];
  }
  if(['orderId','date','amount'].some(name=>positions[name]===undefined)) throw new Error('CSV 需要订单号、日期、金额三列');
  return rows.map((cells,i)=>{
    try {
      if(cells.length!==headers.length) throw new Error('列数与表头不一致');
      const get=name=>(cells[positions[name]]||'').trim();
      const refundId=get('refundId');
      if(positions.currency!==undefined && !['CNY','RMB','人民币'].includes(get('currency').toUpperCase())) throw new Error('金额须使用人民币');
      const link=get('url');
      if(link){
        let url;try{url=new URL(link);}catch{throw new Error('请填写完整的作品链接或留空');}
        if(link.length>2000 || !['https:','http:'].includes(url.protocol) || url.username || url.password) throw new Error('请填写有效的作品链接或留空');
      }
      if(get('platform').length>64) throw new Error('平台名称过长');
      if(refundId.length>120) throw new Error('退款号最多120字');
      return {line:i+2,orderId:text(get('orderId'),'订单号',120),date:day(get('date'),today),cents:money(get('amount')),refundId,url:get('url'),platform:get('platform')};
    }catch(error){throw new Error('第 '+(i+2)+' 行：'+error.message);}
  });
}
function sourcePublication(space,customerId,row,localDay) {
  if(!row.url) return null;
  const identity = publicationIdentity(row.platform,row.url);
  const candidates=(space.acquisition?.publications||[]).filter(p=>isRealEvidence(p) && p.customerId===customerId && p.status==='published' && (!row.platform || p.platform===row.platform) && publicationIdentity(p.platform,p.url)===publicationIdentity(p.platform,row.url));
  if(!identity || candidates.length!==1) return null;
  const p=candidates[0];
  const account=(space.acquisition?.accounts||[]).find(a=>a.customerId===customerId && a.id===p.accountId);
  if(!isRealEvidence(account)) return null;
  if(!row.refundId) {
    const publishedAt=new Date(p.publishedAt);
    if(!Number.isFinite(publishedAt.getTime())) return null;
    if(row.date < localDay(publishedAt)) throw new Error('支付早于作品发布日期，请核对作品链接或留空');
  }
  return {publicationId:p.id,accountId:p.accountId,accountName:account.name,platform:p.platform,content:{title:p.content?.title||p.content?.cover||''},goal:p.goal||'',revision:p.revision||'',publicationVersion:p.metadataVersion||1};
}
function previewOrders(space,c,input) {
  const shop=text(input.shop,'店铺名称',100),source=text(input.source,'来源文件名',200);
  const previousZone=(c.orderLedger||[]).find(o=>o.shop===shop)?.timeZone;
  const timeZone=text(input.timeZone||previousZone||'Asia/Shanghai','店铺时区',80);
  const localDay=shopCalendar(timeZone);
  if(previousZone && previousZone!==timeZone) throw new Error('请沿用这家店已有的时区 '+previousZone);
  const list=parseRows(input.csv,localDay(new Date()));
  const ledger=structuredClone(c.orderLedger||[]);
  const indexed=new Map(ledger.map(order=>[orderKey(order.shop,order.orderId),order]));
  const refundOwners=new Map();
  for(const order of ledger.filter(o=>o.shop===shop)) {
    for(const refund of order.refunds) {
      const previous=refundOwners.get(refund.id);
      refundOwners.set(refund.id,previous!==undefined && previous!==order.orderId?null:order.orderId);
    }
  }
  const receiptSources=new Map();
  const counts={added:0,refunds:0,duplicates:0,linked:0,supplemented:0,corrected:0,pending:0};
  const affected=new Set(), preview=[];
  // Process receipts before refunds so a reversed platform export can be replayed.
  for(const row of list.sort((a,b)=>Number(Boolean(a.refundId))-Number(Boolean(b.refundId)))) {
    const key=orderKey(shop,row.orderId);
    let order=indexed.get(key);
    try {
      const pub=sourcePublication(space,c.id,row,localDay);
      let status,previousSource='';
      if(!row.refundId) {
        if(row.url) {
          const platform=pub?.platform || row.platform,previous=receiptSources.get(key);
          if(previous && ((platform && previous.platform && previous.platform!==platform) ||
            publicationIdentity(platform || previous.platform,previous.url)!==publicationIdentity(platform || previous.platform,row.url))) {
            throw new Error('同一文件中同一订单有不同的作品来源，请核对后再导入');
          }
          receiptSources.set(key,{url:row.url,platform:platform || previous?.platform});
        }
        if(!order) {
          order={shop,timeZone,orderId:row.orderId,date:row.date,cents:row.cents,source,sourceUrl:row.url,sourcePlatform:row.platform,publication:pub,refunds:[]};
          indexed.set(key,order);ledger.push(order);counts.added++;affected.add(key);status='新增订单';
        } else {
          if(order.cents!==row.cents || order.date!==row.date) throw new Error('同一订单的金额或日期冲突，请核对原始订单');
          const oldUrl=order.sourceUrl||'';
          const oldPlatform=order.publication?.platform || order.sourcePlatform;
          const nextPlatform=pub?.platform || row.platform;
          const different=oldUrl && row.url && ((oldPlatform && nextPlatform && oldPlatform!==nextPlatform) ||
            publicationIdentity(nextPlatform||oldPlatform,oldUrl)!==publicationIdentity(nextPlatform||oldPlatform,row.url));
          const replaced=order.publication && pub && order.publication.publicationId!==pub.publicationId;
          if((different || replaced || (order.publication && row.url)) && !pub) throw new Error('新作品链接尚未匹配，先登记作品后再更正归属');
          if(pub && (!order.publication || replaced)) {
            previousSource=order.publication?.content?.title||oldUrl;
            order.attributionHistory||=[];
            order.attributionHistory.push({previous:order.publication,previousUrl:oldUrl,source,adoptedUrl:row.url});
            order.publication=pub;order.sourceUrl=row.url;order.sourcePlatform=pub.platform;order.attributionSource=source;
            if(different || replaced){counts.corrected++;status='更正作品归属';}
            else {counts.linked++;status='补认作品';}
            affected.add(key);
          }
          else if(!pub && !order.publication && !oldUrl && row.url) {
            order.sourceUrl=row.url;order.sourcePlatform=row.platform;order.attributionSource=source;
            counts.supplemented++;affected.add(key);status='补记待确认链接';
          } else {counts.duplicates++;status='已登记';}
        }
      } else {
        if(!order) throw new Error('退款缺少原订单，请一并导入订单行');
        if(refundOwners.has(row.refundId) && refundOwners.get(row.refundId)!==row.orderId) throw new Error('该店铺的退款号已属于其他订单，请核对退款原单');
        const originalPlatform=order.publication?.platform || order.sourcePlatform;
        if(row.platform && originalPlatform && row.platform!==originalPlatform) throw new Error('退款来源与订单不一致，请核对平台');
        if(row.url) {
          const platform=row.platform||order.sourcePlatform;
          const samePending=!order.publication && order.sourceUrl &&
            (!row.platform || !order.sourcePlatform || row.platform===order.sourcePlatform) &&
            publicationIdentity(platform,row.url)===publicationIdentity(platform,order.sourceUrl);
          if(!samePending && (!pub || pub.publicationId!==order.publication?.publicationId)) throw new Error('退款来源与订单不一致，请核对作品链接');
        }
        if(row.date<order.date) throw new Error('退款日期早于支付日期');
        const prior=order.refunds.find(r=>r.id===row.refundId);
        if(prior) {
          if(prior.cents!==row.cents || prior.date!==row.date) throw new Error('同一退款号的金额或日期冲突');
          counts.duplicates++;status='已登记';
        } else {
          if(row.cents<=0 || order.refunds.reduce((n,r)=>n+r.cents,0)+row.cents>order.cents) throw new Error('退款须大于零，累计退款不能超过实收金额');
          refundOwners.set(row.refundId,order.orderId);
          order.refunds.push({id:row.refundId,cents:row.cents,date:row.date,source});counts.refunds++;affected.add(key);status='新增退款';
        }
      }
      preview.push({line:row.line,orderId:row.orderId,refundId:row.refundId,amount:row.cents/100,date:row.date,previousSource,title:order.publication?.content?.title||'',status});
      if(!order.publication) counts.pending++;
    } catch(error){throw new Error('第 '+row.line+' 行：'+error.message);}
  }
  if(ledger.length>10000 || ledger.reduce((n,o)=>n+o.refunds.length,0)>30000) throw new Error('此业务订单或退款记录已达上限');
  preview.sort((a,b)=>a.line-b.line);
  const basis=digest([c.id,c.orderLedgerRevision||0,shop,source,input.csv,preview,ledger.filter(o=>affected.has(orderKey(o.shop,o.orderId)))]);
  return {ledger,preview,counts,basis,affected};
}

function receiptWindow(c,{shop,start,end},now) {
  const groups=new Map();let pending=0,events=0;
  for(const order of c.orderLedger||[]) {
    if(order.shop!==shop) continue;
    const inWindow=date=>date>=start && date<=end;
    const paid=inWindow(order.date),refunds=order.refunds.filter(r=>inWindow(r.date));
    if(!paid && !refunds.length) continue;
    events+=Number(paid)+refunds.length;
    if(!order.publication){pending+=Number(paid)+refunds.length;continue;}
    const p=order.publication;
    if(!groups.has(p.publicationId)) groups.set(p.publicationId,{p,orders:0,revenue:0,refunds:0,evidence:[]});
    const totals=groups.get(p.publicationId);
    if(paid){totals.orders++;totals.revenue+=order.cents;totals.evidence.push([order.orderId,order.date,order.cents,order.source,order.attributionSource||'',order.sourceUrl||'']);}
    for(const refund of refunds){totals.refunds+=refund.cents;totals.evidence.push([order.orderId,refund.id,refund.date,refund.cents,refund.source]);}
  }
  const id=digest([shop,start,end]),source=shop+' · 订单退款对账';
  for(const totals of groups.values()) {
    if(!Number.isSafeInteger(totals.revenue) || !Number.isSafeInteger(totals.refunds)) throw new Error('窗口金额过大，请缩短统计日期范围');
  }
  const rows=[...groups.values()].map(({p,orders,revenue,refunds,evidence})=>({
    ...p,seriesId:'ledger:'+shop,id:digest([id,p,evidence]),metrics:{orders,revenue:revenue/100,refunds:refunds/100},
    start,end,recordedAt:now,source,criteria:'店内订单号去重，按支付日计订单和实收，按退款日计退款；金额为人民币',
  }));
  return {id,shop,start,end,rows,pending,events,confirmedAt:now,stale:false};
}
export function orderReviewAction(email,input={}) {
  const space=readWorkspace(email),c=space.customers.find(c=>c.id===input.customerId);
  if(!isRealEvidence(c)) throw new Error('请选择当前账号的业务');
  const revision=c.orderLedgerRevision||0;
  if(input.action==='preview' || input.action==='import') {
    const result=previewOrders(space,c,input);
    if(input.action==='preview') return {preview:result.preview,counts:result.counts,basis:result.basis};
    if(input.confirmed!==true || typeof input.basis!=='string' || !/^[0-9a-f]{64}$/.test(input.basis) || (result.affected.size && result.basis!==input.basis)) throw new Error('预览已变化，请重新预览并确认');
    if(result.counts.corrected && input.confirmCorrections!==true) throw new Error('同一订单有不同的作品来源，请在预览中确认更正');
    if(result.affected.size) {
      c.orderLedger=result.ledger;c.orderLedgerRevision=revision+1;
      for(const w of c.orderReviewWindows||[]) {
        if(w.shop!==input.shop.trim()) continue;
        const current=receiptWindow(c,w,w.confirmedAt);
        if(digest([current.rows,current.pending])!==digest([w.rows,w.pending])) w.stale=true;
      }
      writeWorkspace(email,space);
    }
    return {workspace:space,counts:result.counts};
  }
  if(input.action==='window') {
    if(input.revision!==revision || input.confirmed!==true) throw new Error('订单数据已变化或未确认完整，请重新核对');
    const shop=text(input.shop,'店铺名称',100),existing=(c.orderLedger||[]).find(o=>o.shop===shop);
    if(!existing) throw new Error('请先导入这家店的订单');
    const today=shopCalendar(existing.timeZone||'Asia/Shanghai')(new Date());
    const start=day(input.start,today),end=day(input.end,today);
    if(start>end) throw new Error('结束日期应晚于或等于开始日期');
    const window=receiptWindow(c,{shop,start,end},new Date().toISOString());
    if(!window.events) throw new Error('这个窗口没有已导入的流水，请核对日期');
    const windows=c.orderReviewWindows||[];
    if(windows.length>=200 && !windows.some(w=>w.id===window.id)) throw new Error('此业务已保存200个对账窗口');
    c.orderReviewWindows=[window,...windows.filter(w=>w.id!==window.id)];
    return {workspace:writeWorkspace(email,space)};
  }
  throw new Error('请选择预览、导入或核对统计窗口');
}
