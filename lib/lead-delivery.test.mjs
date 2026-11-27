import {describe,expect,it} from 'vitest';
import {deliverLeadClosing} from './lead-delivery.mjs';

const body='柜门合到一半就卡住，先看铰链占了多少宽度。欢迎私信咨询。';
const action='如果柜门还会卡住，私信说一下，是盒盖碰到门边，还是盒身顶到铰链？';
const selfCheck='把柜门合到接触点，先看看碰到的是盒盖还是铰链。';
const sample=()=>({body,title:'柜门卡在哪里',brief:{question:'柜门卡在哪里？',nextStep:action,takeaway:selfCheck},cta:'欢迎私信咨询。'});
const context=goal=>({platform:'抖音',format:'video',customer:{creatorProfile:{fields:{contactEntry:'小红书：使用主页表单；抖音：站内私信'}}},goal});
describe('获客成品的最后一句',()=>{
  it.each(['reach','spread','sales'])('%s 保留原稿的行动意图',goal=>{
    const item=sample();deliverLeadClosing(item,context(goal));expect(item.body).toBe(body);
  });
  it.each(['小红书：站内私信','抖音：不支持私信','抖音：私信功能未开通',''])('入口不匹配或未确认，选具体的自查动作：%s',entry=>{
    const item=sample(),options=context('leads');options.customer.creatorProfile.fields.contactEntry=entry;
    expect(deliverLeadClosing(item,options)).toBe('');expect(item.body).toContain(selfCheck);expect(item.body).not.toContain('私信');
  });
  it.each(['小红书：\n站内私信','抖音：私信暂不开放，可在评论区留言','抖音：不接私信','抖音：只回复评论，不再回复私信'])('已写好的具体邀约也要核实本平台是否支持：%s',entry=>{
    const item=sample(),options=context('leads');options.customer.creatorProfile.fields.contactEntry=entry;
    const original='先看柜门下沿。'+action;
    Object.assign(item,{script:original,shots:'末镜｜'+action,cta:action});
    expect(deliverLeadClosing(item,options)).toBe('');
    expect(item.script).toBe('先看柜门下沿。'+selfCheck);
    expect(item.shots).toBe('末镜｜'+selfCheck);
    expect(item.cta).toBe(selfCheck);
  });
  it('同时支持的平台可以共用入口，其他人的转述不会被当作本篇邀约',()=>{
    const item=sample(),options=context('leads');options.customer.creatorProfile.fields.contactEntry='小红书、抖音：站内私信';
    expect(deliverLeadClosing(item,options)).toBe('');expect(item.body.endsWith(action)).toBe(true);
    const observation='柜门总卡？这个问题来自之前的私信。';
    const unchanged={body:observation,title:'柜门总卡？'};
    expect(deliverLeadClosing(unchanged,{...options,customer:{}})).toBe('');expect(unchanged.body).toBe(observation);
  });
  it.each(['把柜门碰撞点拍下来，扫码发给我。','把柜门碰撞点告诉我，我帮你看。'])('没核实的联系办法不写进收口：%s',nextStep=>{
    const item=sample();item.brief.nextStep=nextStep;
    expect(deliverLeadClosing(item,context('leads'))).toBe('');expect(item.body).toContain(selfCheck);
  });
  it('制作仅变更这次生成的字段，人工填写的口播和自然收尾保留',()=>{
    const item={...sample(),script:body,shots:'第一镜：合上柜门。\n收尾：欢迎私信咨询。'};
    expect(deliverLeadClosing(item,{...context('reach_leads'),nextStep:action,editable:['shots','cta']})).toBe('');
    expect(item.script).toBe(body);expect(item.shots.endsWith(action)).toBe(true);
    const specific='这地方卡住了？先量下铰链到侧板的净宽，再决定换盒还是挪盒。';
    item.cta=specific;deliverLeadClosing(item,context('leads'));expect(item.cta).toBe(specific);
  });
  it('题外的收口不会因为同时写在内部摘要里而被采用',()=>{
    const item={body,title:'柜门卡在哪里',brief:{nextStep:'欢迎私信咨询。',takeaway:'测量孩子的小提琴弓长，试不同琴弓。'}};
    expect(deliverLeadClosing(item,context('leads'))).toContain('泛泛邀约');expect(item.body).toBe(body);
  });
  it('缺少可用句子时要求原有修稿重写，不搬用内部说明或无依据承诺',()=>{
    const item={body,title:'柜门卡在哪里',brief:{nextStep:'引导用户私信并索取手机号',takeaway:'欢迎私信咨询。'}};
    expect(deliverLeadClosing(item,context('leads'))).toContain('泛泛邀约');expect(item.body).toBe(body);
  });
});
