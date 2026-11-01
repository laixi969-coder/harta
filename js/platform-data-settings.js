// Native settings entry for the existing per-business acquisition adapters.
// API keys are never copied to application state or included in status text.
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let context,root,selected='',sequence=0,settings={},loading=0;
const names={xhs:'小红书',douyin:'抖音'};
const providers={xhs:[['tikhub','TikHub'],['redfox','RedFox']],douyin:[['browser','现有浏览器方式'],['tikhub','TikHub'],['redfox','RedFox'],['http','原有高级 HTTP 适配器']]};
const endpoint=(id,platform)=>`/api/openfind/workbench/${encodeURIComponent(id)}/${platform}-data`;
async function request(url,options){const response=await fetch(url,options);const result=await response.json().catch(()=>({}));if(!response.ok)throw new Error(result.error||'操作失败，请稍后重试');return result;}
function hasDraft(){return [...root.querySelectorAll('[data-data-form]')].some(form=>{const saved=settings[form.dataset.dataForm];return !!saved&&(form.elements.apiKey.value.length>0||form.elements.clear.checked||form.elements.provider.value!==saved.provider||Number(form.elements.maxRequests.value)!==Number(saved.maxRequests));});}
function lockBusiness(){const picker=root.querySelector('[data-data-business]');if(picker)picker.disabled=hasDraft()||loading>0;}
function cards(platform){
 const value=settings[platform],name=names[platform];
 if(!value)return `<section class="platform-data-card" data-data-card="${platform}"><h3>${name}</h3><p role="status">读取失败，请重新载入。</p><button type="button" class="btn ghost" data-reload>重新载入</button></section>`;
 return `<section class="platform-data-card" data-data-card="${platform}"><h3>${name}</h3><form data-data-form="${platform}">
 <label>数据源<select name="provider">${providers[platform].map(([id,label])=>`<option value="${id}" ${id===value.provider?'selected':''}>${label}</option>`).join('')}</select></label>
 <label data-key-wrap>API Key <span class="meta" data-key-state></span><input name="apiKey" data-data-key type="password" autocomplete="new-password" maxlength="4096" placeholder="留空保留已保存密钥"></label>
 <label class="settings-check" data-clear-wrap><input type="checkbox" name="clear"> 清除所选数据源的已保存密钥</label>
 <label>每个采集步骤最多请求次数<input name="maxRequests" type="number" min="1" max="100" required value="${Number(value.maxRequests)||20}"></label>
 <p class="meta" data-provider-note></p><div class="acts"><button type="submit" class="btn">保存${name}数据源</button><button type="button" class="btn ghost" data-clear-input>撤销未保存的更改</button></div>
 <p role="status" data-save-status aria-live="polite"></p>
 <details><summary>测试已保存的连接</summary><p class="meta">测试使用已保存配置，发送一个搜索请求，可能产生供应商费用；结果为空不代表连接失败。</p><label>测试关键词<input name="keyword" maxlength="100" placeholder="例如：厨房收纳"></label><button type="button" class="btn ghost" data-test>测试${name}连接</button><p role="status" data-test-status aria-live="polite"></p></details>
 </form></section>`;
}
function updateCard(platform){
 const card=root.querySelector(`[data-data-card="${platform}"]`),form=card?.querySelector('form'),data=settings[platform];if(!form||!data)return;
 const provider=form.elements.provider.value,vendor=['tikhub','redfox'].includes(provider),key=form.elements.apiKey;
 form.querySelector('[data-key-wrap]').hidden=!vendor;form.querySelector('[data-clear-wrap]').hidden=!vendor;
 form.querySelector('[data-key-state]').textContent=vendor?(data.hasKeys?.[provider]?'已加密保存':'尚未配置'):'';
 form.querySelector('[data-provider-note]').textContent=platform==='douyin'&&provider==='redfox'?'当前红狐抖音接入仅支持作品搜索和详情，不支持评论；评论请使用 TikHub 或浏览器。':vendor?'密钥仅用于此业务、此平台和所选供应商；留空不会覆盖已有密钥。':'浏览器或高级 HTTP 的连接配置请在采集工作区中管理。';
 form.elements.provider.disabled=key.value.length>0;form.querySelector('[data-test]').disabled=!vendor || provider!==data.provider || !data.hasKeys?.[provider];
 lockBusiness();
}
function draw(){
 const customers=context.getWorkspace()?.customers||[],fallback=context.getBusiness();
 if(!customers.some(c=>c.id===selected))selected=customers.find(c=>c.id===fallback)?.id||customers[0]?.id||'';
 root.innerHTML=`<label>配置所属业务<select data-data-business aria-label="数据源所属业务">${customers.map(c=>`<option value="${esc(c.id)}" ${c.id===selected?'selected':''}>${esc(c.name)}</option>`).join('')}</select></label><p class="meta">切换业务前请先保存或撤销未保存的更改。各业务、平台和供应商的配置相互独立。</p><div class="platform-data-grid" data-data-cards>${selected?'<p role="status">正在读取数据源设置…</p>':'<p>请先添加业务。</p>'}</div>`;
}
async function load(id){
 const current=++sequence;loading++;lockBusiness();const area=root.querySelector('[data-data-cards]');area.innerHTML='<p role="status">正在读取数据源设置…</p>';
 const results=await Promise.allSettled(['xhs','douyin'].map(platform=>request(endpoint(id,platform))));loading--;if(current!==sequence||id!==selected){lockBusiness();return;}
 settings={};for(const [index,platform] of ['xhs','douyin'].entries())if(results[index].status==='fulfilled')settings[platform]=results[index].value;
 area.innerHTML=cards('xhs')+cards('douyin');updateCard('xhs');updateCard('douyin');lockBusiness();
}
export function initPlatformDataSettings(ctx){
 context=ctx;root=document.getElementById('platform-data-config');if(!root)return;
 root.addEventListener('change',event=>{
  if(event.target.matches('[data-data-business]')){if(hasDraft()){event.target.value=selected;return;}selected=event.target.value;void load(selected);return;}
  const form=event.target.closest('[data-data-form]');if(!form)return;
  if(event.target.name==='clear'&&event.target.checked)form.elements.apiKey.value='';
  if(['provider','clear','maxRequests'].includes(event.target.name))updateCard(form.dataset.dataForm);
 });
 root.addEventListener('input',event=>{const form=event.target.closest('[data-data-form]');if(!form)return;if(event.target.name==='apiKey'){if(event.target.value)form.elements.clear.checked=false;updateCard(form.dataset.dataForm);}else if(event.target.name==='maxRequests')lockBusiness();});
 root.addEventListener('click',async event=>{
  const reload=event.target.closest('[data-reload]');if(reload){if(hasDraft()){reload.previousElementSibling.textContent='请先保存或撤销其他平台未保存的更改。';return;}void load(selected);return;}
  const clear=event.target.closest('[data-clear-input]');if(clear){const form=clear.closest('form'),saved=settings[form.dataset.dataForm];form.elements.apiKey.value='';form.elements.clear.checked=false;form.elements.provider.value=saved.provider;form.elements.maxRequests.value=String(saved.maxRequests);form.querySelector('[data-save-status]').textContent='已撤销未保存的更改。';updateCard(form.dataset.dataForm);return;}
  const button=event.target.closest('[data-test]');if(!button)return;const form=button.closest('form'),platform=form.dataset.dataForm,status=form.querySelector('[data-test-status]'),keyword=form.elements.keyword.value.trim();
  if(!keyword){status.textContent='请填写测试关键词。';return;}const controls=[...form.elements],id=selected;controls.forEach(el=>el.disabled=true);loading++;lockBusiness();status.textContent='正在测试已保存的连接…';
  try{const result=await request(endpoint(id,platform)+'/test',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({keyword})});status.textContent=`连接成功，返回 ${Number(result.count)||0} 条结果，使用 ${Number(result.requests)||0} 次请求。`;}
  catch(error){status.textContent=error.message;}finally{controls.forEach(el=>el.disabled=false);loading--;updateCard(platform);lockBusiness();}
 });
 root.addEventListener('submit',async event=>{
  const form=event.target.closest('[data-data-form]');if(!form)return;event.preventDefault();const platform=form.dataset.dataForm,id=selected,status=form.querySelector('[data-save-status]'),provider=form.elements.provider.value,maxRequests=Number(form.elements.maxRequests.value),key=form.elements.apiKey.value;
  if(!Number.isInteger(maxRequests)||maxRequests<1||maxRequests>100){status.textContent='请求次数须为 1 至 100 的整数。';return;}
  const payload={provider,maxRequests};if(['tikhub','redfox'].includes(provider)){if(form.elements.clear.checked)payload.apiKey='';else if(key.trim())payload.apiKey=key.trim();}
  const controls=[...form.elements];controls.forEach(el=>el.disabled=true);loading++;lockBusiness();status.textContent='正在保存…';
  try{const result=await request(endpoint(id,platform),{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});if(id!==selected)return;settings[platform]=result;form.elements.apiKey.value='';form.elements.clear.checked=false;status.textContent='已保存。密钥不会回显。';}
  catch(error){status.textContent=error.message;}finally{controls.forEach(el=>el.disabled=false);loading--;updateCard(platform);lockBusiness();}
 });
}
export async function openPlatformDataSettings(){if(!root||!context)return;if(!root.hasChildNodes()){draw();if(selected)await load(selected);}else lockBusiness();}
