import {app,BrowserWindow,dialog,ipcMain,Menu,session,shell} from 'electron';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createRuntimeSupervisor} from './runtime-supervisor.mjs';
import {safeWindowURL} from '../vendor/window-state.mjs';
import {isTrustedSender,isDesktopURL} from './security.mjs';
import {writeFileSync} from 'node:fs';
const here=dirname(fileURLToPath(import.meta.url));
const root=app.isPackaged?join(process.resourcesPath,'runtime'):resolve(here,'../../..');
const nodePath=app.isPackaged?join(process.resourcesPath,'node/node.exe'):process.env.LOCALAGENT_NODE_EXE;
if(process.env.LOCALAGENT_USER_DATA_DIR)app.setPath('userData',resolve(process.env.LOCALAGENT_USER_DATA_DIR));
app.setName('LocalAgent');app.setAppUserModelId('io.localagent.desktop');
let win,runtime,origin,quitting=false,restarting=false,rendererRecoveries=0;
const splash=pathToFileURL(join(here,'startup.html')).href;
if(!app.requestSingleInstanceLock())app.quit();
else{
  app.on('second-instance',()=>{if(win?.isMinimized())win.restore();win?.focus();});
  const check=(event,allowSplash)=>{if(!isTrustedSender(event,win,origin,splash,allowSplash))throw Error('untrusted_desktop_sender');};
  ipcMain.handle('localagent:select-project',async event=>{check(event,false);const result=await dialog.showOpenDialog(win,{title:'Open a LocalAgent project',properties:['openDirectory']});return result.canceled?null:result.filePaths[0];});
  ipcMain.handle('localagent:status',event=>{check(event,true);return runtime?.status()||{state:'starting',stage:'starting'};});
  ipcMain.handle('localagent:restart',async event=>{check(event,true);if(restarting||runtime.status().state==='ready')return {accepted:false};restarting=true;try{await runtime.stop();await launch();return {accepted:true};}finally{restarting=false;}});
  async function launch(){try{
    const previousPreview=runtime.status().previewOrigin,url=await runtime.start();origin=url;
    await runtime.authenticateSession(session.defaultSession);
    // Refresh the document's strict CSP after the listener changes origin.
    // The workspace restores the saved project, session and draft on reload.
    if(!win.isDestroyed()&&(!safeWindowURL(win).startsWith(url+'/')||previousPreview&&previousPreview!==runtime.status().previewOrigin))await win.loadURL(url+'/');
  }catch{
    // A ready worker is insufficient if native authentication/document loading
    // fails. Stop it and expose the existing explicit retry, never a stuck splash.
    if(runtime.status().state==='ready'){await runtime.stop();runtime.failDesktopBootstrap();}
  }}
  app.whenReady().then(async()=>{
    const data=app.getPath('userData');
    session.defaultSession.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
    session.defaultSession.setPermissionCheckHandler(()=>false);
    win=new BrowserWindow({width:1380,height:940,minWidth:900,minHeight:640,show:false,title:'LocalAgent',backgroundColor:'#f5f4ef',autoHideMenuBar:true,icon:join(here,'../assets/icon.ico'),webPreferences:{preload:join(here,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true}});
    win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    win.webContents.on('will-navigate',(event,url)=>{if(!isDesktopURL(url,origin,splash,true))event.preventDefault();});
    win.webContents.on('will-attach-webview',event=>event.preventDefault());
    win.webContents.session.webRequest.onBeforeRequest((details,callback)=>{const preview=runtime?.status().previewOrigin;callback({cancel:!(details.url===splash||details.url.startsWith(pathToFileURL(here+'/').href)||origin&&details.url.startsWith(origin+'/')||preview&&details.url.startsWith(preview+'/p/'))});});
    win.webContents.on('render-process-gone',()=>{if(!quitting&&rendererRecoveries++===0)void win.loadURL(origin?origin+'/':splash);});
    win.once('ready-to-show',()=>win.show());
    win.on('session-end',()=>{quitting=true;void runtime?.stop();});
    Menu.setApplicationMenu(Menu.buildFromTemplate([{label:'File',submenu:[{label:'Open project…',accelerator:'CmdOrCtrl+O',click:()=>{if(runtime.status().state==='ready')win.webContents.send('localagent:open-project');}},{type:'separator'},{role:'quit',label:'Exit LocalAgent'}]},{label:'View',submenu:[{role:'reload'},{role:'resetZoom'},{role:'zoomIn'},{role:'zoomOut'},{role:'togglefullscreen'}]},{label:'Help',submenu:[{label:'Local help and recovery…',click:()=>shell.showItemInFolder(join(app.isPackaged?process.resourcesPath:root,'docs/RELEASE.md'))},{label:'About LocalAgent',click:()=>void dialog.showMessageBox(win,{type:'info',title:'LocalAgent',message:'LocalAgent '+app.getVersion(),detail:'Local-first coding · OpenCode + OmniRoute\nFree, local or BYOK inference under verified safeguards.'})}]}]));
    runtime=createRuntimeSupervisor({nodePath,workerPath:join(root,'src/workspace/desktop-worker.mjs'),stateDir:join(data,'runtime'),environment:{LOCALAGENT_ELECTRON_EXE:app.getPath('exe'),...(!app.isPackaged?{LOCALAGENT_ELECTRON_APP:resolve(here,'..')}:{})},onChange:status=>{if(!win.isDestroyed())win.webContents.send('localagent:status-changed',status);}});
    await win.loadURL(splash);await launch();
  }).catch(error=>{
    // This path precedes provider startup; retain only the local boot operation
    // failure, never runtime payloads, keys, prompts or hidden model content.
    try{writeFileSync(join(app.getPath('userData'),'desktop-boot-error.json'),JSON.stringify({code:'desktop_boot_failed',type:error.name,message:String(error.message).slice(0,500)}),{mode:0o600});}catch{}
    app.quit();
  });
  app.on('window-all-closed',()=>app.quit());
  app.on('before-quit',event=>{if(quitting)return;event.preventDefault();quitting=true;void runtime?.stop().finally(()=>app.exit(0));if(!runtime)app.exit(0);});
}
