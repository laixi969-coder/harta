import { extractFactCards } from './fact-cards.mjs';
import { businessMaterialContext } from './content-context.mjs';
import crypto from 'node:crypto';
import { readWorkspace, writeWorkspace, customerMaterialText } from './workspace.mjs';
import { packAsSent, shellKey } from './pack-edits.mjs';
import { GROWTH_GOALS, METRICS } from '../js/growth.js';
import { CONTENT_FIELDS } from '../js/platform-content.js';
import { checkPack, hasHardBlock } from './check.mjs';
import { productScope, isScopeCurrent } from './product-scope.mjs';

const text = (v, max = 1000) => typeof v === 'string' && v.length <= max ? v.trim() : '';
function owned(space, customerId, packId) {
  const customer = space.customers.find(c => c.id === customerId);
  const pack = [...(customer?.packs || []), ...(customer?.drops || [])].find(p => p.id === packId);
  if (!customer || !pack || pack.origin?.mode !== 'organic') throw new Error('找不到该客户的自然内容批次');
  return { customer, pack };
}
function post(pack, platform, index) {
  if (!Number.isInteger(index) || index < 0 || !Object.hasOwn(pack.shells || {}, platform) || !pack.shells[platform][index]) throw new Error('找不到这篇平台内容');
  return packAsSent(pack).shells[platform][index];
}
export const postRevision = (pack, platform, index) => crypto.createHash('sha256').update(JSON.stringify([post(pack, platform, index), pack.execution?.[index]])).digest('hex');
const businessRevision = (email,c,pack) => crypto.createHash('sha256').update(JSON.stringify([c.name,c.hunt,c.city,c.pitch,c.salesMaterial,c.factCards,customerMaterialText(email,c),...(pack?.productScope?[productScope(readWorkspace(email),c.id,pack.productScope).hash]:[])])).digest('hex');
function rewriteCustomer(email,c,pack) {
  const scope=pack.productScope?productScope(readWorkspace(email),c.id,pack.productScope):null;
  return scope?.products.length?{...c,pitch:scope.products.map(p=>p.name).join('、'),salesMaterial:scope.text,sourceMaterial:scope.text,factCards:[],materialAnalysis:null}:{...c,sourceMaterial:customerMaterialText(email,c)};
}
function originalPostBasis(email, customer, pack, key) {
  if (pack.postBasisRevisions?.[key]) return pack.postBasisRevisions[key];
  if (pack.productScope && !isScopeCurrent(readWorkspace(email),customer.id,pack.productScope)) return null;
  const snapshot = pack.businessSnapshot;
  if (!snapshot) return null;
  const scoped=rewriteCustomer(email,customer,pack),material = businessMaterialContext(scoped).text;
  const expected = { name: scoped.name, industry: scoped.hunt, city: scoped.city, pitch: scoped.pitch, material, factCards: scoped.factCards || [] };
  return Object.keys(expected).every(field => JSON.stringify(snapshot[field]) === JSON.stringify(expected[field])) ? businessRevision(email, customer, pack) : null;
}
const postKey = (platform, index) => `${platform}|${index}`;

export function saveGrowthSettings(email, { customerId, goal, criteria = '' }) {
  if (!Object.hasOwn(GROWTH_GOALS, goal)) throw new Error('请选择有效的增长目标');
  if (typeof criteria !== 'string' || criteria.length > 1000) throw new Error('结果条件最多1000字');
  const space = readWorkspace(email), customer = space.customers.find(c => c.id === customerId);
  if (!customer) throw new Error('没有这个客户');
  Object.assign(customer, { growthGoal: goal, growthCriteria: criteria.trim(), goalUpdatedAt: new Date().toISOString() });
  return writeWorkspace(email, space);
}

function validateDate(v) {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
}
export function validateOutcome(row) {
  for (const field of ['source', 'criteria', 'baselineNote', 'note']) {
    if (row[field] != null && (typeof row[field] !== 'string' || row[field].length > 1000)) throw new Error('数据来源、统计说明与备注需为1000字以内的文字');
  }
  if (!validateDate(row.start) || !validateDate(row.end) || row.start > row.end || row.end > new Date().toISOString().slice(0, 10)) throw new Error('填写有效的统计起止日期，结束日期不能在未来');
  if (!text(row.source)) throw new Error('填写数据来源，例如平台后台导出文件名或核对记录');
  const metrics = {};
  for (const [key, value] of Object.entries(row.metrics || {})) {
    if (!Object.hasOwn(METRICS, key)) throw new Error('存在未知的效果指标');
    if (value === null || value === '') continue;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1e12 || (!['revenue', 'refunds', 'cost'].includes(key) && !Number.isSafeInteger(value))) throw new Error(`${METRICS[key]}需要有效的非负数字，次数需为整数`);
    metrics[key] = value;
  }
  if (!Object.keys(metrics).length) throw new Error('至少填写一项实际结果，未知数据请留空');
  if (['qualifiedLeads', 'orders', 'revenue', 'refunds'].some(k => metrics[k] != null) && !text(row.criteria)) throw new Error('记录客资或成交需说明有效客资、去重或订单归因口径');
  const baseline = row.baseline === '' || row.baseline == null ? null : row.baseline;
  if (baseline !== null && (typeof baseline !== 'number' || !Number.isFinite(baseline) || baseline < 0 || baseline > 1e12 || !text(row.baselineNote))) throw new Error('基线需为非负数字，并说明相同平台、指标与统计窗口');
  return { start: row.start, end: row.end, source: text(row.source), criteria: text(row.criteria), metrics, baseline, baselineNote: text(row.baselineNote), note: text(row.note), recordedAt: new Date().toISOString() };
}

// Validate the entire import before writing. Snapshots are not summed: windows may overlap.
export function saveOutcomes(email, { customerId, packId, rows }) {
  if (!Array.isArray(rows) || !rows.length || rows.length > 100) throw new Error('一次记录1至100篇效果');
  const space = readWorkspace(email), { pack } = owned(space, customerId, packId);
  const seen = new Set();
  const records = rows.map(row => {
    const content = post(pack, row.platform, row.index), key = postKey(row.platform, row.index);
    if (seen.has(key)) throw new Error('一次导入不能重复同一篇内容');
    seen.add(key);
    return { key, record: { ...validateOutcome(row), id: crypto.randomUUID(), platform: row.platform, index: row.index, goal: pack.origin.goal || 'leads', content, revision: postRevision(pack, row.platform, row.index) } };
  });
  pack.outcomes ||= {};
  for (const { key, record } of records) pack.outcomes[key] = [record, ...(pack.outcomes[key] || [])];
  return writeWorkspace(email, space);
}

export function saveFactCards(email, { customerId, cards }) {
  if (!Array.isArray(cards) || cards.length > 30) throw new Error('最多保存30条事实');
  const normalized = cards.map((card, i) => {
    if (!card || typeof card !== 'object' || Array.isArray(card)) throw new Error(`第${i + 1}条事实格式不正确`);
    if (!text(card.text, 1500) || !text(card.source, 500) || !['confirmed', 'pending', 'retired'].includes(card.status)) throw new Error(`第${i + 1}条需要事实、来源与确认状态`);
    if (card.scope != null && (typeof card.scope !== 'string' || card.scope.length > 500)) throw new Error(`第${i + 1}条适用范围最多500字`);
    return { id: `F${i + 1}`, text: text(card.text, 1500), source: text(card.source, 500), scope: text(card.scope, 500), status: card.status };
  });
  const space = readWorkspace(email), customer = space.customers.find(c => c.id === customerId);
  if (!customer) throw new Error('没有这个客户');
  customer.factHistory = [...(customer.factHistory || []), { at: new Date().toISOString(), cards: customer.factCards || [] }];
  customer.factCards = normalized;
  return writeWorkspace(email, space);
}

const rewriting = new Set();
export async function preparePostRewrite(email, { customerId, packId, platform, index, instruction }, generate) {
  if (!text(instruction, 2000)) throw new Error('填写本篇要调整的问题，最多2000字');
  const { customer, pack } = owned(readWorkspace(email), customerId, packId);
  const basisRevision = businessRevision(email, customer, pack);
  const revision = postRevision(pack, platform, index), key = postKey(platform, index), lock = `${email}:${packId}:${key}`;
  if (rewriting.has(lock)) throw new Error('这篇正在改写，请等待本次结果');
  rewriting.add(lock);
  try {
    const candidate = await generate(pack, rewriteCustomer(email, customer, pack), { platform, index, instruction });
    const space = readWorkspace(email), found = owned(space, customerId, packId), latest = found.pack;
    if (businessRevision(email, found.customer, latest) !== basisRevision) throw new Error('生成期间业务资料已变化，请按最新资料重新改写');
    if (postRevision(latest, platform, index) !== revision) throw new Error('生成期间原文已修改，本次候选未保存，请按最新版本重新改写');
    latest.rewriteDrafts ||= {};
    latest.rewriteDrafts[key] = { id: crypto.randomUUID(), baseRevision: revision, basisRevision, candidate, instruction, createdAt: new Date().toISOString() };
    return writeWorkspace(email, space);
  } finally { rewriting.delete(lock); }
}

export function applyPostVersion(email, { customerId, packId, platform, index, draftId, restoreId }) {
  const space = readWorkspace(email), { customer, pack } = owned(space, customerId, packId), key = postKey(platform, index);
  const content = post(pack, platform, index);
  const draft = pack.rewriteDrafts?.[key];
  let candidate;
  if (restoreId) {
    const version = pack.postVersions?.[key]?.find(v => v.id === restoreId);
    if (!version) throw new Error('找不到这个历史版本');
    if (version.basisRevision !== businessRevision(email, customer, pack)) throw new Error('此历史版本的业务资料已变化或无法核对，请按最新资料重新改写');
    candidate = { content: version.content, execution: version.execution };
  } else {
    if (!draft || draft.id !== draftId) throw new Error('改写候选不存在或已更新');
    if (draft.basisRevision !== businessRevision(email, customer, pack)) throw new Error('业务资料已更新，请重新核对并生成候选');
    if (draft.baseRevision !== postRevision(pack, platform, index)) throw new Error('原文已变化，请重新生成候选，避免覆盖你的修改');
    candidate = draft.candidate;
  }
  pack.postVersions ||= {};
  pack.postVersions[key] = [{ id: crypto.randomUUID(), at: new Date().toISOString(), basisRevision: originalPostBasis(email, customer, pack, key), content, execution: pack.execution?.[index] }, ...(pack.postVersions[key] || [])];
  pack.postBasisRevisions ||= {};
  pack.postBasisRevisions[key] = businessRevision(email, customer, pack);
  pack.edits ||= {};
  for (const field of CONTENT_FIELDS) {
    delete pack.edits[shellKey(platform, index, field)];
  }
  pack.shells[platform][index] = candidate.content;
  pack.execution ||= [];
  pack.execution[index] = candidate.execution;
  pack.checks = checkPack(pack, customer.hunt);
  if (hasHardBlock(pack.checks)) throw new Error('当前检查仍有硬问题，不能采用此版本');
  if (pack.rewriteDrafts) delete pack.rewriteDrafts[key];
  // An edited post has not automatically been re-published on the platform.
  for (const field of CONTENT_FIELDS) {
    const stateKey = `${pack.id}::${shellKey(platform, index, field)}`;
    if (space.contentStates?.[stateKey]?.status === 'published') {
      space.contentStates[stateKey] = { ...space.contentStates[stateKey], status: 'selected' };
      delete space.contentStates[stateKey].publishedAt;
    }
  }
  return writeWorkspace(email, space);
}

const extractingFacts = new Set();
export async function proposeFactCards(email, { customerId }, extract = extractFactCards) {
  const space = readWorkspace(email), customer = space.customers.find(c=>c.id===customerId);
  if (!customer) throw new Error('没有这个客户');
  const lock = `${email}:${customerId}`;
  if (extractingFacts.has(lock)) throw new Error('正在整理这份资料，请等待本次结果');
  extractingFacts.add(lock);
  try {
  const basis = JSON.stringify([customer.salesMaterial, customer.factCards, customerMaterialText(email, customer)]);
  const result = await extract({ ...customer, sourceMaterial: customerMaterialText(email, customer) });
  const latest = readWorkspace(email), current = latest.customers.find(c=>c.id===customerId);
  if (!current || JSON.stringify([current.salesMaterial, current.factCards, customerMaterialText(email, current)]) !== basis) throw new Error('资料或事实已变化，请重新整理');
  if ((current.factCards || []).length + result.cards.length > 30) throw new Error('合并后超过30条，请先清理重复或停用事实');
  current.factHistory = [...(current.factHistory || []), {at:new Date().toISOString(),cards:current.factCards || []}];
  current.factCards = [...(current.factCards || []), ...result.cards].map((card,i)=>({...card,id:`F${i+1}`}));
  current.factExtraction = { at:new Date().toISOString(),coverage:result.coverage,context:result.context };
  return writeWorkspace(email, latest);
  } finally { extractingFacts.delete(lock); }
}
