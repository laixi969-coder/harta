import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const root=()=>path.join(process.cwd(),'data','hosted-browser');
const error=()=>Object.assign(new Error('找不到你的浏览器连接'),{statusCode:404});
const file=id=>{if(!/^[a-f0-9-]{36}$/.test(id||''))throw error();return path.join(root(),id+'.json');};
function key(){fs.mkdirSync(root(),{recursive:true,mode:0o700});const p=path.join(root(),'key');try{fs.writeFileSync(p,crypto.randomBytes(32),{flag:'wx',mode:0o600});}catch(e){if(e.code!=='EEXIST')throw e;}return fs.readFileSync(p);}
export function saveHosted(row){const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',key(),iv),data=Buffer.concat([c.update(JSON.stringify(row)),c.final()]);const f=file(row.id),temp=f+'.'+crypto.randomUUID()+'.tmp';fs.writeFileSync(temp,JSON.stringify({iv:iv.toString('base64'),tag:c.getAuthTag().toString('base64'),data:data.toString('base64')}),{mode:0o600});fs.renameSync(temp,f);}
export function readHosted(id,email){let row;try{const e=JSON.parse(fs.readFileSync(file(id),'utf8')),d=crypto.createDecipheriv('aes-256-gcm',key(),Buffer.from(e.iv,'base64'));d.setAuthTag(Buffer.from(e.tag,'base64'));row=JSON.parse(Buffer.concat([d.update(Buffer.from(e.data,'base64')),d.final()]).toString());}catch{throw error();}if(email!==undefined&&row.email!==email)throw error();return row;}
export function hostedRows(email){if(!fs.existsSync(root()))return [];return fs.readdirSync(root()).filter(f=>/^[a-f0-9-]{36}\.json$/.test(f)).map(f=>readHosted(f.slice(0,-5))).filter(r=>email===undefined||r.email===email);}
export function publicHosted(r){return {id:r.id,customerId:r.customerId,platform:r.platform,status:r.status,error:r.error||'',name:r.name||'',connectionId:r.connectionId||'',profileUrl:r.profileUrl||'',lastSeenAt:r.lastSeenAt||null,expiresAt:r.expiresAt,executionEnabled:r.executionEnabled===true,capabilities:r.capabilities||{publish:'unverified',comments:'unverified',reply:'unverified',dm:'unverified'}};}
