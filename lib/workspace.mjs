import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ADMIN_EMAIL, workspaceId } from "./auth.mjs";
import { packFromHunt } from "./pack-from-hunt.mjs";
import { generateBoards, generatePack, generateTodayDrop } from "./generate.mjs";
import { buildDesk, isTrack } from "./desk.mjs";
import { checkPack } from "./check.mjs";
import { copyKey, shellKey } from "./pack-edits.mjs";
import { safeHuntName } from "./industry.mjs";
import { adminSeedWorkspace, SEED_VERSION } from "./pitch-seed.mjs";
import { today } from "./today.mjs";
import { materialTextForPack, readMaterialBatch, deleteMaterialBatch } from "./materials.mjs";
import { INPUT_LIMITS, textField } from "./input-limits.mjs";

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
    customers: (space.customers || []).map((c) => {
      const packs = (Array.isArray(c.packs) ? c.packs : []).map((pack) => ({
        ...pack,
        // 行业包和红线会更新。旧档每次读出来都按当前规则重查，不能继续带着旧检查结果复制。
        checks: checkPack(pack, c.hunt),
      }));
      const drops = (Array.isArray(c.drops) ? c.drops : []).map((drop) => ({
        ...drop,
        checks: checkPack(drop, c.hunt),
      }));
      return { ...c, packs, drops };
    }),
    ledger: (space.ledger || []).map((r) => ({ ...r })),
    feedback: space.feedback || {},
    usingId: space.usingId || "",
    seedVersion: space.seedVersion || 0,
  };
  /* 早先种进超管本子的三条演示台账没打标记，真记一笔之后就分不出来了。
   * 按内容精确认领补上标记：认的是原话，别的行不会被误伤。 */
  const DEMO_TALKS = new Set([
    "先把朋友圈那条发我",
    "基台是原厂的吗，先发我报价单",
    "先别发效果图，把适应症和分项价发我",
  ]);
  for (const r of next.ledger) {
    if (!r.demo && DEMO_TALKS.has(r.talk)) r.demo = true;
  }
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
  const { desk: _desk, ...rest } = data || {};
  void _desk;
  fs.writeFileSync(fileFor(email), JSON.stringify(rest, null, 2) + "\n");
  return data;
}

export function publicWorkspace(space) {
  return { ...space, desk: buildDesk(space) };
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
 * apply 决定结果怎么落：默认是往 packs 头上插一份新档；
 * 补分镜这种改老档的活，传自己的 apply，在最新读出来的客户上改。
 */
function startJob(email, customerId, kind, make, apply) {
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
      const made = await make(started.customers.find((x) => x.id === customerId));
      touchCustomer(email, customerId, (c, space) => {
        if (apply) {
          apply(c, space, made);
        } else {
          made.shareToken = crypto.randomBytes(16).toString("hex");
          made.sharePath = `/p/${made.shareToken}`;
          c.packs = [made, ...(c.packs || [])];
        }
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
 * 那种档永远不会自己回来，界面上得说清楚，不能一直转圈。
 * running 是在写 job 之前就挂上的：只要这台进程没在跑它，超出一小段宽限就是死档。
 * 宽限留 90 秒，兜住读文件的钟差；模型真挂在手里的情况另有 25 分钟上限。 */
const JOB_STALE_MS = 25 * 60 * 1000;
const JOB_GRACE_MS = 90 * 1000;

export function sweepStaleJobs(email) {
  const space = readWorkspace(email);
  let dirty = false;
  for (const c of space.customers || []) {
    if (!c.job) continue;
    const age = Date.now() - (c.job.startedAt || 0);
    const dead =
      age > JOB_STALE_MS || (!running.has(jobKey(email, c.id)) && age > JOB_GRACE_MS);
    if (dead) {
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
  const batch = input.materialBatchId ? readMaterialBatch(email, input.materialBatchId) : null;
  if (input.materialBatchId && !batch) return { error: "这批资料不存在或不属于当前账号，请重新上传" };
  const track = String(input.track || "").trim();
  if (!isTrack(track)) return { error: "建档时要说清是拓新还是存量" };
  const fields = {
    name: textField(input.name, "客户名", INPUT_LIMITS.customerName, { required: true }),
    city: textField(input.city, "城市", INPUT_LIMITS.city),
    pitch: textField(input.pitch, "一句话卖点", INPUT_LIMITS.pitch, { required: true }),
    link: textField(input.link, "客户网页链接", INPUT_LIMITS.materialUrl),
    material: textField(input.material, "销售补充", INPUT_LIMITS.salesMaterial),
  };
  const invalid = Object.values(fields).find((field) => field.error);
  if (invalid) return { error: invalid.error };
  const customer = {
    id: `c${Date.now()}`,
    name: fields.name.text,
    hunt: String(input.hunt || "").trim(),
    pitch: fields.pitch.text,
    city: fields.city.text,
    link: fields.link.text,
    track,
    materials: batch
      ? (batch.sources || []).map(({ text, storedName, ...source }) => source)
      : [],
    materialAnalysis: batch?.analysis || null,
    materialBatchId: batch?.id || "",
    salesMaterial: fields.material.text,
    using: true,
    packs: [],
    drops: [],
  };
  const hunt = safeHuntName(customer.hunt);
  if (!hunt) return { error: "猎场名只能是中英文数字，24 个字以内" };
  customer.hunt = hunt;

  // 客户先落地：销售刚填完一整张表，不能让他等模型，更不能因为模型没回就让他重填
  space.customers = space.customers.map((c) => ({ ...c, using: false }));
  space.customers.push(customer);
  space.usingId = customer.id;
  writeWorkspace(email, space);

  if (track === "存量") return dropToday(email, customer.id);

  // 销售亲手补的原话优先放前面；生成层控制上下文时也不会先吞掉这段。
  const material = [fields.material.text, materialTextForPack(batch)]
    .filter(Boolean)
    .join("\n\n【已读取的附件与网页】\n");
  return startJob(email, customer.id, "出判断", (c) => generatePack(c, { link: c.link, material }));
}

export function setTrack(email, customerId, track) {
  if (!isTrack(track)) return { error: "种类只认拓新还是存量" };
  const space = readWorkspace(email);
  const c = (space.customers || []).find((x) => x.id === customerId);
  if (!c) return { error: "没有这个客户" };
  c.track = track;
  writeWorkspace(email, space);
  return { workspace: space };
}

/* 资料包裹的删除与重建。新资料来了要能整批换掉：删的是归档原件、抽取正文、
 * 语音转写和资料梳理，之后出档不再带这些资料；历史出档不受影响。
 * 批次目录只有在没有任何客户引用时才真删，防止两个客户共用一批时误删。 */
function freeMaterialBatch(space, email, batchId, keepBatchId = "") {
  if (!batchId || batchId === keepBatchId) return;
  const stillUsed = (space.customers || []).some((c) => c.materialBatchId === batchId);
  if (!stillUsed) deleteMaterialBatch(email, batchId);
}

export function clearCustomerMaterials(email, customerId) {
  const space = readWorkspace(email);
  const c = (space.customers || []).find((x) => x.id === customerId);
  if (!c) return { error: "没有这个客户" };
  if (!c.materialBatchId && !(c.materials || []).length) {
    return { error: "这个客户还没有归档资料" };
  }
  const old = c.materialBatchId;
  c.materials = [];
  c.materialAnalysis = null;
  c.materialBatchId = "";
  // 先摘引用再释放：客户自己还挂着旧批次时，"仍被引用"永远为真
  freeMaterialBatch(space, email, old);
  writeWorkspace(email, space);
  return { workspace: space };
}

export function replaceCustomerMaterials(email, customerId, batchId) {
  const space = readWorkspace(email);
  const c = (space.customers || []).find((x) => x.id === customerId);
  if (!c) return { error: "没有这个客户" };
  const batch = readMaterialBatch(email, batchId);
  if (!batch) return { error: "这批资料不存在或不属于当前账号，请重新上传" };
  const old = c.materialBatchId;
  c.materials = (batch.sources || []).map(({ text, storedName, ...source }) => source);
  c.materialAnalysis = batch.analysis || null;
  c.materialBatchId = batch.id;
  freeMaterialBatch(space, email, old, batch.id);
  writeWorkspace(email, space);
  return { workspace: space };
}

/* 包裹页的删除：过时的、出废的档整份拿掉。甲方分享链接随之失效；
 * 台账记录和已记的回音不动——那是发生过的事，不跟着档一起消失。 */
export function removePack(email, customerId, packId) {
  const space = readWorkspace(email);
  const c = (space.customers || []).find((x) => x.id === customerId);
  if (!c) return { error: "没有这个客户" };
  const id = String(packId || "");
  const hadPack = (c.packs || []).some((p) => p.id === id);
  const hadDrop = (c.drops || []).some((p) => p.id === id);
  if (!hadPack && !hadDrop) return { error: "这份档已经不在了" };
  c.packs = (c.packs || []).filter((p) => p.id !== id);
  c.drops = (c.drops || []).filter((p) => p.id !== id);
  writeWorkspace(email, space);
  return { workspace: space };
}

/** 重出：上次没出成，或者出的不满意，照同一份资料再跑一次。新的排在最前面。 */
export function repack(email, customerId, input = {}) {
  const space = readWorkspace(email);
  const c = (space.customers || []).find((x) => x.id === customerId);
  if (!c) return { error: "没有这个客户" };
  if (!isTrack(c.track)) return { error: "先标明这家是拓新还是存量" };
  if (c.track === "存量") return dropToday(email, customerId);
  const extra = textField(input.material, "本次补充", INPUT_LIMITS.salesMaterial);
  if (extra.error) return { error: extra.error };
  return startJob(email, customerId, "重出", (cur) => {
    const archived = materialTextForPack(readMaterialBatch(email, cur.materialBatchId));
    const material = [cur.salesMaterial, extra.text, archived]
      .filter(Boolean)
      .join("\n\n【补充资料】\n");
    return generatePack(cur, { link: cur.link, material });
  });
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
  if (!isTrack(c.track)) return { error: "先标明这家是拓新还是存量" };
  if (c.track === "存量") return dropToday(email, customerId);
  return { error: "拓新客户出判断，不出每日内容" };
}

function applyTodayDrop(c, _space, made) {
  const day = today();
  made.date = day;
  made.shareToken = "";
  made.sharePath = "";
  const sameDay = (c.drops || []).filter((d) => d.date === day || d.deliveredAt === day || d.createdAt === day);
  made.batch = sameDay.length + 1;
  c.drops = [made, ...(c.drops || [])];
  c.lastDropAt = day;
  c.lastFail = undefined;
}

export function dropToday(email, customerId) {
  const space = readWorkspace(email);
  const c = (space.customers || []).find((x) => x.id === customerId);
  if (!c) return { error: "没有这个客户" };
  if (!isTrack(c.track)) return { error: "先标明这家是拓新还是存量" };
  if (c.track !== "存量") return { error: "拓新客户出判断，不出每日内容" };
  const feedback = space.feedback || {};
  return startJob(email, customerId, "出今日", (cur) => generateTodayDrop(cur, feedback), applyTodayDrop);
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

/* 记成问价/有兴趣/成交，且销售点明了是哪条带来的，那条就不用再点一遍「有回音」。
 * 台账和打法两条线在这里合上，进步的依据才算齐。没下文不算，不挂线也不算。 */
const POSITIVE_RESULTS = new Set(["问了价", "有兴趣", "成交"]);

/** 交上来的行 key 只有真实存在于这个客户名下的档里才认，别的 key 一律不写——
 *  不给人从台账口子伪造反馈的通道。 */
function ownedLineKey(space, clientName, line) {
  const want = String(line || "");
  if (!want) return "";
  const c = (space.customers || []).find((x) => x.name === clientName);
  if (!c) return "";
  for (const p of [...(c.packs || []), ...(c.drops || [])]) {
    for (const [group, lines] of Object.entries(p.copies || {})) {
      for (let i = 0; i < (lines || []).length; i += 1) {
        if (`${p.id}-${group}-${i}` === want) return want;
      }
    }
  }
  return "";
}

export function addLedger(email, row) {
  const space = readWorkspace(email);
  const quote = textField(row.quote, "报价", INPUT_LIMITS.ledgerQuote);
  const talk = textField(row.talk, "客户原话", INPUT_LIMITS.ledgerTalk, { required: true });
  if (quote.error || talk.error) return { error: quote.error || talk.error };
  space.ledger.unshift({
    date: today().slice(5),
    client: row.client || "",
    hunt: row.hunt || "",
    result: row.result || "",
    quote: quote.text,
    talk: talk.text,
  });
  const marked =
    POSITIVE_RESULTS.has(row.result) && ownedLineKey(space, row.client, row.line);
  if (marked) {
    space.feedback = space.feedback || {};
    space.feedback[marked] = "replied";
  }
  writeWorkspace(email, space);
  return { workspace: space, marked: Boolean(marked) };
}

/* ——— 全组一屏：只有超管进得来 ———
 * 负责人不天天开台子，他隔一阵要看的是一件事：哪条猎场真有回音。
 * 这里只给聚合数，不拆到人：销售之间互相看不见的规矩不变，
 * 演示台账行不吃进任何数字。 */
export function groupOverview(emails = []) {
  const hunts = new Map();
  const row = (hunt) => {
    const key = String(hunt || "").trim() || "未填猎场";
    let h = hunts.get(key);
    if (!h) {
      h = {
        hunt: key,
        sales: new Set(),
        customers: 0,
        packs: 0,
        replied: 0,
        dead: 0,
        asked: 0,
        deals: 0,
      };
      hunts.set(key, h);
    }
    return h;
  };
  const talks = [];
  for (const email of emails) {
    let space;
    try {
      space = readWorkspace(email);
    } catch {
      continue;
    }
    for (const c of space.customers || []) {
      const h = row(c.hunt);
      h.sales.add(email);
      h.customers += 1;
      h.packs += (c.packs || []).length + (c.drops || []).length;
      for (const p of [...(c.packs || []), ...(c.drops || [])]) {
        for (const [group, lines] of Object.entries(p.copies || {})) {
          for (let i = 0; i < (lines || []).length; i += 1) {
            const fb = (space.feedback || {})[`${p.id}-${group}-${i}`];
            if (fb === "replied") h.replied += 1;
            else if (fb === "dead") h.dead += 1;
          }
        }
      }
    }
    for (const r of space.ledger || []) {
      if (r.demo) continue;
      const h = row(r.hunt);
      if (r.result === "成交") h.deals += 1;
      else if (r.result === "问了价" || r.result === "有兴趣") h.asked += 1;
      if (r.talk) {
        talks.push({ date: r.date, client: r.client, hunt: r.hunt, result: r.result, talk: r.talk });
      }
    }
  }
  const out = [...hunts.values()].map((h) => ({ ...h, sales: h.sales.size }));
  out.sort(
    (a, b) => b.replied * 2 + b.deals * 5 + b.asked - (a.replied * 2 + a.deals * 5 + a.asked),
  );
  talks.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return { hunts: out, talks: talks.slice(0, 5) };
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
  if (now.length > INPUT_LIMITS.lineEdit) return { error: `这一条最多 ${INPUT_LIMITS.lineEdit} 个字` };

  const space = readWorkspace(email);
  for (const c of space.customers || []) {
    const pack = [...(c.packs || []), ...(c.drops || [])].find((p) => p.id === packId);
    if (!pack) continue;
    const was = originalOf(pack, key);
    if (was === null) return { error: "这一条不在这份档里" };
    pack.edits = pack.edits || {};
    if (now === was) delete pack.edits[key];
    else pack.edits[key] = { was, now, at: today() };
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

/** 全档：客户有反应了才补分镜。不主动对没反应的客户跑。
 * 一样是后台任务：分镜要跑一两分钟，攥着整份工作区等模型，
 * 期间销售的反馈和改动会在写回时被旧快照整个盖掉。 */
export function upgradeToFull(email, packId) {
  const space = readWorkspace(email);
  const c = (space.customers || []).find((x) => (x.packs || []).some((p) => p.id === packId));
  if (!c) return { error: "找不到这份档" };
  if ((c.packs || []).find((p) => p.id === packId)?.boards?.length) {
    return { workspace: space };
  }
  return startJob(email, c.id, "补分镜", (cur) => {
    const pack = (cur.packs || []).find((p) => p.id === packId);
    if (!pack) throw new Error("这份档不在了，刷新一下再试");
    return generateBoards(pack, cur);
  }, (cur, _space, boards) => {
    // 在最新读出来的客户身上找档再改：中间进来的反馈、新档都动不了
    const pack = (cur.packs || []).find((p) => p.id === packId);
    if (!pack) return;
    pack.boards = boards;
    pack.tier = pack.tier === "侦察档" ? "侦察档 + 分镜" : "全档";
    // 分镜是新出的话，检查要连它一起重跑，不然口播没人查
    pack.checks = checkPack(pack, cur.hunt);
  });
}
