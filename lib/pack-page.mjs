import { packAsSent } from "./pack-edits.mjs";
import { fieldsFor, normalizeShellItem } from "./platform.mjs";

/* 甲方那一页。甲方不进后台，只收这一页。
 * 这里只做渲染，不做判断：档里有什么就出什么，没有的整块不出现。 */

const esc = (v) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const paras = (arr) => (arr || []).map((t) => `<p>${esc(t)}</p>`).join("");

function section(title, inner) {
  if (!inner) return "";
  return `<section><h2 class="meta">${esc(title)}</h2>${inner}</section>`;
}

/* 这一块里的「这个人」全指要来找你们的那个人，不是你们。
 * 原来写「他会这么说」，而档里别处的「他」指的是出钱投放的这家客户——
 * 一个代词两边都能套，读的人得停下来倒推是谁。 */
function demandBlock(d) {
  if (!d?.who) return "";
  return `<p class="meta">下面说的「这个人」，都是要来找你们的那个人，不是你们。</p>
    <div class="folio">
      <div class="folio-cell is-who"><p class="k">要截的这个人</p><p>${esc(d.who)}</p></div>
      <div class="folio-cell is-skip"><p class="k">不该打的人</p>${paras(d.skip)}</div>
      <div class="folio-cell"><p class="k">这个人会这么说</p>${paras(d.say)}</div>
      <div class="folio-cell"><p class="k">这个人在搜</p><p>${esc((d.search || []).join(" · "))}</p></div>
    </div>`;
}

function gapsBlock(gaps) {
  if (!gaps?.length) return "";
  const num = ["一", "二", "三", "四", "五"];
  return `<div class="sleeves">${gaps
    .map(
      (g, i) => `<article class="sleeve">
        <div class="sleeve-tab">缺口${num[i] || i + 1}</div>
        <div class="sleeve-body">
          <h3>${esc(g.name)}</h3>
          <div class="sleeve-fields">
            <div><p class="field-k">现状</p><p>${esc(g.fact)}</p></div>
            <div><p class="field-k">代价</p><p>${esc(g.cost)}</p></div>
            <div class="full"><p class="field-k">为什么改不动</p><p>${esc(g.cause)}</p></div>
          </div>
          <p class="meta">你自己可以：${esc(g.verify)}</p>
        </div>
      </article>`,
    )
    .join("")}</div>`;
}

function questionsBlock(qs) {
  if (!qs?.length) return "";
  const num = ["一", "二", "三", "四", "五"];
  return `<div class="sleeves">${qs
    .map(
      (q, i) => `<article class="sleeve">
        <div class="sleeve-tab">问${num[i] || i + 1}</div>
        <div class="sleeve-body">
          <h3>${esc(q.ask)}</h3>
          ${q.why ? `<p class="meta">${esc(q.why)}</p>` : ""}
        </div>
      </article>`,
    )
    .join("")}</div>`;
}

function copiesBlock(copies) {
  const groups = Object.entries(copies || {});
  if (!groups.length) return "";
  return `<div class="sleeves">${groups
    .map(
      ([name, lines]) => `<article class="sleeve sleeve-across">
        <div class="sleeve-tab"><span>${esc(name)}</span><span>${lines.length} 条</span></div>
        <div class="sleeve-body">${paras(lines)}</div>
      </article>`,
    )
    .join("")}</div>`;
}

function boardsBlock(boards) {
  if (!boards?.length) return "";
  return `<div class="sleeves">${boards
    .map(
      (b) => `<article class="sleeve sleeve-across">
        <div class="sleeve-tab"><span>${esc(b.title)}</span><span>${esc(b.platform || "")}</span></div>
        <div class="sleeve-body">
          ${b.hook ? `<p class="meta">前 3 秒：${esc(b.hook)}</p>` : ""}
          ${(b.shots || [])
            .map(
              (s) => `<p><b>${esc(s.at || "")}</b> ${esc(s.visual || "")}${s.line ? `　口播：${esc(s.line)}` : ""}</p>`,
            )
            .join("")}
          ${b.close ? `<p class="meta">收口：${esc(b.close)}</p>` : ""}
        </div>
      </article>`,
    )
    .join("")}</div>`;
}

/** 平台外壳：小红书三样、朋友圈两样，甲方要看得出这三条不能互换。 */
function shellsBlock(shells, battlefields) {
  const entries = Object.entries(shells || {});
  if (!entries.length) return "";
  const mains = new Set(battlefields || []);
  const sorted = entries.sort((a, b) => (mains.has(b[0]) ? 1 : 0) - (mains.has(a[0]) ? 1 : 0));
  return `<div class="sleeves">${sorted
    .map(([plat, items]) => {
      const fields = fieldsFor(plat);
      const rows = (items || [])
        .map((raw) => {
          const item = normalizeShellItem(raw);
          if (!item) return "";
          const inner = fields
            .filter((f) => item[f.key])
            .map(
              (f) =>
                `<p${f.key === "body" ? ' class="asis"' : ""}><span class="field-k">${esc(f.label)}</span>　${esc(item[f.key])}</p>`,
            )
            .join("");
          return inner ? `<div class="line">${inner}</div>` : "";
        })
        .join("");
      return `<article class="sleeve sleeve-across">
        <div class="sleeve-tab"><span>${esc(plat)}</span><span>${mains.has(plat) ? "主战场" : "换外壳"}</span></div>
        <div class="sleeve-body">${rows}</div>
      </article>`;
    })
    .join("")}</div>`;
}

function deliveryBlock(pack) {
  if (!pack.battlefields?.length && !pack.testPath) return "";
  return `<div class="folio folio-3">
      <div class="folio-cell is-who"><p class="k">主战场</p><p>${esc((pack.battlefields || []).join(" + "))}</p></div>
      <div class="folio-cell"><p class="k">测试路径</p><p>${esc(pack.testPath)}</p></div>
      <div class="folio-cell"><p class="k">补给节奏</p><p>${esc(pack.supply)}</p></div>
    </div>
    <p class="meta" style="margin-top:12px">出价和定向让你们代运营定，我们负责让他们有好素材可投。</p>`;
}

/* 承接：钩子的下半句。素材把人勾来了，第一屏答非所问就白花钱。 */
function landingBlock(l) {
  if (!l?.firstScreen) return "";
  const rows = [
    ["落地页第一屏", l.firstScreen],
    ["留了资立刻给", l.reward],
    ["承接方式", l.way],
  ].filter(([, v]) => v);
  return `<div class="folio folio-3">${rows
    .map(([k, v]) => `<div class="folio-cell"><p class="k">${esc(k)}</p><p>${esc(v)}</p></div>`)
    .join("")}</div>
    ${
      l.form?.length
        ? `<p class="meta" style="margin-top:12px">表单只问这几项：${l.form.map(esc).join("；")}。多一栏掉一档，别问预算区间。</p>`
        : ""
    }
    ${l.leak ? `<p class="meta">最常漏的地方：${esc(l.leak)}</p>` : ""}
    ${
      l.firstTouch?.open?.length
        ? `<p class="k" style="margin-top:16px">线索来了，第一句这么说</p>
      ${l.firstTouch.open
        .map((o) => `<p>${o.from ? `<b>${esc(o.from)}</b>　` : ""}${esc(o.say)}</p>`)
        .join("")}
      ${(l.firstTouch.pushback || [])
        .map((p) => `<p class="meta">对方说「${esc(p.said)}」——${esc(p.reply)}</p>`)
        .join("")}`
        : ""
    }
    ${
      l.rewardOutline?.length
        ? `<p class="k" style="margin-top:16px">上面那份东西，目录长这样</p>
      ${l.rewardOutline.map((x, i) => `<p>${i + 1}. ${esc(x)}</p>`).join("")}`
        : ""
    }`;
}

/** 一份档 → 一页 HTML。甲方页不写「AI」，不写内部机制。 */
export function renderPackPage(pack, customer) {
  const head = `${esc(pack.tier || "快档")} · ${esc(customer.hunt || "")}`;
  const sub = [customer.pitch, customer.city, pack.tier].filter(Boolean).join(" · ");
  const isRecon = Boolean(pack.questions?.length);
  // 甲方看到的必须是销售真正要发的那一版，不是模型出的那一版
  const sent = packAsSent(pack);

  const body = [
    section("该截的需求", demandBlock(pack.demand)),
    isRecon ? section("赛道格局", pack.landscape ? `<p>${esc(pack.landscape)}</p>` : "") : "",
    isRecon
      ? section("想先跟你确认的", questionsBlock(pack.questions))
      : section("我们看到的", gapsBlock(pack.gaps)),
    pack.honest ? section("一句真话", `<p>${esc(pack.honest)}</p>`) : "",
    section(isRecon ? "样品 · 试探文案" : "样品 · 素材文案", copiesBlock(sent.copies)),
    section("各平台外壳", shellsBlock(sent.shells, pack.battlefields)),
    section("样品 · 分镜脚本", boardsBlock(pack.boards)),
    section("承接：人点进来之后", landingBlock(pack.landing)),
    section("怎么投", deliveryBlock(pack)),
    section("下一步", paras(pack.next)),
  ]
    .filter(Boolean)
    .join("\n");

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>${esc(customer.name)}｜获客素材提案</title>
  <link rel="stylesheet" href="/css/app.css?v=20260819g">
</head>
<body>
  <a class="skip" href="#letter">跳到正文</a>
  <article class="pack" id="letter">
    <header class="letterhead">
      <div>
        <img class="logo" src="/images/logo-ink.png" width="1163" height="321" alt="猎鹰增长 Falcon">
        <p class="brand-line">助力线索｜引流｜获客</p>
      </div>
      <span>${head}</span>
    </header>
    <p class="meta">${esc(customer.name)}</p>
    <h1>${esc(pack.title)}</h1>
    ${sub ? `<p>${esc(sub)}</p>` : ""}
    ${pack.gate ? `<p class="meta">${esc(pack.gate)}</p>` : ""}

${body}
  </article>
</body>
</html>`;
}
