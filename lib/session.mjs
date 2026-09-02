import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/* 会话以前只是 server.mjs 里的一个内存 Map：cookie 给了浏览器七天，
 * Map 却随进程死。每次部署重启，所有人都被踢回登录页。
 * 现在落到 data/sessions.json，重启照旧认账。 */

const dataDir = () => path.join(process.cwd(), "data");
const filePath = () => path.join(dataDir(), "sessions.json");
const WEEK = 7 * 24 * 3600 * 1000;

let cache = null;

function readDisk() {
  try {
    const data = JSON.parse(fs.readFileSync(filePath(), "utf8"));
    if (data && typeof data === "object" && !Array.isArray(data)) return data;
  } catch {
    // 文件没了或写坏了就当没有会话，最坏退回老行为：重新登一次
  }
  return {};
}

function writeDisk(data) {
  fs.mkdirSync(dataDir(), { recursive: true });
  // 先写临时文件再改名，半截文件不会顶掉好的
  const tmp = `${filePath()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n");
  fs.renameSync(tmp, filePath());
}

function prune(data) {
  const now = Date.now();
  for (const sid of Object.keys(data)) {
    const row = data[sid];
    if (!row || !row.exp || row.exp < now || !row.user) delete data[sid];
  }
  return data;
}

/** 进程启动（或测试模拟重启）时调：从盘上把会话接回来。顺手把过期的清掉。 */
export function loadSessions() {
  const disk = readDisk();
  const before = Object.keys(disk).length;
  cache = prune(disk);
  if (Object.keys(cache).length !== before) writeDisk(cache);
  return cache;
}

function current() {
  if (!cache) loadSessions();
  return cache;
}

export function createSession(user) {
  const data = current();
  const sid = crypto.randomBytes(24).toString("hex");
  data[sid] = { user, exp: Date.now() + WEEK };
  writeDisk(data);
  return sid;
}

export function readSession(sid) {
  if (!sid) return null;
  const row = current()[sid];
  if (!row || row.exp < Date.now()) {
    if (row) destroySession(sid);
    return null;
  }
  return row.user;
}

export function destroySession(sid) {
  const data = current();
  if (!data[sid]) return;
  delete data[sid];
  writeDisk(data);
}
