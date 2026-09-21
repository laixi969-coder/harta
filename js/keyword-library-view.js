const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const keywordSearchText = (row, scope) => [row.keyword,row.category,row.brand,row.intent,scope.name].join(' ').toLowerCase();
// 每批仅挂载摘要，展开后才创建行；输入只更新可见行，不重建整批资料。
export function keywordLibraryView(target, status, batches, customerId) {
  target.replaceChildren();
  const entries = batches.map(batch => {
    const detail = document.createElement('details'); detail.className='keyword-batch';
    const summary = document.createElement('summary'); detail.append(summary);
    const content = document.createElement('div'); detail.append(content);
    const entry={batch,detail,summary,content,query:'',nodes:new Map(),search:batch.items.map(row=>keywordSearchText(row,batch.scope))};
    const title=`${batch.scope.type} · ${batch.scope.name} · ${batch.items.length} 个词`;
    function paint() {
      const matches=batch.items.filter((_,i)=>entry.search[i].includes(entry.query));
      summary.textContent=title+(entry.query?` · 匹配${matches.length}个`:'');
      if(!detail.open)return matches.length;
      if(!entry.body) {
        content.innerHTML=`<p class="meta">${esc(batch.sources.join('、'))} · ${esc(new Date(batch.createdAt).toLocaleDateString())} · 合并${batch.duplicateCount}条重复记录</p>
          <p>${esc(Object.entries(batch.summary).map(([k,v])=>`${k} ${v}`).join(' · '))}</p>
          <p class="meta">分类为规则推断；语义分组覆盖 ${batch.analysis?.analyzedCount||0}/${batch.items.length} 个词，其余仍参与研究。</p>
          ${[...(batch.warnings||[]),batch.analysis?.warning].filter(Boolean).map(w=>`<p class="meta">${esc(w)}</p>`).join('')}
          <details class="keyword-topics"><summary>查看需求主题</summary>${(batch.analysis?.groups||[]).map(g=>`<p><b>${esc(g.topic)}</b> · ${esc(g.scenario)}<br>${esc(g.angle)} <span class="meta">（模型建议）</span></p>`).join('')}</details>
          <div class="keyword-table" role="region" tabindex="0" aria-label="${esc(batch.scope.name)}关键词明细"><table><caption class="meta">需求词与原始来源；来源可展开查看</caption><thead><tr><th scope="col">关键词</th><th scope="col">品类 / 品牌</th><th scope="col">意图 / 阶段</th><th scope="col">拆解</th><th scope="col">原始数据与来源</th></tr></thead><tbody></tbody></table></div>
          <p class="meta keyword-count"></p><div class="acts"><a class="btn ghost" href="/api/keywords/export?customerId=${encodeURIComponent(customerId)}&amp;batchId=${encodeURIComponent(batch.id)}" download>导出整理结果</a><button class="btn ghost" type="button" data-remove-keywords="${esc(batch.id)}">移除此批</button></div>`;
        entry.body=content.querySelector('tbody');
      }
      const shown=matches.slice(0,100);
      const nodes=shown.map(row=>{
        if(!entry.nodes.has(row.id)) {
          const tr=document.createElement('tr');
          tr.innerHTML=`<th scope="row" data-label="关键词">${esc(row.keyword)}</th><td data-label="品类 / 品牌">${esc([row.category,row.brand].filter(Boolean).join(' / ')||batch.scope.name)}</td><td data-label="意图 / 阶段">${esc(row.intent)} / ${esc(row.stage)}</td><td data-label="拆解">${esc(row.modifiers.join('、')||'基础需求词')}</td><td data-label="来源"><details><summary>查看原始数据</summary>${row.evidence.map(e=>`<p>${esc(e.file)} ${esc(e.sheet)} · 行${e.row}<br><span class="meta">${esc(e.fields.filter(f=>f.value).map(f=>`${f.name}：${f.value}`).join('；'))}</span></p>`).join('')}</details></td>`;
          entry.nodes.set(row.id,tr);
        }
        return entry.nodes.get(row.id);
      });
      entry.body.replaceChildren(...nodes);
      // 只保留当前100行，防止不同搜索逐步把整库留在内存中。
      const ids=new Set(shown.map(row=>row.id));for(const key of entry.nodes.keys())if(!ids.has(key))entry.nodes.delete(key);
      content.querySelector('.keyword-count').textContent=matches.length?`显示 ${shown.length}/${matches.length} 个词；导出包含本批全部词。`:'没有匹配的词，请换一个关键词。';
      return matches.length;
    }
    entry.paint=paint; detail.addEventListener('toggle',()=>paint()); paint();target.append(detail);return entry;
  });
  if(!batches.length)target.innerHTML='<p class="meta">还没有词库，可导入 5118 导出的表格或自己的关键词文档。</p>';
  return query=>{
    const value=query.trim().toLowerCase();let total=0;
    for(const entry of entries){entry.query=value;if(value)entry.detail.open=true;total+=entry.paint();}
    status.textContent=value?`找到 ${total} 个匹配词。每批最多展示100个。`:`共 ${batches.reduce((n,b)=>n+b.items.length,0)} 个词。`;
  };
}
