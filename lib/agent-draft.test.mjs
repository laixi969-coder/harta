import {it,expect,vi} from 'vitest';
import {generateAgentDraft} from './agent-draft.mjs';
import {recommendedConfig,exampleInput} from '../js/agent-recipes.js';
import {agentPlan} from './agent-playbook.mjs';
const business={name:'测试',pitch:'灯具咨询'},config=recommendedConfig(business,'reception'),evidence=exampleInput(business,config),plan=agentPlan(business,config,evidence);
it('过长回复最多修一次，修复后仍经过事实检查',async()=>{
 const chatFn=vi.fn().mockResolvedValueOnce('字'.repeat(250)).mockResolvedValueOnce('需要先核对适用条件。'),review=vi.fn(async()=>[]);
 const result=await generateAgentDraft({business,config,evidence,plan,chatFn,review});expect(result.repairs).toBe(1);expect(chatFn).toHaveBeenCalledTimes(2);expect(review).toHaveBeenCalledTimes(1);expect(chatFn.mock.calls[1][0].user).toContain('输出过长');
});
it('事实检查不通过时修复，不能跳过再次审读',async()=>{
 const chatFn=vi.fn(async()=> '需要先核对适用条件。'),review=vi.fn().mockResolvedValueOnce([{quote:'测试',reason:'缺少依据'}]).mockResolvedValueOnce([]);
 expect((await generateAgentDraft({business,config,evidence,plan,chatFn,review})).repairs).toBe(1);expect(review).toHaveBeenCalledTimes(2);
});
it('两次不合格后失败，不截断、不无限重试',async()=>{
 const chatFn=vi.fn(async()=> '字'.repeat(250)),review=vi.fn(async()=>[]);
 await expect(generateAgentDraft({business,config,evidence,plan,chatFn,review})).rejects.toThrow('质量检查');expect(chatFn).toHaveBeenCalledTimes(2);expect(review).not.toHaveBeenCalled();
});
it.each([undefined,null,{length:0},''])('事实审读结构异常必须失败 %s',async value=>{await expect(generateAgentDraft({business,config,evidence,plan,chatFn:async()=> '请先核对适用条件。',review:async()=>value})).rejects.toThrow('审读结果无效');});
