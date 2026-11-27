import {knowledgeTerms} from './sales-knowledge.mjs';

const activeGoal = goal => goal==='leads' || goal==='reach_leads';
// Match a whole closing sentence, leaving specific questions and ordinary prose intact.
const emptyClose = /(^|[。！？!?\n｜|：:])\s*((?:(?:如果|如|若)?(?:有需要|有兴趣|感兴趣|有疑问|有任何问题)(?:的话)?[，,、 ]*)?(?:欢迎|可以|记得|请|随时|来)?\s*(?:私信(?:我|我们)?|联系(?:我|我们|客服)|咨询(?:我|我们|客服)?|留言|评论区留言)(?:[，,、 ]*(?:了解(?:更多|详情)?|咨询(?:详情)?|沟通|交流|聊聊|了解一下))?[。！？!！~～ ]*)$/u;
const internalOrRisky = /引导(?:读者|用户|观众)|建议(?:读者|用户)|让(?:读者|用户|观众)|(?:要求|请)(?:客户|用户|读者)|待补|占位|可兑现|承接入口|CTA|身份证|手机号码?|电话号码?|家庭住址|\b1[3-9]\d{9}\b|百分之|[%％]|加微信|免费|保证|承诺|赠送|限时|立即下单|点击链接|https?:\/\//i;
const routes=[/私信|私聊/,/评论|留言/,/预约/,/表单/,/菜单/,/主页|首页/,/到店|来店/,/客服/,/微信|企微/,/二维码|扫码/,/加群|进群/,/邮箱|邮件/,/电话|致电|拨打/];
const common = new Set(['如果','可以','核对','有需','需要','建议','这个','自己','一下','一个','具体','问题','确认','是否','考虑','只有','了解','情况','我们','欢迎','咨询','私信','再看','再来','你的']);
const platformTags=/小红书|抖音|公众号|视频号|朋友圈|快手|知乎|B站|TikTok/giu;

// Platform headings can be followed by a new line or more than one clause.
function approvedClauses(customer, platform) {
  const result=[];
  let platforms=[];
  for (const clause of String(customer.creatorProfile?.fields?.contactEntry || '').split(/[，,；;。\n]/u)) {
    const named=clause.match(platformTags);
    if (named) platforms=named.map(name=>name.toLowerCase());
    if (!platforms.length || platforms.includes(platform.toLowerCase())) result.push(clause);
  }
  return result;
}

const deniedBefore=/(?:不再|暂不|尚未|不|未|勿|别|禁止|关闭|暂停)(?:接收|接受|接|支持|开通|开放|使用|可用|用|回复|允许|提供|开启)?(?:站内)?$/u;
const deniedAfter=/^(?:消息|功能|渠道|入口)?(?:暂时|目前|当前|暂|尚)?(?:不开通|不开放|未开通|未开放|关闭|暂停|不可用|不支持|不接收|不回复)/u;
function unavailableRoute(sentence,clauses) {
  if (/(?:发给|告诉|回复|联系|来找)我|跟我说/.test(sentence) && !routes.some(route=>route.test(sentence))) return true;
  return routes.some(route=>route.test(sentence) && !clauses.some(clause=>{
    const match=route.exec(clause);
    if (!match) return false;
    return !deniedBefore.test(clause.slice(0,match.index).trimEnd()) &&
      !deniedAfter.test(clause.slice(match.index+match[0].length).trimStart());
  }));
}

function closingToReplace(text,clauses,isCta) {
  const generic=emptyClose.exec(text);
  if (generic) return {start:generic.index+generic[1].length,unavailable:unavailableRoute(generic[2],clauses)};
  const last=/[^。！？!?\n｜|：:]+[。！？!?]*\s*$/u.exec(text);
  if (!last) return null;
  // Inviting a reader to act differs from reporting where a customer asked a question.
  const sentence=last[0].trim();
  const invitation=isCta || /(?:请|欢迎|可以|记得|直接|通过|前往|点开|点击|打开|发送到|发到|在|去)(?:站内|我的|我们的|主页|平台|本店)?(?:私信|私聊|留言|评论区|客服|主页|表单|菜单|到店|预约|扫码|加群|微信|邮箱|拨打)|(?:私信|私聊|留言|评论区|扫码|到店|预约|致电|拨打|加群)(?:我|我们|说|告诉|发|留|写|描述|反馈|咨询|联系|带|看|填|约)|(?:发给|告诉|回复|联系|来找)我|跟我说/u.test(sentence);
  return invitation && unavailableRoute(sentence,clauses) ? {start:last.index,unavailable:true} : null;
}

export function leadClosingInstruction(goal,platform,format,job='') {
  if (!activeGoal(goal) || job==='traffic') return '';
  const placement=format==='video'?'把实际收口写进口播末句或末镜字幕，与 cta 一致。适合无口播的片子用屏幕字。':
    format==='image'?'把动作写进图文正文。末页需要承接时用一句能放进图卡的文字，不能只出现在制作说明。':'把这个动作写进实际发布正文。';
  const opening=platform==='小红书' && format==='image'?'用封面提出读者会搜索的问题，下一页给有出处的判断或例外。':
    platform==='抖音' && format==='video'?'第一镜拍到读者认得的现象，中间用一个可见动作验证判断，最后请读者描述自己遇到的那一种。':'';
  return opening+'针对本篇读者问题，先用一条可回查的业务条件给出读者现在就能做的判断，指出在哪一种具体情况下需要进一步核对。brief.nextStep 写读者能直接看到的一句话，提一个能用一句话回答的问题，例如请描述遇到的现象或已测得的尺寸；选本篇相关的一项即可。只用本平台已确认的联系入口。入口未知时给一个现场自查或比较动作，避免泛称“欢迎咨询”。'+placement;
}

// Only generated fields are passed here. The actual replacement still goes through the normal fact review.
export function deliverLeadClosing(item,{customer,platform,format='',goal,job='',nextStep='',editable,omitUnconfirmed=false}={}) {
  if (!activeGoal(goal) || job==='traffic' || !customer) return '';
  const body=Object.hasOwn(item,'script')?'script':'body';
  const fields=[body,...(format==='video'||item.cta?['cta']:[]),...(['image','video'].includes(format)?['shots']:[])];
  const clauses=approvedClauses(customer,platform);
  const endings=[];
  for (const key of fields) {
    if ((editable && !editable.includes(key)) || typeof item[key]!=='string') continue;
    const ending=closingToReplace(item[key],clauses,key==='cta');
    if (ending) endings.push({key,...ending});
  }
  if (!endings.length) return '';
  const bodyEnd=endings.find(ending=>ending.key===body);
  const context=[customer.readerQuestion,customer.reviewedProblem?.title,item.brief?.question,item.title,
    bodyEnd?item[body].slice(0,bodyEnd.start):item[body],customer.pitch].filter(Boolean).join(' ');
  const terms=knowledgeTerms(context);
  const candidates=[nextStep || item.brief?.nextStep,item.brief?.takeaway].filter(Boolean);
  const sentence=candidates.find(value=>{
    if (typeof value!=='string' || value.trim().length<7 || value.length>(format==='image'?80:110) || /\n/.test(value) ||
      internalOrRisky.test(value) || emptyClose.test(value) || !/量|核对|记下|看|带上|说|告诉|描述|检查|试|选|确认|比较|对照|想|哪|吗|是否|找|留意/.test(value)) return false;
    if (unavailableRoute(value,clauses)) return false;
    if ((value.match(platformTags)||[]).some(name=>name!==platform)) return false;
    const subject=[...knowledgeTerms(value)].some(term=>!common.has(term) && terms.has(term));
    return subject && !/^(?:读者|用户|观众|帮助|学会|知道|了解如何|能理解|能够判断)/.test(value.trim());
  });
  if (!sentence) {
    if (omitUnconfirmed) {
      for (const ending of endings) if (ending.unavailable) item[ending.key]=item[ending.key].slice(0,ending.start).trimEnd();
    }
    return '发布成稿的末句仍是泛泛邀约或使用了未确认的联系入口。请用本题一个可描述的现象、尺寸或选择替换末句；只有业务已确认本平台入口时才引导联系，否则给具体自查动作。';
  }
  const replacement=sentence.trim().replace(/[；;]$/u,'。');
  for (const {key,start} of endings) item[key]=item[key].slice(0,start)+replacement;
  return '';
}
