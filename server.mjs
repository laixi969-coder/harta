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
} from "./lib/auth.mjs";
import { publicLlm, saveProvider, setActive, syncModels, testConnection } from "./lib/llm.mjs";
import { addCustomer, addLedger, readWorkspace, setFeedback } from "./lib/workspace.mjs";

const PORT = Number(process.env.PORT || 5173);
const ROOT = process.cwd();
const sessions = new Map();

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

function json(res, code, body, extra = {}) {
  res.writeHead(code, {
    "content-type": "application/json; charset=utf-8",
    ...extra,
  });
  res.end(JSON.stringify(body));
}

function currentUser(req) {
  const sid = parseCookies(req.headers.cookie).falcon_sid;
  if (!sid) return null;
  const row = sessions.get(sid);
  if (!row || row.exp < Date.now()) {
    if (sid) sessions.delete(sid);
    return null;
  }
  return row.user;
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
    json(res, 403, { error: "只有超级管理员能看和改模型密钥" });
    return null;
  }
  return user;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
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

function safeFile(urlPath) {
  const clean = decodeURIComponent(urlPath.split("?")[0]);
  const rel = clean === "/" ? "/index.html" : clean;
  const abs = path.normalize(path.join(ROOT, rel));
  if (!abs.startsWith(ROOT)) return null;
  if (abs.includes(`${path.sep}data${path.sep}`)) return null;
  return abs;
}

async function handleApi(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/me") {
    const user = currentUser(req);
    if (!user) return json(res, 401, { error: "请先登录" });
    return json(res, 200, { ...user, isAdmin: isAdmin(user) });
  }

  if (req.method === "POST" && url.pathname === "/api/login") {
    const body = await readBody(req);
    const result = loginOrBootstrap(body.email, body.password);
    if (result.error) return json(res, 400, { error: result.error });
    const sid = crypto.randomBytes(24).toString("hex");
    sessions.set(sid, {
      user: result.user,
      exp: Date.now() + 7 * 24 * 3600 * 1000,
    });
    return json(
      res,
      200,
      { ...result.user, isAdmin: isAdmin(result.user), bootstrapped: result.bootstrapped },
      {
        "set-cookie": `falcon_sid=${sid}; HttpOnly; Path=/; SameSite=Lax; Max-Age=604800`,
      },
    );
  }

  if (req.method === "POST" && url.pathname === "/api/register") {
    const body = await readBody(req);
    const result = register(body.email, body.password);
    if (result.error) return json(res, 400, { error: result.error });
    const sid = crypto.randomBytes(24).toString("hex");
    sessions.set(sid, {
      user: result.user,
      exp: Date.now() + 7 * 24 * 3600 * 1000,
    });
    return json(
      res,
      200,
      { ...result.user, isAdmin: false },
      {
        "set-cookie": `falcon_sid=${sid}; HttpOnly; Path=/; SameSite=Lax; Max-Age=604800`,
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

  if (req.method === "GET" && url.pathname === "/api/workspace") {
    const user = requireUser(req, res);
    if (!user) return;
    return json(res, 200, readWorkspace(user.email));
  }

  if (req.method === "POST" && url.pathname === "/api/customers") {
    const user = requireUser(req, res);
    if (!user) return;
    const body = await readBody(req);
    const result = addCustomer(user.email, body);
    if (result.error) return json(res, 400, { error: result.error });
    return json(res, 200, result.workspace);
  }

  if (req.method === "POST" && url.pathname === "/api/feedback") {
    const user = requireUser(req, res);
    if (!user) return;
    const body = await readBody(req);
    return json(res, 200, setFeedback(user.email, body.key, body.value));
  }

  if (req.method === "POST" && url.pathname === "/api/ledger") {
    const user = requireUser(req, res);
    if (!user) return;
    const body = await readBody(req);
    return json(res, 200, addLedger(user.email, body));
  }

  if (req.method === "POST" && url.pathname === "/api/logout") {
    const sid = parseCookies(req.headers.cookie).falcon_sid;
    if (sid) sessions.delete(sid);
    return json(res, 200, { ok: true }, { "set-cookie": "falcon_sid=; HttpOnly; Path=/; Max-Age=0" });
  }

  if (req.method === "GET" && url.pathname === "/api/users") {
    if (!requireAdmin(req, res)) return;
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

  if (req.method === "POST" && url.pathname === "/api/llm/active") {
    if (!requireAdmin(req, res)) return;
    const body = await readBody(req);
    try {
      return json(res, 200, setActive(body.id));
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

  return json(res, 404, { error: "没有这个接口" });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
      return;
    }
    if (url.pathname === "/index.html" || url.pathname === "/") {
      const user = currentUser(req);
      if (!user) {
        res.writeHead(302, { location: "/login.html" });
        res.end();
        return;
      }
    }
    const file = safeFile(url.pathname);
    if (!file || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("找不到");
      return;
    }
    const ext = path.extname(file);
    res.writeHead(200, { "content-type": TYPES[ext] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  } catch (err) {
    json(res, 500, { error: err.message || "服务器出错" });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Falcon http://127.0.0.1:${PORT}/`);
});
