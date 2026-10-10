import crypto from 'node:crypto';
import {requireCurrentAgentTrial,hasCurrentAgentTrial} from './agent-eligibility.mjs';
import {generateAgentDraft,AgentDraftValidationError} from './agent-draft.mjs';
import { agentPlan, PLAYBOOK_VERSION } from './agent-playbook.mjs';
import { recommendedConfig, recipe, exampleInput } from '../js/agent-recipes.js';
import { readWorkspace, writeWorkspace } from './workspace.mjs';
import { chat, llmReady } from './llm.mjs';
import { agentKnowledge as knowledge } from './agent-knowledge.mjs';
import { reviewContentFacts } from './content-review.mjs';
import { checkRedline, checkSensitiveFields } from './check.mjs';
import { PLATFORMS } from './acquisition-workspace.mjs';

const now = () => new Date().toISOString();
const id = () => crypto.randomUUID();
const active = new Map();
const key = (email, runId) => `${email.toLowerCase()}:${runId}`;
function text(value, label, max = 2000) {
  if (value == null) return '';
  if (typeof value !== 'string' || value.length > max) throw new Error(`${label}最多 ${max} 字`);
  return value.trim();
}
function list(value, allowed, label) {
  if (!Array.isArray(value) || value.length > allowed.length || value.some(v => !allowed.includes(v))) throw new Error(`${label}无效`);
  return [...new Set(value)];
}
function load(email) {
  const space = readWorkspace(email);
  space.acquisition ||= {};
  for (const name of ['agents', 'agentRuns', 'accounts', 'logs']) space.acquisition[name] ||= [];
  return space;
}
function business(space, customerId) {
  const c = space.customers.find(c => c.id === customerId);
  if (!c) throw new Error('找不到你名下的业务客户');
  return c;
}
function agent(space, agentId) {
  const a = space.acquisition.agents.find(a => a.id === agentId);
  if (!a) throw new Error('找不到你名下的智能体');
  business(space, a.customerId);
  return a;
}
function log(space, type, objectId, detail) {
  space.acquisition.logs.push({ id: id(), at: now(), type, objectId, detail });
}

function defaults(c) {
  return { name: `${c.name}业务助手`.slice(0,100), duties: ['找客', '创作', '接待'], platforms: ['小红书', '抖音'], audience: '', region: c.city || '', criteria: c.growthCriteria || '', exclusions: '', keywords: [c.city, c.hunt, c.pitch].filter(Boolean).join(' ').slice(0,300), tone: '直接、清楚，先回应具体问题', handoff: '价格、工期、经营承诺缺少依据时，先核对或转人工', contentDirection: '', mode: 'analysis', bindings: [] };
}
function config(space, customerId, input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('请填写智能体配置');
  if (input.mode !== 'analysis') throw new Error('当前仅支持分析与草稿；自动发布和回复尚未验证');
  if (input.recipeId && !recipe(input.recipeId)) throw new Error('助手用途无效');
  const cfg = { ...(input.recipeId ? {recipeId:input.recipeId,recipeVersion:2} : {}), mode: 'analysis', duties: list(input.duties, ['找客','创作','接待'], '职责'), platforms: list(input.platforms, PLATFORMS, '平台') };
  for (const field of ['name','audience','region','criteria','exclusions','keywords','tone','handoff','contentDirection']) cfg[field] = text(input[field], field, field === 'name' ? 100 : field === 'keywords' ? 300 : 2000);
  if(input.recipeId&&(cfg.duties.length!==1||cfg.duties[0]!==recipe(input.recipeId).duty))throw new Error('预设助手职责必须与用途一致，请通过更换用途切换助手');
  if (!cfg.name || !cfg.duties.length || !cfg.platforms.length) throw new Error('请填写名称，并选择至少一个职责和平台');
  if (!Array.isArray(input.bindings) || input.bindings.length > 30) throw new Error('账号绑定最多 30 项');
  const seen = new Set();
  cfg.bindings = input.bindings.map(binding => {
    const account = space.acquisition.accounts.find(a => a.id === binding?.accountId);
    if (!account || account.customerId !== customerId || !cfg.platforms.includes(account.platform)) throw new Error('绑定账号必须属于当前业务及所选平台');
    if (seen.has(account.id)) throw new Error('不能重复绑定账号');
    seen.add(account.id);
    return { accountId: account.id, enabled: binding.enabled === true, actions: ['draft'] };
  });
  return cfg;
}
function version(email, c, cfg, number) {
  return { number, savedAt: now(), config: structuredClone(cfg), knowledgeHash: knowledge(email, c).hash, knowledgeRef: { customerId: c.id, source: '业务档案与已读取资料' } };
}
export function agentWorkspace(email) {
  const space = load(email); let changed = false;
  for (const run of space.acquisition.agentRuns) {
    if (run.status === 'running' && !active.has(key(email, run.id))) {
      run.status = 'interrupted'; run.finishedAt = now(); run.error = '服务重启，试运行已中断；请重新试运行，旧记录保留。'; changed = true;
    }
  }
  if (changed) writeWorkspace(email, space);
  // This derived field is never the knowledge source. Versions keep references, runs keep snapshots.
  return { ...space, acquisition: { ...space.acquisition, agents: space.acquisition.agents.map(a => ({ ...a, needsTrial:!hasCurrentAgentTrial(a,space.acquisition.agentRuns), knowledgeChanged: a.versions.at(-1).knowledgeHash !== knowledge(email, business(space,a.customerId)).hash })) } };
}
export function createAgent(email, input) {
  const space = load(email), c = business(space, input.customerId);
  const source = input.copyOf ? agent(space,input.copyOf) : null;
  if (source && source.customerId !== c.id) throw new Error('复制仅限当前业务，不复制跨业务知识');
  const cfg = source ? { ...structuredClone(source.versions.at(-1).config), name: `${source.versions.at(-1).config.name.slice(0,90)} 副本`, bindings: [] } : input.recipeId ? recommendedConfig(c,input.recipeId) : defaults(c);
  const record = { id: id(), customerId: c.id, status: 'draft', createdAt: now(), updatedAt: now(), versions: [version(email,c,config(space,c.id,cfg),1)] };
  space.acquisition.agents.push(record); log(space,'agent-created',record.id,source ? '复制配置，不复制绑定与运行记录' : '从业务创建草稿');
  writeWorkspace(email, space); return agentWorkspace(email);
}
export function saveAgent(email, input) {
  const space = load(email), a = agent(space,input.agentId), c = business(space,a.customerId);
  if (a.status === 'archived') throw new Error('该角色已归档，请复制后编辑');
  if (input.baseVersion !== a.versions.at(-1).number) throw new Error('版本已变化，请刷新后核对再保存');
  const prior=a.versions.at(-1).config;
  const proposed=input.recipeId ? {...recommendedConfig(c,input.recipeId),platforms:prior.platforms,bindings:prior.bindings} : input.config;
  const cfg = config(space,c.id,proposed);
  a.versions.push(version(email,c,cfg,a.versions.at(-1).number + 1));
  a.status = 'draft'; a.updatedAt = now();
  log(space,'agent-version-saved',a.id,`v${a.versions.at(-1).number}，等待重新试运行与启用`);
  writeWorkspace(email,space); return agentWorkspace(email);
}
export function agentAction(email, input) {
  const space = load(email), a = agent(space,input.agentId), v = a.versions.at(-1);
  if (a.status === 'archived') throw new Error('角色已归档，历史记录仍可查看');
  if (!['enable','pause','archive'].includes(input.action)) throw new Error('无效智能体操作');
  if (input.action === 'enable') {
    if (!v.config.criteria) throw new Error('先填写可判定的有效线索条件，再保存版本');
    if (v.knowledgeHash !== knowledge(email,business(space,a.customerId)).hash) throw new Error('业务资料已更新，请保存新版本并重新试运行');
    requireCurrentAgentTrial(a,space.acquisition.agentRuns);
    config(space,a.customerId,v.config);
  }
  a.status = { enable:'enabled', pause:'paused', archive:'archived' }[input.action]; a.updatedAt = now();
  if (input.action !== 'enable') {
    for (const run of space.acquisition.agentRuns.filter(r => r.agentId === a.id && r.status === 'running')) { run.status = 'stopped'; run.finishedAt = now(); run.error = '角色已暂停或归档，本次输出不再采用。'; }
    for (const task of space.acquisition.tasks || []) if (task.agentSnapshot?.id === a.id && task.status === 'running') { task.status = 'stopped'; task.finishedAt = now(); task.error = '关联智能体已暂停或归档，已有结果保留。'; }
  }
  log(space,`agent-${input.action}`,a.id,'仅分析与草稿，不开启外部发送');
  writeWorkspace(email,space); return agentWorkspace(email);
}
export function startAgentTrial(email, input, { ready = llmReady, chatFn = chat, review = reviewContentFacts, timeoutMs = 90000 } = {}) {
  const space = load(email), a = agent(space,input.agentId), c = business(space,a.customerId), v = structuredClone(a.versions.at(-1));
  if (a.status === 'archived') throw new Error('归档角色不能试运行，请先复制');
  if (space.acquisition.agentRuns.some(r => r.agentId === a.id && r.status === 'running')) throw new Error('该角色已有试运行，请等待结果');
  if (active.size >= 8 || [...active.values()].filter(v => v === email.toLowerCase()).length >= 2) throw new Error('试运行较多，请稍后重试');
  let evidence;
  if(input.example===true)input={...exampleInput(c,v.config,input.scenario),example:true,scenario:input.scenario||'normal'};
  if (input.signalId) {
    const s = (space.acquisition.signals || []).find(s => s.id === input.signalId && s.customerId === c.id);
    if (!s) throw new Error('找不到当前业务的需求证据');
    evidence = { signalId: s.id, text: s.text, platform: s.platform, source: s.url, isAuthorReply: s.isAuthorReply, sourceType: s.sourceType };
  } else evidence = { text: text(input.text,'试运行原文',6000), source: text(input.source,'来源说明',1000), platform: input.platform, sourceType: input.example===true?'simulated_example':'user_sample', ...(input.example===true?{scenario:input.scenario}: {}) };
  if (!evidence.text || !evidence.source) throw new Error('请填写试运行原文和来源说明');
  if (!v.config.platforms.includes(evidence.platform)) throw new Error('样例平台不在角色适用范围内');
  const k = knowledge(email,c);
  if (k.hash !== v.knowledgeHash) throw new Error('业务知识已变化，请先保存新版本再试运行');
  const run = { id:id(), agentId:a.id, customerId:c.id, kind:'trial', playbookVersion:PLAYBOOK_VERSION, version:v.number, configSnapshot:v.config, knowledgeHash:k.hash, businessSnapshot:k.facts, input:evidence, status:'running', startedAt:now(), finishedAt:null, cost:null, modelUsage:null, limits:{timeoutMs,maxDraftCalls:2}, steps:[{at:now(),label:'已读取业务知识与保存版本'},{at:now(),label:'仅分析和生成草稿，不发送或发布'}], warnings:k.warnings };
  space.acquisition.agentRuns.push(run); active.set(key(email,run.id),email.toLowerCase());
  try { writeWorkspace(email,space); } catch(error) { active.delete(key(email,run.id)); throw error; }
  const began = Date.now();
  const work = (async () => {
    const plan=agentPlan(k.facts,v.config,evidence),assessment=plan.assessment;
    const modelAvailable=ready(),model=modelAvailable&&plan.decision!=='hold';
    let draft=plan.fallback;
    if (model) {
      const result=await generateAgentDraft({config:v.config,business:k.facts,evidence,plan,chatFn,review,assertActive:()=>{if(load(email).acquisition.agentRuns.find(r=>r.id===run.id)?.status!=='running')throw new Error('试运行已停止');}});
      draft=result.draft;

    }
    if (checkRedline(draft,c.hunt).length || checkSensitiveFields([draft],c.hunt).length) throw new Error('草稿触及行业限制，请核对业务资料');
    return { assessment, draft, outputLabel:plan.outputLabel,decision:plan.decision,playbookVersion:plan.version,method:model?'model_assisted':plan.decision==='hold'?'rule_decision':'rules_and_template',missing:plan.missing,nextStep:plan.nextStep,qualityChecks:plan.checks.map(name=>({name,status:model?'已生成并完成事实审读，请按此项复核':plan.decision==='hold'?'已按规则停止草稿生成':'模板示范，未做模型核对'})),proposedTools:[{name:'业务知识读取',status:'used'},{name:model?'模型草稿与事实核对':plan.decision==='hold'?'联系边界规则':'规则与澄清模板',status:'used'},{name:'平台发送／发布',status:'disabled',reason:'试运行不会调用外部写入'}] };

  })();
  // Retain the concurrency slot until the provider settles, even after the visible deadline.
  work.then(()=>active.delete(key(email,run.id)),()=>active.delete(key(email,run.id)));
  let timer;
  const completion = (async () => {
    try {
      const output = await Promise.race([work,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('试运行达到时长上限，请稍后重试')),timeoutMs);})]);
      const latest = load(email), record = latest.acquisition.agentRuns.find(r=>r.id===run.id);
      if (!record || record.status !== 'running') return;
      record.output = output;
      record.status = output.method==='model_assisted'?'completed':'limited';
      record.steps.push({at:now(),label:output.method==='model_assisted'?'已完成草稿与模型辅助事实核对':output.method==='rule_decision'?'已识别不应继续营销的情况，不生成外发草稿':'模型未配置，已完成规则判断与澄清模板'});
      record.knowledgeChanged = knowledge(email,business(latest,c.id)).hash !== k.hash;
      record.finishedAt = now(); record.durationMs = Date.now()-began;
      log(latest,'agent-trial-finished',run.id,record.status); writeWorkspace(email,latest);
    } catch(error) {
      const latest = load(email), record = latest.acquisition.agentRuns.find(r=>r.id===run.id);
      if (!record || record.status !== 'running') return;
      record.status='failed'; record.finishedAt=now(); record.durationMs=Date.now()-began;
      // Provider responses may contain secrets or request fragments; keep them out of public logs.
      record.error = ['试运行达到时长上限，请稍后重试','草稿未通过经营事实核对，请补充业务资料后重试','草稿触及行业限制，请核对业务资料'].includes(error.message) || error instanceof AgentDraftValidationError ? error.message : '模型或事实核对未完成，请检查模型连接与业务资料后重试。';
      log(latest,'agent-trial-failed',run.id,record.error); writeWorkspace(email,latest);
    } finally { clearTimeout(timer); }
  })();
  return {workspace:space,completion};
}
