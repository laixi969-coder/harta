import { bindEyes } from "./eyes.js";
import { copyKey, editOf, edited, shellKey } from "./pack-edits.js";
import { lastEffective, rankCopyGroups, rankShells } from "./rank-feedback.js";
import {
  artifactsForCustomer,
  clientPacksForCustomer,
  latestAttributablePack,
} from "./customer-view.js";

const state = {
  view: "today",
  theme: document.documentElement.getAttribute("data-theme") || "light",
  workspace: { customers: [], ledger: [], feedback: {}, usingId: "" },
  platformFields: {},
  packId: "",
  openedId: "",
  materials: { files: [], links: [], batch: null, busy: false },
  /* 模型接口那页的界面态：选中的分类、折叠的卡、处于编辑态的密钥/地址行。
   * 都不进后端，重画时照这些恢复现场。 */
  llmTabs: {},
  llmFolded: {},
  llmKeyEdit: {},
  llmBaseEdit: {},
  llmAddOpen: {},
  llmFocus: "",
};

/* 客户名、文案、模型出的内容都会进 innerHTML，跟甲方页同一套转义 */
const esc = (v) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function toast(t) {
  const el = document.getElementById("toast");
  el.textContent = t;
  el.classList.remove("hidden");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add("hidden"), 3200);
}

function applyTheme() {
  document.documentElement.setAttribute("data-theme", state.theme);
  localStorage.setItem("harta-theme", state.theme);
  document.querySelectorAll("[data-theme-toggle]").forEach((b) => {
    b.setAttribute("aria-pressed", state.theme === "dark" ? "true" : "false");
  });
}

function humanBytes(bytes) {
  const n = Number(bytes || 0);
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.ceil(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function invalidateMaterialBatch() {
  state.materials.batch = null;
  document.getElementById("material-analysis")?.classList.add("hidden");
}

function renderMaterialQueue() {
  const box = document.getElementById("material-queue");
  const status = document.getElementById("material-state");
  if (!box || !status) return;
  const rows = [
    ...state.materials.files.map((file, index) => ({
      name: file.name,
      meta: humanBytes(file.size),
      kind: "file",
      index,
    })),
    ...state.materials.links.map((url, index) => ({
      name: url,
      meta: "网页",
      kind: "link",
      index,
    })),
  ];
  if (!rows.length) {
    box.innerHTML = "";
    status.textContent = "还没有加入资料";
    return;
  }
  const notes = new Map((state.materials.batch?.sources || []).map((s) => [s.name, s.note]));
  box.innerHTML = rows
    .map(
      (row) => `<div class="material-row">
        <span class="material-mark">${row.kind === "link" ? "链" : "件"}</span>
        <span class="material-name">${esc(row.name)}<small>${esc(notes.get(row.name) || row.meta)}</small></span>
        <button type="button" class="textish" data-remove-material="${row.kind}" data-index="${row.index}">移除</button>
      </div>`,
    )
    .join("");
  status.textContent = state.materials.batch
    ? `已读 ${state.materials.batch.sources.length} 份资料`
    : `待读取 ${rows.length} 份资料`;
}

function materialAnalysisGroups(analysis) {
  return [
    ["产品 / 服务", analysis.offer],
    ["资料明确的人群", analysis.audience],
    ["可核验依据", analysis.proof],
    ["待核对", analysis.risks],
    ["还缺什么", analysis.missing],
  ].filter(([, rows]) => rows?.length);
}

function materialGroupsHtml(analysis) {
  return materialAnalysisGroups(analysis)
    .map(
      ([title, rows]) => `<section><h4>${esc(title)}</h4><ul>${rows.map((row) => `<li>${esc(row)}</li>`).join("")}</ul></section>`,
    )
    .join("");
}

function materialSourcesHtml(analysis, sources) {
  const notes = new Map((analysis.sourceNotes || []).map((note) => [note.id, note.summary]));
  if (!sources?.length) return "";
  return `<div class="analysis-source-head"><span>逐份资料</span><span>${sources.length} 份</span></div>${sources
    .map(
      (source, index) => `<div class="analysis-source-row">
        <span class="analysis-source-no">${String(index + 1).padStart(2, "0")}</span>
        <span><strong>${esc(source.name)}</strong><small>${esc(notes.get(source.id) || source.note || "已归档")}</small></span>
        <em>${esc(source.kind || "资料")}</em>
      </div>`,
    )
    .join("")}`;
}

function materialTranscriptsHtml(sources) {
  return (sources || [])
    .filter((source) => source.transcript)
    .map(
      (source) => `<details>
        <summary>${esc(source.name)} · 语音转写</summary>
        <p>${esc(source.transcript)}</p>
      </details>`,
    )
    .join("");
}

function renderMaterialAnalysis(batch) {
  const analysis = batch?.analysis || {};
  const panel = document.getElementById("material-analysis");
  if (!panel) return;
  document.getElementById("analysis-overview").textContent = analysis.overview || "没有形成资料总览。";
  const pitch = document.getElementById("analysis-pitch");
  pitch.textContent = analysis.suggestedPitch ? `档案卖点：${analysis.suggestedPitch}` : "";
  pitch.classList.toggle("hidden", !analysis.suggestedPitch);
  document.getElementById("analysis-columns").innerHTML = materialGroupsHtml(analysis);
  document.getElementById("analysis-sources").innerHTML = materialSourcesHtml(analysis, batch.sources);
  document.getElementById("analysis-transcripts").innerHTML = materialTranscriptsHtml(batch.sources);
  const warning = document.getElementById("analysis-warning");
  warning.textContent = analysis.warning || "";
  warning.classList.toggle("hidden", !analysis.warning);
  const use = document.getElementById("use-material-pitch");
  use.disabled = !analysis.suggestedPitch;
  panel.classList.remove("hidden");
}

function renderCustomerMaterialRecord(customer) {
  const panel = document.getElementById("material-record-card");
  if (!panel) return;
  const analysis = customer?.materialAnalysis;
  const sources = customer?.materials || [];
  const hasRecord = Boolean(analysis && (analysis.overview || sources.length));
  panel.classList.toggle("hidden", !hasRecord);
  if (!hasRecord) return;
  document.getElementById("material-record-count").textContent = `附件 / ${String(sources.length).padStart(2, "0")}`;
  document.getElementById("material-record-overview").textContent = analysis.overview || "资料已归档，尚未形成总览。";
  const pitch = document.getElementById("material-record-pitch");
  pitch.textContent = analysis.suggestedPitch ? `档案卖点：${analysis.suggestedPitch}` : "";
  pitch.classList.toggle("hidden", !analysis.suggestedPitch);
  document.getElementById("material-record-columns").innerHTML = materialGroupsHtml(analysis);
  document.getElementById("material-record-sources").innerHTML = materialSourcesHtml(analysis, sources);
  document.getElementById("material-record-transcripts").innerHTML = materialTranscriptsHtml(sources);
  const warning = document.getElementById("material-record-warning");
  warning.textContent = analysis.warning || "";
  warning.classList.toggle("hidden", !analysis.warning);
}

function addMaterialFiles(files) {
  const current = new Map(state.materials.files.map((f) => [`${f.name}:${f.size}:${f.lastModified}`, f]));
  for (const file of files || []) current.set(`${file.name}:${file.size}:${file.lastModified}`, file);
  state.materials.files = [...current.values()].slice(0, 8);
  invalidateMaterialBatch();
  renderMaterialQueue();
}

function nav(view) {
  state.view = view;
  document.querySelectorAll("[data-nav]").forEach((a) => {
    const on = a.dataset.nav === view;
    a.classList.toggle("on", on);
    if (a.tagName === "A") {
      if (on) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    }
  });
  document.querySelectorAll("[data-view]").forEach((p) => {
    p.classList.toggle("hidden", p.dataset.view !== view);
  });
}

function usingCustomer() {
  const list = state.workspace.customers || [];
  const named = state.workspace.desk?.namedId;
  return (
    list.find((c) => c.id === state.openedId) ||
    list.find((c) => c.id === named) ||
    list.find((c) => c.track) ||
    list[0] ||
    null
  );
}

function packsOf(customer) {
  return artifactsForCustomer(customer);
}

function currentPack() {
  const mine = usingCustomer();
  const packs = packsOf(mine);
  if (mine?.track === "存量" && !state.packId) {
    return (mine.drops || [])[0] || null;
  }
  return packs.find((p) => p.id === state.packId) || packs[0] || null;
}

function copyCount(pack) {
  return Object.values(pack?.copies || {}).flat().length;
}

function chip(text, tone = "") {
  return `<span class="chip${tone ? ` ${tone}` : ""}">${esc(text)}</span>`;
}

function rowCard({ title, meta, chips = "", actions = "" }) {
  return `<div class="row">
      <div class="row-main">
        <div class="row-head"><strong>${esc(title)}</strong>${chips}</div>
        ${meta ? `<div class="meta">${meta}</div>` : ""}
      </div>
      <div class="row-acts">${actions}</div>
    </div>`;
}

function renderDesk() {
  const desk = state.workspace.desk || { send: [], judge: [], unmarked: [] };
  const sendBox = document.getElementById("desk-send");
  const judgeBox = document.getElementById("desk-judge");
  const unmarkedBox = document.getElementById("desk-unmarked");
  const row = (c, action, act, extraChip) =>
    rowCard({
      title: c.name,
      chips: `${c.hunt ? chip(c.hunt) : ""}${extraChip || ""}`,
      meta: esc(c.reason || ""),
      actions: `<button type="button" class="go" data-using="${c.id}" data-act="${act || ""}">${action}</button>`,
    });
  if (sendBox) {
    sendBox.innerHTML = desk.send?.length
      ? desk.send.map((c) => row(c, c.hasToday ? "打开" : "出今日", c.hasToday ? "" : "today", chip("存量", "chip-stock"))).join("")
      : `<p class="empty-line">今天没有待发的存量客户。</p>`;
  }
  if (judgeBox) {
    judgeBox.innerHTML = desk.judge?.length
      ? desk.judge.map((c) => row(c, c.ready ? "出判断" : "打开", c.ready ? "judge" : "", chip("拓新", "chip-new"))).join("")
      : `<p class="empty-line">没有待判断的拓新客户。</p>`;
  }
  if (unmarkedBox) {
    unmarkedBox.innerHTML = desk.unmarked?.length
      ? `<p class="empty-line">这几家还没说是拓新还是存量，选一次才能出活。</p>` +
        desk.unmarked
          .map((c) =>
            rowCard({
              title: c.name,
              chips: `${c.hunt ? chip(c.hunt) : ""}${chip("未标明", "chip-warn")}`,
              actions: `<button type="button" class="go" data-track="${c.id}|存量">标为存量</button>
          <button type="button" class="go" data-track="${c.id}|拓新">标为拓新</button>`,
            }),
          )
          .join("")
      : "";
  }
}

function renderToday() {
  const mine = usingCustomer();
  const empty = document.getElementById("empty-today");
  const owned = document.getElementById("owned-today");
  const deskCard = document.getElementById("desk-card");
  const hasCustomers = (state.workspace.customers || []).length > 0;
  renderDesk();
  deskCard?.classList.toggle("hidden", !hasCustomers);
  if (!mine) {
    empty.classList.remove("hidden");
    owned.classList.add("hidden");
    document.getElementById("hook-line").textContent = "先建一个客户。已经在合作的选存量，还没合作的选拓新。";
    document.getElementById("hook-facts").innerHTML = "";
    document.getElementById("hook-gate").textContent = "";
    return;
  }
  empty.classList.add("hidden");
  owned.classList.remove("hidden");

  const packs = packsOf(mine);
  const pack = currentPack();
  if (pack && !state.packId) state.packId = pack.id;

  const nCopy = pack ? copyCount(pack) : 0;
  const nGap = pack?.gaps?.length || 0;
  const fields = pack?.battlefields?.join("、") || "尚未定主战场";
  // 侦察档没有缺口，主体是提问。首行不能替它报「0 个缺口」。
  const nAsk = pack?.questions?.length || 0;
  const headCount = nGap ? `${nGap} 个缺口` : nAsk ? `${nAsk} 个要先问清的` : "";
  const deskHook = state.workspace.desk?.hook;
  document.getElementById("hook-line").textContent = deskHook?.line
    ? deskHook.line
    : pack
      ? `${mine.name} · 已出${pack.tier}`
      : mine.job
        ? `${mine.name} 正在${mine.job.kind}，一般一两分钟。出好了这一页自己会刷新，不用守着。`
        : mine.lastFail
          ? `${mine.name} 这次没出成：${mine.lastFail}。点「重出」再来一次。`
          : `${mine.name} 还没有出过${mine.track === "存量" ? "今日内容" : "判断"}`;
  const facts = [...(deskHook?.facts || [])];
  if (pack) {
    facts.push(`${pack.deliveredAt || pack.createdAt} 出的`);
    if (headCount) facts.push(headCount);
    facts.push(`${nCopy} 条`);
    if (fields && fields !== "尚未定主战场") facts.push(`主战场 ${fields}`);
  }
  // 这行事实是日期/条数目录，不是正文句子
  document.getElementById("hook-facts").innerHTML = facts.map((f) => chip(f)).join("");
  // 模板档和真出的档在界面上长得一样，不说清楚销售会拿赛道模板去谈具体客户
  const fromTemplate = pack?.origin?.engine === "template";
  document.getElementById("hook-gate").textContent = fromTemplate
    ? `这份是${mine.hunt}行业模板，不是给${mine.name}出的（${pack.origin.why}）。${pack.gate || ""}`
    : pack?.gate || "";

  const hist = document.getElementById("history");
  if (packs.length < 2) {
    hist.innerHTML = "";
  } else {
    hist.innerHTML = packs
      .map(
        (p) => `<button type="button" data-pack="${p.id}" class="${p.id === (pack && pack.id) ? "on" : ""}">
        <span class="when">${esc(p.deliveredAt || p.createdAt)}</span>
        <span class="what">${esc(p.title || p.tier)}</span>
        <span class="meta">${esc(p.tier)} · ${copyCount(p)} 条</span>
      </button>`,
      )
      .join("");
  }

  const rankedCopies = pack ? rankCopyGroups(pack.copies, state.workspace.feedback, pack.id) : [];
  const hardRows = [
    ...(pack?.checks?.redline || []),
    ...(pack?.checks?.sensitive || []),
    ...(pack?.checks?.length || []).filter((row) => row.level === "hard"),
    ...(pack?.checks?.quality || []).filter((row) => row.level === "hard"),
  ];
  const blockedTexts = new Set(hardRows.map((row) => String(row.text || "")).filter(Boolean));
  const batchQualityFail = (pack?.checks?.quality || []).some((row) => row.level === "hard" && row.scope === "batch");
  const publishBlocked = hardRows.length > 0;
  const copyButton = (text, label = "复制") =>
    batchQualityFail || blockedTexts.has(String(text || ""))
      ? `<button type="button" class="do" disabled title="这句质量或红线过不了，先改或重出">先改再复制</button>`
      : `<button type="button" class="do" data-copy="${encodeURIComponent(text)}">${label}</button>`;
  const win = document.getElementById("win");
  // 跨批次找：刚补的新批自己没反馈，别让他上周点过的回音凭空消失。
  // 只翻当前这位客户的档——别人的回音不挂到这位脸上
  const winLine = lastEffective(mine, state.workspace.feedback, pack?.id || "");
  const stillTodo = Boolean(state.workspace.desk?.send?.length || state.workspace.desk?.judge?.some((c) => c.ready));
  if (winLine && !stillTodo) {
    win.classList.remove("hidden");
    win.innerHTML = `<b>上次有效</b> · ${winLine}`;
  } else {
    win.classList.add("hidden");
    win.textContent = "";
  }
  renderCustomerMaterialRecord(mine);

  /* 重出按钮必须画在「没有档」这条早返回之前：没出成的时候正是最需要它的时候。 */
  const busy = Boolean(mine.job);
  const repack = document.getElementById("go-repack");
  if (repack) {
    repack.classList.toggle("hidden", !mine.id);
    repack.dataset.customer = mine.id || "";
    repack.disabled = busy;
    repack.textContent = busy
      ? `正在${mine.job.kind}…`
      : mine.track === "存量"
        ? "重出今日"
        : pack
          ? "重出这份判断"
          : "重出";
  }

  const goToday = document.getElementById("go-today");
  if (goToday) {
    goToday.classList.toggle("hidden", mine.track !== "存量");
    goToday.dataset.customer = mine.id || "";
    goToday.disabled = busy;
    goToday.textContent = busy ? `正在${mine.job?.kind}…` : pack?.tier === "今日" ? "再出一批（50 条）" : "出今日一批（50 条）";
  }

  const noPack = document.getElementById("no-pack");
  const body = document.getElementById("pack-body");
  if (!pack) {
    noPack.classList.remove("hidden");
    const noPackTitle = noPack.querySelector("h2");
    if (noPackTitle) {
      noPackTitle.textContent =
        mine.track === "存量" ? "今天还没出内容" : mine.track === "拓新" ? "还没给这位出过判断" : "先标明这家是拓新还是存量";
    }
    body.classList.add("hidden");
    renderCustomers();
    renderPackIndex();
    return;
  }
  noPack.classList.add("hidden");
  body.classList.remove("hidden");
  document.getElementById("judge-chapter")?.classList.toggle("hidden", pack.tier === "今日");

  // 客户名两行之前刚在大标题里说过，这里不重复：这行只留猎场，档位交给右边的章
  const trackEl = document.getElementById("using-track");
  if (trackEl) trackEl.textContent = mine.track || "未标明种类";
  document.getElementById("using-hunt").textContent = mine.hunt;
  document.getElementById("using-stamp").textContent =
    pack.tier === "今日"
      ? "今日\n内容"
      : pack.evidence === "D"
        ? `${pack.tier}\n赛道判断`
        : `${pack.tier}\n证据${pack.evidence}`;
  document.getElementById("using-meta").textContent =
    `${mine.pitch} · ${mine.city || ""} · ${pack.evidenceNote || ""}`;
  document.getElementById("pack-title").textContent = `当时标题：${pack.title}`;

  const demandBox = document.getElementById("demand");
  const demandCard = document.getElementById("demand-card");
  const demand = pack.demand;
  if (demandBox && demandCard) {
    if (demand && demand.who && pack.tier !== "今日") {
      demandCard.classList.remove("hidden");
      const lines = (items) =>
        (items || []).map((t) => `<p>${esc(t)}</p>`).join("");
      demandBox.innerHTML = `
        <div class="folio">
          <div class="folio-cell is-who">
            <p class="k">要截的这个人</p>
            <p>${esc(demand.who)}</p>
          </div>
          <div class="folio-cell is-skip">
            <p class="k">不该打的人</p>
            ${lines(demand.skip)}
          </div>
          <div class="folio-cell">
            <p class="k">这个人会这么说</p>
            ${lines(demand.say)}
          </div>
          <div class="folio-cell">
            <p class="k">这个人在搜</p>
            ${lines(demand.search)}
          </div>
        </div>`;
    } else {
      demandCard.classList.add("hidden");
      demandBox.innerHTML = "";
    }
  }

  const open = document.getElementById("pack-open");
  if (pack.sharePath && !publishBlocked && pack.tier !== "今日") {
    open.classList.remove("hidden");
    open.setAttribute("href", pack.sharePath);
  } else {
    open.classList.add("hidden");
    open.removeAttribute("href");
  }

  const landscapeCard = document.getElementById("landscape-card");
  if (landscapeCard) {
    const has = pack.tier !== "今日" && Boolean(pack.landscape);
    landscapeCard.classList.toggle("hidden", !has);
    if (has) document.getElementById("landscape").textContent = pack.landscape;
  }

  const questionsCard = document.getElementById("questions-card");
  const gapsCard = document.getElementById("gaps-card");
  const questions = pack.questions || [];
  if (questionsCard) {
    questionsCard.classList.toggle("hidden", !questions.length);
    document.getElementById("questions").innerHTML = `<div class="sleeves">${questions
      .map(
        (q, i) => `<article class="sleeve">
        <div class="sleeve-tab">问${["一", "二", "三", "四", "五"][i] || i + 1}</div>
        <div class="sleeve-body">
          <h3>${esc(q.ask)}</h3>
          ${q.why ? `<p class="meta">为什么问：${esc(q.why)}</p>` : ""}
        </div>
      </article>`,
      )
      .join("")}</div>`;
  }
  if (gapsCard) gapsCard.classList.toggle("hidden", !(pack.gaps || []).length);

  const boardsCard = document.getElementById("boards-card");
  const boards = pack.boards || [];
  if (boardsCard) {
    boardsCard.classList.toggle("hidden", !boards.length);
    document.getElementById("boards").innerHTML = `<div class="sleeves">${boards
      .map(
        (b, i) => `<article class="sleeve sleeve-across">
        <div class="sleeve-tab"><span><i class="sleeve-num">${["一", "二", "三", "四", "五", "六"][i] || i + 1}</i>${esc(b.title)}</span><span>${esc(b.platform || "")}</span></div>
        <div class="sleeve-body">
          ${b.hook ? `<p class="meta">前 3 秒：${esc(b.hook)}</p>` : ""}
          ${(b.shots || [])
            .map(
              (sh) => `<p><b>${esc(sh.at || "")}</b> ${esc(sh.visual)}${sh.line ? `　口播：${esc(sh.line)}` : ""}</p>`,
            )
            .join("")}
          ${b.close ? `<p class="meta">收口：${esc(b.close)}</p>` : ""}
        </div>
      </article>`,
      )
      .join("")}</div>`;
  }

  const full = document.getElementById("go-full");
  if (full) {
    full.classList.add("hidden");
  }

  const refill = document.getElementById("go-refill");
  if (refill) {
    refill.classList.add("hidden");
  }

  const checksCard = document.getElementById("checks-card");
  if (checksCard) {
    const c = pack.checks || {};
    const rows = [
      ...(c.guardrails || []).map(
        (r) => `<div class="line"><p><b>上线边界 · ${esc(r.label)}</b></p>
          <p class="meta">${esc(r.text)}</p></div>`,
      ),
      ...(c.sensitive || []).map(
        (r) => `<div class="line"><p><b>隐私红线</b> ${esc(r.words.join("、"))} · ${esc(r.where)}</p>
          <p class="meta">普通获客表单不能在第一步收医疗健康敏感信息，转入合规医疗流程再最小化收集</p>
          <p class="meta">${esc(r.text)}</p></div>`,
      ),
      ...(c.redline || []).map(
        (r) => `<div class="line"><p><b>红线</b> ${esc(r.words.join("、"))} · ${esc(r.where)}</p>
          <p class="meta">${esc(r.text)}</p></div>`,
      ),
      ...(c.watch || []).map(
        (r) => `<div class="line"><p><b>看一眼</b> ${esc(r.words.join("、"))} · ${esc(r.where)}</p>
          <p class="meta">这个词要看语境。是在教客户怎么问就没事，是在打包票就得改</p>
          <p class="meta">${esc(r.text)}</p></div>`,
      ),
      ...(c.hints || []).map(
        (r) => `<div class="line"><p><b>带了镜头提示</b> ${esc(r.where)}</p>
          <p class="meta">这条里的「${esc(r.hint)}」会跟着一起发出去。镜头怎么拍写在分镜里，这一栏只放要发的那句话</p>
          <p class="meta">${esc(r.text)}</p></div>`,
      ),
      ...(c.length || []).map(
        (r) => `<div class="line"><p><b>${r.level === "hard" ? "发不出去" : "会有代价"}</b> ${esc(r.platform)} · ${esc(r.field)} 约 ${r.max} 字，这条 ${r.n} 字</p>
          <p class="meta">${esc(r.why || "")}</p>
          <p class="meta">${esc(r.text)}</p></div>`,
      ),
      ...(c.quality || []).map(
        (r) => `<div class="line"><p><b>${r.level === "hard" ? "质量过不了" : "不像这个平台"}</b> ${esc(r.where)}</p>
          <p class="meta">${esc(r.why || "")}</p>
          ${r.text ? `<p class="meta">${esc(r.text)}</p>` : ""}</div>`,
      ),
    ];
    checksCard.classList.toggle("hidden", !rows.length);
    document.getElementById("checks").innerHTML = rows.length
      ? rows.join("") + `<p class="meta" style="margin-top:12px">${esc(c.note || "")}</p>`
      : "";
  }

  document.getElementById("gaps").innerHTML = `<div class="sleeves">${(pack.gaps || [])
    .map(
      (g, i) => `<article class="sleeve">
        <div class="sleeve-tab">缺口${["一", "二", "三"][i] || i + 1}</div>
        <div class="sleeve-body">
          <h3>${esc(g.name)}</h3>
          <p class="meta">证据 ${esc(pack.evidence)}</p>
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

  document.getElementById("copies").innerHTML = `<div class="sleeves">${rankedCopies
    .map((g, i) => {
      const items = g.rows
        .map((row) => {
          // 显示、复制、发出去的都是改后那版。原句只在底下小字里留个底
          const k = copyKey(g.group, row.i);
          const text = edited(pack, k, row.text);
          const was = editOf(pack, k)?.was;
          return `<div class="line slip" data-line="${encodeURIComponent(k)}">
            <p class="line-text">${esc(text)}</p>
            ${was ? `<p class="meta">改过 · 原句是「${esc(was)}」</p>` : ""}
            <div class="slip-bar">
              <div class="slip-step">
                ${copyButton(text, "复制这条")}
                <button type="button" class="textish" data-edit="${encodeURIComponent(k)}">改</button>
              </div>
              <div class="slip-step">
                <span class="slip-k">用过之后</span>
                <button type="button" class="verdict ${row.fb === "replied" ? "on-yes" : ""}" data-fb="${esc(row.key)}" data-val="replied" aria-pressed="${row.fb === "replied" ? "true" : "false"}">${row.fb === "replied" ? "已记有回音" : "有回音"}</button>
                <button type="button" class="verdict ${row.fb === "dead" ? "on-no" : ""}" data-fb="${esc(row.key)}" data-val="dead" aria-pressed="${row.fb === "dead" ? "true" : "false"}">${row.fb === "dead" ? "已记没反应" : "没反应"}</button>
              </div>
            </div>
          </div>`;
        })
        .join("");
      // 组名常自带字母编号（模型起的，台账里也这么引用），把它提成组号；
      // 没带的组按顺序补中文数字，让每个组头都能被「用组二那条」点名
      const m = g.group.match(/^([A-H])(?:组)?\s+(.+)$/);
      const num = m ? m[1] : ["一", "二", "三", "四", "五", "六", "七", "八", "九"][i] || i + 1;
      const name = m ? m[2] : g.group;
      return `<article class="sleeve sleeve-across${g.replied ? " is-hot" : ""}">
        <div class="sleeve-tab"><span><i class="sleeve-num">${esc(num)}</i>${esc(name)}</span><span>${g.replied ? `${g.replied} 条有回音` : "还没记回音"}</span></div>
        <div class="sleeve-body">${items}</div>
      </article>`;
    })
    .join("")}</div>`;

  const breaksCard = document.getElementById("breaks-card");
  breaksCard?.classList.toggle("hidden", !(pack.breakdowns || []).length);
  document.getElementById("breaks").innerHTML = `<div class="notes">${(pack.breakdowns || [])
    .map((b) => `<article class="note"><h3>${esc(b.copy)}</h3><p>${esc(b.why)}</p></article>`)
    .join("")}</div>`;

  const landingCard = document.getElementById("landing-card");
  if (landingCard) {
    const l = pack.landing;
    landingCard.classList.toggle("hidden", !l?.firstScreen);
    if (l?.firstScreen) {
      document.getElementById("landing").innerHTML = `<div class="sleeves">
        <article class="sleeve sleeve-across">
          <div class="sleeve-tab"><span><i class="sleeve-num">一</i>第一屏那句话</span><span>${esc(l.way || "")}</span></div>
          <div class="sleeve-body">
            <div class="line slip">
              <p class="line-text">${esc(l.firstScreen)}</p>
              <div class="slip-bar"><div class="slip-step">
                ${copyButton(l.firstScreen, "复制这句")}
              </div></div>
            </div>
            <div class="sleeve-fields">
              <div class="full"><p class="field-k">留了资立刻给</p><p>${esc(l.reward || "")}</p></div>
              <div class="${l.leak ? "" : "full"}"><p class="field-k">表单只问</p><p>${esc((l.form || []).join("；") || "没写")}</p></div>
              ${l.leak ? `<div><p class="field-k">最常漏在这</p><p>${esc(l.leak)}</p></div>` : ""}
            </div>
          </div>
        </article>
        ${
          l.firstTouch?.open?.length
            ? `<article class="sleeve sleeve-across">
          <div class="sleeve-tab"><span><i class="sleeve-num">二</i>线索来了第一句</span><span>先兑现，不推销</span></div>
          <div class="sleeve-body">
            ${l.firstTouch.open
              .map(
                (o) => `<div class="line slip">
              ${o.from ? `<p class="field-k">${esc(o.from)}</p>` : ""}
              <p class="line-text">${esc(o.say)}</p>
              <div class="slip-bar"><div class="slip-step">
                ${copyButton(o.say)}
              </div></div>
            </div>`,
              )
              .join("")}
            ${
              l.firstTouch.pushback?.length
                ? `<div class="sleeve-fields" style="margin-top:12px">${l.firstTouch.pushback
                    .map(
                      (p) =>
                        `<div class="full"><p class="field-k">他说「${esc(p.said)}」</p><p>${esc(p.reply)}</p></div>`,
                    )
                    .join("")}</div>`
                : ""
            }
          </div>
        </article>`
            : ""
        }
        ${
          l.rewardOutline?.length
            ? `<article class="sleeve sleeve-across">
          <div class="sleeve-tab"><span><i class="sleeve-num">三</i>那份东西怎么做</span><span>${l.rewardOutline.length} 栏</span></div>
          <div class="sleeve-body"><div class="sleeve-fields">${l.rewardOutline
            .map((x, i) => `<div class="full"><p class="field-k">第 ${i + 1} 栏</p><p>${esc(x)}</p></div>`)
            .join("")}</div></div>
        </article>`
            : ""
        }
      </div>`;
    }
  }

  const shells = rankShells(pack.shells, pack.battlefields);
  const mains = shells.filter((s) => s.main);
  const extras = shells.filter((s) => !s.main);
  // 小红书要分封面大字、标题、正文三样分别复制；朋友圈折叠线前后两样。
  // 一个「复制这条」按钮解决不了，那是把三个字段当成一句话。
  const platBlock = (s, kind) => {
    const fields = state.platformFields[s.name] || [{ key: "title", label: "文案" }];
    const items = s.lines
      .map((raw, idx) => {
        const item = typeof raw === "string" ? { title: raw } : raw || {};
        const present = fields.filter((f) => item[f.key]);
        // 只有一个字段时不用标名字，那是废话
        const rows = present
          .map((f) => {
            const k = shellKey(s.name, idx, f.key);
            const text = edited(pack, k, item[f.key]);
            const was = editOf(pack, k)?.was;
            return `<div class="line-row"${present.length > 1 ? ' style="margin-top:8px"' : ""} data-line="${encodeURIComponent(k)}">
              <div>${present.length > 1 ? `<p class="field-k">${esc(f.label)}</p>` : ""}<p class="line-text${f.key === "body" ? " asis" : ""}">${esc(text)}</p>
              ${was ? `<p class="meta">改过 · 原句是「${esc(was)}」</p>` : ""}</div>
              <div class="acts-inline">
                ${copyButton(text)}
                <button type="button" class="textish" data-edit="${encodeURIComponent(k)}">改</button>
              </div>
            </div>`;
          })
          .join("");
        return `<div class="line slip">${rows}</div>`;
      })
      .join("");
    return `<section class="plat ${kind}"><h3>${esc(s.name)}<span>${kind === "is-main" ? "主战场" : "换外壳"}</span></h3>${items}</section>`;
  };
  const platBox = document.getElementById("plats");
  // 有正文的平台（小红书、朋友圈折叠后）塞进窄栏会挤成一条，
  // 单独占满整行。窄栏只放一句话的平台。
  const hasBody = (s) =>
    (s.lines || []).some((raw) => typeof raw === "object" && raw && raw.body);
  const wide = extras.filter(hasBody);
  const narrow = extras.filter((s) => !hasBody(s));
  if (mains.length && narrow.length) {
    platBox.className = "field-grid";
    platBox.innerHTML = `
      <div class="field-col">${mains.map((s) => platBlock(s, "is-main")).join("")}</div>
      <div class="field-col field-col-quiet">${narrow.map((s) => platBlock(s, "is-shell")).join("")}</div>
      ${wide.length ? `<div class="field-col field-col-quiet field-col-wide">${wide.map((s) => platBlock(s, "is-shell")).join("")}</div>` : ""}`;
  } else if (mains.length && wide.length) {
    platBox.className = "field-grid field-grid-one";
    platBox.innerHTML = `
      <div class="field-col">${mains.map((s) => platBlock(s, "is-main")).join("")}</div>
      <div class="field-col field-col-quiet">${wide.map((s) => platBlock(s, "is-shell")).join("")}</div>`;
  } else {
    platBox.className = "field-grid field-grid-one";
    const only = mains.length ? mains : extras;
    const kind = mains.length ? "is-main" : "is-shell";
    platBox.innerHTML = `<div class="field-col">${only.map((s) => platBlock(s, kind)).join("")}</div>`;
  }

  const hasDelivery = Boolean(pack.testPath || pack.supply || pack.honest || (pack.next || []).length);
  document.getElementById("delivery-card")?.classList.toggle("hidden", !hasDelivery);
  document.getElementById("delivery").innerHTML = `
    <div class="folio folio-3">
      <div class="folio-cell is-who">
        <p class="k">主战场</p>
        <p>${esc((pack.battlefields || []).join("、"))}</p>
      </div>
      <div class="folio-cell">
        <p class="k">测试路径</p>
        <p>${esc(pack.testPath || "")}</p>
      </div>
      <div class="folio-cell">
        <p class="k">补给节奏</p>
        <p>${esc(pack.supply || "")}</p>
      </div>
    </div>
    <p style="margin-top:14px">${esc(pack.honest || "")}</p>
    <p class="meta">下一步：${esc((pack.next || []).join("；"))}</p>
    <p class="meta">出价和定向让代运营定，我们负责让他们有好素材可投。</p>`;

  renderCustomers();
  renderPackIndex();
}

function renderCustomers() {
  const box = document.getElementById("customer-list");
  if (!box) return;
  const list = [...(state.workspace.customers || [])].sort((a, b) => {
    const au = a.track ? 1 : 0;
    const bu = b.track ? 1 : 0;
    if (au !== bu) return au - bu;
    if (a.id === state.workspace.usingId) return -1;
    if (b.id === state.workspace.usingId) return 1;
    return packsOf(b).length - packsOf(a).length;
  });
  box.innerHTML = list.length
    ? list
        .map((c) => {
          const packs = packsOf(c);
          const latest = packs[0];
          const using = c.id === state.workspace.usingId;
          const kind = c.track || "未标明";
          const kindChip = c.track === "存量" ? chip("存量", "chip-stock") : c.track === "拓新" ? chip("拓新", "chip-new") : chip("未标明", "chip-warn");
          const actions = c.track
            ? using
              ? ""
              : `<button type="button" class="go" data-using="${c.id}">${packs.length ? "看当时给的" : "打开"}</button>`
            : `<button type="button" class="go" data-track="${c.id}|存量">标为存量</button>
                <button type="button" class="go" data-track="${c.id}|拓新">标为拓新</button>`;
          return rowCard({
            title: c.name,
            chips: `${kindChip}${c.hunt ? chip(c.hunt) : ""}${using && c.track ? chip("当前", "chip-hot") : ""}`,
            meta: `${c.materials?.length ? `资料 ${c.materials.length} 份 · ` : ""}${packs.length ? `已出 ${packs.length} 份` : c.track === "存量" ? "还没出今日" : c.track === "拓新" ? "还没出判断" : "先标明种类"}${latest ? ` · ${esc(latest.deliveredAt || latest.createdAt)}` : ""}`,
            actions,
          });
        })
        .join("")
    : `<p class="meta">本子还是空的。</p>`;
}

function renderPackIndex() {
  const box = document.getElementById("pack-list");
  if (!box) return;
  const rows = (state.workspace.customers || []).flatMap((c) =>
    clientPacksForCustomer(c).map((p) => ({ customer: c, pack: p })),
  );
  box.innerHTML = rows.length
    ? rows
        .map(
          ({ customer, pack }) =>
            rowCard({
              title: customer.name,
              chips: `${chip(pack.tier || "档")}${pack.deliveredAt || pack.createdAt ? chip(pack.deliveredAt || pack.createdAt) : ""}`,
              meta: esc(pack.title || ""),
              actions: `<button type="button" class="go" data-using="${customer.id}" data-pack="${pack.id}">打开这份</button>`,
            }),
        )
        .join("")
    : `<p class="meta">还没有发给甲方的包裹。</p>`;
}

function renderLedger() {
  const rows = state.workspace.ledger || [];
  document.getElementById("ledger-body").innerHTML = rows.length
    ? rows.map(
    (r) => `<tr>
      <td>${esc(r.date)}</td><td>${esc(r.client)}${r.demo ? ' <span class="tag">演示</span>' : ""}</td><td>${esc(r.hunt)}</td>
      <td>${esc(r.result)}</td><td class="num">${esc(r.quote)}</td><td>${esc(r.talk)}</td>
    </tr>`,
  ).join("")
    : `<tr><td colspan="6">还没有你自己的台账。</td></tr>`;
}

/* 台账没有录入入口就是死胡同：销售真去记的时候，一张永远空着的表只会让他再也不点进来 */
function renderLedgerForm() {
  const card = document.getElementById("ledger-form-card");
  const sel = document.getElementById("ledger-client");
  if (!card || !sel) return;
  const list = state.workspace.customers || [];
  if (!list.length) {
    card.classList.add("hidden");
    return;
  }
  card.classList.remove("hidden");
  const current = sel.value;
  sel.innerHTML = list
    .map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`)
    .join("");
  if (list.some((c) => c.id === current)) sel.value = current;
  renderLedgerLines();
}

/* 「哪条带来的」只列这个客户最新一份档里的文案，列的还是改后的那版——
 * 反馈要落在他真发出去的那句上，不是模型原来写的那句 */
function renderLedgerLines() {
  const sel = document.getElementById("ledger-line");
  if (!sel) return;
  const id = document.getElementById("ledger-client")?.value || "";
  const c = (state.workspace.customers || []).find((x) => x.id === id);
  const pack = latestAttributablePack(c);
  const groups = pack ? Object.entries(pack.copies || {}) : [];
  sel.innerHTML =
    `<option value="">这次不挂某一条</option>` +
    groups
      .flatMap(([group, lines]) =>
        (lines || []).map((text, i) => {
          // 反馈的 key 带档 id，改稿的 key 只带组名和下标，两把钥匙别串
          const key = `${pack.id}-${group}-${i}`;
          const shown = edited(pack, copyKey(group, i), text);
          const brief = shown.length > 16 ? `${shown.slice(0, 16)}…` : shown;
          return `<option value="${esc(key)}">${esc(group)} · ${esc(brief)}</option>`;
        }),
      )
      .join("");
}

function bind() {
  document.body.addEventListener("click", (e) => {
    const navEl = e.target.closest("[data-nav]");
    if (navEl) {
      e.preventDefault();
      nav(navEl.dataset.nav);
      return;
    }
    if (e.target.closest("[data-theme-toggle]")) {
      state.theme = state.theme === "light" ? "dark" : "light";
      applyTheme();
      return;
    }
    const edit = e.target.closest("[data-edit]");
    if (edit) {
      const key = decodeURIComponent(edit.dataset.edit);
      const box = edit.closest("[data-line]");
      const p = box?.querySelector(".line-text");
      if (!p || box.querySelector("textarea")) return;
      // 就地改：原文换成输入框，存完整页重画。不做弹窗，改一句话不值得挡住整个屏幕
      const ta = document.createElement("textarea");
      ta.value = p.textContent;
      ta.rows = Math.min(8, Math.ceil(p.textContent.length / 28) + 1);
      ta.className = "edit-box";
      p.replaceWith(ta);
      ta.focus();
      const save = async (text) => {
        const res = await fetch("/api/edit", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ packId: currentPack()?.id, key, text }),
        });
        const data = await res.json();
        if (!res.ok) {
          toast(data.error || "没存上");
          // 存失败不能把销售刚敲的字吞了：输回输入框，让他改完再存
          const holder = document.querySelector(`[data-line="${encodeURIComponent(key)}"]`);
          const target = holder?.querySelector(".line-text, p");
          if (target && !holder.querySelector("textarea")) {
            const again = document.createElement("textarea");
            again.value = text;
            again.rows = Math.min(8, Math.ceil(text.length / 28) + 1);
            again.className = "edit-box";
            target.replaceWith(again);
            again.focus();
          }
          return;
        }
        state.workspace = data;
        toast("改好了，复制和甲方页拿的都是这一版");
        renderToday();
      };
      let cancelled = false;
      ta.addEventListener("blur", () => { if (!cancelled) save(ta.value.trim()); }, { once: true });
      ta.addEventListener("keydown", (ev) => {
        if (ev.key === "Escape") { cancelled = true; renderToday(); }
        if (ev.key === "Enter" && (ev.metaKey || ev.ctrlKey)) ta.blur();
      });
      return;
    }
    const copy = e.target.closest("[data-copy]");
    if (copy) {
      // 承诺「已复制」之前先等剪贴板真的写进去；非安全上下文里这步会失败
      navigator.clipboard
        .writeText(decodeURIComponent(copy.dataset.copy))
        .then(() => toast("已复制"))
        .catch(() => toast("没复制上，手动选中复制"));
      return;
    }
    const fb = e.target.closest("[data-fb]");
    if (fb) {
      fetch("/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key: fb.dataset.fb, value: fb.dataset.val }),
      }).then(async (res) => {
        if (res.ok) state.workspace = await res.json();
        renderToday();
      });
      return;
    }
    const open = e.target.closest("[data-open]");
    if (open) nav(open.dataset.open);
    const packBtn = e.target.closest("[data-pack]");
    if (packBtn && !packBtn.dataset.using) {
      state.packId = packBtn.dataset.pack;
      renderToday();
    }
  });
}

async function useCustomer(id, packId) {
  state.openedId = id;
  const res = await fetch("/api/using", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id }),
  });
  const data = await res.json();
  if (!res.ok) {
    toast(data.error || "切不过去");
    return;
  }
  state.workspace = data;
  state.packId = packId || "";
  renderToday();
  renderLedger();
  renderLedgerForm();
  nav("today");
}

/* ——— 模型接口：一个渠道一张卡。密钥地址一行一事，模型按能力分四栏、一行一个开关 ——— */

const MODEL_CATS = [
  { key: "text", label: "文本" },
  { key: "image", label: "图像" },
  { key: "video", label: "视频" },
  { key: "audio", label: "音频" },
];

/* 只按模型名猜类别，给标签页分组用。出档能不能用，还是看开关和图片能力那套。 */
function modelCategory(m) {
  const n = String(m || "").toLowerCase();
  if (/(?:seedance|cogvideo|video|veo|sora|vidu|kling|hailuo|wan2|(?:^|[-_.])(?:t2v|i2v|v2v|flf2v)(?:[-_.]|$))/.test(n))
    return "video";
  if (/(?:whisper|tts|asr|speech|realtime|voice|audio|podcast)/.test(n)) return "audio";
  if (
    /(?:^|[-_.])(?:vl|vision|omni)(?:[-_.]|$)/.test(n) ||
    /(?:seedream|seededit|t2i|i2i|flux|dall[-_.]?e|image|3d|glm-\d+(?:\.\d+)?v(?:[-_.]|$))/.test(n)
  )
    return "image";
  return "text";
}

/* 名字那行给人看：deepseek-chat → Deepseek Chat。原文在下面一行等宽字体里，一字不改。 */
function modelPretty(id) {
  return String(id || "")
    .split(/[-_.]/)
    .map((seg) => (/^[a-z]{1,3}$/.test(seg) ? seg.toUpperCase() : seg.charAt(0).toUpperCase() + seg.slice(1)))
    .join(" ");
}

const ICON_GRIP =
  '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="currentColor"><circle cx="9" cy="6" r="1.7"/><circle cx="15" cy="6" r="1.7"/><circle cx="9" cy="12" r="1.7"/><circle cx="15" cy="12" r="1.7"/><circle cx="9" cy="18" r="1.7"/><circle cx="15" cy="18" r="1.7"/></svg>';
const ICON_BOLT =
  '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2.5 4.5 13.5H11l-1 8 8.5-11H12l1-8Z"/></svg>';
const ICON_PEN =
  '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20l4.5-1L20 7.5a2.1 2.1 0 0 0-3-3L5.5 16 4 20Z"/></svg>';
const ICON_EYE =
  '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="2.6"/></svg>';

function providerCard(id, p, active) {
  const isActive = active === id;
  const folded = Boolean(state.llmFolded[id]);
  const tab = state.llmTabs[id] || "text";
  const enabled = new Set(p.enabled || []);
  const rows = (p.models || []).map((m) => ({ m, cat: modelCategory(m), on: enabled.has(m) }));
  const counts = { text: 0, image: 0, video: 0, audio: 0 };
  rows.forEach((r) => {
    counts[r.cat] += 1;
  });
  const shown = rows.filter((r) => r.cat === tab);
  const catLabel = MODEL_CATS.find((c) => c.key === tab)?.label || "";
  const visionLine = {
    verified: p.visionTestDetail || "已经实测能读取图片",
    failed: p.visionTestDetail || "图片测试失败",
    on: "已指定为视觉模型",
    off: "只用于文本",
    text: "按模型名判断为纯文本模型",
    likely: "按模型名判断支持图片",
    unknown: "模型名看不出能力；火山 endpoint 等请手动指定",
  }[p.visionStatus || "unknown"];

  const keyRow =
    p.hasKey && !state.llmKeyEdit[id]
      ? `<div class="llm-key-view">
          <code>${esc(p.apiKeyMasked)}</code>
          <button type="button" class="llm-key-edit" data-llm-key-edit="${esc(id)}" aria-label="修改密钥">${ICON_PEN}</button>
        </div>`
      : `<div class="pass-wrap">
          <input id="llm-key-${esc(id)}" data-llm-key="${esc(id)}" type="password" autocomplete="off" placeholder="${p.hasKey ? "输入新的 API Key，留空不改" : "粘贴这个渠道的 API Key"}">
          <button type="button" class="eye" data-eye="llm-key-${esc(id)}" aria-label="显示密钥" aria-pressed="false">${ICON_EYE}</button>
        </div>`;

  const baseRow =
    p.baseUrl || state.llmBaseEdit[id]
      ? `<input id="llm-base-${esc(id)}" data-llm-base="${esc(id)}" value="${esc(p.baseUrl || "")}" data-orig="${esc(p.baseUrl || "")}" placeholder="https://… OpenAI 兼容地址" spellcheck="false">`
      : `<button type="button" class="llm-base-add" data-llm-base-edit="${esc(id)}">＋ 配置地址</button>`;

  const addRow = state.llmAddOpen[id]
    ? `<div class="llm-add-row">
        <input data-llm-model-new="${esc(id)}" placeholder="模型名或火山 endpoint，回车加上" spellcheck="false">
        <button class="do" type="button" data-llm-model-new-save="${esc(id)}">加上</button>
      </div>`
    : "";

  const modelRows = shown.length
    ? shown
        .map(
          ({ m, on }) => `<div class="llm-model${on ? "" : " is-off"}${m === p.model ? " is-current" : ""}" data-llm-pick="${esc(id)}" data-model="${esc(m)}" title="点一下就用这个模型出档">
          <div class="llm-model-txt">
            <strong>${esc(modelPretty(m))}${m === p.model ? '<span class="llm-now">当前</span>' : ""}</strong>
            <code>${esc(m)}</code>
          </div>
          <button type="button" class="llm-toggle${on ? " is-on" : ""}" role="switch" aria-checked="${on}" aria-label="启用 ${esc(m)}" data-llm-toggle="${esc(id)}" data-model="${esc(m)}"><span class="llm-knob"></span></button>
        </div>`,
        )
        .join("")
    : `<div class="llm-empty"><p class="meta">${
        (p.models || []).length
          ? `这个渠道没有${catLabel}类模型。同步后按模型名自动分栏，也可以用「＋ 添加」手动补。`
          : "还没有模型。填好密钥点「同步最新模型」拉清单；火山 endpoint 这类不在清单里的，用「＋ 添加」补。"
      }</p></div>`;

  const visionBlock =
    tab === "image"
      ? `<div class="llm-vision">
          <label class="llm-field-k" for="llm-vision-${esc(id)}">图片能力</label>
          <select id="llm-vision-${esc(id)}" data-llm-vision="${esc(id)}">
            <option value="auto" ${p.vision === "auto" ? "selected" : ""}>自动判断</option>
            <option value="on" ${p.vision === "on" ? "selected" : ""}>支持图片</option>
            <option value="off" ${p.vision === "off" ? "selected" : ""}>仅文本</option>
          </select>
          <button class="do" type="button" data-llm-vision-test="${esc(id)}">图片测试</button>
        </div>
        <p class="meta">${esc(visionLine)}</p>`
      : "";

  const syncLine = p.lastSyncAt ? ` · 上次同步 ${new Date(p.lastSyncAt).toLocaleDateString("zh-CN")}` : "";

  return `<article class="llm-card${folded ? " is-folded" : ""}${isActive ? " is-active" : ""}" data-provider="${esc(id)}">
    <header class="llm-head">
      <span class="llm-grip" data-llm-grip="${esc(id)}" title="拖动排序">${ICON_GRIP}</span>
      <button type="button" class="llm-fold" data-llm-fold="${esc(id)}" aria-expanded="${folded ? "false" : "true"}" aria-label="${folded ? "展开这张卡" : "收起这张卡"}">
        <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">${folded ? '<path d="M12 5v14M5 12h14"/>' : '<path d="M5 12h14"/>'}</svg>
      </button>
      <h2 class="llm-name">${
        p.builtin
          ? esc(p.name)
          : `<input data-llm-name="${esc(id)}" value="${esc(p.name || "")}" data-orig="${esc(p.name || "")}" placeholder="起个名字，比如 火山方舟" aria-label="渠道名字">`
      }</h2>
      <button type="button" class="llm-live${isActive ? " is-on" : ""}" data-llm-use="${esc(id)}" title="${isActive ? "正在用这个渠道出档" : "点闪电切到这个渠道"}" aria-label="${isActive ? "当前渠道" : "设为当前渠道"}">${ICON_BOLT}</button>
      <span class="llm-head-acts">
        <button class="do" type="button" data-llm-test="${esc(id)}">测试连接</button>
        ${p.docsUrl ? `<a class="do llm-docs" href="${esc(p.docsUrl)}" target="_blank" rel="noreferrer">开通教程</a>` : ""}
      </span>
    </header>
    <div class="llm-body">
      <div class="llm-fields">
        <label class="llm-field-k" for="llm-key-${esc(id)}">密钥</label>
        ${keyRow}
        <label class="llm-field-k" for="llm-base-${esc(id)}">接口地址</label>
        ${baseRow}
        <p class="meta">${esc(p.lastTestDetail || "还没测过连接")}${syncLine}</p>
      </div>
      <nav class="llm-tabs" aria-label="模型分类">
        ${MODEL_CATS.map(
          (c) => `<button type="button" class="llm-tab${tab === c.key ? " is-on" : ""}" data-llm-tab="${esc(id)}" data-cat="${c.key}">${c.label}<b class="llm-count">${counts[c.key]}</b></button>`,
        ).join("")}
      </nav>
      <div class="llm-model-head">
        <strong class="llm-cat">${catLabel}模型</strong>
        <span class="llm-model-acts">
          <button class="textish" data-llm-sync="${esc(id)}" type="button">同步最新模型</button>
          <button class="textish" data-llm-model-add="${esc(id)}" type="button">＋ 添加</button>
        </span>
      </div>
      ${addRow}
      ${visionBlock}
      <div class="llm-models">${modelRows}</div>
      ${p.builtin ? "" : `<div class="llm-foot"><button class="textish" data-llm-del="${esc(id)}" type="button">删掉这个接口</button></div>`}
    </div>
  </article>`;
}

async function loadLlm() {
  const box = document.getElementById("llm-box");
  if (!box) return;
  const res = await fetch("/api/llm");
  if (res.status === 403 || res.status === 401) {
    box.innerHTML = `<article class="card"><p>只有管理员能看密钥。</p></article>`;
    return;
  }
  const data = await res.json();
  // 一个人可能同时挂着火山、硅基流动、一个自建中转，所以自定义接口不止一个
  const cards = Object.entries(data.providers)
    .map(([id, p]) => providerCard(id, p, data.active))
    .join("");
  box.innerHTML = `<article class="card">
      <h2>模型接口</h2>
      <p class="meta">一个接口一张卡，模型按新到旧排列，默认不替你选择。点模型名才会用它，开关关掉的不会被选上。</p>
    </article>
    <div class="llm-grid" id="llm-grid">${cards}
      <article class="llm-card llm-add-card">
        <strong>再加一个接口</strong>
        <p class="meta">任何 OpenAI 兼容的地址都行。加好之后跟上面几张一样填密钥、同步模型。</p>
        <input id="llm-new-name" placeholder="好认就行，比如 火山方舟">
        <div class="acts"><button class="do" id="llm-add" type="button">加上</button></div>
      </article>
    </div>`;
  bindEyes(box);
  // 刚点开的那行输入，重画完把焦点接回去，不然「改密钥」要点两回
  const focus = state.llmFocus;
  state.llmFocus = "";
  if (focus) {
    const [field, fid] = focus.split(":");
    const sel =
      field === "key"
        ? `[data-llm-key="${CSS.escape(fid)}"]`
        : field === "base"
          ? `[data-llm-base="${CSS.escape(fid)}"]`
          : field === "add"
            ? `[data-llm-model-new="${CSS.escape(fid)}"]`
            : "";
    const el = sel ? box.querySelector(sel) : null;
    if (el) {
      el.focus();
      el.setSelectionRange?.(el.value.length, el.value.length);
    }
  }
}

async function loadUsers() {
  const list = document.getElementById("white-list");
  const res = await fetch("/api/users");
  if (!res.ok) return;
  const data = await res.json();
  // 一份名单就够。开通了没注册、和已经在用，是同一个人的两种状态，
  // 不是两张表。原来并排挂两份，谁看都要愣一下。
  const registered = new Map((data.users || []).map((u) => [u.email, u.role]));
  const adminEmail = (data.users || []).find((u) => u.role === "admin")?.email || "";
  if (list) {
    list.innerHTML = (data.whitelist || [])
      .map((email) => {
        const role = registered.get(email);
        const state = role
          ? role === "admin"
            ? "管理员 · 在用"
            : "已注册 · 在用"
          : "已开通，还没注册";
        const locked = email === adminEmail;
        return rowCard({
          title: email,
          chips: chip(state, role ? "chip-hot" : ""),
          actions: `${role && !locked ? `<button type="button" class="go" data-white-reset="${esc(email)}">重设密码</button>` : ""}
          ${locked ? "" : `<button type="button" class="go" data-white-del="${esc(email)}">移出</button>`}`,
        });
      })
      .join("");
  }
}

async function loadCrew() {
  const box = document.getElementById("crew-rows");
  if (!box) return;
  const res = await fetch("/api/overview");
  if (res.status === 403 || res.status === 401) return;
  if (!res.ok) return;
  const { hunts = [], talks = [] } = await res.json();
  const line = document.getElementById("crew-line");
  const top = hunts.find((h) => h.replied > 0 || h.deals > 0);
  if (line) {
    line.textContent = top
      ? `最响的方向：${top.hunt}——${top.replied} 条有回音${top.deals ? ` · ${top.deals} 笔成交` : ""}。全是点出来的，没有一条是编的。`
      : "全组还没人标过一条有回音。有人点过「有回音」或记过台账，这里才有东西说。";
  }
  box.innerHTML = hunts.length
    ? hunts
        .map(
          (h) => `<div class="row hunt-stat">
      <div class="row-main">
        <div class="row-head"><strong>${esc(h.hunt)}</strong></div>
        <div class="meta">${h.sales} 人在打 · ${h.customers} 个客户 · 出过 ${h.packs} 份档</div>
      </div>
      <div class="stat-pills">
        <span><b>${h.replied}</b> 回音</span>
        <span><b>${h.asked}</b> 问价</span>
        <span><b>${h.deals}</b> 成交</span>
      </div>
    </div>`,
        )
        .join("")
    : `<p class="meta">还没有客户。</p>`;
  const tbox = document.getElementById("crew-talks");
  if (tbox) {
    tbox.innerHTML = talks.length
      ? talks
          .map(
            (t) =>
              `<article class="note"><h3>${esc(t.client)} · ${esc(t.hunt)} · ${esc(t.result)} · ${esc(t.date)}</h3><p>${esc(t.talk)}</p></article>`,
          )
          .join("")
      : `<p class="meta">还没有记过原话。</p>`;
  }
}

async function boot() {
  applyTheme();
  document.getElementById("mast-date").textContent =
    new Date().toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }).replace(/\//g, "-");
  const me = await fetch("/api/me");
  if (me.status === 401) {
    location.href = "/login.html";
    return;
  }
  const user = await me.json();
  const who = document.getElementById("who");
  who.textContent = user.email;
  // 设置人人都有。销售那页只有密码，超管多出名单和模型两块。
  document.getElementById("settings-line").textContent = user.isAdmin
    ? "密钥和谁能进这个台子，只有你能定。"
    : "这台子上你能设的只有密码。别的都跟着客户走。";
  if (user.isAdmin) document.getElementById("whitelist-card").classList.remove("hidden");
  const huntSel = document.getElementById("hunt");
  if (huntSel) {
    const got = await fetch("/api/hunts");
    const { hunts = [] } = got.ok ? await got.json() : {};
    // 行业不止这些。选「其他行业」就现场长一份包，存下来，下次它就在列表里了。
    huntSel.innerHTML =
      hunts.map((h) => `<option>${h}</option>`).join("") +
      `<option value="__new__">其他行业…</option>`;
    const newLabel = document.getElementById("new-hunt-label");
    const newInput = document.getElementById("new-hunt");
    huntSel.addEventListener("change", () => {
      const isNew = huntSel.value === "__new__";
      newLabel?.classList.toggle("hidden", !isNew);
      newInput?.classList.toggle("hidden", !isNew);
      if (isNew) newInput?.focus();
    });
  }

  const pf = await fetch("/api/platform-fields");
  if (pf.ok) state.platformFields = (await pf.json()).fields || {};

  const space = await fetch("/api/workspace");
  if (space.ok) state.workspace = await space.json();
  bindEyes();
  renderToday();
  renderLedger();
  renderLedgerForm();
  document.getElementById("ledger-client")?.addEventListener("change", renderLedgerLines);
  bind();
  nav("today");
  // 刷新前正在出的档，刷新后也得有人等它：轮询丢了页面就会永远说「正在出档」
  const busy = usingCustomer();
  if (busy?.job) watchJob(busy.id);
  if (user.isAdmin) {
    loadLlm();
    loadUsers();
    document.getElementById("nav-crew")?.classList.remove("hidden");
    loadCrew();
  }
  // 管理员第一次登录，刚输的密码就是以后的密码，得让他知道这事定下来了
  if (new URLSearchParams(location.search).get("first") === "1") {
    toast("首次登录完成。刚输入的密码就是以后的密码，记牢。");
    history.replaceState(null, "", "/");
  }
}

document.getElementById("nav-logout")?.addEventListener("click", async (e) => {
  e.preventDefault();
  await fetch("/api/logout", { method: "POST" });
  location.href = "/login.html";
});

document.getElementById("add-white")?.addEventListener("click", async () => {
  const res = await fetch("/api/whitelist", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: document.getElementById("white-email").value }),
  });
  const data = await res.json();
  toast(res.ok ? "已加入" : data.error || "加入失败");
  if (res.ok) loadUsers();
});

document.getElementById("go-full")?.addEventListener("click", async (e) => {
  const btn = e.currentTarget;
  const packId = btn.dataset.pack;
  const customerId = btn.dataset.customer;
  if (!packId || !customerId) return;
  btn.disabled = true;
  const old = btn.textContent;
  btn.textContent = "正在补分镜…";
  try {
    const res = await fetch("/api/full", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ packId }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast(data.error || "出分镜失败");
      return;
    }
    // 分镜也是后台跑：请求回来只说明排上了，出好靠轮询刷新
    state.workspace = data;
    renderToday();
    toast("正在补分镜，出好了这里会自己刷新");
    watchJob(customerId);
  } catch {
    toast("网络不通，请再试");
  } finally {
    btn.disabled = false;
    btn.textContent = old;
  }
});

/* 出档要一两分钟。点完立刻返回，这里每 4 秒问一次，客户身上的 job 清了就重画。
 * 不用 WebSocket：一个销售同时最多等一份档，轮询足够，也不怕断线。 */
let watching = 0;
function watchJob(customerId) {
  clearInterval(watching);
  watching = setInterval(async () => {
    try {
      const res = await fetch("/api/workspace");
      if (!res.ok) return;
      const data = await res.json();
      const c = data.customers?.find((x) => x.id === customerId);
      if (c?.job) return;
      clearInterval(watching);
      state.workspace = data;
      state.packId = "";
      renderToday();
      toast(c?.lastFail ? `没出成：${c.lastFail}` : "出好了");
    } catch {
      /* 网络抖一下不算数，下一轮再问 */
    }
  }, 4000);
}

document.getElementById("go-repack")?.addEventListener("click", async (e) => {
  const btn = e.currentTarget;
  const customerId = btn.dataset.customer;
  if (!customerId) return;
  btn.disabled = true;
  const old = btn.textContent;
  btn.textContent = "正在重出…";
  try {
    const res = await fetch("/api/repack", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ customerId }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast(data.error || "重出失败");
      return;
    }
    state.workspace = data;
    renderToday();
    toast("正在重出，出好了这里会自己刷新");
    watchJob(customerId);
  } catch {
    toast("网络不通，请再试");
  } finally {
    btn.disabled = false;
    btn.textContent = old;
  }
});

document.getElementById("go-today")?.addEventListener("click", async (e) => {
  const btn = e.currentTarget;
  const customerId = btn.dataset.customer;
  if (!customerId) return;
  btn.disabled = true;
  const old = btn.textContent;
  btn.textContent = "正在出今日…";
  try {
    const res = await fetch("/api/today", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ customerId }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast(data.error || "出今日失败");
      return;
    }
    state.workspace = data;
    state.packId = "";
    renderToday();
    toast("正在出今日内容，出好了这里会自己刷新");
    watchJob(customerId);
  } catch {
    toast("网络不通，请再试");
  } finally {
    btn.disabled = false;
    btn.textContent = old;
  }
});

document.getElementById("go-refill")?.addEventListener("click", async (e) => {
  const btn = e.currentTarget;
  const customerId = btn.dataset.customer;
  if (!customerId) return;
  btn.disabled = true;
  const old = btn.textContent;
  btn.textContent = "正在补货…";
  try {
    const res = await fetch("/api/refill", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ customerId }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast(data.error || "补货失败");
      return;
    }
    state.workspace = data;
    renderToday();
    toast("正在补货，出好了这里会自己刷新");
    watchJob(customerId);
  } catch {
    toast("网络不通，请再试");
  } finally {
    btn.disabled = false;
    btn.textContent = old;
  }
});

const materialFiles = document.getElementById("material-files");
const materialDrop = document.getElementById("material-drop");

materialDrop?.addEventListener("click", () => materialFiles?.click());
materialDrop?.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    materialFiles?.click();
  }
});
materialFiles?.addEventListener("change", () => {
  addMaterialFiles(materialFiles.files);
  materialFiles.value = "";
});
for (const type of ["dragenter", "dragover"]) {
  materialDrop?.addEventListener(type, (event) => {
    event.preventDefault();
    materialDrop.classList.add("dragging");
  });
}
for (const type of ["dragleave", "drop"]) {
  materialDrop?.addEventListener(type, (event) => {
    event.preventDefault();
    materialDrop.classList.remove("dragging");
  });
}
materialDrop?.addEventListener("drop", (event) => addMaterialFiles(event.dataTransfer?.files));

document.getElementById("add-material-link")?.addEventListener("click", () => {
  const input = document.getElementById("material-link");
  const raw = input?.value.trim();
  if (!raw) return;
  try {
    const url = new URL(raw);
    if (!["http:", "https:"].includes(url.protocol)) throw new Error();
    const normalized = url.toString();
    if (!state.materials.links.includes(normalized)) state.materials.links.push(normalized);
    input.value = "";
    invalidateMaterialBatch();
    renderMaterialQueue();
  } catch {
    toast("请填完整的 http 或 https 网页链接");
  }
});

document.getElementById("material-link")?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    document.getElementById("add-material-link")?.click();
  }
});

document.getElementById("material-queue")?.addEventListener("click", (event) => {
  const btn = event.target.closest("[data-remove-material]");
  if (!btn) return;
  const index = Number(btn.dataset.index);
  if (btn.dataset.removeMaterial === "file") state.materials.files.splice(index, 1);
  else state.materials.links.splice(index, 1);
  invalidateMaterialBatch();
  renderMaterialQueue();
});

document.getElementById("analyze-materials")?.addEventListener("click", async () => {
  if (!state.materials.files.length && !state.materials.links.length) {
    toast("请先选择文件或加入网页链接");
    return;
  }
  const btn = document.getElementById("analyze-materials");
  const status = document.getElementById("material-state");
  btn.disabled = true;
  state.materials.busy = true;
  btn.textContent = "正在读取…";
  status.textContent = "正在抽取正文、画面和视频语音，之后会形成资料梳理";
  try {
    const form = new FormData();
    state.materials.files.forEach((file) => form.append("files", file, file.name));
    form.append("links", JSON.stringify(state.materials.links));
    const res = await fetch("/api/materials/analyze", { method: "POST", body: form });
    const data = await res.json();
    if (!res.ok) {
      toast(data.error || "资料读取失败");
      status.textContent = "读取没有完成，请检查资料后再试";
      return;
    }
    state.materials.batch = data;
    renderMaterialQueue();
    renderMaterialAnalysis(data);
    toast("资料已归档并梳理，可以核对后建档");
  } catch {
    toast("网络不通，请再试");
    status.textContent = "读取没有完成，请再试";
  } finally {
    state.materials.busy = false;
    btn.disabled = false;
    btn.textContent = "重新读取并梳理";
  }
});

document.getElementById("use-material-pitch")?.addEventListener("click", () => {
  const pitch = state.materials.batch?.analysis?.suggestedPitch;
  const input = document.getElementById("pitch");
  if (!pitch || !input) return;
  input.value = pitch;
  input.focus();
  toast("已填入一句话卖点，你可以继续修改");
});

document.getElementById("create-customer")?.addEventListener("click", async () => {
  const btn = document.getElementById("create-customer");
  if (state.materials.busy) {
    toast("资料还在读取，读完再建档");
    return;
  }
  if ((state.materials.files.length || state.materials.links.length) && !state.materials.batch) {
    toast("资料还没读取，请先点“读取并梳理资料”");
    return;
  }
  btn.disabled = true;
  const old = btn.textContent;
  btn.textContent = "正在建档…";
  try {
    const track = document.querySelector('input[name="track"]:checked')?.value || "";
    if (!track) {
      toast("先选：这是存量还是拓新");
      btn.disabled = false;
      btn.textContent = old;
      return;
    }
    const res = await fetch("/api/customers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        hunt:
          document.getElementById("hunt").value === "__new__"
            ? document.getElementById("new-hunt")?.value || ""
            : document.getElementById("hunt").value,
        name: document.getElementById("cname").value,
        city: document.getElementById("city")?.value || "",
        pitch: document.getElementById("pitch").value,
        link: state.materials.links[0] || "",
        material: document.getElementById("cmaterial")?.value || "",
        materialBatchId: state.materials.batch?.id || "",
        track,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast(data.error || "建档失败");
      btn.disabled = false;
      btn.textContent = old;
      return;
    }
    state.workspace = data;
    state.packId = "";
    state.openedId = data.usingId || "";
    toast(track === "存量" ? "客户已建好，正在出今日内容" : "客户已建好，正在出判断");
    watchJob(data.usingId);
    const sel = document.getElementById("hunt");
    if (sel && sel.value === "__new__") {
      const got = await fetch("/api/hunts");
      if (got.ok) {
        const { hunts = [] } = await got.json();
        sel.innerHTML =
          hunts.map((h) => `<option>${h}</option>`).join("") +
          `<option value="__new__">其他行业…</option>`;
      }
      document.getElementById("new-hunt-label")?.classList.add("hidden");
      document.getElementById("new-hunt")?.classList.add("hidden");
    }
    ["cmaterial", "cname", "pitch", "new-hunt"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });
    state.materials = { files: [], links: [], batch: null, busy: false };
    document.getElementById("material-analysis")?.classList.add("hidden");
    renderMaterialQueue();
    renderToday();
    renderLedger();
    renderLedgerForm();
    nav("today");
  } catch {
    toast("网络不通，请再试");
  }
  btn.disabled = false;
  btn.textContent = old;
});

document.getElementById("add-ledger")?.addEventListener("click", async () => {
  const customerId = document.getElementById("ledger-client")?.value || "";
  const customer = (state.workspace.customers || []).find((c) => c.id === customerId);
  const talk = document.getElementById("ledger-talk")?.value.trim() || "";
  if (!customer) return toast("先选一个客户");
  if (!talk) return toast("原话没填，这条记了也没用");
  const res = await fetch("/api/ledger", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client: customer.name,
      hunt: customer.hunt,
      result: document.getElementById("ledger-result")?.value || "",
      quote: document.getElementById("ledger-quote")?.value.trim() || "",
      talk,
      line: document.getElementById("ledger-line")?.value || "",
    }),
  });
  if (!res.ok) return toast("没记上，再试一次");
  const data = await res.json();
  state.workspace = data.workspace;
  const talkBox = document.getElementById("ledger-talk");
  const quoteBox = document.getElementById("ledger-quote");
  if (talkBox) talkBox.value = "";
  if (quoteBox) quoteBox.value = "";
  renderLedger();
  renderLedgerLines();
  // 刚记的这笔可能让「上次有效」冒出来，今天那一页要跟着变
  renderToday();
  toast(data.marked ? "记下了，那条已算有回音" : "记下了");
});

document.getElementById("change-pass")?.addEventListener("click", async () => {
  const res = await fetch("/api/password", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      oldPassword: document.getElementById("old-pass").value,
      newPassword: document.getElementById("new-pass").value,
    }),
  });
  const data = await res.json();
  if (res.ok) {
    document.getElementById("old-pass").value = "";
    document.getElementById("new-pass").value = "";
    toast("密码已改");
  } else {
    toast(data.error || "改密失败");
  }
});

document.body.addEventListener("click", async (e) => {
  const trackBtn = e.target.closest("[data-track]");
  if (trackBtn) {
    e.preventDefault();
    const [id, track] = String(trackBtn.dataset.track || "").split("|");
    const res = await fetch("/api/track", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, track }),
    });
    const data = await res.json();
    if (!res.ok) return toast(data.error || "没标上");
    state.workspace = data;
    renderToday();
    renderCustomers();
    toast(track === "存量" ? "已标为存量，可以出今日内容" : "已标为拓新，有资料再出判断");
    return;
  }
  const using = e.target.closest("[data-using]");
  if (using) {
    e.preventDefault();
    await useCustomer(using.dataset.using, using.dataset.pack || "");
    if (using.dataset.act === "today") {
      document.getElementById("go-today")?.click();
    } else if (using.dataset.act === "judge") {
      document.getElementById("go-repack")?.click();
    }
    return;
  }
  const del = e.target.closest("[data-white-del]");
  if (!del || del.disabled) return;
  const res = await fetch("/api/whitelist", {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: del.dataset.whiteDel }),
  });
  const data = await res.json();
  toast(res.ok ? "已移出" : data.error || "移出失败");
  if (res.ok) loadUsers();
});

document.body.addEventListener("click", async (e) => {
  const reset = e.target.closest("[data-white-reset]");
  if (reset) {
    const email = reset.dataset.whiteReset;
    // 抹掉密码不是小事，问一句。抹完他登录不了，得自己回注册页重设
    if (!confirm(`把 ${email} 的密码抹掉？他要自己回注册页重新设一个。客户和历史出档不会丢。`)) return;
    const res = await fetch("/api/users/reset", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await res.json();
    toast(res.ok ? `${email} 的密码已抹掉，让他去注册页重新设` : data.error || "重设失败");
    if (res.ok) loadUsers();
    return;
  }
  // —— 模型接口那页：一张卡一个渠道，动作都落在卡上 ——
  const fold = e.target.closest("[data-llm-fold]");
  if (fold) {
    const fid = fold.dataset.llmFold;
    state.llmFolded[fid] = !state.llmFolded[fid];
    loadLlm();
    return;
  }
  const tabBtn = e.target.closest("[data-llm-tab]");
  if (tabBtn) {
    state.llmTabs[tabBtn.dataset.llmTab] = tabBtn.dataset.cat;
    loadLlm();
    return;
  }
  const keyEdit = e.target.closest("[data-llm-key-edit]");
  if (keyEdit) {
    state.llmKeyEdit[keyEdit.dataset.llmKeyEdit] = true;
    state.llmFocus = `key:${keyEdit.dataset.llmKeyEdit}`;
    loadLlm();
    return;
  }
  const baseEdit = e.target.closest("[data-llm-base-edit]");
  if (baseEdit) {
    state.llmBaseEdit[baseEdit.dataset.llmBaseEdit] = true;
    state.llmFocus = `base:${baseEdit.dataset.llmBaseEdit}`;
    loadLlm();
    return;
  }
  const addOpen = e.target.closest("[data-llm-model-add]");
  if (addOpen) {
    state.llmAddOpen[addOpen.dataset.llmModelAdd] = true;
    state.llmFocus = `add:${addOpen.dataset.llmModelAdd}`;
    loadLlm();
    return;
  }
  // 开关在模型行里面，要先于行本身的「点选」判断
  const toggle = e.target.closest("[data-llm-toggle]");
  if (toggle) {
    const wasOn = toggle.getAttribute("aria-checked") === "true";
    const res = await fetch("/api/llm/model", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: toggle.dataset.llmToggle, model: toggle.dataset.model, action: "toggle", on: !wasOn }),
    });
    const data = await res.json();
    toast(res.ok ? (wasOn ? "已关掉" : "已打开") : data.error || "没改上");
    if (res.ok) loadLlm();
    return;
  }
  const pick = e.target.closest("[data-llm-pick]");
  if (pick) {
    const wasOn = pick.querySelector(".llm-toggle")?.getAttribute("aria-checked") === "true";
    const res = await fetch("/api/llm/model", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: pick.dataset.llmPick, model: pick.dataset.model, action: "use" }),
    });
    const data = await res.json();
    toast(res.ok ? (wasOn ? "已选为当前模型" : "已打开并选为当前模型") : data.error || "没选上");
    if (res.ok) loadLlm();
    return;
  }
  const addSave = e.target.closest("[data-llm-model-new-save]");
  if (addSave) {
    await addLlmModel(addSave.dataset.llmModelNewSave);
    return;
  }
  const sync = e.target.closest("[data-llm-sync]");
  const test = e.target.closest("[data-llm-test]");
  const visionTest = e.target.closest("[data-llm-vision-test]");
  const use = e.target.closest("[data-llm-use]");
  const del = e.target.closest("[data-llm-del]");
  if (e.target.id === "llm-add") {
    const name = document.getElementById("llm-new-name")?.value || "";
    const res = await fetch("/api/llm/add", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    toast(res.ok ? `已加上「${name}」，现在填密钥` : data.error || "加不上");
    if (res.ok) loadLlm();
    return;
  }
  const hit = sync || test || visionTest || use || del;
  const id = hit?.dataset.llmSync || hit?.dataset.llmTest
    || hit?.dataset.llmVisionTest || hit?.dataset.llmUse || hit?.dataset.llmDel;
  if (!id) return;
  if (del) {
    const res = await fetch("/api/llm/remove", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const data = await res.json();
    toast(res.ok ? "已删掉" : data.error || "删不掉");
    if (res.ok) loadLlm();
    return;
  }
  // 密钥、地址、名字都是失焦即存，这里只管按下去就跑的动作
  if (sync) {
    toast("正在同步最新模型…");
    const res = await fetch("/api/llm/sync", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const data = await res.json();
    toast(res.ok ? "模型列表已更新" : data.error || "同步失败");
    if (res.ok) loadLlm();
    return;
  }
  if (visionTest) {
    toast("正在让模型读取测试图片…");
    const res = await fetch("/api/llm/test-vision", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const data = await res.json();
    toast(res.ok && data.ok ? "图片读取正常" : data.detail || data.error || "图片测试失败");
    if (res.ok) loadLlm();
    return;
  }
  if (test) {
    toast("正在测连接…");
    const res = await fetch("/api/llm/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const data = await res.json();
    toast(data.detail || data.error || (res.ok ? "已测完" : "测试失败"));
    if (res.ok) loadLlm();
    return;
  }
  if (use) {
    const res = await fetch("/api/llm/active", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const data = await res.json();
    toast(res.ok ? "已切换当前模型渠道" : data.error || "切换失败");
    if (res.ok) loadLlm();
  }
});

async function addLlmModel(id) {
  const input = document.querySelector(`[data-llm-model-new="${CSS.escape(id)}"]`);
  const model = input?.value.trim() || "";
  if (!model) {
    toast("填一个模型名");
    input?.focus();
    return;
  }
  const res = await fetch("/api/llm/model", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id, model, action: "add" }),
  });
  const data = await res.json();
  if (!res.ok) {
    toast(data.error || "加不上");
    return;
  }
  delete state.llmAddOpen[id];
  // 切到新模型落进去的那一栏，让他看见真的加上了
  state.llmTabs[id] = modelCategory(model);
  toast(`已加上 ${model}`);
  await loadLlm();
}

async function saveLlmField(id, patch, after) {
  const res = await fetch("/api/llm", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id, ...patch }),
  });
  const data = await res.json();
  if (!res.ok) {
    toast(data.error || "没存上");
    return false;
  }
  if (after) after();
  toast("已保存");
  await loadLlm();
  return true;
}

/* 密钥、地址、名字不设保存键：敲完走到别处就算存。Esc 是唯一的反悔口。 */
document.body.addEventListener("focusout", (e) => {
  const key = e.target.closest?.("[data-llm-key]");
  if (key) {
    const v = key.value.trim();
    if (!v || key.dataset.cancel) return;
    saveLlmField(key.dataset.llmKey, { apiKey: v }, () => delete state.llmKeyEdit[key.dataset.llmKey]);
    return;
  }
  const base = e.target.closest?.("[data-llm-base]");
  if (base && !base.dataset.cancel) {
    const v = base.value.trim().replace(/\/+$/, "");
    if (v === (base.dataset.orig || "")) return;
    saveLlmField(base.dataset.llmBase, { baseUrl: v }, () => delete state.llmBaseEdit[base.dataset.llmBase]);
    return;
  }
  const name = e.target.closest?.("[data-llm-name]");
  if (name && !name.dataset.cancel) {
    const v = name.value.trim();
    if (!v || v === (name.dataset.orig || "")) return;
    saveLlmField(name.dataset.llmName, { name: v });
  }
});

document.body.addEventListener("change", (e) => {
  const vis = e.target.closest?.("[data-llm-vision]");
  if (vis) saveLlmField(vis.dataset.llmVision, { vision: vis.value });
});

document.body.addEventListener("keydown", (e) => {
  const t = e.target.closest?.("[data-llm-key],[data-llm-base],[data-llm-name],[data-llm-model-new]");
  if (!t) return;
  if (e.key === "Escape") {
    t.dataset.cancel = "1";
    if (t.dataset.llmModelNew) delete state.llmAddOpen[t.dataset.llmModelNew];
    loadLlm();
    return;
  }
  if (e.key === "Enter") {
    e.preventDefault();
    if (t.dataset.llmModelNew) addLlmModel(t.dataset.llmModelNew);
    else t.blur();
  }
});

/* 拖动排序：只在捏住左上角手柄时整卡可拖，免得名字输入框没法选字 */
let llmDragCard = null;
document.body.addEventListener("mousedown", (e) => {
  const grip = e.target.closest?.("[data-llm-grip]");
  if (!grip) return;
  const card = grip.closest(".llm-card");
  if (card) card.draggable = true;
});
document.body.addEventListener("dragstart", (e) => {
  const card = e.target.closest?.(".llm-card");
  if (!card || !card.draggable) return;
  llmDragCard = card;
  card.classList.add("is-dragging");
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/plain", card.dataset.provider || "");
});
document.body.addEventListener("dragover", (e) => {
  if (!llmDragCard) return;
  const over = e.target.closest?.(".llm-card");
  if (!over || over === llmDragCard || over.classList.contains("llm-add-card")) return;
  e.preventDefault();
  const rect = over.getBoundingClientRect();
  const after = e.clientY > rect.top + rect.height / 2;
  over.parentNode.insertBefore(llmDragCard, after ? over.nextSibling : over);
});
document.body.addEventListener("drop", (e) => {
  if (llmDragCard) e.preventDefault();
});
document.body.addEventListener("dragend", async () => {
  if (!llmDragCard) return;
  const card = llmDragCard;
  llmDragCard = null;
  card.draggable = false;
  card.classList.remove("is-dragging");
  const ids = [...document.querySelectorAll("#llm-box .llm-card[data-provider]")].map((el) => el.dataset.provider);
  const res = await fetch("/api/llm/reorder", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ids }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    toast(data.error || "顺序没存上");
  }
  loadLlm();
});

boot();
