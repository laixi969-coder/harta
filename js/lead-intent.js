// Suggestions are cues from recorded text, never confirmed classifications.
export function suggestedLeadIntents(texts=[]) {
  const text=(Array.isArray(texts)?texts:[]).filter(value=>typeof value==='string').slice(-30).join('\n');
  const result=[];
  if(/怎么买|多少钱|价格|求购|想买|哪里买|下单|报名|课程|团购/i.test(text))result.push('buy');
  if(/商务|合作|恰饭|推广|广告|甲方|brief|接单|投放|置换/i.test(text))result.push('ad');
  if(/微信|私信|加你|加个|联系方式|绿泡泡|\bvx\b|v信|\+v/i.test(text))result.push('divert');
  return result;
}

export function leadIntentEventLabel(kind,status) {
  const label={buy:'购买咨询',ad:'商务合作',divert:'私域承接'}[kind]||'咨询进展';
  const progress={noted:'已记下',replied:'已回复',won:{buy:'已成交',ad:'已签约',divert:'已转入私域'}[kind]||'已办成',dropped:'暂不跟进'}[status]||'已记录';
  return `${label} · ${progress}`;
}
