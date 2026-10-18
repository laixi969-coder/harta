// One Harta shell owns navigation; feature pages stay scoped to the current business.
export const ACQUISITION_PAGES = ['discover','comments','leads','acquisition','history','studio','settings','inbox','followup'];
export const isAcquisitionPage = page => ACQUISITION_PAGES.includes(page);
export function acquisitionSection(page) {
  return page === 'studio' ? 'content-home' : ['followup','inbox'].includes(page) ? 'conversations' : page === 'settings' ? 'connections' : 'prospecting';
}
export function hartaAcquisitionUrl(search, page = 'discover') {
  const source = new URLSearchParams(search), params = new URLSearchParams();
  params.set('view', 'prospecting');
  params.set('acqPage', isAcquisitionPage(page) ? page : 'discover');
  for (const key of ['customerId','note','lead','job','platform','workflow']) if (source.get(key)) params.set(key, source.get(key));
  return '/?' + params;
}
