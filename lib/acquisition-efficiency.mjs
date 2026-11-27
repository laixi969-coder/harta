import { makeRankingSample } from './acquisition-ranking-sample.mjs';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { contactIdentity, effectiveContactDirectory, meetsEffectiveCondition } from '../js/lead-qualification.js';
import { isRealEvidence } from '../js/evidence-kind.js';
import { assessComment, qualificationVersion } from '../vendor/openfind/server/domain.ts';
import { businessFit } from '../vendor/openfind/shared/business-fit.ts';
import { businessStoreDirectory } from './model-budget.mjs';
import { openScopedStore } from './scoped-store.mjs';
import { readWorkspace } from './workspace.mjs';

const reasons = {fit:'需求与业务匹配', irrelevant:'需求与业务无关', incomplete:'依据不足', closed:'已解决或非购买需求'};
const request = z.discriminatedUnion('action', [
  z.object({action:z.literal('open'),flowId:z.string().min(1).max(200)}).strict(),
  z.object({action:z.literal('start'),flowId:z.string().min(1).max(200)}).strict(),
  z.object({action:z.literal('judge'),flowId:z.string().min(1).max(200),sampleId:z.string().uuid(),
    verdict:z.enum(['fit','irrelevant','incomplete','closed']),revision:z.number().int().nonnegative(),
    seconds:z.number().finite().min(0).max(86400)}).strict(),
  z.object({action:z.literal('time'),flowId:z.string().min(1).max(200),revision:z.number().int().nonnegative(),minutes:z.number().finite().min(0).max(100000)}).strict(),
  z.object({action:z.literal('export'),flowId:z.string().min(1).max(200)}).strict()
]);
const timestamp = value => Date.parse(value);
const minutesBetween = (from,to) => Number.isFinite(from) && Number.isFinite(to) && to >= from ? (to-from)/60000 : null;
const round = value => value == null ? null : Math.round(value*100)/100;
const unique = values => [...new Set(values)];
function freezeSample(flow, read) {
  const notes=new Map(flow.selectedNoteIds.map(id=>[id,read('notes',id)]));
  const pool=unique(flow.commentIds).map(id=>read('comments',id)).filter(c=>c?.source==='live' && notes.get(c.noteId)?.source==='live' && notes.get(c.noteId)?.platform===flow.input.platform && (!c.platform || c.platform===flow.input.platform));
  const threads=Map.groupBy(pool,c=>c.noteId);
  const asOf=timestamp(flow.finishedAt || flow.updatedAt);
  if(!Number.isFinite(asOf)) throw new Error('该批次缺少完成时间，无法复原当时的排序');
  const ranked=pool.map(c=>{
    const note=notes.get(c.noteId), a=assessComment(c,note,asOf,threads.get(c.noteId)), fit=businessFit(c.body,flow.input);
    return {c,note,a,fit,eligible:fit.eligible && a.recommended && a.withinSevenDays===true};
  });
  return {...makeRankingSample(flow,ranked,qualificationVersion),basis:'历史记录回放'};
}

function reviewView(review) {
  if(!review) return null;
  const next=review.entries.find(row=>!row.verdict), completed=!next;
  const side=key=>{
    const ranked=review.entries.filter(r=>r[key]>0);
    return {total:ranked.length,judged:ranked.filter(r=>r.verdict && r.verdict!=='incomplete').length,hits:ranked.filter(r=>r.verdict==='fit').length};
  };
  const sample=review.entries.filter(r=>r.excluded);
  return {basis:review.basis,revision:review.revision,total:review.entries.length,done:review.entries.filter(r=>r.verdict).length,completed,
    next:next?{id:next.id,quote:next.quote,title:next.title}:null,seconds:review.entries.reduce((sum,r)=>sum+(r.seconds || 0),0),
    results:completed?{current:side('current'),trial:side('trial'),sampled:sample.length,
      sampleJudged:sample.filter(r=>r.verdict&&r.verdict!=='incomplete').length,sampleHits:sample.filter(r=>r.verdict==='fit').length,
      rejected:review.rejected,excludedReasons:review.excludedReasons,
      decisions:review.entries.map(r=>({commentId:r.commentId,noteId:r.noteId,reviewable:r.reviewable && r.verdict==='fit',quote:r.quote,current:r.current,trial:r.trial,reason:r.rule,fit:r.fit,verdict:reasons[r.verdict]}))}:null};
}

// Attribute a person once, at the earliest batch that actually observed their matching comment.
// Existing contacts, unknown creation dates, and later repeat batches never earn new-contact credit.
function attributedPeople(acquisition,customerId,flows,now) {
  const {effective,contacts,policy}=effectiveContactDirectory(acquisition,customerId,now);
  const firstByIdentity=new Map();
  for (const {lead} of contacts.values()) {
    const key=contactIdentity(lead), created=timestamp(lead.createdAt);
    firstByIdentity.set(key,Math.min(firstByIdentity.get(key)??Infinity, Number.isFinite(created)?created:-Infinity));
  }
  const firstByComment=new Map();
  for (const flow of [...flows].sort((a,b)=>timestamp(a.createdAt)-timestamp(b.createdAt)||a.id.localeCompare(b.id))) {
    for(const id of flow.commentIds || []) {
      const prefix=flow.input.platform==='douyin'?'dy:':'xhs:';
      const key=JSON.stringify([flow.input.platform,id.startsWith(prefix)?id.slice(prefix.length):id]);
      if(!firstByComment.has(key)) firstByComment.set(key,flow);
    }
  }
  const evidence=new Map((acquisition.signals||[]).filter(s=>s.customerId===customerId && s.status==='confirmed' && !s.isAuthorReply && isRealEvidence(s)).map(s=>[s.id,s]));
  const works=new Map((acquisition.works||[]).filter(w=>w.customerId===customerId && isRealEvidence(w)).map(w=>[w.id,w]));
  const counts=new Map();
  for (const [identity,scopes] of effective) {
    let earliest=null,qualifiedAt=null;
    for (const {lead,scope} of scopes) {
      if(!lead.platform || !lead.authorId)continue;
      const qualifiedTimes=(lead.events || []).filter(e=>e.type==='qualification' && (e.opportunityId || '')===scope.scopeId
        && meetsEffectiveCondition(e.assessment,policy) && e.assessment.sourceKey===scope.assessment.sourceKey
        && e.assessment.quote===scope.assessment.quote).map(e=>timestamp(e.at));
      qualifiedTimes.push(timestamp(scope.assessment.updatedAt));
      for (const id of scope.opportunity?.signalIds || lead.signalIds || []) {
        const s=evidence.get(id),work=works.get(s?.workId);
        if(!s || s.leadId!==lead.id || !work?.openfindIds?.length || work.platform!==s.platform || !s.recordId)continue;
        const platform={'小红书':'xiaohongshu','抖音':'douyin'}[s.platform];
        const key=JSON.stringify([platform,s.recordId]);
        const flow=firstByComment.get(key);
        if(!flow || !flow.selectedNoteIds.some(note=>work.openfindIds.includes(note)))continue;
        const start=timestamp(flow.createdAt);
        const at=Math.min(...qualifiedTimes.filter(time=>time>=start));
        if(!(firstByIdentity.get(identity)>=start && Number.isFinite(at)))continue;
        if(!earliest || start<timestamp(earliest.createdAt)) {earliest=flow;qualifiedAt=at;}
        else if(flow.id===earliest.id)qualifiedAt=Math.min(qualifiedAt,at);
      }
    }
    if(earliest) {
      const tally=counts.get(earliest.id) || {count:0,firstAt:Infinity};
      tally.count++;tally.firstAt=Math.min(tally.firstAt,qualifiedAt);counts.set(earliest.id,tally);
    }
  }
  return counts;
}

function anonymousExport(review) {
  if(!review || review.entries.some(r=>!r.verdict)) throw new Error('先完成这批盲核，再导出对照');
  const q=review.queryId,judged=review.entries.filter(r=>r.verdict!=='incomplete');
  const run=side=>review.entries.filter(r=>r[side]).sort((a,b)=>a[side]-b[side]).map(r=>[q,'Q0',r.id,r[side],11-r[side],side].join(' ')).join('\n');
  return {qrels:judged.map(r=>[q,0,r.id,Number(r.verdict==='fit')].join(' ')).join('\n'),current:run('current'),trial:run('trial')};
}

export function batchReview(db,acquisition,customerId,body) {
  const input=request.parse(body);
  const query=db.prepare('SELECT value FROM entities WHERE kind=? AND id=?');
  const read=(kind,id)=>{const row=query.get(kind,id);return row?JSON.parse(row.value):undefined;};
  db.exec(input.action==='open'||input.action==='export'?'BEGIN':'BEGIN IMMEDIATE');
  try {
    const flows=db.prepare("SELECT value FROM entities WHERE kind='workflows'").all().map(row=>JSON.parse(row.value)).filter(f=>f.status==='completed' && f.input?.mode==='live');
    const flow=flows.find(f=>f.id===input.flowId);
    if(!flow) throw new Error('请选择本业务已完成的真实采集批次');
    let review=read('hartaBatchReview',flow.id);
    const partialLegacy=sample=>sample && !sample.completeBatch && sample.basis==='批次快照' && sample.total<unique(flow.commentIds || []).length;
    if(partialLegacy(review)) review.basis='历史批次的部分评论';
    if(input.action==='export') {
      const result=anonymousExport(review);db.exec('COMMIT');return result;
    }
    if(input.action==='start' && !review) {
      const frozen=read('hartaRankingSample',flow.id);
      review=frozen && !partialLegacy(frozen) ? frozen : freezeSample(flow,read);
      review.startedAt=new Date().toISOString();
    }
    if(input.action==='time') {
      const prior=read('hartaBatchTime',flow.id);
      if((prior?.revision || 0)!==input.revision)throw new Error('本批人工用时已更新，请重新打开');
      db.prepare('INSERT INTO entities(kind,id,value) VALUES(?,?,?) ON CONFLICT(kind,id) DO UPDATE SET value=excluded.value')
        .run('hartaBatchTime',flow.id,JSON.stringify({id:flow.id,revision:input.revision+1,minutes:input.minutes}));
    }
    if(input.action==='judge') {
      if(!review || review.revision!==input.revision)throw new Error('批次复核已更新，请重新打开');
      const row=review.entries.find(r=>!r.verdict);
      if(!row || row.id!==input.sampleId)throw new Error('该样本已处理，请重新打开');
      Object.assign(row,{verdict:input.verdict,seconds:Math.round(input.seconds),judgedAt:new Date().toISOString()});
      review.revision++;
    }
    if(review && ['start','judge'].includes(input.action))db.prepare('INSERT INTO entities(kind,id,value) VALUES(?,?,?) ON CONFLICT(kind,id) DO UPDATE SET value=excluded.value').run('hartaBatchReview',flow.id,JSON.stringify(review));
    const people=attributedPeople(acquisition,customerId,flows,Date.now());
    const batches=flows.sort((a,b)=>timestamp(b.createdAt)-timestamp(a.createdAt)).map(f=>{
      const tally=people.get(f.id),usage=read('requestUsage','flow:'+f.id), logged=read('hartaBatchTime',f.id);
      const api=usage?.api ?? (f.tracksFlowRequests?0:null),model=f.tracksFlowRequests?(usage?.model??0):null, count=tally?.count||0;
      return {id:f.id,keyword:f.input.keyword,createdAt:f.createdAt,api,model,count,minutes:logged?.minutes??null,timeRevision:logged?.revision||0,
        firstMinutes:round(minutesBetween(timestamp(f.createdAt),tally?.firstAt)),perApi:count&&api!=null?round(api/count):null,
        perMinutes:count&&logged?.minutes!=null?round(logged.minutes/count):null};
    });
    db.exec('COMMIT');return {review:reviewView(review),batches};
  } catch(error){db.exec('ROLLBACK');throw error;}
}

export function batchReviewAction(email,customerId,input) {
  const space=readWorkspace(email);
  if(!space.customers.some(c=>c.id===customerId))throw new Error('找不到当前业务');
  const directory=businessStoreDirectory(email,customerId);
  if(!existsSync(path.join(directory,'openfind.sqlite')))throw new Error('本业务尚无采集批次');
  const {db}=openScopedStore(directory);
  try{return batchReview(db,space.acquisition || {},customerId,input);}
  finally{db.close();}
}
