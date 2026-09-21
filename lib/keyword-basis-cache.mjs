import crypto from 'node:crypto';
import {buildKeywordOpportunities} from './keyword-opportunities.mjs';
export function createKeywordBasisCache({maxEntries=32,ttl=60000,build=buildKeywordOpportunities}={}) {
  const cache=new Map();
  return (customer,now=Date.now())=>{
    const input={name:customer.name,hunt:customer.hunt,pitch:customer.pitch,salesMaterial:customer.salesMaterial,sourceMaterial:customer.sourceMaterial,keywordLibraries:customer.keywordLibraries||[]};
    const key=crypto.createHash('sha256').update(JSON.stringify(input)).digest('hex');
    const previous=cache.get(key);
    if(previous && now>=previous.at && now-previous.at<ttl){cache.delete(key);cache.set(key,previous);return structuredClone(previous.value);}
    const value=build(input,{now});
    cache.delete(key);cache.set(key,{at:now,value});
    while(cache.size>maxEntries)cache.delete(cache.keys().next().value);
    return structuredClone(value);
  };
}
export const cachedKeywordBasis=createKeywordBasisCache();
