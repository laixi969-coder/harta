import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

let handlers, ui, box, form, rendered, settings;
const workspace = { customers: [] };
const pack = { id: 'draft-pack', origin: { mode: 'organic', goal: 'reach' } };
function input(name, value, targetBox = box) {
  const field = { name, value, closest: () => targetBox };
  for (const callback of handlers.input) callback({ target: field });
}
beforeEach(async () => {
  vi.resetModules(); handlers = {}; settings = { dataset: {}, innerHTML: '' };
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
