import { randomInt, randomUUID } from 'node:crypto';

const unique = values => [...new Set(values)];
function shuffled(rows) {
  const result=[...rows];
  for (let i=result.length-1;i>0;i--) {
    const j=randomInt(i+1);
    [result[i],result[j]]=[result[j],result[i]];
  }
  return result;
}

// Keep the same candidate pool for both orderings and save the sample before any judgement.
export function makeRankingSample(flow, scored, ruleVersion) {
  const terms=unique([flow.input.keyword,...(flow.input.needTerms || '').split(/[,，、\n]/)].map(s=>s.trim().toLowerCase()).filter(s=>s && s!=='指定作品'));
  const ranked=scored.map(row=>({...row,matches:terms.filter(term=>row.c.body.toLowerCase().includes(term)).length}));
  const current=ranked.filter(r=>r.eligible).sort((a,b)=>b.a.score-a.a.score || b.c.createdAt.localeCompare(a.c.createdAt));
  const trial=[...current].sort((a,b)=>b.matches-a.matches || b.a.score-a.a.score || b.c.createdAt.localeCompare(a.c.createdAt));
  const top=rows=>{
    const seen=new Set(),list=[];
    for (const row of rows) {
      const identity=row.c.authorId || 'comment:'+row.c.id;
      if(seen.has(identity)) continue;
      seen.add(identity); list.push(row.c.id);
      if(list.length===10) break;
    }
    return list;
  };
  const original=top(current),candidate=top(trial);
  const rejected=ranked.filter(r=>!r.eligible);
  const sampled=shuffled(rejected).slice(0,5).map(r=>r.c.id);
  const ids=shuffled(unique([...original,...candidate,...sampled])), byId=new Map(ranked.map(r=>[r.c.id,r]));
  const entries=ids.map(commentId=>{
    const {c,note,a,fit}=byId.get(commentId);
    return {id:randomUUID(),commentId,noteId:c.noteId,reviewable:!a.exclusions?.length,quote:c.body,title:note.title,rule:a.reason,fit:fit.reason,
      current:original.indexOf(commentId)+1,trial:candidate.indexOf(commentId)+1,excluded:sampled.includes(commentId)};
  });
  const excludedReasons={};
  for (const {a,fit} of rejected) {
    const reason=!fit.eligible ? '不符业务筛选' : a.withinSevenDays!==true ? '日期超窗或不明' : '缺少合格需求信号';
    excludedReasons[reason]=(excludedReasons[reason] || 0)+1;
  }
  return {id:flow.id,queryId:randomUUID(),ruleVersion,trialVersion:'business-terms-v1',startedAt:new Date().toISOString(),
    revision:0,total:ranked.length,rejected:rejected.length,excludedReasons,entries};
}
