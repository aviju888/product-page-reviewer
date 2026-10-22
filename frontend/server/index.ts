import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { POST } from './audit';
import { shutdownCapture } from '@/lib/reviewer/capture';

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(here, '../dist');
const port = Number(process.env.REVIEWER_PORT ?? 4312);
const backend = new URL(process.env.CLASSIC_BACKEND_URL ?? 'http://127.0.0.1:8000');
const types: Record<string,string> = {'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.woff2':'font/woff2'};

async function body(req: IncomingMessage): Promise<Buffer> {
  const parts: Buffer[] = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > 16384) throw new Error('Request body is too large.'); parts.push(chunk); }
  return Buffer.concat(parts);
}
async function respond(res: ServerResponse, response: Response) {
  res.writeHead(response.status, Object.fromEntries(response.headers));
  if (response.body) for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
    if (res.destroyed) break;
    if (!res.write(chunk)) await new Promise<void>(resolve => { res.once('drain', resolve); res.once('close', resolve); });
  }
  res.end();
}
export const server = http.createServer(async (req,res) => {
  const abort = new AbortController();
  res.on('close', () => abort.abort());
  try {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    if (url.pathname === '/api/reviewer/audit' && req.method === 'POST') {
      const content = await body(req);
      await respond(res, await POST(new Request(url, {method:'POST', headers:{'content-type':'application/json'},body:content,signal:abort.signal})));
      return;
    }
    if (url.pathname === '/api/analyze' && req.method === 'POST') {
      const content = await body(req);
      try {
        const response = await fetch(new URL('/api/analyze',backend), {method:'POST',headers:{'content-type':'application/json'},body:content,signal:AbortSignal.any([abort.signal,AbortSignal.timeout(60000)])});
        await respond(res,response);
      } catch { res.writeHead(502,{'content-type':'application/json'});res.end(JSON.stringify({error:'Classic analysis service is unavailable. Start the FastAPI backend.'})); }
      return;
    }
    if (url.pathname === '/api/reviewer/health') { await respond(res,Response.json({ok:true}));return; }
    if (req.method !== 'GET' && req.method !== 'HEAD') {res.writeHead(405);res.end();return;}
    if (url.pathname === '/classic') {res.writeHead(308,{location:'/classic/'});res.end();return;}
    const pathname=decodeURIComponent(url.pathname);
    const file=path.resolve(dist, '.' + pathname + (pathname.endsWith('/')?'index.html':''));
    if (!file.startsWith(dist + path.sep)) {res.writeHead(404);res.end();return;}
    if (!(await stat(file).catch(()=>null))?.isFile()) {res.writeHead(404);res.end('Not found');return;}
    res.writeHead(200,{'content-type':types[path.extname(file)]??'application/octet-stream'});
    res.end(req.method === 'HEAD'?undefined:await readFile(file));
  } catch (err) {
    if (!res.headersSent) res.writeHead(err instanceof Error && err.message === 'Request body is too large.'?413:400,{'content-type':'application/json'});
    res.end(JSON.stringify({error:'Invalid request.'}));
  }
});
server.listen(port,'127.0.0.1',()=>console.log(`Product Page Reviewer: http://127.0.0.1:${port}`));
async function stop(){server.close();await shutdownCapture();process.exit(0);}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
