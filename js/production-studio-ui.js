const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const modes = {video:'短视频',image:'图文',live:'直播场次',article:'公众号长文'};
const panels = {script:'脚本编辑',cover:'封面与图文',delivery:'检查与交付'};
const packForms = {guide:'教程 / 清单',voice:'人设 / 故事',image:'图文',video:'视频',live:'直播',article:'文章'};
const bodyText = (fields,mode) => mode==='live'
  ? ['liveOpen','liveSegments','liveInteraction','liveOffer','liveClose'].map(k=>fields[k]).filter(Boolean).join('\n\n')
  : fields.script || '';

// Real draft text and generated images only. This is a reading preview, not a
// simulated platform post, publication receipt or generated video.
export function productionStudio(o) {
  const id='production-'+encodeURIComponent(o.key),active=Object.hasOwn(panels,o.panel)?o.panel:'script';
  return `<div class="post-growth production-studio" data-production-mode="${esc(o.mode)}" ${o.attributes}>
    <details data-production-editor ${o.open?'open':''}>
      <summary>脚本、直播与封面制作</summary>
      <header class="production-studio-head">
        <div><span class="production-context">${esc(o.platform)}</span><h3>作品制作</h3></div>
        <div class="production-save-state"><span data-production-save-state>${o.changed?'有未保存修改':o.version?`已保存草稿 v${o.version}`:'尚未保存'}</span><button type="button" class="btn" data-growth-action="production-save" data-version="${o.version}">保存草稿</button></div>
      </header>
      ${o.review}${o.stale?'<p class="cm-notice">原稿已更新，请对照后重新保存制作草稿。</p>':''}
      <div class="production-workspace-bar">
        <div class="production-tabs" role="tablist" aria-label="制作工作区">${Object.entries(panels).map(([key,label])=>`<button type="button" role="tab" id="${id}-tab-${key}" data-production-tab="${key}" aria-controls="${id}-${key}" aria-selected="${key===active}" tabindex="${key===active?0:-1}">${label}</button>`).join('')}</div>
        <label>内容任务<select name="production-job">${[['','未标注'],...Object.entries(o.jobs)].map(([value,label])=>`<option value="${esc(value)}" ${o.job===value?'selected':''}>${esc(label)}</option>`).join('')}</select></label><label>本篇打法<select name="production-playPackId">${[['','沿用业务设置'],['off','关闭打法'],...o.playPacks.map(p=>[p.id,[p.name,p.platform,packForms[p.form],o.jobs[p.job]].filter(Boolean).join(' · ')]),...(o.playPackId && o.playPackId!=='off' && !o.playPacks.some(p=>p.id===o.playPackId)?[[o.playPackId,'原选择已不可用，请重新选择']]:[])].map(([value,label])=>`<option value="${esc(value)}" ${o.playPackId===value?'selected':''}>${esc(label)}</option>`).join('')}</select></label><label>制作类型<select name="production-live">${Object.entries(modes).filter(([value])=>o.platform==='公众号'?value==='article':value!=='article').map(([value,label])=>`<option value="${value}" ${o.mode===value?'selected':''}>${label}</option>`).join('')}</select></label>
      </div>
      <div class="production-studio-grid">
        <div class="production-edit-area">${Object.keys(panels).map(key=>`<section class="production-panel" id="${id}-${key}" data-production-panel="${key}" role="tabpanel" aria-labelledby="${id}-tab-${key}" tabindex="0" ${active===key?'':'hidden'}>${o[key]}</section>`).join('')}</div>
        <aside class="production-preview" aria-label="当前制作草稿预览">
          <header><strong>草稿预览</strong><span data-production-preview-mode>${esc(modes[o.mode])}</span></header>
          <div class="production-preview-media"><img data-ai-cover-preview width="900" height="1200" alt="当前制作封面预览" ${o.previewCover?`src="${esc(o.previewCover)}"`:'hidden'}><div class="production-preview-empty"><span aria-hidden="true">▧</span><strong>封面待制作</strong><p>暂无图片。可在「封面与图文」生成或上传。</p></div></div>
          <a data-ai-cover-download class="btn ghost" download="harta-ai-cover.png" ${o.previewCover?`href="${esc(o.previewCover)}"`:'hidden'}>下载当前封面</a>
          <div class="production-preview-copy"><h4 data-production-preview-title>${esc(o.fields.title || '标题待填写')}</h4><p data-production-preview-body>${esc(bodyText(o.fields,o.mode) || '填写正文或生成脚本后，在这里查看当前草稿。')}</p></div>
          <footer>仅展示当前制作输入，尚未发布。</footer>
        </aside>
      </div>
      <p class="production-status" data-production-status role="status"></p>
      <details class="production-help"><summary>草稿保存与使用说明</summary><p>直播与图文 / 视频草稿分别保存。保存制作草稿不会修改内容库原稿；需要时在「检查与交付」中采用。业务或产品资料变更后，请重新核对事实与平台要求。</p></details>
    </details>
  </div>`;
}

export function showProductionPanel(box,active) {
  for(const tab of box.querySelectorAll('[data-production-tab]')){const selected=tab.dataset.productionTab===active;tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;}
  for(const panel of box.querySelectorAll('[data-production-panel]'))panel.hidden=panel.dataset.productionPanel!==active;
}

export function updateProductionPreview(box) {
  const title=box.querySelector?.('[data-production-preview-title]');if(!title)return;
  const read=name=>box.querySelector(`[name="production-${name}"]`)?.value || '';
  title.textContent=read('title')||'标题待填写';
  box.querySelector('[data-production-preview-body]').textContent=bodyText(Object.fromEntries(['script','liveOpen','liveSegments','liveInteraction','liveOffer','liveClose'].map(k=>[k,read(k)])),read('live'))||'填写正文或生成脚本后，在这里查看当前草稿。';
  box.querySelector('[data-production-preview-mode]').textContent=modes[read('live')]||'制作草稿';
  box.querySelector('[data-production-save-state]').textContent='有未保存修改';
}
