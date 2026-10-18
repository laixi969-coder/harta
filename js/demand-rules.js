// Shared by platform acquisition, saved evidence and the review queue.
export function demandLanguage(value = '') {
  const text = String(value);
  const resolved = /(?:已经|刚刚|刚|早就|已)(?:买到|买了|买好|购买|下单|预约|解决|找到|选好)|买好了|问题解决了|不用了|不需要了|不买了|不想买|不打算买|不要链接|不用给.{0,2}链接|不问价|已成交/.exec(text);
  const seller = /加我|私我|看我主页|看主页|厂家直销|我这有(?:货|现货|售|卖|提供)|我家有(?:货|现货|售|卖|提供)|专业代办|专业承接|招代理|招商加盟|有的亲|发给你链接/.exec(text);
  const purchasePath = /链接.{0,3}(?:给|发)(?:我|一个|个|一下)|(?:有|给|发).{0,4}链接(?:吗|么|[?？])|(?:求|蹲)个?链接|(?:在)?哪(?:里|儿)?买(?:的)?|怎么预约|如何预约|怎么买|想订|想下单|求联系方式|怎么联系|(?:在哪个|在哪家)医院|(?:约|订)(?:的)?哪家/.exec(text);
  const demand = purchasePath || /多少钱|花多少|花了多少|求报价|报价多少|什么价|多少价|问价|价格多少|预算|费用多少|怎么收费|想买|想做|想订|想了解|准备买|准备装修|求推荐|想找|求购|需要一个|需要一套|哪里有卖|还没买|(?:看|选|去|找)(?:哪家|哪个|哪里|哪儿)|(?:有|求).{0,6}(?:推荐|靠谱)|\d+(?:\.\d+)?\s*(?:w|万|元|块).{0,8}(?:吗|么|[?？])/i.exec(text);
  const urgent = /今天|明天|这周|本周|近期|最近|下周|急需|着急|马上|急急/.exec(text);
  return { resolved, seller, purchasePath, demand, urgent };
}

export function demandTime(createdAt, now = Date.now()) {
  const time = Date.parse(createdAt);
  const valid = Number.isFinite(time) && time <= now;
  return { ageDays: valid ? Math.floor((now - time) / 86400000) : null, recent: valid && time >= now - 7 * 86400000 };
}

export function demandKeywords(business = {}) {
  const city = String(business.city || '').trim();
  const topic = String(business.hunt || business.pitch || '').trim();
  const phrases = /宠物|动物|猫|狗/.test(topic + business.pitch)
    ? ['宠物医院 求推荐', '猫咪绝育 多少钱', '宠物体检 怎么预约']
    : [`${topic} 求推荐`, `${topic} 怎么收费`, `${topic} 怎么预约`];
  return [...new Set(phrases.map(p => `${city} ${p}`.trim()).filter(Boolean))].map(p => p.slice(0, 100));
}

export function topicRelevant(text, keyword = '') {
  // Already-neutered adoption posts are a different need from booking neutering.
  return !(/绝育|体检|宠物医院/.test(keyword) && !/领养|收养/.test(keyword) && /领养|收养|找领养/.test(text) && !/多少钱|怎么预约|求推荐|医院推荐/.test(text));
}
