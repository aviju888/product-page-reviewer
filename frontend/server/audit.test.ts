import { afterAll, describe, expect, it } from 'vitest';
import { POST } from './audit';
import { shutdownCapture } from '@/lib/reviewer/capture';
afterAll(shutdownCapture);
const request = (body:string) => new Request('http://localhost/api/reviewer/audit',{method:'POST',body});
describe('audit HTTP contract',()=>{
 it('rejects invalid JSON before opening an event stream',async()=>{expect((await POST(request('{'))).status).toBe(400);});
 it('rejects unsupported site types',async()=>{expect((await POST(request(JSON.stringify({url:'sample:strong',siteType:'other'})))).status).toBe(400);});
 it('streams a private-target error and terminates',async()=>{
  const res=await POST(request(JSON.stringify({url:'http://169.254.169.254/'}))); const text=await res.text();
  expect(text).toContain('event: error');expect(text).toContain('private network');expect(text).toContain('event: done');expect(text).not.toContain('event: capture');
 });
 it('renders a controlled product fixture and streams a complete audit',async()=>{
  const res=await POST(request(JSON.stringify({url:'sample:strong'}))); const text=await res.text();
  expect(res.headers.get('content-type')).toContain('text/event-stream');
  expect(text).toContain('data:image/jpeg;base64,');expect(text).toContain('"engine":"sample"');expect(text).toContain('event: scores');expect(text).toContain('event: recommendations');expect(text).not.toContain('event: error');expect(text).toMatch(/event: done\ndata: \{\}\n\n$/);
 });
});
