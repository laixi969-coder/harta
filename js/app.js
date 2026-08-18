import { bindEyes } from "./eyes.js";
import { copyKey, editOf, edited, shellKey } from "./pack-edits.js";
import { rankCopyGroups, rankShells, topRepliedLabel } from "./rank-feedback.js";

const state = {
  view: "today",
  theme: document.documentElement.getAttribute("data-theme") || "light",
  workspace: { customers: [], ledger: [], feedback: {}, usingId: "" },
  platformFields: {},
  packId: "",
};

function toast(t) {
  const el = document.getElementById("toast");
  el.textContent = t;
  el.classList.remove("hidden");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add("hidden"), 3200);
}

function applyTheme() {
  document.documentElement.setAttribute("data-theme", state.theme);
  localStorage.setItem("falcon-theme", state.theme);
  document.querySelectorAll("[data-theme-toggle]").forEach((b) => {
    b.setAttribute("aria-pressed", state.theme === "dark" ? "true" : "false");
  });
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
  return list.find((c) => c.id === state.workspace.usingId) || list[0] || null;
}

function packsOf(customer) {
  return customer?.packs || [];
}

function currentPack() {
  const packs = packsOf(usingCustomer());
  return packs.find((p) => p.id === state.packId) || packs[0] || null;
}

function copyCount(pack) {
  return Object.values(pack?.copies || {}).flat().length;
}

function renderToday() {
  const mine = usingCustomer();
  const chase = (state.workspace.customers || []).filter((c) => !mine || c.id !== mine.id);
  const empty = document.getElementById("empty-today");
  const owned = document.getElementById("owned-today");
  if (!mine) {
    empty.classList.remove("hidden");
    owned.classList.add("hidden");
    document.getElementById("chase").innerHTML = `<p class="meta">还没有可追的客户。</p>`;
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
  document.getElementById("hook-line").textContent = pack
    ? `${mine.name} · ${pack.deliveredAt || pack.createdAt} 已出${pack.tier}：${headCount ? `${headCount} · ` : ""}${nCopy} 条文案 · 主战场${fields}。下面还有 ${chase.length} 个可追。`
    : mine.job
      ? `${mine.name} 正在${mine.job.kind}，一般一两分钟。出好了这一页自己会刷新，不用守着。`
      : mine.lastFail
      ? `${mine.name} 这次没出成：${mine.lastFail}。点「重出这份档」再来一次。`
      : `${mine.name} 还没有出过档。下面还有 ${chase.length} 个可追。`;
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
        <span class="when">${p.deliveredAt || p.createdAt}</span>
        <span class="what">${p.title || p.tier}</span>
        <span class="meta">${p.tier} · ${copyCount(p)} 条</span>
      </button>`,
      )
      .join("");
  }

  const rankedCopies = pack ? rankCopyGroups(pack.copies, state.workspace.feedback, pack.id) : [];
  const win = document.getElementById("win");
  const winLine = topRepliedLabel(rankedCopies);
  if (winLine) {
    win.classList.remove("hidden");
    win.innerHTML = `<b>上次有效</b> · ${winLine}`;
  } else {
    win.classList.add("hidden");
    win.textContent = "";
  }

  /* 重出按钮必须画在「没有档」这条早返回之前：没出成的时候正是最需要它的时候。 */
  const busy = Boolean(mine.job);
  const repack = document.getElementById("go-repack");
  if (repack) {
    repack.classList.toggle("hidden", !mine.id);
    repack.dataset.customer = mine.id || "";
    repack.disabled = busy;
    repack.textContent = busy ? `正在${mine.job.kind}…` : pack ? "重出这份档" : "重出";
  }

  const noPack = document.getElementById("no-pack");
  const body = document.getElementById("pack-body");
  if (!pack) {
    noPack.classList.remove("hidden");
    body.classList.add("hidden");
    renderChase(chase);
    renderCustomers();
    renderPackIndex();
    return;
  }
  noPack.classList.add("hidden");
  body.classList.remove("hidden");

  document.getElementById("using-name").textContent = mine.name;
  document.getElementById("using-hunt").textContent = mine.hunt;
  document.getElementById("using-tier").textContent =
    pack.evidence === "D" ? `${pack.tier} · 赛道判断` : `${pack.tier} · 证据${pack.evidence}`;
  document.getElementById("using-meta").textContent =
    `${mine.pitch} · ${mine.city || ""} · ${pack.evidenceNote || ""}`;
  document.getElementById("pack-title").textContent = `当时标题：${pack.title}`;

  const demandBox = document.getElementById("demand");
  const demandCard = document.getElementById("demand-card");
  const demand = pack.demand;
  if (demandBox && demandCard) {
    if (demand && demand.who) {
      demandCard.classList.remove("hidden");
      const lines = (items) =>
        (items || []).map((t) => `<p>${t}</p>`).join("");
      demandBox.innerHTML = `
        <div class="folio">
          <div class="folio-cell is-who">
            <p class="k">截谁</p>
            <p>${demand.who}</p>
          </div>
          <div class="folio-cell is-skip">
            <p class="k">别打谁</p>
            ${lines(demand.skip)}
          </div>
          <div class="folio-cell">
            <p class="k">他会这么说</p>
            ${lines(demand.say)}
          </div>
          <div class="folio-cell">
            <p class="k">他在搜</p>
            ${lines(demand.search)}
          </div>
        </div>`;
    } else {
      demandCard.classList.add("hidden");
      demandBox.innerHTML = "";
    }
  }

  const open = document.getElementById("pack-open");
  if (pack.sharePath) {
    open.classList.remove("hidden");
    open.setAttribute("href", pack.sharePath);
  } else {
    open.classList.add("hidden");
  }

  const landscapeCard = document.getElementById("landscape-card");
  if (landscapeCard) {
    const has = Boolean(pack.landscape);
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
          <h3>${q.ask}</h3>
          ${q.why ? `<p class="meta">为什么问：${q.why}</p>` : ""}
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
        (b) => `<article class="sleeve sleeve-across">
        <div class="sleeve-tab"><span>${b.title}</span><span>${b.platform || ""}</span></div>
        <div class="sleeve-body">
          ${b.hook ? `<p class="meta">前 3 秒：${b.hook}</p>` : ""}
          ${(b.shots || [])
            .map(
              (sh) => `<p><b>${sh.at || ""}</b> ${sh.visual}${sh.line ? `　口播：${sh.line}` : ""}</p>`,
            )
            .join("")}
          ${b.close ? `<p class="meta">收口：${b.close}</p>` : ""}
        </div>
      </article>`,
      )
      .join("")}</div>`;
  }

  const full = document.getElementById("go-full");
  if (full) {
    // 没反应的客户不跑全档，所以这个按钮只在已经有档、还没补分镜时出现
    full.classList.toggle("hidden", !pack.id || boards.length > 0);
    full.dataset.pack = pack.id || "";
  }

  const refill = document.getElementById("go-refill");
  if (refill) {
    // 补货是给已经在用素材的客户的。手动点：没在发的时候补等于对着空气烧钱
    refill.classList.toggle("hidden", !pack.id);
    refill.dataset.customer = mine.id || "";
    refill.disabled = busy;
    refill.textContent = winLine ? "顺着有回音的方向补一批" : "补一批新素材";
  }

  const checksCard = document.getElementById("checks-card");
  if (checksCard) {
    const c = pack.checks || {};
    const rows = [
      ...(c.redline || []).map(
        (r) => `<div class="line"><p><b>红线</b> ${r.words.join("、")} · ${r.where}</p>
          <p class="meta">${r.text}</p></div>`,
      ),
      ...(c.watch || []).map(
        (r) => `<div class="line"><p><b>看一眼</b> ${r.words.join("、")} · ${r.where}</p>
          <p class="meta">这个词要看语境。是在教客户怎么问就没事，是在打包票就得改</p>
          <p class="meta">${r.text}</p></div>`,
      ),
      ...(c.hints || []).map(
        (r) => `<div class="line"><p><b>带了镜头提示</b> ${r.where}</p>
          <p class="meta">这条里的「${r.hint}」会跟着一起发出去。镜头怎么拍写在分镜里，这一栏只放要发的那句话</p>
          <p class="meta">${r.text}</p></div>`,
      ),
      ...(c.length || []).map(
        (r) => `<div class="line"><p><b>${r.level === "hard" ? "发不出去" : "会有代价"}</b> ${r.platform} · ${r.field} 约 ${r.max} 字，这条 ${r.n} 字</p>
          <p class="meta">${r.why || ""}</p>
          <p class="meta">${r.text}</p></div>`,
      ),
    ];
    checksCard.classList.toggle("hidden", !rows.length);
    document.getElementById("checks").innerHTML = rows.length
      ? rows.join("") + `<p class="meta" style="margin-top:12px">${c.note || ""}</p>`
      : "";
  }

  document.getElementById("gaps").innerHTML = `<div class="sleeves">${(pack.gaps || [])
    .map(
      (g, i) => `<article class="sleeve">
        <div class="sleeve-tab">缺口${["一", "二", "三"][i] || i + 1}</div>
        <div class="sleeve-body">
          <h3>${g.name}</h3>
          <p class="meta">证据 ${pack.evidence}</p>
          <div class="sleeve-fields">
            <div><p class="field-k">现状</p><p>${g.fact}</p></div>
            <div><p class="field-k">代价</p><p>${g.cost}</p></div>
            <div class="full"><p class="field-k">为什么改不动</p><p>${g.cause}</p></div>
          </div>
          <p class="meta">你自己可以：${g.verify}</p>
        </div>
      </article>`,
    )
    .join("")}</div>`;

  document.getElementById("copies").innerHTML = `<div class="sleeves">${rankedCopies
    .map((g) => {
      const items = g.rows
        .map((row) => {
          // 显示、复制、发出去的都是改后那版。原句只在底下小字里留个底
          const k = copyKey(g.group, row.i);
          const text = edited(pack, k, row.text);
          const was = editOf(pack, k)?.was;
          return `<div class="line slip" data-line="${encodeURIComponent(k)}">
            <p class="line-text">${text}</p>
            ${was ? `<p class="meta">改过 · 原句是「${was}」</p>` : ""}
            <div class="slip-bar">
              <div class="slip-step">
                <button type="button" class="do" data-copy="${encodeURIComponent(text)}">复制这条</button>
                <button type="button" class="textish" data-edit="${encodeURIComponent(k)}">改</button>
              </div>
              <div class="slip-step">
                <span class="slip-k">用过之后</span>
                <button type="button" class="verdict ${row.fb === "replied" ? "on-yes" : ""}" data-fb="${row.key}" data-val="replied" aria-pressed="${row.fb === "replied" ? "true" : "false"}">${row.fb === "replied" ? "已记有回音" : "有回音"}</button>
                <button type="button" class="verdict ${row.fb === "dead" ? "on-no" : ""}" data-fb="${row.key}" data-val="dead" aria-pressed="${row.fb === "dead" ? "true" : "false"}">${row.fb === "dead" ? "已记没反应" : "没反应"}</button>
              </div>
            </div>
          </div>`;
        })
        .join("");
      return `<article class="sleeve sleeve-across${g.replied ? " is-hot" : ""}">
        <div class="sleeve-tab"><span>${g.group}</span><span>${g.replied ? `${g.replied} 条有回音` : "还没记回音"}</span></div>
        <div class="sleeve-body">${items}</div>
      </article>`;
    })
    .join("")}</div>`;

  document.getElementById("breaks").innerHTML = `<div class="notes">${(pack.breakdowns || [])
    .map((b) => `<article class="note"><h3>${b.copy}</h3><p>${b.why}</p></article>`)
    .join("")}</div>`;

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
              <div>${present.length > 1 ? `<p class="field-k">${f.label}</p>` : ""}<p class="line-text${f.key === "body" ? " asis" : ""}">${text}</p>
              ${was ? `<p class="meta">改过 · 原句是「${was}」</p>` : ""}</div>
              <div class="acts-inline">
                <button type="button" class="do" data-copy="${encodeURIComponent(text)}">复制</button>
                <button type="button" class="textish" data-edit="${encodeURIComponent(k)}">改</button>
              </div>
            </div>`;
          })
          .join("");
        return `<div class="line slip">${rows}</div>`;
      })
      .join("");
    return `<section class="plat ${kind}"><h3>${s.name}<span>${kind === "is-main" ? "主战场" : "换外壳"}</span></h3>${items}</section>`;
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

  document.getElementById("delivery").innerHTML = `
    <div class="folio folio-3">
      <div class="folio-cell is-who">
        <p class="k">主战场</p>
        <p>${(pack.battlefields || []).join("、")}</p>
      </div>
      <div class="folio-cell">
        <p class="k">测试路径</p>
        <p>${pack.testPath || ""}</p>
      </div>
      <div class="folio-cell">
        <p class="k">补给节奏</p>
        <p>${pack.supply || ""}</p>
      </div>
    </div>
    <p style="margin-top:14px">${pack.honest || ""}</p>
    <p class="meta">下一步：${(pack.next || []).join("；")}</p>
    <p class="meta">出价和定向让代运营定，我们负责让他们有好素材可投。</p>`;

  renderChase(chase);
  renderCustomers();
  renderPackIndex();
}

function renderChase(chase) {
  document.getElementById("chase").innerHTML = chase.length
    ? chase
        .map(
          (c) => `<div class="row">
      <div><strong>${c.name}</strong><div class="meta">${c.hunt} · 已出 ${packsOf(c).length} 份 · ${c.pitch || "未写卖点"}</div></div>
      <button type="button" class="go" data-using="${c.id}">先用这位</button>
    </div>`,
        )
        .join("")
    : `<p class="meta">还没有其他可追的客户。</p>`;
}

function renderCustomers() {
  const box = document.getElementById("customer-list");
  if (!box) return;
  const list = [...(state.workspace.customers || [])].sort((a, b) => {
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
          return `<div class="row">
        <div>
          <strong>${c.name}</strong>
          <div class="meta">${c.hunt}${using ? " · 先用" : ""} · ${packs.length ? `已出 ${packs.length} 份` : "还没出档"}${latest ? ` · ${latest.deliveredAt || latest.createdAt}` : ""}</div>
        </div>
        ${using ? "" : `<button type="button" class="go" data-using="${c.id}">${packs.length ? "看当时给的" : "先用这位"}</button>`}
      </div>`;
        })
        .join("")
    : `<p class="meta">本子还是空的。</p>`;
}

function renderPackIndex() {
  const box = document.getElementById("pack-list");
  if (!box) return;
  const rows = (state.workspace.customers || []).flatMap((c) =>
    packsOf(c).map((p) => ({ customer: c, pack: p })),
  );
  box.innerHTML = rows.length
    ? rows
        .map(
          ({ customer, pack }) => `<div class="row">
      <div>
        <strong>${customer.name}</strong>
        <div class="meta">${pack.deliveredAt || pack.createdAt} · ${pack.tier} · ${pack.title || ""}</div>
      </div>
      <button type="button" class="go" data-using="${customer.id}" data-pack="${pack.id}">打开这份</button>
    </div>`,
        )
        .join("")
    : `<p class="meta">还没有发给甲方的包裹。</p>`;
}

function renderLedger() {
  const rows = state.workspace.ledger || [];
  document.getElementById("ledger-body").innerHTML = rows.length
    ? rows.map(
    (r) => `<tr>
      <td>${r.date}</td><td>${r.client}</td><td>${r.hunt}</td>
      <td>${r.result}</td><td class="num">${r.quote}</td><td>${r.talk}</td>
    </tr>`,
    ).join("")
    : `<tr><td colspan="6">还没有你自己的台账。</td></tr>`;
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
      const save = async () => {
        const text = ta.value.trim();
        const res = await fetch("/api/edit", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ packId: currentPack()?.id, key, text }),
        });
        const data = await res.json();
        if (!res.ok) return toast(data.error || "没存上");
        state.workspace = data;
        toast("改好了，复制和甲方页拿的都是这一版");
        renderToday();
      };
      ta.addEventListener("blur", save, { once: true });
      ta.addEventListener("keydown", (ev) => {
        if (ev.key === "Escape") { ta.removeEventListener("blur", save); renderToday(); }
        if (ev.key === "Enter" && (ev.metaKey || ev.ctrlKey)) ta.blur();
      });
      return;
    }
    const copy = e.target.closest("[data-copy]");
    if (copy) {
      navigator.clipboard.writeText(decodeURIComponent(copy.dataset.copy));
      toast("已复制");
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
  nav("today");
}

function providerCard(id, p, active) {
  const opts = (p.models || [])
    .map((m) => `<option value="${m}" ${m === p.model ? "selected" : ""}>${m}</option>`)
    .join("");
  const modelField = p.models?.length
    ? `<select data-llm-model="${id}">${opts}</select>`
    : `<input data-llm-model="${id}" value="${p.model || ""}" placeholder="先同步模型，或手填">`;
  return `<article class="card form" data-provider="${id}">
    <h2>${p.name} ${active === id ? '<span class="tag">当前使用</span>' : ""}</h2>
    <p class="meta">${p.hasKey ? p.apiKeyMasked : "还没填密钥"} · ${p.lastTestDetail || "还没测过"}</p>
    ${
      p.builtin
        ? ""
        : `<label for="llm-name-${id}">名字</label>
    <input id="llm-name-${id}" data-llm-name="${id}" value="${p.name || ""}" placeholder="好认就行，比如 火山方舟">`
    }
    <label for="llm-key-${id}">密钥</label>
    <input id="llm-key-${id}" data-llm-key="${id}" type="password" autocomplete="off" placeholder="${p.hasKey ? "留空则不改" : ""}">
    <label for="llm-base-${id}">接口地址</label>
    <input id="llm-base-${id}" data-llm-base="${id}" value="${p.baseUrl || ""}">
    <label for="llm-model-${id}">模型</label>
    ${modelField.replace("<select ", `<select id="llm-model-${id}" `).replace("<input ", `<input id="llm-model-${id}" `)}
    <div class="acts">
      <button class="btn" data-llm-save="${id}" type="button">保存</button>
      <button class="btn gold" data-llm-use="${id}" type="button">用作当前</button>
    </div>
    <div class="acts-inline">
      <button class="textish" data-llm-sync="${id}" type="button">同步最新模型</button>
      <button class="textish" data-llm-test="${id}" type="button">连接测试</button>
      ${p.builtin ? "" : `<button class="textish" data-llm-del="${id}" type="button">删掉这个接口</button>`}
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
  box.innerHTML =
    Object.entries(data.providers)
      .map(([id, p]) => providerCard(id, p, data.active))
      .join("") +
    `<article class="card form">
      <h2>再加一个接口</h2>
      <p class="meta">任何 OpenAI 兼容的地址都行。加好之后跟上面几个一样填密钥、同步模型。</p>
      <label for="llm-new-name">名字</label>
      <input id="llm-new-name" placeholder="好认就行，比如 火山方舟">
      <div class="acts"><button class="btn" id="llm-add" type="button">加上</button></div>
    </article>`;
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
        return `<div class="row">
        <div>
          <strong>${email}</strong>
          <div class="meta">${state}</div>
        </div>
        ${locked ? "" : `<button type="button" class="go" data-white-del="${email}">移出</button>`}
      </div>`;
      })
      .join("");
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
  bind();
  nav("today");
  if (user.isAdmin) {
    loadLlm();
    loadUsers();
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
  if (!packId) return;
  btn.disabled = true;
  const old = btn.textContent;
  btn.textContent = "正在出分镜…";
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
    state.workspace = data;
    toast("分镜已补上，这份升成全档");
    renderToday();
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

document.getElementById("create-customer")?.addEventListener("click", async () => {
  const btn = document.getElementById("create-customer");
  btn.disabled = true;
  const old = btn.textContent;
  btn.textContent = "正在建档…";
  try {
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
        link: document.getElementById("link")?.value || "",
        material: document.getElementById("cmaterial")?.value || "",
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
    toast("客户已建好，正在出档。出好了这里会自己刷新，你可以先去忙别的");
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
    ["link", "cmaterial", "cname", "pitch", "new-hunt"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });
    renderToday();
    renderLedger();
    nav("today");
  } catch {
    toast("网络不通，请再试");
  }
  btn.disabled = false;
  btn.textContent = old;
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
  toast(res.ok ? "密码已改" : data.error || "改密失败");
});

document.body.addEventListener("click", async (e) => {
  const using = e.target.closest("[data-using]");
  if (using) {
    e.preventDefault();
    await useCustomer(using.dataset.using, using.dataset.pack || "");
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
  const save = e.target.closest("[data-llm-save]");
  const sync = e.target.closest("[data-llm-sync]");
  const test = e.target.closest("[data-llm-test]");
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
  const hit = save || sync || test || use || del;
  const id = hit?.dataset.llmSave || hit?.dataset.llmSync || hit?.dataset.llmTest
    || hit?.dataset.llmUse || hit?.dataset.llmDel;
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
  const key = document.querySelector(`[data-llm-key="${id}"]`)?.value;
  const baseUrl = document.querySelector(`[data-llm-base="${id}"]`)?.value;
  const model = document.querySelector(`[data-llm-model="${id}"]`)?.value;
  const name = document.querySelector(`[data-llm-name="${id}"]`)?.value;
  if (save) {
    const res = await fetch("/api/llm", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, apiKey: key, baseUrl, model, name }),
    });
    const data = await res.json();
    toast(res.ok ? "已保存" : data.error || "保存失败");
    if (res.ok) loadLlm();
    return;
  }
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

boot();
