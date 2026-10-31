import { describe, expect, it } from "vitest";
import { MockAgent } from 'undici';
import { assertPublicUrl, isPrivateAddress, fetchClientPage } from "./recon.mjs";

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
it('拦截十六进制 IPv4 映射、扩展链路本地及多播地址', async () => {
 for (const ip of ['::ffff:7f00:1','::ffff:a00:1','::ffff:c0a8:101','febf::1','ff02::1','224.0.0.1','255.255.255.255']) expect(isPrivateAddress(ip)).toBe(true);
 expect(isPrivateAddress('2606:4700:4700::1111')).toBe(false);
 await expect(assertPublicUrl('http://[::ffff:127.0.0.1]/')).rejects.toThrow('内网');
 await expect(assertPublicUrl('https://user:password@8.8.8.8/')).rejects.toThrow('账号密码');
});
it('使用兼容的真实传输读取网页并在每次跳转时拦截内网',async()=>{
 const agent=new MockAgent();agent.disableNetConnect();
 const host='https://8.8.8.8',pool=agent.get(host),body='<html><body><h1>公开业务介绍</h1><p>'+('这里是用于验收网页读取的合成业务资料。'.repeat(8))+'</p><script>不应进入资料</script></body></html>';
 pool.intercept({path:'/start',method:'GET'}).reply(302,'',{headers:{location:'/public'}});
 pool.intercept({path:'/public',method:'GET'}).reply(200,body,{headers:{'content-type':'text/html; charset=utf-8'}});
 pool.intercept({path:'/unsafe',method:'GET'}).reply(302,'',{headers:{location:'http://127.0.0.1/private'}});
 try {
  const page=await fetchClientPage(`${host}/start`,{dispatcher:agent});expect(page.ok).toBe(true);expect(page.url).toBe(`${host}/public`);expect(page.text).toContain('合成业务资料');expect(page.text).not.toContain('不应进入资料');
  const blocked=await fetchClientPage(`${host}/unsafe`,{dispatcher:agent});expect(blocked.ok).toBe(false);expect(blocked.why).toContain('跳转被拦下');expect(blocked.why).toContain('内网');
 } finally {await agent.close();}
});
