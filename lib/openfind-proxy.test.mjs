import { it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import { once } from 'node:events';
import { openFindRoute, proxyOpenFind } from './openfind-proxy.mjs';
import { platformMediaUrl, storedMediaUrl } from './openfind-media.mjs';
let backend, gateway, origin, seen;
beforeAll(async () => {
  backend = http.createServer(async (req,res) => {
    const chunks=[];for await(const chunk of req) chunks.push(chunk);
    seen={path:req.url,headers:req.headers,body:Buffer.concat(chunks)};
    res.writeHead(req.headers.range ? 206 : 200, {'content-type':'application/octet-stream','content-disposition':'attachment; filename="media.zip"','set-cookie':'never=forward','content-range':'bytes 1-3/10'});res.end(Buffer.from([0,255,1,128]));
  });
  backend.listen(0,'127.0.0.1'); await once(backend,'listening');
  gateway=http.createServer(async(req,res)=>{try{await proxyOpenFind(req,res,{port:backend.address().port,secret:'private-token'},req.url,{'cache-control':'no-store'});}catch{res.writeHead(404);res.end();}});
  gateway.listen(0,'127.0.0.1');await once(gateway,'listening');origin=`http://127.0.0.1:${gateway.address().port}`;
});
afterAll(async()=>{await Promise.all([new Promise(r=>gateway.close(r)),new Promise(r=>backend.close(r))]);});
it('covers native methods while rejecting arbitrary worker routes and encoded path traversal',()=>{
  for (const [method,path] of [['GET','/state'],['POST','/workflows/wf/review'],['PUT','/llm'],['PATCH','/leads/xhs%3A123'],['DELETE','/drafts/123'],['POST','/drafts/123/publish'],['POST','/media/video'],['GET','/media/remote'],['GET','/drafts/123/bundle']]) expect(openFindRoute(method,path),path).toBe(true);
  for(const [method,path] of [['GET','/drafts/123/publish'],['GET','/config'],['GET','//evil.test'],['GET','/../store'],['POST','/notes/a%2fb/detail'],['POST','/notes/a%5cb/detail'],['GET','/media/.credential-key'],['POST','/export/accounts'],['DELETE','/state']]) expect(openFindRoute(method,path),path).toBe(false);
});
it('streams binary exports and uses private authorization without forwarding sessions or cookies',async()=>{
  const response=await fetch(origin+'/export/notes?format=csv',{headers:{cookie:'harta_sid=private-session',authorization:'evil',origin:'https://evil.test'}});
  expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([0,255,1,128]);expect(response.headers.get('cache-control')).toBe('no-store');expect(response.headers.get('set-cookie')).toBeNull();
  expect(seen.path).toBe('/api/export/notes?format=csv');expect(seen.headers.authorization).toBe('Bearer private-token');expect(seen.headers.cookie).toBeUndefined();expect(seen.headers.origin).toBeUndefined();
});
it('preserves multipart video bytes and range previews with size limits',async()=>{
  const body=Buffer.from('--boundary\r\nContent-Disposition: form-data; name="file"; filename="test.mp4"\r\nContent-Type: video/mp4\r\n\r\n\x00\xff\x10\r\n--boundary--\r\n','latin1');
  expect((await fetch(origin+'/media/video',{method:'POST',headers:{'content-type':'multipart/form-data; boundary=boundary'},body})).status).toBe(200);
  expect(seen.body.equals(body)).toBe(true);expect(seen.headers['content-type']).toContain('boundary=boundary');
  const ranged=await fetch(origin+'/media/abc.mp4',{headers:{range:'bytes=1-3'}});expect(ranged.status).toBe(206);expect(ranged.headers.get('content-range')).toBe('bytes 1-3/10');expect(seen.headers.range).toBe('bytes=1-3');
});
it('only exposes recorded platform media and upgrades legacy HTTP links to TLS',()=>{
  const cdn='https://sns-webpic-qc.xhscdn.com/public/cover.webp?sign=123';
  expect(platformMediaUrl(cdn.replace('https:','http:'))).toBe(cdn);
  expect(storedMediaUrl(cdn,[{cover:cdn.replace('https:','http:')}])).toBe(cdn);
  expect(storedMediaUrl(cdn,[])).toBe('');expect(storedMediaUrl(cdn,[],[{images:[cdn]}])).toBe(cdn);
  for (const url of ['http://127.0.0.1/secret','https://evil.test/x','https://xhscdn.com.evil.test/x','https://secret@xhscdn.com/x','https://xhscdn.com:444/x','file:///etc/passwd','data:image/svg+xml,evil']) expect(platformMediaUrl(url)).toBe('');
});
it('every upstream API route remains reachable through the explicit business bridge',async()=>{
  const fs=await import('node:fs');
  const source=fs.readFileSync(new URL('../vendor/openfind/server/index.ts',import.meta.url),'utf8') + fs.readFileSync(new URL('../vendor/openfind/server/sales.ts',import.meta.url),'utf8').replaceAll("router.","app.").replaceAll("('/","('/api/");
  const routes=[...source.matchAll(/app\.(get|post|put|patch|delete|all)\(\s*'\/api([^']*)'/g)];
  expect(routes.length).toBeGreaterThan(35);
  for(const [,verb,template]of routes){
    const path=template.replace(':platform','douyin').replace(':id','fixture').replace(':file','abc.mp4').replace(':kind','notes').replace(':action','resume');
    for(const method of verb==='all'?['GET','POST']:[verb.toUpperCase()]) expect(openFindRoute(method,path),`${method} ${template}`).toBe(true);
  }
});
