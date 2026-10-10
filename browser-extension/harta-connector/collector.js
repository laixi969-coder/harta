// Runs in an isolated extension world. Reads rendered page content only.
// It never reads cookies, private API responses, passwords, or sends comments.
(() => {
  const text=el=>(el?.innerText||el?.textContent||'').trim();
  const visible=el=>Boolean(el?.getClientRects().length)&&getComputedStyle(el).visibility!=='hidden';
  const first=(el,queries)=>queries.flatMap(s=>[...el.querySelectorAll(s)]).find(n=>n.closest(selectors.item)===el);
  const platform=location.hostname.endsWith('douyin.com')?'抖音':location.hostname.endsWith('xiaohongshu.com')?'小红书':'';
  const selectors=platform==='抖音'?{
    item:'[data-e2e="comment-item"], [data-e2e="comment-list"] [data-comment-id]',
    body:['[data-e2e="comment-item-content"]','[data-e2e="comment-content"]'],
    author:['[data-e2e="comment-user-name"]','a[href*="/user/"]'],
    date:['[data-e2e="comment-item-time"]','[data-e2e="comment-time"]','time'],
    region:['[data-e2e="comment-item-ip"]','[data-e2e="comment-ip"]'],
    workRoot:'[data-e2e="user-post-list"], [data-e2e="user-post"]', profile:'a[href*="/user/"]', works:'a[href*="/video/"]'
  }:{
    item:'.comment-item, .parent-comment, .sub-comment',
    body:['.content .note-text','.content','.comment-content'],
    author:['.author-wrapper .name','.author .name','.name'],
    date:['.date','time'],region:['.location','.ip-location'],
    workRoot:'#userPostedFeeds, [data-testid="user-posted-feeds"]', profile:'a[href*="/user/profile/"]', works:'a[href*="/explore/"], a[href*="/discovery/item/"], a[href*="/user/profile/"]'
  };
  function safeLink(raw){try{const u=new URL(raw,location.href);if(u.protocol==='https:'&&u.hostname===location.hostname)return u.href;}catch{}return '';}
  function timestamp(raw){
    const absolute=raw.match(/(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})/);
    if(absolute){const t=new Date(`${absolute[1]}-${absolute[2].padStart(2,'0')}-${absolute[3].padStart(2,'0')}T00:00:00+08:00`);if(Number.isFinite(+t)&&+t<=Date.now())return t.toISOString();}
    return ''; // Relative and yearless dates remain unknown, never silently guessed.
  }
  function nodeId(el){return (el.getAttribute('data-comment-id')||el.getAttribute('data-id')||(el.id||'').replace(/^comment[-_]/,'' )).match(/^[a-zA-Z0-9_-]{5,200}$/)?.[0]||'';}
  function snapshot(kind,limit){
    const body=text(document.body);
    const challenge=[...document.querySelectorAll('[class*="captcha"],[id*="captcha"],[class*="verify-dialog"]')].some(visible);
    if(challenge)return {status:'challenge',rows:[],error:'平台要求验证，请在平台完成验证后重新读取'};
    if(!platform)return {status:'unsupported',rows:[],error:'当前仅支持抖音与小红书网页'};
    if(kind==='works'){
      const seen=new Set(),rows=[],root=document.querySelector(selectors.workRoot);
      if(!root)return {status:/扫码登录|登录后查看/.test(body)?'login_required':'unsupported',rows:[],error:'未识别到账号发布的作品列表。请打开主页的作品页签；不会把推荐或收藏作品归给目标账号。'};
      for(const a of root.querySelectorAll(selectors.works)){if(!visible(a))continue;let url=safeLink(a.href);if(!url)continue;if(platform==='小红书'){const u=new URL(url),m=u.pathname.match(/^\/user\/profile\/[^/]+\/([a-zA-Z0-9]+)\/?$/);if(m)u.pathname='/explore/'+m[1];else if(!/^\/(explore|discovery\/item)\//.test(u.pathname))continue;url=u.href;}const key=new URL(url).pathname;if(seen.has(key))continue;seen.add(key);rows.push({url,title:text(a.querySelector('[class*="title"]'))||a.getAttribute('title')||a.querySelector('img')?.alt||text(a).slice(0,300)});if(rows.length>=limit)break;}
      return {status:rows.length?'partial':'unsupported',rows,error:rows.length?'':'没有识别到作品，请确认已进入目标账号的作品列表并完成登录'};
    }
    const nodes=[...document.querySelectorAll(selectors.item)].filter(visible),rows=[],seen=new Set();
    for(const el of nodes){
      // Container selectors can overlap; retain only nodes owning their own body/author.
      const content=first(el,selectors.body),author=first(el,selectors.author),profile=first(el,[selectors.profile]);
      if(!content||!author||content.closest(selectors.item)!==el)continue;
      const value=text(content);if(!value)continue;
      const parent=el.parentElement?.closest(selectors.item),recordId=nodeId(el),publishedText=text(first(el,selectors.date)),authorUrl=safeLink(profile?.href),authorName=text(author);
      const key=recordId||[authorUrl,authorName,value,publishedText].join('|');if(seen.has(key))continue;seen.add(key);
      const region=text(first(el,selectors.region))||publishedText.match(/IP[属所在地：:\s]*([^\s·]+)/i)?.[1]||'';
      rows.push({recordId,text:value.slice(0,6000),authorName:authorName.slice(0,100),authorUrl,publishedText:publishedText.slice(0,100),publishedAt:timestamp(publishedText),ipRegion:region.replace(/^IP[属所在地：:\s]*/i,'').slice(0,100),parentRecordId:parent?nodeId(parent):'',isAuthorReply:/(^|\s)作者($|\s)/.test(text(first(el,['.author-tag','[data-e2e="comment-author-tag"]'])))});
      if(rows.length>=limit)break;
    }
    const login=(!rows.length)&&(/登录后(查看|查看更多|发表评论)|扫码登录|登录即可/.test(body));
    return {status:rows.length?'partial':login?'login_required':'unsupported',rows,error:rows.length?'':login?'请在平台完成登录后重试':'未识别到评论。请展开评论区；页面布局变化时需要更新连接器，不能将整页文字当作评论。'};
  }
  globalThis.hartaReadPage=async({kind,limit=50,scrollRounds=3})=>{
    const merged=new Map();let result;
    for(let n=0;n<=Math.min(scrollRounds,3);n++){
      result=snapshot(kind,limit);
      if(['challenge','login_required'].includes(result.status))return {...result,pageUrl:location.href};
      for(const row of result.rows){const key=kind==='works'?row.url:row.recordId||[row.authorUrl,row.authorName,row.text,row.publishedText].join('|');merged.set(key,row);}
      if(merged.size>=limit||n===scrollRounds)break;
      const item=kind==='comments'?document.querySelector(selectors.item):document.querySelector(selectors.works);
      let container=item?.parentElement;
      while(container&&container!==document.body&&!(container.scrollHeight>container.clientHeight+50&&/(auto|scroll)/.test(getComputedStyle(container).overflowY)))container=container.parentElement;
      if(container&&container!==document.body)container.scrollBy(0,Math.min(container.clientHeight,800));else window.scrollBy(0,600);
      await new Promise(r=>setTimeout(r,1200));
    }
    return {status:merged.size?'partial':result.status,rows:[...merged.values()].slice(0,limit),pageUrl:location.href,error:merged.size?'仅读取页面已加载内容；未展开的楼中楼、隐藏评论与后续分页不计入':result.error};
  };
})();
