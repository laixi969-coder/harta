import { useEffect, useState } from 'react';
import { Image as ImageIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import { mediaUrl } from '../api';
import { Modal } from './ui';
export function MediaImage({url, alt}: {url: string; alt: string}) {
  const [failed, setFailed] = useState('');
  const src = mediaUrl(url);
  return !src || failed === url ? <div className="media-fallback" role="img" aria-label={`${alt} · 暂无可用图片`}><ImageIcon size={28}/><span>{url ? '图片链接已失效，请重新读取详情' : '暂无封面'}</span></div> : <img src={src} alt={alt} loading="lazy" referrerPolicy="same-origin" onError={() => setFailed(url)}/>;
}
export function MediaGallery({cover, images, title, video}: {cover: string; images: string[]; title: string; video?: string}) {
  const all = [...new Set(images.length ? images : cover ? [cover] : [])];
  const [index, setIndex] = useState(0);
  const [expanded, setExpanded] = useState(false), [zoom, setZoom] = useState(false);
  const [showVideo, setShowVideo] = useState(Boolean(video)), [failedVideo, setFailedVideo] = useState('');
  const current = Math.min(index, Math.max(0, all.length - 1));
  useEffect(() => {
    if (!expanded) return;
    const handler = (e: KeyboardEvent) => {
      if (Array.from(document.querySelectorAll('[role=dialog]')).at(-1)?.getAttribute('aria-label') !== '作品图片预览') return;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {e.preventDefault();setIndex(i => Math.max(0, Math.min(all.length - 1, i + (e.key === 'ArrowLeft' ? -1 : 1))));setZoom(false);}
    };
    document.addEventListener('keydown', handler);return () => document.removeEventListener('keydown', handler);
  }, [expanded, all.length]);
  const select = (i: number) => { setIndex(i); setShowVideo(false); setZoom(false); };
  const controls = <div className="gallery-controls"><button className="icon-btn" aria-label="上一张图片" disabled={current === 0} onClick={() => select(current - 1)}><ChevronLeft/></button><span role="status" aria-live="polite">{current + 1} / {all.length}</span><button className="icon-btn" aria-label="下一张图片" disabled={current === all.length - 1} onClick={() => select(current + 1)}><ChevronRight/></button></div>;
  return <div className="media-gallery">
    {video && <button className="btn small" onClick={() => setShowVideo(!showVideo)}>{showVideo ? '查看图片' : '播放视频'}</button>}
    {video && showVideo ? failedVideo === video ? <div className="video-unavailable"><MediaImage url={cover} alt={title}/><p className="inline-error" role="alert">视频暂不可用，请刷新完整作品或打开原作品。</p><button className="btn small" onClick={() => setFailedVideo('')}>重试视频</button></div> : <video controls playsInline preload="none" poster={mediaUrl(cover)} src={mediaUrl(video)} aria-label={title} onError={() => setFailedVideo(video)}/> : <button className="gallery-open" aria-label={`放大图片 ${current + 1}`} onClick={() => {setExpanded(true);setZoom(false);}}><MediaImage url={all[current] || ''} alt={`${title} · 图片 ${current + 1}`}/><span>点击放大</span></button>}
    {all.length > 1 && <>{controls}<div className="gallery-thumbs">{all.map((url, i) => <button className={!showVideo && i === current ? 'active' : ''} aria-pressed={!showVideo && i === current} aria-label={`查看图片 ${i + 1}`} key={url} onClick={() => select(i)}><MediaImage url={url} alt={`缩略图 ${i + 1}`}/></button>)}</div></>}
    {expanded && <Modal title="作品图片预览" sub={`${title} · ${current + 1} / ${all.length}`} wide onClose={() => setExpanded(false)}><div className="image-preview"><div className={'image-preview-stage' + (zoom ? ' zoomed' : '')}><MediaImage url={all[current] || ''} alt={`${title} · 原图 ${current + 1}`}/></div>{all.length > 1 && controls}<button className="btn" aria-pressed={zoom} onClick={() => setZoom(!zoom)}>{zoom ? '适应窗口' : '放大查看'}</button><p className="field-hint">← → 切换图片 · Esc 返回详情</p></div></Modal>}
  </div>;
}
