import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

let handlers, ui, box, form, rendered, settings;
const workspace = { customers: [] };
const pack = { id: 'draft-pack', origin: { mode: 'organic', goal: 'reach' } };
function input(name, value, targetBox = box) {
  const field = { name, value, closest: () => targetBox };
  for (const callback of handlers.input) callback({ target: field });
}
beforeEach(async () => {
  vi.resetModules(); handlers = {}; settings = { dataset: {}, innerHTML: '', querySelectorAll: () => [] };
  vi.stubGlobal('document', {
    addEventListener: (name, callback) => { (handlers[name] ||= []).push(callback); },
    getElementById: () => settings,
  });
  ui = await import('../js/growth-ui.js');
  box = { dataset: { growthCustomer: 'draft-customer', growthPack: pack.id, growthPlatform: '小红书', growthIndex: '0' } };
  const button = { disabled: false };
  form = { matches: () => true, closest: () => box, querySelector: () => button, entries: [] };
  vi.stubGlobal('FormData', class extends Map { constructor(value) { super(value.entries); } });
  ui.installGrowthUI({ getWorkspace: () => workspace, setWorkspace: () => {}, render: () => { rendered = ui.renderPostGrowth('draft-customer', pack, '小红书', 0); }, toast: () => {} });
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('制作类型字段分组',()=>{
 it('制作预览沿用当前版本的已保存封面；旧素材不冒充当前封面',()=>{
  const source={title:'标题',body:'正文',cover:'封面',coverLayout:'留白'};
  const stored={...pack,shells:{小红书:[source]},productionDrafts:{'小红书|0':{version:2,format:'video',sourceContent:source,fields:{script:'正文',title:'标题',cover:'封面',coverLayout:'留白'}}},productionAssets:{'小红书|0':{id:'images',version:2,format:'video',fields:{cover:'封面',coverLayout:'留白'},images:[{name:'cover.png'}]}}};
  let html=ui.renderProduction('draft-customer',stored,'小红书',0);
  expect(html).toMatch(/data-ai-cover-preview[^>]+src="\/api\/production-assets/);
  stored.productionAssets['小红书|0'].version=1;
  html=ui.renderProduction('draft-customer',stored,'小红书',0);
  expect(html).toMatch(/data-ai-cover-preview[^>]+hidden/);
  expect(html).toContain('已保存素材包');
 });
 it('历史图文素材缺页时在制作页显示提醒',()=>{
  const old={...pack,origin:{...pack.origin,format:'image'},productionAssets:{'小红书|0':{id:'old',format:'image',version:1,fields:{shots:'第一页\n第二页'},images:[{name:'page-01.png'}]}}};
  expect(ui.renderProduction('draft-customer',old,'小红书',0)).toContain('已保存素材可能缺页');
 });
 it('优先展示当前类型字段，同时保留其他类型字段以免丢失数据',()=>{
  let html=ui.renderProduction('draft-customer',pack,'小红书',0),other=html.indexOf('data-production-other');
  expect(html.indexOf('name="production-script"')).toBeLessThan(other);expect(html.indexOf('name="production-liveSchedule"')).toBeGreaterThan(other);
  box.querySelector=()=>null;input('production-live','live');html=ui.renderProduction('draft-customer',pack,'小红书',0);other=html.indexOf('data-production-other');
  expect(html.indexOf('name="production-liveSchedule"')).toBeLessThan(other);expect(html.indexOf('name="production-script"')).toBeGreaterThan(other);
 });
});

describe('未提交输入跨异步重绘保留', () => {
  it('保存改写说明和效果输入，按客户、批次和篇目隔离，并转义用户文本', () => {
    input('rewrite-instruction', '保留我的 <原文>'); input('source', '平台截图'); input('views', '0');
    const html = ui.renderPostGrowth('draft-customer', pack, '小红书', 0);
    expect(html).toContain('保留我的 &lt;原文&gt;'); expect(html).toContain('value="平台截图"'); expect(html).toContain('value="0"');
    expect(ui.renderPostGrowth('other-customer', pack, '小红书', 0)).not.toContain('平台截图');
    expect(ui.renderPostGrowth('draft-customer', { ...pack, id: 'other-pack' }, '小红书', 0)).not.toContain('平台截图');
    expect(ui.renderPostGrowth('draft-customer', pack, '小红书', 1)).not.toContain('平台截图');
    expect(ui.renderPostGrowth('draft-customer', pack, '小红书', 0)).toContain('平台截图');
  });
  it('提交成功只清除已提交值，等待期间继续输入的新值不会被清空', async () => {
    input('source', '旧截图'); input('views', '10');
    form.entries = [['source', '旧截图'], ['views', '10'], ['baseline', '']];
    let resolve;
    vi.stubGlobal('fetch', () => new Promise(done => { resolve = done; }));
    const pending = handlers.submit[0]({ target: form, preventDefault() {} });
    input('source', '刚输入的新截图');
    resolve({ ok: true, json: async () => workspace }); await pending;
    expect(rendered).toContain('value="刚输入的新截图"'); expect(rendered).not.toContain('value="10"');
  });
  it('保存失败后输入仍保留', async () => {
    input('source', '不能丢失的截图');
    form.entries = [['source', '不能丢失的截图'], ['views', '10'], ['baseline', '']];
    vi.stubGlobal('fetch', async () => ({ ok: false, json: async () => ({ error: '网络问题' }) }));
    await handlers.submit[0]({ target: form, preventDefault() {} });
    expect(ui.renderPostGrowth('draft-customer', pack, '小红书', 0)).toContain('不能丢失的截图');
  });
  it('切换客户后再回来，未保存的目标和补充要求仍在', () => {
    const targetBox = { dataset: { growthCustomer: 'draft-customer' } };
    input('criteria', '只找杭州业主', targetBox); input('goal', 'sales', targetBox);
    ui.renderGrowthSettings({ id: 'another-customer' }); expect(settings.innerHTML).not.toContain('只找杭州业主');
    ui.renderGrowthSettings({ id: 'draft-customer', growthGoal: 'reach' });
    expect(settings.innerHTML).toContain('只找杭州业主'); expect(settings.innerHTML).toContain('value="sales" selected');
  });
});

it('同客户服务器设置变化会更新界面，仍保留未提交的补充要求',()=>{
  const customer={id:'draft-customer',growthGoal:'reach',growthCriteria:''};
  ui.renderGrowthSettings(customer);
  input('criteria','正在写的要求',{dataset:{growthCustomer:customer.id}});
  ui.renderGrowthSettings({...customer,growthGoal:'sales'});
  expect(settings.innerHTML).toContain('value="sales" selected');
  expect(settings.innerHTML).toContain('正在写的要求');
});

it('保存客户 A 的快捷目标时切换到 B，完成后显示 B 的目标',async()=>{
  handlers={};
  let current='a', data={customers:[{id:'a',growthGoal:'reach'},{id:'b',growthGoal:'leads'}]};
  const select={id:'quick-growth-goal',value:'sales',dataset:{customer:'a'},closest:()=>null,matches:()=>false};
  const generate={dataset:{customer:'a'}};
  document.getElementById=id=>id==='go-today'?generate:settings;
  const render=()=>{
    select.dataset.customer=current;generate.dataset.customer=current;
    if(!select.dataset.saving)select.value=data.customers.find(c=>c.id===current).growthGoal;
    ui.renderGrowthSettings(data.customers.find(c=>c.id===current));
  };
  ui.installGrowthUI({getWorkspace:()=>data,setWorkspace:value=>{data=value;},render,toast:()=>{}});
  let resolve;vi.stubGlobal('fetch',()=>new Promise(done=>{resolve=done;}));
  const pending=handlers.change.find(fn=>fn.constructor.name==='AsyncFunction')({target:select});
  current='b';render();
  resolve({ok:true,json:async()=>({customers:[{id:'a',growthGoal:'sales'},{id:'b',growthGoal:'leads'}]})});
  await pending;
  expect(select.value).toBe('leads');expect(select.dataset.customer).toBe('b');expect(select.dataset.saving).toBeUndefined();
  expect(settings.innerHTML).toContain('value="leads" selected');
});

it('双目标复盘将流量与有效客资并列填写，基线明确对应客资',()=>{
  const html=ui.renderPostGrowth('draft-customer',{...pack,origin:{mode:'organic',goal:'reach_leads'}},'小红书',0);
  expect(html).toContain('name="views"');expect(html).toContain('name="qualifiedLeads"');expect(html).toContain('同口径基线：有效客资');expect(html).toContain('name="baselineViews"');expect(html).toContain('name="baselineViewsNote"');
});

it('关联发布时按发布快照目标显示正确的复盘指标',()=>{
  const pub={id:'pub1',customerId:'draft-customer',packId:pack.id,platform:'小红书',index:0,status:'published',goal:'reach_leads'};
  input('publicationId','pub1');
  const html=ui.renderPostGrowth('draft-customer',pack,'小红书',0,[],[pub]);
  expect(html).toContain('流量与有效线索（按发布时目标）');expect(html).toContain('name="baselineViews"');expect(html).toContain('name="baselineMetric" value="qualifiedLeads"');
  input('publicationId','');
  expect(ui.renderPostGrowth('draft-customer',pack,'小红书',0,[],[pub])).toContain('name="baselineMetric" value="views"');
});

it('切换不同发布目标时保留各自未保存的基线',()=>{
  handlers={};
  const pub={id:'pub1',customerId:'draft-customer',packId:pack.id,platform:'小红书',index:0,status:'published',goal:'reach_leads',accountId:'a1'};
  const space={customers:[{id:'draft-customer',drops:[pack]}],acquisition:{publications:[pub]}};
  let html='';ui.installGrowthUI({getWorkspace:()=>space,setWorkspace:()=>{},render:()=>{html=ui.renderPostGrowth('draft-customer',pack,'小红书',0,[],[pub]);},toast:()=>{}});
  const fields={baseline:{value:'100'},baselineNote:{value:'流量旧基线'}};
  const fakeForm={dataset:{outcomeGoal:'reach'},querySelector:selector=>fields[selector.match(/name="([^"]+)"/)[1]]};
  const select={name:'publicationId',value:'pub1',closest:selector=>selector==='[data-outcome-form]'?fakeForm:box};
  handlers.change[2]({target:select});
  expect(html).toContain('流量与有效线索（按发布时目标）');expect(html).not.toContain('value="100"');
  fakeForm.dataset.outcomeGoal='reach_leads';Object.assign(fields,{baseline:{value:'2'},baselineNote:{value:'线索基线'},baselineViews:{value:'50'},baselineViewsNote:{value:'流量双目标基线'}});select.value='';
  handlers.change[2]({target:select});
  expect(html).toContain('value="100"');expect(html).toContain('流量旧基线');expect(html).not.toContain('线索基线');
  fakeForm.dataset.outcomeGoal='reach';delete fields.baselineViews;delete fields.baselineViewsNote;fields.baseline.value='100';fields.baselineNote.value='流量旧基线';select.value='pub1';
  handlers.change[2]({target:select});expect(html).toContain('value="50"');expect(html).toContain('线索基线');
});

it('参考来源与当前编辑后的重复文字在作品中可回查，链接安全转义',()=>{
  const referenced={...pack,workReferences:[{title:'参考<一>',url:'https://example.com/source',platform:'小红书',description:'做厨房翻新之前一定先确认水电管线的位置再讨论其他细节'}],shells:{小红书:[{title:'标题',body:'原稿'}]},edits:{'小红书|0|body':{now:'做厨房翻新之前一定先确认水电管线的位置再讨论',verbatim:true}}};
  const html=ui.renderPostGrowth('draft-customer',referenced,'小红书',0);
  expect(html).toContain('查看本批参考来源 · 有文字重合提醒');expect(html).toContain('参考&lt;一&gt;');expect(html).toContain('https://example.com/source');expect(html).toContain('存在连续相同文字');
  referenced.workReferences[0].url='javascript:alert(1)';expect(ui.renderPostGrowth('draft-customer',referenced,'小红书',0)).not.toContain('href="javascript:');
});
