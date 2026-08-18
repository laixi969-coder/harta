import { bochiFastPack, chengmeiFastPack, hengjiFastPack } from "./pitch-seed.mjs";

function today() {
  return new Date().toISOString().slice(0, 10);
}

function stamp(pack, customer) {
  const name = customer.name;
  const raw = JSON.stringify(pack);
  const swapped = raw
    .replaceAll("恒基旧改", name)
    .replaceAll("南洲柏齿", name)
    .replaceAll("南岸澄美", name);
  const next = JSON.parse(swapped);
  next.id = `p-${customer.id}-${Date.now()}`;
  next.createdAt = today();
  next.deliveredAt = today();
  next.sharePath = "";
  next.evidence = "D";
  next.evidenceNote = `按${customer.hunt}行业包出的快档。没看过${name}自己的在投素材。缺口是赛道判断，不是对这家现状的断言。`;
  return next;
}

function eduPack(customer) {
  return {
    id: `p-${customer.id}-${Date.now()}`,
    createdAt: today(),
    deliveredAt: today(),
    title: "报名之前真正该问的，不是有没有名额",
    tier: "快档",
    evidence: "D",
    evidenceNote: `按教育行业包出的快档。没看过${customer.name}自己的在投素材。`,
    gate: "没看过对方的东西，不写你们的课有多好。下面是赛道判断。",
    battlefields: ["巨量信息流", "朋友圈"],
    testPath: "先测避坑问句，再测价格拆解，最后测能退能转。",
    supply: "教育信息流有效期短。一周补不上新钩子，就会拿过期承诺继续烧。",
    honest: `${customer.city || ""}做${customer.pitch || "培训"}这条路可以。问题往往不在课程，在内容还在喊名额和就业。`,
    next: ["先测三条避坑问句", "给我 10 条在投素材再升级缺口"],
    sharePath: "",
    demand: {
      who: "已经比过两家、怕交钱后换老师换班、问能不能退的人。不是只收藏励志片的。",
      say: ["就业率是真的吗", "换老师怎么办", "能不能分期", "学完找不到工作呢"],
      search: ["培训避坑", "机构退费", "就业协议坑"],
      skip: ["未成年人家长被卖焦虑、本人没意愿的", "只要最低价、不问合同的"],
    },
    gaps: [
      {
        name: "承诺视角",
        fact: "赛道前 3 秒常在喊名额、就业、上岸。客户怕的是交钱后换师资、退不了。",
        cost: "线索来了第一句对质承诺，咨询时间被解释吃掉。",
        cause: "投放要低价点击，教务要满班。两个指标没在素材里对齐。",
        verify: "近 10 条里，讲合同/退费的有几条，讲名额的有几条。",
      },
      {
        name: "价格只报一期",
        fact: "屏幕一个体验价，进门加教材、加协议班、加班型。",
        cost: "到访第一句是「跟广告不一样」。",
        cause: "素材不敢把总价摊开。",
        verify: "把近 15 条分成「只报一个数」和「拆开总价」两堆。",
      },
      {
        name: "人没出场",
        fact: "家长要知道谁上课、换人怎么办。赛道常见教室大片，主讲不出镜。",
        cost: "问了价也不约。",
        cause: "怕老师流动被拍到。",
        verify: "近 20 条里能看清主讲姓名的有几条。",
      },
    ],
    copies: {
      "A 避坑": [
        "报名之前问这一句：换老师怎么赔",
        "就业协议里这 3 项最容易空",
        "别让倒计时替你做决定",
        "先看退费条款，再看课程表",
      ],
      "B 报价": [
        "体验价后面这 3 项容易加",
        "同样一个班，为什么差价一倍",
        "教材、班型、协议各算什么",
        "分期不是便宜，是把总价拉长",
      ],
      "C 过程": [
        "学到一半换老师，合同怎么写才算数",
        "名额紧张的倒计时，可以先不信",
        "能试听的，先试再交大额",
      ],
      "D 武器": ["进门只问三句：谁主讲、退费、换班", "把这 4 句写进补充协议"],
      "E 收口": ["先把总价单拿走，再决定交不交", `${customer.name}先对合同，再对课程表`],
    },
    breakdowns: [
      { copy: "报名之前问这一句：换老师怎么赔", why: "怕的是交钱后货不对板。给武器，不喊就业。" },
      { copy: "体验价后面这 3 项容易加", why: "具体拆价，进门少对质。" },
      { copy: "进门只问三句：谁主讲、退费、换班", why: "收口用问句，不用成功案例。" },
    ],
    shells: {
      巨量信息流: ["报名之前问这一句：换老师怎么赔", "体验价后面这 3 项容易加", "先看退费条款，再看课程表"],
      朋友圈: ["同学交了协议班，我把合同拍下来对照了一下", "倒计时名额可以先不信", "试听完再交大额"],
      小红书: ["培训避坑：换老师怎么赔", "体验价背后三项", "退费条款先看"],
      短视频: ["先别看就业片，先看退费页", "倒计时先停", "进门只问三句"],
    },
  };
}

function localPack(customer) {
  return {
    id: `p-${customer.id}-${Date.now()}`,
    createdAt: today(),
    deliveredAt: today(),
    title: "高客单真正该问的，不是有多专业",
    tier: "快档",
    evidence: "D",
    evidenceNote: `按本地高客单行业包出的快档。没看过${customer.name}自己的在投素材。`,
    gate: "没看过对方的东西，不写你们有多权威。下面是赛道判断。",
    battlefields: ["朋友圈", "巨量信息流"],
    testPath: "先测怕被坑的问句，再测价格构成，最后测人出镜。",
    supply: "本地内容衰减快。一周没有新的本地原话，就会变全国套话。",
    honest: `${customer.city || "本地"}做${customer.pitch || "高客单服务"}可以。问题常在内容还在讲专业，客户怕的是被绕、被加项。`,
    next: ["先测三条本地问句", "给我在投素材再升级"],
    sharePath: "",
    demand: {
      who: "已经问过两家、怕被绕套餐、要见具体办事人的。不是只看品牌片的。",
      say: ["到底谁经办", "报价后面还加什么", "做砸了找谁", "合同怎么写"],
      search: ["避坑", "报价陷阱", "本地口碑"],
      skip: ["只比最低价、不见经办人的", "明确不在本地、无法履约的"],
    },
    gaps: [
      {
        name: "专业视角",
        fact: "赛道前 3 秒在讲专业、案例墙。客户怕的是找不到人、加项、跨区无法履约。",
        cost: "问了价也不到店。",
        cause: "素材用全国模板。",
        verify: "近 10 条里出现具体街道/经办人的有几条。",
      },
      {
        name: "报价包一口",
        fact: "一个套餐价，进门拆出增项。",
        cost: "到店第一句翻脸。",
        cause: "投放要低价点击。",
        verify: "分「一口价」和「分项」两堆。",
      },
      {
        name: "人没出场",
        fact: "高客单要见到办事的人。常见空间大片。",
        cost: "线索不约。",
        cause: "怕拍得不精致。",
        verify: "近 20 条能看清经办人的有几条。",
      },
    ],
    copies: {
      "A 避坑": [
        "进门先问：这件事谁签字、谁经办",
        "套餐里这 3 项最容易另算",
        "跨区的单，先问能不能履约",
        "别让专业介绍替你做决定",
      ],
      "B 报价": [
        "一口价后面这 3 项容易加",
        "同样一件事，为什么两家差一倍",
        "先要分项，再听套餐",
        "定金条款先看能退几天",
      ],
      "C 本地": [
        `${customer.city || "本地"}这事，先问经办人在不在本地`,
        "口碑别只看精修图",
        "合同地址和实际服务地是不是同一个",
      ],
      "D 武器": ["只问三句：谁经办、加项、做砸找谁", "把这 4 句写进合同"],
      "E 收口": ["先把分项报价拿走", `${customer.name}先见人，再交定金`],
    },
    breakdowns: [
      { copy: "进门先问：这件事谁签字、谁经办", why: "高客单怕找不到人。" },
      { copy: "一口价后面这 3 项容易加", why: "拆价，减少到店对质。" },
      { copy: "只问三句：谁经办、加项、做砸找谁", why: "收口给武器。" },
    ],
    shells: {
      朋友圈: ["邻居问了两家，我把分项报价对照了一下", "先见经办人再交定金", "一口价先问另算哪三项"],
      巨量信息流: ["进门先问谁经办", "一口价后面三项", "做砸了找谁"],
      小红书: ["本地避坑：谁经办", "套餐另算三项", "定金能退几天"],
      短视频: ["先别看专业片，先看分项", "谁签字", "加项先问清"],
    },
  };
}

const FACTORIES = {
  家装: (c) => stamp(hengjiFastPack(), c),
  口腔: (c) => stamp(bochiFastPack(), c),
  医美: (c) => stamp(chengmeiFastPack(), c),
  教育: eduPack,
  本地高客单: localPack,
};

export function packFromHunt(customer) {
  const hunt = customer.hunt || "本地高客单";
  const make = FACTORIES[hunt] || localPack;
  return make({
    id: customer.id,
    name: customer.name,
    hunt,
    pitch: customer.pitch || "",
    city: customer.city || "",
  });
}

export function copyCount(pack) {
  return Object.values(pack.copies || {}).flat().length;
}
