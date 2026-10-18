import {it,expect,beforeAll,afterAll} from 'vitest';
import http from 'node:http';
import {once} from 'node:events';
import {createWorkMediaHandler,workMediaUrl} from './openfind-work-media.mjs';
const work={cover:'http://sns-webpic-qc.xhscdn.com/native-cover.webp',images:['https://sns-webpic-qc.xhscdn.com/native-image.webp'],videoUrl:'https://v.douyinvod.com/native.mp4'};
let server,origin,requests=[];
beforeAll(async()=>{
 const handler=createWorkMediaHandler({request:async(url,range)=>{
  requests.push({url,range});
  if(url.includes('large'))return new Response(new Uint8Array(17*1024*1024),{headers:{'content-type':'image/png'}});
  if(url.includes('bad'))return new Response('<html>not an image</html>',{headers:{'content-type':'text/html'}});
  if(url.endsWith('.mp4'))return new Response('ftyp',{status:206,headers:{'content-type':'video/mp4','content-range':'bytes 4-7/100','accept-ranges':'bytes'}});
  return new Response(new Uint8Array([0,255,128]),{headers:{'content-type':'image/webp'}});
 }});
 server=http.createServer((req,res)=>{const params=new URL(req.url,'http://fixture').searchParams;const w=params.has('bad')?{...work,cover:'https://xhscdn.com/bad'}:params.has('large')?{...work,cover:'https://xhscdn.com/large'}:work;void handler(req,res,w,params);}).listen(0,'127.0.0.1');await once(server,'listening');origin=`http://127.0.0.1:${server.address().port}`;
});
afterAll(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));});
it('serves only a saved work asset by index, even without a running OpenFind worker',async()=>{
 expect(workMediaUrl(work,new URLSearchParams('asset=cover'))).toBe(work.cover.replace('http:','https:'));
 for(const query of ['asset=image&index=-1','asset=image&index=99','asset=image&index=0.1','asset=unknown','url=https://evil.test'])expect(workMediaUrl(work,new URLSearchParams(query))).toBe('');
 for(const cover of ['https://127.0.0.1/x','https://xhscdn.com.evil.test/x','https://key@xhscdn.com/x'])expect(workMediaUrl({...work,cover},new URLSearchParams('asset=cover'))).toBe('');
 const response=await fetch(origin+'/?asset=cover',{headers:{cookie:'harta_sid=do-not-forward'}});expect(response.status).toBe(200);expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([0,255,128]);expect(response.headers.get('vary')).toBe('Cookie');
 const count=requests.length;await fetch(origin+'/?asset=cover');expect(requests).toHaveLength(count);
 expect(requests[0]).toEqual({url:work.cover.replace('http:','https:'),range:undefined});
 const missing=await fetch(origin+'/?asset=image&index=999');expect(missing.status).toBe(404);expect(requests).toHaveLength(count);
});
it('streams video ranges and refuses non-images and oversized images without caching errors',async()=>{
 const video=await fetch(origin+'/?asset=video',{headers:{range:'bytes=4-7'}});expect(video.status).toBe(206);expect(video.headers.get('content-range')).toBe('bytes 4-7/100');expect(await video.text()).toBe('ftyp');expect(requests.at(-1).range).toBe('bytes=4-7');
 for(const flag of ['bad','large']){const response=await fetch(origin+'/?asset=cover&'+flag);expect(response.status).toBe(502);expect(response.headers.get('cache-control')).toBe('no-store');}
});
