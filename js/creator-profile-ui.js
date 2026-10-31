import { PROFILE_FIELDS, evaluateCreatorProfile } from './creator-profile.js';
const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
export function profileAssessmentHtml(fields, adopted) {
  const report=evaluateCreatorProfile(fields,adopted);
  return `<p>当前填写 ${report.filled} / ${report.total} 项；已采用 ${report.adopted} 项。只检查资料覆盖，不代表事实可信度或获客效果。</p>${report.rows.map(row=>`<p><strong>${esc(row.label)} · ${row.status}</strong><br>${esc(row.suggestion)}</p>`).join('')}`;
}
export function renderCreatorProfile(customer,pending={}) {
  const current=customer.creatorProfile || {version:0,fields:{}},draft=customer.creatorProfileDraft || {version:0,fields:{}};
  const fields=Object.fromEntries(Object.keys(PROFILE_FIELDS).map(key=>[key,pending[`profile-${key}`] ?? draft.fields[key] ?? current.fields[key] ?? '']));
  const basis=pending.__profileBasis || {version:current.version,draftVersion:draft.version};
  const report=evaluateCreatorProfile(fields,current.fields);
  const stale=basis.version!==current.version || basis.draftVersion!==draft.version;
  const attrs=`data-version="${basis.version}" data-draft-version="${basis.draftVersion}"`;
  return `<details data-creator-profile ${attrs}><summary>创作者资料 · v${current.version}</summary>
    <p class="meta">草稿与已采用资料分开保存。只有采用后的资料用于创作；经历仍须有业务资料支持。整批采用会同时应用清空项。</p>
    ${draft.updatedAt?`<p class="meta">草稿保存于 ${esc(draft.updatedAt)}</p>`:''}${stale?'<p role="alert">资料或草稿已更新，你的输入仍保留；请复制需要保留的内容，再重新载入已保存资料。</p>':''}
    <button type="button" class="btn ghost" data-growth-action="profile-evaluate">评估当前资料</button><div data-profile-assessment role="status"></div>
    <div class="creator-profile-fields">${report.rows.map(row=>`<section data-profile-field="${row.key}" data-profile-active="${esc(row.active)}"><label>${esc(row.label)}<textarea name="profile-${row.key}" maxlength="2000" rows="2">${esc(fields[row.key])}</textarea></label><p class="meta" data-profile-field-status>${row.status}</p><p class="meta">${esc(row.suggestion)}</p><details><summary>当前用于创作的内容</summary><p class="asis">${esc(row.active || '尚未采用此项')}</p></details><button type="button" class="btn ghost" data-growth-action="profile-adopt-field" data-profile-key="${row.key}" ${attrs}>采用此项</button>${row.active?`<button type="button" class="textish" data-growth-action="profile-clear-field" data-profile-key="${row.key}" ${attrs}>撤回此项</button>`:''}</section>`).join('')}</div>
    <div class="acts"><button type="button" class="btn ghost" data-growth-action="profile-save-draft" ${attrs}>仅保存草稿</button><button type="button" class="btn" data-growth-action="profile" ${attrs}>保存并采用全部</button><button type="button" class="textish" data-growth-action="profile-reload">重新载入已保存资料</button></div>
    <p data-profile-status role="status"></p>
    ${customer.creatorProfileHistory?.length?`<details><summary>历史版本</summary>${[...customer.creatorProfileHistory].reverse().map(s=>`<p>v${s.version} · ${esc(s.updatedAt || '初始版本')}<br>${Object.entries(s.fields || {}).map(([k,v])=>`${esc(PROFILE_FIELDS[k] || k)}：${esc(v)}`).join('<br>')}</p>`).join('')}</details>`:''}
  </details>`;
}
