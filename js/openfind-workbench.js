const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export { nativeWorkCover, nativeWorkGallery } from './work-media.js';
export function mountOpenFindWorkbench(business, customers) {
  const host = document.getElementById('cm-openfind'); if (!host) return;
  if (!business) { host.innerHTML = '<div class="ui-empty"><h2 class="ui-empty-title">先添加业务</h2><p class="ui-empty-description">保存业务资料后开始搜索与采集。</p><div class="ui-empty-actions"><button class="btn" type="button" data-cm="new-business">添加业务</button></div></div>'; return; }
  // Keep the original app mounted across Harta background refreshes and navigation.
  let frame = host.querySelector('iframe');
  if (frame?.dataset.customer !== business.id) {
    const url = '/openfind?customerId=' + encodeURIComponent(business.id);
    host.innerHTML = `<header class="cm-openfind-heading"><label>当前业务<select data-cm-business aria-label="获客工作区当前业务"></select></label><a class="btn ghost" href="${esc(url)}" target="_blank" rel="noopener">全屏打开工作台 ↗</a></header><iframe title="Harta 获客工作区" data-customer="${esc(business.id)}" src="${esc(url)}" loading="lazy" allow="clipboard-write"></iframe>`;
    frame = host.querySelector('iframe');
  }
  const select = host.querySelector('select');
  const signature = JSON.stringify(customers.map(c => [c.id,c.name]));
  if (select.dataset.signature !== signature) { select.innerHTML = customers.map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join(''); select.dataset.signature = signature; }
  select.value = business.id;
}
