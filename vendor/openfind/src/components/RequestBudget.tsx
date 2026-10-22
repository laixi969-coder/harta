import { useEffect, useState } from 'react';
import { api } from '../api';
interface Policy { flowLimit: number; dailyLimit: number; modelDailyLimit: number }
interface Usage { api: number; model: number; providers: Record<string, number> }
interface Status { policy: Policy; today: Usage; resetAt: string; recent: (Usage & {id:string})[] }
export function RequestBudget() {
  const [data,setData]=useState<Status|null>(null),[draft,setDraft]=useState<Policy|null>(null);
  const [message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  useEffect(()=>{let alive=true;api<Status>('/request-budget').then(r=>{if(alive)setData(r);}).catch(e=>{if(alive)setMessage(e.message);});return()=>{alive=false;};},[]);
  async function save(){
    if(!draft)return;
    setBusy(true);
    try{setData(await api<Status>('/request-budget',draft,'PUT'));setDraft(null);setMessage('预算已保存，已用请求不会清零');}
    catch(e){setMessage((e as Error).message);}finally{setBusy(false);}
  }
  async function refresh(){
    setBusy(true);
    try{setData(await api<Status>('/request-budget'));setMessage('已刷新当前业务用量');}
    catch(e){setMessage((e as Error).message);}finally{setBusy(false);}
  }
  const p=draft||data?.policy,usage=data?.today.providers||{};
  return <section className="panel settings-form" aria-label="业务请求预算">
    <h2>业务请求预算</h2>
    <p>同一业务的评论复核、内容生成、销售草稿与智能体试运行共用每日模型额度；事实核对和修稿重试各计一次。数据源翻页、详情与失败请求也计数；本地模板与缓存不扣减。只统计请求尝试，实际金额以供应商账单为准。</p>
    {data&&<>
      <p>今日数据源 {data.today.api} / {data.policy.dailyLimit} 次 · 模型 {data.today.model} / {data.policy.modelDailyLimit} 次。下次重置：{new Date(data.resetAt).toLocaleString()}（UTC 零点）。</p>
      <p>模型用量：评论复核 {(usage['harta-qualification-model']||0)+(usage['qualification-model']||0)} 次 · 内容生成 {usage['content-generation']||0} 次 · 销售草稿 {usage['sales-draft']||0} 次 · 智能体试运行 {usage['agent-trial']||0} 次。</p>
    </>}
    <button className="btn" disabled={busy} onClick={()=>void refresh()}>刷新用量</button>
    {p&&<form onSubmit={e=>{e.preventDefault();void save();}}>
      {([['flowLimit','每流程数据源请求上限',10000],['dailyLimit','每日数据源请求上限',100000],['modelDailyLimit','每日模型请求上限',100000]] as const).map(([key,label,max])=><label key={key}>{label}<input type="number" min="1" max={max} required value={p[key]} onChange={e=>setDraft({...p,[key]:Number(e.target.value)})}/></label>)}
      <button className="btn" disabled={!draft||busy}>保存预算</button>
    </form>}
    <p role="status">{message}</p>
    {data&&<details><summary>最近流程用量</summary>{data.recent.map(r=><p key={r.id}>{r.id.slice(5,13)}：数据源 {r.api} 次，模型 {r.model} 次</p>)}</details>}
  </section>;
}
