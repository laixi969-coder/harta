import { useEffect, useRef, type ReactNode } from 'react';
import { X, Loader2, Search, ArrowUpRight } from 'lucide-react';
export function Modal({
  title,
  sub,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  sub?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const invoker = useRef(document.activeElement as HTMLElement | null);
  const pressedOutside = useRef(false);
  useEffect(() => {
    const el = ref.current;
    el?.showModal();
    // Native dialogs handle focus, background inertness and nested previews.
    return () => {
      el?.close();
      if (invoker.current?.isConnected) invoker.current.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog
      className={`modal ui-modal ${wide ? 'wide' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      ref={ref}
      onKeyDown={(e) => {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); }
      }}
      onCancel={(e) => { e.preventDefault(); e.stopPropagation(); onClose(); }}
      onPointerDown={(e) => {
        const box = e.currentTarget.getBoundingClientRect();
        pressedOutside.current = e.target === e.currentTarget &&
          (e.clientX < box.left || e.clientX > box.right || e.clientY < box.top || e.clientY > box.bottom);
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && pressedOutside.current) onClose();
        pressedOutside.current = false;
      }}
    >
      <header className="modal-head">
        <div>
          <h2>{title}</h2>
          {sub && <p>{sub}</p>}
        </div>
        <button type="button" className="icon-btn" aria-label="关闭" autoFocus onClick={onClose}>
          <X size={19} />
        </button>
      </header>
      {children}
    </dialog>
  );
}
export function Empty({ title, sub, action }: { title: string; sub: string; action?: ReactNode }) {
  return (
    <div className="empty-state ui-empty">
      <div className="empty-icon" aria-hidden="true">
        <Search size={28} />
      </div>
      <h3 className="ui-empty-title">{title}</h3>
      <p className="ui-empty-description">{sub}</p>
      {action && <div className="ui-empty-actions">{action}</div>}
    </div>
  );
}
export function Busy({ text = '处理中' }: { text?: string }) {
  return (
    <span className="busy">
      <Loader2 size={16} className="spin" />
      {text}
    </span>
  );
}
export function SourceTag({ source }: { source: 'demo' | 'live' }) {
  return (
    <span className={`source-tag ${source === 'live' ? 'live' : ''}`}>
      {source === 'demo' ? '演示' : '真实'}
    </span>
  );
}
export function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}<span /></div>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}
export function ExternalLink({ url, label }: { url?: string; label: string }) {
  return url && /^https?:\/\//.test(url) ? (
    <a href={url} target="_blank" rel="noreferrer">
      {label}
      <ArrowUpRight size={14} />
    </a>
  ) : (
    <span className="muted">演示内容无原文链接</span>
  );
}
