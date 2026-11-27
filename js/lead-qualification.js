import { isRealEvidence } from './evidence-kind.js';
import { blockedContactIdentities, contactIdentity, conversationHold, verifiedLeadSignal } from './contact-boundaries.js';
export {contactIdentity} from './contact-boundaries.js';

export const FIT = {unknown:'尚未核实', yes:'符合本业务条件', no:'已确认不适配'};
export const NEED = {unknown:'尚未核实', exploring:'泛了解或长期储备', specific:'有具体需求'};
export const COMMITMENT = {none:'尚无约定', appointment:'确认预约或试听', quote:'约定报价或方案', order:'确认打样或订购', brief:'确认商务简报或提案'};
export const LEVEL = {A:'A 级', B:'B 级', C:'C 级', pending:'待核实', unfit:'不适配', service:'售后 / 人工服务', paused:'暂缓跟进', won:'已成交', closed:'已结束', blocked:'停止联系'};
export const DEFAULT_POLICY = {
  fitCriteria:'客户的需求在本业务的产品、服务范围和交付条件内',
  actions:['appointment','quote','order','brief'], effectiveCondition:'commitment', reviewDays:30, revision:0
};
const DAY = 86400000;
const order = ['A','B','C','pending','service','paused','unfit','won','closed','blocked'];
const time = value => Date.parse(value) || 0;
const observed = value => time(value) ? value : '';
export const gradeLabel = result => (LEVEL[result.code] || LEVEL.pending) + (result.review ? ' · 待复核' : '');

export function qualificationPolicy(acquisition, customerId) {
  return (acquisition.qualificationPolicies || []).find(p => p.customerId === customerId) || DEFAULT_POLICY;
}

export function gradeFacts(facts, policy) {
  if (!facts || facts.cleared) return 'pending';
  if (facts.fit === 'no') return 'unfit';
  if (facts.fit === 'yes' && facts.need === 'specific' && policy.actions.includes(facts.commitment)) return 'A';
  if (facts.need === 'specific' || (facts.commitment && facts.commitment !== 'none')) return 'B';
  return facts.need === 'exploring' ? 'C' : 'pending';
}

function followupHint(code, facts, policy) {
  switch (code) {
    case 'A': return '落实客户已同意的事项，记录下一步和时间。';
    case 'B':
      if (facts.fit !== 'yes') return '核实客户是否符合本业务的适配条件。';
      if (facts.need !== 'specific') return '核实客户要解决的具体问题。';
      return '确认客户愿意推进的事项，例如' + policy.actions.map(key => COMMITMENT[key]).join('、') + '。';
    case 'C': return '保留客户关心的问题，等出现具体需求再跟进。';
    case 'unfit': return '保留不适配的依据，条件变化后可重新评定。';
    case 'service': return '先处理客户的服务事项。';
    case 'paused': return '等待客户重新提出需求或到约定时间复核。';
    case 'won': case 'closed': return '保留本次记录，再次购买可另建需求。';
    case 'blocked': return '尊重拒绝联系的记录。';
    default: return '根据客户原话或已核实的沟通记录评定。';
  }
}

function resultOrder(a, b) {
  const rank = r => r.review ? 2.5 : order.indexOf(r.code);
  return rank(a) - rank(b) || order.indexOf(a.code) - order.indexOf(b.code) ||
    time(b.assessment?.updatedAt) - time(a.assessment?.updatedAt);
}

// Build the evidence indexes once for a business, including historical records without an assessment.
export function qualificationDirectory(acquisition = {}, customerId, now = Date.now()) {
  const scoped = key => (acquisition[key] || []).filter(row => row.customerId === customerId && isRealEvidence(row));
  const workIds = new Set(scoped('works').map(w => w.id));
  const signals = new Map(scoped('signals').filter(s => verifiedLeadSignal(s,workIds)).map(s => [s.id,s]));
  const versions = key => new Map(scoped(key).map(row => [row.id,[row.revision || 0,row.status || '']]));
  const products = versions('products'), skus = versions('skus');
  const productVersions = (ids,catalog) => [...new Set(ids || [])].sort().map(id => [id,catalog.get(id) || null]);
  const opportunities = new Map();
  for (const op of scoped('opportunities')) {
    if (!opportunities.has(op.leadId)) opportunities.set(op.leadId, []);
    opportunities.get(op.leadId).push(op);
  }
  const policy = qualificationPolicy(acquisition, customerId);
  const contacts = new Map();
  const leads=scoped('leads'), blockedIdentities=blockedContactIdentities(acquisition,customerId,leads,signals);
  for (const lead of leads) {
    const linkedSignals = [...new Set(lead.signalIds || [])].map(id => signals.get(id)).filter(s => s && (!s.leadId || s.leadId === lead.id));
    const incoming = (lead.messages || []).filter(m => m.direction === 'inbound' && isRealEvidence(m));
    const blocked = blockedIdentities.has(contactIdentity(lead));
    const ops = opportunities.get(lead.id) || [];
    const scopes = (ops.length ? ops : [null]).map(op => {
      const refs = linkedSignals.filter(s => s.id && typeof s.text === 'string' && s.text.trim() && (!op || (op.signalIds || []).includes(s.id))).map(s => ({
        key:'signal:' + s.id, label:'已核实评论', text:s.text, url:s.url || '', at:observed(s.publishedAt), recordedAt:s.review?.at || s.collectedAt
      }));
      for (const m of incoming.filter(m => m.id && typeof m.text === 'string' && m.text.trim() && (m.opportunityId || '') === (op?.id || ''))) {
        refs.push({key:'message:' + m.id,label:'客户来信',text:m.text,url:'',at:observed(m.receivedAt || m.createdAt),recordedAt:m.createdAt || m.receivedAt});
      }
      const sales = !op && lead.openfindSales;
      let salesSource;
      if (sales?.id && ['qualified','quoted'].includes(sales.stage) && sales.need?.trim() && sales.timing?.trim()) {
        salesSource = {key:'sales:' + sales.id,label:'已核实的销售记录',text:sales.need + ' / ' + sales.timing,
          at:sales.qualifiedObservedAt || sales.updatedAt || '',recordedAt:sales.qualifiedObservedAt || sales.updatedAt};
        refs.push(salesSource);
      }
      refs.sort((a,b) => time(b.at || b.recordedAt) - time(a.at || a.recordedAt));
      const evidenceVersion = refs.length + '/' + refs.reduce((last,r) => Math.max(last,time(r.recordedAt),time(r.at)),0);
      const productBasis = op ? JSON.stringify([productVersions(op.productIds,products),productVersions(op.skuIds,skus)]) : '';
      const assessment = (op || lead).qualification;
      const derived = !assessment && salesSource ? {fit:'unknown',need:'specific',commitment:'none',sourceKey:salesSource.key,
        sourceLabel:salesSource.label,quote:salesSource.text,note:'销售记录已核实需求与时间。',observedAt:salesSource.at,updatedAt:salesSource.recordedAt,policyRevision:policy.revision} : null;
      const recorded = assessment && !assessment.cleared ? assessment : derived;
      const source = recorded && refs.find(r => r.key === recorded.sourceKey);
      const lost = recorded && recorded.sourceKey !== 'note' && (!source || source.text !== recorded.quote);
      const factsGrade = gradeFacts(recorded,policy);
      let code = lost ? 'pending' : factsGrade;
      const latest = refs.find(r => r !== salesSource);
      const hold = conversationHold(latest?.text);
      const tracks = lead.intentTracks || [];
      const activeTrack = kind => tracks.some(t => t.kind === kind && ['noted','replied'].includes(t.status));
      const serviceDone = !op && tracks.some(t => t.kind === 'service' && ['won','dropped'].includes(t.status) && time(t.updatedAt) >= time(latest?.recordedAt || latest?.at));
      const service = (hold === 'service' && !serviceDone) || (!op && activeTrack('service') && !activeTrack('buy') && !activeTrack('ad'));
      if (blocked) code = 'blocked';
      else if (service) code = 'service';
      else if ((op || lead).stage === '已成交') code = 'won';
      else if (op?.stage === '已结束') code = 'closed';
      else if ((!op && lead.stage === '暂不跟进') || hold === 'paused') code = 'paused';
      let review = '';
      if (recorded && ['A','B','C','pending','unfit'].includes(code)) {
        if (lost) review = '原依据已变更或移除';
        else if (recorded.policyRevision !== policy.revision) review = '本业务分级标准已更新';
        else if (op && recorded.productBasis !== productBasis) review = '本次需求的产品或规格资料已变化';
        else if (refs.some(r => time(r.recordedAt) > time(recorded.updatedAt))) review = '有新的客户依据';
        else if (!time(recorded.observedAt) || now - time(recorded.observedAt) >= policy.reviewDays * DAY) review = '距上次客户事实已到复核期';
      }
      const next = review ? review + '，先核对分级依据。' : followupHint(code, recorded, policy);
      return {scopeId:op?.id || '', opportunity:op, assessment, derived, evidenceVersion, productBasis, sources:refs, code, factsGrade, review, next};
    });
    const summary = [...scopes].sort(resultOrder)[0];
    contacts.set(lead.id,{lead,scopes,summary,blocked});
  }
  return {policy,contacts};
}

export function meetsEffectiveCondition(facts,policy) {
  return Boolean(facts && !facts.cleared && facts.note?.trim() && facts.policyRevision === policy.revision
    && facts.fit === 'yes' && facts.need === 'specific' && time(facts.observedAt)
    && (policy.effectiveCondition === 'fit-need' || policy.actions.includes(facts.commitment)));
}

// The commercial stage records sales activity. Qualification requires current facts.
export function effectiveContactDirectory(acquisition, customerId, now = Date.now()) {
  const {policy, contacts} = qualificationDirectory(acquisition, customerId, now);
  const effective = new Map();
  for (const {lead,scopes} of contacts.values()) {
    const key = contactIdentity(lead);
    for (const scope of scopes) {
      const facts = scope.assessment;
      if (scope.review || !['A','B'].includes(scope.code) || !meetsEffectiveCondition(facts,policy)
        || time(facts.observedAt) > now + 60000) continue;
      if (!effective.has(key)) effective.set(key, []);
      effective.get(key).push({lead,scope});
    }
  }
  return {policy, contacts, effective};
}

export function gradeDistribution(contacts) {
  const identities = new Map();
  for (const {lead,summary} of contacts.values()) {
    const id = lead.platform && lead.authorId ? JSON.stringify([lead.platform,lead.authorId]) : lead.id;
    const old = identities.get(id);
    if (!old || summary.code === 'blocked' || (old.code !== 'blocked' && resultOrder(summary, old) < 0)) identities.set(id,summary);
  }
  const counts = Object.fromEntries(Object.keys(LEVEL).map(code => [code,0]));
  for (const result of identities.values()) counts[result.code]++;
  return counts;
}
