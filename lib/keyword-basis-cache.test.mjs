import {it,expect,vi} from 'vitest';
import {createKeywordBasisCache} from './keyword-basis-cache.mjs';
it('业务或词库变化失效，历史内容变化不重复计算，缓存结果不共享可变对象',()=>{
 const build=vi.fn(c=>({items:[{keyword:c.name}]}));const get=createKeywordBasisCache({build});
 const c={name:'品类A',keywordLibraries:[]};const first=get(c,1000);first.items[0].keyword='被修改';
 expect(get({...c,drops:[{id:1}]},1001).items[0].keyword).toBe('品类A');expect(build).toHaveBeenCalledTimes(1);
 get({...c,name:'品类B'},1002);get({...c,keywordLibraries:[{id:1}]},1003);expect(build).toHaveBeenCalledTimes(3);
});
it('时间过期、时钟回退和LRU淘汰会重新计算',()=>{
 const build=vi.fn(()=>({items:[]}));const get=createKeywordBasisCache({build,maxEntries:1,ttl:10});
 get({name:'A'},100);get({name:'A'},111);get({name:'A'},90);get({name:'B'},91);get({name:'A'},92);
 expect(build).toHaveBeenCalledTimes(5);
});
