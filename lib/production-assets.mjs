import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import JSZip from 'jszip';
import { workspaceId } from './auth.mjs';
import { readWorkspace, writeWorkspace } from './workspace.mjs';
import { postRevision } from './growth-workspace.mjs';
import { productionDocument, productionDraft } from '../js/production-workflow.js';
import { validateImagePageSet, imagePageSetWarning } from '../js/image-pages.js';

const root = email => path.join(process.cwd(),'data','production-media',workspaceId(email));
const uuid = value => typeof value==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
function locate(email,input) {
  if(typeof input.customerId!=='string' || typeof input.packId!=='string' || typeof input.platform!=='string' || !Number.isSafeInteger(input.index) || input.index<0) throw new Error('作品信息不正确');
  const space=readWorkspace(email),c=space.customers.find(c=>c.id===input.customerId),pack=[...(c?.drops||[]),...(c?.packs||[])].find(p=>p.id===input.packId);
  if(!pack || !Array.isArray(pack.shells?.[input.platform]) || !pack.shells[input.platform][input.index]) throw new Error('找不到该业务的作品');
  return {space,pack,key:`${input.platform}|${input.index}`};
}
function bundleFor(email,input) {
  const {pack,key}=locate(email,input),bundle=[pack.productionAssets?.[key],pack.productionAssets?.[`${key}|live`]].find(b=>b?.id===input.bundleId);
  if(!bundle || !uuid(bundle.id) || input.bundleId!==bundle.id) throw new Error('素材包不存在或已更新');
  return bundle;
}
function assetPath(email,bundle,name) {
  if(!uuid(bundle.id) || !/^(cover|page-(0[1-9]|10))\.png$/.test(name)) throw new Error('素材名称不正确');
  return path.join(root(email),bundle.id,name);
}
export async function saveProductionAssets(email,input) {
  if((input.live!==undefined && typeof input.live!=='boolean') || !Number.isSafeInteger(input.version) || !Array.isArray(input.images) || !input.images.length || input.images.length>11) throw new Error('请先保存制作草稿并生成素材');
  const names=input.images.map(x=>x?.name);
  if(names.some(n=>typeof n!=='string' || !/^(cover|page-(0[1-9]|10))\.png$/.test(n)) || new Set(names).size!==names.length) throw new Error('素材名称不正确或重复');
  const pages=names.filter(n=>n.startsWith('page-')).sort();
  if(pages.some((name,i)=>name!==`page-${String(i+1).padStart(2,'0')}.png`))throw new Error('图文页必须从第1页连续排列');
  const live=input.live===true,initial=locate(email,input),assetKey=live?`${initial.key}|live`:initial.key,draft=productionDraft(initial.pack,input.platform,input.index,live);
  const initialBase=initial.pack.productionAssets?.[initial.key],initialBundle=initial.pack.productionAssets?.[assetKey] || (live && initialBase?.format==='live'?initialBase:null);
  const initialBundleId=initialBundle?.id || '';
  if(input.expectedBundleId!==undefined && (typeof input.expectedBundleId!=='string' || input.expectedBundleId!==initialBundleId))throw new Error('素材包已变化，请刷新后重新保存');
  if(!draft || Boolean(draft.live)!==live || draft.version!==input.version)throw new Error('制作草稿已变化，请刷新后重新保存素材');
  if(draft.sourceRevision!==postRevision(initial.pack,input.platform,input.index))throw new Error('原稿已变化，请先核对并重新保存制作草稿');
  if(pages.length && (draft.live || draft.format!=='image'))throw new Error('图文素材需要已保存的图文制作草稿');
  if(pages.length)validateImagePageSet(draft.fields?.shots,pages);
  let total=0;const decoded=[];
  for(const image of input.images){
    if(typeof image.data!=='string' || image.data.length>6*1024*1024 || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(image.data))throw new Error('素材必须是有效的 PNG 图片');
    const bytes=Buffer.from(image.data.slice('data:image/png;base64,'.length),'base64'); total+=bytes.length;
    if(bytes.length>4*1024*1024 || total>16*1024*1024)throw new Error('单张素材最多4MB，素材包最多16MB');
    let meta;try{meta=await sharp(bytes,{limitInputPixels:2_000_000}).metadata();}catch{throw new Error('素材图片无法读取');}
    if(meta.format!=='png' || meta.width!==900 || meta.height!==1200 || meta.pages>1)throw new Error('素材必须是 900×1200 的 PNG 图片');
    let normalized;try{normalized=await sharp(bytes,{limitInputPixels:2_000_000}).png().toBuffer();}catch{throw new Error('素材图片无法读取');}
    if(normalized.length>4*1024*1024)throw new Error('单张素材最多4MB');
    decoded.push({name:image.name,bytes:normalized});
  }
  // Image decoding is asynchronous; reload to avoid overwriting intervening edits.
  const latest=locate(email,input),current=productionDraft(latest.pack,input.platform,input.index,live);
  if(!current || Boolean(current.live)!==live || current.version!==input.version || current.sourceRevision!==postRevision(latest.pack,input.platform,input.index))throw new Error('制作草稿或原稿已变化，请重新保存素材');
  const id=crypto.randomUUID(),dir=path.join(root(email),id),base=latest.pack.productionAssets?.[latest.key],existing=latest.pack.productionAssets?.[assetKey] || (live && base?.format==='live'?base:null),old=!live && existing?.format==='live'?null:existing;
  if(!live && existing?.format==='live' && latest.pack.productionAssets?.[`${latest.key}|live`] && latest.pack.productionAssets[`${latest.key}|live`].id!==existing.id)throw new Error('历史直播素材存在冲突，请先核对');
  if((existing?.id || '')!==initialBundleId)throw new Error('素材包已变化，请刷新后重新保存');
  // Preserve the untouched category only for the exact same draft version.
  // A supplied page set replaces all pages, allowing the new set to shrink.
  if(old && old.version===current.version && old.format===current.format){
    const keepCover=!names.includes('cover.png'),keepPages=pages.length===0;
    for(const image of old.images || []){
      if(!((image.name==='cover.png' && keepCover) || (image.name.startsWith('page-') && keepPages)))continue;
      let bytes;try{bytes=fs.readFileSync(assetPath(email,old,image.name));}catch{throw new Error('原素材无法读取，请重新生成后保存');}
      decoded.push({name:image.name,bytes});
    }
  }
  if(decoded.reduce((n,image)=>n+image.bytes.length,0)>16*1024*1024)throw new Error('素材包最多16MB，请减少素材后重试');
  decoded.sort((a,b)=>a.name.localeCompare(b.name));
  const bundle={id,version:current.version,createdAt:new Date().toISOString(),format:current.live?'live':current.format,fields:{...current.fields},images:decoded.map(x=>({name:x.name,size:x.bytes.length}))};
  fs.mkdirSync(dir,{recursive:true,mode:0o700});
  try {for(const image of decoded)fs.writeFileSync(path.join(dir,image.name),image.bytes,{mode:0o600,flag:'wx'});latest.pack.productionAssets ||= {};if(!live && existing?.format==='live')latest.pack.productionAssets[`${latest.key}|live`]=existing;if(live && base?.format==='live' && base.id===existing?.id)delete latest.pack.productionAssets[latest.key];latest.pack.productionAssets[assetKey]=bundle;writeWorkspace(email,latest.space);}catch(e){fs.rmSync(dir,{recursive:true,force:true});throw e;}
  if(old && uuid(old.id) && old.id!==id && !Object.values(latest.pack.productionAssets||{}).some(bundle=>bundle?.id===old.id))fs.rmSync(path.join(root(email),old.id),{recursive:true,force:true});
  return latest.space;
}
export function readProductionAsset(email,input) {
  const bundle=bundleFor(email,input);
  if(!bundle.images?.some(image=>image.name===input.name))throw new Error('找不到素材');
  return fs.readFileSync(assetPath(email,bundle,input.name));
}
export async function exportProductionAssets(email,input) {
  const bundle=bundleFor(email,input),zip=new JSZip();
  const body=productionDocument(bundle.fields,bundle.format,input.platform);
  const warning=bundle.format==='image'?imagePageSetWarning(bundle.fields?.shots,(bundle.images||[]).map(i=>i.name).filter(n=>n.startsWith('page-'))):'';
  zip.file('脚本与制作说明.txt',`保存时间：${bundle.createdAt}\n制作草稿版本：${bundle.version}${warning?`\n${warning}`:''}\n\n${body}`);
  for(const image of bundle.images)zip.file(image.name,fs.readFileSync(assetPath(email,bundle,image.name)));
  return zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'});
}
