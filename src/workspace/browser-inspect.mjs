import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';

export const viewports=Object.freeze({desktop:{width:1280,height:800},tablet:{width:820,height:1180},mobile:{width:390,height:844}});
// Environment is allowlisted: browser/probe processes never inherit provider
// keys, gateway credentials, NODE_OPTIONS, or developer .env files.
export function browserEnvironment(){return Object.fromEntries(Object.entries(process.env).filter(([k])=>/^(SystemRoot|WINDIR|COMSPEC|USERPROFILE|USERNAME|APPDATA|LOCALAPPDATA|TEMP|TMP|PATH|PATHEXT|ProgramFiles|ProgramFiles\(x86\)|ProgramData|NUMBER_OF_PROCESSORS|PROCESSOR_ARCHITECTURE)$/i.test(k)));}
export async function inspectPreview({url,device,directory,onChild=()=>{}}){
 const viewport=viewports[device];if(!viewport)throw Error('preview_invalid_viewport');
 const {_electron,chromium}=await import('playwright-core');let electron,browser,context,page;
 const events=[],push=(level,message)=>{if(events.length<50)events.push({level,message:String(message).slice(0,2000)});};
 try{
  if(process.env.LOCALAGENT_ELECTRON_EXE){
   electron=await _electron.launch({executablePath:process.env.LOCALAGENT_ELECTRON_EXE,args:[...(process.env.LOCALAGENT_ELECTRON_APP?[process.env.LOCALAGENT_ELECTRON_APP]:[]),'--localagent-preview-probe',url,'--localagent-preview-owner='+process.pid],env:browserEnvironment(),timeout:15000});
   onChild(electron.process(),'browser');page=await electron.firstWindow({timeout:10000});
  }else{
   const executablePath=process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
   if(!executablePath&&!existsSync(chromium.executablePath()))throw Error('preview_browser_unavailable');
   browser=await chromium.launch({headless:true,executablePath,env:browserEnvironment(),timeout:15000});
   context=await browser.newContext({viewport,serviceWorkers:'block',acceptDownloads:false});
   await context.route('**/*',route=>route.request().url().startsWith(url)?route.continue():route.abort());page=await context.newPage();
  }
  page.setDefaultTimeout(10000);await page.setViewportSize(viewport);
  page.on('console',m=>push(m.type(),m.text()));page.on('pageerror',e=>push('error',e.message));
  page.on('requestfailed',r=>push('error','Resource request failed: '+new URL(r.url()).pathname.replace(/\/p\/[^/]+/,'') ));
  const response=await page.goto(url,{waitUntil:'load',timeout:10000});await page.waitForTimeout(250);
  const layout=await page.evaluate(()=>({title:document.title,scrollWidth:document.documentElement.scrollWidth,viewport:innerWidth,headings:[...document.querySelectorAll('h1,h2')].slice(0,8).map(x=>x.textContent.slice(0,160))}));
  const file=join(directory,randomUUID()+'.png');await page.screenshot({path:file,timeout:10000,animations:'disabled'});
  return {device,viewport,layout,status:response?.status(),events,file,verifiedAt:new Date().toISOString(),passed:response?.ok()&&!events.some(e=>['error','assert'].includes(e.level))&&layout.scrollWidth<=viewport.width+1};
 }catch(e){if(e.message.startsWith('preview_'))throw e;throw Error('preview_inspection_failed',{cause:e});}
 finally{await electron?.close().catch(()=>{});await context?.close().catch(()=>{});await browser?.close().catch(()=>{});}
}
