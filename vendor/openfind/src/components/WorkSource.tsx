import { useState } from 'react';
import type { Note } from '../../shared/types';
import { useWorkspace, type Page } from '../context';
import { MediaGallery, MediaImage } from './Media';
import { Modal, ExternalLink, SourceTag } from './ui';
export function WorkSource({ note }: { note?: Note }) {
  const [open, setOpen] = useState(false);
  const { clone, collect } = useWorkspace();
  if (!note) return <p className="field-hint">来源作品尚未保存，请先在发现作品中读取详情。</p>;
  return (
    <>
      <article className="work-source">
        <button
          className="work-source-cover"
          aria-label={`查看来源作品：${note.title}`}
          onClick={() => setOpen(true)}
        >
          <MediaImage url={note.cover || note.images[0]} alt={note.title} />
        </button>
        <div>
          <span className="field-hint">
            {note.platform === 'douyin' ? '抖音' : '小红书'} · 来源作品 ·{' '}
            <SourceTag source={note.source} />
          </span>
          <h3>{note.title}</h3>
          <p>
            {note.author} ·{' '}
            {note.type === 'video' ? '视频作品' : `${note.images.length} 张图片`}
          </p>
          <button className="text-btn" onClick={() => setOpen(true)}>
            查看作品详情
          </button>
        </div>
      </article>
      {open && (
        <Modal title="来源作品与上下文" wide onClose={() => setOpen(false)}>
          <div className="modal-body">
            <MediaGallery
              cover={note.cover}
              images={note.images}
              title={note.title}
              video={note.type === 'video' ? note.videoUrl : undefined}
            />
            <h3>{note.title}</h3>
            <p className="source-body">
              {note.body || '当前保存的是摘要，可在发现作品中刷新完整详情。'}
            </p>
            <div className="modal-action-row">
              <ExternalLink url={note.url} label="回查原作品" />
              <button
                className="btn"
                onClick={() => {
                  setOpen(false);
                  void collect(note);
                }}
              >
                采集这条作品的评论
              </button>
              <button
                className="btn primary"
                onClick={() => {
                  setOpen(false);
                  clone(note);
                }}
              >
                引用到内容工作室
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
export function WorkflowSteps({ active }: { active: Page }) {
  const { data, navigate } = useWorkspace();
  return (
    <nav className="workflow-steps" aria-label="获客与创作流程">
      {(
        [
          ['discover', '发现作品', data.notes.length],
          ['comments', '评论采集', data.comments.length],
          ['leads', '线索管理', data.leads.length],
          ['followup', '客户跟进', data.leads.length],
          ['studio', '内容工作室', data.drafts.length],
        ] as const
      ).map(([page, label, count], i) => (
        <button
          key={page}
          className={active === page ? 'active' : ''}
          aria-current={active === page ? 'step' : undefined}
          onClick={() => navigate(page)}
        >
          <small>0{i + 1}</small>
          {label}
          <b>{count}</b>
        </button>
      ))}
    </nav>
  );
}
