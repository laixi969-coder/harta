import { scopeHash } from './product-scope.mjs';

// Ownership is resolved by the caller's workspace. Filter BEFORE scoring or chunking.
export function approvedSalesDocuments(space, customerId, scope, at = Date.now()) {
  return (space.acquisition?.salesDocuments || []).filter(d =>
    d.customerId === customerId && d.status === 'approved' &&
    (!d.expiresAt || Date.parse(d.expiresAt) > at) &&
    (!d.productId || scope?.productIds?.includes(d.productId)) &&
    (!d.skuId || scope?.skuIds?.includes(d.skuId))
  );
}

export function knowledgeTerms(value) {
  const s = String(value).normalize('NFKC').toLowerCase();
  const terms = new Set(s.match(/[a-z0-9]+/g) || []);
  for (const [word] of s.matchAll(/[\p{Script=Han}]{2,}/gu)) {
    for (let i = 0; i < word.length - 1; i++) terms.add(word.slice(i, i + 2));
  }
  return terms;
}

export function salesKnowledge(space, customerId, scope, query = '', at = Date.now()) {
  const documents = approvedSalesDocuments(space, customerId, scope, at);
  const wanted = knowledgeTerms(query);
  const chunks = documents.flatMap(d => {
    const result = [];
    for (let start = 0; start < d.body.length; start += 600) {
      const text = d.body.slice(start, start + 750), terms = knowledgeTerms(d.title + ' ' + text);
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
