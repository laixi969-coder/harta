import { useEffect, useRef, useState } from 'react';
import { api, hartaHandoff, saveFile } from '../api';

type Decisions = {commentId:string;noteId?:string;reviewable:boolean;quote:string; current:number; trial:number; reason:string; fit:string; verdict:string};
type Side = {total:number; judged:number; hits:number};
type Review = {basis:string;revision:number; total:number; done:number; seconds:number; completed:boolean;
  next:{id:string; quote:string; title:string}|null;
  results:{current:Side;trial:Side;sampled:number;sampleJudged:number;sampleHits:number;rejected:number;excludedReasons:Record<string,number>;decisions:Decisions[]}|null};
type Batch = {id:string;keyword:string;createdAt:string;count:number;api:number|null;model:number|null;minutes:number|null;timeRevision:number;firstMinutes:number|null;perApi:number|null;perMinutes:number|null};
type View = {review:Review|null;batches:Batch[]};
const display=(n:number|null)=>n==null?'未记录':String(n);
const endpoint='/harta/batch-review';

function BatchReviewForm({flowId}:{flowId:string}) {
  const [state,setState]=useState<View>();
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [minutes,setMinutes]=useState('');
  const [reload,setReload]=useState(0);
  const elapsed=useRef(0),visibleSince=useRef(0);
  useEffect(()=>{
    let active=true;
    api<View>(endpoint,{action:'open',flowId}).then(result=>{
      if(active){setState(result);setError('');setMinutes(result.batches.find(b=>b.id===flowId)?.minutes?.toString()||'');}
    }).catch(e=>{if(active)setError(e.message);});
    return ()=>{active=false;};
  },[flowId,reload]);
  const row=state?.review?.next;
  useEffect(()=>{
    elapsed.current=0;visibleSince.current=document.hidden?0:performance.now();
    function visibility() {
      if(visibleSince.current)elapsed.current+=performance.now()-visibleSince.current;
      visibleSince.current=document.hidden?0:performance.now();
    }
    document.addEventListener('visibilitychange',visibility);
    return ()=>document.removeEventListener('visibilitychange',visibility);
  },[row?.id]);
  async function act(action:string,fields:Record<string,unknown>={}) {
    setBusy(true);
    try {
      const result=await api<View>(endpoint,{action,flowId,...fields});
      setState(result);setError('');
    } catch(e){setError((e as Error).message);}
    finally{setBusy(false);}
  }
  const current=state?.batches.find(b=>b.id===flowId);
  const review=state?.review,results=review?.results;
  async function openDemand(row:Decisions) {
    if(!row.noteId) return;
    setBusy(true);
    try {await hartaHandoff(row.noteId,row.commentId);}
    catch(e){setError((e as Error).message);}
    finally{setBusy(false);}
  }
  return <section className="batch-review" aria-label="批次复盘">
    {error && <p role="alert">{error} <button type="button" className="btn" onClick={()=>setReload(x=>x+1)}>重新载入</button></p>}
    {!state && !error && <p role="status">正在读取批次…</p>}
    {current && <>
      <p>当前可归入本批的新增有效联系人 <b>{current.count}</b> 人 · API 请求 {display(current.api)} · 模型请求 {display(current.model)}</p>
      {current.count>0 ? <p>从批次开始至首人核实 {display(current.firstMinutes)} 分钟 · 每人API 请求 {display(current.perApi)} 次 · 每位有效联系人的人工用时 {display(current.perMinutes)} 分钟</p>
        : <p>本批暂无可归入的新增有效联系人。人工总用时 {display(current.minutes)} 分钟。</p>}
      {!review && <button className="btn" type="button" disabled={busy} onClick={()=>void act('start')}>抽样核对前十与排除项</button>}
    </>}
    {review && <>
      {row && <><p>盲核 {review.done+1} / {review.total}</p><article className="review-item"><small>{row.title}</small><blockquote>{row.quote}</blockquote>
        <fieldset disabled={busy}><legend>这条需求与本业务匹配吗？</legend><div className="actions">
          {Object.entries({fit:'值得核实',irrelevant:'不匹配',closed:'需求已结束',incomplete:'依据不足'}).map(([verdict,label])=>
            <button type="button" className="btn" key={verdict} onClick={()=>void act('judge',{sampleId:row.id,verdict,revision:review.revision,
              seconds:Math.min(86400,(elapsed.current+(visibleSince.current?performance.now()-visibleSince.current:0))/1000)})}>{label}</button>)}
        </div></fieldset></article></>}
      {results && <>
        <p role="status">{review.total?'已完成盲核':'本批无可核对评论'} · 已提交样本在本次查看中用时 {Math.round(review.seconds/6)/10} 分钟</p>
        {([['原排序',results.current],['优先匹配业务词',results.trial]] as const).map(([name,side])=>
          <p key={name}>{name} · 前列 {side.total} 条，已判定 {side.judged} 条，值得核实 {side.hits} 条</p>)}
        <p>共同排除 {results.rejected} 条，抽查 {results.sampled} 条，已判定 {results.sampleJudged} 条，其中值得核实 {results.sampleHits} 条。</p>
        <details><summary>查看判断依据与匿名导出</summary><p>{review.basis} · 排序比较同一批评论；人工判断表示是否值得核实。</p>
          <p>{Object.entries(results.excludedReasons).map(([k,v])=>k+' '+v+' 条').join(' · ')||'没有排除项'}</p>
          {results.decisions.map((d,i)=><article className="review-item" key={i}><blockquote>{d.quote}</blockquote><p>{d.verdict} · 原排序 {d.current||'前十以外'} / 业务词优先 {d.trial||'前十以外'}</p><small>{d.reason} · {d.fit}</small>{d.reviewable && d.noteId && <button type="button" className="btn" disabled={busy} onClick={()=>void openDemand(d)}>打开这条需求</button>}</article>)}
          {(['qrels','current','trial'] as const).map((key,i)=><button type="button" className="btn" key={key} disabled={busy}
            onClick={async()=>{setBusy(true);try{const files=await api<Record<typeof key,string>>(endpoint,{action:'export',flowId});
              saveFile(new Blob([files[key]],{type:'text/plain'}),'harta-'+key+'.txt');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>
            {['导出匿名判断','导出原排序','导出试验排序'][i]}</button>)}
        </details></>}

    </>}
    {current && <details><summary>记录整批人工核实用时</summary>
      <form onSubmit={e=>{e.preventDefault();void act('time',{revision:current.timeRevision,minutes:Number(minutes)});}}>
        <label>本批全部人工核实用时（分钟）<input type="number" step="any" min="0" max="100000" required value={minutes} onChange={e=>setMinutes(e.target.value)}/></label>
        <button className="btn" type="submit" disabled={busy || !minutes || Number(minutes)===current.minutes}>保存用时</button>
      </form>
    </details>}
    {state && state.batches.length>1 && <details><summary>与其他已完成批次对照</summary>
      {state.batches.map(b=><article className="review-item" key={b.id}><strong>{b.keyword} · {new Date(b.createdAt).toLocaleDateString()}</strong>
        <p>新增有效 {b.count} 人 · API 请求 {display(b.api)} · 模型请求 {display(b.model)} · 人工总用时 {display(b.minutes)} 分钟</p>
        {b.count>0 && <small>首人 {display(b.firstMinutes)} 分钟 · 每人请求 {display(b.perApi)} 次 · 每人用时 {display(b.perMinutes)} 分钟</small>}</article>)}
    </details>}
  </section>;
}

export function BatchReview({flowId}:{flowId:string}) {
  const [open,setOpen]=useState(false);
  return <details className="workflow-details" onToggle={e=>setOpen(e.currentTarget.open)}>
    <summary>查看批次效率与抽样核对</summary>{open && <BatchReviewForm flowId={flowId}/>}
  </details>;
}
