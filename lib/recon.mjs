import dns from "node:dns/promises";
import net from "node:net";

/* 看过客户的东西，档位才能从侦察档升到快档。
 * 这里只做一件事：把销售填的那个链接抓回来变成纯文字。
 * 抓不到就是抓不到，绝不编。 */

const MAX_BYTES = 400 * 1024;
const MAX_CHARS = 12000;

function isPrivateAddress(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    return false;
  }
  const low = ip.toLowerCase();
  if (low === "::1" || low === "::") return true;
  if (low.startsWith("fe80") || low.startsWith("fc") || low.startsWith("fd")) return true;
  if (low.startsWith("::ffff:")) return isPrivateAddress(low.slice(7));
  return false;
}

/** 销售填进来的链接是外部输入：只放行公网 http/https，挡住内网和本机。 */
async function assertPublicUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("这不是一个能打开的网址");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("只认 http / https 的网址");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  // 空主机名不能进 DNS：查空串在有些系统上会挂住，而且它本来就不是一个能打开的地址
  if (!host) throw new Error("这个网址没有主机名");
  if (net.isIP(host)) {
    if (isPrivateAddress(host)) throw new Error("这个地址指向内网，不抓");
    return url;
  }
  const records = await Promise.race([
    dns.lookup(host, { all: true }).catch(() => []),
    new Promise((ok) => setTimeout(() => ok(null), 4000)),
  ]);
  if (records === null) throw new Error("这个域名 4 秒没解析出来");
  if (!records.length) throw new Error("这个域名解析不到");
  if (records.some((r) => isPrivateAddress(r.address))) {
    throw new Error("这个域名指向内网，不抓");
  }
  return url;
}

function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(br|\/p|\/div|\/h[1-6]|\/li|\/tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t ]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * 抓客户自己的页面。成功返回 { ok:true, url, text }，失败返回 { ok:false, why }。
 * 失败不是异常，是情报：查不到本身说明这家还没有公开声量。
 */
export async function fetchClientPage(raw) {
  const input = String(raw || "").trim();
  if (!input) return { ok: false, why: "没给链接" };
  const hasScheme = /^[a-z][a-z0-9+.\-]*:/i.test(input);
  const withScheme = hasScheme ? input : `https://${input}`;

  let url;
  try {
    url = await assertPublicUrl(withScheme);
  } catch (err) {
    return { ok: false, why: err.message };
  }

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 15000);
  try {
    const res = await fetch(url, {
      signal: ctl.signal,
      redirect: "follow",
      headers: {
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0 Safari/537.36",
        accept: "text/html,application/xhtml+xml",
      },
    });
    if (!res.ok) return { ok: false, why: `打开返回 ${res.status}` };
    const type = res.headers.get("content-type") || "";
    if (!/text\/html|text\/plain|application\/xhtml/i.test(type)) {
      return { ok: false, why: "这个地址不是网页" };
    }
    const buf = Buffer.from(await res.arrayBuffer()).subarray(0, MAX_BYTES);
    const text = htmlToText(buf.toString("utf8")).slice(0, MAX_CHARS);
    if (text.length < 80) return { ok: false, why: "页面抓回来几乎没有文字，多半是要登录或全靠脚本渲染" };
    return { ok: true, url: url.href, text };
  } catch (err) {
    if (err.name === "AbortError") return { ok: false, why: "15 秒没打开" };
    return { ok: false, why: "网络打不开这个地址" };
  } finally {
    clearTimeout(timer);
  }
}
