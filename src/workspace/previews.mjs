import {createServer} from 'node:http';
import {readFileSync,writeFileSync,readdirSync,watch,mkdirSync,existsSync,unlinkSync} from 'node:fs';
import {join,extname} from 'node:path';
import {randomBytes} from 'node:crypto';
import {execFile} from 'node:child_process';
import {ZipFile} from 'yazl';
import {previewFile,previewFiles,previewTypes,permittedName,readPreviewFile} from './preview-files.mjs';
import {previewMonitor} from './preview-monitor.mjs';
import {inspectPreview,viewports} from './browser-inspect.mjs';
const starter={
 'index.html':'<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>A fresh start</title><link rel="stylesheet" href="style.css"></head><body><main><p class="eyebrow">MADE ON THIS DEVICE</p><h1>A little idea.<br>A new beginning.</h1><p>Your next website starts here. Ask your agent to make it yours.</p><button id="hello">Try an interaction</button><p id="result" aria-live="polite"></p></main><script type="module" src="app.mjs"></script></body></html>',
 'style.css':':root{font:18px/1.6 system-ui;color:#263024;background:#f5f4ef}body{margin:0}main{max-width:850px;margin:12vh auto;padding:24px}h1{font-size:clamp(3rem,8vw,6rem);line-height:1.05;letter-spacing:-.05em}.eyebrow{font:12px monospace;letter-spacing:.18em}button{font:inherit;border:0;border-radius:8px;padding:12px 20px;background:#36573b;color:white;cursor:pointer}button:focus-visible{outline:3px solid #8fba87;outline-offset:4px}',
 'app.mjs':"document.querySelector('#hello').addEventListener('click',()=>{document.querySelector('#result').textContent='Ready for what comes next.'});\n",
};

export async function createPreviews({projects,directory,uiOrigin,onChild=()=>{}}){
 mkdirSync(directory,{recursive:true});let current,watcher,refreshTimer,busy=false,stopped=false,requests=0,windowStarted=Date.now();
 const snapshot=projectId=>{
  const project=projects.get(projectId),entry=existsSync(join(project.path,'index.html'));
  if(!current||current.projectId!==projectId)return {state:'stopped',entry,mode:'static',viewports};
  const {root,token,inspection,build,...publicState}=current;
  return {...publicState,build:build?{...build,stale:build.revision!==current.revision}:null,entry,mode:'static',viewports,url:origin+'/p/'+token+'/',inspection:inspection?{...inspection,stale:inspection.revision!==current.revision,file:undefined}:null};
 };
 const stopPreview=()=>{watcher?.close();watcher=undefined;clearTimeout(refreshTimer);if(current?.inspection?.file)try{unlinkSync(current.inspection.file);}catch{}current=undefined;};
 const server=createServer((req,res)=>{
  const deny=(code=403)=>{res.writeHead(code,{'Content-Type':'text/plain','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end('Preview resource unavailable');};
  if(!current||req.method!=='GET'||req.headers.host!==new URL(origin).host)return deny();
  if(Date.now()-windowStarted>1000){requests=0;windowStarted=Date.now();}if(++requests>120)return deny(429);
  let path;try{path=decodeURIComponent(new URL(req.url,origin).pathname);}catch{return deny();}
  const prefix='/p/'+current.token+'/';if(!path.startsWith(prefix))return deny();
  const name=path.slice(prefix.length)||'index.html';
  try{
   const found=previewFile(current.root,name),mime=previewTypes[extname(found.file).toLowerCase()];
   let data=readPreviewFile(current.root,name);if(data.length>5*1024*1024)return deny(413);
   if(mime.startsWith('text/html')){
    const monitor=previewMonitor({token:current.token,uiOrigin});
    const html=data.toString();data=Buffer.from(/<head[^>]*>/i.test(html)?html.replace(/<head[^>]*>/i,match=>match+monitor):monitor+html);
   }
   res.writeHead(200,{'Content-Type':mime,'Cache-Control':'no-store','Access-Control-Allow-Origin':'*','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Cross-Origin-Resource-Policy':'cross-origin','Content-Security-Policy':`sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline' ${origin}; style-src 'unsafe-inline' ${origin}; img-src ${origin} data: blob:; font-src ${origin}; media-src ${origin} blob:; connect-src 'none'; frame-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors ${uiOrigin}`});res.end(data);
  }catch{return deny(404);}
 });
 await new Promise((r,j)=>{server.once('error',j);server.listen(0,'127.0.0.1',r);});const origin='http://localhost:'+server.address().port;
 return {
  origin,status:snapshot,
  async start(id){
   if(busy)throw Error('preview_busy');const project=projects.get(id);try{previewFile(project.path,'index.html');}catch(e){if(e.message.startsWith('preview_'))throw e;throw Error('preview_entry_missing');}
   stopPreview();current={projectId:id,root:project.path,token:randomBytes(24).toString('hex'),state:'running',revision:1,startedAt:new Date().toISOString(),build:null,inspection:null};
   try{watcher=watch(project.path,{recursive:true},(_event,name)=>{
    if(!name||!permittedName(String(name)))return;clearTimeout(refreshTimer);
    refreshTimer=setTimeout(()=>{if(current?.projectId===id){current.revision++;current.build=null;}},180);
   });watcher.on('error',()=>{if(current)current.state='watch_failed';});}catch{current.state='watch_failed';}return snapshot(id);
  },
  stop(id){projects.get(id);if(busy)throw Error('preview_busy');if(current?.projectId===id)stopPreview();return snapshot(id);},
  template(id){
   const project=projects.get(id);if(readdirSync(project.path).some(name=>name!=='.git'))throw Error('preview_template_requires_empty_folder');
   for(const [file,content]of Object.entries(starter))writeFileSync(join(project.path,file),content,{flag:'wx'});return {created:Object.keys(starter)};
  },
  async build(id){
   if(busy)throw Error('preview_busy');if(current?.projectId!==id)throw Error('preview_not_running');busy=true;const item=current,revision=item.revision;
   try{
    const files=previewFiles(item.root).filter(f=>['.js','.mjs'].includes(extname(f.file))),diagnostics=[];
    if(files.length>32)throw Error('preview_build_limit');
    previewFile(item.root,'index.html');const deadline=Date.now()+15000;
    for(const file of files){if(Date.now()>deadline)throw Error('preview_build_limit');const data=readPreviewFile(item.root,file.name);try{await new Promise((r,j)=>{const child=execFile(process.execPath,['--check','--input-type=module'],{cwd:item.root,timeout:2000,maxBuffer:8192,windowsHide:true,env:{SystemRoot:process.env.SystemRoot}},(error,_out,stderr)=>error?j({stderr}):r());onChild(child,'validator');child.stdin.on('error',()=>{});child.stdin.end(data);});}catch(e){diagnostics.push({file:file.name,level:'error',message:String(e.stderr||'JavaScript syntax check failed').replaceAll(item.root,'[project]').slice(0,4000)});}}
    return item.build={passed:diagnostics.length===0,checkedFiles:files.length,diagnostics,revision,checkedAt:new Date().toISOString(),scope:'Entry point and JavaScript syntax only; no package scripts executed'};
   }finally{busy=false;}
  },
  async inspect(id,device){
   if(busy)throw Error('preview_busy');if(current?.projectId!==id)throw Error('preview_not_running');if(!viewports[device])throw Error('preview_invalid_viewport');busy=true;const item=current,revision=item.revision;
   try{const result=await inspectPreview({url:origin+'/p/'+item.token+'/',device,directory,onChild});
    if(stopped||item!==current){try{unlinkSync(result.file);}catch{}throw Error('preview_stopped');}
    if(item.inspection?.file)try{unlinkSync(item.inspection.file);}catch{}
    item.inspection={...result,revision,stale:item.revision!==revision};return snapshot(id);
   }finally{busy=false;}
  },
  screenshot(id){if(current?.projectId!==id||!current.inspection)throw Error('preview_no_screenshot');return readFileSync(current.inspection.file);},
  export(id,res){
   const project=projects.get(id),files=previewFiles(project.path,{exporting:true}),zip=new ZipFile();
   // Bounded buffers avoid file replacement/symlink races during streaming.
   const entries=files.map(f=>({name:f.name,data:readPreviewFile(project.path,f.name,{exporting:true})}));
   if(entries.reduce((n,f)=>n+f.data.length,0)>20*1024*1024)throw Error('preview_project_too_large');
   res.writeHead(200,{'Content-Type':'application/zip','Content-Disposition':'attachment; filename="localagent-project.zip"','Cache-Control':'no-store'});
   zip.outputStream.on('error',()=>res.destroy());zip.outputStream.pipe(res);res.once('close',()=>zip.outputStream.destroy());
   for(const f of entries)zip.addBuffer(f.data,f.name);zip.end();
  },
  close(){stopped=true;stopPreview();server.closeAllConnections();server.close();},
 };
}
