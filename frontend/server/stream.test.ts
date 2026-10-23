import { afterEach, describe, expect, it, vi } from 'vitest';
import { sseResponse } from '@/lib/sse';
import { postSSE } from '@/lib/sse-client';
afterEach(()=>vi.unstubAllGlobals());
describe('server event-stream cancellation',()=>{
 it('does not start work for an already-aborted request',async()=>{
  const abort=new AbortController();abort.abort();const run=vi.fn(async()=>{});
  const response=sseResponse(new Request('http://localhost/',{signal:abort.signal}),run);
  expect(await response.text()).toBe('');expect(run).not.toHaveBeenCalled();
 });
 it('does not emit successful completion when cancelled during work',async()=>{
  const abort=new AbortController();
  const response=sseResponse(new Request('http://localhost/',{signal:abort.signal}),async(send,signal)=>{
   send('task',{status:'running'});
   await new Promise<void>((_,reject)=>{signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true});queueMicrotask(()=>abort.abort());});
  });
  const frames=await response.text();expect(frames).toContain('event: task');expect(frames).not.toMatch(/event: (done|error)/);
 });
 it('removes the request abort listener when work completes',async()=>{
  const request=new Request('http://localhost/');const remove=vi.spyOn(request.signal,'removeEventListener');
  expect(await sseResponse(request,async()=>{}).text()).toContain('event: done');
  expect(remove).toHaveBeenCalledWith('abort',expect.any(Function));
 });
});
describe('client event-stream termination',()=>{
 const response=(frames:string)=>new Response(frames,{headers:{'content-type':'text/event-stream'}});
 it('rejects clean EOF after a task without a terminal event',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>response('event: task\ndata: {"id":"capture"}\n\n')));
  const receive=vi.fn();await expect(postSSE('/api/reviewer/audit',{},receive)).rejects.toThrow(/ended before/i);
  expect(receive).toHaveBeenCalledWith('task',{id:'capture'});
 });
 it.each(['done','error'])('accepts the explicit %s terminal event',async(event)=>{
  vi.stubGlobal('fetch',vi.fn(async()=>response(`event: ${event}\ndata: {}\n\n`)));
  await expect(postSSE('/api/reviewer/audit',{},()=>{})).resolves.toBeUndefined();
 });
});
