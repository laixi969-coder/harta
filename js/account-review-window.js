// Filter saved measurement windows by their end date; never invent metrics or merge windows.
export function filterReviewWindows(groups,days='all',now=new Date()) {
 if(days==='all')return groups;
 if(![7,30,90].includes(days) || !(now instanceof Date) || !Number.isFinite(now.getTime()))return [];
 const end=new Date(now.getFullYear(),now.getMonth(),now.getDate()),start=new Date(end);start.setDate(start.getDate()-days+1);
 return groups.filter(g=>{
  if(!/^\d{4}-\d{2}-\d{2}$/.test(g?.end||''))return false;
  const [y,m,d]=g.end.split('-').map(Number),date=new Date(y,m-1,d);
  return date.getFullYear()===y && date.getMonth()===m-1 && date.getDate()===d && date>=start && date<=end;
 });
}
