import { creationDocuments, draftQueries, findCreationEvidence } from '../../lib/creation-evidence.mjs';
import { businessMaterialContext } from '../../lib/content-context.mjs';
import { planningSources } from '../../lib/content-planning.mjs';
import { reviewContentFacts } from '../../lib/content-review.mjs';
import { chat, llmReady } from '../../lib/llm.mjs';
import { fixture } from './fixtures.mjs';

export async function evaluateCreation({industry,position}, live=false) {
  const {sample,customer,scope,space}=fixture(industry,position);
  customer.creationDocuments=creationDocuments('',space,customer,scope,()=>null);
  const writing=planningSources(customer);
  const draft={items:[{title:sample.question,body:sample.fact+' '+sample.claim}]};
  const recheck=findCreationEvidence(customer,draftQueries(draft));
  const withFact=writing.find(row=>row.location && row.text.includes(sample.fact));
  const wrongScope=[...writing,...recheck].some(row=>row.text.includes('错误样本专用标记'));
  const locate=row=>{
    const doc=customer.creationDocuments.find(d=>d.id===row.id && d.revision===row.revision);
    return doc && doc.body.slice(row.offset,row.offset+row.text.length)===row.text;
  };
  const result={industry,position,goal:sample.goal,mode:live?'live':'offline',retrieved:Boolean(withFact),
    scopeClean:!wrongScope,exceptionRetained:withFact?.text.includes(sample.exception) || false,
    newClaimRetrieved:recheck.some(r=>r.id==='later'&&r.text.includes(sample.after)),
    exactRanges:recheck.length>0&&recheck.every(locate),issues:null};
  if (live) {
    if (!llmReady()) throw new Error('未配置模型，无法执行真实模型评测');
    const material=businessMaterialContext(customer).text;
    const copy=await chat({system:'你是内容编辑，用已读取业务资料写一条可独立发布的中文正文，保留适用条件和例外，不补充未经核实的承诺。',user:JSON.stringify({goal:sample.goal,question:sample.question,material}),maxTokens:600});
    if (!copy.trim()) throw new Error('模型未出稿');
    result.generated=copy;
    result.generatedIssues=await reviewContentFacts({items:[{title:sample.question,body:copy}]},customer);
    result.issues=await reviewContentFacts(draft,customer);
  }
  return result;
}

export default class CreationProvider {
  id(){return process.env.HARTA_CREATION_EVAL_LIVE==='1'?'harta-creation-live':'harta-creation-offline';}
  async callApi(_prompt,{vars}){
    try {return {output:JSON.stringify(await evaluateCreation(vars,process.env.HARTA_CREATION_EVAL_LIVE==='1'))};}
    catch(error){return {error:error.message};}
  }
}
