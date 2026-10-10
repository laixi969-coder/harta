import {hostedBrowser} from './lib/hosted-browser.mjs';
import { platformAuthState, startPlatformAuth, pollPlatformAuth, cancelPlatformAuth, removePlatformAuth, completeDouyinAuth } from './lib/platform-auth.mjs';
import { uploadDeliveryAsset, deliveryAsset, deliveryState, bindDeliveryIdentity, queueDelivery, cancelDelivery, claimDelivery, authorizeDelivery, completeDelivery, saveReplyRule, replyMonitors, receiveBrowserEvents, monitorError } from './lib/browser-delivery.mjs';
import { issuePairing, redeemPairing, authenticateConnector, connections, revokeConnection, queueCollection, cancelCollection, connectorJobs, claimCollection, completeCollection, contactHandoff } from './lib/platform-connector.mjs';
import { commerceWorkspace, commerceAction, startOutreachDraft } from './lib/commerce-workspace.mjs';
import { parseCookies, createRateLimiter, createConcurrencyGuard, clientIp, validHost, sameOriginMutation, sessionCookie, readJsonBody } from './lib/request-guard.mjs';
import { acquisitionWorkspace, acquisitionCapabilities, importSignals, startSearch, stopSearch, reviewSignal, saveAccount, preparePublication, confirmPublication, recordInquiry, leadAction, generateContactSuggestion } from './lib/acquisition-workspace.mjs';
import { agentWorkspace, createAgent, saveAgent, agentAction, startAgentTrial } from './lib/business-agents.mjs';
import { proposeFactCards, saveGrowthSettings, saveOutcomes, saveFactCards, preparePostRewrite, applyPostVersion } from './lib/growth-workspace.mjs';
import { rewriteOrganicPost } from './lib/generate.mjs';
import { receiveKeywordBatch, prepareKeywordBatch, keywordCsv } from './lib/keyword-library.mjs';
import { saveKeywordLibrary, removeKeywordLibrary } from './lib/workspace.mjs';
import { crawlerInstalled, readPublicSource, queryRsshub } from "./lib/native-sources.mjs";
import { publicResearchConfig, saveResearchConfig, readResearchConfig, queryKeywords, queryWeb, querySearxng } from "./lib/research.mjs";
import { setGrowthDirection } from "./lib/workspace.mjs";
import { setCustomerStage, updateCustomerBusiness } from "./lib/workspace.mjs";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import {
  addToWhitelist,
  changePassword,
  isAdmin,
  isWhitelisted,
  findUser,
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
import { addCustomer, addLedger, clearCustomerMaterials, dropToday, editLine, findShared, fixPack, groupOverview, publicWorkspace, readWorkspace, refillPack, removePack, repack, replaceCustomerMaterials, setContentState, setFeedback, setTrack, sweepStaleJobs, setUsing, upgradeToFull } from "./lib/workspace.mjs";
import { createSession, destroySession, readSession } from "./lib/session.mjs";
import { listHunts } from "./lib/industry.mjs";
import { renderPackPage } from "./lib/pack-page.mjs";
import { exportReport } from "./lib/report-export.mjs";
import { exportContentBatch, exportContentHistory } from "./lib/content-export.mjs";
import { fieldsFor } from "./lib/platform.mjs";
import { checkPack, hasHardBlock } from "./lib/check.mjs";
import { receiveAndAnalyzeMaterials, updateMaterialAnalysis } from "./lib/materials.mjs";

const keywordImports = new Set();
const PORT = Number(process.env.PORT || 5173);
const ROOT = process.cwd();

function currentUser(req) {
  const user = readSession(parseCookies(req.headers.cookie).harta_sid);
  if (!user || !isWhitelisted(user.email)) return null;
  const account = findUser(user.email);
  return account?.passwordHash ? { email: account.email, role: account.role } : null;
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
const requestLimits = createRateLimiter();
const expensiveRequests = createConcurrencyGuard();
const PUBLIC_ORIGIN = process.env.HARTA_PUBLIC_ORIGIN || '';
// Trust only a loopback reverse proxy explicitly configured to overwrite X-Real-IP.
const TRUST_PROXY = process.env.HARTA_TRUST_PROXY === 'loopback';
function rateLimit(req, key, max, windowMs, identity) {
  const result = requestLimits.consume(`${identity || clientIp(req, TRUST_PROXY)}:${key}`, max, windowMs);
  req.rateRetryAfter = result.retryAfter;
  return result.allowed;
}
const EXPENSIVE_ROUTES = new Set(['/api/materials/analyze', '/api/keywords/import', '/api/pack/fix', '/api/full', '/api/post-rewrite', '/api/growth-facts/extract', '/api/research-test', '/api/llm/sync', '/api/llm/test', '/api/llm/test-vision', '/api/content/export', '/api/content/export-history']);
const JOB_ROUTES = new Set(['/api/customers', '/api/repack', '/api/refill', '/api/today']);
EXPENSIVE_ROUTES.add('/api/acquisition/suggestion');
JOB_ROUTES.add('/api/acquisition/search');
JOB_ROUTES.add('/api/acquisition/agent-trial');
JOB_ROUTES.add('/api/acquisition/outreach');

function securityHeaders(extra = {}) {
  const { cache, ...rest } = extra;
  return {
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "same-origin",
    "content-security-policy": "base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'",
    "permissions-policy": "camera=(), microphone=(), geolocation=()",
    "x-robots-tag": "noindex, nofollow, noarchive",
    "cache-control": cache || "no-store",
    ...rest,
  };
}

function json(res, code, body, extra = {}) {
  if (res.destroyed || res.writableEnded) return;
  if (res.headersSent) { res.destroy(); return; }
  if (code >= 400 && !res.req?.complete) extra = { connection: "close", ...extra };
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

function contentPackForUser(email, packId) {
  const space = readWorkspace(email);
  for (const customer of space.customers || []) {
    const pack = (customer.drops || []).find((row) => row.id === packId);
    if (pack) return { space, customer, pack };
  }
  return null;
}

function customerForUser(email, customerId) {
  const space = readWorkspace(email);
  const customer = (space.customers || []).find((row) => row.id === customerId);
  return customer ? { space, customer } : null;
}

const readBody = readJsonBody;

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
  let clean;
  try { clean = decodeURIComponent(urlPath.split("?")[0]); } catch { return null; }
  if (clean === "/") clean = "/index.html";
  if (clean.includes("..") || clean.includes("\0") || clean.split('/').some(part => part.startsWith('.'))) return null;
  const allowed =
    ALLOW_FILES.has(clean) || ALLOW_DIRS.some((dir) => clean.startsWith(dir));
  if (!allowed) return null;
  const abs = path.normalize(path.join(ROOT, clean));
  if (!abs.startsWith(ROOT + path.sep) && abs !== ROOT) return null;
  // Public directories must never expose symlinked data or source/config backups.
  const ext = path.extname(abs).toLowerCase();
  if (!['.html', '.css', '.js', '.mjs', '.jpg', '.jpeg', '.png', '.webp', '.svg', '.ico', '.woff', '.woff2'].includes(ext)) return null;
  try {
    const real = fs.realpathSync(abs);
    if (!real.startsWith(ROOT + path.sep)) return null;
    const relative = '/' + path.relative(ROOT, real).split(path.sep).join('/');
    if (!ALLOW_FILES.has(relative) && !ALLOW_DIRS.some(dir => relative.startsWith(dir))) return null;
    if (relative.split('/').some(part => part.startsWith('.'))) return null;
    return real;
  } catch { return null; }
}

async function handleApi(req, res, url) {
  if(url.pathname==='/api/hosted-browser'||url.pathname.startsWith('/api/hosted-browser/')){
    const user=requireUser(req,res);if(!user)return;
    try{
      if(url.pathname==='/api/hosted-browser'&&req.method==='GET')return json(res,200,hostedBrowser.list(user.email));
      if(req.method==='POST'){
        const action=url.pathname.slice('/api/hosted-browser/'.length);
        const handler={start:hostedBrowser.start,status:hostedBrowser.status,frame:hostedBrowser.frame,click:hostedBrowser.click,retry:hostedBrowser.retry,disconnect:hostedBrowser.disconnect,enable:hostedBrowser.enable}[action];
        if(action==='start'&&!rateLimit(req,'hosted-start',10,600000,user.email))return json(res,429,{error:'连接尝试过于频繁，请稍后重试'});
        if(handler)return json(res,200,await handler(user.email,await readBody(req)));
      }
      return json(res,404,{error:'没有这个浏览器操作'});
    }catch(e){return json(res,e.statusCode||400,{error:e.message});}
  }
  if (url.pathname.startsWith('/api/platform-auth')) {
    const user = requireUser(req, res); if (!user) return;
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    const session = parseCookies(req.headers.cookie).harta_sid;
    try {
      if (url.pathname === '/api/platform-auth' && req.method === 'GET') return json(res, 200, platformAuthState(user.email));
      if (url.pathname === '/api/platform-auth/callback/douyin' && req.method === 'GET') {
        await completeDouyinAuth(user.email, Object.fromEntries(url.searchParams), session);
        res.writeHead(303, { Location: '/?platform_connection=return' }); res.end(); return;
      }
      if (req.method === 'POST') {
        const action = url.pathname.slice('/api/platform-auth/'.length);
        const handler = { start: startPlatformAuth, poll: pollPlatformAuth, cancel: cancelPlatformAuth, disconnect: removePlatformAuth }[action];
        if (action === 'start' && !rateLimit(req, 'platform-auth-start', 10, 600000, user.email)) return json(res, 429, {error:'连接尝试过于频繁，请稍后重试'});
        if (handler) return json(res, 200, await handler(user.email, await readBody(req), session));
      }
      return json(res, 404, { error: '没有这个授权操作' });
    } catch (error) { return json(res, error.statusCode || 400, { error: error.message }); }
  }

  if(url.pathname.startsWith('/api/connector/')) {
    const origin=req.headers.origin;
    if(origin && !/^chrome-extension:\/\/[a-p]{32}$/.test(origin))return json(res,403,{error:'只允许浏览器连接器调用此接口'});
    if(origin){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');}
    if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
    if(req.method!=='POST')return json(res,405,{error:'操作方式无效'});
    try {
      const action=url.pathname.slice('/api/connector/'.length);
      if(action==='pair'){
        if(!rateLimit(req,'connector-pair',10,60_000))return json(res,429,{error:'配对尝试过于频繁，请稍后再试'});
        return json(res,200,redeemPairing(await readBody(req)));
      }
      const body=await readBody(req,768*1024),r=authenticateConnector(req.headers.authorization||'');
      if(!isWhitelisted(r.email)||!findUser(r.email)?.passwordHash)return json(res,401,{error:'Harta 账号已停用'});
      if(action==='delivery-claim')return json(res,200,{job:claimDelivery(r)});
      if(action==='delivery-authorize')return json(res,200,authorizeDelivery(r,body));
      if(action==='delivery-complete')return json(res,200,{job:completeDelivery(r,body)});
      if(action==='delivery-monitors')return json(res,200,{rules:replyMonitors(r)});
      if(action==='delivery-monitor-error')return json(res,200,monitorError(r,body));
      if(action==='delivery-events')return json(res,200,receiveBrowserEvents(r,body));
      if(action==='delivery-asset'){const a=deliveryAsset(r,body);return json(res,200,{id:a.id,name:a.name,mime:a.mime,base64:a.buffer.toString('base64')});}
      if(action==='claim')return json(res,200,{job:claimCollection(r)});
      if(action==='complete')return json(res,200,{job:completeCollection(r,body)});
      return json(res,404,{error:'没有这个连接器操作'});
    }catch(error){return json(res,error.statusCode||400,{error:error.message});}
  }
  if(url.pathname==='/api/browser-extension'&&req.method==='GET') {
    if(!requireUser(req,res))return;
    const {default:JSZip}=await import('jszip');const zip=new JSZip();
    for(const name of ['manifest.json','popup.html','popup.js','worker.js','collector.js','delivery.js','delivery-worker.js','README.md'])zip.file(name,fs.readFileSync(path.join(ROOT,'browser-extension','harta-connector',name)));
    const buffer=await zip.generateAsync({type:'nodebuffer'});res.writeHead(200,securityHeaders({'content-type':'application/zip','content-disposition':'attachment; filename="harta-browser-connector.zip"'}));res.end(buffer);return;
  }
  if(url.pathname==='/api/delivery'&&req.method==='GET'){
    const user=requireUser(req,res);if(!user)return;return json(res,200,deliveryState(user.email));
  }
  if(url.pathname.startsWith('/api/delivery/')&&req.method==='POST'){
    const user=requireUser(req,res);if(!user)return;
    try{const action=url.pathname.slice('/api/delivery/'.length);if(action==='asset')return json(res,200,{asset:await uploadDeliveryAsset(user.email,req)});
      const body=await readBody(req);const handler={identity:bindDeliveryIdentity,queue:queueDelivery,cancel:cancelDelivery,rule:saveReplyRule}[action];if(!handler)return json(res,404,{error:'没有这个执行操作'});return json(res,200,{result:handler(user.email,body)});
    }catch(error){return json(res,400,{error:error.message});}
  }
  if(url.pathname==='/api/browser-connections'&&req.method==='GET'){
    const user=requireUser(req,res);if(!user)return;return json(res,200,{connections:connections(user.email),jobs:connectorJobs(user.email)});
  }
  if(url.pathname.startsWith('/api/browser-connections/')&&req.method==='POST'){
    const user=requireUser(req,res);if(!user)return;
    try{const body=await readBody(req),action=url.pathname.slice('/api/browser-connections/'.length);
      if(action==='pair')return json(res,200,issuePairing(user.email,body));
      if(action==='revoke')return json(res,200,{connections:revokeConnection(user.email,body)});
      if(action==='collect')return json(res,202,{job:queueCollection(user.email,body)});
      if(action==='cancel'){cancelCollection(user.email,body);return json(res,200,{jobs:connectorJobs(user.email)});}
      if(action==='contact')return json(res,200,contactHandoff(user.email,body));
      return json(res,404,{error:'没有这个账号操作'});
    }catch(error){return json(res,error.statusCode||400,{error:error.message});}
  }

  if (url.pathname === '/api/acquisition' && req.method === 'GET') {
    const user = requireUser(req, res);
    if (!user) return;
    acquisitionWorkspace(user.email);
    commerceWorkspace(user.email);
    return json(res, 200, { workspace: publicWorkspace(agentWorkspace(user.email)), capabilities: acquisitionCapabilities() });
  }
  if (url.pathname.startsWith('/api/acquisition/') && req.method === 'POST') {
    const user = requireUser(req, res);
    if (!user) return;
    const action = url.pathname.slice('/api/acquisition/'.length);
    const handlers = { commerce: commerceAction, import: importSignals, stop: stopSearch, review: reviewSignal, account: saveAccount, 'prepare-publication': preparePublication, publication: confirmPublication, inquiry: recordInquiry, lead: leadAction, 'agent-create': createAgent, 'agent-save': saveAgent, 'agent-action': agentAction };
    const body = await readBody(req);
    try {
      if (action === 'suggestion') return json(res, 200, await generateContactSuggestion(user.email, body));
      if (action === 'outreach') { const result=startOutreachDraft(user.email,body); return json(res,202,{workspace:publicWorkspace(result.workspace)}); }
      if (action === 'agent-trial') {
        const result = startAgentTrial(user.email, body);
        return json(res, 202, { workspace: publicWorkspace(result.workspace) });
      }
      if (action === 'search') {
        const result = startSearch(user.email, body);
        return json(res, 202, { workspace: publicWorkspace(result.workspace) });
      }
      if (!Object.hasOwn(handlers, action)) return json(res, 404, { error: '没有这个获客操作' });
      return json(res, 200, { workspace: publicWorkspace(handlers[action](user.email, body)) });
    } catch (error) { return json(res, 400, { error: error.message || '操作未完成，请重试' }); }
  }
  if (req.method === "GET" && url.pathname === "/api/me") {
    const user = currentUser(req);
    if (!user) return json(res, 401, { error: "请先登录" });
    return json(res, 200, { ...user, isAdmin: isAdmin(user) });
  }

  if (req.method === "POST" && url.pathname === "/api/login") {
    if (!rateLimit(req, "login", 8, 10 * 60 * 1000) || !rateLimit(req, 'auth-global', 60, 60 * 1000, 'global')) {
      return json(res, 429, { error: "试的次数太多，过几分钟再来" }, { "retry-after": String(req.rateRetryAfter) });
    }
    const body = await readBody(req);
    const result = loginOrBootstrap(body.email, body.password);
    if (result.error) return json(res, result.status || 400, { error: result.error }, result.retryAfter ? { "retry-after": String(result.retryAfter) } : {});
    const sid = createSession(result.user);
    return json(
      res,
      200,
      { ...result.user, isAdmin: isAdmin(result.user), bootstrapped: result.bootstrapped },
      {
        "set-cookie": sessionCookie(sid, req, PUBLIC_ORIGIN),
      },
    );
  }

  if (req.method === "POST" && url.pathname === "/api/register") {
    if (!rateLimit(req, "register", 5, 10 * 60 * 1000) || !rateLimit(req, 'auth-global', 60, 60 * 1000, 'global')) {
      return json(res, 429, { error: "试的次数太多，过几分钟再来" }, { "retry-after": String(req.rateRetryAfter) });
    }
    const body = await readBody(req);
    const result = register(body.email, body.password, body.activationCode);
    if (result.error) return json(res, result.status || 400, { error: result.error }, result.retryAfter ? { "retry-after": String(result.retryAfter) } : {});
    const sid = createSession(result.user);
    return json(
      res,
      200,
      { ...result.user, isAdmin: false },
      {
        "set-cookie": sessionCookie(sid, req, PUBLIC_ORIGIN),
      },
    );
  }

  if (req.method === "POST" && url.pathname === "/api/password") {
    const user = requireUser(req, res);
    if (!user) return;
    if (!rateLimit(req, "password", 8, 10 * 60 * 1000, user.email)) return json(res, 429, { error: "尝试太频繁，请稍后重试" }, { "retry-after": String(req.rateRetryAfter) });
    const body = await readBody(req);
    const result = changePassword(user.email, body.oldPassword, body.newPassword);
    if (result.error) return json(res, result.status || 400, { error: result.error }, result.retryAfter ? { "retry-after": String(result.retryAfter) } : {});
    const sid = createSession(user);
    return json(res, 200, { ok: true }, { "set-cookie": sessionCookie(sid, req, PUBLIC_ORIGIN) });
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
    for (const p of ["巨量信息流", "朋友圈", "小红书", "百度", "抖音", "视频号", "快手", "短视频", "B站", "公众号", "知乎", "千川"]) {
      fields[p] = fieldsFor(p);
    }
    return json(res, 200, { fields });
  }

  if (req.method === "GET" && ["/api/keywords/export", "/api/keywords/template"].includes(url.pathname)) {
    const user = requireUser(req, res);
    if (!user) return;
    let batch;
    if (url.pathname.endsWith("/export")) {
      const customer = readWorkspace(user.email).customers.find(c => c.id === url.searchParams.get("customerId"));
      batch = customer?.keywordLibraries?.find(b => b.id === url.searchParams.get("batchId"));
      if (!batch) return json(res, 404, { error: "没有这批关键词，或不属于当前账号" });
    }
    res.writeHead(200, { "content-type": "text/csv; charset=utf-8", "content-disposition": attachmentName(batch ? `${batch.scope.name}-整理关键词.csv` : "Harta关键词导入模板.csv"), ...securityHeaders() });
    return res.end(keywordCsv(batch));
  }

  if (req.method === "POST" && url.pathname === "/api/keywords/import") {
    const user = requireUser(req, res);
    if (!user) return;
    if (keywordImports.has(user.email)) return json(res, 409, { error: "已有关键词文件正在处理，请稍候" });
    keywordImports.add(user.email);
    let upload;
    try {
      upload = await receiveKeywordBatch(req);
      const customer = readWorkspace(user.email).customers.find(c => c.id === upload.customerId);
      if (!customer) return json(res, 404, { error: "没有这个客户，或不属于当前账号" });
      const batch = await prepareKeywordBatch(upload.files, upload.scope);
      const result = saveKeywordLibrary(user.email, upload.customerId, batch);
      return result.error ? json(res, 400, result) : json(res, 200, publicWorkspace(result.workspace));
    } catch (error) { return json(res, 400, { error: [1009, 1015, 1016].includes(error.code) ? "最多5个文件，单个10MB，合计20MB" : error.message || "关键词导入失败" }); }
    finally { upload?.cleanup(); keywordImports.delete(user.email); }
  }
  if (req.method === "POST" && url.pathname === "/api/keywords/remove") {
    const user = requireUser(req, res);
    if (!user) return;
    const body = await readBody(req);
    const result = removeKeywordLibrary(user.email, body.customerId, body.batchId);
    return result.error ? json(res, 400, result) : json(res, 200, publicWorkspace(result.workspace));
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
    const out = replaceCustomerMaterials(user.email, body.customerId, body.batchId, { append: body.append === true });
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

  if (req.method === "POST" && url.pathname === "/api/pack/fix") {
    const user = requireUser(req, res);
    if (!user) return;
    const body = await readBody(req);
    try {
      const out = await fixPack(user.email, body.packId);
      if (out.error) return json(res, 400, { error: out.error });
      return json(res, 200, { workspace: publicWorkspace(out.workspace), fixed: out.fixed });
    } catch (err) {
      return json(res, 500, { error: err.message || "自动修复失败" });
    }
  }

  if (req.method === "GET" && url.pathname === "/api/jobs") {
    const user = requireUser(req, res);
    if (!user) return;
    const space = sweepStaleJobs(user.email);
    return json(res, 200, { customers: space.customers.map(({id,name,job,lastFail}) => ({id,name,job:job || null,lastFail:lastFail || null})) });
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

  if (req.method === "POST" && url.pathname === "/api/content/export") {
    const user = requireUser(req, res);
    if (!user) return;
    const body = await readBody(req);
    const found = contentPackForUser(user.email, body.packId);
    if (!found) return json(res, 404, { error: "找不到这份内容批次" });
    found.pack.checks = checkPack(found.pack, found.customer.hunt);
    try {
      const file = await exportContentBatch({
        pack: found.pack,
        customer: found.customer,
        contentStates: found.space.contentStates || {},
        feedback: found.space.feedback || {},
        options: {
          scope: body.scope,
          group: body.group,
          selection: body.selection,
          kind: body.kind,
          safeOnly: body.includeRisky !== true,
        },
      }, body.format === "md" ? "md" : "xlsx");
      res.writeHead(200, {
        "content-type": file.mime,
        "content-length": file.contents.length,
        "content-disposition": attachmentName(file.filename),
        "x-harta-included": String(file.included),
        "x-harta-excluded": String(file.excluded),
        ...securityHeaders({ cache: "no-store" }),
      });
      res.end(file.contents);
    } catch (err) {
      json(res, 400, { error: err.message || "内容导出失败" });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/content/export-history") {
    const user = requireUser(req, res);
    if (!user) return;
    const body = await readBody(req);
    const found = customerForUser(user.email, body.customerId);
    if (!found) return json(res, 404, { error: "没有这个客户" });
    const packs = (found.customer.drops || []).map((pack) => ({
      ...pack,
      checks: checkPack(pack, found.customer.hunt),
    }));
    try {
      const file = await exportContentHistory({
        packs,
        customer: found.customer,
        contentStates: found.space.contentStates || {},
        feedback: found.space.feedback || {},
      }, body.format === "md" ? "md" : "xlsx");
      res.writeHead(200, {
        "content-type": file.mime,
        "content-length": file.contents.length,
        "content-disposition": attachmentName(file.filename),
        "x-harta-included": String(file.included),
        "x-harta-excluded": "0",
        ...securityHeaders({ cache: "no-store" }),
      });
      res.end(file.contents);
    } catch (err) {
      json(res, 400, { error: err.message || "历史内容导出失败" });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/research-test") {
    if (!requireAdmin(req, res)) return;
    const config = readResearchConfig();
    const results = [];
    for (const [label, key, test] of [["5118", config.keywordKey, queryKeywords], ["Brave Search", config.searchKey, queryWeb], ["SearXNG", config.searxngUrl, querySearxng], ["RSSHub", config.rsshubUrl, queryRsshub]]) {
      if (!key) { results.push(`${label}未配置`); continue; }
      try { const rows = await test("门窗", key); results.push(rows.length ? `${label}读取成功，返回${rows.length}条` : `${label}接口可访问，但本次查询没有结果`); }
      catch { results.push(`${label}连接失败，请检查密钥、API权益与网络`); }
    }
    if (crawlerInstalled()) {
      const page = await readPublicSource("https://www.5118.com/");
      results.push(page.ok ? `${page.method || "网页读取"}成功，取得${page.text.length}字` : "网页读取失败");
    }
    return json(res, 200, { results });
  }

  if (url.pathname === "/api/research-config" && ["GET", "POST"].includes(req.method)) {
    if (!requireAdmin(req, res)) return;
    try {
      return json(res, 200, req.method === "GET" ? publicResearchConfig() : saveResearchConfig(await readBody(req)));
    } catch (err) { return json(res, err.statusCode || 400, { error: err.message }); }
  }

  if (req.method === "POST" && ['/api/growth-facts/extract', '/api/growth-goal', '/api/growth-outcomes', '/api/growth-facts', '/api/post-rewrite', '/api/post-version'].includes(url.pathname)) {
    const user = requireUser(req, res);
    if (!user) return;
    try {
      const body = await readBody(req, url.pathname === '/api/growth-facts' ? 256 * 1024 : MAX_BODY);
      const actions = {
        '/api/growth-facts/extract': () => proposeFactCards(user.email, body),
        '/api/growth-goal': () => saveGrowthSettings(user.email, body),
        '/api/growth-outcomes': () => saveOutcomes(user.email, body),
        '/api/growth-facts': () => saveFactCards(user.email, body),
        '/api/post-rewrite': () => preparePostRewrite(user.email, body, rewriteOrganicPost),
        '/api/post-version': () => applyPostVersion(user.email, body),
      };
      return json(res, 200, publicWorkspace(await actions[url.pathname]()));
    } catch (error) { return json(res, error.statusCode || 400, { error: error.message || '保存失败' }); }
  }

  if (req.method === "POST" && url.pathname === "/api/growth-direction") {
    const user = requireUser(req, res);
    if (!user) return;
    const body = await readBody(req);
    const result = setGrowthDirection(user.email, body.customerId, body.direction);
    if (result.error) return json(res, result.status || 400, { error: result.error }, result.retryAfter ? { "retry-after": String(result.retryAfter) } : {});
    return json(res, 200, publicWorkspace(result.workspace));
  }

  if (req.method === "POST" && url.pathname === "/api/customers") {
    const user = requireUser(req, res);
    if (!user) return;
    const body = await readBody(req);
    const result = addCustomer(user.email, body);
    if (result.error) return json(res, result.status || 400, { error: result.error }, result.retryAfter ? { "retry-after": String(result.retryAfter) } : {});
    return json(res, 200, publicWorkspace(result.workspace));
  }

  if (req.method === "POST" && url.pathname === "/api/repack") {
    const user = requireUser(req, res);
    if (!user) return;
    const body = await readBody(req);
    try {
      const result = repack(user.email, body.customerId, { material: body.material });
      if (result.error) return json(res, result.status || 400, { error: result.error }, result.retryAfter ? { "retry-after": String(result.retryAfter) } : {});
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
      if (result.error) return json(res, result.status || 400, { error: result.error }, result.retryAfter ? { "retry-after": String(result.retryAfter) } : {});
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
      const result = dropToday(user.email, body.customerId, body);
      if (result.error) return json(res, result.status || 400, { error: result.error }, result.retryAfter ? { "retry-after": String(result.retryAfter) } : {});
      return json(res, 200, publicWorkspace(result.workspace));
    } catch (err) {
      return json(res, 400, { error: err.message || "出今日失败" });
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/customer-business') {
    const user = requireUser(req, res);
    if (!user) return;
    const body = await readBody(req);
    const result = updateCustomerBusiness(user.email, body.customerId, body);
    if (result.error) return json(res, result.status || 400, { error: result.error }, result.retryAfter ? { "retry-after": String(result.retryAfter) } : {});
    return json(res, 200, publicWorkspace(result.workspace));
  }

  if (req.method === 'POST' && url.pathname === '/api/customer-stage') {
    const user = requireUser(req, res);
    if (!user) return;
    const body = await readBody(req);
    const result = setCustomerStage(user.email, body.customerId, body.stage);
    if (result.error) return json(res, result.status || 400, { error: result.error }, result.retryAfter ? { "retry-after": String(result.retryAfter) } : {});
    return json(res, 200, publicWorkspace(result.workspace));
  }

  if (req.method === "POST" && url.pathname === "/api/track") {
    const user = requireUser(req, res);
    if (!user) return;
    const body = await readBody(req);
    const result = setTrack(user.email, body.id, body.track);
    if (result.error) return json(res, result.status || 400, { error: result.error }, result.retryAfter ? { "retry-after": String(result.retryAfter) } : {});
    return json(res, 200, publicWorkspace(result.workspace));
  }

  if (req.method === "POST" && url.pathname === "/api/full") {
    const user = requireUser(req, res);
    if (!user) return;
    const body = await readBody(req);
    try {
      const result = await upgradeToFull(user.email, body.packId);
      if (result.error) return json(res, result.status || 400, { error: result.error }, result.retryAfter ? { "retry-after": String(result.retryAfter) } : {});
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
    if (result.error) return json(res, result.status || 400, { error: result.error }, result.retryAfter ? { "retry-after": String(result.retryAfter) } : {});
    return json(res, 200, publicWorkspace(result.workspace));
  }

  if (req.method === "POST" && url.pathname === "/api/feedback") {
    const user = requireUser(req, res);
    if (!user) return;
    const body = await readBody(req);
    return json(res, 200, publicWorkspace(setFeedback(user.email, body.key, body.value)));
  }

  if (req.method === "POST" && url.pathname === "/api/content-state") {
    const user = requireUser(req, res);
    if (!user) return;
    const body = await readBody(req);
    const result = setContentState(user.email, body);
    if (result.error) return json(res, result.status || 400, { error: result.error }, result.retryAfter ? { "retry-after": String(result.retryAfter) } : {});
    return json(res, 200, { workspace: publicWorkspace(result.workspace), updated: result.updated });
  }

  if (req.method === "POST" && url.pathname === "/api/using") {
    const user = requireUser(req, res);
    if (!user) return;
    const body = await readBody(req);
    const result = setUsing(user.email, body.id);
    if (result.error) return json(res, result.status || 400, { error: result.error }, result.retryAfter ? { "retry-after": String(result.retryAfter) } : {});
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
    return json(res, 200, { ok: true }, { "set-cookie": sessionCookie("", req, PUBLIC_ORIGIN) });
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
    if (result.error) return json(res, result.status || 400, { error: result.error }, result.retryAfter ? { "retry-after": String(result.retryAfter) } : {});
    return json(res, 200, { users: listUsersPublic(), whitelist: listWhitelist(), activationCode: result.activationCode, activationExpiresAt: result.activationExpiresAt });
  }

  if (req.method === "GET" && url.pathname === "/api/whitelist") {
    if (!requireAdmin(req, res)) return;
    return json(res, 200, { whitelist: listWhitelist() });
  }

  if (req.method === "POST" && ["/api/whitelist", "/api/users/activation"].includes(url.pathname)) {
    if (!requireAdmin(req, res)) return;
    const body = await readBody(req);
    const result = addToWhitelist(body.email);
    if (result.error) return json(res, result.status || 400, { error: result.error }, result.retryAfter ? { "retry-after": String(result.retryAfter) } : {});
    return json(res, 200, result);
  }

  if (req.method === "DELETE" && url.pathname === "/api/whitelist") {
    if (!requireAdmin(req, res)) return;
    const body = await readBody(req);
    const result = removeFromWhitelist(body.email);
    if (result.error) return json(res, result.status || 400, { error: result.error }, result.retryAfter ? { "retry-after": String(result.retryAfter) } : {});
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
      return json(res, err.statusCode || 400, { error: err.message });
    }
  }

  if (req.method === "POST" && url.pathname === "/api/llm/add") {
    if (!requireAdmin(req, res)) return;
    const body = await readBody(req);
    try {
      return json(res, 200, addCustomProvider(body.name));
    } catch (err) {
      return json(res, err.statusCode || 400, { error: err.message });
    }
  }

  if (req.method === "POST" && url.pathname === "/api/llm/remove") {
    if (!requireAdmin(req, res)) return;
    const body = await readBody(req);
    try {
      return json(res, 200, removeProvider(body.id));
    } catch (err) {
      return json(res, err.statusCode || 400, { error: err.message });
    }
  }

  if (req.method === "POST" && url.pathname === "/api/llm/active") {
    if (!requireAdmin(req, res)) return;
    const body = await readBody(req);
    try {
      return json(res, 200, setActive(body.id));
    } catch (err) {
      return json(res, err.statusCode || 400, { error: err.message });
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
      return json(res, err.statusCode || 400, { error: err.message });
    }
  }

  if (req.method === "POST" && url.pathname === "/api/llm/reorder") {
    if (!requireAdmin(req, res)) return;
    const body = await readBody(req);
    try {
      return json(res, 200, reorderProviders(body.ids));
    } catch (err) {
      return json(res, err.statusCode || 400, { error: err.message });
    }
  }

  if (req.method === "POST" && url.pathname === "/api/llm/sync") {
    if (!requireAdmin(req, res)) return;
    const body = await readBody(req);
    try {
      return json(res, 200, await syncModels(body.id));
    } catch (err) {
      return json(res, err.statusCode || 400, { error: err.message });
    }
  }

  if (req.method === "POST" && url.pathname === "/api/llm/test") {
    if (!requireAdmin(req, res)) return;
    const body = await readBody(req);
    try {
      return json(res, 200, await testConnection(body.id));
    } catch (err) {
      return json(res, err.statusCode || 400, { error: err.message });
    }
  }

  if (req.method === "POST" && url.pathname === "/api/llm/test-vision") {
    if (!requireAdmin(req, res)) return;
    const body = await readBody(req);
    try {
      return json(res, 200, await testVisionConnection(body.id));
    } catch (err) {
      return json(res, err.statusCode || 400, { error: err.message });
    }
  }

  return json(res, 404, { error: "没有这个接口" });
}

const server = http.createServer(async (req, res) => {
  try {
    if (!validHost(req, { publicOrigin: PUBLIC_ORIGIN, port: PORT })) return json(res, 421, { error: "访问地址不正确" });
    const url = new URL(req.url || "/", `http://${req.headers.host}`);
    try { decodeURIComponent(url.pathname); } catch { return json(res, 400, { error: "访问地址格式不正确" }); }
    if (url.pathname.startsWith("/api/")) {
      if (!rateLimit(req, "api", 240, 60 * 1000)) {
        return json(res, 429, { error: "请求太频繁，请等一会儿再试" }, { "retry-after": String(req.rateRetryAfter) });
      }
      if (!url.pathname.startsWith('/api/connector/') && !sameOriginMutation(req, PUBLIC_ORIGIN)) return json(res, 403, { error: "请从 Harta 页面提交操作" });
      const expensive = (req.method === 'POST' && EXPENSIVE_ROUTES.has(url.pathname)) || (req.method === 'GET' && /^\/api\/reports\/[^/]+\/export\//.test(url.pathname));
      const startsJob = req.method === 'POST' && JOB_ROUTES.has(url.pathname);
      let release;
      if (expensive || startsJob) {
        const user = requireUser(req, res);
        if (!user) return;
        if (!rateLimit(req, 'expensive', 30, 60 * 60 * 1000, user.email)) return json(res, 429, { error: "处理次数较多，请稍后再试" }, { 'retry-after': String(req.rateRetryAfter) });
        release = expensiveRequests.acquire(user.email);
        if (!release) return json(res, 429, { error: "已有任务正在处理，请完成后再试" }, { 'retry-after': '10' });
      }
      try { await handleApi(req, res, url); } finally { release?.(); }
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
    if (!['GET', 'HEAD'].includes(req.method)) return json(res, 405, { error: "这个地址只支持读取" }, { allow: 'GET, HEAD' });
    // 甲方那一页：不进后台，只凭链接。链接不对就是 404，不提示"存在但没权限"。
    if (url.pathname.startsWith("/p/")) {
      if (!rateLimit(req, 'share', 30, 60 * 1000) || !rateLimit(req, 'share-global', 120, 60 * 1000, 'global')) return json(res, 429, { error: "读取太频繁，请稍后再试" }, { 'retry-after': String(req.rateRetryAfter) });
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
    const stat = fs.statSync(file);
    // Assets without content hashes must revalidate, so deployments cannot retain stale scripts/images.
    const cache = 'no-cache';
    const etag = `W/"${stat.size.toString(16)}-${stat.mtimeMs.toString(16)}"`;
    const modified = stat.mtime.toUTCString();
    const candidates = String(req.headers['if-none-match'] || '').split(',').map(value => value.trim());
    const matches = candidates.includes('*') || candidates.some(value => value.replace(/^W\//, '') === etag.replace(/^W\//, ''));
    const since = req.headers['if-modified-since'];
    if (matches || (!req.headers['if-none-match'] && since && Math.floor(stat.mtimeMs / 1000) * 1000 <= Date.parse(since))) {
      res.writeHead(304, { etag, 'last-modified': modified, ...securityHeaders({ cache }) });
      return res.end();
    }
    res.writeHead(200, {
      etag,
      'last-modified': modified,
      'content-length': stat.size,
      "content-type": TYPES[ext] || "application/octet-stream",
      ...securityHeaders({ cache }),
    });
    if (req.method === 'HEAD') return res.end();
    const stream = fs.createReadStream(file);
    stream.on('error', () => res.destroy());
    res.on('close', () => stream.destroy());
    stream.pipe(res);
  } catch (err) {
    json(res, err.statusCode || 500, { error: err.message || "服务器出错" });
  }
});

// Bound slow headers/body uploads and idle keep-alive sockets; completed LLM requests may run longer.
server.headersTimeout = 15000;
server.requestTimeout = 120000;
server.keepAliveTimeout = 5000;
server.maxRequestsPerSocket = 100;
server.maxConnections = 256;
server.maxHeadersCount = 100;

server.listen(PORT, "127.0.0.1", () => {
  console.log(`HARTA http://127.0.0.1:${PORT}/`);
});

// Only durable user-created connections are resumed; boot creates no platform session.
hostedBrowser.startWorker();
