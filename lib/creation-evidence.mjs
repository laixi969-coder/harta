import { createHash } from 'node:crypto';
import { approvedSalesDocuments, knowledgeTerms } from './sales-knowledge.mjs';

const digest = value => createHash('sha256').update(value).digest('hex');

// Scope is resolved from stored product IDs by the workspace, never from model output.
// Generic uploaded files have no SKU metadata and cannot establish facts for a scoped product.
export function creationDocuments(email, space, customer, scope, readBatch) {
  const documents = approvedSalesDocuments(space, customer.id, scope).map(d => ({
    id: d.id, title: d.title, revision: d.revision, source: d.source, body: d.body,
    productId: d.productId, skuId: d.skuId, kind: '销售资料',
  }));
  if (scope?.products?.length) return documents;
  for (const id of new Set([...(customer.materialBatchIds || []), customer.materialBatchId].filter(Boolean))) {
    const batch = readBatch(email, id);
    for (const source of batch?.sources || []) {
      if (!source.id || !source.text?.trim()) continue;
      documents.push({id: id + '/' + source.id, title: source.name, source: source.url || source.name,
        revision: digest(source.text), body: source.text, kind: '附件'});
    }
  }
  return documents;
}

export function creationEvidenceBasis(documents = []) {
  return digest(JSON.stringify(documents.map(d => [d.id, d.revision, d.source, d.productId, d.skuId])));
}

export function creationQueries(customer) {
  return [customer.readerQuestion, customer.reviewedProblem?.title, ...(customer.creationScopeNames || []), customer.growthDirection, customer.pitch]
    .filter(v => typeof v === 'string' && v.trim());
}

export function draftQueries(draft) {
  const claims = [], topics = [];
  for (const item of draft?.items || []) {
    for (const value of [item.title, item.brief?.question]) if (value) topics.push(value);
    for (const [key, value] of Object.entries(item)) {
      if (typeof value !== 'string' || key === 'candidateId') continue;
      for (const sentence of value.split(/[。！？；\n]+/u)) {
        if (/\d|[零一二两三四五六七八九十百千]+[元天米年次]|价格|报价|收费|免费|交付|工期|保证|上门|赠送|仅限|包退|保修|全城|归还|退货|退款|无需|须|必须|可以|可在|提供|支持|不需要|适用/.test(sentence))
          claims.push(sentence.trim().slice(0, 300));
      }
    }
  }
  return [...new Set([...claims, ...topics])].filter(Boolean);
}

function materialDocuments(customer) {
  if (Array.isArray(customer.creationDocuments)) return customer.creationDocuments;
  // Legacy/direct callers have the extracted corpus instead of batch/source IDs.
  const raw = String(customer.sourceMaterial || '');
  return raw.split(/\n+(?=【[^\n]+】\n)/u).filter(Boolean).map((section, i) => {
    const heading = /^【([^\n]+)】\n/u.exec(section);
    const body = heading ? section.slice(heading[0].length) : section;
    return {id:'legacy-' + (i + 1), title:heading?.[1] || '已读取附件', revision:digest(body), body, kind:'附件'};
  });
}

export function evidenceLabel(chunk) {
  const revision = typeof chunk.revision === 'string' ? chunk.revision.slice(0, 12) : chunk.revision;
  return [chunk.title, chunk.source && chunk.source !== chunk.title ? chunk.source : '', '版本 ' + revision,
    '原文第 ' + (chunk.offset + 1) + '–' + (chunk.offset + chunk.text.length) + ' 字符'].filter(Boolean).join(' · ');
}

// Rank a bounded set of source ranges locally. Queries are separate so a new
// promise in the final draft can retrieve a document absent from the first search.
export function findCreationEvidence(customer, queries = creationQueries(customer)) {
  const wanted = [...new Set(queries.filter(Boolean))].slice(0, 36)
    .map(q => knowledgeTerms(String(q).slice(0, 400))).filter(terms => terms.size);
  if (!wanted.length) return [];
  const allTerms = new Set(wanted.flatMap(terms => [...terms]));
  const frequencies = new Map();
  const chunks = [];
  const documents=materialDocuments(customer);
  for (const doc of documents) {
    for (let offset = 0; offset < doc.body.length; offset += 420) {
      const text = doc.body.slice(offset, offset + 540);
      const found = [...knowledgeTerms(text)].filter(t => allTerms.has(t));
      if (!found.length) continue;
      for (const t of found) frequencies.set(t, (frequencies.get(t) || 0) + 1);
      const {body, ...metadata} = doc;
      chunks.push({...metadata, offset, text, found});
    }
  }
  const ranked = wanted.map(terms => chunks.map((chunk, i) => {
    const score = chunk.found.reduce((s, t) => terms.has(t) ? s + 1 + Math.log((chunks.length + 1) / (frequencies.get(t) + 1)) : s, 0);
    return {i, score};
  }).filter(r => r.score > 0).sort((a, b) => b.score - a.score || a.i - b.i).slice(0, 80));
  const picked = [];
  const add = row => {
    const chunk = chunks[row.i];
    if (picked.some(c => c.id === chunk.id && Math.abs(c.offset - chunk.offset) < 540)) return false;
    picked.push(chunk);
    return true;
  };
  // A second relevant document may qualify or contradict the first one.
  for (const list of ranked) {
    const first = list[0];
    if (!first || picked.length >= 5) continue;
    add(first);
    const other = list.find(r => chunks[r.i].id !== chunks[first.i].id && r.score >= first.score * 0.55);
    if (other && picked.length < 5) add(other);
  }
  for (const row of ranked.flat().sort((a,b) => b.score-a.score || a.i-b.i)) {
    if (picked.length >= 5) break;
    add(row);
  }
  const sources = new Map(documents.map(d => [d.id,d]));
  return picked.map(({found, ...chunk}) => {
    const body = sources.get(chunk.id).body;
    // Retain neighboring conditions even when the matching sentence ends at a chunk edge.
    const start = Math.max(0,chunk.offset - 120);
    return {...chunk, offset:start, text:body.slice(start,chunk.offset + chunk.text.length + 120)};
  });
}
