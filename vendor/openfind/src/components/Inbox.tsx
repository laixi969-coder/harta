import { useEffect, useState, useRef } from 'react';
import { api } from '../api';
import { useWorkspace } from '../context';
import type { Platform } from '../../shared/types';
import type { InboxThread, ReplyDraft } from '../../shared/messages';
import { platformNames } from './PlatformConnections';
import { Busy, Empty } from './ui';
export function Inbox() {
  const { notify, data, navigate } = useWorkspace();
  const [threads, setThreads] = useState<InboxThread[]>([]),
    [drafts, setDrafts] = useState<ReplyDraft[]>([]),
    [selected, setSelected] = useState(''),
    [platform, setPlatform] = useState<Platform>('xiaohongshu'),
    [busy, setBusy] = useState(false),
    [text, setText] = useState('');
  const t = threads.find((t) => t.id === selected);
  const platformThreads = threads.filter((t) => t.platform === platform);
  const fetchSequence = useRef(0);
  async function update() {
    const sequence = ++fetchSequence.current;
    const d = await api<{ threads: InboxThread[]; drafts: ReplyDraft[] }>('/inbox');
    if (sequence !== fetchSequence.current) return;
    setThreads(d.threads);
    setDrafts(d.drafts);
  }
  useEffect(() => {
    void update().catch((e) => notify(e.message, true));
    const timer = setInterval(() => void update().catch(() => {}), 4000);
    return () => clearInterval(timer);
  }, []);
  async function action(fn: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      await update();
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  async function select(thread: InboxThread) {
    setSelected(thread.id);
    setText('');
  }
  async function configure(patch: Partial<InboxThread>) {
    if (!t) return;
    await action(() =>
      api(
        `/inbox/threads/${t.id}`,
        {
          revision: t.revision,
          watching: false,
          autoSuggest: false,
          stopped: t.stopped,
          leadId: t.leadId,
          ...patch,
        },
        'PUT',
      ),
    );
  }
  const related = data.leads.filter(
    (l) =>
      l.source === 'live' &&
      (l.platform || 'xiaohongshu') === t?.platform &&
      l.authorId === (t?.peerId || t?.nativeId),
  );
  return (
    <div className="inbox-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">CONVERSATIONS</p>
          <h1>私信工作台</h1>
          <p className="muted">
            手动同步会话、生成回复草稿，复制后由你在官方平台发送。后台托管与平台发送已取消。
          </p>
        </div>
      </div>
      <div className="panel" style={{ padding: 20, marginBottom: 16 }}>
        <label>
          平台{' '}
          <select
            aria-label="私信平台"
            value={platform}
            disabled={busy}
            onChange={(e) => {
              setPlatform(e.target.value as Platform);
              setSelected('');
            }}
          >
            <option value="xiaohongshu">小红书</option>
            <option value="douyin">抖音</option>
          </select>
        </label>{' '}
        <button
          className="btn primary"
          disabled={busy || platform === 'xiaohongshu'}
          onClick={() => void action(() => api(`/inbox/${platform}/sync`, {}))}
        >
          连接并同步官方会话
        </button>
        {busy && <Busy text="正在处理" />}
        <p className="field-hint">
          小红书会话读取已停用，历史记录和草稿仍保留。抖音仅在你点击同步时读取，所有消息由你自行发送。
        </p>
      </div>
      <div className={`inbox-layout ${!platformThreads.length ? 'inbox-empty' : ''}`}>
        {platformThreads.length > 0 && <aside className="panel inbox-threads" aria-label="私信会话列表">
          {platformThreads
            .map((th) => (
              <button
                className={`inbox-thread ${selected === th.id ? 'active' : ''}`}
                key={th.id}
                onClick={() => void select(th)}
                disabled={busy}
              >
                <strong>{th.name}</strong>
                <span>{th.preview}</span>
                <small>
                  {th.accountName} · {th.timeLabel}
                  {th.watching ? ' · 同步中' : ''}
                  {th.error ? ' · 已暂停' : ''}
                </small>
              </button>
            ))}
        </aside>}
        <section className="panel inbox-detail" aria-label="会话详情">
          {!t ? (
            <Empty title={platformThreads.length ? '选择一个会话' : '还没有会话'}
              sub={platformThreads.length ? '从会话列表查看消息和回复草稿。' : (platform === 'xiaohongshu' ? '小红书会话读取已停用。请在官方平台查看和发送消息。' : '点击上方「连接并同步官方会话」开始读取。')}
              action={!platformThreads.length && <button className="btn" onClick={() => navigate('settings')}>管理平台连接</button>}/>
          ) : (
            <>
              <h2>{t.name}</h2>
              <p className="field-hint">
                {platformNames[t.platform]} · 会话所属账号：{t.accountName} · 会话标识：{t.nativeId}
              </p>
              <p className="field-hint">
                最近同步：{t.syncedAt ? new Date(t.syncedAt).toLocaleString() : '尚未同步'}
                。页面仅展示官方已加载的消息；时间保留平台原文，不能据此证明完整历史。
              </p>
              {t.error && (
                <p className="inline-error">同步已暂停：{t.error}。处理后点击刷新消息。</p>
              )}
              {t.suggestionGenerating && <Busy text="模型正在生成待审回复，完成后自动显示" />}
              <fieldset disabled={busy} style={{ border: 0, padding: 0 }}>
                <button
                  className="btn small"
                  disabled={t.platform === 'xiaohongshu'}
                  onClick={() =>
                    void action(() => api(`/inbox/${t.platform}/sync`, { threadId: t.id }))
                  }
                >
                  刷新消息 / 恢复同步
                </button>
                <label className="field-hint">
                  <input
                    type="checkbox"
                    checked={t.stopped}
                    onChange={(e) => void configure({ stopped: e.target.checked })}
                  />
                  停止联系（停止生成建议）
                </label>
                <label>
                  关联原评论{' '}
                  <select
                    aria-label="关联私信线索"
                    value={t.leadId || ''}
                    onChange={(e) => void configure({ leadId: e.target.value })}
                  >
                    <option value="">无关联原评论，按实际聊天处理</option>
                    {related.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.content.slice(0, 70)}
                      </option>
                    ))}
                  </select>
                </label>
              </fieldset>
              {t.leadId && (
                <p className="field-hint">
                  原评论：{data.leads.find((l) => l.id === t.leadId)?.content}
                </p>
              )}
              <div className="inbox-messages" aria-label="真实私信消息">
                {t.messages.map((m) => (
                  <div key={m.nativeId} className={`inbox-message ${m.direction}`}>
                    <small>
                      {m.direction === 'incoming' ? t.name : '我'} · {m.timeLabel}
                    </small>
                    <p>
                      {m.text ||
                        (m.kind === 'attachment' ? '[附件：请在官方平台查看]' : '[非文本消息]')}
                    </p>
                  </div>
                ))}
                {!t.messages.length && <p className="muted">尚无已加载消息。</p>}
              </div>
              <div className="inbox-composer">
                <h3>待审回复</h3>
                {t.suggestionError && (
                  <p className="inline-error">
                    模型建议未生成：{t.suggestionError}。消息同步仍保留；可处理后手动生成。
                  </p>
                )}
                <p className="field-hint">
                  模型仅提供建议，不代表对方有购买意向。点击生成会把脱敏后的最近20条文本和关联原评论发送至你配置的模型服务；历史消息不会自动批量处理。
                </p>
                <button
                  className="btn"
                  disabled={busy || t.stopped || t.suggestionGenerating}
                  onClick={() =>
                    void action(() =>
                      api(`/inbox/threads/${t.id}/suggest`, { confirmContextToModel: true }),
                    )
                  }
                >
                  用模型生成回复建议
                </button>
                <label className="field-hint">
                  人工编写或修改后另存为新草稿
                  <textarea
                    aria-label="私信草稿"
                    rows={4}
                    maxLength={1000}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    disabled={busy || t.stopped}
                  />
                </label>
                <button
                  className="btn"
                  disabled={busy || !text.trim() || t.stopped}
                  onClick={() =>
                    void action(async () => {
                      await api(`/inbox/threads/${t.id}/drafts`, { revision: t.revision, text });
                      setText('');
                    })
                  }
                >
                  保存待审草稿
                </button>
                {drafts
                  .filter((d) => d.threadId === t.id)
                  .slice(0, 8)
                  .map((d) => (
                    <article className="inbox-draft" key={d.id}>
                      <small>
                        {d.status === 'pending'
                          ? '待人工确认'
                          : d.status === 'stale'
                            ? '上下文已变化，请重新生成或保存'
                            : d.status === 'sent'
                              ? '已取得平台发送回执'
                              : d.status === 'unknown'
                                ? '发送状态待核对，禁止自动重发'
                                : '提交中'}
                      </small>
                      <p style={{ whiteSpace: 'pre-wrap' }}>{d.text}</p>
                      <p className="field-hint">依据：{d.rationale.replace('；尚未发送', '')}</p>
                      <button className="btn small" onClick={() => setText(d.text)} disabled={busy}>
                        编辑为新草稿
                      </button>{' '}
                      <button
                        className="btn primary"
                        disabled={busy || t.stopped || d.status !== 'pending'}
                        onClick={() =>
                          void navigator.clipboard.writeText(d.text).then(
                            () => notify('草稿已复制，请到官方平台手动发送'),
                            () => notify('复制失败，请手动选择文本复制', true),
                          )
                        }
                      >
                        复制回复草稿
                      </button>
                      {d.status === 'unknown' && (
                        <button
                          className="btn small"
                          disabled={busy}
                          onClick={() =>
                            void action(() => api(`/inbox/drafts/${d.id}/reconcile`, {}))
                          }
                        >
                          刷新官方会话核对结果（不会重发）
                        </button>
                      )}
                    </article>
                  ))}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
