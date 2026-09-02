import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSession, destroySession, loadSessions, readSession } from "./session.mjs";

describe("会话活在盘上，不在进程里", () => {
  // session.mjs 认 process.cwd()/data。不换目录就会写进真的会话文件里。
  const realCwd = process.cwd();
  let sandbox;
  beforeAll(() => {
    sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "harta-session-"));
    process.chdir(sandbox);
  });
  afterAll(() => {
    process.chdir(realCwd);
    fs.rmSync(sandbox, { recursive: true, force: true });
  });

  it("登录建的会话，重启（loadSessions）之后照样认", () => {
    const sid = createSession({ email: "ahua@company.com", role: "sales" });
    loadSessions(); // 模拟部署重启：内存清空，从盘上接回
    expect(readSession(sid)).toEqual({ email: "ahua@company.com", role: "sales" });
  });

  it("登出就是真的没了，重启也不复活", () => {
    const sid = createSession({ email: "ali@company.com", role: "sales" });
    destroySession(sid);
    loadSessions();
    expect(readSession(sid)).toBeNull();
  });

  it("过期的会话启动时被清掉，也不再认", () => {
    const sid = createSession({ email: "old@company.com", role: "sales" });
    const file = path.join(sandbox, "data", "sessions.json");
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    data[sid].exp = Date.now() - 1000;
    fs.writeFileSync(file, JSON.stringify(data));
    loadSessions();
    expect(readSession(sid)).toBeNull();
    expect(JSON.parse(fs.readFileSync(file, "utf8"))[sid]).toBeUndefined();
  });

  it("文件写坏或不存在时不炸，退回重新登录", () => {
    fs.mkdirSync(path.join(sandbox, "data"), { recursive: true });
    fs.writeFileSync(path.join(sandbox, "data", "sessions.json"), "{半截");
    expect(loadSessions()).toEqual({});
    expect(readSession("whatever")).toBeNull();
  });

  it("sid 是随机的，两个会话互不干扰", () => {
    const a = createSession({ email: "a@x.com", role: "sales" });
    const b = createSession({ email: "b@x.com", role: "sales" });
    expect(a).not.toBe(b);
    expect(readSession(a).email).toBe("a@x.com");
    expect(readSession(b).email).toBe("b@x.com");
  });
});
