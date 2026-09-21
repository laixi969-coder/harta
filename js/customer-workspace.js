let customerId='', active='content';
const titles={content:'内容',research:'需求研究',materials:'业务资料',overview:'全部待办'};
export function arrangeWorkspace(customer) {
  const root=document.getElementById('owned-today');
  if(!document.getElementById('workspace-nav')) {
    const nav=document.createElement('nav');nav.id='workspace-nav';nav.className='workspace-nav';nav.setAttribute('aria-label','客户工作区');
    root.prepend(nav);
    const panels={};
    for(const [key,label] of Object.entries(titles)) {
      const button=document.createElement('button');button.type='button';button.textContent=label;button.dataset.workspaceView=key;button.setAttribute('aria-controls','workspace-'+key);nav.append(button);
      const panel=document.createElement('div');panel.id='workspace-'+key;panel.className='workspace-panel';panels[key]=panel;root.append(panel);
      button.addEventListener('click',()=>{active=key;show();});
    }
    for(const node of [...root.children])if(node!==nav && !node.classList.contains('workspace-panel'))panels.content.append(node);
    for(const id of ['keyword-card','growth-card'])panels.research.append(document.getElementById(id));
    for(const id of ['material-record-card','acquisition-card'])panels.materials.append(document.getElementById(id));
    panels.overview.append(document.getElementById('desk-card'));
    // 全局待办移到独立入口，客户内容页只呈现当前业务。
    const actions=document.getElementById('go-today').parentElement;actions.classList.add('workspace-primary-actions');nav.before(actions);
    const gate=document.getElementById('hook-gate');const details=document.createElement('details');details.className='workspace-context';
    const summary=document.createElement('summary');summary.textContent='本批依据与适用条件';details.append(summary,gate);panels.content.prepend(details);
    const consolePanel=document.getElementById('content-console');
    const tools=document.createElement('details');tools.className='workspace-tools';
    const toolTitle=document.createElement('summary');toolTitle.textContent='筛选、排期与导出';tools.append(toolTitle);
    for(const node of [...consolePanel.children])if(!node.classList.contains('content-console-head'))tools.append(node);
    consolePanel.append(tools);
    const checks=document.getElementById('checks-card');
    const checkDetails=document.createElement('details');checkDetails.id='workspace-checks';checkDetails.className='workspace-context';
    const checkTitle=document.createElement('summary');checkTitle.textContent='查看发布前检查与风险提示';
    checks.before(checkDetails);checkDetails.append(checkTitle,checks);
    const history=document.getElementById('history');const archive=document.createElement('details');archive.className='workspace-history';
    const hs=document.createElement('summary');hs.textContent='查看历史批次';archive.append(hs,history);panels.content.prepend(archive);
  }
  if(customerId!==customer.id){customerId=customer.id;active='content';}
  let empty=document.getElementById('workspace-materials-empty');
  if(!empty){empty=document.createElement('p');empty.id='workspace-materials-empty';empty.className='meta';empty.textContent='这里保留已上传的业务资料与历史跟进记录。可从客户页面补充资料。';document.getElementById('workspace-materials').prepend(empty);}
  show();
}
function show(){
  for(const key of Object.keys(titles)){
    document.getElementById('workspace-'+key).hidden=key!==active;
    document.querySelector(`[data-workspace-view="${key}"]`).setAttribute('aria-pressed',String(key===active));
  }
}
export function arrangeContentReader(pack) {
  const target=document.getElementById('copies');
  const checkDetails=document.getElementById('workspace-checks');
  if(checkDetails)checkDetails.hidden=document.getElementById('checks-card').classList.contains('hidden');
  document.getElementById('content-reader-nav')?.remove();
  target.classList.remove('content-reader');
  document.getElementById('owned-today').classList.toggle('is-content-preview',pack?.tier==='今日');
  if(pack?.tier!=='今日')return;
  const groups=[...target.querySelectorAll('.sleeve')];if(!groups.length)return;
  target.classList.add('content-reader');
  const list=document.createElement('nav');list.id='content-reader-nav';list.setAttribute('aria-label','选择内容');target.prepend(list);
  const pane=target.querySelector('.sleeves');pane.classList.add('reader-paper');
  const select=index=>{
    groups.forEach((g,i)=>g.classList.toggle('reader-hidden',index!==-1 && i!==index));
    [...list.children].forEach((button,i)=>button.setAttribute('aria-pressed',String(i===index+1)));
  };
  const all=document.createElement('button');all.type='button';all.textContent='浏览全部内容';all.addEventListener('click',()=>select(-1));list.append(all);
  groups.forEach((g,i)=>{
    const button=document.createElement('button');button.type='button';
    const name=(g.querySelector('.sleeve-tab > span')?.textContent || `内容 ${i+1}`).replace(/^[一二三四五六七八九]/,'');
    const heading=document.createElement('strong');heading.textContent=name;
    const excerpt=document.createElement('span');excerpt.textContent=(g.querySelector('.line-text')?.textContent||'').slice(0,52);
    button.append(heading,excerpt);button.addEventListener('click',()=>select(i));list.append(button);
  });
  select(0);
  // 搜索/筛选时展开全部结果，避免匹配内容被单篇预览状态隐藏。
  const filters=document.querySelector('.content-filters');
  if(filters) {filters.oninput=()=>select(-1);filters.onchange=()=>select(-1);}
}
