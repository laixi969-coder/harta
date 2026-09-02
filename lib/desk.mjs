import { today } from "./today.mjs";

export const TRACKS = ["拓新", "存量"];

export function isTrack(value) {
  return TRACKS.includes(String(value || ""));
}

export function hasMaterials(customer) {
  if (!customer) return false;
  if ((customer.materials || []).length) return true;
  if (customer.materialBatchId) return true;
  if (customer.materialAnalysis) return true;
  if (String(customer.link || "").trim()) return true;
  return false;
}

export function artifactsOf(customer) {
  return [...(customer?.drops || []), ...(customer?.packs || [])];
}

export function hasJudgment(customer) {
  return (customer?.packs || []).some((p) => {
    const tier = String(p?.tier || "");
    return tier && tier !== "今日" && tier !== "补给档";
  });
}

export function dropOnDate(customer, date) {
  const day = date || today();
  return (customer?.drops || []).find(
    (d) => [d.date, d.deliveredAt, d.createdAt].some((value) => String(value || "").slice(0, 10) === day),
  );
}

function dayDiff(from, to) {
  const a = Date.parse(`${from}T00:00:00`);
  const b = Date.parse(`${to}T00:00:00`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86400000));
}

export function pickOpened(customers, openedId, namedId) {
  const list = customers || [];
  return (
    list.find((c) => c.id === openedId) ||
    list.find((c) => c.id === namedId) ||
    list.find((c) => c.track) ||
    list[0] ||
    null
  );
}

export function daysMissed(customer, date) {
  const day = date || today();
  if (dropOnDate(customer, day)) return 0;
  const last = String(customer?.lastDropAt || "").slice(0, 10);
  if (!last) return 99;
  return dayDiff(last, day);
}

function deskRow(customer, extra = {}) {
  return {
    id: customer?.id || "",
    name: customer?.name || "",
    hunt: customer?.hunt || "",
    track: customer?.track || "",
    busy: Boolean(customer?.job),
    ...extra,
  };
}

function dueReason(customer, date) {
  if (customer?.job) return `正在${customer.job.kind}`;
  if (customer?.lastFail) return customer.lastFail;
  const missed = daysMissed(customer, date);
  if (missed >= 99) return "还没出过今日内容";
  if (missed >= 2) return `已连 ${missed} 天没出`;
  return "今天还没出";
}

function judgeReason(customer) {
  if (customer?.job) return `正在${customer.job.kind}`;
  if (customer?.lastFail) return customer.lastFail;
  if (!hasMaterials(customer)) return "资料还没齐";
  if (!hasJudgment(customer)) return "资料齐了，该出判断";
  return "已有判断";
}

export function buildDesk(space, date) {
  const day = date || today();
  const customers = space?.customers || [];
  const unmarked = [];
  const send = [];
  const judge = [];
  const done = [];

  for (const c of customers) {
    if (!isTrack(c.track)) {
      unmarked.push(deskRow(c));
      continue;
    }
    if (c.track === "存量") {
      const todayDrop = dropOnDate(c, day);
      const row = deskRow(c, { reason: dueReason(c, day), daysMissed: daysMissed(c, day), hasToday: Boolean(todayDrop) });
      if (todayDrop && !c.job && !c.lastFail) done.push(row);
      else send.push(row);
    } else {
      const waiting = !hasJudgment(c) || Boolean(c.lastFail) || Boolean(c.job);
      const row = deskRow(c, { reason: judgeReason(c), ready: hasMaterials(c) && !hasJudgment(c) });
      if (waiting) judge.push(row);
      else done.push({ ...row, reason: "判断已出" });
    }
  }

  send.sort((a, b) => b.daysMissed - a.daysMissed || String(a.name).localeCompare(String(b.name), "zh"));
  judge.sort((a, b) => Number(b.ready) - Number(a.ready) || String(a.name).localeCompare(String(b.name), "zh"));

  const named =
    send[0] ||
    judge.find((c) => c.ready) ||
    judge[0] ||
    null;

  return {
    date: day,
    unmarked,
    send,
    judge,
    done,
    namedId: named?.id || "",
    hook: hookLine({ send, judge, named, unmarked, customers }),
  };
}

function hookLine({ send, judge, named, unmarked, customers }) {
  if (!customers.length) {
    return {
      line: "先建一个客户，建的时候说清是拓新还是存量",
      facts: [],
    };
  }
  if (unmarked.length && !send.length && !judge.length) {
    return {
      line: `${unmarked.length} 家还没说是拓新还是存量，打开客户页选一次才能出活`,
      facts: unmarked.map((c) => c.name),
    };
  }

  const facts = [];
  const parts = [];
  const ready = judge.filter((c) => c.ready);
  if (send.length) parts.push(`存量今天还差 ${send.length} 家没出内容`);
  if (ready.length) parts.push(`拓新 ${ready.length} 家资料齐了该出判断`);
  else if (judge.length) parts.push(`拓新 ${judge.length} 家还缺材料或正在出判断`);
  if (!parts.length) {
    parts.push("今日活干完了");
    facts.push("去翻回音，或再建一个客户");
  }
  if (named) {
    const extra =
      named.track === "存量" && named.daysMissed >= 2 && named.daysMissed < 99
        ? `（${named.reason}）`
        : "";
    parts.push(`先做${named.name}${extra}`);
  }
  return { line: parts.join(" · "), facts };
}
