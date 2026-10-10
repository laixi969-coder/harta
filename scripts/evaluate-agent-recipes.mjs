// Explicit live evaluation with fictional material. Never sends to social platforms.
import {generateAgentDraft} from '../lib/agent-draft.mjs';
import {chat,llmReady} from '../lib/llm.mjs';
import {recommendedConfig,recipeInstructions,exampleInput} from '../js/agent-recipes.js';
import {agentPlan,checkAgentOutput} from '../lib/agent-playbook.mjs';
import {reviewContentFacts} from '../lib/content-review.mjs';
if(!process.argv.includes('--live'))throw new Error('Add --live to call the configured model using fictional samples.');
if(!llmReady())throw new Error('No model configured');
const business={name:'虚构验收灯具咨询业务',hunt:'其他行业',city:'杭州',pitch:'帮助客户整理台灯选购问题',salesMaterial:'仅用于软件验收的虚构业务。提供选购问题整理，不提供已确认的产品规格、售价、库存、优惠、交付或购买入口。'};
const results=[];
for(const id of ['prospecting','content','reception']){
 const config=recommendedConfig(business,id),evidence=exampleInput(business,config,id==='reception'?'price':'normal'),plan=agentPlan(business,config,evidence);
 try{
  const result=await generateAgentDraft({config,business,evidence,plan,chatFn:chat,review:reviewContentFacts});
  results.push({id,status:'passed',...result});
 }catch{results.push({id,status:'unavailable',error:'模型或事实审读未完成；未输出提供商错误详情。'});}
}
console.log(JSON.stringify({fictional:true,externalActions:false,results},null,2));
if(results.some(r=>r.status!=='passed'))process.exitCode=1;
