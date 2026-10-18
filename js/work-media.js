const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const positions = new Map(), modes = new Map();
let context, dialog, invoker, selectedWork = '', signature = '', installed = false, refreshing = false;
const key = work => work.customerId + ':' + work.id;
export const workImages = work => [...new Set((work.images?.length ? work.images : work.cover ? [work.cover] : []).filter(url=>typeof url==='string' && url))];
export function nativeMediaUrl(work, url) {
  const asset = url === work.videoUrl ? 'video' : url === work.cover ? 'cover' : 'image';
  const index = asset === 'image' ? work.images?.indexOf(url) : 0;
  return '/api/openfind/media/' + encodeURIComponent(work.customerId) + '/' + encodeURIComponent(work.id) + '?asset=' + asset + '&index=' + (index || 0) + '&v=' + encodeURIComponent(work.importedAt || work.updatedAt || '');
}
const image = (work,url,alt) => url ? `<img src="${esc(nativeMediaUrl(work,url))}" alt="${esc(alt)}" loading="lazy" decoding="async">` : '<span class="cm-cover-empty" role="img" aria-label="暂无图片">暂无图片</span>';
export function nativeWorkCover(work) {
  const images=workImages(work),cover=work.cover || images[0];
  return `<button type="button" class="cm-work-cover" data-native-preview="${esc(work.id)}" aria-label="查看作品：${esc(work.title)}">${image(work,cover,work.title)}<span class="cm-cover-type">${work.type==='video'?'▷ 视频':images.length?images.length+' 张图片':'图文'}</span><span class="cm-cover-hint">查看作品</span></button>`;
}
export function nativeWorkGallery(work, { preview = false } = {}) {
  const images=workImages(work),current=Math.min(positions.get(key(work)) || 0,Math.max(0,images.length-1));
  const hasVideo=work.type==='video' && Boolean(work.videoUrl);
  const video=hasVideo && modes.get(key(work))!=='images';
  const attrs=`data-work="${esc(work.id)}"`;
  return `<section class="cm-media-gallery" data-native-gallery="${esc(work.id)}" data-preview="${preview}" aria-label="作品图片与视频">
    <div class="cm-gallery-stage">${video?`<video controls playsinline preload="none" poster="${esc(work.cover?nativeMediaUrl(work,work.cover):'')}" src="${esc(nativeMediaUrl(work,work.videoUrl))}" aria-label="${esc(work.title)}"></video>`:`<button type="button" class="cm-gallery-open" ${preview?'data-native-zoom':'data-native-preview="'+esc(work.id)+'"'} aria-label="${preview?'放大或还原图片':'放大图片 '+(current+1)}">${image(work,images[current],work.title+' · 图片 '+(current+1))}</button>`}</div>
    ${images.length>1 || hasVideo?`<div class="cm-gallery-controls">${hasVideo?`<button type="button" class="btn ghost" data-native-video ${attrs}>${video?'查看图片':'播放视频'}</button>`:''}<button type="button" class="btn ghost" data-native-step="-1" ${attrs} aria-label="上一张图片" ${current===0?'disabled':''}>←</button><span role="status" aria-live="polite">${video?'视频':(images.length?current+1:0)+' / '+images.length}</span><button type="button" class="btn ghost" data-native-step="1" ${attrs} aria-label="下一张图片" ${current>=images.length-1?'disabled':''}>→</button></div>`:''}
    ${images.length>1?`<div class="cm-gallery-thumbs" aria-label="选择作品图片">${images.map((url,i)=>`<button type="button" ${attrs} data-native-index="${i}" aria-label="查看图片 ${i+1}" aria-pressed="${!video&&i===current}">${image(work,url,'缩略图 '+(i+1))}</button>`).join('')}</div>`:''}
    ${work.type==='video'&&!work.videoUrl?'<p class="meta">平台暂未提供可播放的视频地址，当前展示封面；可刷新完整作品或打开原作品。</p>':''}
  </section>`;
}
function currentWork(id) { return context?.getWorks().find(w=>w.id===id); }
function closePreview() { dialog?.close(); }
function updatePreview(force=false) {
  if(!dialog?.open)return;
  const work=currentWork(selectedWork);if(!work){closePreview();return;}
  const next=JSON.stringify(work);if(!force&&signature===next)return;signature=next;
  const metrics=work.metrics || {}, format=n=>Number.isFinite(n)?n.toLocaleString('zh-CN'):'未提供';
  const date=work.publishedAt?new Date(work.publishedAt).toLocaleString('zh-CN'):'原始发表时间待核实';
  const focusedLabel=dialog.contains(document.activeElement)?document.activeElement.getAttribute('aria-label'):'';
  dialog.innerHTML=`<header class="cm-preview-heading"><div><p class="cm-eyebrow">${esc(work.platform)} · ${work.type==='video'?'视频':'图文'}</p><h2>作品详情</h2></div><button type="button" class="btn ghost" data-native-close aria-label="关闭作品详情">关闭 ×</button></header><div class="cm-preview-layout">${nativeWorkGallery(work,{preview:true})}<section class="cm-preview-content"><h3>${esc(work.title)}</h3><p class="meta">${esc(work.authorName || '作者未提供')} · ${esc(date)}</p><div class="cm-work-stats"><span>点赞 <b>${format(metrics.likes)}</b></span><span>评论 <b>${format(metrics.comments)}</b></span><span>收藏 <b>${format(metrics.saves)}</b></span></div><p class="cm-work-body">${esc(work.description || (work.detailState==='complete'?'该作品没有正文':'当前为搜索摘要，读取完整作品可补充正文与图片。'))}</p><div class="cm-work-tags">${(work.tags||[]).map(t=>`<span>#${esc(t)}</span>`).join('')}</div><p class="meta">${work.detailState==='complete'?'已读取完整详情':'当前为已保存摘要'} · 图片与正文来自平台已读取内容</p><p class="cm-error" data-native-error role="alert"></p><div class="acts"><button type="button" class="btn" data-native-refresh ${refreshing?'disabled':''}>${refreshing?'正在读取完整作品…':'刷新完整作品'}</button><button type="button" class="btn ghost" data-cm="open-source" data-id="${esc(work.id)}">查看原文与评论</button><button type="button" class="btn ghost" data-cm="reference-work" data-id="${esc(work.id)}">参考创作</button><a class="btn ghost" href="/openfind?customerId=${encodeURIComponent(work.customerId)}&note=${encodeURIComponent(work.openfindIds?.[0]||'')}#discover" target="_blank" rel="noopener">在获客工作区打开 ↗</a>${/^https:\/\//.test(work.url)?`<a class="btn ghost" href="${esc(work.url)}" target="_blank" rel="noopener">打开原作品 ↗</a>`:''}</div><p class="meta">← → 切换图片 · 点击大图放大 · Esc 关闭</p></section></div>`;
  if(focusedLabel){const target=[...dialog.querySelectorAll('[aria-label]')].find(el=>el.getAttribute('aria-label')===focusedLabel&&!el.disabled);(target||dialog.querySelector('[data-native-close]'))?.focus({preventScroll:true});}
}
function openPreview(work) {
  if(!work)return;
  if(!dialog){
    invoker=document.activeElement;
    dialog=document.createElement('dialog');dialog.className='cm-work-preview ui-modal';dialog.setAttribute('aria-label','作品详情');
    document.body.append(dialog);const oldOverflow=document.body.style.overflow;document.body.style.overflow='hidden';
    dialog.addEventListener('close',()=>{const id=selectedWork;dialog.remove();dialog=null;selectedWork='';document.body.style.overflow=oldOverflow;const target=invoker?.isConnected&&invoker.getClientRects().length?invoker:[...document.querySelectorAll('[data-native-preview]')].find(el=>el.dataset.nativePreview===id&&el.getClientRects().length);target?.focus({preventScroll:true});invoker=null;});
    let pressedOutside=false;
    dialog.addEventListener('pointerdown',event=>{const box=dialog.getBoundingClientRect();pressedOutside=event.target===dialog&&(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom);});
    dialog.addEventListener('click',event=>{if(event.target===dialog&&pressedOutside)closePreview();pressedOutside=false;});
    dialog.addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight'].includes(event.key) && !event.target.closest('input,textarea,select,video,[contenteditable=true]')){event.preventDefault();move(selectedWork,event.key==='ArrowLeft'?-1:1);}});
    dialog.showModal();
  }
  selectedWork=work.id;updatePreview(true);dialog.scrollTop=0;dialog.querySelector('[data-native-close]')?.focus();
  if(work.detailState!=='complete' && work.openfindIds?.length)void refreshPreview(work);
}
function move(id,step,index) {
  const work=currentWork(id);if(!work)return;
  const max=workImages(work).length-1;
  positions.set(key(work),Math.max(0,Math.min(max,index??(positions.get(key(work))||0)+step)));modes.set(key(work),'images');
  if(dialog?.open&&selectedWork===id)updatePreview(true);
  for(const gallery of document.querySelectorAll('[data-native-gallery]'))if(gallery.dataset.nativeGallery===id && gallery.dataset.preview!=='true')gallery.outerHTML=nativeWorkGallery(work);
}
async function refreshPreview(work) {
  if(!work||refreshing)return;
  const id=work.id;refreshing=true;updatePreview(true);
  try{await context.refresh(work);}
  catch(error){if(dialog?.open&&selectedWork===id)dialog.querySelector('[data-native-error]').textContent=error.message;}
  finally{refreshing=false;if(dialog?.open){const error=dialog.querySelector('[data-native-error]')?.textContent;updatePreview(true);dialog.querySelector('[data-native-error]').textContent=error||'';}}
}
export function refreshNativeWorkPreview() { updatePreview(); }
export function initNativeWorkMedia(value) {
  context=value;if(installed)return;installed=true;
  document.body.addEventListener('click',async event=>{
    const button=event.target.closest('button');if(!button)return;
    if(button.hasAttribute('data-native-preview'))openPreview(currentWork(button.dataset.nativePreview));
    if(button.hasAttribute('data-native-close'))closePreview();
    if(button.hasAttribute('data-native-zoom'))button.closest('.cm-gallery-stage')?.classList.toggle('zoomed');
    if(button.hasAttribute('data-native-step'))move(button.dataset.work,Number(button.dataset.nativeStep));
    if(button.hasAttribute('data-native-index'))move(button.dataset.work,0,Number(button.dataset.nativeIndex));
    if(button.hasAttribute('data-native-video')){const work=currentWork(button.dataset.work);if(work){modes.set(key(work),modes.get(key(work))==='images'?'video':'images');if(dialog?.open)updatePreview(true);else for(const gallery of document.querySelectorAll('[data-native-gallery]'))if(gallery.dataset.nativeGallery===work.id)gallery.outerHTML=nativeWorkGallery(work);}}
    if(dialog?.open && button.hasAttribute('data-cm'))closePreview();
    if(button.hasAttribute('data-native-refresh'))void refreshPreview(currentWork(selectedWork));
  });
  document.addEventListener('error',event=>{
    const target=event.target;
    if(target instanceof HTMLVideoElement && target.closest('[data-native-gallery]')){const work=currentWork(target.closest('[data-native-gallery]').dataset.nativeGallery);const fallback=document.createElement('div');fallback.className='cm-video-unavailable';fallback.innerHTML=(work?image(work,work.cover,work.title):'')+'<p class="meta" role="alert">视频暂不可用，请刷新完整作品或打开原作品。</p>';target.replaceWith(fallback);return;}
    if(!(target instanceof HTMLImageElement)||!target.closest('.cm-work-cover,.cm-media-gallery'))return;
    const fallback=document.createElement('span');fallback.className='cm-cover-empty';fallback.setAttribute('role','img');fallback.setAttribute('aria-label',target.alt+' · 图片暂不可用');fallback.textContent='图片暂不可用 · 刷新完整作品后重试';target.replaceWith(fallback);
  },true);
}
