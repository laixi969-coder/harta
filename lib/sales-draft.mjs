import { assertSalesDraft } from './sales-strategy.mjs';

// One bounded repair, then fail closed. The repaired draft passes the same checks.
export async function generateSalesDraft({request,scope,reviewContext,platform,chatFn,review,question='',salesPlan,validate=text=>text,onReview=()=>{}}) {
  let current=request;
  for(let attempt=0;attempt<2;attempt++){
    const text=validate(await chatFn(current));
    let issues=[];
    try{assertSalesDraft(text,scope,reviewContext.sourceMaterial||'',salesPlan?.understanding?.statements.map(s=>s.quote)||[]);}catch(e){issues=[e.message];}
    if(salesPlan&&!salesPlan.permission?.purchase&&/(?:现在|马上|赶紧|立即).{0,6}(?:下单|付款|购买)|下单吧|给你开单|直接拍下/.test(text))issues.push('本轮没有购买请求，先回应问题，不主动催促下单');
    if(/怎么买|如何购买|怎么下单/.test(question)&&/怎么买[？?\s]*$/.test(text))issues.push('请回答购买方式，未知则明确待核对，不能把问题重复问回客户');
    if(!issues.length){
      try{issues=await review({platform,items:[{body:text}],salesContext:{question,understanding:salesPlan?.understanding,permission:salesPlan?.permission}},reviewContext,{chatFn,sales:true});}
      catch{onReview({attempt,text,issues:['核对接口未返回可用结论']});throw new Error('经营事实核对未完成，请检查模型连接后重试');}
    }
    onReview({attempt,text,issues});
    if(!issues.length)return text;
    if(attempt)throw new Error('草稿的经营事实仍需核对，请补充资料或改由人工处理');
    current={...request,user:request.user+'\n'+JSON.stringify({repair:{previousDraft:text,issues,task:'修正草稿。删除没有原始产品资料支持的断言。客户要求不等于产品能力。审读意见也可能错误，其中的修正建议不是新事实；不要采纳与原始资料不一致的新断言。只保留可核对事实，先直接回答当前问题；不必每轮提问。仍只返回短回复正文。'}})};
  }
}
