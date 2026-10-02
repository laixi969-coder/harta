import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createSession, readSession, loadSessions } from "./session.mjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ADMIN_EMAIL,
  addToWhitelist,
  changePassword,
  isAdmin,
  loginOrBootstrap,
  maskKey,
  register,
  removeFromWhitelist,
  resetPassword,
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
    sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "harta-auth-"));
    process.chdir(sandbox);
    loadSessions();
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
    const invite = addToWhitelist("xiaoli@company.com");
    expect(register("xiaoli@company.com", "abc123456").error).toMatch(/激活码/);
    const got = register("xiaoli@company.com", "abc123456", invite.activationCode);
    expect(got.error).toBeUndefined();
    expect(got.user.email).toBe("xiaoli@company.com");
    expect(register("xiaoli@company.com", "abc123456").error).toBeTruthy();
  });

  it("已开通但还没注册的人，不能直接登录", () => {
    addToWhitelist("ahua@company.com");
    expect(loginOrBootstrap("ahua@company.com", "abc123456").error).toBeTruthy();
  });

  it("忘记密码必须持有新激活码，重设同时撤销所有会话", () => {
    const invite = addToWhitelist("wangji@company.com");
    expect(register("wangji@company.com", "old123456", invite.activationCode).error).toBeUndefined();
    expect(loginOrBootstrap("wangji@company.com", "old123456").user.role).toBe("sales");

    // 抹之前，重复注册是被挡住的
    expect(register("wangji@company.com", "new123456").error).toBeTruthy();

    const sid = createSession({ email: "wangji@company.com", role: "sales" });
    const reset = resetPassword("wangji@company.com");
    expect(reset.ok).toBe(true);
    expect(readSession(sid)).toBeNull();
    expect(register("wangji@company.com", "new123456", invite.activationCode).error).toMatch(/激活码/);
    // 抹完登录不了，提示要去重设
    expect(loginOrBootstrap("wangji@company.com", "old123456").error).toMatch(/重设/);
    // 回注册页设新的，角色还是销售，不会变回默认
    const again = register("wangji@company.com", "new123456", reset.activationCode);
    expect(again.error).toBeUndefined();
    expect(again.user.role).toBe("sales");
    expect(loginOrBootstrap("wangji@company.com", "new123456").user.email).toBe("wangji@company.com");
    // 旧密码彻底失效
    expect(loginOrBootstrap("wangji@company.com", "old123456").error).toBeTruthy();
  });

  it("超管的密码不走重设，自己改", () => {
    expect(resetPassword(ADMIN_EMAIL).error).toBeTruthy();
    expect(resetPassword("nobody@company.com").error).toBeTruthy();
  });

  it("移出名单之后就注册不了了", () => {
    addToWhitelist("temp@company.com");
    removeFromWhitelist("temp@company.com");
    expect(register("temp@company.com", "abc123456").error).toBeTruthy();
  });

  it("首次管理员只能用服务器预置密码初始化", () => {
    const previous = process.env.HARTA_SETUP_PASSWORD;
    delete process.env.HARTA_SETUP_PASSWORD;
    expect(loginOrBootstrap(ADMIN_EMAIL, 'attacker12345').error).toMatch(/安全初始化/);
    process.env.HARTA_SETUP_PASSWORD = 'trusted-initial-password';
    expect(loginOrBootstrap(ADMIN_EMAIL, 'attacker12345').error).toMatch(/初始化密码/);
    expect(loginOrBootstrap(ADMIN_EMAIL, 'trusted-initial-password').user.role).toBe('admin');
    if (previous === undefined) delete process.env.HARTA_SETUP_PASSWORD; else process.env.HARTA_SETUP_PASSWORD = previous;
    expect(loginOrBootstrap(ADMIN_EMAIL, 'trusted-initial-password').user.role).toBe('admin');
  });

  it("修改密码和撤销访问都会撤销旧设备会话", () => {
    const invite = addToWhitelist('revoke@company.com');
    register('revoke@company.com', 'old123456', invite.activationCode);
    const old = createSession({ email: 'revoke@company.com', role: 'sales' });
    expect(changePassword('revoke@company.com', 'old123456', 'new123456').ok).toBe(true);
    expect(readSession(old)).toBeNull();
    const fresh = createSession({ email: 'revoke@company.com', role: 'sales' });
    removeFromWhitelist('revoke@company.com');
    expect(readSession(fresh)).toBeNull();
    expect(loginOrBootstrap('revoke@company.com', 'new123456').error).toMatch(/停用/);
  });

  it("激活码过期不能注册，重发使旧码失效", () => {
    const first = addToWhitelist('expiry@company.com');
    const second = addToWhitelist('expiry@company.com');
    expect(register('expiry@company.com', 'new123456', first.activationCode).error).toMatch(/激活码/);
    const file = path.join(sandbox, 'data/auth.json');
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    data.activations['expiry@company.com'].expiresAt = Date.now() - 1;
    fs.writeFileSync(file, JSON.stringify(data));
    expect(register('expiry@company.com', 'new123456', second.activationCode).error).toMatch(/激活码/);
  });

  it("邮箱和密码有明确上限", () => {
    expect(addToWhitelist(`${"a".repeat(250)}@x.com`).error).toMatch(/254/);
    expect(loginOrBootstrap(ADMIN_EMAIL, "x".repeat(129)).error).toMatch(/128/);
  });
});
