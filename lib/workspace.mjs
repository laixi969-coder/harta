import fs from "node:fs";
import path from "node:path";
import { ADMIN_EMAIL, workspaceId } from "./auth.mjs";
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
  return String(email || "").toLowerCase() === ADMIN_EMAIL && space.seedVersion !== SEED_VERSION;
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

export function addCustomer(email, input) {
  const space = readWorkspace(email);
  const customer = {
    id: `c${Date.now()}`,
    name: String(input.name || "").trim(),
    hunt: String(input.hunt || "").trim(),
    pitch: String(input.pitch || "").trim(),
    city: String(input.city || "").trim(),
    using: space.customers.length === 0,
    packs: [],
  };
  if (!customer.name || !customer.pitch) {
    return { error: "至少要有客户名和一句话卖点" };
  }
  space.customers.push(customer);
  if (customer.using) space.usingId = customer.id;
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
