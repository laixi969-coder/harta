import { PLANS, monthlyEstimate, openingChecklist, formatCny } from './pricing-model.js';

const form = document.querySelector('#pricing-estimate-form');
const select = form.elements.plan;
const error = document.querySelector('#pricing-error');
const status = document.querySelector('#pricing-status');
const actions = [...document.querySelectorAll('.pricing-summary-actions button')];
let estimate;
function update() {
  try {
    estimate = monthlyEstimate(select.value, Object.fromEntries(new FormData(form)));
    error.textContent = '';
    document.querySelector('#pricing-total').textContent = formatCny(estimate.totalCents);
    document.querySelector('#pricing-service').textContent = formatCny(estimate.serviceCents);
    document.querySelector('#pricing-resource').textContent = formatCny(estimate.resourceCents);
    actions.forEach(button => button.disabled = false);
  } catch (err) {
    estimate = null;
    error.textContent = err.message;
    for (const id of ['pricing-total', 'pricing-service', 'pricing-resource']) document.getElementById(id).textContent = '—';
    actions.forEach(button => button.disabled = true);
  }
  status.textContent = '将清单交给账号管理员确认；生成清单不会扣款或开通。';
}
const initial = new URLSearchParams(location.search).get('plan');
if (PLANS.some(plan => plan.id === initial)) select.value = initial;
form.addEventListener('submit', event => event.preventDefault());
form.addEventListener('input', update);
form.addEventListener('change', update);
document.querySelectorAll('[data-plan]').forEach(link => link.addEventListener('click', () => {
  select.value = link.dataset.plan;
  update();
  select.focus({ preventScroll: true });
}));
document.querySelector('#copy-pricing').addEventListener('click', async () => {
  if (!estimate) return;
  try { await navigator.clipboard.writeText(openingChecklist(estimate)); status.textContent = '已复制开通清单；请交给账号管理员确认。'; }
  catch { status.textContent = '无法复制，请使用“下载清单”。'; }
});
document.querySelector('#download-pricing').addEventListener('click', () => {
  if (!estimate) return;
  const url = URL.createObjectURL(new Blob([openingChecklist(estimate)], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = `Harta-${estimate.plan.id}-开通清单.txt`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  status.textContent = '已生成开通清单；尚未提交订单或开通。';
});
update();
