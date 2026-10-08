const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function renderRecommendation(pack, platform, index) {
  const reason = pack.execution?.[index]?.reason;
  const manuallyEdited = Object.keys(pack.edits || {}).some(key => key.startsWith(`${platform}|${index}|`));
  if (!pack.creationPlan || !reason || manuallyEdited) return '';
  return `<p class="meta content-recommendation"><b>${index === 0 ? '建议先发' : '推荐理由'}：</b>${esc(reason)}</p>`;
}

export function renderMaterialSuggestion(pack) {
  const request = pack.creationPlan?.materialRequest;
  return request ? `<details class="content-brief"><summary>让下一批更具体（选填）</summary><p>${esc(request)}</p><p class="meta">可在客户资料中补充；不补充也可以继续生成。</p></details>` : '';
}

export function renderCreationPlan(pack) {
  const plan = pack.creationPlan;
  if (!plan) return '';
  const decision = new Map([...(plan.selected || []).map(row => [row.candidateId, { ...row, selected: true }]), ...(plan.rejected || []).map(row => [row.candidateId, row])]);
  return `<details><summary>本批如何挑选创意</summary><p class="meta">这是生成时的筛选快照；后续编辑或改写不会改动它。模型判断不等于实际传播结果。</p>${(plan.candidates || []).map(candidate => {
    const row = decision.get(candidate.id);
    return `<p><b>${esc(row?.selected ? '入选' : '未选')} · ${esc(candidate.angle)}</b><br>${esc(candidate.payoff)}<br><span class="meta">${esc(row?.reason)}</span></p>`;
  }).join('')}<details><summary>采用的业务素材摘录</summary>${(plan.assets || []).map(asset => `<p>${esc(asset.quote)}<br><span class="meta">${esc(asset.sourceLabel)} · ${esc(asset.use)}</span></p>`).join('') || '<p class="meta">未提取到可用的独有素材，本批使用一般建议与已有研究。</p>'}<p class="meta">摘录仅核对原文存在，不代表独立事实认证。</p></details></details>`;
}
