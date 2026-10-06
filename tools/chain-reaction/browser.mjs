import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { ROOT } from './core.mjs';
export function playwright() {
  const require=createRequire(import.meta.url);
  const location=process.env.CHAIN_REACTION_PLAYWRIGHT;
  if(!location) throw Error('Set CHAIN_REACTION_PLAYWRIGHT to a scratch-installed Playwright package outside the repository');
  return require(location);
}
export async function serve(localLab, host='127.0.0.1') {
  const mime={'.js':'text/javascript','.mjs':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.woff':'font/woff','.woff2':'font/woff2','.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp','.ico':'image/vnd.microsoft.icon','.svg':'image/svg+xml','.gif':'image/gif'};
  const server=createServer(async(req,res)=>{
    try {
      const pathname=decodeURIComponent(new URL(req.url,'http://local').pathname);
      if(pathname.split('/').some(p=>p.startsWith('.'))){res.writeHead(403);res.end();return;}
      if(pathname==='/spike.html') {res.setHeader('content-type','text/html');res.end('<!doctype html><title>Physics isolation</title><script src="/js/chain-reaction-physics.js?v=0.1.0"></script>');return;}
      let filename;
      if(localLab && pathname.startsWith('/local/')) filename=resolve(localLab,'.'+pathname.slice(6));
      else filename=resolve(ROOT,'.'+pathname);
      const boundary=pathname.startsWith('/local/')&&localLab?localLab:ROOT;
      if(!filename.startsWith(boundary+sep)) {res.writeHead(403);res.end();return;}
      if(!mime[extname(filename).toLowerCase()]){res.writeHead(403);res.end();return;}
      res.setHeader('content-type',mime[extname(filename).toLowerCase()]||'application/octet-stream');
      res.end(await readFile(filename));
    } catch(error) {res.writeHead(error.code==='ENOENT'?404:500);res.end();}
  });
  await new Promise(resolve=>server.listen(0,host,resolve));
  return {url:'http://127.0.0.1:'+server.address().port,close:()=>new Promise(resolve=>server.close(resolve))};
}
export async function browserRun(engine,work) {
  const pw=playwright();
  let browser,timer;
  try {
    browser=await pw[engine].launch({headless:true,timeout:30000,...(engine==='chromium'?{
      executablePath:process.env.CHAIN_REACTION_CHROME||'/Users/ethan/.local/bin/agent-chrome-for-testing',
      args:['--disable-gpu-vsync','--disable-frame-rate-limit']
    }:{})});
    return await Promise.race([work(browser),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Browser hard timeout after 5 minutes')),300000);})]);
  } finally {clearTimeout(timer);if(browser) await browser.close();}
}
