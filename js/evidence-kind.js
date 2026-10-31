// Historical sources use more than one marker; none should become real evidence.
export function isRealEvidence(value) {
  return Boolean(value && !value.demo && value.source!=='demo' && value.sourceType!=='demo');
}

// Search snippets need a manually verified source quote before research can
// treat them as comments. When work records are available, check their origin.
export function isResearchComment(signal, works = null) {
  if(!isRealEvidence(signal) || signal.isAuthorReply || signal.status==='excluded')return false;
  if(signal.sourceType==='search_summary' && !signal.searchVerification)return false;
  if(works && signal.workId){const work=works.find(w=>w.id===signal.workId && w.customerId===signal.customerId);if(!isRealEvidence(work))return false;}
  return true;
}
