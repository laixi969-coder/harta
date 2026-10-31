import {useRef,useState,useEffect} from 'react';
import {api} from '../api';
export type StudioText={title:string;body:string;tags:string[];platform:'xiaohongshu'|'douyin';kind:'image'|'video'};
type Rule={id:string;title:string;rule:string;mode:string;severity:string;status:string};
type ReviewRecord={id:string;content:StudioText;version:number;checkedAt:string;confirmedRuleIds:string[];checks:Rule[]};
type Report={basis:string;version:number;checks:Rule[];blocked:boolean;needsConfirmation:string[];history:ReviewRecord[];record?:ReviewRecord;text?:string};
export function StudioStandards({content,disabled,notify}:{content:StudioText;disabled:boolean;notify:(message:string,error?:boolean)=>void}){
 const [report,setReport]=useState<Report>(),[reviewed,setReviewed]=useState(''),[confirmed,setConfirmed]=useState<string[]>([]),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 const current=JSON.stringify(content),currentRef=useRef(current);currentRef.current=current;
 const mounted=useRef(true);useEffect(()=>{mounted.current=true;return ()=>{mounted.current=false;};},[]);
 const stale=Boolean(report&&reviewed!==current);
 const update=(value:Report,basis:string)=>{setReport(value);setReviewed(basis);setConfirmed([]);};
 async function check(){
  const basis=current;setBusy(true);setNotice('');
  try{const result=await api<Report>('/harta/standards-review',{action:'check',content});if(!mounted.current||currentRef.current!==basis)throw new Error('检查期间文案已变化，请重新检查');update(result,basis);setNotice('已按当前业务的创作标准检查；图片、视频内容及事实仍需人工核对。');}
  catch(e){setNotice((e as Error).message);}finally{setBusy(false);}
 }
 async function copy(){
  const basis=current;setBusy(true);setNotice('');
  try{
   // Re-read the server's current rules even when this editor already has a review.
   const fresh=await api<Report>('/harta/standards-review',{action:'check',content});
   if(!mounted.current||currentRef.current!==basis)throw new Error('核对期间文案已变化，请重新检查');
   const same=reviewed===basis&&report?.basis===fresh.basis;
   const checked=same?confirmed:[];
   if(!same)update(fresh,basis);
   if(fresh.blocked)throw new Error('请先修改阻止级别规则指出的词句，再复制发布文案');
   if(fresh.needsConfirmation.some(id=>!checked.includes(id)))throw new Error('请逐项核对下方要求，确认后再次复制');
   const prepared=await api<Report>('/harta/standards-review',{action:'prepare',content,basis:fresh.basis,confirmedRuleIds:checked});
   if(!mounted.current||currentRef.current!==basis)throw new Error('准备复制期间文案已变化，未复制旧版本');
   setReport({...prepared,history:[prepared.record!,...prepared.history].slice(0,20)});setReviewed(basis);
   try{await navigator.clipboard.writeText(prepared.text!);}catch{throw new Error('剪贴板写入失败；核对记录已保存，请重试或手动复制文案。');}
   setNotice('文案已复制。核对记录已保存；复制不代表发布。');notify('文案已复制，请自行到官方平台发布');
  }catch(e){setNotice((e as Error).message);notify((e as Error).message,true);}finally{setBusy(false);}
 }
 return <section className="studio-standard-review" aria-label="发布文案核对">
  <header><h3>发布前核对</h3><button type="button" className="btn" disabled={disabled||busy||!content.title.trim()} onClick={()=>void check()}>{busy?'正在核对…':'检查创作规则'}</button></header>
  <p className="field-hint">使用当前业务的创作标准检查文字与话题。可继续保存草稿、下载素材；这里只核对复制的文案，不执行平台发布。</p>
  {stale&&<p role="status">文案已修改，之前的核对不再适用。</p>}
  {report&&<div className={stale?'review-stale':''}><p>创作标准 v{report.version}{!report.checks.length?' · 当前没有逐条规则或命中的禁用词':''}</p>{report.checks.map(rule=><div className="studio-standard-rule" key={rule.id}><p><strong>{rule.title}</strong> · {rule.severity==='block'?'阻止复制发布文案':'提醒'} · {rule.status==='pass'?'词句检查通过':rule.status==='review'?(!stale&&confirmed.includes(rule.id)?'已人工确认':'待人工核对'):'需要修改'}</p><p>{rule.rule}</p>{rule.mode==='manual'&&rule.severity==='block'&&<label><input type="checkbox" disabled={stale||busy} checked={!stale&&confirmed.includes(rule.id)} onChange={e=>setConfirmed(old=>e.target.checked?[...old,rule.id]:old.filter(id=>id!==rule.id))}/>我已核对当前文案符合这条要求</label>}</div>)}</div>}
  {notice&&<p role="status">{notice}</p>}
  <button type="button" className="btn primary" disabled={disabled||busy||!content.title.trim()} onClick={()=>void copy()}>复制发布文案</button>
  {!!report?.history.length&&<details><summary>本业务最近的文案核对记录</summary><p className="field-hint">记录表示已准备复制，不表示剪贴板写入成功或已在平台发布。</p>{report.history.map(item=><article key={item.id}><p>{item.content.title} · {item.content.platform==='douyin'?'抖音':'小红书'} · 标准 v{item.version}</p><small>{new Date(item.checkedAt).toLocaleString('zh-CN')} · 人工核对 {item.confirmedRuleIds.length} 项</small><details><summary>查看当时文案与规则</summary><p className="source-body">{[item.content.body,item.content.tags.map(t=>'#'+t).join(' ')].filter(Boolean).join('\n\n')}</p>{item.checks.map(r=><p key={r.id}>{r.title}：{r.rule} · {r.status==='review'?'人工核对':r.status==='issue'?'提醒未修改':'词句通过'}</p>)}</details></article>)}</details>}
 </section>;
}
