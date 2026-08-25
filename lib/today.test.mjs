import { describe, expect, it, vi } from "vitest";
import { today } from "./today.mjs";

describe("today", () => {
  it("给的是本地日历日的 YYYY-MM-DD", () => {
    // 定在本地 2026-08-24 凌晨 00:30：东八区此时 UTC 还是 08-23。
    // 旧的 toISOString 实现在 UTC+ 的时区会把这天标成前一天。
    vi.useFakeTimers({ now: new Date(2026, 7, 24, 0, 30) });
    expect(today()).toBe("2026-08-24");
    vi.useRealTimers();
  });

  it("格式永远是四位年两位月两位日", () => {
    expect(today()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
