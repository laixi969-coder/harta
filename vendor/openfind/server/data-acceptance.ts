import {Router} from 'express';import {z} from 'zod';import {randomUUID} from 'node:crypto';
import {xhsClient,xhsFingerprint,XhsPendingError} from './xhs-data.ts';import {douyinClient,douyinFingerprint,douyinProvider} from './douyin-data.ts';import {get,put} from './store.ts';import {withRequestScope} from './request-budget.ts';
const router=Router();let running=false;
router.get('/data-acceptance',(req,res)=>{const platform=z.enum(['xiaohongshu','douyin']).parse(req.query.platform);const id=platform==='xiaohongshu'?xhsFingerprint():douyinFingerprint();res.json(get('dataAcceptance',id)||null);});
router.post('/data-acceptance',async(req,res)=>{
 const input=z.object({platform:z.enum(['xiaohongshu','douyin']),keyword:z.string().trim().min(1).max(100),allowPaid:z.literal(true)}).strict().parse(req.body);
 if(running)return res.status(409).json({error:'验收正在进行，请等待完成'});
 if(input.platform==='douyin'&&!['tikhub','redfox'].includes(douyinProvider()))return res.status(400).json({error:'此验收仅用于已配置的供应商 API'});
 running=true;const steps:{name:string;status:string;detail:string}[]=[];let client:ReturnType<typeof xhsClient>|ReturnType<typeof douyinClient>|undefined;
 try{await withRequestScope('acceptance-'+randomUUID(),async()=>{
  client=input.platform==='xiaohongshu'?xhsClient():douyinClient();
  const q={keyword:input.keyword,limit:3,sort:'latest' as const,noteType:'all' as const,interval:1000,mode:'live' as const,platform:input.platform};
  const first=await client.search(q,null);if('paginationError' in first && first.paginationError)throw new Error(String(first.paginationError));steps.push({name:'搜索',status:'passed',detail:`返回 ${first.items.length} 条`});
  if(first.nextCursor){const second=await client.search(q,first.nextCursor);if('paginationError' in second && second.paginationError)throw new Error(String(second.paginationError));if(second.nextCursor===first.nextCursor)throw new Error('搜索分页重复');steps.push({name:'搜索分页',status:'passed',detail:`第二页 ${second.items.length} 条`});}else steps.push({name:'搜索分页',status:'unverified',detail:'无下一页，尚未验证分页'});
  if(!first.items[0]){steps.push({name:'详情与评论',status:'unverified',detail:'本次搜索无结果，请换业务关键词'});return;}
  const note=await client.detail(first.items[0]);steps.push({name:'详情',status:'passed',detail:'已取得作品详情'});
  if(input.platform==='douyin'&&client.provider==='redfox'){steps.push({name:'评论',status:'unsupported',detail:'当前接口不支持抖音评论'});return;}
  const comments=await client.comments(note,3,null);if(comments.paginationError)throw new Error(comments.paginationError);steps.push({name:'评论',status:'passed',detail:`返回 ${comments.items.length} 条，未导入业务线索`});
  if(comments.nextCursor){const second=await client.comments(note,3,comments.nextCursor);if(second.paginationError)throw new Error(second.paginationError);if(second.nextCursor===comments.nextCursor)throw new Error('评论分页重复');steps.push({name:'评论分页',status:'passed',detail:`第二页 ${second.items.length} 条`});}else steps.push({name:'评论分页',status:'unverified',detail:'无下一页，尚未验证分页'});
 });}catch(error){steps.push({name:'当前步骤',status:error instanceof XhsPendingError?'pending':'failed',detail:(error as Error).message});}finally{running=false;}
 const report={id:client?.fingerprint || (input.platform==='xiaohongshu'?xhsFingerprint():douyinFingerprint()),platform:input.platform,checkedAt:new Date().toISOString(),requests:client?.requests||0,steps};put('dataAcceptance',report);res.json(report);
});
export default router;
