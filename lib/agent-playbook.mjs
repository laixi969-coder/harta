import { assessSignal } from './acquisition-workspace.mjs';
import { buildSalesPlan } from './sales-strategy.mjs';

import { AGENT_PLAYBOOK_VERSION } from '../js/agent-recipes.js';
export const PLAYBOOK_VERSION=AGENT_PLAYBOOK_VERSION;
export function agentPlan(business,cfg,evidence){
 const kind=cfg.recipeId||'prospecting',raw=evidence.text;
 if(kind==='content')return {
  version:PLAYBOOK_VERSION,kind,facts:JSON.stringify({pitch:business.pitch,material:business.salesMaterial,sourceMaterial:business.sourceMaterial,factCards:business.factCards}),decision:'draft',outputLabel:evidence.platform==='抖音'?'口播脚本草稿':'内容草稿',
  assessment:{priority:'内容任务',reason:'围绕本次选题提供可执行的判断方法；不把创作需求当成潜在线索。',method:'内容工作流'},
  missing:business.pitch?[]:['业务介绍缺失：只生成通用选题提纲，补充业务后再定稿'],
  instruction:`只围绕本次材料中的一个具体问题，给出一个清晰观点和可操作的判断方法。${evidence.platform==='抖音'?'按开头一句、口播正文、画面建议、结尾一步编排；开头直接进入问题，画面不依赖不存在的客户案例。':'按标题、正文、结尾一步编排；标题兑现正文收益，正文包含具体做法，避免空泛形容词。'}未知经营事实省略或明确待核对，不编造案例、销量、效果、价格和紧迫感。最多一个轻量行动建议，不要求私信才能获得正文承诺的信息。`,
  fallback: evidence.platform==='抖音'?'开头一句：选之前，先把这三个问题问清楚。\n口播正文：你想解决什么问题？哪些条件会影响是否适用？报价包含哪些项目？先记录自己的使用场景，再逐项核对服务资料，不只比较一个总价。\n画面建议：逐条展示三个问题，配合清单画面。\n结尾一步：先列出你最在意的一项，再核对依据。':'标题：选之前，先核对这三个问题\n正文：明确想解决的问题，核对适用条件，再确认报价所含项目。把需求和已确认事实分开记录，缺少依据的内容先向服务方核实。\n下一步：先写下你最在意的一项条件。',
  nextStep:'核对经营事实与平台格式，审阅后把草稿用于内容制作；本次不会发布。',checks:['单一读者问题','标题与正文一致','经营事实有依据','只有一个下一步']};
 const conversation=kind==='reception'?[{direction:'inbound',text:raw,createdAt:new Date().toISOString()}]:[];
 const sales=buildSalesPlan({lead:{messages:conversation},evidence:[evidence],conversation,scope:{products:[],skus:[]},knowledge:{chunks:[]}});
 const assessment=assessSignal(evidence,business,cfg);
 const base={version:PLAYBOOK_VERSION,kind,decision:'draft',outputLabel:'回复草稿',assessment,missing:[],checks:['先答当前问题','未知事实保持未知','至多一个必要问题','尊重联系意愿']};
 if(sales.stopReason)return {...base,decision:'hold',outputLabel:'处理建议',assessment:{priority:/售后|人工/.test(sales.stopReason)?'转人工处理':'停止营销',reason:sales.stopReason,method:'沟通边界规则'},instruction:'不生成营销回复。',fallback:'',nextStep:sales.stopReason+'。本次不生成外发草稿，也不会改变真实客户状态。'};
 if(kind==='prospecting'&&(assessment.priority==='相关性低'||evidence.isAuthorReply))return {...base,decision:'hold',outputLabel:'处理建议',fallback:'',instruction:'先核对是否是客户需求，不起草联系话术。',nextStep:'暂不联系，先核对原文及作者身份；不能把同行推广、作者回复或排除词匹配当成已确认需求。'};
 if(kind==='prospecting')return {...base,instruction:'仅把明确的需求原话作为判断依据。首次联系如来源是其他商家评论，应简短说明自己的商家身份，不能冒充作者。泛泛讨论不能推断购买意愿；只能提出一个影响判断的澄清问题，不索取电话，不直接催下单。',missing:['服务区域、适用条件及联系意愿仍需对照原文核实'],fallback:'我是提供相关服务的商家。可以先根据具体使用场景核对是否适用，你目前最想解决的是哪个问题？',nextStep:assessment.priority==='优先核实'?'先回看来源并确认业务适配，再加入跟进；公开评论不等于同意私信。':'先补充能说明具体需求的原文，保持待核实，不自动升级为有效线索。'};
 const templates={acknowledging:'不客气。',answering:'具体报价和适用条件需要依据确认过的业务资料核对，我目前不能给出确定承诺。',closing:'购买方式需要人工核对，目前还不能提供已确认的下单入口。',matching:'需要先核对各方案的适用条件和差异，目前的资料还不足以判断哪一种更适合。',objection:'可以先按你的预算和顾虑核对是否适合，不必急着决定。你最想先确认哪一点？',discovery:'你目前最希望解决的具体问题是什么？'};
 return {...base,skillId:sales.skillId,assessment:{priority:sales.name,reason:'依据本轮咨询选择回应方式，不把询问价格或简单回应视为同意购买。',method:'接待工作流'},instruction:sales.instruction,missing:sales.skillId==='acknowledging'?[]:sales.missing,fallback:templates[sales.skillId]||templates.discovery,nextStep:sales.nextStep};
}
export function checkAgentOutput(draft,plan){
 const problems=[];
 const measurements=value=>[...String(value||'').normalize('NFKC').matchAll(/(?<![\d.])\d+(?:\.\d+)?\s*(?:万元|小时|勒克斯|lux|K|元|%|天|年)/gi)].map(m=>m[0].replace(/\s/g,'').toLowerCase());
 if(plan.kind==='content'){const known=new Set(measurements(plan.facts));for(const value of measurements(draft))if(!known.has(value))problems.push('具体数值缺少业务资料依据：'+value);}
 if(/(?:很多|不少|经常|常有).{0,12}(?:客户|朋友|用户).{0,15}(?:咨询|问|反馈)|我们(?:服务过|接待过)/.test(draft))problems.push('出现未经本次工作流确认的客户经历');
 if(draft.length>(plan.kind==='content'?600:180))problems.push('输出过长');
 if(plan.kind!=='content'&&/[？?]/.test(draft)&&/(?:请问|能否|方便|请您|请你).{0,120}(?:以及|同时还|另外还)/s.test(draft))problems.push('一个问句中并列索取了多项信息');
 if(plan.kind!=='content'&&(draft.match(/[？?]/g)||[]).length>1)problems.push('一次追问了多个问题');
 if(/已(?:经)?(?:为你|帮你)?(?:发送|发布|下单|退款|预约成功)|保证成交|百分百有效|闭眼入|不买.{0,6}后悔/.test(draft))problems.push('包含未经执行的动作或不当承诺');
 if(/加(?:我|我的)?(?:微信|VX|V信)|留下.{0,6}(?:电话|手机号)/i.test(draft))problems.push('不应在试运行中直接索取站外联系方式');
 if(!draft.trim()&&plan.decision!=='hold')problems.push('未生成有效内容');
 return problems;
}
