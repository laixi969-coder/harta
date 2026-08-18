import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ADMIN_EMAIL, workspaceId } from "./auth.mjs";
import { packFromHunt } from "./pack-from-hunt.mjs";
import { generateBoards, generatePack, generateRefill } from "./generate.mjs";
import { checkPack } from "./check.mjs";
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

export async function addCustomer(email, input) {
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
  const pack = await generatePack(customer, { link: customer.link, material: input.material });
  pack.shareToken = crypto.randomBytes(16).toString("hex");
  pack.sharePath = `/p/${pack.shareToken}`;
  customer.packs = [pack];
  space.customers = space.customers.map((c) => ({ ...c, using: false }));
  space.customers.push(customer);
  space.usingId = customer.id;
  writeWorkspace(email, space);
  return { workspace: space };
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

/**
 * 补给：给一个已经在用素材的客户补一批新的。
 * 新的一批 unshift 到最前面成为当前档，上一批留在历史里能翻回去看。
 * 手动点，不定时跑：客户没在发的时候补货等于对着空气烧钱。
 */
export async function refillPack(email, customerId) {
  const space = readWorkspace(email);
  const c = (space.customers || []).find((x) => x.id === customerId);
  if (!c) return { error: "没有这个客户" };
  const prev = (c.packs || [])[0];
  if (!prev) return { error: "这个客户还没出过档，先出第一份" };

  const pack = await generateRefill(c, prev, space.feedback || {}, (c.packs.length || 0) + 1);
  pack.shareToken = crypto.randomBytes(16).toString("hex");
  pack.sharePath = `/p/${pack.shareToken}`;
  c.packs.unshift(pack);
  writeWorkspace(email, space);
  return { workspace: space };
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
