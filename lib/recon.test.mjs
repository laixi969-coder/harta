import { describe, expect, it } from "vitest";
import { assertPublicUrl, isPrivateAddress } from "./recon.mjs";

describe("客户链接只允许公网地址", () => {
  it("识别常见 IPv4 和 IPv6 内网", () => {
    for (const ip of ["127.0.0.1", "10.0.0.8", "172.16.2.3", "192.168.1.1", "169.254.1.2", "::1", "fd00::1"]) {
      expect(isPrivateAddress(ip)).toBe(true);
    }
    expect(isPrivateAddress("8.8.8.8")).toBe(false);
  });

  it("直接填写本机和内网链接会被拦下", async () => {
    await expect(assertPublicUrl("http://127.0.0.1:3000/secret")).rejects.toThrow(/内网/);
    await expect(assertPublicUrl("http://192.168.1.10/admin")).rejects.toThrow(/内网/);
  });
});
