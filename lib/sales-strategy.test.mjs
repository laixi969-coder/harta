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
 ['多少钱','answering',false],['怎么买','closing',true],['先不下单，报价多少','answering',false],['我想买一盏灯','discovery',false],['只是看看，先不买','discovery',false],['你推荐哪款','matching',false],['谢谢','acknowledging',false]
])('distinguishes inquiry, exploration and purchase requests: %s',(text,skill,purchase)=>{
 const plan=buildSalesPlan({...base(),conversation:[{direction:'inbound',text}]});expect(plan.skillId).toBe(skill);expect(plan.permission.purchase).toBe(purchase);
});
it('understanding preserves customer evidence and competing explanations without personality scores',()=>{
 const p=buildSalesPlan({...base(),conversation:[{direction:'inbound',text:'租房不想打孔，但是这个太贵了'}]});
 expect(p.understanding.currentQuestion).toBe('租房不想打孔，但是这个太贵了');
 const price=p.understanding.hypotheses.find(h=>h.key==='price');expect(price.status).toBe('待验证');expect(price.possibilities).toHaveLength(2);expect(price.basis[0].quote).toContain('太贵');
 expect(p.understanding).not.toHaveProperty('trustScore');expect(p.understanding.dimensions.find(d=>d.key==='alternative').state).toBe('unknown');
});
it('explicit budgets and reasons are not asked for again or treated as obstacles to break',()=>{
 const p=buildSalesPlan({...base(),conversation:[{direction:'inbound',text:'预算最多100元，主要是租房怕退租恢复麻烦'}]});
 expect(p.understanding.hypotheses.find(h=>h.key==='price').question).toBe('');
 expect(p.understanding.hypotheses.find(h=>h.key==='effort').question).toBe('');
});
it('older original needs survive replies without treating a merchant message as customer evidence',()=>{
 const p=buildSalesPlan({...base(),conversation:[{direction:'outbound',text:'客户很有钱'}, {direction:'inbound',text:'多少钱'}]});
 expect(p.understanding.statements.some(s=>s.quote.includes('不用打孔'))).toBe(true);
 expect(JSON.stringify(p.understanding)).not.toContain('很有钱');
});
it.each([
 ['小孩写作业用','discovery'],['两款灯有什么区别？','matching'],['这个太贵了，可以便宜吗','objection'],['这个多少钱，怎么买','closing'],['售后怎么样','answering']
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
it('declining a product is not contact-wide opt-out or a reason to push harder',()=>{
 const b=base();b.lead.messages=[{opportunityId:'o1',direction:'inbound',text:'太贵了不买了',receivedAt:new Date(at).toISOString()}];expect(salesStopReason(b)).toContain('暂缓');
 expect(salesStopReason({...b,op:{id:'new-need'}})).toBe('');
 b.lead.messages[0].text='这款不买了，有没有别的便宜点的';expect(salesStopReason(b)).toBe('');
});
it('known money only: a warranty duration and a manual price cannot authorize a quote',()=>{
 expect(()=>assertSalesDraft('本款 199 元/台',scope)).not.toThrow();
 for(const s of ['本款24元','99元优惠价','一百元','￥999'])expect(()=>assertSalesDraft(s,scope)).toThrow('报价');
 expect(()=>assertSalesDraft('199元',null)).toThrow('报价');
 expect(()=>assertSalesDraft('你的预算是100元，这款199元超出了预算',scope,'',['预算最多100元'])).not.toThrow();
 expect(()=>assertSalesDraft('你的预算是100元，这款也卖100元',scope,'',['预算最多100元'])).toThrow('报价');
 expect(()=>assertSalesDraft('200元',{products:[{hasVariants:false,priceTerms:'200元/小时'}]})).not.toThrow();
 expect(()=>assertSalesDraft('200元',{products:[{hasVariants:true,priceTerms:'200元/小时'}]})).toThrow('报价');
 expect(()=>assertSalesDraft('已为你下单',scope)).toThrow('承诺');
 expect(()=>assertSalesDraft('店内只有这一款',scope)).toThrow('全部商品');
 expect(()=>assertSalesDraft('不需要在墙上打孔',scope)).toThrow('明确支持');
 expect(()=>assertSalesDraft('未确认是否免打孔，需核对',scope)).not.toThrow();
 expect(()=>assertSalesDraft('这款免打孔',scope,'产品说明：本款支持免打孔安装。')).not.toThrow();
 expect(()=>assertSalesDraft('非常适合孩子写作业',scope)).toThrow('适配条件');
 expect(()=>assertSalesDraft('你其实怕买错，马上下单吧',scope)).toThrow('隐秘动机');
 expect(()=>assertSalesDraft('不买肯定后悔',scope)).toThrow('恐惧');
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

it('separates quoted installation needs from product claims and checks invented buying paths',()=>{
 for(const draft of ['您提到的免打孔需求，资料未注明是否支持，需核对。','你问的免打孔需求，说明书并未标注支持免打孔安装。','若必须完全免打孔，需先核对安装方式。'])expect(()=>assertSalesDraft(draft,scope)).not.toThrow();
 for(const draft of ['点击主页链接购买','进入商品页下单','这款非充电式'])expect(()=>assertSalesDraft(draft,scope)).toThrow();
 expect(()=>assertSalesDraft('点击购买链接下单',scope,'购买链接：https://example.com/buy')).not.toThrow();
 expect(()=>assertSalesDraft('你的预算是100元，这款199元超出了预算',scope,'',['预算最多100元'])).not.toThrow();
});
