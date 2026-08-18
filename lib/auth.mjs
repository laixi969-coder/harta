import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const ADMIN_EMAIL = "66445039@qq.com";

const dataDir = () => path.join(process.cwd(), "data");
const authPath = () => path.join(dataDir(), "auth.json");

export function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function ensure() {
  fs.mkdirSync(dataDir(), { recursive: true });
  if (!fs.existsSync(authPath())) {
    fs.writeFileSync(
      authPath(),
      JSON.stringify(
        {
          whitelist: [ADMIN_EMAIL],
          users: [
            {
              email: ADMIN_EMAIL,
              role: "admin",
              passwordHash: "",
              salt: "",
            },
          ],
        },
        null,
        2,
      ) + "\n",
    );
  }
  const data = JSON.parse(fs.readFileSync(authPath(), "utf8"));
  if (!Array.isArray(data.whitelist)) data.whitelist = [ADMIN_EMAIL];
  if (!data.whitelist.includes(ADMIN_EMAIL)) data.whitelist.unshift(ADMIN_EMAIL);
  fs.writeFileSync(authPath(), JSON.stringify(data, null, 2) + "\n");
}

export function readAuth() {
  ensure();
  return JSON.parse(fs.readFileSync(authPath(), "utf8"));
}

function writeAuth(data) {
  ensure();
  if (!data.whitelist.includes(ADMIN_EMAIL)) data.whitelist.unshift(ADMIN_EMAIL);
  fs.writeFileSync(authPath(), JSON.stringify(data, null, 2) + "\n");
}

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 32).toString("hex");
}

export function findUser(email) {
  const needle = normalizeEmail(email);
  return readAuth().users.find((u) => u.email.toLowerCase() === needle) || null;
}

export function isAdmin(user) {
  return Boolean(user && user.role === "admin" && normalizeEmail(user.email) === ADMIN_EMAIL);
}

export function isWhitelisted(email) {
  const needle = normalizeEmail(email);
  if (needle === ADMIN_EMAIL) return true;
  return (readAuth().whitelist || []).map(normalizeEmail).includes(needle);
}

export function listWhitelist() {
  const list = (readAuth().whitelist || []).map(normalizeEmail);
  if (!list.includes(ADMIN_EMAIL)) list.unshift(ADMIN_EMAIL);
  return [...new Set(list)];
}

export function addToWhitelist(email) {
  const clean = normalizeEmail(email);
  if (!clean || !clean.includes("@")) return { error: "邮箱格式不对" };
  const data = readAuth();
  data.whitelist = listWhitelist();
  if (data.whitelist.includes(clean)) return { error: "这个邮箱已经在名单里" };
  data.whitelist.push(clean);
  writeAuth(data);
  return { whitelist: data.whitelist };
}

export function removeFromWhitelist(email) {
  const clean = normalizeEmail(email);
  if (clean === ADMIN_EMAIL) return { error: "管理员不能移出" };
  const data = readAuth();
  data.whitelist = listWhitelist().filter((e) => e !== clean);
  writeAuth(data);
  return { whitelist: data.whitelist };
}

export function loginOrBootstrap(email, password) {
  const pwd = String(password || "");
  if (!pwd) return { error: "请输入密码" };
  const user = findUser(email);
  if (!user) return { error: "账号不存在，请先注册" };
  if (!user.passwordHash) {
    if (user.role !== "admin") return { error: "这个账号还没开通" };
    const salt = crypto.randomBytes(16).toString("hex");
    const passwordHash = hashPassword(pwd, salt);
    const data = readAuth();
    const row = data.users.find((u) => u.email.toLowerCase() === user.email.toLowerCase());
    row.salt = salt;
    row.passwordHash = passwordHash;
    writeAuth(data);
    return { user: { email: user.email, role: user.role }, bootstrapped: true };
  }
  const ok = hashPassword(pwd, user.salt) === user.passwordHash;
  if (!ok) return { error: "密码不对" };
  return { user: { email: user.email, role: user.role }, bootstrapped: false };
}

export function register(email, password) {
  const clean = normalizeEmail(email);
  const pwd = String(password || "");
  if (!clean || !clean.includes("@")) return { error: "邮箱格式不对" };
  if (pwd.length < 6) return { error: "密码至少 6 位" };
  if (clean === ADMIN_EMAIL) return { error: "这个账号直接登录" };
  if (!isWhitelisted(clean)) return { error: "这个邮箱还没开通，找管理员开" };
  if (findUser(clean)) return { error: "已经注册过，请登录" };
  const salt = crypto.randomBytes(16).toString("hex");
  const data = readAuth();
  data.users.push({
    email: clean,
    role: "sales",
    salt,
    passwordHash: hashPassword(pwd, salt),
  });
  writeAuth(data);
  return { user: { email: clean, role: "sales" } };
}

export function changePassword(email, oldPassword, newPassword) {
  const user = findUser(email);
  if (!user) return { error: "账号不存在" };
  const next = String(newPassword || "");
  if (next.length < 6) return { error: "新密码至少 6 位" };
  if (!user.passwordHash) return { error: "请先完成首次登录" };
  if (hashPassword(String(oldPassword || ""), user.salt) !== user.passwordHash) {
    return { error: "旧密码不对" };
  }
  const salt = crypto.randomBytes(16).toString("hex");
  const data = readAuth();
  const row = data.users.find((u) => u.email.toLowerCase() === user.email.toLowerCase());
  row.salt = salt;
  row.passwordHash = hashPassword(next, salt);
  writeAuth(data);
  return { ok: true };
}

export function listUsersPublic() {
  return readAuth().users.map((u) => ({
    email: u.email,
    role: u.role,
    hasPassword: Boolean(u.passwordHash),
  }));
}

export function maskKey(apiKey) {
  if (!apiKey) return "";
  if (apiKey.length <= 8) return "••••";
  return `${apiKey.slice(0, 3)}••••${apiKey.slice(-4)}`;
}

export function workspaceId(email) {
  return crypto.createHash("sha256").update(normalizeEmail(email)).digest("hex").slice(0, 16);
}
