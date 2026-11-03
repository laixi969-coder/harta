import fs from 'node:fs';
import path from 'node:path';

/* 追加式审计日志：一行一个动作，只记元数据（谁、何时、做了什么、对谁），
 * 不记内容与密钥。data/audit/ 不在备份排除清单里，随每日备份一起留存，
 * 事后追责记录比业务数据更不能丢。写入失败不阻断业务操作。 */
const clean = (value, max = 200) => String(value ?? '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, max);

const auditDir = (base) => path.join(base, 'data', 'audit');

export function recordAudit(actor, action, target = '', detail = '', base = process.cwd()) {
  try {
    const dir = auditDir(base);
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const file = path.join(dir, `audit-${new Date().toISOString().slice(0, 7)}.jsonl`);
    const line = JSON.stringify({ time: new Date().toISOString(), actor: clean(actor, 254), action: clean(action, 60), target: clean(target, 254), detail: clean(detail, 300) }) + '\n';
    fs.appendFileSync(file, line, { mode: 0o600 });
    fs.chmodSync(file, 0o600);
  } catch { /* 审计不能拖垮主流程 */ }
}

export function auditMonths(base = process.cwd()) {
  try {
    return fs.readdirSync(auditDir(base))
      .filter(name => /^audit-\d{4}-\d{2}\.jsonl$/.test(name))
      .map(name => name.slice(6, 13))
      .sort().reverse();
  } catch { return []; }
}

export function readAudit(month, { base = process.cwd(), limit = 500 } = {}) {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('月份格式不正确');
  const file = path.join(auditDir(base), `audit-${month}.jsonl`);
  if (!fs.existsSync(file)) return [];
  const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
  return lines.slice(-limit)
    .map(line => { try { return JSON.parse(line); } catch { return null; } })
    .filter(Boolean)
    .reverse(); // 最新在前
}
