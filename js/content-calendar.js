import {contentJob} from './content-job.js';
import { attributionEntries } from './acquisition.js';
import { contentStateOf } from './content-workflow.js';
import { packAsSent } from './pack-edits.js';
import { productionDraft } from './production-workflow.js';
import { isRealEvidence } from './evidence-kind.js';

const pad = n => String(n).padStart(2, '0');
export const localDay = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
export function calendarWeek(date = new Date(), offset = 0) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  start.setDate(start.getDate() - (start.getDay()+6)%7 + offset*7);
  return Array.from({length:7}, (_, i) => { const d = new Date(start); d.setDate(start.getDate()+i); return localDay(d); });
}

// Calendar arithmetic uses local dates; UTC day numbers avoid DST-length weeks.
export function calendarMonth(date = new Date(), offset = 0) {
  const first=new Date(date.getFullYear(),date.getMonth()+offset,1),last=new Date(first.getFullYear(),first.getMonth()+1,0).getDate();
  const leading=(first.getDay()+6)%7;
  return {year:first.getFullYear(),month:first.getMonth()+1,days:[...Array(leading).fill(null),...Array.from({length:last},(_,i)=>localDay(new Date(first.getFullYear(),first.getMonth(),i+1)))]};
}
export function calendarWeekOffset(day, today = new Date()) {
  if(typeof day!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(day))return null;
  const [y,m,d]=day.split('-').map(Number),date=new Date(y,m-1,d,12);
  if(localDay(date)!==day)return null;
  const monday=s=>{const [year,month,date]=s.split('-').map(Number);return Date.UTC(year,month-1,date);};
  return Math.round((monday(calendarWeek(date)[0])-monday(calendarWeek(today)[0]))/604800000);
}

// A past plan is a reminder to check, not proof the post was never published.
export function pastPlannedPosts(items = [], today = new Date()) {
  const todayKey=localDay(today);
  return items.filter(item=>item.kind==='post'&&['pending','selected'].includes(item.status)&&typeof item.date==='string'&&item.date<todayKey&&calendarWeekOffset(item.date,today)!==null)
    .sort((a,b)=>b.date.localeCompare(a.date));
}

// Existing field-level plans can differ. Keep each group separate instead of
// silently moving or unpublishing other fields of the same post.
export function calendarItems(customer, states = {}) {
  const items = [], candidates = [];
  for (const pack of [...(customer?.drops || []), ...(customer?.packs || [])]) {
    if (!isRealEvidence(pack)) continue;
    const sent=packAsSent(pack);
    if (pack.tier === '今日') for (const entry of attributionEntries(pack).filter(e=>e.kind==='shell')) {
      const groups = new Map();
      for (const key of entry.contentKeys) {
        const state=contentStateOf(states,key);
        const group=`${state.status}|${state.plannedAt || ''}`;
        if (!groups.has(group)) groups.set(group,{status:state.status,date:state.plannedAt || '',keys:[]});
        groups.get(group).keys.push(key);
      }
      const title=sent.shells?.[entry.platform]?.[entry.index]?.title || entry.text.split('\n').find(Boolean) || entry.group;
      const partial=groups.size>1, draft=productionDraft(pack,entry.platform,entry.index,false), draftCurrent=draft && JSON.stringify(draft.sourceContent)===JSON.stringify(sent.shells?.[entry.platform]?.[entry.index]);
      const applied=pack.appliedContentJobs?.[`${entry.platform}|${entry.index}`],job=applied?.contentSnapshot && JSON.stringify(applied.contentSnapshot)===JSON.stringify(sent.shells?.[entry.platform]?.[entry.index])?contentJob(applied.job):'';
      const chosenFormat=['image','video','article'].includes(pack.origin?.format)?pack.origin.format:draftCurrent && ['image','video','article'].includes(draft.format)?draft.format:'';
      for (const group of groups.values()) {
        const item={kind:'post',packId:pack.id,platform:entry.platform,index:entry.index,format:chosenFormat,job:group.status==='published'?'':job,goal:pack.origin?.goal||'',title,keys:group.keys,status:group.status,date:group.date,partial};
        if(group.date) items.push(item);
        else if(group.status!=='published') candidates.push(item);
      }
    }
    for (const [key,draft] of Object.entries(pack.productionDrafts || {})) {
      if(!draft.live || !draft.fields?.liveSchedule) continue;
      const base=key.endsWith('|live')?key.slice(0,-5):key, pos=base.lastIndexOf('|'), platform=base.slice(0,pos), index=Number(base.slice(pos+1));
      if(pos<0 || !Number.isSafeInteger(index) || index<0) continue;
      items.push({kind:'live',packId:pack.id,platform,index,job:contentJob(draft.job),goal:pack.origin?.goal||'',version:draft.version,date:draft.fields.liveSchedule.slice(0,10),time:draft.fields.liveSchedule,title:draft.fields.title || pack.title || '直播场次',review:!!draft.fields.liveReview});
    }
  }
  items.sort((a,b)=>(a.time||a.date).localeCompare(b.time||b.date));
  return {items,candidates};
}

// Count distinct posts once per displayed week, even if legacy fields have
// different dates or statuses. Dates are plans/history, not proof of posting.
export function weeklyCalendarCoverage(items=[],days=[]) {
  const week=new Set(days),seen=new Set(),platforms=new Map();
  for(const platform of ['小红书','抖音'])platforms.set(platform,{platform,image:0,video:0,article:0,live:0,unknown:0,jobs:{traffic:0,lead:0,divert:0,convert:0,unknown:0},goals:{reach:0,spread:0,leads:0,reach_leads:0,sales:0,unknown:0}});
  for(const item of items){
    if(!week.has(item.date) || item.status==='paused' || !item.platform || !['post','live'].includes(item.kind))continue;
    const id=JSON.stringify([item.kind,item.packId,item.platform,item.index]);if(seen.has(id))continue;seen.add(id);
    if(!platforms.has(item.platform))platforms.set(item.platform,{platform:item.platform,image:0,video:0,article:0,live:0,unknown:0,jobs:{traffic:0,lead:0,divert:0,convert:0,unknown:0},goals:{reach:0,spread:0,leads:0,reach_leads:0,sales:0,unknown:0}});
    const row=platforms.get(item.platform),kind=item.kind==='live'?'live':['image','video','article'].includes(item.format)?item.format:'unknown';row[kind]++;
    row.goals[Object.hasOwn(row.goals,item.goal)?item.goal:'unknown']++;row.jobs[contentJob(item.job)||'unknown']++;
  }
  return [...platforms.values()];
}

// A mix is a planning prompt, not evidence that any task will perform better.
export function weeklyJobSuggestion(coverage=[]) {
  const totals={traffic:0,lead:0,divert:0,convert:0,unknown:0};
  for(const row of coverage) for(const key of Object.keys(totals)) totals[key]+=row.jobs?.[key]||0;
  const tagged=totals.traffic+totals.lead+totals.divert+totals.convert;
  if(!tagged)return totals.unknown?'本周排期还未标注内容任务，可在作品制作稿中标注并采用，或在直播草稿中标注并保存。':'本周暂无已标注内容任务的排期。';
  const missing=[];
  if(!totals.lead)missing.push('获客');
  if(!totals.convert)missing.push('转化');
  const note=missing.length?`已标注排期中暂无${missing.join('、')}任务，可按业务需要安排。`:'已标注排期包含获客和转化任务，可结合业务需要调整。';
  return totals.unknown?`${note}另有 ${totals.unknown} 条未标注，暂无法判断其任务。`:note;
}
