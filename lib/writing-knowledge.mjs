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
import { editOf, shellKey } from './pack-edits.mjs';
import crypto from 'node:crypto';

const clean = (v, n = 300) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const firstSentence = (text) => {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  const cut = value.split(/(?<=[。！？!?])/)[0] || value;
  return clean(cut, 80);
};
const normalize = (text) => String(text || '').replace(/[\s\p{P}]/gu, '').slice(0, 120);

/** 有回音的篇目：键必须能在 feedback 里对上，且该业务名下真实存在。 */
export function validatedPosts(customer, feedback = {}) {
  const packs = [...(customer?.packs || []), ...(customer?.drops || [])];
  const rows = [];
  const seen = new Set();
  for (const pack of packs) {
    for (const entry of attributionEntries(pack)) {
      const outcome = feedback[entry.key];
      if (outcome !== 'replied') continue;
      const text = clean(entry.text, 1200);
      if (!text) continue;
      const fingerprint = normalize(text);
      if (seen.has(fingerprint)) continue;
      seen.add(fingerprint);
      const index = postIndexOf(entry);
      const execution = (entry.kind === 'shell' ? pack.execution?.[index] : null) || {};
      // 开头看正文第一句；标题单独拼进来会把开头认成标题。
      const body = entry.kind === 'shell' && typeof pack.shells?.[entry.platform]?.[index]?.body === 'string'
        ? clean(pack.shells[entry.platform][index].body, 1200)
        : text;
      rows.push({
        packId: pack.id,
        key: entry.key,
        platform: entry.platform || '文案',
        text,
        opener: firstSentence(body),
        angle: angleOfExecution(execution),
        proof: clean(execution.brief?.evidence, 200),
        action: clean(execution.brief?.nextStep, 200),
        plannedAt: pack.date || pack.origin?.createdAt || '',
      });
    }
  }
  return rows;
}

const postIndexOf = (entry) => entry.kind === 'shell'
  ? Number(String(entry.group).match(/第 (\d+) 条/)?.[1] || 1) - 1
  : 0;

const angleOfExecution = (execution = {}) => clean(execution.brief?.question || execution.reason || execution.purpose, 200);

/**
 * 按角度记有回音 / 没反应。这是「进化」唯一的依据：
 * 同一个角度跑两次没回音，就不再拿它写下一篇。
 */
export function angleOutcomes(customer, feedback = {}) {
  const map = new Map();
  for (const pack of [...(customer?.packs || []), ...(customer?.drops || [])]) {
    for (const entry of attributionEntries(pack)) {
      const outcome = feedback[entry.key];
      if (outcome !== 'replied' && outcome !== 'dead') continue;
      const execution = (entry.kind === 'shell' ? pack.execution?.[postIndexOf(entry)] : null) || {};
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

export function distillPlaybook(customer, feedback = {}, { now = Date.now(), limit = 10, previous = null } = {}) {
  const validated = validatedPosts(customer, feedback);
  const outcomes = angleOutcomes(customer, feedback);
  const outcomeOf = new Map(outcomes.map((row) => [row.angle, row]));
  const packs = [...(customer?.packs || []), ...(customer?.drops || [])];
  // 淘汰：跑过两次以上、一次回音都没有的角度，不再当经验用，但要留痕。
  const retired = outcomes.filter((row) => row.misses >= 2 && row.hits === 0).map((row) => ({ angle: row.angle, misses: row.misses }));
  const retiredSet = new Set(retired.map((row) => row.angle));
  const cards = validated
    .filter((row) => !retiredSet.has(row.angle))
    .map((row, index) => {
      const outcome = outcomeOf.get(row.angle) || { hits: 1, misses: 0 };
      const ageDays = row.plannedAt && Number.isFinite(Date.parse(row.plannedAt))
        ? Math.floor((now - Date.parse(row.plannedAt)) / 86400000)
        : null;
      return {
        id: `W${index + 1}`,
        kind: row.platform,
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
  const tone = validated.slice(0, 3).map((row) => firstSentence(row.text)).filter(Boolean);
  const edits = editRules(customer);
  const warnings = [];
  if (!validated.length) warnings.push('还没有「有回音」的内容：这批改写只能按业务资料写，不能声称用过已验证写法。');
  if (!edits.length) warnings.push('还没有攒够改稿记录：语气偏好为空，改完稿会自动开始积累。');
  if (validated.length && validated.length < 3) warnings.push(`只有 ${validated.length} 条有回音的内容，样本偏少，方法卡只作参考。`);
  if (retired.length) warnings.push(`有 ${retired.length} 个角度跑过两次以上都没回音，已不再当经验用。`);
  const next = {
    version: 2,
    updatedAt: new Date(now).toISOString(),
    cards,
    tone,
    editRules: edits,
    retired,
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
      retired: retired.map((row) => row.angle).slice(0, 8),
    };
  }
  return next;
}

export function playbookHash(playbook) {
  return crypto.createHash('sha256').update(JSON.stringify([playbook?.cards || [], playbook?.tone || [], playbook?.editRules || []])).digest('hex');
}

/** 拼进改写提示词的文本。空知识库返回空串，调用方据此不要伪造依据。 */
export function writingBrief(playbook) {
  if (!playbook) return '';
  const cards = (playbook.cards || []).slice(0, 5);
  const rules = (playbook.editRules || []).slice(0, 6);
  const tone = (playbook.tone || []).slice(0, 3);
  if (!cards.length && !rules.length && !tone.length) return '';
  const lines = ['# 这个业务自己验证过的写法（来自真实有回音的已发布内容，不是通用套路）'];
  cards.forEach((card, i) => {
    lines.push(`${i + 1}. 角度：${card.angle || '未记录'}（有回音 ${card.hits || 1} 次）；开头：${card.opener || '未记录'}${card.proof ? `；证据：${card.proof}` : ''}${card.action ? `；行动：${card.action}` : ''}`);
  });
  if (rules.length) {
    lines.push('# 这个人反复改掉的写法（左为原句，右为改后，数字是出现次数）');
    rules.forEach((rule) => lines.push(`「${rule.was}」→「${rule.now}」（${rule.count} 次）`));
  }
  if (tone.length) {
    lines.push('# 语气样本，照这个说话，不要改腔');
    tone.forEach((line) => lines.push(`- ${line}`));
  }
  if ((playbook.retired || []).length) {
    lines.push('# 已经试过、没有回音的角度，不要再写');
    playbook.retired.slice(0, 5).forEach((row) => lines.push(`- ${row.angle}（${row.misses} 次没反应）`));
  }
  lines.push('以上是这个客户已经跑通过的写法。沿用其节奏和口吻，但不得复用具体案例、数字和身份；与本次调整要求冲突时，以调整要求为准。');
  return `\n${lines.join('\n')}\n`;
}

/** 刷新并存回客户档案；内容没变就不写盘。 */
export function refreshPlaybook(space, customer, feedback = space.feedback || {}, now = Date.now()) {
  const next = distillPlaybook(customer, feedback, { now, previous: customer.playbook || null });
  if (customer.playbook && playbookHash(customer.playbook) === playbookHash(next)) return customer.playbook;
  customer.playbook = next;
  return next;
}
