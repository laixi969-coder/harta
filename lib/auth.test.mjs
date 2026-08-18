import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ADMIN_EMAIL,
  addToWhitelist,
  isAdmin,
  loginOrBootstrap,
  maskKey,
  register,
  removeFromWhitelist,
  workspaceId,
} from "./auth.mjs";

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

describe("谁能进这个台子", () => {
  // auth.mjs 认 process.cwd()/data。不换目录就会写进真的账号文件里。
  const realCwd = process.cwd();
  let sandbox;
  beforeAll(() => {
    sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "falcon-auth-"));
    process.chdir(sandbox);
  });
  afterAll(() => {
    process.chdir(realCwd);
    fs.rmSync(sandbox, { recursive: true, force: true });
  });

  it("不在名单上的邮箱注册不了，大小写和空格也绕不过去", () => {
    for (const bad of ["stranger@evil.com", "STRANGER@EVIL.COM", "  stranger@evil.com  "]) {
      const got = register(bad, "abc123456");
      expect(got.error).toBeTruthy();
      expect(got.user).toBeUndefined();
    }
  });

  it("开通之后才注册得了，密码由本人自己设", () => {
    addToWhitelist("xiaoli@company.com");
    const got = register("xiaoli@company.com", "abc123456");
    expect(got.error).toBeUndefined();
    expect(got.user.email).toBe("xiaoli@company.com");
    expect(register("xiaoli@company.com", "abc123456").error).toBeTruthy();
  });

  it("已开通但还没注册的人，不能直接登录", () => {
    addToWhitelist("ahua@company.com");
    expect(loginOrBootstrap("ahua@company.com", "abc123456").error).toBeTruthy();
  });

  it("移出名单之后就注册不了了", () => {
    addToWhitelist("temp@company.com");
    removeFromWhitelist("temp@company.com");
    expect(register("temp@company.com", "abc123456").error).toBeTruthy();
  });
});
