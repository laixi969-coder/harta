import crypto from 'node:crypto';
import { productScope, isScopeCurrent } from './product-scope.mjs';
import { readWorkspace, writeWorkspace, customerMaterialText } from './workspace.mjs';
import { chat, llmReady } from './llm.mjs';
import { businessMaterialContext } from './content-context.mjs';
import { reviewContentFacts } from './content-review.mjs';
import { readResearchConfig, queryWeb, querySearxng, safeSourceUrl } from './research.mjs';
import { packAsSent, shellKey } from './pack-edits.mjs';
import { checkPack, hasHardBlock, checkRedline, checkSensitiveFields } from './check.mjs';
import { CONTENT_FIELDS } from '../js/platform-content.js';
import { agentKnowledge } from './agent-knowledge.mjs';
import { salesDraftRequest } from './sales-request.mjs';
import { salesKnowledge, isSalesKnowledgeCurrent } from './sales-knowledge.mjs';
import { buildSalesPlan, salesStopReason, SALES_STRATEGY_VERSION } from './sales-strategy.mjs';
import { generateSalesDraft } from './sales-draft.mjs';

export const PLATFORMS = ['小红书', '抖音', '视频号', 'B站', '知乎', '其他'];
export const LEAD_STAGES = ['待核实', '值得跟进', '已联系', '沟通中', '已成交', '暂不跟进'];
const now = () => new Date().toISOString();
const id = () => crypto.randomUUID();
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value ?? null)).digest('hex');
const active = new Set();
const taskKey = (email, taskId) => `${email.toLowerCase()}:${taskId}`;
function str(value, label, max = 2000, required = false) {
  if (value == null && !required) return '';
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) throw new Error(`${label}${required ? '不能为空，' : ''}最多 ${max} 字`);
  return value.trim();
}
function url(value, required = true) {
  const raw = str(value, '原始链接', 2000, required);
  if (!raw && !required) return '';
  const safe = safeSourceUrl(raw);
  if (!safe) throw new Error('请填写有效的 http 或 https 原始链接');
  return safe;
}
function platform(value) { if (!PLATFORMS.includes(value)) throw new Error('请选择有效平台'); return value; }
function timestamp(value, label, required = false) {
  if (!value && !required) return '';
  const raw = str(value, label, 40, true);
  if (!Number.isFinite(Date.parse(raw)) || Date.parse(raw) > Date.now() + 60000) throw new Error(`${label}需为有效时间，不能在未来`);
  return new Date(raw).toISOString();
}
function load(email) {
  const space = readWorkspace(email);
  space.acquisition ||= {};
  for (const key of ['tasks', 'signals', 'leads', 'publications', 'accounts', 'logs']) space.acquisition[key] ||= [];
  return space;
}
function customer(space, customerId) {
  const found = space.customers.find(c => c.id === customerId);
  if (!found) throw new Error('找不到你名下的业务客户');
  return found;
}
function find(rows, key, label) { const row = rows.find(r => r.id === key); if (!row) throw new Error(`找不到${label}`); return row; }
function log(a, type, objectId, detail = '') { a.logs.push({ id: id(), at: now(), type, objectId, detail }); }
function snapshot(c) { return { name: c.name, hunt: c.hunt || '', city: c.city || '', pitch: c.pitch || '', growthGoal: c.growthGoal || 'leads', growthCriteria: c.growthCriteria || '' }; }
const eventTime = m => Date.parse(m.receivedAt || m.sentAt || m.createdAt) || 0;
export const incomingByTime = messages => messages.filter(m=>m.direction==='inbound').sort((a,b)=>eventTime(a)-eventTime(b));
export function acquisitionWorkspace(email) {
  const space = load(email); let changed = false;
  for (const task of space.acquisition.tasks) {
    if (task.status === 'running' && !active.has(taskKey(email, task.id))) {
      task.status = 'interrupted'; task.finishedAt = now(); task.error = '服务已重启，本次未完成；已保存的证据仍在，可重新运行。';
      log(space.acquisition, 'task-interrupted', task.id); changed = true;
    }
  }
  if (changed) writeWorkspace(email, space);
  return space;
}
export function acquisitionCapabilities() {
  const config = readResearchConfig();
  return { searchSummary: Boolean(config.searchKey || config.searxngUrl), platforms: PLATFORMS.map(name => ({ platform: name, search: false, comments: false, publish: false, receive: false, send: false, status: 'unverified', reason: '尚未完成账号级连接验证；可导入真实资料、人工发布与记录咨询。' })) };
}
export function assessSignal(row, business, config = {}) {
  const excluded = String(config.exclusions || '').split(/[，、,\n]/).map(s=>s.trim()).filter(Boolean).find(s=>row.text.includes(s));
  if (excluded) return { priority:'相关性低', reason:`原文包含已设置的排除词“${excluded}”，请人工核实。`, method:'规则辅助，待人工核实' };
  if (row.isAuthorReply) return { priority: '相关性低', reason: '作者自己的回复，不计作新的潜在线索。', method: '规则辅助，待人工核实' };
  if (/推广|招代理|招商加盟|专业承接/.test(row.text)) return { priority: '相关性低', reason: '包含营销或同行供给表达，请核对是否为真实需求。', method: '规则辅助，待人工核实' };
  const wants = /求推荐|有没有|想找|需要|咨询|报价|多少钱|怎么选|求助|求购|哪里买|想买/.test(row.text);
  const businessTerms = [business.hunt, ...String(business.pitch || '').split(/[，、。\s]+/)].filter(s => s && s.length >= 2 && s.length <= 20);
  const matches = businessTerms.some(s => row.text.includes(s));
  return { priority: wants && matches ? '优先核实' : '可能相关', reason: wants && matches ? '原文有明确需求且提到业务相关词；服务地点、时间和条件仍需核实。' : wants ? '原文有需求表达，业务匹配与服务地点尚不明确。' : '尚不能确认购买或服务需求，请先查看原文。', method: '规则辅助，待人工核实' };
}
function normalizeSignal(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('每条需求需为一个对象');
  return { platform: platform(raw.platform), text: str(raw.text, '需求原文', 6000, true), url: url(raw.url), recordId: str(raw.recordId, '内容或评论 ID', 200), authorId: str(raw.authorId, '平台用户 ID', 200), authorName: str(raw.authorName, '昵称', 100), authorUrl: url(raw.authorUrl,false), identitySource: str(raw.identitySource,'身份来源',40), publishedText: str(raw.publishedText,'页面显示时间',100), publishedAt: timestamp(raw.publishedAt, '发表时间'), ipRegion: str(raw.ipRegion, '平台 IP 属地', 100), isAuthorReply: raw.isAuthorReply === true, parentRecordId: str(raw.parentRecordId, '父评论 ID', 200), workId: str(raw.workId, '视频记录', 100) };
}
function insertSignals(a, business, rows, taskId, sourceType) {
  let added = 0, duplicate = 0;
  for (const row of rows) {
    const fingerprint = hash([business.id, row.platform, row.recordId ? ['id', row.recordId] : ['evidence', row.url, row.text]]);
    if (a.signals.some(s => s.fingerprint === fingerprint)) { duplicate++; continue; }
    a.signals.push({ ...row, id: id(), customerId: business.id, taskId, fingerprint, sourceType, collectedAt: now(), status: row.isAuthorReply ? 'excluded' : 'pending', analysis: assessSignal(row, business) }); added++;
  }
  return { added, duplicate, read: rows.length };
}
export function importSignals(email, input) {
  const space = load(email), c = customer(space, input.customerId), a = space.acquisition;
  if (!Array.isArray(input.rows) || !input.rows.length || input.rows.length > 100) throw new Error('每次导入 1 至 100 条真实需求');
  const rows = input.rows.map(raw => normalizeSignal({...raw, workId: input.workId || raw.workId})), source = str(input.source, '资料来源', 500, true);
  const identities = new Map(a.signals.filter(r=>r.customerId===c.id&&r.recordId).map(r=>[`${r.platform}:${r.recordId}`,r]));
  for (const row of rows) if (row.recordId) {
    const key = `${row.platform}:${row.recordId}`, previous = identities.get(key);
    if (previous && ((previous.workId||'') !== row.workId || (previous.parentRecordId||'') !== row.parentRecordId || (previous.authorId && row.authorId && previous.authorId !== row.authorId))) throw new Error('同一评论 ID 的来源或身份冲突，请核对原记录');
    identities.set(key,row);
  }
  for(const row of rows) if(row.workId) {
    const work=(a.works||[]).find(w=>w.id===row.workId&&w.customerId===c.id&&w.platform===row.platform);
    if(!work)throw new Error('评论必须属于当前业务和平台的视频');
    const target=(a.targets||[]).find(t=>t.id===work.targetId);
    if(target?.recordId&&row.authorId===target.recordId)row.isAuthorReply=true;
    const previous=a.signals.find(r=>r.customerId===c.id&&r.platform===row.platform&&row.recordId&&r.recordId===row.recordId);
    if(previous&&previous.workId!==row.workId)throw new Error('同一评论 ID 已关联其他来源，不能重新绑定');
  }
  const all=[...a.signals.filter(r=>r.customerId===c.id),...rows];
  for(const row of rows) {
    if(row.parentRecordId&&!row.workId)throw new Error('楼中楼需要关联视频');
    const seen=new Set(row.recordId?[row.recordId]:[]);let parent=row.parentRecordId;
    while(parent){if(seen.has(parent))throw new Error('评论回复关系不能形成循环');seen.add(parent);parent=all.find(r=>r.workId===row.workId&&r.recordId===parent)?.parentRecordId;}
  }
  const task = { id: id(), customerId: c.id, sourceType: 'manual_import', source, status: 'completed', createdAt: now(), finishedAt: now(), snapshot: snapshot(c), platforms: [...new Set(rows.map(r => r.platform))], runs: [] };
  task.coverage = insertSignals(a, c, rows, task.id, 'manual_import');
  task.runs.push({ at: task.createdAt, status: task.status, coverage: task.coverage }); a.tasks.push(task); log(a, 'signals-imported', task.id, source);
  return writeWorkspace(email, space);
}
export function startSearch(email, input, searchFn) {
  const space = acquisitionWorkspace(email), c = customer(space, input.customerId), a = space.acquisition;
  let agentSnapshot = null;
  if (input.agentId) {
    const role = (a.agents || []).find(r => r.id === input.agentId && r.customerId === c.id);
    if (!role || role.status !== 'enabled') throw new Error('请选择当前业务已启用的智能体');
    const version = role.versions.at(-1);
    if (version.knowledgeHash !== agentKnowledge(email,c).hash) throw new Error('智能体引用的业务资料已更新，请保存新版本并重新试运行');
    if (!version.config.duties.includes('找客')) throw new Error('此智能体未启用找客职责');
    agentSnapshot = { id: role.id, version: version.number, config: structuredClone(version.config), knowledgeHash: version.knowledgeHash };
  }
  const config = readResearchConfig();
  if (!searchFn && !config.searchKey && !config.searxngUrl) throw new Error('公开搜索尚未配置，请管理员在设置中连接 SearXNG 或 Brave；也可以导入真实需求。');
  if (a.tasks.some(t => t.customerId === c.id && t.status === 'running')) throw new Error('该业务已有找客任务在运行');
  if (active.size >= 8) throw new Error('找客任务较多，请稍后重试');
  const platforms = input.platforms || ['小红书', '抖音'];
  if (!Array.isArray(platforms) || !platforms.length || platforms.length > 6) throw new Error('选择 1 至 6 个平台');
  const chosen = [...new Set(platforms.map(platform))];
  if (agentSnapshot && chosen.some(p => !agentSnapshot.config.platforms.includes(p))) throw new Error('搜索平台超出智能体适用范围，请调整任务平台');
  const query = str(input.query || agentSnapshot?.config.keywords || [c.city, c.hunt, c.pitch].filter(Boolean).join(' ').slice(0, 200), '搜索词', 300, true);
  const task = { id: id(), customerId: c.id, sourceType: 'search_summary', source: '公开搜索摘要，待回源核实', status: 'running', createdAt: now(), snapshot: snapshot(c), agentSnapshot, query, platforms: chosen, results: [], runs: [], rerunOf: '' };
  if (input.rerunOf) { const old = find(a.tasks, input.rerunOf, '原任务'); if (old.customerId !== c.id) throw new Error('原任务与业务不一致'); task.rerunOf = old.id; }
  a.tasks.push(task); active.add(taskKey(email, task.id));
  try { writeWorkspace(email, space); } catch (error) { active.delete(taskKey(email, task.id)); throw error; }
  const runSearch = searchFn || (q => config.searxngUrl ? querySearxng(q, config.searxngUrl) : queryWeb(q, config.searchKey));
  const completion = (async () => {
    try {
      for (const name of chosen) {
        if (find(load(email).acquisition.tasks, task.id, '任务').status !== 'running') break;
        const domain = { 小红书: 'xiaohongshu.com', 抖音: 'douyin.com', 视频号: 'channels.weixin.qq.com', B站: 'bilibili.com', 知乎: 'zhihu.com' }[name];
        let rows, error;
        try {
          const results = await runSearch(`${query} ${domain ? `site:${domain}` : ''}`);
          rows = results.slice(0, 20).filter(r => !domain || (() => { try { const host = new URL(r.url).hostname; return host === domain || host.endsWith(`.${domain}`); } catch { return false; } })()).map(r => normalizeSignal({ platform: name, text: r.excerpt || r.title, url: r.url }));
        } catch { error = '该平台公开搜索失败，请检查数据源后重试；失败不代表没有需求。'; }
        const latest = load(email), current = find(latest.acquisition.tasks, task.id, '任务');
        if (current.status !== 'running') break;
        const coverage = error ? null : insertSignals(latest.acquisition, { ...task.snapshot, id: c.id }, rows, task.id, 'search_summary');
        if (agentSnapshot && !error) for (const signal of latest.acquisition.signals.filter(s=>s.taskId===task.id)) signal.analysis = assessSignal(signal, task.snapshot, agentSnapshot.config);
        current.results.push({ platform: name, status: error ? 'failed' : 'completed', coverage, error: error || '', scope: '搜索摘要，未读取站内评论' });
        writeWorkspace(email, latest);
      }
      const latest = load(email), current = find(latest.acquisition.tasks, task.id, '任务');
      if (current.status === 'running') {
        const failed = current.results.filter(r => r.status === 'failed').length;
        current.status = failed === chosen.length ? 'failed' : failed ? 'partial' : 'completed'; current.finishedAt = now();
        current.runs.push({ at: current.createdAt, finishedAt: current.finishedAt, status: current.status, results: current.results });
        log(latest.acquisition, 'search-finished', task.id, current.status); writeWorkspace(email, latest);
      }
    } catch {
      const latest = load(email), current = find(latest.acquisition.tasks, task.id, '任务');
      if (current.status === 'running') { current.status = 'failed'; current.error = '任务未完成，可保留已有结果重新运行。'; current.finishedAt = now(); writeWorkspace(email, latest); }
    } finally { active.delete(taskKey(email, task.id)); }
  })();
  return { workspace: space, completion };
}
export function stopSearch(email, input) {
  const space = load(email), task = find(space.acquisition.tasks, input.taskId, '任务');
  if (task.status !== 'running') throw new Error('该任务已停止或完成');
  task.status = 'stopped'; task.finishedAt = now(); log(space.acquisition, 'task-stopped', task.id);
  return writeWorkspace(email, space);
}
function newLead(a, c, identity, sourcePath) {
  const lead = { id: id(), customerId: c.id, platform: identity.platform, authorId: identity.authorId || '', authorName: identity.authorName || '身份待核实', sourcePaths: [sourcePath], signalIds: [], stage: '待核实', doNotContact: false, messages: [], events: [], nextStep: '', nextAt: '', createdAt: now(), updatedAt: now() };
  a.leads.push(lead); return lead;
}
export function reviewSignal(email, input) {
  const space = load(email), a = space.acquisition, signal = find(a.signals, input.signalId, '需求证据'), c = customer(space, signal.customerId);
  if (!['confirm', 'exclude'].includes(input.action)) throw new Error('请选择核实或排除');
  const note = str(input.note, '核实依据', 2000, true);
  if (signal.leadId) throw new Error('此需求已关联线索，请在线索详情中继续处理');
  if (input.action === 'confirm') {
    if (signal.isAuthorReply) throw new Error('作者回复不能作为新的潜在线索');
    let lead = signal.authorId ? a.leads.find(l => l.customerId === c.id && l.platform === signal.platform && l.authorId === signal.authorId) : null;
    if (input.leadId) {
      lead = find(a.leads, input.leadId, '合并目标');
      if (lead.customerId !== c.id || lead.platform !== signal.platform || (lead.authorId && signal.authorId && lead.authorId !== signal.authorId)) throw new Error('不能合并不同业务、平台或不同稳定身份的线索');
    }
    lead ||= newLead(a, c, signal, 'active');
    lead.sourcePaths = [...new Set([...lead.sourcePaths, 'active'])]; lead.signalIds.push(signal.id);
    if (lead.stage === '待核实') lead.stage = '值得跟进';
    lead.events.push({ id: id(), at: now(), type: 'verified', note, signalId: signal.id }); lead.updatedAt = now(); signal.leadId = lead.id;
  }
  signal.status = input.action === 'confirm' ? 'confirmed' : 'excluded'; signal.review = { at: now(), note, source: 'manual' }; log(a, 'signal-reviewed', signal.id, signal.status);
  return writeWorkspace(email, space);
}
export function saveAccount(email, input) {
  const space = load(email), a = space.acquisition, c = customer(space, input.customerId);
  const name = str(input.name, '发布账号标识', 200, true), p = platform(input.platform);
  if (a.accounts.some(v => v.customerId === c.id && v.platform === p && v.name === name)) throw new Error('此业务已经登记该账号');
  a.accounts.push({ id: id(), customerId: c.id, platform: p, name, mode: 'manual', status: 'unverified', capabilities: [], lastSuccessAt: null, createdAt: now() });
  return writeWorkspace(email, space);
}
function account(a, accountId, cId, p) {
  const row = find(a.accounts, accountId, '账号');
  if (row.customerId !== cId || row.platform !== p) throw new Error('账号的业务或平台不匹配');
  return row;
}
function ownedPost(space, input) {
  const c = customer(space, input.customerId), pack = [...(c.drops || []), ...(c.packs || [])].find(p => p.id === input.packId);
  if (!pack || !Number.isInteger(input.index) || input.index < 0 || !Object.hasOwn(pack.shells || {}, input.platform) || !pack.shells[input.platform][input.index]) throw new Error('找不到该业务的内容');
  if (hasHardBlock(checkPack(pack, c.hunt))) throw new Error('该批次尚有发布硬问题，请先在内容库处理检查项');
  return { c, pack, content: packAsSent(pack).shells[input.platform][input.index] };
}
export function preparePublication(email, input) {
  const space = load(email), a = space.acquisition, { c, pack, content } = ownedPost(space, input);
  if(!isScopeCurrent(space,c.id,pack.productScope))throw new Error('产品资料已变化，请核对内容后再准备发布');
  const acc = account(a, input.accountId, c.id, input.platform);
  const revision = hash(content);
  const existing = a.publications.find(p => p.customerId === c.id && p.packId === pack.id && p.platform === input.platform && p.index === input.index && p.accountId === acc.id && p.revision === revision && p.status === 'pending_confirmation');
  if (existing) return writeWorkspace(email, space);
  a.publications.push({ id: id(), customerId: c.id, packId: pack.id, platform: input.platform, index: input.index, accountId: acc.id, accountName: acc.name, content, revision, businessSnapshot: snapshot(c), productScope: pack.productScope || null, status: 'pending_confirmation', createdAt: now(), confirmationSource: null });
  log(a, 'publication-prepared', a.publications.at(-1).id); return writeWorkspace(email, space);
}
export function confirmPublication(email, input) {
  const space = load(email), a = space.acquisition, pub = find(a.publications, input.publicationId, '发布记录');
  if (pub.status !== 'pending_confirmation') throw new Error('该发布记录已处理，请勿重复登记');
  if (input.action === 'cancel') { pub.status = 'cancelled'; log(a, 'publication-cancelled', pub.id); return writeWorkspace(email, space); }
  if (input.confirmed !== true) throw new Error('请确认已使用此账号实际发布该版本');
  const link = url(input.url), publishedAt = timestamp(input.publishedAt, '实际发布时间', true);
  const duplicate = a.publications.find(p => p.customerId === pub.customerId && p.platform === pub.platform && p.status === 'published' && p.url === link);
  if (duplicate) throw new Error('这个发布链接已经登记，请使用已有记录关联咨询');
  Object.assign(pub, { status: 'published', url: link, publishedAt, recordedAt: now(), platformContentId: str(input.platformContentId, '平台内容 ID', 200), confirmationSource: 'manual' });
  // Only mark the matching current version; edits must not rewrite historical publication snapshots.
  const c = customer(space, pub.customerId), pack = [...(c.drops || []), ...(c.packs || [])].find(p => p.id === pub.packId);
  if (pack && hash(packAsSent(pack).shells?.[pub.platform]?.[pub.index]) === pub.revision) {
    space.contentStates ||= {};
    const value = typeof pub.content === 'string' ? { title: pub.content } : pub.content;
    for (const field of CONTENT_FIELDS.filter(f => value?.[f])) {
      const key = `${pub.packId}::${shellKey(pub.platform, pub.index, field)}`;
      space.contentStates[key] = { ...space.contentStates[key], status: 'published', publishedAt, publicationId: pub.id };
    }
  }
  log(a, 'publication-confirmed-manually', pub.id); return writeWorkspace(email, space);
}
export function recordInquiry(email, input) {
  const space = load(email), a = space.acquisition, c = customer(space, input.customerId), p = platform(input.platform);
  const text = str(input.text, '咨询原文', 6000, true), evidence = str(input.evidence, '消息来源或核对依据', 1000, true);
  const authorId = str(input.authorId, '平台用户 ID', 200), authorName = str(input.authorName, '昵称', 100, true), messageId = str(input.messageId, '平台消息 ID', 200);
  const receivedAt = timestamp(input.receivedAt, '咨询时间', true), acc = account(a, input.accountId, c.id, p);
  const channel = str(input.channel, '渠道', 50, true);
  if (!['评论', '私信', '表单', '其他'].includes(channel)) throw new Error('请选择真实消息渠道');
  const op = input.opportunityId ? (a.opportunities||[]).find(o=>o.id===input.opportunityId&&o.customerId===c.id) : null;
  if(input.opportunityId&&!op)throw new Error('找不到当前业务的购买需求');
  if(op&&input.leadId!==op.leadId)throw new Error('咨询与购买需求的联系人不匹配');
  const pub = input.publicationId ? find(a.publications, input.publicationId, '发布内容') : null;
  if (pub && (pub.customerId !== c.id || pub.platform !== p || pub.status !== 'published' || pub.accountId !== acc.id)) throw new Error('咨询必须关联同一业务、平台和账号已发布的内容');
  let lead = input.leadId ? find(a.leads, input.leadId, '线索') : authorId ? a.leads.find(l => l.customerId === c.id && l.platform === p && l.authorId === authorId) : null;
  if (lead && (lead.customerId !== c.id || lead.platform !== p || (authorId && lead.authorId && authorId !== lead.authorId))) throw new Error('线索身份或业务不匹配');
  if (messageId) {
    const owner = a.leads.find(l => l.customerId === c.id && l.platform === p && l.messages.some(m => m.platformMessageId === messageId && m.accountId === acc.id && m.channel === channel));
    const existing = owner?.messages.find(m => m.platformMessageId === messageId && m.accountId === acc.id && m.channel === channel);
    if (existing) {
      if ((lead && lead.id !== owner.id) || (authorId && owner.authorId !== authorId) || (existing.opportunityId||'') !== (op?.id||'') || (existing.publicationId||'') !== (pub?.id||'') || existing.text !== text) throw new Error('平台消息 ID 已用于另一条咨询，请核对联系人、需求与原文');
      return space;
    }
  }
  lead ||= newLead(a, c, { platform: p, authorId, authorName }, pub ? 'content' : 'unknown');
  lead.sourcePaths = [...new Set([...lead.sourcePaths, pub ? 'content' : 'unknown'])];
  lead.messages.push({ id: id(), direction: 'inbound', text, receivedAt, createdAt: now(), evidence, source: 'manual', platformMessageId: messageId, accountId: acc.id, channel, publicationId: pub?.id || '', status: 'received', opportunityId: op?.id || '' });
  for (const message of lead.messages) {
    if (message.direction === 'outbound' && ['draft','copied'].includes(message.status) && message.accountId === acc.id && message.channel === channel && (message.opportunityId||'') === (op?.id||'')) {
      message.stale = true; message.staleReason = '有新消息，请按最新会话重新起草';
    }
  }
  if(op){op.updatedAt=now();}
  lead.needsReply = true; lead.updatedAt = now(); log(a, 'inquiry-recorded', lead.id);
  return writeWorkspace(email, space);
}
function checkedText(text, c) {
  const value = str(text, '回复草稿', 3000, true);
  const risks = checkRedline(value, c.hunt);
  if (risks.length || checkSensitiveFields([value], c.hunt).length) throw new Error('草稿命中现有行业或敏感信息限制，请修改后保存');
  return value;
}
export function leadAction(email, input) {
  const space = load(email), a = space.acquisition, lead = find(a.leads, input.leadId, '线索'), c = customer(space, lead.customerId);
  const note = str(input.note, '跟进说明', 2000);
  if (input.action === 'update') {
    if (!LEAD_STAGES.includes(input.stage)) throw new Error('请选择有效线索阶段');
    if (!note) throw new Error('请填写本次跟进事实或阶段变化依据');
    const nextAt = str(input.nextAt, '下次跟进时间', 40);
    if (nextAt && !Number.isFinite(Date.parse(nextAt))) throw new Error('下次跟进时间无效');
    lead.stage = input.stage; lead.nextStep = str(input.nextStep, '下一步', 1000); lead.nextAt = nextAt ? new Date(nextAt).toISOString() : '';
    lead.events.push({ id: id(), at: now(), type: 'followup', stage: lead.stage, note, source: 'manual', nextStep: lead.nextStep, nextAt: lead.nextAt });
  } else if (input.action === 'block' || input.action === 'unblock') {
    if (!note) throw new Error('请填写拒绝联系或恢复联系的依据');
    lead.doNotContact = input.action === 'block'; lead.events.push({ id: id(), at: now(), type: input.action, note });
    if (lead.doNotContact) { for (const m of lead.messages.filter(m => m.status === 'draft' || m.status === 'copied')) m.status = 'cancelled'; }
  } else if (input.action === 'takeover' || input.action === 'resume-agent') {
    if(input.action==='resume-agent'&&(!note||lead.doNotContact))throw new Error('恢复建议需填写依据，且联系人不能处于禁止联系状态');
    lead.manualTakeover = input.action==='takeover'; lead.events.push({id:id(),at:now(),type:input.action,note});
    for(const m of lead.messages)if(m.agentId&&['draft','copied'].includes(m.status)){m.stale=true;m.staleReason='人工接管状态已变化，请重新起草';}
    log(a, `conversation-${input.action}`, lead.id);
  } else if (['draft', 'check-copy', 'copy', 'sent'].includes(input.action)) {
    if (lead.doNotContact) throw new Error('该对象已禁止联系，不能生成、复制或登记发送');
    if (input.action === 'draft') {
      const op=input.opportunityId?(a.opportunities||[]).find(o=>o.id===input.opportunityId&&o.customerId===c.id&&o.leadId===lead.id):null;
      if(input.opportunityId&&!op)throw new Error('购买需求不属于当前联系人');
      const scope=op?productScope(space,c.id,op):null;
      const text = checkedText(input.text, c), acc = account(a, input.accountId, c.id, lead.platform);
      const channel = str(input.channel, '联系渠道', 50, true);
      if (!['评论', '私信', '表单', '其他'].includes(channel)) throw new Error('请选择真实联系渠道');
      const recipient = str(input.recipient, '接收对象或原帖链接', 1000, true);
      const replyTo = incomingByTime(lead.messages).filter(m => m.accountId === acc.id && m.channel === channel && (m.opportunityId||'') === (op?.id||'')).at(-1)?.id || '';
      lead.messages.push({ id: id(), direction: 'outbound', text, status: 'draft', accountId: acc.id, channel, recipient, replyTo, createdAt: now(), source: 'manual_draft', opportunityId:op?.id||'', opportunityRevision:op?.revision, productScope:scope });
    } else {
      const message = find(lead.messages, input.messageId, '草稿');
      if (!['draft', 'copied'].includes(message.status)) throw new Error('该草稿已发送或取消');
      account(a,message.accountId,c.id,lead.platform);
      if(['check-copy','copy'].includes(input.action)) {
        if(!isScopeCurrent(space,c.id,message.productScope))throw new Error('产品资料已变化，请重新起草');
        if(message.salesPlan&&message.salesPlan.version!==SALES_STRATEGY_VERSION)throw new Error('销售策略已更新，请重新起草');
        if(message.salesPlan&&!isSalesKnowledgeCurrent(space,c.id,message.productScope,message.salesPlan.knowledgeHash))throw new Error('销售资料已变化或到期，请重新起草');
        if(message.opportunityId){
          const op=(a.opportunities||[]).find(o=>o.id===message.opportunityId&&o.leadId===lead.id);
          if(!op||op.revision!==message.opportunityRevision)throw new Error('购买需求已变化，请重新起草');
          if(message.agentId&&(op.manualTakeover||lead.manualTakeover))throw new Error('人工已接管，请核对后另存人工草稿');
          if(message.salesPlan){const stop=salesStopReason({lead,op,evidence:a.signals.filter(s=>op.signalIds.includes(s.id)&&!s.isAuthorReply)});if(stop)throw new Error(stop);}
        }
        if(message.agentId){const agent=(a.agents||[]).find(r=>r.id===message.agentId);const v=agent?.versions.at(-1);
          if(agent?.status!=='enabled'||v.number!==message.agentVersion||v.knowledgeHash!==agentKnowledge(email,c).hash||!v.config.bindings.some(b=>b.accountId===message.accountId&&b.enabled))throw new Error('智能体配置已变化或已暂停，请重新核对');}
      }
      if (message.stale && ['check-copy','copy'].includes(input.action)) throw new Error('草稿之后有新消息，请按最新会话重新起草');
      checkedText(message.text, c);
      if (input.action === 'check-copy') return space;
      if (input.action === 'copy') message.status = 'copied';
      else {
        if (input.confirmed !== true || !note) throw new Error('请核对实际发送后填写记录依据');
        message.status = 'sent_manual'; message.sentAt = timestamp(input.sentAt, '实际发送时间', true); message.evidence = note;
        const latestIncoming = new Map();
        for (const incoming of incomingByTime(lead.messages)) latestIncoming.set(`${incoming.accountId}:${incoming.channel}:${incoming.opportunityId||''}`, incoming);
        lead.needsReply = [...latestIncoming.values()].some(incoming => !lead.messages.some(m => ['sent_manual','sent_platform'].includes(m.status) && m.replyTo === incoming.id && eventTime(m)>=eventTime(incoming)));
        if (!message.opportunityId && ['待核实', '值得跟进'].includes(lead.stage)) lead.stage = '已联系';
      }
    }
  } else throw new Error('不支持的线索操作');
  lead.updatedAt = now(); log(a, `lead-${input.action}`, lead.id); return writeWorkspace(email, space);
}
// Scope every draft to a purchasing need, channel and account; legacy unscoped records remain usable.
function draftContext(email, space, lead, input) {
  const c=customer(space,lead.customerId),a=space.acquisition;
  const op=input.opportunityId?(a.opportunities||[]).find(o=>o.id===input.opportunityId&&o.customerId===c.id&&o.leadId===lead.id):null;
  if(input.opportunityId&&!op)throw new Error('找不到当前联系人的购买需求');
  if(input.accountId)account(a,input.accountId,c.id,lead.platform);
  const scope=op?productScope(space,c.id,op):null;
  const context={...snapshot(c),salesMaterial:scope?.text||c.salesMaterial||'',factCards:scope?.products.length?[]:c.factCards||[],sourceMaterial:scope?.products.length?'':customerMaterialText(email,c)};
  const ids=op?op.signalIds:lead.signalIds;
  if(input.signalId&&!ids.includes(input.signalId))throw new Error('原评论不属于当前购买需求');
  const selected=a.signals.filter(s=>s.customerId===c.id&&ids.includes(s.id)&&!s.isAuthorReply&&(!input.signalId||s.id===input.signalId));
  const evidence=selected.map(s=>({text:s.text,sourceType:s.sourceType,review:s.review?.note||'',video:(a.works||[]).find(w=>w.id===s.workId)?.description||'',parent:a.signals.find(p=>p.workId===s.workId&&p.recordId&&p.recordId===s.parentRecordId)?.text||''}));
  const conversation=lead.messages.filter(m=>(m.direction==='inbound'||['sent_manual','sent_platform'].includes(m.status))&&(m.opportunityId||'')===(op?.id||'')&&(!input.accountId||m.accountId===input.accountId)&&(!input.channel||m.channel===input.channel)).sort((a,b)=>eventTime(a)-eventTime(b)).slice(-12).map(m=>({direction:m.direction,text:m.text,channel:m.channel}));
  const query=[op?.title||'',...evidence.map(e=>e.text),...conversation.filter(m=>m.direction==='inbound').slice(-2).map(m=>m.text)].join('\n');
  const knowledge=salesKnowledge(space,c.id,scope,query);
  const salesPlan=buildSalesPlan({lead,op,scope,evidence,conversation,knowledge});
  return {c,context,op,scope,evidence,conversation,knowledge,salesPlan};
}
export function contactSuggestion(email,input){
  const space=load(email),lead=find(space.acquisition.leads,input.leadId,'线索');
  if(lead.doNotContact)throw new Error('该对象已禁止联系');
  const {c,conversation,salesPlan}=draftContext(email,space,lead,input);
  if(salesPlan.stopReason)throw new Error(salesPlan.stopReason);
  const incoming=conversation.some(m=>m.direction==='inbound');
  const template={acknowledging:'不客气。',answering:'收到你的问题，具体信息还需核对后给你准确答复。',closing:'购买方式和交付条件还需人工核对后答复，避免给你错误信息。',followup:'之前的信息供你参考，暂时不需要也没关系。'}[salesPlan.skillId];
  const text=template||(incoming?'收到你补充的信息，我先按你说的条件核对是否适合。':`你好，我是${c.name}这边的，看到你分享的需求。我先核对是否适合，再给你具体信息。`);
  return {text:checkedText(text,c),basis:'基础回复模板，不承诺未知价格或条件；发送前补齐具体答复并核对接收对象。',salesPlan};
}
export async function generateContactSuggestion(email,input,{ready=llmReady,chatFn=chat,review=reviewContentFacts}={}){
  const fallback=contactSuggestion(email,input);
  if(!ready())return {...fallback,basis:`模型尚未配置，先提供基础回复模板。${fallback.basis}`,method:'template'};
  const space=load(email),lead=find(space.acquisition.leads,input.leadId,'线索');
  const scoped=draftContext(email,space,lead,input),{c,context,evidence,conversation}=scoped;
  const original=hash([scoped,lead.doNotContact,lead.manualTakeover]);
  const safeChat=async request=>{try{return await chatFn(request);}catch{throw new Error('模型调用未完成，请检查连接后重试');}};
  const reviewContext={...context,sourceMaterial:[context.sourceMaterial||'',...scoped.knowledge.chunks.map(r=>`补充资料（不作为报价依据） ${r.title} / ${r.source}: ${r.text}`)].join('\n')};
  const text=await generateSalesDraft({request:salesDraftRequest({business:snapshot(c),material:businessMaterialContext(context).text,...scoped,agentConfig:input.agentConfig,channel:input.channel}),scope:scoped.scope,salesPlan:scoped.salesPlan,question:[...conversation].reverse().find(m=>m.direction==='inbound')?.text||evidence.map(e=>e.text).join('\n'),reviewContext,platform:lead.platform,chatFn:safeChat,review,validate:value=>checkedText(value,c)});
  const latest=load(email),current=find(latest.acquisition.leads,lead.id,'线索');
  if(current.doNotContact||hash([draftContext(email,latest,current,input),current.doNotContact,current.manualTakeover])!==original)throw new Error('生成期间业务资料或会话已变化，请按最新情况重新生成');
  return {text,basis:`${scoped.salesPlan.name}：${scoped.salesPlan.goal}。已完成模型事实核对，仍需审阅。`,method:'model_assisted',salesPlan:scoped.salesPlan};
}
