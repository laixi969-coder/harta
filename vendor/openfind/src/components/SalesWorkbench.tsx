import { useEffect, useState } from 'react';
import type { Lead, Note } from '../../shared/types';
import {
  communicationPlan,
  emptySalesProfile,
  salesStages,
  type SalesCase,
  type SalesEvent,
  type SalesProfile,
} from '../../shared/sales';
import { api, safeUrl, apiUrl, hartaHandoff, downloadAsset } from '../api';
import { useWorkspace } from '../context';
export function SalesMetrics({
  revision,
  onOpen,
}: {
  revision: number;
  onOpen: (id: string) => void;
}) {
  const [rows, setRows] = useState<
    {
      source: string;
      contacted: number;
      replied: number;
      won: number;
      amount: number;
      due: number;
      followUps: { id: string; name: string; action: string; at: string }[];
    }[]
  >([]);
  const [error, setError] = useState('');
  useEffect(() => {
    void api<typeof rows>('/sales/summary')
      .then((rows) => {
        setRows(rows);
        setError('');
      })
      .catch((e) => setError(e.message));
  }, [revision]);
  return (
    <details className="panel sales-metrics">
      <summary>沟通与成交统计</summary>
      <a
        className="btn small"
        href={apiUrl('/sales/export')}
        download
        onClick={(e) => {
          e.preventDefault();
          void downloadAsset('/sales/export', 'harta-sales-records.json').catch((e) =>
            setError(e.message),
          );
        }}
      >
        导出沟通记录
      </a>
      {error && <p role="alert">{error}</p>}
      {rows.filter((r) => r.source === 'live' || r.contacted || r.replied || r.won || r.due).map((r) => (
        <p key={r.source}>
          <b>{r.source === 'live' ? '真实线索' : '演示线索'}</b> · 已联系 {r.contacted} · 已回复{' '}
          {r.replied} · 已登记成交 {r.won} · 登记金额 ¥{r.amount.toFixed(2)} · 到期跟进 {r.due}
          {r.followUps.map((f) => (
            <button className="btn small" key={f.id} onClick={() => onOpen(f.id)}>
              跟进 {f.name} · {f.action || '核对约定的下一步'}
            </button>
          ))}
        </p>
      ))}
    </details>
  );
}
const profileFields = {
  identity: '业务身份',
  offering: '产品或服务',
  regions: '服务地区',
  priceRange: '真实价格范围',
  value: '这次能提供的具体帮助',
  proof: '可核验案例或产品资料',
} as const;
const eventLabels = {
  outgoing: '实际发出的消息',
  incoming: '客户实际回复',
  note: '内部备注',
  quote: '已提供的方案/报价',
  order: '订单或成交记录',
  optout: '对方拒绝联系',
} as const;
export function SalesWorkbench({
  lead,
  note,
  onChange,
  onDirtyChange,
  showContactLink = true,
}: {
  lead: Lead;
  note?: Note;
  onChange: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  showContactLink?: boolean;
}) {
  const { notify, setUnsaved } = useWorkspace();
  const [record, setRecord] = useState<SalesCase | null>(null),
    [profile, setProfile] = useState<SalesProfile>(emptySalesProfile),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [dirty, setDirty] = useState(false);
  const [kind, setKind] = useState<SalesEvent['kind']>('note'),
    [channel, setChannel] = useState<SalesEvent['channel']>('message'),
    [content, setContent] = useState(''),
    [eventId, setEventId] = useState(() => crypto.randomUUID());
  useEffect(() => {
    let alive = true;
    void Promise.all([
      api<SalesCase>(`/leads/${encodeURIComponent(lead.id)}/sales`),
      api<SalesProfile>('/sales/profile'),
    ])
      .then(([r, p]) => {
        if (alive) {
          setRecord(r);
          setProfile(p);
        }
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [lead.id]);
  useEffect(() => {
    onDirtyChange?.(dirty || Boolean(content.trim()));
    setUnsaved?.('sales-'+lead.id,dirty || Boolean(content.trim()));
  }, [dirty, content, onDirtyChange, setUnsaved, lead.id]);
  useEffect(()=>()=>setUnsaved?.('sales-'+lead.id,false),[lead.id,setUnsaved]);
  const route = `/leads/${encodeURIComponent(lead.id)}/sales`;
  async function act(task: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await task();
      onChange();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const plan = record ? communicationPlan(lead, profile, record) : null;
  function field<K extends keyof SalesCase>(key: K, value: SalesCase[K]) {
    if (record) {
      setRecord({ ...record, [key]: value });
      setDirty(true);
    }
  }
  return (
    <section className="sales-workbench" aria-label="沟通成交工作台">
      <h3>跟进记录</h3>
      <p className="field-hint" role="status">
        {dirty
          ? '有未保存的修改'
          : record
            ? '已保存'
            : '正在读取客户进展'}
      </p>
      {showContactLink && <button
        className="btn small"
        onClick={() =>
          void hartaHandoff(lead.noteId, lead.commentId).catch((e) => notify(e.message, true))
        }
      >
        客户档案
      </button>}
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      <fieldset className="sales-editor" disabled={busy || !record}>
        <details className="workflow-details">
          <summary>真实业务资料 · 生成话术前填写</summary>
          <button
            className="btn"
            onClick={() =>
              void act(async () => {
                const harta = await api<{ profile: SalesProfile }>('/harta/context');
                setProfile((current) => ({
                  ...harta.profile,
                  ...Object.fromEntries(
                    Object.entries(current).filter(([, value]) => value.trim()),
                  ),
                }));
                notify('已带入当前 Harta 业务身份、服务和地区；补齐帮助与价格后保存');
              })
            }
          >
            带入 Harta 业务资料
          </button>
          <div className="sales-fields">
            {Object.entries(profileFields).map(([key, label]) => (
              <label key={key}>
                {label}
                <textarea
                  aria-label={label}
                  rows={2}
                  value={profile[key as keyof SalesProfile]}
                  maxLength={2000}
                  onChange={(e) => setProfile({ ...profile, [key]: e.target.value })}
                />
              </label>
            ))}
          </div>
          <button
            className="btn"
            disabled={busy}
            onClick={() =>
              void act(async () => {
                setProfile(await api<SalesProfile>('/sales/profile', profile, 'PUT'));
                notify('业务资料已保存');
              })
            }
          >
            保存业务资料
          </button>
        </details>
        {!record ? (
          <p>正在加载沟通记录…</p>
        ) : (
          <>
            <details className="sales-plan"><summary>沟通建议与草稿</summary>
              <p>{plan?.goal}</p>
              {plan?.draft && (
                <>
                  <blockquote>{plan.draft}</blockquote>
                  <button
                    className="btn"
                    disabled={busy || dirty}
                    onClick={() =>
                      void navigator.clipboard.writeText(plan.draft).then(
                        () => notify('草稿已复制；复制不代表已发送'),
                        () => setError('复制失败，请手动选择草稿'),
                      )
                    }
                  >
                    复制本次沟通草稿
                  </button>
                </>
              )}
              {note && safeUrl(note.url) && (
                <a className="btn" href={safeUrl(note.url)} target="_blank" rel="noreferrer">
                  打开原作品
                </a>
              )}
              <p className="field-hint">
                请在平台核对原评论后联系。
              </p>
            </details>
            <details className="workflow-details"><summary>更新阶段与计划 · {salesStages[record.stage]}</summary>
            <div className="sales-fields">
              <label>
                销售阶段
                <select
                  aria-label="销售阶段"
                  value={record.stage}
                  disabled={record.stopped}
                  onChange={(e) => field('stage', e.target.value as SalesCase['stage'])}
                >
                  {Object.entries(salesStages).map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              {(
                [
                  'need',
                  'timing',
                  'budget',
                  'objection',
                  'nextAction',
                  'orderReference',
                ] as const
              ).map((key) => (
                <label key={key}>
                  {
                    {
                      need: '客户确认的需求',
                      timing: '行动时间',
                      budget: '预算范围',
                      objection: '主要顾虑',
                      nextAction: '双方约定的下一步',
                      orderReference: '成交凭证说明或订单编号',
                    }[key]
                  }
                  <textarea
                    rows={2}
                    aria-label={
                      {
                        need: '客户确认的需求',
                        timing: '行动时间',
                        budget: '预算范围',
                        objection: '主要顾虑',
                        nextAction: '双方约定的下一步',
                        orderReference: '成交凭证说明或订单编号',
                      }[key]
                    }
                    value={record[key]}
                    maxLength={2000}
                    onChange={(e) => field(key, e.target.value)}
                  />
                </label>
              ))}
              <label>
                下次跟进时间
                <input
                  aria-label="下次跟进时间"
                  type="datetime-local"
                  disabled={record.stopped}
                  value={
                    record.nextFollowUp
                      ? new Date(
                          Date.parse(record.nextFollowUp) -
                            new Date(record.nextFollowUp).getTimezoneOffset() * 60000,
                        )
                          .toISOString()
                          .slice(0, 16)
                      : ''
                  }
                  onChange={(e) =>
                    field(
                      'nextFollowUp',
                      e.target.value ? new Date(e.target.value).toISOString() : '',
                    )
                  }
                />
              </label>
              <label>
                实际成交金额（元）
                <input
                  aria-label="实际成交金额"
                  type="number"
                  min={0}
                  step="0.01"
                  value={record.amount}
                  onChange={(e) => field('amount', Number(e.target.value))}
                />
              </label>
            </div>
            <div className="modal-action-row">
              <button
                className="btn primary"
                disabled={busy || !dirty}
                onClick={() =>
                  void act(async () => {
                    const {
                      id: _,
                      events: __,
                      updatedAt: ___,
                      stopped: ____,
                      relatedLeadId: _____,
                      ...patch
                    } = record;
                    setRecord(await api<SalesCase>(route, patch, 'PUT'));
                    setDirty(false);
                    notify('销售进展已保存');
                  })
                }
              >
                保存销售进展
              </button>
              <button
                className="btn"
                disabled={busy}
                onClick={() =>
                  void act(async () => {
                    setRecord(await api<SalesCase>(route));
                    setDirty(false);
                  })
                }
              >
                重新载入已保存进展
              </button>
            </div>
            </details>
            <h4>添加记录</h4>
            <p className="field-hint">
              仅保存记录，不发送消息。
            </p>
            <div className="field-row">
              <label>
                记录类型
                <select
                  aria-label="沟通记录类型"
                  value={kind}
                  onChange={(e) => setKind(e.target.value as SalesEvent['kind'])}
                >
                  {Object.entries(eventLabels).map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                实际沟通渠道
                <select
                  aria-label="沟通渠道"
                  value={channel}
                  onChange={(e) => setChannel(e.target.value as SalesEvent['channel'])}
                >
                  <option value="message">平台私信</option>
                  <option value="comment">原评论回复</option>
                  <option value="other">其他已获同意的渠道</option>
                </select>
              </label>
            </div>
            <textarea
              aria-label="实际沟通内容"
              rows={3}
              value={content}
              maxLength={3000}
              onChange={(e) => setContent(e.target.value)}
              placeholder={kind === 'note' ? '记录核实结果或下一步' : '填写实际发生的沟通或凭证'}
            />
            <button
              className="btn"
              disabled={
                busy ||
                dirty ||
                !content.trim() ||
                (record.stopped && ['outgoing', 'quote'].includes(kind))
              }
              onClick={() =>
                void act(async () => {
                  setRecord(
                    await api<SalesCase>(route + '/events', {
                      id: eventId,
                      kind,
                      channel,
                      content,
                    }),
                  );
                  setContent('');
                  setEventId(crypto.randomUUID());
                  notify('实际沟通记录已保存');
                })
              }
            >
              登记沟通记录
            </button>
            {record.stopped && (
              <p className="inline-error">对方已拒绝联系：已停止主动跟进并清空跟进时间。</p>
            )}
            <details className="workflow-details"><summary>历史记录 · {record.events.length}</summary><div className="sales-timeline">
              {[...record.events].reverse().map((e) => (
                <article key={e.id}>
                  <b>
                    {eventLabels[e.kind]} ·{' '}
                    {e.channel === 'message'
                      ? '平台私信'
                      : e.channel === 'comment'
                        ? '评论'
                        : '其他渠道'}
                  </b>
                  <small>
                    {e.platformMessage
                      ? `平台时间：${e.platformMessage.timeLabel || '未知'} · 同步于 ${new Date(e.createdAt).toLocaleString()}`
                      : new Date(e.createdAt).toLocaleString()}
                  </small>
                  {e.content.length > 180 ? <details><summary>展开完整记录</summary><p>{e.content}</p></details> : <p>{e.content}</p>}
                </article>
              ))}
            </div></details>
          </>
        )}
      </fieldset>
    </section>
  );
}
