import { assertSalesDraft } from './sales-strategy.mjs';

// One bounded repair, then fail closed. The repaired draft passes the same checks.
export async function generateSalesDraft({request,scope,reviewContext,platform,chatFn,review,question='',validate=text=>text,onReview=()=>{}}) {
  let current=request;
  for(let attempt=0;attempt<2;attempt++){
    const text=validate(await chatFn(current));
    let issues=[];
    try{assertSalesDraft(text,scope,reviewContext.sourceMaterial||'');}catch(e){issues=[e.message];}
    if(!issues.length){
      try{issues=await review({platform,items:[{body:text}],salesContext:{question}},reviewContext,{chatFn,sales:true});}
      catch{onReview({attempt,text,issues:['核对接口未返回可用结论']});throw new Error('经营事实核对未完成，请检查模型连接后重试');}
    }
    onReview({attempt,text,issues});
    if(!issues.length)return text;
    if(attempt)throw new Error('草稿的经营事实仍需核对，请补充资料或改由人工处理');
    current={...request,user:request.user+'\n'+JSON.stringify({repair:{previousDraft:text,issues,task:'修正草稿。删除没有原始产品资料支持的断言。客户要求不等于产品能力；只保留可核对事实和一个必要问题。仍只返回短回复正文。'}})};
  }
}
