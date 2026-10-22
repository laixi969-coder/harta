import { useEffect, useState } from 'react';
import type { Note, Job } from '../../shared/types';
import { api } from '../api';
import { useWorkspace } from '../context';
export const emptyLibraryFilter={category:'',product:'',stage:'',archive:'active',after:'',before:'',batch:''};
export type LibraryFilter=typeof emptyLibraryFilter;
export function libraryMatches(n:Note,f:LibraryFilter,jobs:Job[]){
 const o=n.organization;
 return (!f.category||o?.category===f.category)&&(!f.product||o?.product===f.product)&&(!f.stage||o?.stage===f.stage)&&
 (f.archive==='all'||!!o?.archived===(f.archive==='archived'))&&
 (!f.after||!!n.publishedAt&&n.publishedAt.slice(0,10)>=f.after)&&(!f.before||!!n.publishedAt&&n.publishedAt.slice(0,10)<=f.before)&&
 (!f.batch||!!jobs.find(j=>j.id===f.batch)?.resultIds.includes(n.id));
}
export function LibraryTools({filter,setFilter,selected}:{filter:LibraryFilter;setFilter:(f:LibraryFilter)=>void;selected:string[]}){
 const {data,notify,refresh}=useWorkspace();const [category,setCategory]=useState(''),[product,setProduct]=useState(''),[undo,setUndo]=useState(''),[busy,setBusy]=useState(false),[edited,setEdited]=useState<{category?:string;product?:string}>({});
 useEffect(()=>{let alive=true;api<LibraryFilter|null>('/library/filter').then(f=>{if(alive&&f)setFilter(f);}).catch(e=>notify(e.message,true));return()=>{alive=false;};},[]);
 async function organize(change:Record<string,unknown>,clearEdited=false){setBusy(true);try{const r=await api<{undoId:string}>('/library/organize',{items:selected.map(id=>({id,revision:data.notes.find(n=>n.id===id)?.organization?.revision||0})),change},'PUT');setUndo(r.undoId);if(clearEdited)setEdited({});await refresh();notify('分类已保存，可撤销');}catch(e){notify((e as Error).message,true);}finally{setBusy(false);}}
 return <details className="panel"><summary>分类、归档与常用筛选</summary><div className="field-row">
 {(['category','product'] as const).map(key=><label key={key}>{key==='category'?'需求分类':'产品标签'}<select value={filter[key]} onChange={e=>setFilter({...filter,[key]:e.target.value})}><option value="">全部</option>{[...new Set(data.notes.map(n=>n.organization?.[key]).filter(Boolean))].map(v=><option key={v}>{v}</option>)}</select></label>)}
 <label>处理状态<select value={filter.stage} onChange={e=>setFilter({...filter,stage:e.target.value})}><option value="">全部</option><option value="unprocessed">未处理</option><option value="reference">用于创作</option><option value="reviewed">已核实</option></select></label>
 <label>归档范围<select value={filter.archive} onChange={e=>setFilter({...filter,archive:e.target.value})}><option value="active">未归档</option><option value="archived">已归档</option><option value="all">全部</option></select></label>
 <label>发表日期起<input type="date" value={filter.after} onChange={e=>setFilter({...filter,after:e.target.value})}/></label><label>发表日期止<input type="date" value={filter.before} onChange={e=>setFilter({...filter,before:e.target.value})}/></label>
 <label>采集批次<select value={filter.batch} onChange={e=>setFilter({...filter,batch:e.target.value})}><option value="">全部</option>{data.jobs.filter(j=>j.type==='search').map(j=><option key={j.id} value={j.id}>{j.keyword} · {new Date(j.createdAt).toLocaleString()}</option>)}</select></label></div>
 <button className="btn" onClick={()=>void api('/library/filter',filter,'PUT').then(()=>notify('已保存当前业务常用筛选')).catch(e=>notify(e.message,true))}>保存常用筛选</button><button className="btn" onClick={()=>setFilter({...emptyLibraryFilter})}>重置筛选</button>
 <p>已选 {selected.length} 条；每批最多 100 条。归档保留原文与线索。</p>
 <label>需求分类<input disabled={busy} maxLength={80} value={category} onChange={e=>{setCategory(e.target.value);setEdited(v=>({...v,category:e.target.value}));}}/></label><label>产品标签<input disabled={busy} maxLength={80} value={product} onChange={e=>{setProduct(e.target.value);setEdited(v=>({...v,product:e.target.value}));}}/></label>
 <p>仅保存本次编辑的字段；未编辑的分类或产品标签保持原值。清空已编辑字段会移除该标签。</p>
 <button className="btn" disabled={busy||!selected.length||selected.length>100||!Object.keys(edited).length} onClick={()=>void organize(edited,true)}>保存选中分类</button>
 {([['reference','用于创作'],['reviewed','已核实'],['unprocessed','未处理']] as const).map(([stage,label])=><button className="btn" key={stage} disabled={busy||!selected.length||selected.length>100} onClick={()=>void organize({stage})}>标记{label}</button>)}
 <button className="btn" disabled={busy||!selected.length||selected.length>100} onClick={()=>void organize({archived:true})}>归档选中</button><button className="btn" disabled={busy||!selected.length||selected.length>100} onClick={()=>void organize({archived:false})}>恢复选中</button>
 {undo&&<button className="btn" disabled={busy} onClick={async()=>{setBusy(true);try{await api('/library/undo',{id:undo});setUndo('');await refresh();notify('已撤销');}catch(e){notify((e as Error).message,true);}finally{setBusy(false);}}}>撤销上次分类操作</button>}</details>;
}
