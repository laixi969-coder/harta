import { normalizeShellItem, specFor } from "./platform.mjs";

/* 出完、交到销售手上之前的自行判断。
 * 只拦机器能稳定认出来的：口号自夸、换皮、跨平台同一句、小红书写成文章。
 * 写得好不好里那些要品味的，不编分数。拦错一次这个检查就没人信。 */

const SLOGAN = [
  "专业团队", "贴心服务", "一站式服务", "品质之选", "匠心",
  "限时优惠", "立即咨询", "马上报名", "欢迎致电", "欢迎咨询",
  "赋能", "抓手", "闭环", "生态位",
  "本公司", "本机构", "我们团队", "我们公司", "我们诊所", "我们医院",
  "我们工人", "我们做了",
];

const WE_SUBJECT = /我们(?:公司|机构|团队|诊所|医院|品牌|工人|员工)/;

const XHS_LIST = /(?:^|\n)\s*(?:[0-9０-９]+[\.．、]|[①②③④⑤⑥⑦⑧]|第[一二三四五六七八]点|首先|其次|综上所述)/;

function compact(s) {
  return String(s || "").replace(/[^\u4e00-\u9fffA-Za-z0-9]/g, "").toLowerCase();
}

function alike(a, b) {
  const x = compact(a);
  const y = compact(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  if (short.length >= 10 && long.includes(short)) return true;
  if (short.length >= 14) {
    for (let i = 0; i <= short.length - 14; i += 1) {
      if (long.includes(short.slice(i, i + 14))) return true;
    }
  }
  return false;
}

function sloganHit(text) {
  const body = String(text || "");
  for (const w of SLOGAN) {
    if (body.includes(w)) return w;
  }
  const we = body.match(WE_SUBJECT);
  return we ? we[0] : "";
}

function push(issues, row) {
  issues.push(row);
}

function walkCopies(copies, fn) {
  for (const [group, lines] of Object.entries(copies || {})) {
    (lines || []).forEach((text, i) => fn(`${group} · ${i + 1}`, text));
  }
}

function walkShells(shells, fn) {
  for (const [plat, items] of Object.entries(shells || {})) {
    (items || []).forEach((raw, i) => {
      const item = normalizeShellItem(raw);
      if (!item) return;
      fn(plat, i, item);
    });
  }
}

function judgeSlogans(copies, shells, issues) {
  walkCopies(copies, (where, text) => {
    const hit = sloganHit(text);
    if (hit) {
      push(issues, {
        where,
        text,
        hit,
        level: "hard",
        why: `「${hit}」是口号或自夸，不是钩子。获客句的主语是用户怕的那件事，不是你们有多好`,
      });
    }
  });
  walkShells(shells, (plat, i, item) => {
    for (const [field, text] of Object.entries(item)) {
      const hit = sloganHit(text);
      if (!hit) continue;
      push(issues, {
        where: `${plat} · ${field} · ${i + 1}`,
        text,
        hit,
        level: "hard",
        why: `「${hit}」是口号或自夸，这个平台发出去会像广告`,
      });
    }
  });
}

function judgeClones(copies, issues) {
  const rows = [];
  walkCopies(copies, (where, text) => rows.push({ where, text }));
  const cloneOf = new Array(rows.length).fill(false);
  for (let i = 0; i < rows.length; i += 1) {
    for (let j = 0; j < i; j += 1) {
      if (alike(rows[i].text, rows[j].text)) {
        cloneOf[i] = true;
        push(issues, {
          where: rows[i].where,
          text: rows[i].text,
          level: "hard",
          why: `跟「${rows[j].where}」是换皮，同一钩子改几个字不算一条`,
        });
        break;
      }
    }
  }
  const total = rows.length;
  const unique = cloneOf.filter((x) => !x).length;
  if (total >= 4 && unique / total < 0.5) {
    push(issues, {
      where: "这一批",
      text: "",
      scope: "batch",
      level: "hard",
      why: `这一批换皮太多：${total} 条里只有 ${unique} 条是真不一样的。一批货不能拿同一句话交差`,
    });
  }
}

function judgeCrossPlatform(shells, issues) {
  const titles = [];
  walkShells(shells, (plat, i, item) => {
    const text = item.title || item.body || item.cover || "";
    if (text) titles.push({ plat, i, text });
  });
  for (let i = 0; i < titles.length; i += 1) {
    for (let j = 0; j < i; j += 1) {
      if (titles[i].plat === titles[j].plat) continue;
      if (!alike(titles[i].text, titles[j].text)) continue;
      push(issues, {
        where: `${titles[i].plat} · ${i + 1}`,
        text: titles[i].text,
        level: "hard",
        why: `跨平台同一句：跟「${titles[j].plat}」是同一句话。平台不是改字数，是不同字段、不同语气`,
      });
      break;
    }
  }
}

function judgeXiaohongshu(shells, issues) {
  walkShells(shells, (plat, i, item) => {
    if (specFor(plat)?.key !== "xiaohongshu_juguang") return;
    const body = item.body || "";
    const all = `${item.cover || ""}${item.title || ""}${body}`;
    if (XHS_LIST.test(body)) {
      push(issues, {
        where: `小红书 · 正文 · ${i + 1}`,
        text: body,
        level: "hard",
        why: "写成了分点文章。小红书是笔记：一段一段短句，不要小标题、不要首先其次",
      });
    }
    if (all && !/[我俺自己咱]/.test(all)) {
      push(issues, {
        where: `小红书 · ${i + 1}`,
        text: body || item.title || "",
        level: "advise",
        why: "没有第一人称。小红书靠自己的经历和顾虑种草，不是必须「我」，但现在读起来不像笔记",
      });
    }
  });
}

/** 返回质量/平台问题列表。level=hard 不能复制；advise 只提示。 */
export function judgeQuality(pack) {
  const issues = [];
  const copies = pack?.copies || {};
  const shells = pack?.shells || {};
  judgeSlogans(copies, shells, issues);
  judgeClones(copies, issues);
  judgeCrossPlatform(shells, issues);
  judgeXiaohongshu(shells, issues);
  return issues;
}
