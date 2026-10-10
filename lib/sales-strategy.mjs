import { understandCustomer } from './customer-understanding.mjs';
// Methods adapted for Chinese comment/DM sales; see vendor/sales-methods/NOTICE.md.
export const SALES_STRATEGY_VERSION = 'harta-sales-2';
export const SALES_SKILLS = Object.freeze({
  opening:{name:'首次沟通',goal:'先回应真实问题，让对方判断我们是否值得继续交流',instruction:'回应对方的具体问题，简短说明自己是另一家商家，透明但不抢着推产品。优先给一个有用、可核对的判断方法；只有影响回答的关键条件未知时才问一个问题。不要索取联系方式或引导下单。不冒充视频作者，不默认对方在问我们的产品。',nextStep:'对方回应后，确认使用场景和所需产品'},
  discovery:{name:'澄清需求',goal:'弄清客户希望改善什么，以及现实限制',instruction:'先答当前问题，再用使用场景、现有做法、希望改善的结果、现实限制和判断标准理解需求。只问会改变建议的一个问题，不做连续盘问；客户已讲过的不要重问。不默认一定要购买或升级，也不把待验证的猜测写成客户的真实动机。',nextStep:'核对使用条件后，缩小到合适产品或规格'},
  matching:{name:'产品匹配',goal:'帮助客户做选择，如实说明适配条件和取舍',instruction:'仅比较本次选择的产品和规格。把对方的使用条件对应到已确认参数，说明限制。先说明匹配哪条客户原话、哪些条件未确认，再给有条件的建议及取舍。不适合就如实说，可以建议继续使用现有方案或了解其他方案。不硬推、不编造竞品缺点。',nextStep:'确认客户更看重的差异，并确定规格'},
  objection:{name:'处理顾虑',goal:'确认真实阻碍，再用证据回应',instruction:'把顾虑当成需要理解的信息，不当成必须击破的障碍。贵可能是预算限制，也可能是价值不清或比较不同方案；问清前不下结论。先回应原问题，提供可验证的证据和限制，必要时只问一个诊断问题。尊重明确预算和暂缓决定，不激将、不羞辱、不擅自优惠、不虚构案例。',nextStep:'核实顾虑是否解决，再商量下一步'},
  acknowledging:{name:'自然结束本轮',goal:'尊重对话节奏，让客户保留选择空间',instruction:'对方仅表示收到或感谢，没有新问题。可以简短致意，不重复卖点，不继续追问，不趁机邀约下单。',nextStep:'等待客户有新问题或明确需求时再继续'},
  answering:{name:'先答清楚',goal:'直接回答价格、条件或保障问题，减少不确定性',instruction:'先直接回答当前问题。已知价格说明具体产品、规格和条件，未知就说需核对；客户只问价格，不代表要下单。售后、保障、交付也只据已确认资料回答。不先套近乎，不以留电话、加好友或回答一串问题作为答复条件，不强塞产品推荐或购买邀约。问题已答清楚可以结束本轮，不必每次都追问。',nextStep:'让客户判断这些信息是否足够，按其意愿继续'},
  closing:{name:'推进成交',goal:'将购买意愿转为一个明确、可履行的下一步',instruction:'核对产品、规格、数量和交付条件。价格仅来自当前所选规格的价格条件，无规格的产品或服务可使用自身已确认价格。按已确认购买方式建议咨询、报价或下单；没有链接或服务安排就交由人工核对，不虚构订单、库存、支付链接或成交。',nextStep:'人工核对报价和履约条件，记录真实下单结果'},
  followup:{name:'适度跟进',goal:'补充有用信息，确认是否继续',instruction:'未收到回复时只作一次轻量跟进，提供与原需求有关的新帮助，允许对方暂缓。不制造紧迫感，不追问为何不回复，不连续催促。',nextStep:'等待回复；没有回复时停止继续追问'},
});
const eventTime = m => Date.parse(m.receivedAt || m.sentAt || m.createdAt) || 0;
const refusal = value => /(?:别|不要|不再|停止|禁止|不用).{0,5}(?:联系|打扰|推销|发消息|私信)|(?:不要|别)再发|退订|拉黑/.test(value);
export function salesStopReason({lead,op,evidence=[],messages=lead.messages||[],at=Date.now()}) {
  if (lead.doNotContact) return '对方已拒绝联系，请停止营销';
  if (lead.manualTakeover || op?.manualTakeover) return '已由人工接管，请先核对会话';
  if (['已成交','已结束'].includes(op?.stage)) return '本次需求已结束；新购买意向请另建需求';
  const relevant = messages.filter(m=>(m.opportunityId||'')===(op?.id||''));
  const incoming = relevant.filter(m=>m.direction==='inbound').sort((a,b)=>eventTime(a)-eventTime(b));
  // Do not infer a refusal from a merchant's/video author's reply.
  const latest = incoming.at(-1)?.text || evidence.map(e=>e.text).join('\n');
  const restoredAt=Math.max(0,...(lead.events||[]).filter(e=>e.type==='unblock').map(e=>Date.parse(e.at)||0));
  // Refusal is contact-wide and survives a later neutral reply or a new opportunity.
  if(messages.some(m=>m.direction==='inbound'&&(Date.parse(m.createdAt||m.receivedAt)||0)>restoredAt&&refusal(m.text))||(!restoredAt&&!incoming.length&&refusal(latest))) return '原话包含拒绝联系，请核对并停止营销';
  if (/转人工|找人工|人工客服|投诉|(?:我要|申请|要求|办理)(?:退款|退货)|(?:退款|退货)(?:流程|进度)|起诉/.test(latest)) return '涉及人工服务或售后，请由人工处理';
  if(/不买了|不考虑了|不需要了|不感兴趣/.test(latest)&&!/(?:还有|有没有|有|换|推荐).{0,6}(?:别的|其他|便宜|款)|现在.{0,6}(?:怎么买|下单)/.test(latest))return '客户本轮已暂缓购买，不继续劝购；这不等于永久拒绝联系';
  const lastInbound = eventTime(incoming.at(-1)||{});
  const unanswered = relevant.filter(m=>['sent_manual','sent_platform'].includes(m.status)&&eventTime(m)>=lastInbound).sort((a,b)=>eventTime(a)-eventTime(b));
  if(unanswered.length>=2)return '已联系并跟进一次，等待客户回复后再继续';
  if(unanswered.length&&at-eventTime(unanswered.at(-1))<24*60*60*1000)return '上一条联系未满 24 小时，等待回复后再继续';
  return '';
}

export function buildSalesPlan({lead,op,scope,evidence=[],conversation=[],knowledge,at=Date.now()}) {
  const stopReason = salesStopReason({lead,op,evidence,at});
  const latest = [...conversation].reverse().find(m=>m.direction==='inbound')?.text;
  const query = latest || evidence.map(e=>e.text).join('\n');
  const sent = conversation.filter(m=>m.direction==='outbound');
  const understanding=understandCustomer({evidence,conversation});
  const exploratory=/先不买|暂时不买|不急.{0,4}买|先不下单|暂不下单|只是看看|先了解|先看看|先比较|不想买/.test(query);
  const priceQuestion=/多少钱|价格|报价|售价/.test(query);
  const buyRequest=!exploratory&&!/(?:不|别|不要|暂不).{0,4}(?:下单|付款|订购)/.test(query)&&/怎么买|怎么下单|如何下单|下单链接|付款链接|购买链接|就买这|买这款|订购/.test(query);
  let skillId = 'discovery';
  if (!latest && !sent.length) skillId='opening';
  else if (conversation.at(-1)?.direction==='outbound') skillId='followup';
  else if (/^(好的|好|谢谢|谢谢你|好的谢谢|收到|了解了|明白了)[，。！!\s]*$/.test(query.trim())) skillId='acknowledging';
  else if (/太贵|贵了|贵一点|便宜|优惠|不放心|担心|考虑一下|再看看|没预算|怕|犹豫/.test(query)) skillId='objection';
  else if (buyRequest) skillId='closing';
  else if (priceQuestion||/售后|保修|退换|包邮|运费|发货|交付/.test(query)) skillId='answering';
  else if (!exploratory&&/区别|比较|哪款|哪个好|适合|推荐/.test(query)) skillId='matching';
  const missing=[];
  if(!scope?.products.length) missing.push('尚未确定产品，先澄清需求');
  if(['closing','answering'].includes(skillId)&&priceQuestion&&(!scope?.products.length||scope.products.some(p=>p.hasVariants?!(scope.skus||[]).some(s=>s.productId===p.id&&s.priceTerms):!p.priceTerms)))missing.push('规格或报价条件未齐，不能给出确定报价');
  if(!knowledge?.chunks.length)missing.push('未检索到相关补充资料，仅使用当前产品事实');
  const skill=SALES_SKILLS[skillId];
  const permission={recommend:skillId==='matching'||skillId==='closing',purchase:skillId==='closing',question:['answering','acknowledging'].includes(skillId)?'':understanding.nextQuestion,reason:exploratory?'对方表示仍在了解，尊重其节奏':skillId==='closing'?'本轮原话明确询问购买方式':'问询和回复不等于同意购买'};
  return {version:SALES_STRATEGY_VERSION,skillId,...skill,stopReason,missing,understanding,permission,
    rationale:latest?'依据当前账号和渠道收到的最新咨询':sent.length?'依据本次需求已登记的实际联系记录':'依据已核实的原始评论，尚未收到本次渠道的咨询',
    knowledgeHash:knowledge?.hash||'',references:[...(scope?.products||[]).map(p=>({kind:'product',id:p.id,title:p.name,source:p.source,revision:p.revision})),...(scope?.skus||[]).map(s=>({kind:'sku',id:s.id,title:s.name,source:s.source,revision:s.revision})),...(knowledge?.chunks||[]).map(({score,...r})=>({kind:'document',...r}))]};
}

export function assertSalesDraft(text,scope,additionalFacts='',customerStatements=[]) {
  if(/你(?:其实|内心|骨子里)|你真正(?:想要|需要)|不买.{0,6}(?:后悔|吃亏)|为.{0,8}好就|连.{0,8}都舍不得|相信我就(?:买|下单)/.test(text))throw new Error('不要替客户断言隐秘动机，或通过羞辱、恐惧催促购买');
  if(text.length>300)throw new Error('销售草稿超过 300 字，请重新生成');
  const matches = value => [...value.matchAll(/(?:[¥￥]\s*([\d,]+(?:\.\d+)?)|([\d,]+(?:\.\d+)?|[零〇一二两三四五六七八九十百千万]+)\s*(?:元|块|RMB|CNY))/gi)].map(m=>({amount:String(m[1]||m[2]).replaceAll(',',''),start:m.index,end:m.index+m[0].length}));
  const prices=value=>matches(value).map(m=>m.amount);
  const isBudget=(value,m)=>/预算(?:是|为|最多|上限|不超过|只有|大约|约)?\s*$/.test(value.slice(Math.max(0,m.start-18),m.start))||/^(?:的)?预算/.test(value.slice(m.end,m.end+4));
  const customerBudgets=new Set(customerStatements.flatMap(value=>matches(value).filter(m=>isBudget(value,m)).map(m=>m.amount)));
  const terms = [...(scope?.skus||[]),...(scope?.products||[]).filter(p=>p.hasVariants===false)].map(s=>s.priceTerms||'').join('\n');
  const known = new Set(prices(terms));
  if(matches(text).some(m=>!known.has(m.amount)&&!(customerBudgets.has(m.amount)&&isBudget(text,m))))throw new Error('报价缺少当前所选规格的依据，请先核对价格条件');
  const facts=[...(scope?.products||[]),...(scope?.skus||[])].map(p=>[p.facts,p.attributes].filter(Boolean).join(' ')).join('\n')+'\n'+additionalFacts;
  const affirmative = value => value.split(/[，,。！？\n；]/).filter(s=>!/(?:你|您|客户).{0,12}(?:提到|希望|想找|想要|需要|问的)|^(?:如果|若).{0,10}(?:必须|需要|要求)|[吗呢]$/.test(s)&&!/(?:未|没|不)(?:明确|确认|确定|支持|标注|注明|写)|是否|待核|需核|不能确定|不保证/.test(s));
  const noDrill=/(?:免|无需|不用)打孔|不需要.{0,8}打孔/;
  if(affirmative(text).some(s=>noDrill.test(s))&&!affirmative(facts).some(s=>noDrill.test(s)))throw new Error('免打孔能力没有产品资料的明确支持，请改为待核对');
  if(/点击.{0,12}(?:主页|商品|链接)|(?:主页|小黄车|购物车).{0,12}(?:下单|购买)|(?:进入|打开).{0,8}商品页/.test(text)&&!/(?:主页|商品页|小黄车|购物车|下单链接|购买链接)/.test(facts))throw new Error('购买入口没有资料支持，请明确说明需核实购买方式');
  if(/非充电式|不能充电|不支持充电/.test(text)&&!/非充电式|不能充电|不支持充电/.test(facts))throw new Error('插座供电不能证明不支持充电，删除未经确认的否定参数');
  if(/没有(?:额外的)?优惠权限|无权优惠/.test(text))throw new Error('未提供折扣授权信息，不能把未知写成没有优惠权限');
  if(/很合适|非常适合|最适合|完全适合|放心买|闭眼入/.test(text))throw new Error('适配条件尚需核实，请用有条件的建议代替确定适合的保证');
  if(/(?:店内|店里|本店|我们)(?:目前)?(?:仅|只有|只上架)|暂无其他款式|没有其他款式/.test(text))throw new Error('本次产品范围不代表全部商品，不能断言店内仅有这些产品');
  if(/保证成交|保证有效|百分百有效|已为你下单|已经下单成功|付款成功|最后[一二三\d]+件|仅剩[一二三\d]+件/.test(text))throw new Error('草稿包含未经核实的结果或库存承诺');
}
