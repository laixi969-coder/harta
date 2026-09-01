import { describe, expect, it } from "vitest";
import { renderPackPage } from "./pack-page.mjs";
import { fetchClientPage } from "./recon.mjs";

const customer = { name: "某某旧改", hunt: "家装", city: "广州", pitch: "老房翻新" };
const base = {
  title: "报价单上真正吃人的", tier: "快档", gate: "读过官网之后出的",
  demand: { who: "老小区业主", say: ["a"], search: ["b"], skip: ["c"] },
  battlefields: ["巨量信息流"], testPath: "先测钩子", supply: "一周 5 条", next: ["给我在投素材"],
  copies: { A: ["文案一"] }, shells: { 巨量信息流: ["s"] },
};

describe("甲方那一页", () => {
  it("快档出缺口，不出提问", () => {
    const html = renderPackPage({ ...base, gaps: [{ name: "作品视角", fact: "f", cost: "c", cause: "z", verify: "v" }] }, customer);
    expect(html).toContain("我们看到的");
    expect(html).toContain("作品视角");
    expect(html).not.toContain("想先跟你确认的");
  });

  it("侦察档出提问和赛道格局，绝不出诊断", () => {
    const html = renderPackPage(
      { ...base, tier: "侦察档", landscape: "赛道怎样", questions: [{ ask: "问一句", why: "因为" }] },
      customer,
    );
    expect(html).toContain("想先跟你确认的");
    expect(html).toContain("赛道格局");
    expect(html).not.toContain("我们看到的");
  });

  it("甲方页永远不出现「AI」", () => {
    const html = renderPackPage({ ...base, gaps: [] }, customer);
    expect(html).not.toMatch(/\bAI\b/);
  });

  it("目标人群的原话和搜索词排在一起，排除人群单独放最后", () => {
    const html = renderPackPage({ ...base, gaps: [] }, customer);
    expect(html).toContain("目标需求与排除人群");
    expect(html).toContain("目标人群会这样问");
    expect(html).toContain("目标人群会搜索这些");
    expect(html).toContain("排除人群（不投）");
    expect(html).not.toContain("这个人在搜");
    expect(html.indexOf("目标人群会这样问")).toBeLessThan(html.indexOf("目标人群会搜索这些"));
    expect(html.indexOf("目标人群会搜索这些")).toBeLessThan(html.indexOf("排除人群（不投）"));
  });

  it("客户名和文案里的尖括号被转义，不能变成标签", () => {
    const html = renderPackPage(
      { ...base, title: '<img src=x onerror=alert(1)>', gaps: [] },
      { ...customer, name: "<script>bad()</script>" },
    );
    // 要紧的是尖括号进不去，成不了标签；转义之后的字面文本留着无所谓
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;script&gt;bad()&lt;/script&gt;");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });

  it("档里没有的整块不出现，不留空壳", () => {
    const html = renderPackPage({ ...base, gaps: [], boards: [] }, customer);
    expect(html).not.toContain("样品 · 分镜脚本");
    expect(html).not.toContain("我们看到的");
  });

  it("高风险行业的上线边界会进甲方页，不能只藏在内部检查器", () => {
    const html = renderPackPage(
      {
        ...base,
        gaps: [],
        checks: { guardrails: [{ label: "HPV", text: "疫苗用于预防，不写成既有感染的治疗方案。" }] },
      },
      { ...customer, hunt: "医药" },
    );
    expect(html).toContain("上线边界");
    expect(html).toContain("疫苗用于预防");
    expect(html).toContain("发布前核验");
  });
});

describe("抓客户页面的边界", () => {
  it("挡住内网和本机", async () => {
    for (const bad of ["http://127.0.0.1/", "http://192.168.1.1/", "http://10.0.0.1/", "http://[::1]/"]) {
      const got = await fetchClientPage(bad);
      expect(got.ok).toBe(false);
      expect(got.why).toContain("内网");
    }
  });

  it("只认 http 和 https，别的协议在查 DNS 之前就挡掉", async () => {
    // 这几条都必须在碰网络之前就被否掉，所以这个用例不该慢
    const started = Date.now();
    for (const bad of ["file:///etc/passwd", "ftp://x/y", "javascript:alert(1)", "http://", "not a url"]) {
      const got = await fetchClientPage(bad);
      expect(got.ok).toBe(false);
    }
    expect(Date.now() - started).toBeLessThan(500);
  });

  it("空的就是空的，不当成看过", async () => {
    expect((await fetchClientPage("")).ok).toBe(false);
  });
});
