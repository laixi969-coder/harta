import fs from "node:fs";
import path from "node:path";
import { workspaceId } from "./auth.mjs";

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

export function readWorkspace(email) {
  const file = fileFor(email);
  if (!fs.existsSync(file)) {
    const blank = emptyWorkspace();
    fs.writeFileSync(file, JSON.stringify(blank, null, 2) + "\n");
    return blank;
  }
  return JSON.parse(fs.readFileSync(file, "utf8"));
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
