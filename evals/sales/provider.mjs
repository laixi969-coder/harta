import { buildSalesPlan } from '../../lib/sales-strategy.mjs';
import { salesKnowledge } from '../../lib/sales-knowledge.mjs';
import { salesDraftRequest } from '../../lib/sales-request.mjs';
import { chat, llmReady } from '../../lib/llm.mjs';
import { generateSalesDraft } from '../../lib/sales-draft.mjs';
import { reviewContentFacts } from '../../lib/content-review.mjs';
// Synthetic fixtures only. Default mode does not invoke any model/provider.
export default class HartaSalesProvider {
  id(){return process.env.HARTA_SALES_EVAL_LIVE==='1'?'harta-sales-live':'harta-sales-rules';}
  async callApi(_prompt,{vars}) {
    const input=structuredClone(vars.fixture),live=process.env.HARTA_SALES_EVAL_LIVE==='1';
    const knowledge=salesKnowledge(input.space,'c1',input.scope,input.query,Date.parse('2026-10-08T12:00:00Z'));
    const salesPlan=buildSalesPlan({...input,knowledge,at:Date.parse('2026-10-08T12:00:00Z')});
    let draft='';const attempts=[];
    if(live&&!salesPlan.stopReason){
      if(!llmReady())return {error:'未配置可用模型；不能将规则测试当作真实模型评测'};
      try {
        draft=await generateSalesDraft({onReview:r=>attempts.push(r),request:salesDraftRequest({...input,business:{name:'测试灯具商店'},material:'合成验收业务，仅用于测试。',knowledge,salesPlan}),scope:input.scope,salesPlan,question:input.conversation.at(-1)?.text||input.evidence.map(e=>e.text).join('\n'),reviewContext:{name:'测试灯具商店',hunt:'其他行业',salesMaterial:JSON.stringify(input.scope),sourceMaterial:knowledge.chunks.map(d=>d.text).join('\n')},platform:'抖音',chatFn:chat,review:reviewContentFacts});
      } catch { return {error:'真实模型未返回通过报价与承诺检查的草稿',metadata:{attempts}}; }
    }
    return {output:JSON.stringify({skill:salesPlan.skillId,blocked:Boolean(salesPlan.stopReason),references:knowledge.chunks.map(d=>d.id),draft,mode:live?'live':'rules'})};
  }
}
