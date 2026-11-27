import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  checkpointRequest,
  contentStep,
  createContentRun,
  readContentRun,
  runContentSteps,
  UncertainProviderRequest,
} from './content-checkpoints.mjs';
import { contentUsage, modelFetch, readModelSpend, withModelAccount } from './model-spend.mjs';

let temp, cwd;
const owner = 'owner@example.invalid', customer = 'same-id', url = 'https://fixture.invalid/chat';
beforeEach(() => {
  temp = fs.mkdtempSync(path.join(os.tmpdir(), 'harta-content-recovery-'));
  cwd = vi.spyOn(process, 'cwd').mockReturnValue(temp);
});
afterEach(() => {
  cwd.mockRestore();
  vi.unstubAllEnvs();
  fs.rmSync(temp, { recursive: true, force: true });
});
const reply = () =>
  new Response(JSON.stringify({ usage: { prompt_tokens: 100, completion_tokens: 20 }, answer: 'content' }));
it('模糊的已发请求需要明确重试，已完成阶段直接复用，用量仅属于本账号', async () => {
  const id = createContentRun(owner, customer, 'v1', { readerQuestion: '测试' });
  const transport = vi.fn().mockResolvedValueOnce(reply()).mockRejectedValueOnce(Error('connection lost'))
    .mockResolvedValueOnce(reply());
  vi.stubEnv(
    'HARTA_USAGE_RATES_JSON',
    JSON.stringify({ 'fixture.invalid/f': { inputUsdPerMillion: 2, outputUsdPerMillion: 8 } }),
  );
  const call = (key) =>
    checkpointRequest(key, async () => {
      const r = await modelFetch(url, {
        method: 'POST',
        body: JSON.stringify({ model: 'f', max_tokens: 20 }),
        transportFetch: transport,
      });
      return (await r.json()).answer;
    });
  const stage = (key) => contentStep(key, key, () => call(key));
  const run = (confirmed) =>
    withModelAccount(
      owner,
      () =>
        runContentSteps(
          owner,
          customer,
          id,
          confirmed,
          async () => [await stage('成稿'), await stage('核对')],
        ),
    );
  await expect(run(false)).rejects.toBeInstanceOf(UncertainProviderRequest);
  expect(readContentRun(owner, customer, id)).toMatchObject({ stage: '核对', uncertain: true });
  await expect(run(false)).rejects.toBeInstanceOf(UncertainProviderRequest);
  expect(transport).toHaveBeenCalledTimes(2);
  expect(readContentRun('other@example.invalid', customer, id)).toBeNull();
  expect(readContentRun(owner, 'another', id)).toBeNull();
  expect(await run(true)).toEqual(['content', 'content']);
  expect(transport).toHaveBeenCalledTimes(3);
  expect(await run(false)).toEqual(['content', 'content']);
  expect(transport).toHaveBeenCalledTimes(3);
  const metrics = contentUsage(owner, id);
  expect(metrics).toMatchObject({
    attempts: 3,
    inputReports: 2,
    outputReports: 2,
    inputTokens: 200,
    outputTokens: 40,
    pricedCalls: 2,
    actualCharges: null,
  });
  expect(metrics.estimatedUsd).toBeCloseTo(0.00072);
  expect(metrics.reservedCents).toBeGreaterThan(0);
  expect(readModelSpend(owner).measuredUsage).toEqual(metrics);
  expect(readModelSpend('other@example.invalid').measuredUsage.attempts).toBe(0);
});
it('保护额度在出网前拒绝，恢复无需确认；缺少供应商用量保持未知', async () => {
  const runId = createContentRun(owner, customer, 'v1', {}),
    transport = vi.fn(async () => new Response('{"choices":[]}'));
  const run = () =>
    withModelAccount(
      owner,
      () =>
        runContentSteps(owner, customer, runId, false, () =>
          checkpointRequest('same', async () => {
            const res = await modelFetch(url, {
              method: 'POST',
              body: JSON.stringify({ model: 'test', max_tokens: 8000 }),
              transportFetch: transport,
            });
            return res.json();
          })),
    );
  vi.stubEnv('HARTA_MODEL_ACCOUNT_DAILY_CENTS', '1');
  await expect(run()).rejects.toThrow(/预留/);
  expect(transport).not.toHaveBeenCalled();
  expect(readContentRun(owner, customer, runId).uncertain).toBe(false);
  vi.stubEnv('HARTA_MODEL_ACCOUNT_DAILY_CENTS', '1000');
  await run();
  expect(transport).toHaveBeenCalledTimes(1);
  expect(contentUsage(owner, runId)).toMatchObject({
    attempts: 1,
    inputTokens: null,
    outputTokens: null,
    estimatedUsd: null,
    actualCharges: null,
  });
});

it('备份恢复包含未完成的业务步骤，完成和过期清除中间结果', async () => {
  const { createBackup, restoreBackup } = await import('./backup.mjs');
  const { purgeExpiredContentRuns, deleteContentRun } = await import('./content-checkpoints.mjs');
  const id = createContentRun(owner, customer, 'v', {}), now = Date.now();
  const check = () =>
    runContentSteps(
      owner,
      customer,
      id,
      false,
      () => contentStep('成稿', 'draft', () => ({ body: '隔离测试稿' })),
    );
  await check();
  const backup = path.join(temp, 'backup'), restored = path.join(temp, 'restored');
  await createBackup(path.join(temp, 'data'), backup, { offline: true });
  fs.mkdirSync(restored);
  restoreBackup(backup, path.join(restored, 'data'));
  cwd.mockReturnValue(restored);
  expect(
    await runContentSteps(owner, customer, id, false, () =>
      contentStep('成稿', 'draft', () => {
        throw Error('不应重新生成');
      })),
  ).toEqual({ body: '隔离测试稿' });
  deleteContentRun(owner, customer, id);
  expect(readContentRun(owner, customer, id)).toBeNull();
  cwd.mockReturnValue(temp);
  purgeExpiredContentRuns({ now: now + 86400002 });
  expect(readContentRun(owner, customer, id)).toBeNull();
});
