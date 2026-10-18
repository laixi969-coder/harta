import { WorkSource } from './WorkSource';
import { commentJob, scopedComments, withinCommentWindow, type CommentScope } from '../comment-scope';
import { hartaHandoff } from '../api';
import { SalesWorkbench, SalesMetrics } from './SalesWorkbench';
import { AssessmentDetails } from './AssessmentDetails';
import { useState, useMemo, useEffect } from 'react';
import {
  MessageSquareText,
  Users,
  Search,
  Download,
  ArrowRight,
  Filter,
  Terminal,
  List,
  Square,
  ExternalLink,
  Copy,
  Check,
  Flame,
  UserPlus,
  ChevronRight,
  Save,
  MapPin,
  ClipboardList,
} from 'lucide-react';
import type { Comment, Lead, Job } from '../../shared/types';
import { api, exportUrl, downloadExport } from '../api';
import { useWorkspace } from '../context';
import { PageHeading, Empty, SourceTag, Modal, Busy } from './ui';
import { assessComment } from '../../server/domain';
export function Comments() {
  const { data, refresh, notify, navigate, commentNoteId, setCommentNoteId } = useWorkspace();
  const jobs = data.jobs.filter((j) => j.type === 'comments');
  const initialJob = jobs.find((j) => j.noteId === commentNoteId) || jobs[0];
  const [noteId, setNoteId] = useState(
      commentNoteId || initialJob?.noteId || data.notes[0]?.id || '',
    ),
    [jobId, setJobId] = useState(''),
    [scope, setScope] = useState<CommentScope>('note'),
    [limit, setLimit] = useState(60),
    [interval, setInterval] = useState(data.settings.mode === 'live' ? 250 : 1000),
    [query, setQuery] = useState(''),
    [days, setDays] = useState(data.settings.mode === 'live' ? '7' : 'all'),
    [kind, setKind] = useState(data.settings.mode === 'live' ? 'intent' : 'all'),
    [view, setView] = useState('terminal'),
    [selected, setSelected] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [focused, setFocused] = useState<Comment | null>(null);
  const job = commentJob(jobs, noteId, jobId);
  const target = data.notes.find((n) => n.id === noteId);
  useEffect(() => {
    if (commentNoteId) {
      setNoteId(commentNoteId);
      setJobId('');
    }
  }, [commentNoteId]);
  useEffect(() => {
    setSelected([]);
  }, [noteId, scope, jobId, kind, days, query]);
  const comments = useMemo(
    () => scopedComments(data.comments, noteId, scope, job),
    [data.comments, noteId, scope, job],
  );
  const assessment = (c: Comment) => ({
    ...assessComment(
      c,
      data.notes.find((n) => n.id === c.noteId),
      Date.now(),
      data.comments,
    ),
    semantic: c.semantic,
  });
  function chooseNote(id: string) {
    setNoteId(id);
    setCommentNoteId(id);
    setJobId('');
    setScope('note');
  }
  const shown = comments
    .filter(
      (c) =>
        (kind === 'all' ||
          (kind === 'root' && !c.parentId) ||
          (kind === 'reply' && !!c.parentId) ||
          (kind === 'intent' && assessment(c).recommended)) &&
        withinCommentWindow(c.createdAt, days) &&
        (!query ||
          [c.author, c.body, c.region].join(' ').toLowerCase().includes(query.toLowerCase())),
    )
    .sort(
      (a, b) =>
        assessment(b).score - assessment(a).score || b.createdAt.localeCompare(a.createdAt),
    );
  async function start() {
    if (!noteId) return;
    setBusy(true);
    try {
      const j = await api<Job>('/comments/collect', { noteId, limit, interval });
      setCommentNoteId(j.noteId!);
      setJobId(j.id);
      setScope('job');
      setSelected([]);
      await refresh();
      notify('评论采集已开始');
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  async function saveLeads(ids: string[]) {
    if (!ids.length) {
      notify('请先选择评论', true);
      return;
    }
    try {
      const r = await api<{ added: number; restricted?: number }>('/leads/collect', {
        commentIds: ids,
      });
      await refresh();
      notify(
        r.restricted
          ? `已保存 ${r.added} 条；${r.restricted} 条涉及敏感主题，不建立个人营销画像`
          : r.added
            ? `已保存 ${r.added} 位客户，重复客户已去重`
            : '所选客户已在线索库中',
      );
      setSelected([]);
    } catch (e) {
      notify((e as Error).message, true);
    }
  }
  async function stop() {
    try {
      await api(`/jobs/${job?.id}/stop`, {});
      await refresh();
    } catch (e) {
      notify((e as Error).message, true);
    }
  }
  function toggle(id: string) {
    setSelected((v) => (v.includes(id) ? v.filter((x) => x !== id) : [...v, id]));
  }
  return (
    <>
      <PageHeading
        title="评论采集"
        action={
          <button className="btn" onClick={() => navigate('leads')}>
            <Users size={15} />
            客户线索
            <ArrowRight size={14} />
          </button>
        }
      />
      <div className="discover-layout">
        <section className="panel search-panel">
          <div className="section-title">
            <MessageSquareText size={17} />
            <h2>采集设置</h2>
          </div>
          <label className="field-label" htmlFor="comment-note">
            目标作品
          </label>
          <select id="comment-note" value={noteId} onChange={(e) => chooseNote(e.target.value)}>
            {data.notes.map((n) => (
              <option value={n.id} key={n.id}>
                {n.title}
              </option>
            ))}
          </select>
          <details className="workflow-details"><summary>作品 ID</summary>
          <label className="field-label" htmlFor="comment-note-id">
            笔记 ID
          </label>
          <input
            id="comment-note-id"
            value={noteId}
            onChange={(e) => chooseNote(e.target.value)}
            placeholder="已采集作品的笔记 ID"
          /></details>
          <div className="field-row">
            <div>
              <label className="field-label" htmlFor="comment-limit">
                评论上限
              </label>
              <input
                id="comment-limit"
                type="number"
                min={data.settings.mode === 'live' ? 1 : 0}
                max={data.settings.mode === 'live' ? 100 : 500}
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
              />
            </div>
            <div>
              <label className="field-label" htmlFor="comment-interval">
                请求间隔
              </label>
              <select
                id="comment-interval"
                value={interval}
                onChange={(e) => setInterval(Number(e.target.value))}
              >
                {data.settings.mode === 'live' ? (
                  <>
                    <option value="250">遵循平台采集配置</option>
                    <option value="15000">至少 15 秒</option>
                    <option value="30000">30 秒</option>
                    <option value="60000">60 秒</option>
                  </>
                ) : (
                  <>
                    <option value="1000">1000 ms</option>
                    <option value="2000">2000 ms</option>
                    <option value="3000">3000 ms</option>
                  </>
                )}
              </select>
            </div>
          </div>
          <WorkSource key={noteId} note={target} />
          <div className="search-actions">
            <button
              className="btn primary"
              disabled={busy || data.jobs.some((j) => j.status === 'running') || !noteId}
              onClick={() => void start()}
            >
              {busy ? (
                <Busy />
              ) : (
                <>
                  <MessageSquareText size={15} />
                  开始采集
                </>
              )}
            </button>
            <button
              className="stop-btn"
              aria-label="停止评论采集"
              disabled={job?.status !== 'running'}
              onClick={() => void stop()}
            >
              <Square size={14} />
            </button>
          </div>
          {job?.source === 'demo' && <p className="field-hint">演示评论</p>}
        </section>
        <section className="results-panel">
          {job && (
            <section className="panel comment-task-status" aria-label="评论采集状态">
              <b>
                {job.status === 'running'
                  ? '正在采集真实评论'
                  : job.status === 'failed'
                    ? '本次采集未完成'
                    : job.status === 'stopped'
                      ? '采集已停止'
                      : '本次采集已完成'}{' '}
                · {job.count} 条
              </b>
              {job.error && (
                <p className="inline-error" role="alert">
                  {job.error}
                </p>
              )}
              {job.status === 'failed' && (
                <div className="modal-action-row">
                  <button className="btn small" onClick={() => setScope('note')}>
                    查看这条作品已保存评论
                  </button>
                  <button className="btn small" onClick={() => navigate('settings')}>
                    打开平台登录与验证
                  </button>
                </div>
              )}
              <details>
                <summary>采集详情</summary>
          <div className="result-stats four">
            <div>
              <span>一级评论</span>
              <strong>{comments.filter((c) => !c.parentId).length}</strong>

            </div>
            <div>
              <span>楼中楼回复</span>
              <strong>{comments.filter((c) => c.parentId).length}</strong>

            </div>
            <div>
              <span>已采页数</span>
              <strong>{job?.pages || 0}</strong>
              <em>
                {job?.status === 'running'
                  ? '正在采集'
                  : job?.status === 'failed'
                    ? '任务失败，已保留旧数据'
                    : job?.status === 'stopped'
                      ? '采集已停止'
                      : job
                        ? '任务已保存'
                        : '尚无采集任务'}
              </em>
            </div>
            <div>
              <span>运行时间</span>
              <strong>
                {job?.elapsed || 0}
                <small>秒</small>
              </strong>
              <em>{job?.source === 'live' ? '真实数据' : '演示数据'}</em>
            </div>
          </div>

                {job.logs.slice(-10).map((log, i) => (
                  <p key={i}>
                    {new Date(log.at).toLocaleTimeString()} · {log.message}
                  </p>
                ))}
              </details>
            </section>
          )}
          <div className="panel results-box">
            <div className="comment-scope-controls">
              <label>
                评论范围
                <select
                  aria-label="评论范围"
                  value={scope}
                  onChange={(e) => setScope(e.target.value as CommentScope)}
                >
                  <option value="note">目标作品全部已保存评论</option>
                  <option value="job">选定采集任务</option>
                  <option value="all">当前业务全部已保存评论</option>
                </select>
              </label>
              {scope === 'job' && (
                <label>
                  采集任务
                  <select
                    aria-label="采集任务"
                    value={job?.id || ''}
                    onChange={(e) => setJobId(e.target.value)}
                  >
                    <option value="" disabled>
                      暂无采集任务
                    </option>
                    {jobs
                      .filter((j) => j.noteId === noteId)
                      .map((j) => (
                        <option key={j.id} value={j.id}>
                          {new Date(j.createdAt).toLocaleString()} · {j.count} 条 · {j.status}
                        </option>
                      ))}
                  </select>
                </label>
              )}
              <p role="status">
                已保存 {comments.length} 条 · 筛选显示 {shown.length} 条
                {scope === 'all' ? ' · 当前业务' : ` · ${target?.title || noteId}`}
              </p>
            </div>
            <div className="results-heading">
              <div>
                <h2>
                  评论与需求<span>{comments.length}</span>
                </h2>
                <p>
                  {scope === 'all'
                    ? '当前业务全部已保存评论'
                    : target?.title || '选择作品，开始第一次采集'}
                </p>
              </div>
              <a
                className="btn small"
                href={exportUrl(
                  'comments',
                  'csv',
                  shown.map((c) => c.id),
                )}
                onClick={(e) => {
                  if (!shown.length) {
                    e.preventDefault();
                    notify('当前没有可导出的评论', true);
                  } else {
                    e.preventDefault();
                    void downloadExport(
                      'comments',
                      'csv',
                      shown.map((c) => c.id),
                    ).catch((e) => notify((e as Error).message, true));
                  }
                }}
              >
                <Download size={14} />
                导出 CSV
              </a>
            </div>
            <div className="results-toolbar">
              <div className="filter-tabs">
                {[
                  ['all', '全部'],
                  ['root', '一级评论'],
                  ['reply', '楼中楼'],
                  ['intent', '高意向'],
                ].map(([id, t]) => (
                  <button
                    key={id}
                    className={kind === id ? 'active' : ''}
                    onClick={() => setKind(id)}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <label className="field-label">
                评论时间
                <select
                  aria-label="评论时间"
                  value={days}
                  onChange={(e) => setDays(e.target.value)}
                >
                  {[
                    ['all', '全部时间'],
                    ['3', '近3天'],
                    ['7', '近7天'],
                    ['30', '近30天'],
                    ['90', '近90天'],
                  ].map(([v, t]) => (
                    <option key={v} value={v}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
              <div className="display-switch">
                <button
                  className={view === 'terminal' ? 'active' : ''}
                  aria-label="实时终端"
                  onClick={() => setView('terminal')}
                >
                  <Terminal size={15} />
                </button>
                <button
                  className={view === 'table' ? 'active' : ''}
                  aria-label="表格视图"
                  onClick={() => setView('table')}
                >
                  <List size={16} />
                </button>
              </div>
            </div>
            <div className="result-filters">
              <div className="input-with-icon">
                <Search size={14} />
                <input
                  aria-label="搜索评论"
                  placeholder="搜索昵称、评论内容、IP 属地"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <button
                className="btn small"
                onClick={() =>
                  void saveLeads(
                    shown.filter((c) => assessment(c).recommended).map((c) => c.id),
                  )
                }
              >
                <UserPlus size={14} />
                保存高意向客户
              </button>
            </div>
            <div className="live-bar">
              <span>
                <i /> {job?.status === 'running' ? 'LIVE' : 'SAVED'}
              </span>
              <b>
                {job?.status === 'running' ? 'CAPTURING' : 'COMMENTS'}
                <span>· {shown.length} CAPTURED</span>
              </b>
              <SourceTag source={job?.source || target?.source || 'live'} />
              <span className="live-bar-right">ROOT + REPLY</span>
            </div>
            {shown.length ? (
              <div className={view === 'terminal' ? 'comments-terminal' : 'comments-table'}>
                <div className="comment-table-head">
                  <label>
                    <input
                      type="checkbox"
                      aria-label="选择当前所有评论"
                      checked={shown.length > 0 && shown.every((c) => selected.includes(c.id))}
                      onChange={(e) =>
                        setSelected(e.target.checked ? shown.map((c) => c.id) : [])
                      }
                    />
                  </label>
                  <span>类型 / 时间</span>
                  <span>用户</span>
                  <span>IP 属地</span>
                  <span>评论内容</span>
                  <span>意向</span>
                </div>
                {shown.map((c, i) => (
                  <div
                    key={c.id}
                    className={`comment-row ${c.parentId ? 'is-reply' : ''} ${selected.includes(c.id) ? 'is-selected' : ''}`}
                  >
                    <label>
                      <input
                        type="checkbox"
                        aria-label={`选择评论 ${i + 1}`}
                        checked={selected.includes(c.id)}
                        onChange={() => toggle(c.id)}
                      />
                    </label>
                    <span className="comment-type">
                      <b className={c.parentId ? 'reply' : 'root'}>
                        [{c.parentId ? 'REPLY' : 'ROOT'}]
                      </b>
                      <time>
                        {new Date(c.createdAt).toLocaleString('zh-CN', { hour12: false })}
                      </time>
                    </span>
                    <button className="comment-user" onClick={() => setFocused(c)}>
                      {c.author}
                    </button>
                    <span className="comment-region">{c.region || '未知'}</span>
                    <button className="comment-content" onClick={() => setFocused(c)}>
                      {c.parentId && <span className="reply-arrow">↳ </span>}
                      {c.body || '无文字评论'}
                    </button>
                    <span className={`intent-mini ${assessment(c).score >= 50 ? 'high' : ''}`}>
                      {assessment(c).score}
                    </span>
                  </div>
                ))}
                <div className="comment-end">
                  <Check size={12} />
                  {job?.status === 'running' ? '实时接收中…' : '已到达本次采集末尾'}
                </div>
              </div>
            ) : (
              <Empty
                title={comments.length ? '当前筛选下暂无候选线索' : '听见客户的第一句话'}
                sub={
                  comments.length
                    ? `已采集 ${comments.length} 条评论，尚未匹配当前时间或意向条件；可查看全部评论，不代表采集失败。`
                    : '从左侧选择作品，采集评论后即可查看用户需求。'
                }
                action={
                  <button
                    className="btn"
                    onClick={() =>
                      comments.length
                        ? (setDays('all'), setKind('all'), setQuery(''))
                        : navigate('discover')
                    }
                  >
                    {comments.length ? '查看全部评论' : '去发现作品'}
                    <ArrowRight size={14} />
                  </button>
                }
              />
            )}
          </div>
          {selected.length > 0 && (
            <div className="inline-selection">
              <span>已选 {selected.length} 条评论</span>
              <button className="text-btn" onClick={() => setSelected([])}>
                清空
              </button>
              <button className="btn primary small" onClick={() => void saveLeads(selected)}>
                <UserPlus size={14} />
                保存到客户线索
              </button>
            </div>
          )}
        </section>
      </div>
      {focused && (
        <Modal title="评论与客户信息" onClose={() => setFocused(null)}>
          <div className="modal-body">
            <div className="customer-profile">
              <span className="profile-avatar">{focused.author.slice(0, 1)}</span>
              <div>
                <h3>{focused.author}</h3>
                <p>
                  <MapPin size={13} />
                  {focused.region} <SourceTag source={focused.source} />
                </p>
              </div>
            </div>
            <blockquote>{focused.body}</blockquote>
            <WorkSource
              key={focused.noteId}
              note={data.notes.find((n) => n.id === focused.noteId)}
            />
            {focused.parentId && (
              <p className="field-hint">
                回复所属评论：
                {data.comments.find((c) => c.id === focused.parentId)?.body || focused.parentId}
              </p>
            )}
            <p className="field-hint">评论时间：{focused.createdAt ? new Date(focused.createdAt).toLocaleString('zh-CN') : '未知'} · 意向 {assessment(focused).score}</p>
            <AssessmentDetails assessment={assessment(focused)} />
            <div className="modal-action-row">
              <button
                className="btn"
                onClick={() =>
                  void hartaHandoff(focused.noteId, focused.id).catch((e) =>
                    notify(e.message, true),
                  )
                }
              >
                在 Harta 核实并跟进
              </button>
              <button
                className="btn"
                onClick={() => {
                  void navigator.clipboard.writeText(focused.body).then(
                    () => notify('评论已复制'),
                    () => notify('复制失败，请手动选择文本', true),
                  );
                }}
              >
                <Copy size={14} />
                复制评论
              </button>
              <button
                className="btn primary"
                disabled={assessment(focused).stage === 'restricted'}
                onClick={() => void saveLeads([focused.id])}
              >
                <UserPlus size={14} />
                保存客户线索
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
export function Leads() {
  const { data, refresh, notify, navigate } = useWorkspace();
  const [query, setQuery] = useState(''),
    [status, setStatus] = useState('all'),
    [platform, setPlatform] = useState('all'),
    [focused, setFocused] = useState<Lead | null>(null),
    [memo, setMemo] = useState(''),
    [outreach, setOutreach] = useState(''),
    [saving, setSaving] = useState(false),
    [salesRevision, setSalesRevision] = useState(0),
    [salesDirty, setSalesDirty] = useState(false),
    [closeRequested, setCloseRequested] = useState(false);
  const leads = data.leads
    .filter(
      (l) =>
        (status === 'all' || l.status === status) &&
        (platform === 'all' || (l.platform || 'xiaohongshu') === platform) &&
        [l.name, l.region, l.content, l.memo]
          .join(' ')
          .toLowerCase()
          .includes(query.trim().toLowerCase()),
    )
    .sort((a, b) => b.score - a.score);
  useEffect(() => {
    const requested = new URLSearchParams(location.search).get('lead');
    const lead = data.leads.find((l) => l.id === requested);
    if (lead) open(lead);
  }, []);
  const labels = {
    new: '待跟进',
    contacted: '已联系',
    qualified: '需求已确认',
    archived: '已归档',
  };
  async function update(id: string, patch: Partial<Lead>) {
    setSaving(true);
    try {
      await api(`/leads/${encodeURIComponent(id)}`, patch, 'PATCH');
      await refresh();
      setFocused((current) => (current?.id === id ? { ...current, ...patch } : current));
      notify('客户信息已更新');
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setSaving(false);
    }
  }
  function open(l: Lead) {
    setSalesDirty(false);
    setCloseRequested(false);
    setFocused(l);
    setMemo(l.memo);
    setOutreach(l.outreach);
  }
  return (
    <>
      <PageHeading
        title="客户线索"
        action={
          <a
            className="btn"
            href={exportUrl('leads', 'csv')}
            onClick={(e) => {
              e.preventDefault();
              void downloadExport(
                'leads',
                'csv',
                leads.map((l) => l.id),
              ).catch((e) => notify(e.message, true));
            }}
          >
            <Download size={15} />
            导出筛选结果
          </a>
        }
      />
      <div className="lead-stats">
        {[
          ['全部线索', data.leads.length],
          ['高意向客户', data.leads.filter((l) => l.score >= 50).length],
          ['待跟进', data.leads.filter((l) => l.status === 'new').length],
          ['需求已确认', data.leads.filter((l) => l.status === 'qualified').length],
        ].map(([label, n]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{n}</strong>
          </div>
        ))}
      </div>
      <div className="modal-action-row">
        <button className="btn" onClick={() => navigate('followup')}>
          客户跟进
        </button>
      </div>
      <SalesMetrics
        revision={salesRevision}
        onOpen={(id) => {
          const lead = data.leads.find((l) => l.id === id);
          if (lead) open(lead);
        }}
      />
      <section className="panel results-box">
        <div className="results-heading">
          <div>
            <h2>
              我的客户线索<span>{data.leads.length}</span>
            </h2>
            <p role="status">
              显示 {leads.length} / {data.leads.length} 条
            </p>
          </div>
          <button className="btn primary small" onClick={() => navigate('comments')}>
            <UserPlus size={14} />
            采集新客户
          </button>
        </div>
        <div className="results-toolbar">
          <div className="filter-tabs">
            {[['all', '全部客户'], ...Object.entries(labels)].map(([id, t]) => (
              <button
                key={id}
                className={status === id ? 'active' : ''}
                onClick={() => setStatus(id)}
              >
                {t}
              </button>
            ))}
          </div>
          <label className="field-label">
            平台
            <select
              aria-label="线索平台"
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
            >
              <option value="all">全部平台</option>
              <option value="douyin">抖音</option>
              <option value="xiaohongshu">小红书</option>
            </select>
          </label>
          <div className="input-with-icon">
            <Search size={14} />
            <input
              aria-label="搜索客户"
              placeholder="搜索姓名、地区或需求"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>
        {leads.length ? (
          <div className="table-scroll">
            <table className="lead-table">
              <thead>
                <tr>
                  <th>客户</th>
                  <th>需求与来源</th>
                  <th>意向评分</th>
                  <th>跟进状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((l) => (
                  <tr key={l.id} data-lead-id={l.id}>
                    <td>
                      <div className="customer-cell">
                        <span className="author-avatar color-2">{l.name.slice(0, 1)}</span>
                        <div>
                          <b>{l.name}</b>
                          <small>
                            {l.region} <SourceTag source={l.source} />
                          </small>
                        </div>
                      </div>
                    </td>
                    <td>
                      <p className="lead-content">{l.content}</p>
                      <small className="muted">
                        {data.notes.find((n) => n.id === l.noteId)?.title || l.noteId}
                      </small>
                    </td>
                    <td>
                      <div className={`score ${l.score >= 50 ? 'high' : ''}`}>
                        <Flame size={13} />
                        <b>{l.score}</b>
                      </div>
                      <small className="muted">{l.commentCreatedAt ? new Date(l.commentCreatedAt).toLocaleDateString() : '评论日期未知'}</small>
                    </td>
                    <td>
                      <select
                        aria-label={`${l.name}跟进状态`}
                        value={l.status}
                        disabled={saving}
                        onChange={(e) =>
                          void update(l.id, { status: e.target.value as Lead['status'] })
                        }
                      >
                        {Object.entries(labels).map(([id, t]) => (
                          <option value={id} key={id}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <button className="text-btn" onClick={() => open(l)}>
                        查看与跟进
                        <ChevronRight size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title={
              query || status !== 'all' || platform !== 'all'
                ? '没有符合条件的客户'
                : '你的下一位客户，就在评论里'
            }
            sub="采集作品评论，将有价值的用户保存为线索，再从这里开始跟进。"
            action={
              <button
                className="btn primary"
                onClick={() =>
                  query || status !== 'all' || platform !== 'all'
                    ? (setQuery(''), setStatus('all'), setPlatform('all'))
                    : navigate('comments')
                }
              >
                {query || status !== 'all' || platform !== 'all' ? '清除筛选' : '开始采集'}
                <ArrowRight size={14} />
              </button>
            }
          />
        )}
      </section>
      {focused && (
        <Modal
          title="客户跟进"
          onClose={() =>
            salesDirty || memo !== focused.memo || outreach !== focused.outreach
              ? setCloseRequested(true)
              : setFocused(null)
          }
        >
          <div className="modal-body">
            <div className="customer-profile">
              <span className="profile-avatar">{focused.name.slice(0, 1)}</span>
              <div>
                <h3>{focused.name}</h3>
                <p>
                  {focused.region}
                  <SourceTag source={focused.source} />
                </p>
              </div>
              <span className="score high">意向 {focused.score}</span>
            </div>
            <blockquote>{focused.content}</blockquote>
            <WorkSource
              key={focused.noteId}
              note={data.notes.find((n) => n.id === focused.noteId)}
            />
            <p className="field-hint">评论时间：{focused.commentCreatedAt ? new Date(focused.commentCreatedAt).toLocaleString('zh-CN') : '未知'}</p>
            {focused.assessment ? <AssessmentDetails assessment={focused.assessment} /> : <p>{focused.reason}</p>}
            <SalesWorkbench
              key={focused.id}
              lead={focused}
              note={data.notes.find((n) => n.id === focused.noteId)}
              onDirtyChange={setSalesDirty}
              onChange={() => setSalesRevision((n) => n + 1)}
            />
            <label className="field-label" htmlFor="memo">
              跟进备注
            </label>
            <textarea
              id="memo"
              rows={3}
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              maxLength={3000}
              placeholder="记录需求、沟通时间和下一步…"
            />
            <label className="field-label" htmlFor="outreach">
              沟通话术草稿<span>可编辑</span>
            </label>
            <textarea
              id="outreach"
              rows={4}
              value={outreach}
              onChange={(e) => setOutreach(e.target.value)}
              maxLength={3000}
            />
            <p className="field-hint">话术仅保存在本机。复制后由你在平台中人工沟通。</p>
            <div className="modal-action-row">
              <button
                className="btn"
                onClick={() =>
                  void hartaHandoff(focused.noteId, focused.commentId).catch((e) =>
                    notify(e.message, true),
                  )
                }
              >
                进入 Harta 客户跟进
              </button>
              <button
                className="btn"
                onClick={() =>
                  void navigator.clipboard.writeText(outreach).then(
                    () => notify('话术已复制，可到平台进行沟通'),
                    () => notify('复制失败', true),
                  )
                }
              >
                <Copy size={14} />
                复制话术
              </button>
              <button
                className="btn primary"
                disabled={saving}
                onClick={() => void update(focused.id, { memo, outreach })}
              >
                {saving ? (
                  <Busy />
                ) : (
                  <>
                    <Save size={14} />
                    保存记录
                  </>
                )}
              </button>
            </div>
          </div>
        </Modal>
      )}
      {closeRequested && (
        <Modal
          title="客户跟进尚未保存"
          sub="请继续编辑并保存，或放弃本次未保存的修改。"
          onClose={() => setCloseRequested(false)}
        >
          <div className="modal-body modal-action-row">
            <button className="btn primary" onClick={() => setCloseRequested(false)}>
              继续编辑
            </button>
            <button
              className="btn"
              onClick={() => {
                setCloseRequested(false);
                setFocused(null);
                setSalesDirty(false);
              }}
            >
              放弃本次修改并关闭
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
