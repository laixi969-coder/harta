import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {
  addToWhitelist,
  changePassword,
  isAdmin,
  listUsersPublic,
  listWhitelist,
  loginOrBootstrap,
  register,
  removeFromWhitelist,
  resetPassword,
} from "./lib/auth.mjs";
import {
  addCustomProvider,
  addModel,
  publicLlm,
  removeProvider,
  reorderProviders,
  saveProvider,
  setActive,
  setModelEnabled,
  syncModels,
  testConnection,
  testVisionConnection,
  useModel,
} from "./lib/llm.mjs";
import { addCustomer, addLedger, clearCustomerMaterials, dropToday, editLine, findShared, groupOverview, publicWorkspace, readWorkspace, refillPack, removePack, repack, replaceCustomerMaterials, setFeedback, setTrack, sweepStaleJobs, setUsing, upgradeToFull } from "./lib/workspace.mjs";
import { createSession, destroySession, readSession } from "./lib/session.mjs";
import { listHunts } from "./lib/industry.mjs";
import { renderPackPage } from "./lib/pack-page.mjs";
import { exportReport } from "./lib/report-export.mjs";
import { fieldsFor } from "./lib/platform.mjs";
import { checkPack, hasHardBlock } from "./lib/check.mjs";
import { receiveAndAnalyzeMaterials, updateMaterialAnalysis } from "./lib/materials.mjs";

const PORT = Number(process.env.PORT || 5173);
const ROOT = process.cwd();

function parseCookies(header) {
  const out = {};
  String(header || "")
    .split(";")
    .forEach((part) => {
      const [k, ...rest] = part.trim().split("=");
      if (k) out[k] = decodeURIComponent(rest.join("=") || "");
    });
  return out;
}

function currentUser(req) {
  return readSession(parseCookies(req.headers.cookie).harta_sid);
}

function requireUser(req, res) {
  const user = currentUser(req);
  if (!user) {
    json(res, 401, { error: "请先登录" });
    return null;
  }
  return user;
}

function requireAdmin(req, res) {
  const user = requireUser(req, res);
  if (!user) return null;
  if (!isAdmin(user)) {
    json(res, 403, { error: "只有管理员能进这一页" });
    return null;
  }
  return user;
}

const MAX_BODY = 64 * 1024;
const buckets = new Map();

function clientIp(req) {
  return req.socket?.remoteAddress || "unknown";
}

function rateLimit(req, key, max, windowMs) {
  const id = `${clientIp(req)}:${key}`;
  const now = Date.now();
  let b = buckets.get(id);
  if (!b || now > b.reset) b = { n: 0, reset: now + windowMs };
  b.n += 1;
  buckets.set(id, b);
  return b.n <= max;
}

function securityHeaders(extra = {}) {
  const { cache, ...rest } = extra;
  return {
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "same-origin",
    "cache-control": cache || "no-store",
    ...rest,
  };
}

function json(res, code, body, extra = {}) {
  res.writeHead(code, {
    "content-type": "application/json; charset=utf-8",
    ...securityHeaders(),
    ...extra,
  });
  res.end(JSON.stringify(body));
}

function attachmentName(filename) {
  const fallback = String(filename || "report")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "report";
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

function reportForUser(email, packId) {
  const space = readWorkspace(email);
  for (const customer of space.customers || []) {
    const pack = (customer.packs || []).find((row) => row.id === packId);
    if (pack) return { customer, pack };
  }
  return null;
}

function readBody(req) {
  const declared = Number(req.headers["content-length"] || 0);
  if (declared > MAX_BODY) return Promise.reject(Object.assign(new Error("一次粘贴的内容太多，请按输入框标注的上限缩短"), { statusCode: 413 }));
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error("一次粘贴的内容太多，请按输入框标注的上限缩短"), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("JSON 不对"));
      }
    });
    req.on("error", reject);
  });
}

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".md": "text/markdown; charset=utf-8",
};

const ALLOW_FILES = new Set([
  "/login.html",
  "/register.html",
  "/index.html",
  "/pack.html",
  "/pack-bochi.html",
  "/pack-chengmei.html",
]);
const ALLOW_DIRS = ["/css/", "/js/", "/images/"];

function safeFile(urlPath) {
  let clean = decodeURIComponent(urlPath.split("?")[0]);
  if (clean === "/") clean = "/index.html";
  if (clean.includes("..") || clean.includes("\0")) return null;
  const allowed =
    ALLOW_FILES.has(clean) || ALLOW_DIRS.some((dir) => clean.startsWith(dir));
  if (!allowed) return null;
  const abs = path.normalize(path.join(ROOT, clean));
  if (!abs.startsWith(ROOT + path.sep) && abs !== ROOT) return null;
  return abs;
}

async function handleApi(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/me") {
    const user = currentUser(req);
    if (!user) return json(res, 401, { error: "请先登录" });
    return json(res, 200, { ...user, isAdmin: isAdmin(user) });
  }

  if (req.method === "POST" && url.pathname === "/api/login") {
    if (!rateLimit(req, "login", 8, 10 * 60 * 1000)) {
      return json(res, 429, { error: "试的次数太多，过几分钟再来" });
    }
    const body = await readBody(req);
    const result = loginOrBootstrap(body.email, body.password);
    if (result.error) return json(res, 400, { error: result.error });
    const sid = createSession(result.user);
    return json(
      res,
      200,
      { ...result.user, isAdmin: isAdmin(result.user), bootstrapped: result.bootstrapped },
      {
        "set-cookie": `harta_sid=${sid}; HttpOnly; Path=/; SameSite=Lax; Max-Age=604800`,
      },
    );
  }

  if (req.method === "POST" && url.pathname === "/api/register") {
    if (!rateLimit(req, "register", 5, 10 * 60 * 1000)) {
      return json(res, 429, { error: "试的次数太多，过几分钟再来" });
    }
    const body = await readBody(req);
    const result = register(body.email, body.password);
    if (result.error) return json(res, 400, { error: result.error });
    const sid = createSession(result.user);
    return json(
      res,
      200,
      { ...result.user, isAdmin: false },
      {
        "set-cookie": `harta_sid=${sid}; HttpOnly; Path=/; SameSite=Lax; Max-Age=604800`,
      },
    );
  }

  if (req.method === "POST" && url.pathname === "/api/password") {
    const user = requireUser(req, res);
    if (!user) return;
    const body = await readBody(req);
    const result = changePassword(user.email, body.oldPassword, body.newPassword);
    if (result.error) return json(res, 400, { error: result.error });
    return json(res, 200, { ok: true });
  }

  if (req.method === "GET" && url.pathname === "/api/hunts") {
    const user = requireUser(req, res);
    if (!user) return;
    return json(res, 200, { hunts: listHunts() });
  }

  if (req.method === "GET" && url.pathname === "/api/platform-fields") {
    const user = requireUser(req, res);
    if (!user) return;
    const fields = {};
    for (const p of ["巨量信息流", "朋友圈", "小红书", "百度", "视频号", "快手", "短视频", "千川"]) {
      fields[p] = fieldsFor(p).map((f) => ({ key: f.key, label: f.label }));
    }
    return json(res, 200, { fields });
  }

  if (req.method === "POST" && url.pathname === "/api/materials/analyze") {
    const user = requireUser(req, res);
    if (!user) return;
    try {
      const batch = await receiveAndAnalyzeMaterials(req, user.email);
      return json(res, 200, batch);
    } catch (err) {
      const detail = err?.code === 1009
        ? "文件合计不能超过 120MB"
        : err?.code === 1016
          ? "单个文件不能超过 60MB"
          : err?.code === 1015
            ? "文件最多 20 个"
            : err.message;
      return json(res, 400, { error: detail || "资料读取失败" });
    }
  }

  if (req.method === "POST" && url.pathname === "/api/materials/analysis") {
    const user = requireUser(req, res);
    if (!user) return;
    const body = await readBody(req);
    try {
      return json(res, 200, updateMaterialAnalysis(user.email, body.batchId, body.analysis));
    } catch (err) {
      return json(res, 400, { error: err.message || "资料梳理没有保存" });
    }
  }

  // 资料包裹的删除与重建：新资料来了整批换掉，历史出档不动
  if (req.method === "POST" && url.pathname === "/api/materials/clear") {
    const user = requireUser(req, res);
    if (!user) return;
    const body = await readBody(req);
    const out = clearCustomerMaterials(user.email, body.customerId);
    if (out.error) return json(res, 400, { error: out.error });
    return json(res, 200, publicWorkspace(out.workspace));
  }

  if (req.method === "POST" && url.pathname === "/api/materials/replace") {
    const user = requireUser(req, res);
    if (!user) return;
    const body = await readBody(req);
    const out = replaceCustomerMaterials(user.email, body.customerId, body.batchId);
    if (out.error) return json(res, 400, { error: out.error });
    return json(res, 200, publicWorkspace(out.workspace));
  }

  if (req.method === "POST" && url.pathname === "/api/pack/delete") {
    const user = requireUser(req, res);
    if (!user) return;
    const body = await readBody(req);
    const out = removePack(user.email, body.customerId, body.packId);
    if (out.error) return json(res, 400, { error: out.error });
    return json(res, 200, publicWorkspace(out.workspace));
  }

  if (req.method === "GET" && url.pathname === "/api/workspace") {
    const user = requireUser(req, res);
    if (!user) return;
    // 界面靠轮询这个口等出档结果，顺手把服务重启留下的僵死任务清掉
    return json(res, 200, publicWorkspace(sweepStaleJobs(user.email)));
  }

  const exportMatch = url.pathname.match(/^\/api\/reports\/([^/]+)\/export\/(pdf|docx)$/);
  if (req.method === "GET" && exportMatch) {
    const user = requireUser(req, res);
    if (!user) return;
    const found = reportForUser(user.email, decodeURIComponent(exportMatch[1]));
    if (!found || found.pack.tier === "今日") return json(res, 404, { error: "找不到这份判断报告" });
    found.pack.checks = checkPack(found.pack, found.customer.hunt);
    if (hasHardBlock(found.pack.checks)) {
      return json(res, 409, { error: "这份报告还有红线或硬限制，先改完再导出" });
    }
    try {
      const file = await exportReport(found.pack, found.customer, exportMatch[2]);
      res.writeHead(200, {
        "content-type": file.mime,
        "content-length": file.contents.length,
        "content-disposition": attachmentName(file.filename),
        ...securityHeaders({ cache: "no-store" }),
      });
      res.end(file.contents);
    } catch (err) {
      json(res, 500, { error: err.message || "报告导出失败" });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/customers") {
    const user = requireUser(req, res);
    if (!user) return;
    const body = await readBody(req);
    const result = addCustomer(user.email, body);
    if (result.error) return json(res, 400, { error: result.error });
    return json(res, 200, publicWorkspace(result.workspace));
  }

  if (req.method === "POST" && url.pathname === "/api/repack") {
    const user = requireUser(req, res);
    if (!user) return;
    const body = await readBody(req);
    try {
      const result = repack(user.email, body.customerId, { material: body.material });
      if (result.error) return json(res, 400, { error: result.error });
      return json(res, 200, publicWorkspace(result.workspace));
    } catch (err) {
      return json(res, 400, { error: err.message || "重出失败" });
    }
  }

  if (req.method === "POST" && url.pathname === "/api/refill") {
    const user = requireUser(req, res);
    if (!user) return;
    const body = await readBody(req);
    try {
      const result = refillPack(user.email, body.customerId);
      if (result.error) return json(res, 400, { error: result.error });
      return json(res, 200, publicWorkspace(result.workspace));
    } catch (err) {
      return json(res, 400, { error: err.message || "补货失败" });
    }
  }

  if (req.method === "POST" && url.pathname === "/api/today") {
    const user = requireUser(req, res);
    if (!user) return;
    const body = await readBody(req);
    try {
      const result = dropToday(user.email, body.customerId);
      if (result.error) return json(res, 400, { error: result.error });
      return json(res, 200, publicWorkspace(result.workspace));
    } catch (err) {
      return json(res, 400, { error: err.message || "出今日失败" });
    }
  }

  if (req.method === "POST" && url.pathname === "/api/track") {
    const user = requireUser(req, res);
    if (!user) return;
    const body = await readBody(req);
    const result = setTrack(user.email, body.id, body.track);
    if (result.error) return json(res, 400, { error: result.error });
    return json(res, 200, publicWorkspace(result.workspace));
  }

  if (req.method === "POST" && url.pathname === "/api/full") {
    const user = requireUser(req, res);
    if (!user) return;
    const body = await readBody(req);
    try {
      const result = await upgradeToFull(user.email, body.packId);
      if (result.error) return json(res, 400, { error: result.error });
      return json(res, 200, publicWorkspace(result.workspace));
    } catch (err) {
      return json(res, 400, { error: err.message || "出全档失败" });
    }
  }

  if (req.method === "POST" && url.pathname === "/api/edit") {
    const user = requireUser(req, res);
    if (!user) return;
    const body = await readBody(req);
    const result = editLine(user.email, body.packId, body.key, body.text);
    if (result.error) return json(res, 400, { error: result.error });
    return json(res, 200, publicWorkspace(result.workspace));
  }

  if (req.method === "POST" && url.pathname === "/api/feedback") {
    const user = requireUser(req, res);
    if (!user) return;
    const body = await readBody(req);
    return json(res, 200, publicWorkspace(setFeedback(user.email, body.key, body.value)));
  }

  if (req.method === "POST" && url.pathname === "/api/using") {
    const user = requireUser(req, res);
    if (!user) return;
    const body = await readBody(req);
    const result = setUsing(user.email, body.id);
    if (result.error) return json(res, 400, { error: result.error });
    return json(res, 200, publicWorkspace(result.workspace));
  }

  if (req.method === "POST" && url.pathname === "/api/ledger") {
    const user = requireUser(req, res);
    if (!user) return;
    const body = await readBody(req);
    const out = addLedger(user.email, body);
    if (out.error) return json(res, 400, { error: out.error });
    return json(res, 200, { ...out, workspace: publicWorkspace(out.workspace) });
  }

  if (req.method === "POST" && url.pathname === "/api/logout") {
    const sid = parseCookies(req.headers.cookie).harta_sid;
    if (sid) destroySession(sid);
    return json(res, 200, { ok: true }, { "set-cookie": "harta_sid=; HttpOnly; Path=/; Max-Age=0" });
  }

  if (req.method === "GET" && url.pathname === "/api/users") {
    if (!requireAdmin(req, res)) return;
    return json(res, 200, { users: listUsersPublic(), whitelist: listWhitelist() });
  }

  // 全组一屏：只给聚合数。谁的客户是谁的，销售互相看不见的规矩不变
  if (req.method === "GET" && url.pathname === "/api/overview") {
    if (!requireAdmin(req, res)) return;
    return json(res, 200, groupOverview(listUsersPublic().map((u) => u.email)));
  }

  if (req.method === "POST" && url.pathname === "/api/users/reset") {
    if (!requireAdmin(req, res)) return;
    const body = await readBody(req);
    const result = resetPassword(body.email);
    if (result.error) return json(res, 400, { error: result.error });
    return json(res, 200, { users: listUsersPublic(), whitelist: listWhitelist() });
  }

  if (req.method === "GET" && url.pathname === "/api/whitelist") {
    if (!requireAdmin(req, res)) return;
    return json(res, 200, { whitelist: listWhitelist() });
  }

  if (req.method === "POST" && url.pathname === "/api/whitelist") {
    if (!requireAdmin(req, res)) return;
    const body = await readBody(req);
    const result = addToWhitelist(body.email);
    if (result.error) return json(res, 400, { error: result.error });
    return json(res, 200, result);
  }

  if (req.method === "DELETE" && url.pathname === "/api/whitelist") {
    if (!requireAdmin(req, res)) return;
    const body = await readBody(req);
    const result = removeFromWhitelist(body.email);
    if (result.error) return json(res, 400, { error: result.error });
    return json(res, 200, result);
  }

  if (req.method === "GET" && url.pathname === "/api/llm") {
    if (!requireAdmin(req, res)) return;
    return json(res, 200, publicLlm());
  }

  if (req.method === "POST" && url.pathname === "/api/llm") {
    if (!requireAdmin(req, res)) return;
    const body = await readBody(req);
    try {
      const config = saveProvider(body.id, body);
      return json(res, 200, config);
    } catch (err) {
      return json(res, 400, { error: err.message });
    }
  }

  if (req.method === "POST" && url.pathname === "/api/llm/add") {
    if (!requireAdmin(req, res)) return;
    const body = await readBody(req);
    try {
      return json(res, 200, addCustomProvider(body.name));
    } catch (err) {
      return json(res, 400, { error: err.message });
    }
  }

  if (req.method === "POST" && url.pathname === "/api/llm/remove") {
    if (!requireAdmin(req, res)) return;
    const body = await readBody(req);
    try {
      return json(res, 200, removeProvider(body.id));
    } catch (err) {
      return json(res, 400, { error: err.message });
    }
  }

  if (req.method === "POST" && url.pathname === "/api/llm/active") {
    if (!requireAdmin(req, res)) return;
    const body = await readBody(req);
    try {
      return json(res, 200, setActive(body.id));
    } catch (err) {
      return json(res, 400, { error: err.message });
    }
  }

  /* 模型层的三个动作共用一个口：开关（toggle）、点选用（use）、手动补一个（add） */
  if (req.method === "POST" && url.pathname === "/api/llm/model") {
    if (!requireAdmin(req, res)) return;
    const body = await readBody(req);
    try {
      let config;
      if (body.action === "toggle") config = setModelEnabled(body.id, body.model, body.on !== false);
      else if (body.action === "use") config = useModel(body.id, body.model);
      else if (body.action === "add") config = addModel(body.id, body.model);
      else throw new Error("没有这个操作");
      return json(res, 200, config);
    } catch (err) {
      return json(res, 400, { error: err.message });
    }
  }

  if (req.method === "POST" && url.pathname === "/api/llm/reorder") {
    if (!requireAdmin(req, res)) return;
    const body = await readBody(req);
    try {
      return json(res, 200, reorderProviders(body.ids));
    } catch (err) {
      return json(res, 400, { error: err.message });
    }
  }

  if (req.method === "POST" && url.pathname === "/api/llm/sync") {
    if (!requireAdmin(req, res)) return;
    const body = await readBody(req);
    try {
      return json(res, 200, await syncModels(body.id));
    } catch (err) {
      return json(res, 400, { error: err.message });
    }
  }

  if (req.method === "POST" && url.pathname === "/api/llm/test") {
    if (!requireAdmin(req, res)) return;
    const body = await readBody(req);
    try {
      return json(res, 200, await testConnection(body.id));
    } catch (err) {
      return json(res, 400, { error: err.message });
    }
  }

  if (req.method === "POST" && url.pathname === "/api/llm/test-vision") {
    if (!requireAdmin(req, res)) return;
    const body = await readBody(req);
    try {
      return json(res, 200, await testVisionConnection(body.id));
    } catch (err) {
      return json(res, 400, { error: err.message });
    }
  }

  return json(res, 404, { error: "没有这个接口" });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);
    if (url.pathname.startsWith("/api/")) {
      if (!rateLimit(req, "api", 240, 60 * 1000)) {
        return json(res, 429, { error: "请求太频繁，请等一会儿再试" });
      }
      await handleApi(req, res, url);
      return;
    }
    if (!rateLimit(req, "static", 600, 60 * 1000)) {
      res.writeHead(429, {
        "content-type": "text/plain; charset=utf-8",
        ...securityHeaders(),
      });
      res.end("请求太频繁，请等一会儿再试");
      return;
    }
    // 甲方那一页：不进后台，只凭链接。链接不对就是 404，不提示"存在但没权限"。
    if (url.pathname.startsWith("/p/")) {
      const found = findShared(url.pathname.slice(3));
      if (!found) {
        res.writeHead(404, { "content-type": "text/plain; charset=utf-8", ...securityHeaders() });
        res.end("这个链接不对");
        return;
      }
      // 分享页每次都按当前行业包重跑硬检查。旧档不能因为当时还没有这条规则就绕过去。
      found.pack.checks = checkPack(found.pack, found.customer.hunt);
      if (hasHardBlock(found.pack.checks)) {
        res.writeHead(409, { "content-type": "text/plain; charset=utf-8", ...securityHeaders() });
        res.end("这份档还有红线或硬限制，先回工作台改完再分享");
        return;
      }
      res.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        ...securityHeaders({ cache: "no-store" }),
      });
      res.end(renderPackPage(found.pack, found.customer));
      return;
    }

    if (url.pathname === "/index.html" || url.pathname === "/") {
      const user = currentUser(req);
      if (!user) {
        res.writeHead(302, { location: "/login.html", ...securityHeaders() });
        res.end();
        return;
      }
    }
    const file = safeFile(url.pathname);
    if (!file || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8", ...securityHeaders() });
      res.end("找不到");
      return;
    }
    const ext = path.extname(file);
    // 图片长缓存；样式和脚本每次回源核对，改完销售刷新就能看到，不用等一天。
    const cache = [".jpg", ".jpeg", ".png", ".webp", ".svg"].includes(ext)
      ? "public, max-age=86400"
      : [".css", ".js"].includes(ext)
        ? "no-cache"
        : "no-store";
    res.writeHead(200, {
      "content-type": TYPES[ext] || "application/octet-stream",
      ...securityHeaders({ cache }),
    });
    fs.createReadStream(file).pipe(res);
  } catch (err) {
    json(res, err.statusCode || 500, { error: err.message || "服务器出错" });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`HARTA http://127.0.0.1:${PORT}/`);
});
