import {afterEach,describe,expect,it,vi} from 'vitest';
import {completeJSON,hasLLM} from '@/lib/llm';
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
describe('recommendation provider contract',()=>{
 it('uses supported reasoning models, JSON output and bounded completion budget',async()=>{
  vi.stubEnv('GROQ_API_KEY','test-key');
  const request=vi.fn(async()=>Response.json({choices:[{message:{content:'{"summary":"ok"}'}}]}));vi.stubGlobal('fetch',request);
  expect(await completeJSON({messages:[{role:'user',content:'fixture facts'}],model:'deep',maxTokens:1400})).toEqual({summary:'ok'});
  const [url,options]=request.mock.calls[0] as unknown as [string,RequestInit];
  expect(url).toBe('https://api.groq.com/openai/v1/chat/completions');
  expect(JSON.parse(options.body as string)).toMatchObject({model:'openai/gpt-oss-120b',max_tokens:1656,reasoning_effort:'low',include_reasoning:false,response_format:{type:'json_object'}});
  expect(options.signal).toBeInstanceOf(AbortSignal);
 });
 it('does not call provider without a key',async()=>{
  vi.stubEnv('GROQ_API_KEY','');const request=vi.fn();vi.stubGlobal('fetch',request);
  expect(hasLLM()).toBe(false);await expect(completeJSON({messages:[]})).rejects.toThrow('not configured');expect(request).not.toHaveBeenCalled();
 });
 it('keeps raw provider error bodies out of errors',async()=>{
  vi.stubEnv('GROQ_API_KEY','test-key');vi.stubGlobal('fetch',vi.fn(async()=>new Response('private detail',{status:429})));
  await expect(completeJSON({messages:[]})).rejects.toThrow('Recommendation provider returned 429.');
 });
});
