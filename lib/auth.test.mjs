import { describe, expect, it } from "vitest";
import { ADMIN_EMAIL, isAdmin, maskKey, workspaceId } from "./auth.mjs";

describe("admin gate", () => {
  it("only the named super admin is admin", () => {
    expect(isAdmin({ email: ADMIN_EMAIL, role: "admin" })).toBe(true);
    expect(isAdmin({ email: "sales@x.com", role: "sales" })).toBe(false);
    expect(isAdmin({ email: "sales@x.com", role: "admin" })).toBe(false);
  });

  it("masks keys for display", () => {
    expect(maskKey("")).toBe("");
    expect(maskKey("xai-abcdefghijk")).toBe("xai••••hijk");
  });

  it("gives each email its own workspace id", () => {
    expect(workspaceId("a@x.com")).not.toBe(workspaceId("b@x.com"));
    expect(workspaceId("A@x.com")).toBe(workspaceId("a@x.com"));
  });
});
