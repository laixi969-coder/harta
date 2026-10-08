// Methods adapted for Chinese comment/DM sales; see vendor/sales-methods/NOTICE.md.
export const SALES_STRATEGY_VERSION = 'harta-sales-1';
export const SALES_SKILLS = Object.freeze({
  opening:{name:'首次沟通',goal:'回应原需求，获得继续沟通的意愿',instruction:'引用对方的具体问题，说明自己是另一家商家。先给一条有依据的帮助，再问一个容易回答的问题。不冒充视频作者，不默认对方在问我们的产品。',nextStep:'对方回应后，确认使用场景和所需产品'},
  discovery:{name:'澄清需求',goal:'补齐影响产品选择的一个关键条件',instruction:'先回答已经问到的问题，只追问最影响适配的一个缺口，如用途、尺寸、数量或交付地区。已经回答的不要重复问，不索要无关个人信息。',nextStep:'核对使用条件后，缩小到合适产品或规格'},
  matching:{name:'产品匹配',goal:'用已确认的事实说明适合与不适合',instruction:'仅比较本次选择的产品和规格。把对方的使用条件对应到已确认参数，说明限制。证据不足就澄清，不硬推、不编造竞品缺点。',nextStep:'确认客户更看重的差异，并确定规格'},
  objection:{name:'处理顾虑',goal:'确认真实阻碍，再用证据回应',instruction:'先承认顾虑，区分价格、时机、风险、比较或需要他人决定。用一条与本次需求相关的已确认事实回应，再问一个能澄清阻碍的问题。不争辩，不擅自优惠，不虚构案例。',nextStep:'核实顾虑是否解决，再商量下一步'},
  closing:{name:'推进成交',goal:'将购买意愿转为一个明确、可履行的下一步',instruction:'核对产品、规格、数量和交付条件。价格仅来自当前所选规格的价格条件，无规格的产品或服务可使用自身已确认价格。按已确认购买方式建议咨询、报价或下单；没有链接或服务安排就交由人工核对，不虚构订单、库存、支付链接或成交。',nextStep:'人工核对报价和履约条件，记录真实下单结果'},
  followup:{name:'适度跟进',goal:'补充有用信息，确认是否继续',instruction:'未收到回复时只作一次轻量跟进，提供与原需求有关的新帮助，允许对方暂缓。不制造紧迫感，不追问为何不回复，不连续催促。',nextStep:'等待回复；没有回复时停止继续追问'},
});
const eventTime = m => Date.parse(m.receivedAt || m.sentAt || m.createdAt) || 0;
const refusal = value => /(?:别|不要|不再|停止|禁止|不用).{0,5}(?:联系|打扰|推销|发消息|私信)|(?:不要|别)再发|退订|拉黑|不感兴趣|不买了|不考虑了/.test(value);
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
  const lastInbound = eventTime(incoming.at(-1)||{});
  const unanswered = relevant.filter(m=>m.status==='sent_manual'&&eventTime(m)>=lastInbound).sort((a,b)=>eventTime(a)-eventTime(b));
  if(unanswered.length>=2)return '已联系并跟进一次，等待客户回复后再继续';
  if(unanswered.length&&at-eventTime(unanswered.at(-1))<24*60*60*1000)return '上一条联系未满 24 小时，等待回复后再继续';
  return '';
}

export function buildSalesPlan({lead,op,scope,evidence=[],conversation=[],knowledge,at=Date.now()}) {
  const stopReason = salesStopReason({lead,op,evidence,at});
  const latest = [...conversation].reverse().find(m=>m.direction==='inbound')?.text;
  const query = latest || evidence.map(e=>e.text).join('\n');
  const sent = conversation.filter(m=>m.direction==='outbound');
  let skillId = 'discovery';
  if (!latest && !sent.length) skillId='opening';
  else if (conversation.at(-1)?.direction==='outbound') skillId='followup';
  else if (/太贵|贵了|贵一点|便宜|优惠|不放心|担心|考虑一下|再看看|没预算|怕|犹豫/.test(query)) skillId='objection';
  else if (/怎么买|怎么下单|下单|付款|购买链接|报价|多少钱|价格|来一|要一|订购/.test(query)) skillId='closing';
  else if (/区别|比较|哪款|哪个好|适合|推荐/.test(query)||op?.stage==='比较中') skillId='matching';
  const missing=[];
  if(!scope?.products.length) missing.push('尚未确定产品，先澄清需求');
  if(skillId==='closing'&&(!scope?.products.length||scope.products.some(p=>p.hasVariants?!(scope.skus||[]).some(s=>s.productId===p.id&&s.priceTerms):!p.priceTerms)))missing.push('规格或报价条件未齐，不能给出确定报价');
  if(!knowledge?.chunks.length)missing.push('未检索到相关补充资料，仅使用当前产品事实');
  const skill=SALES_SKILLS[skillId];
  return {version:SALES_STRATEGY_VERSION,skillId,...skill,stopReason,missing,
    rationale:latest?'依据当前账号和渠道收到的最新咨询':sent.length?'依据本次需求已登记的实际联系记录':'依据已核实的原始评论，尚未收到本次渠道的咨询',
    knowledgeHash:knowledge?.hash||'',references:[...(scope?.products||[]).map(p=>({kind:'product',id:p.id,title:p.name,source:p.source,revision:p.revision})),...(scope?.skus||[]).map(s=>({kind:'sku',id:s.id,title:s.name,source:s.source,revision:s.revision})),...(knowledge?.chunks||[]).map(({score,...r})=>({kind:'document',...r}))]};
}

export function assertSalesDraft(text,scope,additionalFacts='') {
  if(text.length>300)throw new Error('销售草稿超过 300 字，请重新生成');
  const prices = value => [...value.matchAll(/(?:[¥￥]\s*([\d,]+(?:\.\d+)?)|([\d,]+(?:\.\d+)?|[零〇一二两三四五六七八九十百千万]+)\s*(?:元|块|RMB|CNY))/gi)].map(m=>String(m[1]||m[2]).replaceAll(',',''));
  const amounts = prices(text);
  const terms = [...(scope?.skus||[]),...(scope?.products||[]).filter(p=>p.hasVariants===false)].map(s=>s.priceTerms||'').join('\n');
  const known = new Set(prices(terms));
  if(amounts.some(n=>!known.has(n)))throw new Error('报价缺少当前所选规格的依据，请先核对价格条件');
  const facts=[...(scope?.products||[]),...(scope?.skus||[])].map(p=>[p.facts,p.attributes].filter(Boolean).join(' ')).join('\n')+'\n'+additionalFacts;
  const affirmative = value => value.split(/[。！？\n；]/).filter(s=>!/(?:未|没|不)(?:明确|确认|确定|支持)|是否|待核|需核|不能确定|不保证/.test(s));
  const noDrill=/(?:免|无需|不用)打孔|不需要.{0,8}打孔/;
  if(affirmative(text).some(s=>noDrill.test(s))&&!affirmative(facts).some(s=>noDrill.test(s)))throw new Error('免打孔能力没有产品资料的明确支持，请改为待核对');
  if(/很合适|非常适合|最适合|完全适合|放心买|闭眼入/.test(text))throw new Error('适配条件尚需核实，请用有条件的建议代替确定适合的保证');
  if(/(?:店内|店里|本店|我们)(?:目前)?(?:仅|只有|只上架)|暂无其他款式|没有其他款式/.test(text))throw new Error('本次产品范围不代表全部商品，不能断言店内仅有这些产品');
  if(/保证成交|保证有效|百分百有效|已为你下单|已经下单成功|付款成功|最后[一二三\d]+件|仅剩[一二三\d]+件/.test(text))throw new Error('草稿包含未经核实的结果或库存承诺');
}
