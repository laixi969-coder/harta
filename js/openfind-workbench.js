import { acquisitionSection, isAcquisitionPage, hartaAcquisitionUrl } from './acquisition-route.js';
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export { nativeWorkCover, nativeWorkGallery } from './work-media.js';
const initialParams = new URLSearchParams(location.search);
let page = isAcquisitionPage(initialParams.get('acqPage')) ? initialParams.get('acqPage') : 'discover', routeParams = Object.fromEntries(['note','lead','job','platform','workflow'].filter(key=>initialParams.has(key)).map(key=>[key,initialParams.get(key)])), context, dirty = false;
export const acquisitionActiveSection = () => acquisitionSection(page);
export function canLeaveAcquisition() {
  if(!dirty) return true;
  if(!window.confirm('有未保存的修改，放弃并继续？')) return false;
  dirty = false; return true;
}
export function openAcquisitionPage(next = 'discover', params = {}) {
  if (!isAcquisitionPage(next) || !canLeaveAcquisition()) return;
  dirty = false; page = next; routeParams = params;
  context?.nav('openfind');
  const frame = document.querySelector('#cm-openfind iframe');
  frame?.contentWindow?.postMessage({type:'harta-acquisition-navigate',page,params,customerId:frame.dataset.customer}, location.origin);
  updateRoute(frame?.dataset.customer);
}
function updateRoute(customerId) {
  if (!customerId) return;
  history.replaceState(null, '', hartaAcquisitionUrl(new URLSearchParams({customerId,...routeParams}),page));
  document.querySelectorAll('[data-acq-page]').forEach(button => {
    const on = button.dataset.acqPage === page;
    button.classList.toggle('selected',on);
    if(on) button.setAttribute('aria-current','page'); else button.removeAttribute('aria-current');
  });
  const more = document.querySelector('.cm-acquisition-more');
  if (more) more.open = false;
}
export function installAcquisitionShell(ctx) {
  context = ctx;
  document.addEventListener('click',event => {
    const button = event.target.closest('[data-acq-page]');
    if(button) openAcquisitionPage(button.dataset.acqPage);
  });
  window.addEventListener('message',event => {
    const frame = document.querySelector('#cm-openfind iframe');
    if(event.origin !== location.origin || event.source !== frame?.contentWindow || event.data?.customerId !== frame.dataset.customer) return;
    if(event.data.type === 'harta-acquisition-ready') frame.contentWindow.postMessage({type:'harta-acquisition-navigate',page,params:routeParams,customerId:frame.dataset.customer},location.origin);
    if(event.data.type === 'harta-acquisition-native' && event.data.view === 'conversations') ctx.nav('conversations');
    if(event.data.type === 'harta-acquisition-dirty') dirty = Boolean(event.data.dirty);
    if(event.data.type === 'harta-acquisition-page' && isAcquisitionPage(event.data.page)) {
      page = event.data.page; routeParams = event.data.params || {};
      ctx.nav('openfind'); updateRoute(frame.dataset.customer);
    }
  });
}
export function resumeAcquisitionRoute() {
  const params = initialParams, requested = params.get('acqPage');
  if(!isAcquisitionPage(requested)) return;
  const id = params.get('customerId');
  if(id && context.getWorkspace().customers.some(c=>c.id===id)) context.setBusiness(id);
  const values = Object.fromEntries(['note','lead','job','platform','workflow'].filter(key=>params.has(key)).map(key=>[key,params.get(key)]));
  if(requested === 'followup' && !values.lead) { context.nav('conversations'); return; }
  openAcquisitionPage(requested,values);
}
export function mountOpenFindWorkbench(business, customers) {
  const host = document.getElementById('cm-openfind'); if (!host) return;
  if (!business) { host.innerHTML = '<div class="ui-empty"><h2 class="ui-empty-title">先添加业务</h2><div class="ui-empty-actions"><button class="btn" type="button" data-cm="new-business">添加业务</button></div></div>'; return; }
  let frame = host.querySelector('iframe');
  if(host.closest('[data-view]').classList.contains('hidden')) return;
  if (frame?.dataset.customer !== business.id) {
    dirty = false;
    if(frame) routeParams = {};
    const params = new URLSearchParams({customerId:business.id,...routeParams});
    host.innerHTML = `<header class="cm-openfind-heading"><h1>主动获客</h1><label>业务<select data-cm-business aria-label="当前业务"></select></label><details class="cm-acquisition-more"><summary class="btn ghost">更多操作</summary><div>${[['acquisition','批量采集'],['history','任务记录'],['inbox','平台私信'],['settings','平台账号']].map(([id,label])=>`<button type="button" class="btn ghost" data-acq-page="${id}">${label}</button>`).join('')}<button type="button" class="btn ghost" data-cm="go-prospecting-archive">历史资料与目标账号</button></div></details></header><nav class="cm-acquisition-flow" aria-label="主动获客流程">${[['discover','找作品'],['comments','看评论'],['leads','核实线索']].map(([id,label])=>`<button type="button" class="btn ghost" data-acq-page="${id}">${label}</button>`).join('')}<button type="button" class="btn ghost" data-cm="go-conversations">客户跟进 →</button></nav>`;
    frame = document.createElement('iframe');
    frame.title = '获客内容'; frame.dataset.customer = business.id;
    frame.allow = 'clipboard-write'; frame.loading = 'eager';
    frame.addEventListener('load',()=>frame.contentWindow?.postMessage({type:'harta-acquisition-navigate',page,params:routeParams,customerId:business.id},location.origin));
    frame.src = '/openfind?' + params;
    host.append(frame);
    updateRoute(business.id);
  }
  const select = host.querySelector('select'), signature = JSON.stringify(customers.map(c => [c.id,c.name]));
  if (select.dataset.signature !== signature) { select.innerHTML = customers.map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join(''); select.dataset.signature = signature; }
  select.value = business.id;
  const heading = host.querySelector('h1');
  heading.textContent = page === 'studio' ? '作品草稿' : page === 'followup' ? '沟通记录' : page === 'settings' ? '平台账号' : page === 'inbox' ? '平台私信' : '主动获客';
  host.querySelector('.cm-acquisition-flow').hidden = ['studio','followup','settings','inbox'].includes(page);
  host.querySelectorAll('[data-acq-page]').forEach(button => { const on=button.dataset.acqPage===page;button.classList.toggle('selected',on);if(on)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current'); });
}
