/** Server-only Groq completions. Keys are read only by the Node audit server. */
export type Msg = { role: 'system' | 'user' | 'assistant'; content: string };
export const MODELS = {fast:'openai/gpt-oss-20b',deep:'openai/gpt-oss-120b'} as const;
export type ModelKey = keyof typeof MODELS;
export type CompleteOpts = {messages:Msg[];model?:ModelKey;temperature?:number;maxTokens?:number;signal?:AbortSignal};
export function hasLLM():boolean {return Boolean(process.env.GROQ_API_KEY);}
export async function completeJSON<T>(opts:CompleteOpts):Promise<T> {
 const key=process.env.GROQ_API_KEY;
 if(!key) throw new Error('GROQ_API_KEY is not configured.');
 const signal=AbortSignal.any([AbortSignal.timeout(15000),...(opts.signal?[opts.signal]:[])]);
 const response=await fetch('https://api.groq.com/openai/v1/chat/completions',{
  method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${key}`},signal,
  body:JSON.stringify({model:MODELS[opts.model??'fast'],messages:opts.messages,temperature:opts.temperature??0.3,max_tokens:(opts.maxTokens??1200)+256,reasoning_effort:'low',include_reasoning:false,stream:false,response_format:{type:'json_object'}}),
 });
 if(!response.ok) throw new Error(`Recommendation provider returned ${response.status}.`);
 const data=await response.json() as {choices?:{message?:{content?:string}}[]};
 return JSON.parse(data.choices?.[0]?.message?.content??'') as T;
}
