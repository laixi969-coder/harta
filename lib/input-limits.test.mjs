import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { INPUT_LIMITS, textField } from "./input-limits.mjs";

describe("粘贴内容的字数口径", () => {
  it("边界值完整保留，超过时明确报错而不是静默截断", () => {
    const exact = "字".repeat(INPUT_LIMITS.salesMaterial);
    expect(textField(exact, "销售补充", INPUT_LIMITS.salesMaterial)).toEqual({ text: exact, error: "" });
    expect(textField(`${exact}多`, "销售补充", INPUT_LIMITS.salesMaterial).error).toContain("12,000");
  });

  it("主要粘贴框把后端上限直接写在页面上", () => {
    const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
    expect(html).toContain(`id="pitch" class="short-textarea" rows="3" maxlength="${INPUT_LIMITS.pitch}"`);
    expect(html).toContain(`id="cmaterial" class="long-textarea" rows="8" maxlength="${INPUT_LIMITS.salesMaterial}"`);
    expect(html).toContain(`id="ledger-talk" class="ledger-textarea" rows="6" maxlength="${INPUT_LIMITS.ledgerTalk}"`);
    expect(html).toContain(`id="material-link" type="url" maxlength="${INPUT_LIMITS.materialUrl}"`);
  });
});
