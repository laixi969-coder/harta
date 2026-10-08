import {it,expect} from 'vitest';
import {buildSalesPlan,salesStopReason,assertSalesDraft} from './sales-strategy.mjs';
import {salesKnowledge,isSalesKnowledgeCurrent} from './sales-knowledge.mjs';
const at=Date.parse('2026-10-08T12:00:00Z');
const scope={productIds:['p1'],skuIds:['s1'],products:[{id:'p1',name:'阅读灯',source:'说明书',revision:1}],skus:[{id:'s1',name:'白色',priceTerms:'199 元/台，含 24 个月保修',source:'报价表',revision:1}]};
const base=()=>({lead:{messages:[]},op:{id:'o1',stage:'待核实'},scope,evidence:[{text:'不用打孔的阅读灯怎么选？'}],at});
it('first contact identifies another merchant; old customer lifecycle does not exclude new needs',()=>{
 const b=base();b.lead.stage='已成交';const p=buildSalesPlan(b);expect(p.skillId).toBe('opening');expect(p.stopReason).toBe('');expect(p.instruction).toContain('另一家商家');
});
it.each([
 ['小孩写作业用','discovery'],['两款灯有什么区别？','matching'],['这个太贵了，可以便宜吗','objection'],['这个多少钱，怎么买','closing'],['售后怎么样','discovery']
])('routes real inbound %s to %s',(text,id)=>{expect(buildSalesPlan({...base(),conversation:[{direction:'inbound',text}]}).skillId).toBe(id);});
it('pricing without a selected SKU stays unknown even with product documents',()=>{const p=buildSalesPlan({...base(),scope:{products:scope.products,skus:[]},conversation:[{direction:'inbound',text:'多少钱'}]});expect(p.missing.join()).toContain('报价条件未齐');});
it.each(['不要再联系我','别再发了','我不感兴趣','我要退款','转人工'])('refusal/service request blocks active selling: %s',text=>{expect(salesStopReason({...base(),evidence:[{text}]})).not.toBe('');});
it('checks inbound across sending accounts but does not treat quoted merchant instructions as refusal',()=>{
 const b=base();b.lead.messages=[{opportunityId:'o1',direction:'inbound',text:'不要联系我',receivedAt:new Date(at).toISOString(),accountId:'other'}];expect(salesStopReason(b)).toContain('停止');
 expect(salesStopReason({...base(),evidence:[{text:'不用打孔的灯怎么选'}]})).toBe('');
});
it('cooldown and one unanswered followup enforce actual sends, not copied drafts',()=>{
 const b=base();const msg={opportunityId:'o1',direction:'outbound',status:'sent_manual',sentAt:new Date(at-1000).toISOString()};b.lead.messages=[msg];expect(salesStopReason(b)).toContain('24');
 b.lead.messages=[{...msg,status:'copied'}];expect(salesStopReason(b)).toBe('');
 b.lead.messages=[{...msg,sentAt:new Date(at-90000000).toISOString()}];expect(salesStopReason(b)).toBe('');
 b.lead.messages.push({...msg,sentAt:new Date(at-87000000).toISOString()});expect(salesStopReason(b)).toContain('一次');
 b.lead.messages.push({opportunityId:'o1',direction:'inbound',text:'还想了解一下',receivedAt:new Date(at-100).toISOString()});expect(salesStopReason(b)).toBe('');
});
it('does not use an earlier inbound as reply to a later sent message',()=>{const b=base();b.lead.messages=[{opportunityId:'o1',direction:'outbound',status:'sent_manual',sentAt:new Date(at-1000).toISOString()},{opportunityId:'o1',direction:'inbound',text:'补录的旧消息',receivedAt:new Date(at-2000).toISOString()}];expect(salesStopReason(b)).toContain('24');});
it('a neutral later message or a different opportunity does not silently undo refusal',()=>{
 const b=base();b.lead.messages=[{opportunityId:'old',direction:'inbound',text:'别再联系我',receivedAt:new Date(at-2000).toISOString()},{opportunityId:'o1',direction:'inbound',text:'谢谢',receivedAt:new Date(at-1000).toISOString()}];expect(salesStopReason(b)).toContain('停止');
 b.lead.events=[{type:'unblock',at:new Date(at).toISOString(),note:'人工核对对方重新允许联系'}];expect(salesStopReason(b)).toBe('');
});
it('known money only: a warranty duration and a manual price cannot authorize a quote',()=>{
 expect(()=>assertSalesDraft('本款 199 元/台',scope)).not.toThrow();
 for(const s of ['本款24元','99元优惠价','一百元','￥999'])expect(()=>assertSalesDraft(s,scope)).toThrow('报价');
 expect(()=>assertSalesDraft('199元',null)).toThrow('报价');
 expect(()=>assertSalesDraft('200元',{products:[{hasVariants:false,priceTerms:'200元/小时'}]})).not.toThrow();
 expect(()=>assertSalesDraft('200元',{products:[{hasVariants:true,priceTerms:'200元/小时'}]})).toThrow('报价');
 expect(()=>assertSalesDraft('已为你下单',scope)).toThrow('承诺');
 expect(()=>assertSalesDraft('店内只有这一款',scope)).toThrow('全部商品');
 expect(()=>assertSalesDraft('不需要在墙上打孔',scope)).toThrow('明确支持');
 expect(()=>assertSalesDraft('未确认是否免打孔，需核对',scope)).not.toThrow();
 expect(()=>assertSalesDraft('这款免打孔',scope,'产品说明：本款支持免打孔安装。')).not.toThrow();
 expect(()=>assertSalesDraft('非常适合孩子写作业',scope)).toThrow('适配条件');
});
const doc=(extra={})=>({id:'d1',customerId:'c1',productId:'p1',skuId:'s1',title:'阅读灯安装说明',body:'阅读灯安装条件：书桌需要有插座。',source:'产品手册第3页',status:'approved',revision:1,...extra});
it('retrieves only approved in-scope current documents before ranking',()=>{
 const s={acquisition:{salesDocuments:[doc(),doc({id:'foreign',customerId:'c2'}),doc({id:'other-product',productId:'p2'}),doc({id:'other-sku',skuId:'s2'}),doc({id:'draft',status:'draft'}),doc({id:'expired',expiresAt:'2020-01-01'}),doc({id:'archived',status:'archived'})]}};
 const k=salesKnowledge(s,'c1',scope,'安装插座',at);expect(k.chunks.map(r=>r.id)).toEqual(['d1']);expect(k.chunks[0].source).toContain('第3页');
 expect(salesKnowledge(s,'c1',{productIds:['p1'],skuIds:[]},'安装',at).chunks).toEqual([]);
 expect(salesKnowledge(s,'c1',scope,'完全无关',at).chunks).toEqual([]);
});
it('all applicable versions and expirations invalidate saved drafts even if query has no match',()=>{
 const s={acquisition:{salesDocuments:[doc()]}};const k=salesKnowledge(s,'c1',scope,'不相关',at);expect(k.chunks).toEqual([]);
 s.acquisition.salesDocuments[0].revision++;expect(isSalesKnowledgeCurrent(s,'c1',scope,k.hash)).toBe(false);
 const k2=salesKnowledge(s,'c1',scope,'安装',at);s.acquisition.salesDocuments[0].expiresAt='2020-01-01';expect(isSalesKnowledgeCurrent(s,'c1',scope,k2.hash)).toBe(false);
});
