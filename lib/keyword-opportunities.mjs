// 排序是可解释的内容规划规则，不是平台算法或获客概率。
const text = v => String(v ?? '').normalize('NFKC').trim();
export function metricNumber(raw) {
  const input = text(raw);
  if (input.includes(',') && !/^\d{1,3}(?:,\d{3})+(?:\.\d+)?(?:万|亿|[kKmM])?$/.test(input)) return null;
  const s = input.replace(/,/g, '');
  const match = s.match(/^(\d+(?:\.\d+)?)(万|亿|[kKmM])?$/);
  if (!match) return null;
  const value = Number(match[1]) * ({ 万: 1e4, 亿: 1e8, k: 1e3, K: 1e3, m: 1e6, M: 1e6 }[match[2]] || 1);
  return Number.isFinite(value) ? value : null;
}
function dateValue(raw) {
  const s = text(raw).replace(/年|月|\//g, '-').replace(/日/g, '');
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)?$/);
  if (!m) return '';
  const date = `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
  const stamp = Date.parse(date);
  return Number.isFinite(stamp) && new Date(stamp).toISOString().startsWith(date) ? date : '';
}
export function normalizeMetrics(row) {
  return (row.evidence || []).flatMap(source => {
    const fields = source.fields || [];
    const get = re => text(fields.find(f => re.test(text(f.name)))?.value);
    const date = dateValue(get(/^(数据日期|日期|统计日期|采集日期|date)$/i));
    const provider = get(/^(数据来源|来源|工具|provider)$/i) || source.file;
    return fields.filter(f => /指数|搜索量|检索量|搜索次数|笔记数|视频数|竞价|竞争度|搜索热度/.test(f.name)).map(f => {
      const name = text(f.name);
      const platform = /抖音/.test(name) ? '抖音' : /小红书/.test(name) ? '小红书' : /百度/.test(name) ? '百度' : /360|好搜/.test(name) ? '360' : row.platform || get(/^(平台|platform)$/i) || '未知平台';
      const kind = /竞价/.test(name) ? '广告竞争参考' : /笔记数|视频数/.test(name) ? '内容数量参考' : /竞争/.test(name) ? '口径待确认' : '关注度参考';
      return { name, raw: text(f.value), value: metricNumber(f.value), platform, date, provider, window:get(/^(统计周期|时间范围|周期|口径)$/) || '未注明周期', kind, file: source.file, sheet: source.sheet, row: source.row };
    });
  });
}
const grouping = m => JSON.stringify([m.name, m.platform, m.provider, m.window]);
const recent = (m, now) => m.date && now >= Date.parse(m.date) && now - Date.parse(m.date) <= 90 * 86400000;
function breakdown(row, batch) {
  const words = row.modifiers || [];
  const types = new Set(['需求词']);
  if (row.keyword === batch.scope.name || row.keyword === row.category) types.add('品类词');
  if (row.brand || batch.scope.type === '品牌') types.add('品牌相关词');
  if (/怎么|如何|为什么|吗|怎么办|避坑/.test(row.keyword)) types.add('问题词');
  if (row.stage === '比较') types.add('比较词');
  if (row.stage === '咨询') types.add('咨询词');
  if (words.length || row.stage !== '了解') types.add('具体需求词');
  return { types: [...types], scene: words.filter(x => /临街|卧室|办公室|儿童|老人|附近|上门/.test(x)), need: row.intent || '了解需求' };
}
export function buildKeywordOpportunities(customer, { now = Date.now(), limit = 24, platform = '' } = {}) {
  const business = text([customer.name,customer.hunt,customer.pitch,customer.salesMaterial,customer.sourceMaterial].filter(Boolean).join(' ')).toLowerCase();
  const rows = (customer.keywordLibraries || []).flatMap(batch => (batch.items || []).map(row => ({ batch, row, metrics: normalizeMetrics(row).filter(m=>!platform || m.platform===platform) }))).filter(entry => !platform || entry.row.platform===platform || entry.metrics.some(m=>m.platform===platform) || (!entry.row.platform && !normalizeMetrics(entry.row).some(m=>m.platform!=='未知平台')));
  const peers = new Map();
  for (const entry of rows) for (const m of entry.metrics) {
    if (m.kind !== '关注度参考' || m.value === null || m.platform === '未知平台' || !recent(m,now)) continue;
    const key = grouping(m) + m.date + JSON.stringify([entry.batch.scope,entry.row.category,entry.row.brand]);
    if (!peers.has(key)) peers.set(key,new Map());
    // 同词重复观测不增加权重。
    const words = peers.get(key);
    const word = text(entry.row.keyword).toLowerCase();
    if (!words.has(word)) words.set(word, new Set());
    words.get(word).add(m.value);
  }
  const peerValues = new Map([...peers].map(([key, values]) => [key, [...values.values()].filter(v=>v.size===1).map(v=>[...v][0]).sort((a,b)=>a-b)]));
  const ranked = rows.map(({batch,row,metrics}) => {
    const parts = breakdown(row,batch);
    if (parts.types.includes('具体需求词') && row.keyword !== batch.scope.name) parts.types.push('长尾需求候选');
    if (metrics.some(m=>m.kind==='关注度参考' && m.value>0)) parts.types.push('有流量参考数据');
    const reasons = [], gaps = [];
    // 具体品类优先于宽泛归属；调整方向和否定表述不能充当经营事实。
    const confirms = raw => {
      const value = text(raw).toLowerCase();
      if (value.length < 2 || !business.includes(value)) return false;
      return !business.split(/[，。；;\n]/).some(part => part.includes(value) && /不做|不卖|不经营|不代理|不提供|不支持|非代理|未代理|没有|不属于/.test(part));
    };
    const fit = confirms(row.category || batch.scope.name);
    const brand = row.brand || (batch.scope.type === '品牌' ? batch.scope.name : '');
    const foreignBrand = brand && !confirms(brand);
    const scores = { business: fit ? 40 : 0, intent: row.stage === '咨询' ? 25 : row.stage === '比较' ? 20 : parts.types.includes('问题词') ? 15 : 5, specificity: Math.min(15,(row.modifiers || []).length * 5 + (row.stage !== '了解' ? 5 : 0)), attention: 0, trend: 0 };
    reasons.push(fit ? '词的品类或归属与业务资料有文字匹配' : '业务资料尚未匹配该品类或归属');
    if (!fit) gaps.push('先确认该需求属于实际经营范围');
    if (foreignBrand) gaps.push(`品牌「${brand}」未在业务资料中确认，只可作为竞品或待确认对象`);
    const comparable = platform ? metrics.filter(m => m.kind === '关注度参考' && m.value !== null && m.platform !== '未知平台' && recent(m,now)) : [];
    // 同日冲突在整个同口径词组内判定；最新观测冲突时不能退回旧高点。
    const consistent = m => peers.get(grouping(m)+m.date+JSON.stringify([batch.scope,row.category,row.brand]))?.get(text(row.keyword).toLowerCase())?.size === 1;
    const latest = new Map();
    for (const m of comparable) if (!latest.has(grouping(m)) || m.date > latest.get(grouping(m))) latest.set(grouping(m),m.date);
    if (comparable.some(m=>!consistent(m))) gaps.push('同口径同日观测有冲突，相关热度和趋势不加分');
    let heat;
    for (const m of comparable.filter(m=>consistent(m) && m.date===latest.get(grouping(m)))) {
      const values = peerValues.get(grouping(m)+m.date+JSON.stringify([batch.scope,row.category,row.brand])) || [];
      if (values.length < 2) continue;
      let low=0, high=values.length;
      while(low<high) { const mid=Math.floor((low+high)/2); if(values[mid]<m.value) low=mid+1; else high=mid; }
      const points = Math.min(10, Math.round(10 * low / (values.length - 1)));
      if (!heat || points > heat.points) heat = { ...m, points, peers: values.length };
    }
    if (heat) { scores.attention = heat.points; reasons.push(`${heat.platform} ${heat.name}：${heat.raw}，仅在同来源、同日期、同指标的${heat.peers}个词中比较`); }
    else gaps.push(platform ? '缺少近期、同口径的可比较关注度数据，热度不加分' : '综合候选不混算平台热度，平台指标在对应平台下比较');
    const trends = [];
    const series = new Map();
    for (const m of comparable) { const key=grouping(m); if(!series.has(key))series.set(key,[]); series.get(key).push(m); }
    for (const values of series.values()) {
      const ordered = [...new Map(values.map(m=>[m.date,m])).values()].sort((a,b)=>a.date.localeCompare(b.date));
      if (ordered.length < 2) continue;
      const [previous,current] = ordered.slice(-2);
      if (!consistent(previous) || !consistent(current)) continue;
      const change = previous.value > 0 ? (current.value-previous.value)/previous.value : null;
      trends.push({ platform:current.platform, metric:current.name, from:previous.date, to:current.date, previous:previous.value, current:current.value, change });
    }
    if (trends.some(t=>t.change !== null && t.change > 0)) { scores.trend=5; reasons.push('同口径两次观测上升，仅作为时机参考'); }
    if (metrics.some(m=>!m.date)) gaps.push('部分指标没有数据日期，未用于热度和趋势加分');
    if (metrics.some(m=>m.kind !== '关注度参考')) gaps.push('竞价、内容数量和口径不明的竞争指标不当作自然流量竞争结论');
    const group = (batch.analysis?.groups || []).find(g=>g.ids.includes(row.id));
    const total = Object.values(scores).reduce((n,v)=>n+v,0);
    return { id:`${batch.id}:${row.id}`, batchId:batch.id, keywordId:row.id, keyword:row.keyword, scope:batch.scope, category:row.category, brand:row.brand, platform:platform || row.platform || '待选择', ...parts, stage:row.stage, topic:group?.topic || `${row.category || batch.scope.name} · ${parts.need}`, angle:group?.angle || `围绕“${row.keyword}”讲清判断条件与可行步骤`, consultation:row.stage === '咨询' ? '引导用户描述具体需求、服务地区和条件，再确认是否能提供服务；未提供报价不编造价格。' : '先回答这个具体问题，邀请有同类情况的用户补充条件，再判断是否需要进一步咨询。', evidenceNeeded:'发布前需补充本业务可核验的产品信息、服务范围或实际资料；导入词和指数不构成客户案例。', metrics, trends, score:total, scores, priority:!fit || foreignBrand ? '先确认业务匹配' : total >= 65 ? '优先制作' : '补充内容', reasons, gaps, classification:'Harta 内容规划规则推断，非获客概率' };
  }).sort((a,b)=>(a.priority==='先确认业务匹配')-(b.priority==='先确认业务匹配') || b.score-a.score || a.id.localeCompare(b.id));
  const platforms = [...new Set(ranked.flatMap(item => [item.platform, ...item.metrics.map(m=>m.platform)]).filter(p=>!['待选择','未知平台'].includes(p)))];
  const platformBriefs = platform ? [] : platforms.slice(0,12).map(name => ({ platform:name, basis: '平台专属指标只用于该平台；内容形式由生成时的业务资料与平台研究决定', items: buildKeywordOpportunities(customer,{now,limit:12,platform:name}).items.map(item => ({ product:item.category || item.scope.name, keyword:item.keyword, opportunityId:item.id, angle:item.angle, stage:item.stage, score:item.score, priority:item.priority, reasons:item.reasons, gaps:item.gaps, metrics:item.metrics, consultation:item.consultation, evidenceNeeded:item.evidenceNeeded })) }));
  return { platformCount:platforms.length, platformBriefs, version:1, checkedAt:new Date(now).toISOString(), total:ranked.length, items:ranked.slice(0,limit), note:'业务匹配40、意图25、具体性15、同口径关注度10、近期上升5；无数据不加分。分数不是平台算法或获客承诺。' };
}
