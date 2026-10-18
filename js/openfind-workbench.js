const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const media = (work, url) => '/api/openfind/workbench/' + encodeURIComponent(work.customerId) + '/media/remote?url=' + encodeURIComponent(url);
export function nativeWorkCover(work) {
  return work.cover ? `<img class="cm-work-cover" src="${esc(media(work,work.cover))}" alt="${esc(work.title)}" loading="lazy" referrerpolicy="same-origin">` : '<div class="cm-work-cover cm-cover-empty" aria-label="暂无封面">暂无封面</div>';
}
export function nativeWorkGallery(work) {
  const images = work.images?.length ? work.images : work.cover ? [work.cover] : [];
  if (work.type === 'video' && work.videoUrl) return `<video class="cm-work-video" controls preload="none" poster="${esc(work.cover ? media(work, work.cover) : '')}" src="${esc(media(work, work.videoUrl))}" aria-label="${esc(work.title)}"></video>`;
  return images.length ? `<div class="cm-work-gallery" aria-label="作品图片">${images.map((url,i)=>`<a href="${esc(media(work,url))}" target="_blank" rel="noopener"><img src="${esc(media(work,url))}" alt="${esc(work.title)} · 图片 ${i+1}" loading="lazy"></a>`).join('')}</div>` : '';
}
export function mountOpenFindWorkbench(business, customers) {
  const host = document.getElementById('cm-openfind'); if (!host) return;
  if (!business) { host.innerHTML = '<p>请先在工作台添加业务，再打开 OpenFind。</p>'; return; }
  // Keep the original app mounted across Harta background refreshes and navigation.
  let frame = host.querySelector('iframe');
  if (frame?.dataset.customer !== business.id) {
    const url = '/openfind?customerId=' + encodeURIComponent(business.id);
    host.innerHTML = `<header class="cm-openfind-heading"><label>当前业务<select data-cm-business aria-label="OpenFind 当前业务"></select></label><a class="btn ghost" href="${esc(url)}" target="_blank" rel="noopener">全屏打开工作台 ↗</a></header><iframe title="OpenFind 完整工作台" data-customer="${esc(business.id)}" src="${esc(url)}" loading="lazy" allow="clipboard-write"></iframe>`;
    frame = host.querySelector('iframe');
  }
  const select = host.querySelector('select');
  const signature = JSON.stringify(customers.map(c => [c.id,c.name]));
  if (select.dataset.signature !== signature) { select.innerHTML = customers.map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join(''); select.dataset.signature = signature; }
  select.value = business.id;
}
document.addEventListener('error', event => {
  const image = event.target;
  if (image instanceof HTMLImageElement && image.matches('.cm-work-cover,.cm-work-gallery img')) {
    const fallback = document.createElement('span'); fallback.className = 'cm-cover-empty'; fallback.textContent = '图片暂不可用 · 可重新读取详情'; image.replaceWith(fallback);
  }
}, true);
