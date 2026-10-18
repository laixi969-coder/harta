import { useState } from 'react';
import { Image as ImageIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import { mediaUrl } from '../api';
export function MediaImage({url, alt}: {url: string; alt: string}) {
  const [failed, setFailed] = useState('');
  const src = mediaUrl(url);
  return !src || failed === url ? <div className="media-fallback" role="img" aria-label={`${alt} · 暂无可用图片`}><ImageIcon size={28}/><span>{url ? '图片链接已失效，请重新读取详情' : '暂无封面'}</span></div> : <img src={src} alt={alt} loading="lazy" referrerPolicy="same-origin" onError={() => setFailed(url)}/>;
}
export function MediaGallery({cover, images, title, video}: {cover: string; images: string[]; title: string; video?: string}) {
  const all = [...new Set(images.length ? images : cover ? [cover] : [])];
  const [index, setIndex] = useState(0);
  const current = Math.min(index, Math.max(0, all.length - 1));
  return <div className="media-gallery">{video ? <video controls preload="none" poster={mediaUrl(cover)} src={mediaUrl(video)} aria-label={title}/> : <MediaImage url={all[current] || ''} alt={`${title} · 图片 ${current + 1}`}/>} {all.length > 1 && <><div className="gallery-controls"><button className="icon-btn" aria-label="上一张图片" disabled={current === 0} onClick={() => setIndex(current - 1)}><ChevronLeft/></button><span>{current + 1} / {all.length}</span><button className="icon-btn" aria-label="下一张图片" disabled={current === all.length - 1} onClick={() => setIndex(current + 1)}><ChevronRight/></button></div><div className="gallery-thumbs">{all.map((url, i) => <button className={i === current ? 'active' : ''} aria-label={`查看图片 ${i + 1}`} key={url} onClick={() => setIndex(i)}><MediaImage url={url} alt={`缩略图 ${i + 1}`}/></button>)}</div></>}</div>;
}
