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
    for (const [label, value] of [['今日模型预留', usd(result.reservedCents)], ['今日调用尝试', `${result.calls} 次`], ['每日保护限额', usd(result.dailyLimitCents)]]) {
      const row = document.createElement('div'), dt = document.createElement('dt'), dd = document.createElement('dd');
      dt.textContent = label; dd.textContent = value; row.append(dt, dd); metrics.append(row);
    }
    host.append(metrics);
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
