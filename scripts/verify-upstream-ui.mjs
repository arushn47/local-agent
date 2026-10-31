import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, sep, extname } from 'node:path';
import { randomBytes } from 'node:crypto';
import { launchBrowser } from './browser.mjs';
import { root, stateDir, opencodeExe } from '../src/config.mjs';
const pin=JSON.parse(readFileSync(join(root,'integrations/opencode/source.json')));
const dist=join(stateDir,'upstream/source-'+pin.commit,'packages/app/dist');
if(!existsSync(join(dist,'index.html')))throw Error('Build the pristine upstream app first');
const profile=join(stateDir,'upstream-smoke');mkdirSync(profile,{recursive:true});
const password=randomBytes(32).toString('hex'),backend='http://127.0.0.1:20146';
const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>!/(API_KEY|TOKEN|SECRET|PASSWORD)/i.test(k)));
const child=spawn(opencodeExe,['serve','--pure','--hostname','127.0.0.1','--port','20146'],{cwd:profile,windowsHide:true,env:{...env,OPENCODE_SERVER_PASSWORD:password,OPENCODE_CONFIG_CONTENT:JSON.stringify({enabled_providers:[],autoupdate:false,share:'disabled'}),OPENCODE_CONFIG_DIR:join(profile,'config'),XDG_CONFIG_HOME:join(profile,'config'),XDG_DATA_HOME:join(profile,'data'),XDG_CACHE_HOME:join(profile,'cache'),OPENCODE_DISABLE_DEFAULT_PLUGINS:'true',OPENCODE_DISABLE_MODELS_FETCH:'true'},stdio:'ignore'});
const authorization='Basic '+Buffer.from('opencode:'+password).toString('base64');
let server,browser;
try {
  let ready=false;for(let i=0;i<60;i++){try{const r=await fetch(backend+'/global/health',{headers:{authorization},signal:AbortSignal.timeout(1000)});if(r.ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,500));}
  if(!ready)throw Error('Isolated OpenCode server did not become ready');
  if((await fetch(backend+'/global/health')).status!==401)throw Error('Backend authentication missing');
  server=createServer(async(req,res)=>{try{
    const pathname=new URL(req.url,'http://127.0.0.1').pathname;
    const file=resolve(dist,'.'+decodeURIComponent(pathname));
    if(file.startsWith(resolve(dist)+sep)&&existsSync(file)&&extname(file)){
      const type={'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2','.png':'image/png'}[extname(file)]||'application/octet-stream';res.writeHead(200,{'Content-Type':type});return res.end(readFileSync(file));
    }
    if(/^\/(api|global|provider|project|path|vcs|config|session|event|permission|agent|command|lsp|formatter|mcp|experimental)(\/|$)/.test(pathname)){
      if(req.method!=='GET'){res.writeHead(403);return res.end();}
      const response=await fetch(backend+req.url,{headers:{authorization},signal:AbortSignal.timeout(10000)});
      res.writeHead(response.status,{'Content-Type':response.headers.get('content-type')||'application/json'});for await(const b of response.body||[])res.write(b);return res.end();
    }
    res.writeHead(200,{'Content-Type':'text/html'});res.end(readFileSync(join(dist,'index.html')));
  }catch{if(!res.headersSent)res.writeHead(502);res.end();}});
  await new Promise(r=>server.listen(20145,'127.0.0.1',r));
  browser=await launchBrowser();const page=await browser.newPage({viewport:{width:1440,height:960}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  await page.goto('http://127.0.0.1:20145',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.body.innerText.length>80,{timeout:30000});
  await page.waitForTimeout(2000);
  mkdirSync(join(root,'validation/phase2'),{recursive:true});
  await page.screenshot({path:join(root,'validation/phase2/upstream-workspace.png'),fullPage:true});
  const text=await page.locator('body').innerText();
  const report={commit:pin.commit,rendererLoaded:text.length>80,bodyPreview:text.slice(0,600),errors,backendAuthenticated:true,inferenceEnabled:false};
  writeFileSync(join(root,'validation/phase2/upstream-ui.json'),JSON.stringify(report,null,2));
  if(errors.length)throw Error('Upstream renderer errors: '+errors.length);
  console.log(JSON.stringify(report));
}finally{await browser?.close();if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}child.kill();}
