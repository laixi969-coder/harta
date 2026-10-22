import { useEffect, useState } from 'react';
import { api } from '../api';
interface Policy { flowLimit: number; dailyLimit: number; modelDailyLimit: number }
interface Status { policy: Policy; today: { api: number; model: number }; resetAt: string; recent: {id:string;api:number;model:number}[] }
export function RequestBudget() {
 const [data,setData]=useState<Status|null>(null),[draft,setDraft]=useState<Policy|null>(null),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{api<Status>('/request-budget').then(setData).catch(e=>setMessage(e.message));},[]);
 async function save(){if(!draft)return;setBusy(true);try{setData(await api<Status>('/request-budget',draft,'PUT'));setDraft(null);setMessage('预算已保存，已用请求不会清零');}catch(e){setMessage((e as Error).message);}finally{setBusy(false);}}
 const p=draft||data?.policy;
 return <section className="panel settings-form" aria-label="业务请求预算"><h2>业务请求预算</h2><p>全流程共享额度，翻页、详情与失败请求都计数；缓存不扣减。只统计请求尝试，实际金额以供应商账单为准。</p>{data&&<p>今日数据源 {data.today.api} / {data.policy.dailyLimit} 次 · 评论复核模型 {data.today.model} / {data.policy.modelDailyLimit} 次。下次重置：{new Date(data.resetAt).toLocaleString()}（UTC 零点）。</p>}{p&&<form onSubmit={e=>{e.preventDefault();void save();}}>{([['flowLimit','每流程数据源请求上限',10000],['dailyLimit','每日数据源请求上限',100000],['modelDailyLimit','每日评论复核模型请求上限',100000]] as const).map(([key,label,max])=><label key={key}>{label}<input type="number" min="1" max={max} required value={p[key]} onChange={e=>setDraft({...p,[key]:Number(e.target.value)})}/></label>)}<button className="btn" disabled={!draft||busy}>保存预算</button></form>}<p role="status">{message}</p>{data&&<details><summary>最近流程用量</summary>{data.recent.map(r=><p key={r.id}>{r.id.slice(5,13)}：数据源 {r.api} 次，评论复核模型 {r.model} 次</p>)}</details>}</section>;
}
