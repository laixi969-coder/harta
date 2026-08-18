import { readSpecs } from "./industry.mjs";

/* 平台差异的本质不是尺寸，是场景。
 * 尺寸不合规最多被打回重做；场景不匹配是花了钱跑不动，还看不出原因。
 *
 * 所以一条素材在不同平台不是「同一句话改字数」，是不同的字段：
 * 小红书要封面大字 + 标题 + 正文三样（封面大字画在图上，跟标题是两回事），
 * 朋友圈只要一句压在折叠线之前。
 *
 * 字数只在「超了发不出去」时才是规矩，其余都是怎么写的事，写进出档指令，不写进检查器。 */

/** 中文按一字，英文数字按半字，跟平台后台口径一致。 */
export function charCount(text) {
  let n = 0;
  for (const ch of String(text || "")) n += /[\x00-\xff]/.test(ch) ? 0.5 : 1;
  return Math.ceil(n);
}

export function specFor(platform) {
  const specs = readSpecs().platforms || {};
  const name = String(platform || "");
  for (const [key, p] of Object.entries(specs)) {
    if ((p.short && name.includes(p.short)) || (p.name && name.includes(p.name))) {
      return { key, ...p };
    }
  }
  if (name.includes("小红书")) return { key: "xiaohongshu_juguang", ...specs.xiaohongshu_juguang };
  if (name.includes("朋友圈") || name.includes("微信")) return { key: "tencent_moments", ...specs.tencent_moments };
  if (name.includes("短视频") || name.includes("抖音") || name.includes("巨量")) {
    return { key: "juliang_feed", ...specs.juliang_feed };
  }
  if (name.includes("视频号")) return { key: "tencent_video_account", ...specs.tencent_video_account };
  if (name.includes("百度")) return { key: "baidu_feed", ...specs.baidu_feed };
  if (name.includes("快手")) return { key: "kuaishou", ...specs.kuaishou };
  return null;
}

/**
 * 一条素材在这个平台由哪几个字段组成。
 *
 * limit  = 硬限制，超了平台不让发。只有确凿的才填。
 * advise = 建议值，超了能发，但有代价（被折叠、被截断、图上读不清）。
 *
 * 规格文件里那堆数字大多是模型知识不是平台官方文档，它自己也写了「必须以投放后台
 * 实时校验为准」。所以默认当建议，不当红线：销售被一个不存在的限制拦一次，
 * 这个检查就再也没人信了。
 */
export function fieldsFor(platform) {
  const spec = specFor(platform);

  if (spec?.key === "xiaohongshu_juguang") {
    return [
      {
        key: "cover",
        label: "封面大字",
        limit: null,
        advise: 12,
        note: "画在图上的设计，不是平台字段，平台不管它多长。但做长了图上读不清，一眼看不完就没用",
      },
      {
        key: "title",
        label: "标题",
        limit: 20,
        note: "平台硬限制，超了发不出去。跟封面大字是两样东西，别互相当缩写",
      },
      {
        key: "body",
        label: "正文",
        limit: null,
        advise: null,
        note: "平台不卡字数，也别往长里写。拿不拿得到线索跟字数没关系，短到能一口气读完就行",
      },
    ];
  }
  if (spec?.key === "tencent_moments") {
    return [
      {
        key: "title",
        label: "外层文案",
        limit: null,
        advise: spec.title_max || 40,
        note: "不是发不出去，是超了会折叠成「全文」。最要紧的话压在折叠线之前",
      },
      { key: "body", label: "折叠后", limit: null, note: "可留空。展开才看得到，不放关键信息" },
    ];
  }
  return [
    {
      key: "title",
      label: "文案",
      limit: null,
      advise: spec?.title_max || null,
      note: spec?.title_note || "",
    },
  ];
}

/** 这个平台的素材必须像什么。写进提示词，也写给销售看。 */
export function registerFor(platform) {
  const spec = specFor(platform);
  const looks = {
    xiaohongshu_juguang:
      "像一篇笔记，不像广告。第一人称，说自己的经历和顾虑，可以有犹豫、有具体的钱和时间、有没做好的地方。" +
      "不要口号、不要卖点罗列、不要「专业团队」「贴心服务」这类话。种草靠可信，不靠煽动。" +
      "封面大字和标题是两样东西：封面大字是图上让人停手的那几个字，标题是笔记本身的标题，不要把标题裁一段当封面。" +
      "正文不要写长。拿线索靠的不是字数，是可信、是一个具体到能对上号的细节、是最后留的那个让人想问的口子。" +
      "写成一段一段的短句，不要小标题不要分点罗列，那是文章不是笔记。",
    tencent_moments: "像朋友发的动态。短句，第一人称，配的是随手拍不是精修图。广告感一重就被划走。",
    juliang_feed: "像一条有意思的内容，不像广告。现场实拍口播，开头三秒先给事故感。",
    kuaishou: "像真人在说话。口语、不修饰、像熟人推荐。",
    baidu_feed: "像一个专业解答。用户带着问题来，直接回答问题。",
    tencent_video_account: "像一条能转给家人看的内容。语速慢一点，把话说清楚。",
    qianchuan: "像一个值得买的理由。用户已经在购物心智里，不要设计留资诱饵。",
  };
  return {
    scene: spec?.scene || "",
    looks: looks[spec?.key] || "",
    warn: spec?.special_note || "",
    conversion: spec?.conversion || [],
  };
}

/**
 * 出图出片的规格。文案不用管，分镜和成品图必须照着做：
 * 比例错了不是不好看，是被平台裁掉半张脸。
 */
export function formatFor(platform) {
  const spec = specFor(platform);
  if (!spec) return "";
  const parts = [];
  if (spec.video_primary) {
    const alt = (spec.video_ratio || []).filter((r) => r !== spec.video_primary);
    parts.push(`视频 ${spec.video_primary}${alt.length ? `（也收 ${alt.join(" / ")}）` : ""}${spec.video_size ? ` ${spec.video_size}` : ""}`);
  }
  if (spec.image_primary) {
    const alt = (spec.image_ratio || []).filter((r) => r !== spec.image_primary);
    parts.push(`图 ${spec.image_primary}${alt.length ? `（也收 ${alt.join(" / ")}）` : ""}${typeof spec.image_size === "string" ? ` ${spec.image_size}` : ""}`);
  } else if (Array.isArray(spec.image_size) && spec.image_size.length) {
    parts.push(`图 ${spec.image_size.join(" / ")}`);
  }
  return parts.join("；");
}

/** 千川那三种形态逻辑完全不同，最常见的错误是当成一件事。写给模型看。 */
export function formatsFor(platform) {
  const spec = specFor(platform);
  if (!spec?.formats) return "";
  const lines = Object.entries(spec.formats).map(([k, v]) => `  · ${k}：${v}`);
  return [spec.format_note || "", ...lines].filter(Boolean).join("\n");
}

/** 老档里的 shells 是一串字符串，新档是对象。统一成对象再往下走。 */
export function normalizeShellItem(item) {
  if (typeof item === "string") return { title: item.trim() };
  if (!item || typeof item !== "object") return null;
  const out = {};
  for (const k of ["cover", "title", "body"]) {
    const v = typeof item[k] === "string" ? item[k].trim() : "";
    if (v) out[k] = v;
  }
  return out.title || out.cover || out.body ? out : null;
}
