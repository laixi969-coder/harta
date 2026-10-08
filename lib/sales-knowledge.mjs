import { scopeHash } from './product-scope.mjs';

// Ownership is resolved by the caller's workspace. Filter BEFORE scoring or chunking.
export function salesKnowledge(space, customerId, scope, query = '', at = Date.now()) {
  const documents = (space.acquisition?.salesDocuments || []).filter(d =>
    d.customerId === customerId && d.status === 'approved' &&
    (!d.expiresAt || Date.parse(d.expiresAt) > at) &&
    (!d.productId || scope?.productIds.includes(d.productId)) &&
    (!d.skuId || scope?.skuIds.includes(d.skuId))
  );
  const tokens = value => {
    const s = String(value).toLowerCase();
    return new Set([...(s.match(/[a-z0-9]+/g) || []), ...(s.match(/[\p{Script=Han}]{2,}/gu) || []).flatMap(word => Array.from({length:word.length-1},(_,i)=>word.slice(i,i+2)))]);
  };
  const wanted = tokens(query);
  const chunks = documents.flatMap(d => {
    const result = [];
    for (let start = 0; start < d.body.length; start += 600) {
      const text = d.body.slice(start, start + 750), terms = tokens(d.title + ' ' + text);
      const score = [...wanted].reduce((n, t) => n + (terms.has(t) ? 1 : 0), 0);
      if (score) result.push({id:d.id,revision:d.revision,title:d.title,source:d.source,productId:d.productId,skuId:d.skuId,offset:start,text,score});
    }
    return result;
  }).sort((a,b)=>b.score-a.score || a.id.localeCompare(b.id) || a.offset-b.offset).slice(0,5);
  return {hash:scopeHash(documents), chunks, available:documents.length};
}

export function isSalesKnowledgeCurrent(space, customerId, scope, hash) {
  return !hash || salesKnowledge(space, customerId, scope).hash === hash;
}
