// Isolated server fixture; production never imports this module.
const original=globalThis.fetch;
globalThis.fetch=async function(url,options){
 const u=new URL(typeof url==='string'?url:url.url||url.href);if(u.hostname!=='api.weixin.qq.com')return original(url,options);
 const body=JSON.parse(options.body||'{}');
 if(u.pathname==='/cgi-bin/stable_token')return Response.json(body.secret==='wrong-secret-value'?{errcode:40125,errmsg:'must not leak supplied secret'}:{access_token:'fixture-wechat-token',expires_in:7200});
 const source=u.pathname.includes('freepublish')?'published':'material',count=source==='published'?13:1;
 return Response.json({total_count:count,item:Array.from({length:Math.min(20,count-body.offset)},(_,i)=>{const n=body.offset+i;return {article_id:'published-'+n,media_id:'material-'+n,update_time:1780000000,content:{news_item:[{title:`${source==='published'?'厨房文章':'素材草稿'} ${n+1}`,content:'<p>先确认尺寸与收纳需求。</p><p>&lt;img src=x onerror=alert(1)&gt;</p><script>window.fixtureUnsafe=true</script>',url:'https://mp.weixin.qq.com/s/fixture-'+n,author:'公众号验收'}]}};})});
};
