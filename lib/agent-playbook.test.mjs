import {describe,it,expect} from 'vitest';
import {agentPlan,checkAgentOutput} from './agent-playbook.mjs';
import {recommendedConfig,exampleInput,recipeInstructions,AGENT_SCENARIOS} from '../js/agent-recipes.js';
const business={name:'灯具业务',hunt:'灯具',pitch:'台灯',city:'杭州'};
const plan=(kind,text,extra={})=>agentPlan(business,recommendedConfig(business,kind),{text,platform:'抖音',source:'测试原文',...extra});
describe('三类助手场景验收',()=>{
 it.each([
  ['prospecting','想买台灯，需要报价','draft','优先核实'],
  ['prospecting','专业承接台灯招商加盟','hold','相关性低'],
  ['prospecting','不要再联系我','hold','停止营销'],
  ['reception','不要再联系我','hold','停止营销'],
  ['reception','我要投诉申请退款','hold','转人工处理'],
  ['reception','谢谢','draft','自然结束本轮'],
  ['reception','多少钱','draft','先答清楚'],
  ['reception','怎么买','draft','推进成交'],
 ])('%s / %s',(kind,text,decision,priority)=>{const p=plan(kind,text);expect(p.decision).toBe(decision);expect(p.assessment.priority).toBe(priority);if(decision==='hold')expect(p.fallback).toBe('');});
 it('作者自己的回复不当成新客户',()=>{expect(plan('prospecting','想买台灯',{isAuthorReply:true}).decision).toBe('hold');});
 it('明确感谢不追问，价格未知不编数字',()=>{expect(plan('reception','谢谢').fallback).toBe('不客气。');expect(plan('reception','多少钱').fallback).toContain('核对');expect(plan('reception','多少钱').fallback).not.toMatch(/\d+元/);});
 it('内容与找客使用不同输出和下一步',()=>{const p=plan('content','台灯怎么选');expect(p.assessment.priority).toBe('内容任务');expect(p.outputLabel).toBe('口播脚本草稿');expect(p.nextStep).toContain('内容制作');expect(p.fallback).toContain('画面建议');expect(p.nextStep).not.toContain('线索');});
 it('资料缺失显式说明，不能把模板称为业务成稿',()=>{const p=agentPlan({name:'未完善业务'},recommendedConfig(business,'content'),{text:'写一篇',platform:'小红书'});expect(p.missing).toContain('业务介绍缺失：只生成通用选题提纲，补充业务后再定稿');expect(p.outputLabel).toBe('内容草稿');});
 it.each(['已为你发送','已帮你下单','百分百有效，闭眼入','留下你的手机号','加我微信'])('拦截失实动作和不当输出 %s',draft=>{expect(checkAgentOutput(draft,plan('reception','询价')).length).toBeGreaterThan(0);});
 it('回复限制单问题和长度，内容允许更完整的脚本',()=>{expect(checkAgentOutput('在哪里？什么时候？',plan('reception','询价'))).toContain('一次追问了多个问题');expect(checkAgentOutput('字'.repeat(301),plan('reception','询价'))).toContain('输出过长');expect(checkAgentOutput('字'.repeat(400),plan('content','写内容'))).toEqual([]);});
 it('所有示例明确标注模拟，拒绝不存在场景',()=>{for(const kind of ['content','reception','prospecting'])for(const s of AGENT_SCENARIOS){const e=exampleInput(business,recommendedConfig(business,kind),s.id);expect(e.source).toContain('模拟');expect(e.text.length).toBeGreaterThan(0);}expect(()=>exampleInput(business,recommendedConfig(business),'unknown')).toThrow('场景');});
 it('内容不要求每次追问，接待也允许直接回答',()=>{expect(recipeInstructions(recommendedConfig(business,'reception'))).toContain('也可以不追问');expect(recipeInstructions(recommendedConfig(business,'content'))).toContain('600字');});
});

it('真实模型暴露的经历编造和合并追问可被拦截',()=>{expect(checkAgentOutput('很多杭州的朋友在咨询选购台灯时容易焦虑',plan('content','写内容'))).toContain('出现未经本次工作流确认的客户经历');expect(checkAgentOutput('能否说明使用场景以及核心指标？',plan('reception','询价'))).toContain('一个问句中并列索取了多项信息');});

it('具体参数不能靠模型记忆补造',()=>{expect(checkAgentOutput('阅读建议4000K，氛围2700K',plan('content','选灯'))).toHaveLength(2);expect(checkAgentOutput('先核对用途，再确认参数',plan('content','选灯'))).toEqual([]);});
it('数值依据不能用子串蒙混过关，兼容大小写和全角字符',()=>{const p={...plan('content','选灯'),facts:'参数为14000K和5000K'};expect(checkAgentOutput('建议4000K',p)).toContain('具体数值缺少业务资料依据：4000k');expect(checkAgentOutput('５０００Ｋ',p)).toEqual([]);});
