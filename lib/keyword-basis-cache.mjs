import crypto from 'node:crypto';
import {buildKeywordOpportunities} from './keyword-opportunities.mjs';
export function createKeywordBasisCache({maxEntries=32,maxBytes=16*1024*1024,ttl=60000,build=buildKeywordOpportunities}={}) {
  if (!Number.isInteger(maxEntries) || maxEntries < 0 || !Number.isFinite(maxBytes) || maxBytes < 0 || !Number.isFinite(ttl) || ttl < 0) throw new RangeError('缓存容量和有效期必须是非负有限数值');
  const cache=new Map();
  let bytes=0;
  const remove=key=>{const entry=cache.get(key);if(entry){bytes-=entry.bytes;cache.delete(key);}};
  return (customer,now=Date.now())=>{
    // 有效期到了就回收，而非等相同客户再次访问才淘汰。
    for(const [key,entry] of cache)if(now<entry.at || now-entry.at>=ttl)remove(key);
    const input={name:customer.name,hunt:customer.hunt,pitch:customer.pitch,salesMaterial:customer.salesMaterial,sourceMaterial:customer.sourceMaterial,keywordLibraries:customer.keywordLibraries||[]};
    const key=crypto.createHash('sha256').update(JSON.stringify(input)).digest('hex');
    const previous=cache.get(key);
    if(previous && now>=previous.at && now-previous.at<ttl){cache.delete(key);cache.set(key,previous);return structuredClone(previous.value);}
    const value=build(input,{now});
    remove(key);
    const size=Buffer.byteLength(JSON.stringify(value));
    if(maxEntries>0 && size<=maxBytes && ttl>0){cache.set(key,{at:now,value:structuredClone(value),bytes:size});bytes+=size;}
    while(cache.size>maxEntries || bytes>maxBytes)remove(cache.keys().next().value);
    return structuredClone(value);
  };
}
export const cachedKeywordBasis=createKeywordBasisCache();
