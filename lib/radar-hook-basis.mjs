import crypto from 'node:crypto';
import { businessMaterialContext } from './content-context.mjs';
import { profileBrief } from '../js/creator-profile.js';
export function radarHookContext(customer,work) {
  return {business:{name:customer.name||'',industry:customer.hunt||'',city:customer.city||'',pitch:customer.pitch||'',material:businessMaterialContext(customer).text},profile:profileBrief(customer),goal:customer.growthGoal||'leads',criteria:customer.growthCriteria||'',standards:customer.creationStandards||{},work:{id:work.id,platform:work.platform,title:work.title||'',description:String(work.description||'').slice(0,3000),url:work.url||''}};
}
export const radarHookBasisFromContext=(context,work)=>crypto.createHash('sha256').update(JSON.stringify({...context,work:{id:work.id,platform:work.platform,title:work.title||'',description:String(work.description||'').slice(0,3000),url:work.url||''}})).digest('hex');
export const radarHookBasis=(customer,work)=>radarHookBasisFromContext(radarHookContext(customer,work),work);
