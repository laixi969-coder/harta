import crypto from 'node:crypto';
import {readWorkspace,writeWorkspace} from './workspace.mjs';
import {isRealEvidence} from '../js/evidence-kind.js';

export function recordAccountAudience(email,{customerId,accountId,followers,observedAt,source,baseRevision}={}) {
 const space=readWorkspace(email),customer=space.customers.find(c=>c.id===customerId);
 if(!customer)throw new Error('找不到当前业务');
 const account=(space.acquisition?.accounts||[]).find(a=>a.id===accountId&&a.customerId===customerId&&isRealEvidence(a));
 if(!account)throw new Error('请选择当前业务的有效账号');
 if(!Number.isSafeInteger(followers)||followers<0||followers>1000000000)throw new Error('粉丝数须为0至10亿之间的整数');
 if(typeof observedAt!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(observedAt))throw new Error('请填写实际统计日期');
 const [y,m,d]=observedAt.split('-').map(Number),date=new Date(Date.UTC(y,m-1,d));
 if(date.getUTCFullYear()!==y||date.getUTCMonth()!==m-1||date.getUTCDate()!==d)throw new Error('请填写有效的统计日期');
 if(typeof source!=='string'||!source.trim()||source.trim().length>500)throw new Error('请填写不超过500字的数据来源');
 const items=customer.accountAudience ||= [],current=items.filter(row=>row.accountId===accountId);
 if(!Number.isSafeInteger(baseRevision)||baseRevision!==current.length)throw new Error('该账号粉丝记录已变化，请刷新后核对');
 if(current.length>=200||items.length>=2000)throw new Error('粉丝历史记录已达上限');
 items.push({id:crypto.randomUUID(),accountId,platform:account.platform,accountName:account.name,followers,observedAt,source:source.trim(),createdAt:new Date().toISOString(),revision:current.length+1});
 return {workspace:writeWorkspace(email,space)};
}
