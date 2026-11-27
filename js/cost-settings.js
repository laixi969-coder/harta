const usd = cents => new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'USD' }).format(cents / 100);
let loading = false;
export async function openCostSettings() {
  const host = document.querySelector('#account-costs-body');
  if (!host || loading) return;
  loading = true;
  host.textContent = '正在读取…';
  try {
    const response = await fetch('/api/costs');
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || '无法读取费用记录');
    host.replaceChildren();
    const metrics = document.createElement('dl'); metrics.className = 'account-costs-metrics';
    const measured=result.measuredUsage;
    const reported=measured?.attempts ? [
      ['供应商返回的输入 / 输出 Token', `${measured.inputTokens ?? '未返回'} / ${measured.outputTokens ?? '未返回'}`],
      ['用量覆盖', `${measured.outputReports} / ${measured.attempts} 次响应含输出用量`],
      ...(measured.pricedCalls ? [['按配置费率估算',`$${measured.estimatedUsd.toFixed(6)}（${measured.pricedCalls} 次）`]] : []),
    ] : [];
    for (const [label, value] of [['今日模型预留', usd(result.reservedCents)], ['今日调用尝试', `${result.calls} 次`], ['每日保护限额', usd(result.dailyLimitCents)],...reported]) {
      const row = document.createElement('div'), dt = document.createElement('dt'), dd = document.createElement('dd');
      dt.textContent = label; dd.textContent = value; row.append(dt, dd); metrics.append(row);
    }
    host.append(metrics);
    renderStatements(result.providerStatements || []);
    const reset = document.createElement('p'); reset.className = 'meta';
    reset.textContent = `本机时间 ${new Date(result.resetAt).toLocaleString('zh-CN')} 重置（UTC 零点）。`;
    host.append(reset);
    if (result.history.length) {
      const details = document.createElement('details'), summary = document.createElement('summary');
      summary.textContent = '最近 30 个有记录日'; details.append(summary);
      const list = document.createElement('ul'); list.className = 'account-costs-history';
      for (const row of result.history) {
        const item = document.createElement('li');
        item.textContent = `${row.day} UTC · ${usd(row.cents)} 预留 · ${row.calls} 次尝试`;
        list.append(item);
      }
      details.append(list); host.append(details);
    }
  } catch (error) { host.textContent = error.message || '无法读取费用记录，请稍后重试。'; }
  finally { loading = false; }
}
document.querySelector('#refresh-account-costs')?.addEventListener('click', openCostSettings);

const statementForm=document.getElementById('provider-statement-form');
let statementRevision=0;
function renderStatements(records) {
  const list=document.getElementById('provider-statement-list');
  if(!list || !statementForm)return;
  list.replaceChildren();
  for(const record of records){
    const row=document.createElement('p'),edit=document.createElement('button');
    const amount=new Intl.NumberFormat('zh-CN',{style:'currency',currency:record.currency}).format(record.cents/100);
    row.textContent=`${record.periodEnd} · ${record.provider} · ${record.reference} · ${amount} `;
    edit.type='button';edit.className='btn ghost';edit.textContent='更正';
    edit.addEventListener('click',()=>{
      for(const key of ['provider','reference','periodEnd','currency'])statementForm.elements[key].value=record[key];
      statementForm.elements.amount.value=(record.cents/100).toFixed(2);
      statementRevision=record.revision;
      statementForm.elements.provider.readOnly=statementForm.elements.reference.readOnly=true;
      statementForm.querySelector('[type=reset]').hidden=false;
      statementForm.elements.amount.focus();
    });
    row.append(edit);list.append(row);
  }
}
statementForm?.addEventListener('reset',()=>{
  statementRevision=0;
  statementForm.elements.provider.readOnly=statementForm.elements.reference.readOnly=false;
  statementForm.querySelector('[type=reset]').hidden=true;
});
statementForm?.addEventListener('submit',async event=>{
  event.preventDefault();
  const submit=statementForm.querySelector('[type=submit]'),status=statementForm.querySelector('[data-statement-status]');
  submit.disabled=true;
  try{
    const input={...Object.fromEntries(new FormData(statementForm)),baseRevision:statementRevision};
    const response=await fetch('/api/costs/statement',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input)});
    const result=await response.json();
    if(!response.ok)throw Error(result.error || '账单保存失败');
    statementForm.reset();await openCostSettings();status.textContent='账单记录已保存';
  }catch(error){status.textContent=error.message || '账单保存失败';}
  finally{submit.disabled=false;}
});
