/* 行业包校准：把「模型猜的 D 级包」用真实跑出来的证据顶到 C/B 级。
 *
 * 三条硬规矩：
 * 1. 只改等级判断，不改包文件。策展包在上游手里，机器长的包也可能被人手改过，
 *    自动往里写正文迟早把人的编辑覆盖掉。校准结果单独存 data/industries/calibration/<行业>.json。
 * 2. 升级靠可数的证据，不靠模型感觉。差几条就写差几条。
 * 3. 单账号最多到 B。A 级要跨客户、跨城市的样本，一家客户给不出来，也不假装给。
 */

import fs from 'node:fs';
import path from 'node:path';
import { huntSource, readHunt, safeHuntName } from './industry.mjs';

const clean = (v, n = 200) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const calibDir = () => path.join(process.cwd(), 'data', 'industries', 'calibration');
const GRADE_ORDER = ['D', 'C', 'B', 'A'];

/** 包头写着哪个级别。没有标记的现场包按 D 算，策展包不回落到 D。 */
export function baseGradeOf(hunt) {
  const text = readHunt(hunt);
  const hit = text.match(/([ABCD])\s*级/);
  if (hit) return hit[1];
  return huntSource(hunt) === '现场生成' ? 'D' : '';
}

export function huntEvidence({ customer = {}, signals = [], works = [] } = {}) {
  const clusters = customer.painClusters?.clusters || [];
  const comments = (signals || []).filter((row) => !row.isAuthorReply && row.status !== 'excluded' && clean(row.text));
  return {
    comments: comments.length,
    clusters: clusters.length,
    repeated: clusters.filter((row) => Number(row.count) >= 5).length,
    replied: customer.playbook?.coverage?.replied || 0,
    teardowns: (customer.benchmarkTeardowns || []).length,
    accounts: (customer.accountTeardowns || []).length,
    keywords: (customer.keywordLibraries || []).reduce((n, batch) => n + (batch.items || []).length, 0),
    works: (works || []).filter((row) => row.customerId === customer.id || !customer.id).length,
  };
}

const STEPS = {
  C: [
    { key: 'comments', label: '真实评论', need: 30 },
    { key: 'clusters', label: '归集出的痛点主题', need: 3 },
    { key: 'replied', label: '有回音的内容', need: 1 },
    { key: 'teardowns', label: '拆解过的对标作品', need: 1 },
  ],
  B: [
    { key: 'repeated', label: '被 5 条以上评论复现的痛点', need: 2 },
    { key: 'replied', label: '有回音的内容', need: 5 },
    { key: 'accounts', label: '拆解过的博主', need: 2 },
  ],
};

function check(evidence, requirements) {
  return requirements.map((row) => ({ ...row, have: Number(evidence[row.key]) || 0, met: (Number(evidence[row.key]) || 0) >= row.need }));
}

/** 升级路径：D→C 看有没有真实语料，C→B 看痛点是否复现、有效内容是否够。 */
export function calibrateHunt(hunt, evidence, { source = huntSource(hunt), now = Date.now() } = {}) {
  const base = baseGradeOf(hunt) || 'D';
  const result = {
    hunt: safeHuntName(hunt) || String(hunt || ''),
    source,
    baseGrade: base,
    grade: base,
    evidence,
    checkedAt: new Date(now).toISOString(),
    method: '规则校准 · 可复核',
    steps: [],
    gaps: [],
    warnings: [],
  };
  // 策展包不因为一家客户的证据改等级，但证据照样给出来当补充。
  if (source === '策展') {
    const next = STEPS[GRADE_ORDER[Math.min(GRADE_ORDER.indexOf(base) + 1, 2)]] || [];
    result.gaps = next.length ? check(evidence, next).filter((row) => !row.met).map((row) => ({ ...row, missing: row.need - row.have })) : [];
    result.warnings.push('策展包由上游维护，单账号证据只作补充，不自动改等级。');
    return result;
  }
  for (const target of ['C', 'B']) {
    if (GRADE_ORDER.indexOf(result.grade) >= GRADE_ORDER.indexOf(target)) continue;
    const checked = check(evidence, STEPS[target]);
    if (checked.every((row) => row.met)) {
      result.grade = target;
      result.steps.push({ to: target, at: result.checkedAt, by: checked.map((row) => `${row.label} ${row.have}/${row.need}`) });
    } else {
      result.gaps = checked.filter((row) => !row.met).map((row) => ({ ...row, missing: row.need - row.have }));
      break;
    }
  }
  if (result.grade !== base) result.method = '规则校准 · 已升级';
  if (result.grade === 'B') result.warnings.push('单账号证据最多把包顶到 B 级；A 级需要跨客户、跨城市的样本。');
  if (base === 'D' && result.grade === 'D') result.warnings.push('仍是 D 级：这个包目前只有模型判断和行业常识，见真客户前别把它当结论。');
  return result;
}

/** 喂给提示词的，只有真实证据，不复述包里的猜测。 */
export function calibrationBrief(calibration) {
  if (!calibration) return '';
  const e = calibration.evidence || {};
  // 只有计数没有细节时不要注入：那几句模型本来就有，多一段只会占字数。
  const hasDetail = (calibration.clusters || []).length || (calibration.validated || []).length || (calibration.structures || []).length;
  if (!hasDetail) return '';
  const lines = [`# 本行业已用真实数据校准（${calibration.grade || calibration.baseGrade} 级，样本：评论 ${e.comments || 0} 条、拆解 ${e.teardowns || 0} 条、有回音内容 ${e.replied || 0} 篇）`];
  if (calibration.clusters?.length) {
    lines.push('- 这个业务采集到的评论里，反复出现这些卡点（按条数，不代表行业整体）：');
    calibration.clusters.slice(0, 4).forEach((row) => {
      const quote = row.quotes?.[0]?.text ? `，原话「${clean(row.quotes[0].text, 60)}」` : '';
      lines.push(`  · ${clean(row.topic, 40)}：${row.count} 条${quote}`);
    });
  }
  if (calibration.validated?.length) {
    lines.push('- 这个业务已经跑出回音的角度（可沿用节奏，不可复用具体案例）：');
    calibration.validated.slice(0, 3).forEach((row) => lines.push(`  · ${clean(row.angle, 80)}（有回音 ${row.hits} 次）`));
  }
  if (calibration.structures?.length) {
    lines.push('- 对标拆解出来、可以迁移的结构：');
    calibration.structures.slice(0, 3).forEach((row) => lines.push(`  · ${clean(row, 100)}`));
  }
  lines.push('边界：以上只代表当前业务采集到的样本，不能当成整个行业的统计结论；缺数据的部分按业务资料如实写，不要补。');
  return `\n${lines.join('\n')}\n`;
}

/** 把要注入的证据挂到校准档案上，落盘时一起存。 */
export function withCalibrationEvidence(calibration, customer = {}) {
  return {
    ...calibration,
    clusters: (customer.painClusters?.clusters || []).map((row) => ({ topic: row.topic, count: row.count, quotes: row.quotes || [] })),
    validated: (customer.playbook?.cards || []).map((row) => ({ angle: row.angle, hits: row.hits || 1 })),
    structures: (customer.benchmarkTeardowns || []).flatMap((row) => row.transferable || []),
  };
}

export function readCalibration(hunt) {
  const name = safeHuntName(hunt);
  if (!name) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(calibDir(), `${name}.json`), 'utf8'));
    return raw && typeof raw === 'object' ? raw : null;
  } catch { return null; }
}

export function saveCalibration(calibration) {
  const name = safeHuntName(calibration?.hunt);
  if (!name) throw new Error('这个行业名不能当文件名');
  fs.mkdirSync(calibDir(), { recursive: true });
  const file = path.join(calibDir(), `${name}.json`);
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(calibration, null, 2));
  fs.renameSync(temp, file);
  return calibration;
}
