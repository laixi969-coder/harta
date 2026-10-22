/* 研究类动作的统一入口：关键词扩展、痛点归集、对标拆解、写作底稿。
 *
 * 都遵守同一条规矩：读的是当前账号名下的真实数据，写回业务档案，
 * 失败如实报错，不拿模型脑补的数据补位。 */

import crypto from 'node:crypto';
import { withBusinessModelBudget } from './model-budget.mjs';
import { readWorkspace, writeWorkspace, saveKeywordLibrary } from './workspace.mjs';
import { expandKeywordBatch } from './keyword-expand.mjs';
import { clusterPains } from './pain-clusters.mjs';
import { teardownWork, teardownAccount } from './benchmark-teardown.mjs';
import { refreshPlaybook } from './writing-knowledge.mjs';
import { buildTopicPool, appendDirection, recordDecision } from './topic-pool.mjs';
import { calibrateHunt, huntEvidence, withCalibrationEvidence, saveCalibration } from './hunt-calibration.mjs';
import { chat, llmReady } from './llm.mjs';

const running = new Set();
const lockKey = (email, kind, id) => `${String(email).toLowerCase()}:${kind}:${id}`;

function withLock(email, kind, id, label, task) {
  const key = lockKey(email, kind, id);
  if (running.has(key)) throw new Error(`${label}正在进行，请等本次结果`);
  running.add(key);
  return Promise.resolve().then(task).finally(() => running.delete(key));
}

function customerOf(space, customerId) {
  const customer = space.customers.find((row) => row.id === customerId);
  if (!customer) throw new Error('找不到你名下的业务客户');
  return customer;
}

export function expandKeywordsForCustomer(email, body = {}, deps = {}) {
  const customerId = String(body.customerId || '');
  const seeds = (Array.isArray(body.seeds) ? body.seeds : String(body.seeds || '').split(/[,，、\n]/))
    .map((row) => String(row || '').trim()).filter(Boolean);
  if (!seeds.length) throw new Error('先填一个种子词');
  return withLock(email, 'keyword-expand', customerId, '关键词扩展', async () => {
    const space = readWorkspace(email), customer = customerOf(space, customerId);
    const acquisition = space.acquisition || {};
    const signals = (acquisition.signals || []).filter((row) => row.customerId === customerId);
    const works = (acquisition.works || []).filter((row) => row.customerId === customerId);
    const batch = await expandKeywordBatch({
      customer,
      seeds,
      signals,
      works,
      fetcher: deps.fetcher,
      scopeType: body.scopeType || '领域',
      scopeName: body.scopeName || customer.hunt || '',
      limit: Math.min(Math.max(Number(body.limit) || 120, 10), 200),
    });
    // 复用已有词库的容量与校验规则，扩展结果就是一批普通关键词。
    const saved = saveKeywordLibrary(email, customerId, batch);
    if (saved.error) throw new Error(saved.error);
    return { workspace: saved.workspace, batch };
  });
}

export function aggregatePains(email, body = {}, deps = {}) {
  const customerId = String(body.customerId || '');
  return withLock(email, 'pain-clusters', customerId, '评论归集', async () => {
    const space = readWorkspace(email), customer = customerOf(space, customerId);
    const signals = (space.acquisition?.signals || []).filter((row) => row.customerId === customerId);
    const result = await withBusinessModelBudget(email, customerId, 'content-generation', () => clusterPains(signals, { chatFn: deps.chatFn || chat, modelReady: deps.modelReady ?? llmReady(), business: customer, customerId }));
    const latest = readWorkspace(email), target = customerOf(latest, customerId);
    target.painClusters = result;
    writeWorkspace(email, latest);
    return { workspace: latest, clusters: result };
  });
}

export function teardownForCustomer(email, body = {}, deps = {}) {
  const customerId = String(body.customerId || ''), workId = String(body.workId || '');
  if (!workId) throw new Error('先选一条要拆解的作品');
  return withLock(email, 'teardown', workId, '对标拆解', async () => {
    const space = readWorkspace(email), customer = customerOf(space, customerId);
    const acquisition = space.acquisition || {};
    const work = (acquisition.works || []).find((row) => row.id === workId && row.customerId === customerId);
    if (!work) throw new Error('找不到这条作品，或不属于当前业务');
    const comments = (acquisition.signals || []).filter((row) => row.workId === workId && row.customerId === customerId);
    // 雷达要有同账号其他作品才谈得上位置；没有就只给绝对值。
    const siblings = (acquisition.works || []).filter((row) => row.customerId === customerId && row.id !== workId && row.platform === work.platform
      && work.authorId && row.authorId === work.authorId);
    const result = await withBusinessModelBudget(email, customerId, 'content-generation', () => teardownWork(work, comments, { chatFn: deps.chatFn || chat, modelReady: deps.modelReady ?? llmReady(), business: customer, customerId, siblings }));
    const latest = readWorkspace(email), target = customerOf(latest, customerId);
    target.benchmarkTeardowns = [{ ...result, id: result.id || crypto.randomUUID() }, ...(target.benchmarkTeardowns || []).filter((row) => row.workId !== workId)].slice(0, 20);
    writeWorkspace(email, latest);
    return { workspace: latest, teardown: result };
  });
}

/** 博主级拆解：一个人一直怎么写，和单篇怎么写的两件事。 */
export async function teardownAccountForCustomer(email, body = {}, deps = {}) {
  const customerId = String(body.customerId || ''), suppliedId = String(body.authorId || ''), authorName = String(body.authorName || '');
  if (!suppliedId && !authorName) throw new Error('先选一个要拆解的博主');
  const space = readWorkspace(email), customer = customerOf(space, customerId);
  const candidates = (space.acquisition?.works || []).filter(row => row.customerId === customerId
    && (suppliedId ? row.authorId === suppliedId : row.authorName === authorName));
  const platforms = [...new Set(candidates.map(row => row.platform))];
  const platform = body.platform || (platforms.length === 1 ? platforms[0] : '');
  if (!platform && platforms.length > 1) throw new Error('多个平台存在相同博主标识，请明确选择平台');
  const platformWorks = candidates.filter(row => row.platform === platform);
  if (!platformWorks.length) throw new Error('这个博主在所选平台还没有采到作品');
  const ids = [...new Set(platformWorks.map(row => row.authorId).filter(Boolean))];
  if (!suppliedId && (ids.length !== 1 || platformWorks.some(row => !row.authorId))) throw new Error('同名博主身份无法确认，请使用明确的平台用户 ID');
  const authorId = suppliedId || ids[0];
  const works = platformWorks.filter(row => row.authorId === authorId);
  const identity = JSON.stringify([customerId, platform, authorId]);
  return withLock(email, 'account-teardown', identity, '博主拆解', async () => {
    const ids = new Set(works.map(row => row.id));
    const comments = (space.acquisition?.signals || []).filter(row => row.customerId === customerId && ids.has(row.workId));
    const result = await withBusinessModelBudget(email, customerId, 'content-generation', () => teardownAccount({ authorId, authorName: works[0].authorName || authorName, platform, works, comments },
      { chatFn: deps.chatFn || chat, modelReady: deps.modelReady ?? llmReady(), business: customer, customerId }));
    const latest = readWorkspace(email), target = customerOf(latest, customerId);
    target.accountTeardowns = [result, ...(target.accountTeardowns || []).filter(row => row.platform !== platform || row.authorId !== authorId)].slice(0, 10);
    writeWorkspace(email, latest);
    return { workspace: latest, account: result };
  });
}

export function rebuildPlaybook(email, body = {}) {
  const customerId = String(body.customerId || '');
  const space = readWorkspace(email), customer = customerOf(space, customerId);
  const playbook = refreshPlaybook(space, customer, space.feedback || {});
  writeWorkspace(email, space);
  return { workspace: space, playbook };
}

/** 选题池每次现算，不存快照：痛点、拆解、关键词一变，题目跟着变。 */
export function topicPoolFor(email, body = {}) {
  const space = readWorkspace(email), customer = customerOf(space, body.customerId);
  return { workspace: space, pool: buildTopicPool(customer) };
}

/** 用或不用一个选题。用 = 写进保存的方向，下一批生成直接采用。 */
export function decideTopic(email, body = {}) {
  const key = String(body.key || ''), action = String(body.action || 'use');
  if (!['use', 'skip', 'reset'].includes(action)) throw new Error('请选择使用、不用或恢复候选');
  const space = readWorkspace(email), customer = customerOf(space, body.customerId);
  const topic = buildTopicPool(customer).topics.find((row) => row.key === key);
  if (!topic) throw new Error('这个选题已经不在池子里了，请刷新后重选');
  customer.topicDecisions = recordDecision(customer.topicDecisions, key, action === 'use' ? 'used' : action === 'skip' ? 'skipped' : '候选');
  if (action === 'use') {
    customer.growthDirection = appendDirection(customer.growthDirection, topic);
    customer.directionUpdatedAt = new Date().toISOString();
  }
  writeWorkspace(email, space);
  return { workspace: space, pool: buildTopicPool(customer), direction: customer.growthDirection || '' };
}

/** 行业包校准：按真实语料决定这个包能不能从 D 顶到 C/B，差什么也写清楚。 */
export function calibrateHuntFor(email, body = {}) {
  const space = readWorkspace(email), customer = customerOf(space, body.customerId);
  if (!customer.hunt) throw new Error('这个业务还没填行业，先补业务资料');
  const signals = (space.acquisition?.signals || []).filter((row) => row.customerId === customer.id);
  const works = (space.acquisition?.works || []).filter((row) => row.customerId === customer.id);
  const evidence = huntEvidence({ customer, signals, works });
  const calibration = withCalibrationEvidence(calibrateHunt(customer.hunt, evidence), customer);
  saveCalibration(calibration);
  customer.huntCalibration = { grade: calibration.grade, baseGrade: calibration.baseGrade, checkedAt: calibration.checkedAt, gaps: calibration.gaps };
  writeWorkspace(email, space);
  return { workspace: space, calibration };
}

/** 标记有回音 / 没反应之后，底稿当场重算，不用等人再点一次刷新。
 * 反馈键形如 `<packId>-<组名>-<下标>`，而 packId 是带连字符的 UUID，只能按前缀匹配。 */
export function refreshPlaybookAfterFeedback(email, workspace, feedbackKey) {
  const key = String(feedbackKey || '');
  const targets = (workspace.customers || []).filter((customer) => [...(customer.packs || []), ...(customer.drops || [])].some((pack) => pack.id && key.startsWith(`${pack.id}-`)));
  if (!targets.length) return workspace;
  const before = new Map(targets.map((customer) => [customer.id, customer.playbook ? JSON.stringify(customer.playbook.cards || []) : null]));
  for (const customer of targets) refreshPlaybook(workspace, customer, workspace.feedback || {});
  const changed = targets.some((customer) => (customer.playbook ? JSON.stringify(customer.playbook.cards || []) : null) !== before.get(customer.id));
  if (changed) writeWorkspace(email, workspace);
  return workspace;
}
