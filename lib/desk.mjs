import { dueContent } from "../js/acquisition.js";
import { today } from "./today.mjs";

export const TRACKS = ["拓新", "存量"];

export function isTrack(value) {
  return TRACKS.includes(String(value || ""));
}

export function hasMaterials(customer) {
  if (!customer) return false;
  return customer.materialReady === true || String(customer.salesMaterial || "").trim().length >= 60;
}

export function artifactsOf(customer) {
  return [...(customer?.drops || []), ...(customer?.packs || [])];
}

export function hasJudgment(customer) {
  return (customer?.packs || []).some((p) => {
    const tier = String(p?.tier || "");
    return ["判断", "判断报告", "快档", "全档"].includes(tier) && p.origin?.engine !== "template";
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
    job: customer?.job
      ? {
          kind: customer.job.kind || "生成内容",
          progress: Number(customer.job.progress) || 5,
          stage: customer.job.stage || "已排队，准备开始",
          startedAt: Number(customer.job.startedAt) || Date.now(),
        }
      : null,
    ...extra,
  };
}

function dueReason(customer, date, scheduledToday = 0, overdue = 0) {
  if (customer?.job) return `正在${customer.job.kind}`;
  if (customer?.lastFail) return customer.lastFail;
  if (overdue) return `${overdue} 条已过计划日期，仍待发布${scheduledToday ? `；今天另有 ${scheduledToday} 条` : ""}`;
  if (scheduledToday) return `今天安排了 ${scheduledToday} 条待发布`;
  const missed = daysMissed(customer, date);
  if (missed >= 99) return "还没出过今日内容";
  if (missed >= 2) return `已连 ${missed} 天没出`;
  return "今天还没出";
}

function judgeReason(customer) {
  if (customer?.job) return `正在${customer.job.kind}`;
  if (customer?.lastFail) return customer.lastFail;
  if (!hasMaterials(customer)) return customer.link ? "网页待读取，读到正文后才能判断" : "补充客户资料后再生成判断";
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
      const due = dueContent(c, space?.contentStates, day);
      const scheduledToday = due.filter((item) => item.plannedAt === day).length;
      const overdue = due.length - scheduledToday;
      const row = deskRow(c, {
        reason: dueReason(c, day, scheduledToday, overdue),
        daysMissed: daysMissed(c, day),
        hasToday: Boolean(todayDrop),
        scheduledToday,
        overdue,
        dueCount: due.length,
        duePackId: due[0]?.packId || "",
      });
      if (todayDrop && !due.length && !c.job && !c.lastFail) done.push(row);
      else send.push(row);
    } else {
      const waiting = !hasJudgment(c) || Boolean(c.lastFail) || Boolean(c.job);
      const row = deskRow(c, { reason: judgeReason(c), ready: !c.job && hasMaterials(c) && (!hasJudgment(c) || Boolean(c.lastFail)) });
      if (waiting) judge.push(row);
      else done.push({ ...row, reason: "判断已出" });
    }
  }

  send.sort((a, b) => Number(a.busy) - Number(b.busy) || Number(Boolean(b.dueCount)) - Number(Boolean(a.dueCount)) || b.daysMissed - a.daysMissed || String(a.name).localeCompare(String(b.name), "zh"));
  judge.sort((a, b) => Number(a.busy) - Number(b.busy) || Number(b.ready) - Number(a.ready) || String(a.name).localeCompare(String(b.name), "zh"));

  const named =
    send.find((c) => !c.busy) ||
    judge.find((c) => c.ready && !c.busy) ||
    judge.find((c) => !c.busy) ||
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
  if (send.length) {
    const scheduled = send.reduce((sum, item) => sum + (item.scheduledToday || 0), 0);
    const overdue = send.reduce((sum, item) => sum + (item.overdue || 0), 0);
    const missing = send.filter((item) => !item.hasToday && !item.busy).length;
    if (scheduled) parts.push(`今天还有 ${scheduled} 条内容待发布`);
    if (overdue) parts.push(`${overdue} 条排期内容尚未发布`);
    if (missing) parts.push(`存量今天还差 ${missing} 家没出内容`);
    const busy = send.filter((item) => item.busy).length;
    if (busy) parts.push(`${busy} 家正在生成内容`);
  }
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
