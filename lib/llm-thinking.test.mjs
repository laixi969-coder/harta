import { expect, it } from 'vitest';
import { thinkingOff } from './llm.mjs';
it('百炼混合思考模型使用兼容参数，其他渠道不误收扩展字段', () => {
  expect(thinkingOff('https://dashscope.aliyuncs.com/compatible-mode/v1', 'qwen3.8-flash')).toEqual({ enable_thinking: false });
  expect(thinkingOff('https://dashscope.aliyuncs.com/compatible-mode/v1', 'qwen3-235b-a22b-thinking-2507')).toEqual({});
  expect(thinkingOff('https://dashscope.aliyuncs.com/compatible-mode/v1', 'deepseek-r1')).toEqual({});
  expect(thinkingOff('https://example.com/dashscope.aliyuncs.com', 'qwen3.8-flash')).toEqual({});
  expect(thinkingOff('https://ark.cn-beijing.volces.com/api/v3', 'doubao')).toEqual({ thinking: { type: 'disabled' } });
});
