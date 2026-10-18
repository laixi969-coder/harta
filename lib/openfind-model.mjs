import { createHash } from 'node:crypto';
import { chat, readLlm } from './llm.mjs';

// Read the same selection on every request. Credentials never enter OpenFind's
// settings, SQLite store, HTTP responses or IPC snapshots.
export function hartaModelState() {
  const data = readLlm(), p = data.providers[data.active];
  const ready = Boolean(p?.apiKey && p?.baseUrl && p?.model);
  return {
    model: p?.model || '', providerName: p?.name || '未选择模型渠道', ready,
    revision: createHash('sha256').update(JSON.stringify([
      data.active, p?.kind, p?.baseUrl, p?.model, p?.apiKey,
    ])).digest('hex'),
  };
}

export const hartaModelAdapter = {
  state: hartaModelState,
  async complete(messages, signal) {
    const before = hartaModelState();
    if (!before.ready) throw new Error('Harta 当前模型尚未配置完整，请联系管理员在「设置 → 模型」选择可用模型');
    let result;
    try {
      result = await chat({
        system: messages.filter(m => m.role === 'system').map(m => m.content).join('\n'),
        user: messages.filter(m => m.role === 'user').map(m => m.content).join('\n'),
        maxTokens: 8000, signal, jsonOutput: true, safeErrors: true,
      });
    } catch (error) {
      if (signal?.aborted) signal.throwIfAborted();
      // A provider's response/error can echo prompts or credentials.
      const status = /模型返回 HTTP \d{3}/.exec(error.message)?.[0];
      throw new Error(status || 'Harta 模型调用失败，请在「设置 → 模型」检查连接后重试');
    }
    if (hartaModelState().revision !== before.revision)
      throw new Error('Harta 已切换模型配置，请重新复核，避免混用结果');
    return result;
  },
};
