import { followUpPlan } from '../followup-plan';
import { useEffect, useState } from 'react';
import { api, hartaHandoff, workbenchLocation } from '../api';
import { useWorkspace } from '../context';
import { PageHeading, Empty, Modal } from './ui';
import { SalesWorkbench, SalesMetrics } from './SalesWorkbench';
import { WorkSource, WorkflowSteps } from './WorkSource';
interface Contact {
  id: string;
  name: string;
  commentId: string;
  noteId: string;
  platform: string;
  stage: string;
  stopped: boolean;
  nextAt: string;
  nextStep: string;
  events: { id: string; at: string; note: string; stage: string }[];
}
export function FollowUp() {
  const { data, notify, navigate } = useWorkspace();
  const [selected, setSelected] = useState(
    new URLSearchParams(location.search).get('lead') || data.leads[0]?.id || '',
  );
  const [contacts, setContacts] = useState<Contact[]>([]),
    [contactsLoaded, setContactsLoaded] = useState(false),
    [query, setQuery] = useState(''),
    [revision, setRevision] = useState(0),
    [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    const load = () =>
      void api<Contact[]>('/harta/contacts')
        .then((rows) => {
          if (alive) {
            setContacts(rows);
            setContactsLoaded(true);
            setError('');
          }
        })
        .catch((e) => {
          if (alive) setError(e.message);
        });
    load();
    const timer = setInterval(load, 8000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [revision]);
  const [salesDirty, setSalesDirty] = useState(false),
    [pendingId, setPendingId] = useState('');
  const lead = data.leads.find((l) => l.id === selected);
  const contact = contacts.find(
    (c) => c.commentId === lead?.commentId && c.platform === (lead?.platform || 'xiaohongshu'),
  );
  const uniqueContacts = [...new Map(contacts.map((c) => [c.id, c])).values()];
  const dueCount = uniqueContacts.filter((c) => followUpPlan(c) === 'due').length;
  const open = (id: string) => {
    if (salesDirty && id !== selected) {
      setPendingId(id);
      return;
    }
    setSalesDirty(false);
    setSelected(id);
    history.replaceState(null, '', workbenchLocation({ lead: id }, 'followup'));
  };
  return (
    <>
      <PageHeading
        eyebrow="CUSTOMER FOLLOW-UP"
        title="让需求证据，接上下一步行动。"
        description="保留原评论、人工核实和实际沟通时间线，按约定安排跟进。"
        action={
          <button className="btn" onClick={() => navigate('leads')}>
            返回线索管理
          </button>
        }
      />
      <WorkflowSteps active="followup" />
      {error && (
        <p className="inline-error" role="alert">
          Harta 联系人暂时无法读取：{error}
        </p>
      )}
      <section className="panel native-contact-summary" aria-label="Harta 联系人与计划">
        <h2>Harta 联系人与计划 · {contactsLoaded ? uniqueContacts.length : '读取中'}</h2>
        {contactsLoaded && (
          <p role="status">
            已到跟进时间 {dueCount} 位 · 尚未安排{' '}
            {uniqueContacts.filter((c) => followUpPlan(c) === 'unplanned').length} 位
          </p>
        )}
        <div className="native-contact-grid">
          {uniqueContacts.map((c) => (
            <article key={c.id + ':' + c.commentId}>
              <b>
                {c.name} · {c.stage}
              </b>
              <p>
                <span className={followUpPlan(c) === 'due' ? 'followup-due' : ''}>
                  {followUpPlan(c) === 'stopped'
                    ? '已停止主动跟进'
                    : followUpPlan(c) === 'closed'
                      ? '已成交'
                      : followUpPlan(c) === 'invalid'
                        ? '跟进时间无效，请在 Harta 修正'
                        : c.nextAt
                          ? `${followUpPlan(c) === 'due' ? '已到跟进时间' : '计划'}：${new Date(c.nextAt).toLocaleString()}`
                          : '尚未安排跟进时间'}
                </span>
              </p>
              <p>{c.nextStep || '下一步待核实'}</p>
              <button
                className="text-btn"
                onClick={() =>
                  void hartaHandoff(c.noteId, c.commentId).catch((e) => notify(e.message, true))
                }
              >
                进入 Harta 跟进 · {c.events.length} 条记录
              </button>
            </article>
          ))}
        </div>
        {!contactsLoaded && !error && (
          <p role="status">正在读取 Harta 联系人、核实记录与计划…</p>
        )}
        {contactsLoaded && !contacts.length && (
          <p>完成评论人工核实后，联系人和计划会显示在这里。</p>
        )}
      </section>
      <p className="field-hint">以下统计为 OpenFind 沟通记录；Harta 已有跟进计划显示在上方。</p>
      <SalesMetrics revision={revision} onOpen={open} />
      <div className="followup-layout">
        <aside className="panel followup-list" aria-label="选择跟进线索">
          <label className="field-label">
            筛选姓名或需求
            <input
              aria-label="筛选跟进线索"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          {data.leads
            .filter((l) => [l.name, l.content].join(' ').includes(query.trim()))
            .map((l) => (
              <button
                className={selected === l.id ? 'active' : ''}
                key={l.id}
                onClick={() => open(l.id)}
              >
                <b>{l.name}</b>
                <small>
                  {l.platform === 'douyin' ? '抖音' : '小红书'} ·{' '}
                  {contacts.find((c) => c.commentId === l.commentId)?.stage || '候选待人工核实'}
                </small>
                <span>{l.content}</span>
              </button>
            ))}
        </aside>
        <section className="panel followup-detail" aria-label="客户跟进详情">
          {lead ? (
            <>
              <h2>{lead.name}</h2>
              <blockquote>{lead.content}</blockquote>
              <WorkSource
                key={lead.noteId}
                note={data.notes.find((n) => n.id === lead.noteId)}
              />
              {contact && (
                <details className="workflow-details">
                  <summary>Harta 核实与跟进时间线 · {contact.events.length}</summary>
                  {[...contact.events].reverse().map((e) => (
                    <article className="contact-event" key={e.id}>
                      <b>{e.stage}</b>
                      <time>{new Date(e.at).toLocaleString()}</time>
                      <p>{e.note}</p>
                    </article>
                  ))}
                </details>
              )}
              <SalesWorkbench
                key={lead.id}
                lead={lead}
                note={data.notes.find((n) => n.id === lead.noteId)}
                onDirtyChange={setSalesDirty}
                onChange={() => setRevision((v) => v + 1)}
              />
            </>
          ) : (
            <Empty
              title="选择一条线索开始跟进"
              sub="先保留评论证据，再核实服务地点、需求和时间。"
              action={
                <button className="btn" onClick={() => navigate('comments')}>
                  查看真实评论
                </button>
              }
            />
          )}
        </section>
      </div>
      {pendingId && (
        <Modal
          title="切换客户前保存修改"
          sub="当前销售进展有未保存的修改。"
          onClose={() => setPendingId('')}
        >
          <div className="modal-body modal-action-row">
            <button className="btn primary" onClick={() => setPendingId('')}>
              继续编辑
            </button>
            <button
              className="btn"
              onClick={() => {
                setSalesDirty(false);
                setSelected(pendingId);
                history.replaceState(
                  null,
                  '',
                  workbenchLocation({ lead: pendingId }, 'followup'),
                );
                setPendingId('');
              }}
            >
              放弃本次修改并切换
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
