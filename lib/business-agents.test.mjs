import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import { readWorkspace, writeWorkspace } from './workspace.mjs';
import { createAgent, saveAgent, agentAction, startAgentTrial, agentWorkspace } from './business-agents.mjs';
import { saveAccount, startSearch } from './acquisition-workspace.mjs';
const root=process.cwd(),email='agent@example.test';let dir;
const seed=()=>({customers:[{id:'c1',name:'装修业务',hunt:'家装',city:'杭州',pitch:'厨房翻新',salesMaterial:'仅服务杭州。价格按实际现场报价。',growthCriteria:'杭州厨房翻新，愿意进一步核对现场需求',track:'存量',drops:[],packs:[]},{id:'c2',name:'另一业务',hunt:'家装',city:'上海',pitch:'整体设计',track:'存量',drops:[],packs:[]}],ledger:[],feedback:{},contentStates:{}});
const get=()=>readWorkspace(email).acquisition;
const create=()=>{createAgent(email,{customerId:'c1'});return get().agents.at(-1);};
const sample={text:'杭州厨房翻新需要报价，有没有家装推荐？',source:'用户提供的原始评论',platform:'小红书'};
const trial=(a,deps={ready:()=>false})=>startAgentTrial(email,{agentId:a.id,...sample},deps);
const enable=async()=>{const a=create();await trial(a).completion;agentAction(email,{agentId:a.id,action:'enable'});return get().agents[0];};
beforeAll(()=>{dir=fs.mkdtempSync(path.join(os.tmpdir(),'harta-agents-'));fs.symlinkSync(path.join(root,'vendor'),path.join(dir,'vendor'));process.chdir(dir);});
afterAll(()=>{process.chdir(root);fs.rmSync(dir,{recursive:true,force:true});});
beforeEach(()=>writeWorkspace(email,seed()));
describe('智能体版本、知识与隔离',()=>{
 it('从业务建立草稿，未知人群不推造，配置不启用外部动作',()=>{const a=create();expect(a.status).toBe('draft');expect(a.versions[0].config.region).toBe('杭州');expect(a.versions[0].config.audience).toBe('');expect(a.versions[0].config.mode).toBe('analysis');expect(a.versions[0].knowledgeRef.customerId).toBe('c1');expect(()=>agentAction(email,{agentId:a.id,action:'enable'})).toThrow('试运行');});
 it('保存不可变版本并拒绝覆盖旧版本、跨业务绑定和自动权限',()=>{const a=create(),config={...a.versions[0].config,tone:'简洁'};saveAgent(email,{agentId:a.id,baseVersion:1,config});expect(get().agents[0].versions).toHaveLength(2);expect(get().agents[0].versions[0].config.tone).not.toBe('简洁');expect(()=>saveAgent(email,{agentId:a.id,baseVersion:1,config})).toThrow('版本');expect(()=>saveAgent(email,{agentId:a.id,baseVersion:2,config:{...config,mode:'auto'}})).toThrow('尚未验证');saveAccount(email,{customerId:'c2',platform:'小红书',name:'其他业务账号'});expect(()=>saveAgent(email,{agentId:a.id,baseVersion:2,config:{...config,bindings:[{accountId:get().accounts[0].id,enabled:true}]}})).toThrow('当前业务');});
 it('不能跨销售查看、编辑、试运行、复制角色',()=>{const a=create();for(const fn of [()=>saveAgent('other@test',{agentId:a.id}),()=>startAgentTrial('other@test',{agentId:a.id,...sample}),()=>agentAction('other@test',{agentId:a.id,action:'enable'}),()=>createAgent(email,{customerId:'c2',copyOf:a.id})])expect(fn).toThrow();});
 it('知识变更提示且阻止以旧知识启用或启动搜索',async()=>{const a=await enable(),s=readWorkspace(email);s.customers[0].pitch='新的业务';writeWorkspace(email,s);expect(agentWorkspace(email).acquisition.agents[0].knowledgeChanged).toBe(true);expect(()=>agentAction(email,{agentId:a.id,action:'enable'})).toThrow('资料');expect(()=>startSearch(email,{customerId:'c1',agentId:a.id},async()=>[])).toThrow('资料');expect(()=>trial(a)).toThrow('知识');});
 it('复制清除账号绑定与运行历史，归档保留版本',async()=>{let a=create();saveAccount(email,{customerId:'c1',platform:'小红书',name:'人工账号'});saveAgent(email,{agentId:a.id,baseVersion:1,config:{...a.versions[0].config,bindings:[{accountId:get().accounts[0].id,enabled:true}]}});await trial(a).completion;createAgent(email,{customerId:'c1',copyOf:a.id});const copy=get().agents.at(-1);expect(copy.versions[0].config.bindings).toEqual([]);expect(copy.status).toBe('draft');expect(get().agentRuns.every(r=>r.agentId===a.id)).toBe(true);agentAction(email,{agentId:a.id,action:'archive'});expect(get().agentRuns).toHaveLength(1);expect(()=>trial(a)).toThrow('归档');});
});
describe('可核对的试运行与生产任务',()=>{
 it('无模型只输出规则与模板，不生成线索、不发送、不发布',async()=>{const a=create();await trial(a).completion;const r=get().agentRuns[0];expect(r.status).toBe('limited');expect(r.output.method).toBe('rules_and_template');expect(r.cost).toBeNull();expect(r.businessSnapshot.salesMaterial).toContain('仅服务杭州');expect(get().leads||[]).toHaveLength(0);expect(get().publications||[]).toHaveLength(0);agentAction(email,{agentId:a.id,action:'enable'});expect(get().agents[0].status).toBe('enabled');});
 it('模型读取当前业务与角色，核对失败保留失败日志且不返回未核实草稿',async()=>{const a=create();let prompt;await trial(a,{ready:()=>true,chatFn:async p=>{prompt=p;return '方便说明厨房使用需求吗？';},review:async()=>['报价无依据']}).completion;expect(prompt.user).toContain('价格按实际现场报价');expect(prompt.user).not.toContain('整体设计');expect(get().agentRuns[0].status).toBe('failed');expect(get().agentRuns[0].output).toBeUndefined();expect(()=>agentAction(email,{agentId:a.id,action:'enable'})).toThrow('试运行');});
 it('运行中保存新版本，旧运行保持旧快照并不覆盖新配置',async()=>{const a=create();let release;const run=trial(a,{ready:()=>true,chatFn:()=>new Promise(r=>release=r),review:async()=>[]});saveAgent(email,{agentId:a.id,baseVersion:1,config:{...a.versions[0].config,tone:'新的风格'}});release('方便说明厨房的使用需求吗？');await run.completion;expect(get().agentRuns[0].version).toBe(1);expect(get().agentRuns[0].configSnapshot.tone).not.toBe('新的风格');expect(get().agents[0].versions[1].config.tone).toBe('新的风格');expect(()=>agentAction(email,{agentId:a.id,action:'enable'})).toThrow('试运行');});
 it('暂停后迟到的模型返回不能写入结果，重启显示中断',async()=>{const a=create();let release;const run=trial(a,{ready:()=>true,chatFn:()=>new Promise(r=>release=r),review:async()=>[]});agentAction(email,{agentId:a.id,action:'pause'});release('请说明厨房需求');await run.completion;expect(get().agentRuns[0].status).toBe('stopped');expect(get().agentRuns[0].output).toBeUndefined();const s=readWorkspace(email);s.acquisition.agentRuns.push({id:'restart',status:'running'});writeWorkspace(email,s);expect(agentWorkspace(email).acquisition.agentRuns.at(-1).status).toBe('interrupted');});
 it('超时和提供商错误均保留可读结果，错误内容不泄露',async()=>{const a=create();let release;const run=trial(a,{ready:()=>true,chatFn:()=>new Promise(r=>release=r),review:async()=>[],timeoutMs:5});await run.completion;expect(get().agentRuns[0].status).toBe('failed');expect(get().agentRuns[0].error).toContain('时长上限');release('澄清需求');await new Promise(r=>setTimeout(r,1));await trial(a,{ready:()=>true,chatFn:async()=>{throw new Error('secret-provider-token');}}).completion;expect(JSON.stringify(get())).not.toContain('secret-provider-token');});
 it('试运行样例必须属于本业务，来源和平台必须明确',()=>{const a=create();expect(()=>startAgentTrial(email,{agentId:a.id,signalId:'not-owned'})).toThrow('需求证据');expect(()=>startAgentTrial(email,{agentId:a.id,...sample,source:''})).toThrow('来源');expect(()=>startAgentTrial(email,{agentId:a.id,...sample,platform:'知乎'})).toThrow('平台');});
 it('找客任务固定智能体版本，暂停保留部分结果并停止后续写入',async()=>{const a=await enable();let release;const task=startSearch(email,{customerId:'c1',agentId:a.id,platforms:['小红书']},()=>new Promise(r=>release=r));expect(task.workspace.acquisition.tasks[0].agentSnapshot.version).toBe(1);agentAction(email,{agentId:a.id,action:'pause'});release([{excerpt:'需要家装报价',url:'https://www.xiaohongshu.com/explore/t'}]);await task.completion;expect(get().tasks[0].status).toBe('stopped');expect(get().signals).toHaveLength(0);});
});

describe('内置助手方案',()=>{
 it('自动补齐设置但不编造人群和经营事实',()=>{
  createAgent(email,{customerId:'c2',recipeId:'reception'});
  const a=get().agents[0],cfg=a.versions[0].config;
  expect(cfg.duties).toEqual(['接待']);expect(cfg.criteria).toContain('原文明示');expect(cfg.audience).toBe('');expect(cfg.bindings).toEqual([]);expect(cfg.handoff).toContain('人工');
  expect(()=>createAgent(email,{customerId:'c1',recipeId:'unknown'})).toThrow('用途');
 });
 it('示例由服务端按业务生成，明确模拟且不产生生产线索',async()=>{
  createAgent(email,{customerId:'c2',recipeId:'content'});const a=get().agents[0];let prompt;
  await startAgentTrial(email,{agentId:a.id,example:true,text:'替换示例',source:'假来源'},{ready:()=>true,chatFn:async p=>{prompt=p;return '先明确整体设计需要解决的问题，再确认适用条件。';},review:async()=>[]}).completion;
  const run=get().agentRuns[0];expect(run.input.sourceType).toBe('simulated_example');expect(run.input.text).toContain('整体设计');expect(run.input.text).not.toContain('替换示例');expect(run.input.source).toContain('模拟');expect(prompt.system).toContain('内容草稿');expect(run.output.outputLabel).toBe('口播脚本草稿');expect(get().leads||[]).toHaveLength(0);
 });
 it('已有角色套用方案保留旧版本、平台和绑定并要求重新试运行',async()=>{
  const a=await enable();saveAgent(email,{agentId:a.id,baseVersion:1,recipeId:'reception'});
  const next=get().agents[0];expect(next.versions[0].config.recipeId).toBeUndefined();expect(next.versions[1].config.recipeId).toBe('reception');expect(next.versions[1].config.platforms).toEqual(a.versions[0].config.platforms);expect(next.status).toBe('draft');expect(()=>agentAction(email,{agentId:a.id,action:'enable'})).toThrow('试运行');
 });
});

describe('助手工作流质量边界',()=>{
 it('拒绝联系时不调用模型，不生成话术，不改真实联系人',async()=>{
  createAgent(email,{customerId:'c1',recipeId:'reception'});const a=get().agents[0];let calls=0;
  await startAgentTrial(email,{agentId:a.id,example:true,scenario:'refusal'},{ready:()=>true,chatFn:async()=>{calls++;return '营销话术';}}).completion;
  const run=get().agentRuns[0];expect(calls).toBe(0);expect(run.output.decision).toBe('hold');expect(run.output.draft).toBe('');expect(run.output.method).toBe('rule_decision');expect(get().leads||[]).toHaveLength(0);
 });
 it('质量不合格的草稿不能流入可用结果',async()=>{
  const a=create();await trial(a,{ready:()=>true,chatFn:async()=> '你在哪里？预算多少？',review:async()=>[]}).completion;
  const run=get().agentRuns[0];expect(run.status).toBe('failed');expect(run.error).toContain('多个问题');expect(run.output).toBeUndefined();
 });
 it('旧工作流的试运行记录不能替代新版验收',async()=>{
  const a=create();await trial(a).completion;const s=readWorkspace(email);s.acquisition.agentRuns[0].playbookVersion='old';writeWorkspace(email,s);expect(()=>agentAction(email,{agentId:a.id,action:'enable'})).toThrow('试运行');
 });
});

describe('对抗式验收与状态边界',()=>{
 it('停止营销样例不能替代可生成草稿的启用验收',async()=>{createAgent(email,{customerId:'c1',recipeId:'reception'});const a=get().agents[0];await startAgentTrial(email,{agentId:a.id,example:true,scenario:'refusal'},{ready:()=>false}).completion;expect(()=>agentAction(email,{agentId:a.id,action:'enable'})).toThrow('停止营销');});
 it('已启用角色也不能用旧工作流验收记录启动正式找客',async()=>{const a=await enable(),s=readWorkspace(email);s.acquisition.agentRuns[0].playbookVersion='old';writeWorkspace(email,s);expect(()=>startSearch(email,{customerId:'c1',agentId:a.id},async()=>[])).toThrow('当前工作流');expect(agentWorkspace(email).acquisition.agents[0].needsTrial).toBe(true);});
 it('模型伪造内部错误前缀不能泄露提供商信息',async()=>{const a=create();await trial(a,{ready:()=>true,chatFn:async()=>{throw new Error('草稿未通过质量检查：secret-provider-token');},review:async()=>[]}).completion;expect(JSON.stringify(get())).not.toContain('secret-provider-token');expect(get().agentRuns[0].status).toBe('failed');});
 it('不能把内容助手职责偷偷改成接待而保留内容工作流',()=>{createAgent(email,{customerId:'c1',recipeId:'content'});const a=get().agents[0];expect(()=>saveAgent(email,{agentId:a.id,baseVersion:1,config:{...a.versions[0].config,duties:['接待']}})).toThrow('用途一致');});
});
