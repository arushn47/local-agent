import {app,BrowserWindow,session} from 'electron';
const index=process.argv.indexOf('--localagent-preview-probe'),value=process.argv[index+1];
let url;try{url=new URL(value);if(url.protocol!=='http:'||url.hostname!=='localhost'||!/^\/p\/[a-f0-9]{48}\/$/.test(url.pathname)||url.search||url.username||url.password)throw Error();}catch{app.exit(1);}
if(url){
 app.setName('LocalAgentPreview');
 app.whenReady().then(async()=>{
  const isolated=session.fromPartition('preview-probe');isolated.setPermissionRequestHandler((_w,_p,cb)=>cb(false));isolated.setPermissionCheckHandler(()=>false);
  isolated.webRequest.onBeforeRequest((details,cb)=>cb({cancel:details.url!=='about:blank'&&!details.url.startsWith(url.origin+url.pathname)}));
  isolated.on('will-download',event=>event.preventDefault());
  const win=new BrowserWindow({show:false,width:1280,height:800,webPreferences:{session:isolated,sandbox:true,nodeIntegration:false,contextIsolation:true,webSecurity:true,backgroundThrottling:false,offscreen:true}});
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-attach-webview',e=>e.preventDefault());
  await win.loadURL('about:blank');
 }).catch(()=>app.exit(1));
 app.on('window-all-closed',()=>app.quit());setTimeout(()=>app.exit(0),30000).unref();
 const owner=Number(process.argv.find(x=>x.startsWith('--localagent-preview-owner='))?.split('=')[1]);
 if(!Number.isInteger(owner)||owner<=0)app.exit(1);
 else setInterval(()=>{try{process.kill(owner,0);}catch{app.exit(0);}},250).unref();
}
