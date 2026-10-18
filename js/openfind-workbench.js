const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export { nativeWorkCover, nativeWorkGallery } from './work-media.js';
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
