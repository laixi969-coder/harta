import { describe, expect, it } from 'vitest';
import { extractFactCards } from './fact-cards.mjs';
import { businessMaterialContext } from './content-context.mjs';
import { materialTextForPack } from './materials.mjs';
describe('事实卡原文依据',()=>{
 it('只能提取资料中连续原文，默认待确认并保留来源位置',async()=>{
  const quote='我们仅在杭州提供厨房局部翻新服务。';
  const result=await extractFactCards({salesMaterial:quote},{chatFn:async()=>JSON.stringify({quotes:[quote]})});
  expect(result.cards[0]).toMatchObject({text:quote,status:'pending'});expect(result.cards[0].source).toContain('用户保存');expect(result.context).toContain(quote);
 });
 it('模型改写或虚构事实不能作为资料摘录保存',async()=>{
  await expect(extractFactCards({salesMaterial:'仅做厨房局部翻新。'},{chatFn:async()=>JSON.stringify({quotes:['我们提供免费的全屋设计服务。']})})).rejects.toThrow('匹配资料原文');
 });
 it('多份长附件不会在进入上下文前静默丢失后面的文件',()=>{
  const source=materialTextForPack({sources:[{name:'长资料',text:'甲'.repeat(40000)},{name:'服务限制',text:'乙'.repeat(100)+'仅在杭州提供服务'}]});
  const ctx=businessMaterialContext({sourceMaterial:source});expect(ctx.text).toContain('仅在杭州提供服务');expect(ctx.warnings).toHaveLength(1);
 });
 it('待确认和停用事实与确认事实在生成上下文中明确区分',()=>{
  const ctx=businessMaterialContext({factCards:[{id:'F1',text:'免费测量',status:'pending'},{id:'F2',text:'限杭州',status:'confirmed'},{id:'F3',text:'旧价格',status:'retired'}]});
  expect(ctx.text).toContain('待确认，不得写成事实');expect(ctx.text).toContain('已停用，不得采用');expect(ctx.text).toContain('用户已确认');
 });
});
