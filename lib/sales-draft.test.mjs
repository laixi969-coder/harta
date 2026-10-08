import {it,expect} from 'vitest';
import {generateSalesDraft} from './sales-draft.mjs';
const base={request:{system:'规则',user:'原始产品资料',maxTokens:1200},scope:{products:[],skus:[]},reviewContext:{},platform:'抖音'};
it('repairs unsupported facts once and subjects the new text to the same reviewer',async()=>{
 const requests=[],reviews=[];
 const text=await generateSalesDraft({...base,chatFn:async r=>{requests.push(r);return requests.length===1?'这个产品支持声控':'我先核对安装方式，你的书桌旁有插座吗？';},review:async r=>{reviews.push(r.items[0].body);return reviews.length===1?['原始产品资料没有声控依据']:[];}});
 expect(requests).toHaveLength(2);expect(requests[1].user).toContain('没有声控依据');expect(reviews).toHaveLength(2);expect(text).not.toContain('产品支持声控');
});
it('pricing failures cannot be waived by a permissive fact reviewer and retry is bounded',async()=>{
 let writes=0,reviews=0;
 await expect(generateSalesDraft({...base,chatFn:async()=>{writes++;return '只要999元';},review:async()=>{reviews++;return [];}})).rejects.toThrow('仍需核对');
 expect(writes).toBe(2);expect(reviews).toBe(0);
});
it('a broken reviewer fails closed rather than silently using the draft',async()=>{
 let writes=0;
 await expect(generateSalesDraft({...base,chatFn:async()=>{writes++;return '请问使用场景？';},review:async()=>{throw Error('invalid reviewer');}})).rejects.toThrow('核对未完成');expect(writes).toBe(1);
});
it('unsolicited purchase pressure cannot pass just because a reviewer accepts facts',async()=>{
 let calls=0;await expect(generateSalesDraft({...base,salesPlan:{permission:{purchase:false}},chatFn:async()=>{calls++;return '现在就下单';},review:async()=>[]})).rejects.toThrow('仍需核对');expect(calls).toBe(2);
});
