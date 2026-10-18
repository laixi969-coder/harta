import { useEffect, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';

export function useMobileNavigation() {
  const [mobile, setMobile] = useState(() => window.matchMedia('(max-width: 860px)').matches);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 860px)');
    const changed = () => setMobile(media.matches);
    media.addEventListener('change', changed);
    return () => media.removeEventListener('change', changed);
  }, []);
  return mobile;
}

export function NavigationDialog({ open, onClose, children }: {
  open: boolean; onClose: () => void; children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (open) el?.showModal();
    else el?.close();
  }, [open]);
  return <dialog id="openfind-navigation" className="ui-navigation-dialog" ref={ref}
    aria-label="获客工作区导航"
    onKeyDown={(e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); }
    }}
    onCancel={(e) => { e.preventDefault(); e.stopPropagation(); onClose(); }}
    onClose={onClose}
    onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <header className="ui-navigation-heading"><strong>Harta</strong>
      <button type="button" className="icon-btn" aria-label="关闭导航" autoFocus onClick={onClose}><X size={20}/></button>
    </header>
    {children}
  </dialog>;
}
