import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createStateRefresh, retryDelay} from '../src/state-refresh.ts';

test('refresh coalesces concurrent callers and preserves loaded state on failure', async () => {
  let finish!: (n:number)=>void;
  let calls=0, state=0, failures=0;
  const refresh=createStateRefresh({load:()=>{calls++;return new Promise<number>(resolve=>{finish=resolve;});},onSuccess:n=>{state=n;},onError:()=>{failures++;}});
  const first=refresh(),second=refresh();
  await Promise.resolve();assert.equal(calls,1);assert.equal(first,second);
  finish(7);await first;assert.equal(state,7);assert.equal(failures,0);
});

test('server backoff prevents automatic and explicit refreshes until allowed', async () => {
  let time=1000,calls=0,state=7,errors=0;
  const refresh=createStateRefresh({now:()=>time,load:async()=>{calls++;if(calls===1)throw Object.assign(new Error('wait'),{retryAfterMs:6000});return 8;},onSuccess:n=>{state=n;},onError:()=>{errors++;}});
  await refresh();assert.equal(state,7);assert.equal(errors,1);
  time=6999;await refresh();await refresh();assert.equal(calls,1);
  time=7000;await refresh();assert.equal(calls,2);assert.equal(state,8);
});

test('network failure does not permanently block subsequent state refresh', async () => {
  let calls=0,state=7;
  const refresh=createStateRefresh({load:async()=>{if(++calls===1)throw new Error('network');return 9;},onSuccess:n=>{state=n;},onError:()=>{}});
  await refresh();assert.equal(state,7);await refresh();assert.equal(state,9);
});

test('Retry-After accepts seconds and HTTP dates, with a fallback for rate limits', () => {
  const now=Date.parse('2026-10-31T10:00:00Z');
  assert.equal(retryDelay('12',429,now),12000);
  assert.equal(retryDelay('Sat, 31 Oct 2026 10:00:05 GMT',503,now),5000);
  assert.equal(retryDelay(null,429,now),30000);
  assert.equal(retryDelay('invalid',429,now),30000);
  assert.equal(retryDelay(null,500,now),0);
});
