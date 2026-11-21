// Bind fact-review findings to the actual words in the editor. Editorial advice
// stays advisory. Legacy reviews sometimes name a quantity without quoting it.
const categories = [
  ['工期', /工期|交付时间|交图|时限|\d+\s*(?:小时|个?工作日|天内)/, '请在确认方案时核对交付时间。'],
  ['价格', /价格|售价|报价|费用|免费|优惠|折扣|免单|赠品|[元折]/, '请先核对报价及适用条件。'],
  ['效果', /百分比|比例|效果|提升|降低|节省|成功率|保证|[％%]/, '可以先记录使用前后的情况，再比较实际效果。'],
  ['服务范围', /服务|提供|安装|上门|承诺|预约|资质|案例|经历|赠送|领取/, '请先核对这项服务的适用范围。'],
];
const compact = value => String(value || '').normalize('NFKC').replace(/\s+/g, '').toLowerCase();
const claimsIn = value => String(value || '').match(/[^。！？!?\n]+[。！？!?]?/g)?.map(s => s.trim()).filter(Boolean) || [];
const fieldsToCheck = ['title','cover','coverLayout','script','shots','shootMaterials','imagePlan','hook','cta','liveOpen','liveSegments','liveInteraction','liveOffer','liveClose'];

export function productionClaims(warnings = [], fields = {}) {
  const found = new Map();
  for (const warning of warnings) {
    if (typeof warning !== 'string' || /^\s*(?:编辑|措辞|排版|表达)建议[：:]/.test(warning)) continue;
    const [review, suggestion=''] = warning.split(/修改建议[：:]/);
    if (!/缺[少乏失]|没有|无依据|无来源|未[给提证核支明确]|不[支持符实一致]|未能|矛盾|编造|虚构|夸大|超[出过]|无法[核证]|无(?:法|从)确认/.test(review)) continue;
    const quoted = review.match(/「([^」]+)」|“([^”]+)”/);
    const excerpt = quoted?.[1] || quoted?.[2] || '';
    const needles = excerpt ? [excerpt] : review.match(/\d+(?:\.\d+)?\s*(?:个?工作日|小时|天|元|折|[%％])|免费[\u4e00-\u9fa5]{0,4}/g) || [];
    for (const field of fieldsToCheck) {
      for (const quote of claimsIn(fields[field])) {
        if (!needles.some(needle => compact(quote).includes(compact(needle)) || (excerpt && compact(needle).includes(compact(quote))))) continue;
        const category = categories.find(([, pattern]) => pattern.test(quote + review));
        if (!category) continue;
        const id = JSON.stringify([field,quote]);
        found.set(id, {id, field, quote, anchor:excerpt||quote, category:category[0], replacement:category[2], reason:review.slice(0,1000),suggestion:suggestion.slice(0,750)});
      }
    }
  }
  return [...found.values()];
}

export function savedProductionClaims(pack, key, draft) {
  const stored = pack.productionClaims?.[key] || [];
  const legacy = productionClaims(draft?.generationReview?.warnings, draft?.fields);
  return [...new Map([...legacy,...stored].map(claim => [claim.id,claim])).values()];
}

const words=value=>compact(value).replace(/[\p{P}\p{Z}]/gu,'');
export function currentClaimQuote(claim,fields) {
  const content=String(fields?.[claim.field]||'');
  if(content.includes(claim.quote))return claim.quote;
  const expected=words(claim.anchor||claim.quote);
  return expected?claimsIn(content).find(sentence=>words(sentence).includes(expected))||'':'';
}
export function openProductionClaims(claims, fields, basis, facts=[]) {
  return claims.flatMap(claim=>{
    const quote=currentClaimQuote(claim,fields);
    if(!quote || (basis && claim.evidence?.basis===basis))return [];
    const suggestion=claim.suggestion||'',phrases=[suggestion,...Array.from(suggestion.matchAll(/[“「]([^”」]+)[”」]/g),m=>m[1])].filter(Boolean).map(words);
    // The suggested copy must be an entire currently confirmed fact. Scoped
    // facts require manual review to avoid dropping their conditions.
    const fact=facts.find(f=>f.status==='confirmed'&&!f.scope?.trim()&&f.source&&phrases.includes(words(f.text)));
    return [{...claim,quote,replacement:fact?.text||claim.replacement}];
  });
}
