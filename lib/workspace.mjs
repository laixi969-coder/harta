import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ADMIN_EMAIL, workspaceId } from "./auth.mjs";
import { packFromHunt } from "./pack-from-hunt.mjs";
import { generateBoards, generatePack, generateRefill } from "./generate.mjs";
import { checkPack } from "./check.mjs";
import { copyKey, shellKey } from "./pack-edits.mjs";
import { safeHuntName } from "./industry.mjs";
import { adminSeedWorkspace, SEED_VERSION } from "./pitch-seed.mjs";

const dir = () => path.join(process.cwd(), "data", "workspaces");

function emptyWorkspace() {
  return {
    customers: [],
    ledger: [],
    feedback: {},
    usingId: "",
  };
}

function fileFor(email) {
  fs.mkdirSync(dir(), { recursive: true });
  return path.join(dir(), `${workspaceId(email)}.json`);
}

function normalize(space) {
  const next = {
    customers: (space.customers || []).map((c) => ({
      ...c,
      packs: Array.isArray(c.packs) ? c.packs : [],
    })),
    ledger: space.ledger || [],
    feedback: space.feedback || {},
    usingId: space.usingId || "",
    seedVersion: space.seedVersion || 0,
  };
  return next;
}

function shouldSeedAdmin(email, space) {
  return (
    String(email || "").toLowerCase() === ADMIN_EMAIL &&
    space.customers.length === 0 &&
    space.seedVersion !== SEED_VERSION
  );
}

export function readWorkspace(email) {
  const file = fileFor(email);
  if (!fs.existsSync(file)) {
    const blank = emptyWorkspace();
    const data = shouldSeedAdmin(email, blank) ? adminSeedWorkspace() : blank;
    fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
    return data;
  }
  const raw = normalize(JSON.parse(fs.readFileSync(file, "utf8")));
  if (shouldSeedAdmin(email, raw)) {
    const seeded = adminSeedWorkspace();
    fs.writeFileSync(file, JSON.stringify(seeded, null, 2) + "\n");
    return seeded;
  }
  return raw;
}

export function writeWorkspace(email, data) {
  fs.writeFileSync(fileFor(email), JSON.stringify(data, null, 2) + "\n");
  return data;
}

/* ——— 出档是个长活，得在后台跑 ———
 * 实测一份快档 96 秒，一份补给档 155 秒。让 HTTP 请求等着有两个毛病：
 * 销售盯着转圈两分半，以及——更要命的——中途他改了别的东西，
 * 出档那条线握着两分钟前读出来的工作区写回去，把人家的改动整个盖掉。
 *
 * 所以规矩是：模型跑的时候手里不许攥着工作区。先跑模型，跑完再重新读一次，
 * 改完立刻写。 */

const running = new Map();

function jobKey(email, customerId) {
  return `${email}:${customerId}`;
}

/** 改一个客户身上的一小块，读改写就地完成，不跨越 await。 */
function touchCustomer(email, customerId, fn) {
  const space = readWorkspace(email);
  const c = (space.customers || []).find((x) => x.id === customerId);
  if (!c) return null;
  fn(c, space);
  writeWorkspace(email, space);
  return space;
}

/**
 * 后台出一份档。立刻返回，让界面先画出「正在出档」。
 * make() 只负责跑模型，不许碰工作区。
 */
function startJob(email, customerId, kind, make) {
  const key = jobKey(email, customerId);
  if (running.has(key)) return { error: "这个客户正在出档，等它跑完" };
  running.set(key, true);

  const started = touchCustomer(email, customerId, (c) => {
    c.job = { kind, startedAt: Date.now() };
    delete c.lastFail;
  });
  if (!started) {
    running.delete(key);
    return { error: "没有这个客户" };
  }

  (async () => {
    try {
      const pack = await make(started.customers.find((x) => x.id === customerId));
      pack.shareToken = crypto.randomBytes(16).toString("hex");
      pack.sharePath = `/p/${pack.shareToken}`;
      touchCustomer(email, customerId, (c) => {
        c.packs = [pack, ...(c.packs || [])];
        c.job = null;
      });
    } catch (err) {
      touchCustomer(email, customerId, (c) => {
        c.job = null;
        c.lastFail = err.message || "这次没出成";
      });
    } finally {
      running.delete(key);
    }
  })();

  return { workspace: started };
}

/* 进程重启会把内存里的 running 清空，硬盘上的 job 却还写着「跑着」。
 * 那种档永远不会自己回来，界面上得说清楚，不能一直转圈。 */
const JOB_STALE_MS = 25 * 60 * 1000;

export function sweepStaleJobs(email) {
  const space = readWorkspace(email);
  let dirty = false;
  for (const c of space.customers || []) {
    if (!c.job) continue;
    const dead = Date.now() - (c.job.startedAt || 0) > JOB_STALE_MS;
    if (dead && !running.has(jobKey(email, c.id))) {
      c.job = null;
      c.lastFail = "上次出档中断了（服务重启或超时），点重出再来一次";
      dirty = true;
    }
  }
  if (dirty) writeWorkspace(email, space);
  return space;
}

export function addCustomer(email, input) {
  const space = readWorkspace(email);
  const customer = {
    id: `c${Date.now()}`,
    name: String(input.name || "").trim(),
    hunt: String(input.hunt || "").trim(),
    pitch: String(input.pitch || "").trim(),
    city: String(input.city || "").trim(),
    link: String(input.link || "").trim(),
    using: true,
    packs: [],
  };
  if (!customer.name || !customer.pitch) {
    return { error: "至少要有客户名和一句话卖点" };
  }
  const hunt = safeHuntName(customer.hunt);
  if (!hunt) return { error: "猎场名只能是中英文数字，24 个字以内" };
  customer.hunt = hunt;

  // 客户先落地：销售刚填完一整张表，不能让他等模型，更不能因为模型没回就让他重填
  space.customers = space.customers.map((c) => ({ ...c, using: false }));
  space.customers.push(customer);
  space.usingId = customer.id;
  writeWorkspace(email, space);

  const material = String(input.material || "");
  return startJob(email, customer.id, "出档", (c) => generatePack(c, { link: c.link, material }));
}

/** 重出：上次没出成，或者出的不满意，照同一份资料再跑一次。新的排在最前面。 */
export function repack(email, customerId, input = {}) {
  const material = String(input.material || "");
  return startJob(email, customerId, "重出", (c) => generatePack(c, { link: c.link, material }));
}

/**
 * 补给：给一个已经在用素材的客户补一批新的。
 * 新的一批排到最前面成为当前档，上一批留在历史里能翻回去看。
 * 手动点，不定时跑：客户没在发的时候补货等于对着空气烧钱。
 */
export function refillPack(email, customerId) {
  const space = readWorkspace(email);
  const c = (space.customers || []).find((x) => x.id === customerId);
  if (!c) return { error: "没有这个客户" };
  if (!(c.packs || [])[0]) return { error: "这个客户还没出过档，先出第一份" };
  const feedback = space.feedback || {};
  return startJob(email, customerId, "补货", (cur) =>
    generateRefill(cur, cur.packs[0], feedback, (cur.packs.length || 0) + 1),
  );
}

export function setFeedback(email, key, value) {
  const space = readWorkspace(email);
  space.feedback = space.feedback || {};
  space.feedback[key] = value;
  writeWorkspace(email, space);
  return space;
}

export function setUsing(email, customerId) {
  const space = readWorkspace(email);
  if (!space.customers.some((c) => c.id === customerId)) {
    return { error: "没有这个客户" };
  }
  space.usingId = customerId;
  space.customers = space.customers.map((c) => ({ ...c, using: c.id === customerId }));
  writeWorkspace(email, space);
  return { workspace: space };
}

export function addLedger(email, row) {
  const space = readWorkspace(email);
  space.ledger.unshift({
    date: new Date().toISOString().slice(5, 10),
    client: row.client || "",
    hunt: row.hunt || "",
    result: row.result || "",
    quote: row.quote || "",
    talk: row.talk || "",
  });
  writeWorkspace(email, space);
  return space;
}

/** 甲方页只认 token，认不出就是认不出，不做模糊匹配。 */
export function findShared(token) {
  const clean = String(token || "");
  if (!/^[a-f0-9]{32}$/.test(clean)) return null;
  const files = fs.existsSync(dir()) ? fs.readdirSync(dir()) : [];
  for (const f of files) {
    if (!f.endsWith(".json")) continue;
    let space;
    try {
      space = JSON.parse(fs.readFileSync(path.join(dir(), f), "utf8"));
    } catch {
      continue;
    }
    for (const c of space.customers || []) {
      for (const p of c.packs || []) {
        if (p.shareToken === clean) return { pack: p, customer: c };
      }
    }
  }
  return null;
}

/* 改一条。存改动，不覆盖原句——原句是模型写的，改后是人写的，
 * 两个都留着才知道模型系统性差在哪。
 * 改完立刻重跑检查：销售完全可能改出一条红线，台子得当场说。 */
export function editLine(email, packId, key, text) {
  const now = String(text || "").trim();
  if (!now) return { error: "改成空的就等于删了，删不如不发" };
  if (now.length > 2000) return { error: "这一条太长了" };

  const space = readWorkspace(email);
  for (const c of space.customers || []) {
    const pack = (c.packs || []).find((p) => p.id === packId);
    if (!pack) continue;
    const was = originalOf(pack, key);
    if (was === null) return { error: "这一条不在这份档里" };
    pack.edits = pack.edits || {};
    if (now === was) delete pack.edits[key];
    else pack.edits[key] = { was, now, at: new Date().toISOString().slice(0, 10) };
    pack.checks = checkPack(pack, c.hunt);
    writeWorkspace(email, space);
    return { workspace: space };
  }
  return { error: "找不到这份档" };
}

/** key 指向的原句。指不到就是指不到，不猜。 */
function originalOf(pack, key) {
  for (const [group, lines] of Object.entries(pack.copies || {})) {
    for (let i = 0; i < (lines || []).length; i += 1) {
      if (copyKey(group, i) === key) return lines[i];
    }
  }
  for (const [plat, items] of Object.entries(pack.shells || {})) {
    for (let i = 0; i < (items || []).length; i += 1) {
      const item = typeof items[i] === "string" ? { title: items[i] } : items[i] || {};
      for (const f of ["cover", "title", "body"]) {
        if (item[f] && shellKey(plat, i, f) === key) return item[f];
      }
    }
  }
  return null;
}

/** 全档：客户有反应了才补分镜。不主动对没反应的客户跑。 */
export async function upgradeToFull(email, packId) {
  const space = readWorkspace(email);
  for (const c of space.customers || []) {
    const pack = (c.packs || []).find((p) => p.id === packId);
    if (!pack) continue;
    if (pack.boards?.length) return { workspace: space };
    pack.boards = await generateBoards(pack, c);
    pack.tier = pack.tier === "侦察档" ? "侦察档 + 分镜" : "全档";
    // 分镜是新出的话，检查要连它一起重跑，不然口播没人查
    pack.checks = checkPack(pack, c.hunt);
    writeWorkspace(email, space);
    return { workspace: space };
  }
  return { error: "找不到这份档" };
}
