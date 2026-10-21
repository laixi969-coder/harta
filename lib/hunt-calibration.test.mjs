import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { baseGradeOf, calibrateHunt, calibrationBrief, huntEvidence, readCalibration, saveCalibration, withCalibrationEvidence } from './hunt-calibration.mjs';

const original = process.cwd();
let dir;
const D_PACK = `# 行业包：测试行业

- 生成日期：2026-10-01
- 情报样本量：0 条一手素材
- 情报来源：**模型判断为主（D 级）+ 行业常识（C 级）**

## 1. 钩子公式库
`;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'harta-hunt-calib-'));
  fs.mkdirSync(path.join(dir, 'data', 'industries'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'vendor', 'hiccai-pitch', 'industries'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'data', 'industries', '测试行业.md'), D_PACK);
  fs.writeFileSync(path.join(dir, 'vendor', 'hiccai-pitch', 'industries', '策展行业.md'), '# 行业包：策展行业\n\n- 情报来源：**一手素材（B 级）**\n');
  process.chdir(dir);
});
afterAll(() => { process.chdir(original); fs.rmSync(dir, { recursive: true, force: true }); });

const evidence = (over = {}) => ({ comments: 0, clusters: 0, repeated: 0, replied: 0, teardowns: 0, accounts: 0, keywords: 0, works: 0, ...over });

describe('行业包校准', () => {
  it('现场包读到 D 级，策展包读到 B 级', () => {
    expect(baseGradeOf('测试行业')).toBe('D');
    expect(baseGradeOf('策展行业')).toBe('B');
  });

  it('证据不够就停在 D，并写清差几条', () => {
    const result = calibrateHunt('测试行业', evidence({ comments: 12, clusters: 1 }));
    expect(result.grade).toBe('D');
    expect(result.gaps.find((g) => g.key === 'comments')).toMatchObject({ have: 12, need: 30, missing: 18 });
    expect(result.warnings.join()).toContain('仍是 D 级');
  });

  it('评论、痛点、有回音、拆解四项齐了才升 C', () => {
    const result = calibrateHunt('测试行业', evidence({ comments: 40, clusters: 4, replied: 2, teardowns: 1 }));
    expect(result.grade).toBe('C');
    expect(result.steps[0].to).toBe('C');
    expect(result.method).toBe('规则校准 · 已升级');
    // C 级之后继续看 B 级条件，没满足就列为缺口
    expect(result.gaps.some((g) => g.key === 'accounts')).toBe(true);
  });

  it('痛点复现、有回音篇数与博主数都够了才升 B，且不越到 A', () => {
    const result = calibrateHunt('测试行业', evidence({ comments: 60, clusters: 6, repeated: 3, replied: 6, teardowns: 3, accounts: 2 }));
    expect(result.grade).toBe('B');
    expect(result.warnings.join()).toContain('最多把包顶到 B 级');
  });

  it('策展包不因单账号证据改等级，但缺口照给', () => {
    const result = calibrateHunt('策展行业', evidence({ comments: 40, clusters: 4, replied: 2, teardowns: 1 }));
    expect(result.grade).toBe('B');
    expect(result.source).toBe('策展');
    expect(result.warnings.join()).toContain('不自动改等级');
  });

  it('从客户数据里只数真实评论，排除作者自答与已排除', () => {
    const counted = huntEvidence({
      customer: { id: 'c1', painClusters: { clusters: [{ count: 6 }, { count: 2 }] }, playbook: { coverage: { replied: 3 } }, benchmarkTeardowns: [{}], accountTeardowns: [{}] },
      signals: [{ text: '真实问题' }, { text: '作者回复', isAuthorReply: true }, { text: '排除了', status: 'excluded' }, { text: '' }],
      works: [{ customerId: 'c1' }],
    });
    expect(counted).toMatchObject({ comments: 1, clusters: 2, repeated: 1, replied: 3, teardowns: 1, accounts: 1, works: 1 });
  });

  it('提示词只带真实证据，并写清样本边界', () => {
    const base = calibrateHunt('测试行业', evidence({ comments: 40, clusters: 3, replied: 1, teardowns: 1 }));
    const filled = withCalibrationEvidence(base, {
      painClusters: { clusters: [{ topic: '怕加价', count: 12, quotes: [{ text: '怎么收费' }] }] },
      playbook: { cards: [{ angle: '拆费用项', hits: 2 }] },
      benchmarkTeardowns: [{ transferable: ['价差锚点'] }],
    });
    const brief = calibrationBrief(filled);
    expect(brief).toContain('怕加价：12 条');
    expect(brief).toContain('拆费用项（有回音 2 次）');
    expect(brief).toContain('价差锚点');
    expect(brief).toContain('不能当成整个行业的统计结论');
    expect(calibrationBrief(withCalibrationEvidence(base, {}))).toBe('');
  });

  it('校准档案能落盘再读回，不改行业包原文', () => {
    const saved = saveCalibration({ hunt: '测试行业', grade: 'C', baseGrade: 'D', evidence: evidence({ comments: 30 }) });
    expect(readCalibration('测试行业')).toMatchObject({ hunt: '测试行业', grade: 'C' });
    expect(saved.evidence.comments).toBe(30);
    expect(fs.readFileSync(path.join(dir, 'data', 'industries', '测试行业.md'), 'utf8')).toBe(D_PACK);
  });
});
