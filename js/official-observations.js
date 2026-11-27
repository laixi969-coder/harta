// Earlier versions stored one observation. Merge that entry when first appending history.
export function officialObservations(record) {
  const rows = [...(record?.douyinOfficialSnapshots || [])];
  const latest = record?.douyinOfficialSnapshot;
  if(latest && !rows.some(r=>r.observedAt===latest.observedAt)) rows.push(latest);
  return rows.sort((a,b)=>a.observedAt.localeCompare(b.observedAt));
}
export function appendOfficialObservation(record,snapshot) {
  const rows=officialObservations(record);
  const prior=rows.find(r=>r.observedAt===snapshot.observedAt);
  if(prior && (Object.keys(prior.metrics||{}).length!==Object.keys(snapshot.metrics||{}).length ||
    (prior.visibility && snapshot.visibility && prior.visibility!==snapshot.visibility) ||
    Object.entries(prior.metrics||{}).some(([key,value])=>snapshot.metrics?.[key]!==value))) throw new Error('同一时点返回了冲突的作品数据，请重新读取');
  if(!prior) rows.push(snapshot);
  else if(!prior.visibility && snapshot.visibility) prior.visibility=snapshot.visibility;
  rows.sort((a,b)=>a.observedAt.localeCompare(b.observedAt));
  record.douyinOfficialSnapshots=rows;
  record.douyinOfficialSnapshot=rows.at(-1);
}
