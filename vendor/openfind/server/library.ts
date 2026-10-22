import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { db, get, put, configGet, configSet } from './store.ts';
import type { Note } from '../shared/types.ts';
export const emptyOrganization = { category: '', product: '', stage: 'unprocessed', archived: false, revision: 0 };
export const organizationFor = (id: string) => get<typeof emptyOrganization & {id:string}>('organization',id) || {...emptyOrganization,id};
export const decorateNote = (note: Note): Note => ({...note,organization:organizationFor(note.id)});
const change = z.object({category:z.string().trim().max(80).optional(),product:z.string().trim().max(80).optional(),stage:z.enum(['unprocessed','reference','reviewed']).optional(),archived:z.boolean().optional()}).strict();
const filters = z.object({category:z.string().max(80),product:z.string().max(80),stage:z.string().max(30),archive:z.enum(['active','archived','all']),after:z.string().max(30),before:z.string().max(30),batch:z.string().max(100)}).strict();
const router=Router();
router.get('/library/filter',(_req,res)=>res.json(JSON.parse(configGet('library.filter','null'))));
router.put('/library/filter',(req,res)=>{const value=filters.parse(req.body);configSet('library.filter',JSON.stringify(value));res.json(value);});
router.put('/library/organize',(req,res)=>{
 const input=z.object({items:z.array(z.object({id:z.string().max(200),revision:z.number().int().min(0)})).min(1).max(100),change}).strict().parse(req.body);
 if(new Set(input.items.map(r=>r.id)).size!==input.items.length) return res.status(400).json({error:'请勿重复选择作品'});
 db.exec('BEGIN IMMEDIATE');
 try {
  const before=input.items.map(r=>{if(!get('notes',r.id))throw new Error('作品不存在');const row=organizationFor(r.id);if(row.revision!==r.revision)throw new Error('分类已变化，请刷新后重试');return row;});
  for(const row of before)put('organization',{...row,...input.change,revision:row.revision+1});
  const id=randomUUID();put('libraryChanges',{id,before});db.exec('COMMIT');res.json({undoId:id});
 }catch(e){db.exec('ROLLBACK');res.status(409).json({error:(e as Error).message});}
});
router.post('/library/undo',(req,res)=>{
 const {id}=z.object({id:z.string().uuid()}).parse(req.body);
 const entry=get<{id:string;before:ReturnType<typeof organizationFor>[];undone?:boolean}>('libraryChanges',id);
 if(!entry||entry.undone)return res.status(409).json({error:'此操作已撤销或不存在'});
 db.exec('BEGIN IMMEDIATE');try{
  for(const row of entry.before)if(organizationFor(row.id).revision!==row.revision+1)throw new Error('分类又有修改，不能覆盖后续操作');
  for(const row of entry.before)put('organization',{...row,revision:row.revision+2});
  put('libraryChanges',{...entry,undone:true});db.exec('COMMIT');res.json({ok:true});
 }catch(e){db.exec('ROLLBACK');res.status(409).json({error:(e as Error).message});}
});
export default router;
