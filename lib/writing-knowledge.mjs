/* 写作知识库：把这个客户自己验证过的写法，变成下一篇的依据。
 *
 * 现在改写吃的是写死的通用规则（更吸引人、更像真人说话），对每个客户说一样的话。
 * 真正该喂给模型的是三样东西，而且都来自真实数据：
 *   1. 有回音的内容怎么开头、从哪切、拿什么当证据
 *   2. 销售自己反复改掉的写法（原句 → 改后），这是最便宜的语气标注
 *   3. 只有一段的真实语气样本
 *
 * 没有回音、没改过稿就是空的，不编。空的时候就说空。 */

import { attributionEntries } from '../js/acquisition.js';
import { edited, shellKey } from './pack-edits.mjs';
import crypto from 'node:crypto';
import {latestOutcomes} from '../js/creator-review.js';
import {isRealEvidence} from '../js/evidence-kind.js';

const clean = (v, n = 300) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const firstSentence = (text) => {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  const cut = value.split(/(?<=[。！？!?])/)[0] || value;
  return clean(cut, 80);
};
const normalize = (text) => String(text || '').replace(/[\s\p{P}]/gu, '').slice(0, 120);

export function feedbackVersion(customer,pack,entry,space={}) {
  if (entry.kind!=='shell') return {body:entry.text,source:'采用文案'};
  const key=entry.platform+'|'+entry.index;
  const linked=new Set(entry.contentKeys.map(k=>space.contentStates?.[k]?.publicationId).filter(Boolean));
  const pubs=(space.acquisition?.publications||[]).filter(p=>p.customerId===customer.id&&p.packId===pack.id&&p.platform===entry.platform&&p.index===entry.index&&p.status==='published'&&isRealEvidence(p));
  const matches=linked.size?pubs.filter(p=>linked.has(p.id)):pubs;
  if(matches.length===1 && matches[0].content?.body){
    const p=matches[0];return {body:p.content.body,source:'登记发布版本',publicationId:p.id,accountId:p.accountId,account:p.accountName||p.accountId,goal:p.goal,publishedAt:p.publishedAt};
  }
  const raw=pack.shells?.[entry.platform]?.[entry.index];
  return {body:edited(pack,shellKey(entry.platform,entry.index,'body'),raw?.body||(typeof raw==='string'?raw:'')),source:matches.length>1?'采用文案（发布版本待区分）':'采用文案'};
}

export function observedPerformance(row) {
  const m=row.metrics||{};
  if (row.goal==='sales' && m.orders>0) return '已记录订单，复核成交来源与适用条件';
  if (m.qualifiedLeads>0) return '已记录有效咨询，可在相同受众中复测这个切口';
  if (m.orders>0) return '已记录订单，复核成交来源与适用条件';
  if (m.collects>0 && m.inquiries===0) return '有收藏，记录的咨询为零，可测试承接方式';
  if (m.collects>0 && m.qualifiedLeads===0) return '有收藏，记录的有效咨询为零，可复核咨询对象和承接方式';
  if (m.views===0 || (row.baselineViews>0 && m.views<row.baselineViews) || (row.goal==='reach'&&row.baseline>0&&m.views<row.baseline)) return '曝光不足，先核对分发再复测';
  if (m.shares>0 && row.goal==='spread') return '已有分享，复测同类读者是否仍愿意转发';
  return '继续观察同账号、同平台和相同统计窗口';
}

export function validatedPosts(customer, feedback = {}, space={}) {
  const rows=[],seen=new Set();
  for(const pack of [...(customer?.packs||[]),...(customer?.drops||[])]){
    for(const entry of attributionEntries(pack)){
      if(feedback[entry.key]!=='replied')continue;
      const version=pack.feedbackVersions?.[entry.key]||feedbackVersion(customer,pack,entry,space);
      const text=clean(version.body,1200);
      const fingerprint=JSON.stringify([entry.platform,version.accountId||version.account||'',normalize(text)]);
      if(!text||seen.has(fingerprint))continue;
      seen.add(fingerprint);
      const execution=(entry.kind==='shell'&&pack.execution?.[entry.index])||{};
      rows.push({packId:pack.id,key:entry.key,platform:entry.platform||'文案',text,opener:firstSentence(text),
        versionSource:version.source,account:version.account,goal:version.goal||pack.origin?.goal||customer.growthGoal,
        angle:angleOfExecution(execution),proof:clean(execution.brief?.evidence,200),action:clean(execution.brief?.nextStep,200),
        plannedAt:version.publishedAt||pack.date||pack.origin?.createdAt||''});
    }
  }
  return rows;
}

const angleOfExecution = (execution = {}) => clean(execution.brief?.question || execution.reason || execution.purpose, 200);

/**
 * 按角度记有回音 / 没反应。这是「进化」唯一的依据：
 * 无回音记录用于提示复测，发布效果另按账号和窗口观察。
 */
export function angleOutcomes(customer, feedback = {}) {
  const map = new Map();
  for (const pack of [...(customer?.packs || []), ...(customer?.drops || [])]) {
    for (const entry of attributionEntries(pack)) {
      const outcome = feedback[entry.key];
      if (outcome !== 'replied' && outcome !== 'dead') continue;
      const execution = (entry.kind === 'shell' ? pack.execution?.[entry.index] : null) || {};
      const angle = angleOfExecution(execution);
      if (!angle) continue;
      const row = map.get(angle) || { angle, hits: 0, misses: 0 };
      if (outcome === 'replied') row.hits += 1;
      else row.misses += 1;
      map.set(angle, row);
    }
  }
  return [...map.values()];
}

/** 改稿记录：销售把模型写的什么改成了什么。同一种改法出现两次以上才算偏好。 */
export function editRules(customer) {
  const packs = [...(customer?.packs || []), ...(customer?.drops || [])];
  const tally = new Map();
  for (const pack of packs) {
    for (const [key, edit] of Object.entries(pack.edits || {})) {
      const was = clean(edit?.was, 200), now = clean(edit?.now, 200);
      if (!was || !now || was === now) continue;
      // 整篇替换不是语气偏好，是重写，跳过。
      if (was.length > 80 || now.length > 80) continue;
      const id = `${was}\u0000${now}`;
      const row = tally.get(id) || { was, now, count: 0, field: key.split('|').at(-1) || '' };
      row.count += 1;
      tally.set(id, row);
    }
  }
  return [...tally.values()].sort((a, b) => b.count - a.count).slice(0, 8);
}

export function distillPlaybook(customer, feedback = {}, { now = Date.now(), limit = 10, previous = null, space = {} } = {}) {
  const validated = validatedPosts(customer, feedback, space);
  const outcomes = angleOutcomes(customer, feedback);
  const outcomeOf = new Map(outcomes.map((row) => [row.angle, row]));
  const packs = [...(customer?.packs || []), ...(customer?.drops || [])];
  const retest=outcomes.filter(row=>row.misses>=2&&row.hits===0).map(({angle,misses})=>({angle,misses}));
  const performance=latestOutcomes(customer).map(item=>item.row).filter(row=>row.publicationId&&row.accountId&&row.start&&row.end).map(row=>({
    platform:row.platform,account:row.accountName||row.accountId,goal:row.goal,start:row.start,end:row.end,source:row.source,
    publishedAt:row.publishedAt,opener:firstSentence(row.content?.body||''),metrics:row.metrics,advice:observedPerformance(row)
  })).sort((a,b)=>String(b.end).localeCompare(String(a.end))).slice(0,8);
  const cards = validated
    .map((row, index) => {
      const outcome = outcomeOf.get(row.angle) || { hits: 1, misses: 0 };
      const ageDays = row.plannedAt && Number.isFinite(Date.parse(row.plannedAt))
        ? Math.floor((now - Date.parse(row.plannedAt)) / 86400000)
        : null;
      return {
        id: `W${index + 1}`,
        kind: row.platform,versionSource:row.versionSource,account:row.account,goal:row.goal,
        angle: row.angle,
        opener: row.opener,
        proof: row.proof,
        action: row.action,
        sample: row.text.slice(0, 400),
        sourceKey: row.key,
        packId: row.packId,
        plannedAt: row.plannedAt,
        hits: outcome.hits,
        misses: outcome.misses,
        ageDays,
      };
    })
    // 回音多的优先；同龄时新的优先，旧写法自然往后排。
    .sort((a, b) => b.hits - a.hits || (a.ageDays ?? 9999) - (b.ageDays ?? 9999))
    .slice(0, limit);
  const edits = editRules(customer);
  const tone = edits.slice(0,3).map(rule=>rule.now);
  const warnings = [];
  if (!validated.length) warnings.push('还没有「有回音」的内容：这批改写只能按业务资料写，不能声称用过已验证写法。');
  if (!edits.length) warnings.push('还没有攒够改稿记录：语气偏好为空，改完稿会自动开始积累。');
  if (validated.length && validated.length < 3) warnings.push(`只有 ${validated.length} 条有回音的内容，样本偏少，方法卡只作参考。`);
  if(retest.length) warnings.push(`${retest.length} 个角度待复测，请核对曝光和统计窗口。`);
  const next = {
    version: 3,
    updatedAt: new Date(now).toISOString(),
    cards,
    tone,
    editRules: edits,
    retired:[],retest,performance,
    coverage: { packs: packs.length, replied: validated.length, edits: edits.reduce((n, row) => n + row.count, 0) },
    warnings,
  };
  // 进化记录：跟上一次的底稿比，新增了哪些角度、淘汰了哪些，一看就知道系统学到了什么。
  if (previous) {
    const before = new Set((previous.cards || []).map((card) => card.angle));
    const nowKeys = new Set(cards.map((card) => card.angle));
    next.evolution = {
      at: next.updatedAt,
      added: cards.filter((card) => !before.has(card.angle)).map((card) => card.angle).slice(0, 8),
      dropped: [...before].filter((angle) => !nowKeys.has(angle)).slice(0, 8),
      retired:[],
      retest:retest.map(row=>row.angle),
    };
  }
  return next;
}

export function playbookHash(playbook) {
  return crypto.createHash('sha256').update(JSON.stringify([playbook?.cards || [], playbook?.tone || [], playbook?.editRules || [],playbook?.retest||[],playbook?.performance||[],playbook?.version])).digest('hex');
}

/** 拼进改写提示词的文本。空知识库返回空串，调用方据此不要伪造依据。 */
export function writingBrief(playbook) {
  if (!playbook) return '';
  const cards = (playbook.cards || []).slice(0, 5);
  const rules = (playbook.editRules || []).slice(0, 6);
  const tone = (playbook.tone || []).slice(0, 3);
  if (!cards.length && !rules.length && !tone.length && !playbook.retest?.length && !playbook.performance?.length) return '';
  const lines = ['# 这个业务自己验证过的写法（来自真实有回音的反馈与采用文案，具体版本见各条记录）'];
  cards.forEach((card, i) => {
    lines.push(`${i + 1}. ${card.versionSource||'历史反馈'} · ${card.kind} · ${card.account||'账号未记录'} · ${card.goal||'目标未记录'}。角度：${card.angle || '未记录'}（有回音 ${card.hits || 1} 次）；开头：${card.opener || '未记录'}${card.proof ? `；证据：${card.proof}` : ''}${card.action ? `；行动：${card.action}` : ''}`);
  });
  if (rules.length) {
    lines.push('# 这个人反复改掉的写法（左为原句，右为改后，数字是出现次数）');
    rules.forEach((rule) => lines.push(`「${rule.was}」→「${rule.now}」（${rule.count} 次）`));
  }
  if (tone.length) {
    lines.push('# 语气样本，照这个说话，不要改腔');
    tone.forEach((line) => lines.push(`- ${line}`));
  }
  for(const row of playbook.retest||[])lines.push('待复测角度：'+row.angle+'，已记录 '+row.misses+' 次没有回音，尚不足以判断角度无效。');
  for(const row of playbook.performance||[])lines.push(`发布观察：${row.account} · ${row.platform} · ${row.goal} · ${row.start} 至 ${row.end}（${row.source}），实际开头「${row.opener}」，${JSON.stringify(row.metrics)}。${row.advice}。`);
  lines.push('以上只能作为待验证经验，不得复用具体案例、数字和身份。');
  return `\n${lines.join('\n')}\n`;
}

/** 刷新并存回客户档案；内容没变就不写盘。 */
export function refreshPlaybook(space, customer, feedback = space.feedback || {}, now = Date.now()) {
  const next = distillPlaybook(customer, feedback, { now, previous: customer.playbook || null, space });
  if (customer.playbook && playbookHash(customer.playbook) === playbookHash(next)) return customer.playbook;
  customer.playbook = next;
  return next;
}
