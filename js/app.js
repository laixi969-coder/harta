import { bindEyes } from "./eyes.js";

const state = {
  view: "today",
  theme: localStorage.getItem("falcon-theme") || "light",
  workspace: { customers: [], ledger: [], feedback: {}, usingId: "" },
};

function toast(t) {
  const el = document.getElementById("toast");
  el.textContent = t;
  el.classList.remove("hidden");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add("hidden"), 2400);
}

function applyTheme() {
  document.documentElement.setAttribute("data-theme", state.theme);
  localStorage.setItem("falcon-theme", state.theme);
}

function nav(view) {
  state.view = view;
  document.querySelectorAll("[data-nav]").forEach((a) => {
    a.classList.toggle("on", a.dataset.nav === view);
  });
  document.querySelectorAll("[data-view]").forEach((p) => {
    p.classList.toggle("hidden", p.dataset.view !== view);
  });
}

function usingCustomer() {
  const list = state.workspace.customers || [];
  return list.find((c) => c.id === state.workspace.usingId) || list[0] || null;
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
  document.getElementById("hook-line").textContent =
    `先给${mine.name}出一份${PITCH.tier}：3 个缺口 · 15 条文案 · 主战场${PITCH.battlefields.join("、")}。下面还有 ${chase.length} 个可追。`;
  document.getElementById("hook-gate").textContent = PITCH.gate;
  document.getElementById("using-name").textContent = mine.name;
  document.getElementById("using-hunt").textContent = mine.hunt;
  document.getElementById("using-tier").textContent = `${PITCH.tier} · 证据${PITCH.evidence}`;
  document.getElementById("using-meta").textContent =
    `${mine.pitch} · ${mine.city || ""} · ${PITCH.evidenceNote}`;

  document.getElementById("gaps").innerHTML = PITCH.gaps
    .map(
      (g, i) => `<div class="gap" style="margin-top:12px">
        <p class="meta">缺口${["一", "二", "三"][i]} · 证据 ${PITCH.evidence}</p>
        <h3>${g.name}</h3>
        <p><b>现状</b> ${g.fact}</p>
        <p><b>代价</b> ${g.cost}</p>
        <p><b>为什么改不动</b> ${g.cause}</p>
        <p class="meta">你自己可以：${g.verify}</p>
      </div>`,
    )
    .join("");

  document.getElementById("copies").innerHTML = Object.entries(PITCH.copies)
    .map(([group, lines]) => {
      const items = lines
        .map((text, i) => {
          const key = `${group}-${i}`;
          const fb = (state.workspace.feedback || {})[key];
          return `<div class="line">
            <p>${text}</p>
            <div class="acts">
              <button class="btn tiny ghost" data-copy="${encodeURIComponent(text)}">复制</button>
              <button class="btn tiny ${fb === "replied" ? "on-yes" : "ghost"}" data-fb="${key}" data-val="replied">有回音</button>
              <button class="btn tiny ${fb === "dead" ? "on-no" : "ghost"}" data-fb="${key}" data-val="dead">没反应</button>
            </div>
          </div>`;
        })
        .join("");
      return `<section class="plat" style="margin-top:10px"><h3>${group}<span>${lines.length} 条</span></h3>${items}</section>`;
    })
    .join("");

  document.getElementById("breaks").innerHTML = PITCH.breakdowns
    .map(
      (b) => `<div class="gap" style="margin-top:12px">
        <h3>${b.copy}</h3>
        <p>${b.why}</p>
      </div>`,
    )
    .join("");

  document.getElementById("plats").innerHTML = Object.entries(PITCH.shells)
    .map(([name, lines]) => {
      const main = PITCH.battlefields.includes(name);
      const items = lines
        .map(
          (text) => `<div class="line"><p>${text}</p>
          <div class="acts"><button class="btn tiny ghost" data-copy="${encodeURIComponent(text)}">复制</button></div></div>`,
        )
        .join("");
      return `<section class="plat"><h3>${name}<span>${main ? "主战场" : "换外壳"}</span></h3>${items}</section>`;
    })
    .join("");

  document.getElementById("delivery").innerHTML = `
    <p><b>主战场</b> ${PITCH.battlefields.join("、")}。出价和定向让代运营定，我们负责让他们有好素材可投。</p>
    <p><b>测试路径</b> ${PITCH.testPath}</p>
    <p><b>补给节奏</b> ${PITCH.supply}</p>
    <p>${PITCH.honest}</p>
    <p class="meta">下一步：${PITCH.next.join("；")}</p>`;

  document.getElementById("chase").innerHTML = chase.length
    ? chase
        .map(
          (c) => `<div class="row">
      <div><strong>${c.name}</strong><div class="meta">${c.hunt}</div></div>
      <div><span class="tag">${c.pitch}</span></div>
      <button class="btn tiny ghost" data-open="customers">去追</button>
    </div>`,
        )
        .join("")
    : `<p class="meta">还没有其他可追的客户。</p>`;
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
        toast(fb.dataset.val === "replied" ? "记下有回音" : "记下没反应");
      });
      return;
    }
    const open = e.target.closest("[data-open]");
    if (open) nav(open.dataset.open);
  });
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
    <p class="meta">密钥 ${p.hasKey ? p.apiKeyMasked : "还没填"} · ${p.lastTestDetail || "还没测过"}</p>
    <label>API Key</label>
    <input data-llm-key="${id}" type="password" autocomplete="off" placeholder="${p.hasKey ? "已保存，留空则不改" : "只有超级管理员能看"}">
    <label>接口地址</label>
    <input data-llm-base="${id}" value="${p.baseUrl || ""}">
    <label>模型</label>
    ${modelField}
    <div class="acts">
      <button class="btn" data-llm-save="${id}" type="button">保存</button>
      <button class="btn ghost" data-llm-sync="${id}" type="button">同步最新模型</button>
      <button class="btn ghost" data-llm-test="${id}" type="button">连接测试</button>
      <button class="btn gold" data-llm-use="${id}" type="button">用作当前</button>
    </div>
  </article>`;
}

async function loadLlm() {
  const box = document.getElementById("llm-box");
  if (!box) return;
  const res = await fetch("/api/llm");
  if (res.status === 403 || res.status === 401) {
    box.innerHTML = `<article class="card"><p>只有超级管理员能看模型密钥。</p></article>`;
    return;
  }
  const data = await res.json();
  box.innerHTML = Object.entries(data.providers)
    .map(([id, p]) => providerCard(id, p, data.active))
    .join("");
}

async function loadUsers() {
  const line = document.getElementById("users-line");
  const list = document.getElementById("white-list");
  const res = await fetch("/api/users");
  if (!res.ok) return;
  const data = await res.json();
  if (line) {
    line.textContent =
      "已注册：" + data.users.map((u) => `${u.email}（${u.role === "admin" ? "超管" : "销售"}）`).join("、");
  }
  if (list) {
    list.innerHTML = (data.whitelist || [])
      .map(
        (email) => `<div class="row">
        <div><strong>${email}</strong></div>
        <div class="meta">${email === "66445039@qq.com" ? "不可移除" : ""}</div>
        <button class="btn tiny ghost" data-white-del="${email}" ${email === "66445039@qq.com" ? "disabled" : ""}>移出</button>
      </div>`,
      )
      .join("");
  }
}

async function boot() {
  applyTheme();
  const me = await fetch("/api/me");
  if (me.status === 401) {
    location.href = "/login.html";
    return;
  }
  const user = await me.json();
  const who = document.getElementById("who");
  who.textContent = `${user.isAdmin ? "超级管理员" : "销售"} · ${user.email}`;
  const settingsNav = document.getElementById("nav-settings");
  if (user.isAdmin) settingsNav.classList.remove("hidden");
  document.getElementById("rail-foot").textContent = user.isAdmin
    ? "超管可换模型、管白名单"
    : "只看见自己的客户，看不到密钥";
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
  toast(res.ok ? "已加入白名单" : data.error || "加入失败");
  if (res.ok) loadUsers();
});

document.getElementById("create-customer")?.addEventListener("click", async () => {
  const res = await fetch("/api/customers", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      hunt: document.getElementById("hunt").value,
      name: document.getElementById("cname").value,
      pitch: document.getElementById("pitch").value,
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    toast(data.error || "建档失败");
    return;
  }
  state.workspace = data;
  toast("已进你自己的本子");
  renderToday();
  renderLedger();
  nav("today");
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
  const del = e.target.closest("[data-white-del]");
  if (!del || del.disabled) return;
  const res = await fetch("/api/whitelist", {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: del.dataset.whiteDel }),
  });
  const data = await res.json();
  toast(res.ok ? "已移出白名单" : data.error || "移出失败");
  if (res.ok) loadUsers();
});

document.body.addEventListener("click", async (e) => {
  const save = e.target.closest("[data-llm-save]");
  const sync = e.target.closest("[data-llm-sync]");
  const test = e.target.closest("[data-llm-test]");
  const use = e.target.closest("[data-llm-use]");
  const id = (save || sync || test || use)?.dataset.llmSave
    || (save || sync || test || use)?.dataset.llmSync
    || (save || sync || test || use)?.dataset.llmTest
    || (save || sync || test || use)?.dataset.llmUse;
  if (!id) return;
  const key = document.querySelector(`[data-llm-key="${id}"]`)?.value;
  const baseUrl = document.querySelector(`[data-llm-base="${id}"]`)?.value;
  const model = document.querySelector(`[data-llm-model="${id}"]`)?.value;
  if (save) {
    const res = await fetch("/api/llm", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, apiKey: key, baseUrl, model }),
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
