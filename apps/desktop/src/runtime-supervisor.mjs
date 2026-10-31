import { fork,execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync,mkdirSync,readFileSync,writeFileSync,appendFileSync,statSync } from 'node:fs';
import { join,dirname } from 'node:path';
import { randomBytes } from 'node:crypto';

async function allocatePorts(){
  const servers=[];
  try{
    const ports={};for(const name of ['ui','engine','gateway','guard']){const server=createServer();servers.push(server);await new Promise((r,j)=>{server.once('error',j);server.listen(0,'127.0.0.1',r);});ports[name]=server.address().port;}
    return ports;
  }finally{await Promise.all(servers.map(s=>new Promise(r=>s.close(r))));}
}
export function createRuntimeSupervisor({nodePath,workerPath,stateDir,onChange=()=>{},environment={}}){
  mkdirSync(stateDir,{recursive:true});
  const cookie=randomBytes(32).toString('hex'),children=new Map();let child,ports,stopping=false,starting;
  let state={state:'stopped',stage:'stopped'};
  const metadata=()=>({ ...state,ports,pid:child?.pid,children:[...children].map(([pid,service])=>({pid,service})) });
  const update=value=>{
    state={...state,...value};writeFileSync(join(stateDir,'desktop-state.json'),JSON.stringify(metadata()));
    const file=join(stateDir,'desktop-lifecycle.jsonl');if(existsSync(file)&&statSync(file).size>131072)writeFileSync(file,'');
    appendFileSync(file,JSON.stringify({timestamp:new Date().toISOString(),...state})+'\n');onChange({...state});
  };
  const killChildren=()=>{for(const pid of children.keys()){try{if(process.platform==='win32')execFileSync(join(process.env.SystemRoot,'System32/taskkill.exe'),['/PID',String(pid),'/T','/F'],{windowsHide:true,stdio:'ignore',timeout:3000});else process.kill(pid);}catch{}}children.clear();};
  return {
    status:()=>({...state}),
    // Native-main-only bootstrap; deliberately absent from status, IPC and disk.
    authenticateSession:async session=>{
      if(state.state!=='ready'||state.url!==`http://127.0.0.1:${ports.ui}`)throw Error('runtime_not_ready');
      await session.cookies.set({url:state.url,name:'localagent',value:cookie,path:'/',httpOnly:true,sameSite:'strict'});
    },
    failDesktopBootstrap:()=>update({state:'failed',stage:'failed',code:'desktop_bootstrap_failed'}),
    async start(){
      if(starting)return starting;if(child)throw Error('runtime_already_started');stopping=false;
      starting=(async()=>{
        update({state:'starting',stage:'starting',code:undefined});
        const portsFile=join(stateDir,'desktop-ports.json');
        if(!ports){try{ports=JSON.parse(readFileSync(portsFile));if(!['ui','engine','gateway','guard'].every(k=>Number.isInteger(ports[k])&&ports[k]>=1024&&ports[k]<=65535))ports=undefined;}catch{}}
        ports ||= await allocatePorts();writeFileSync(portsFile,JSON.stringify(ports));
        const allowed=/^(SystemRoot|WINDIR|COMSPEC|USERPROFILE|USERNAME|APPDATA|LOCALAPPDATA|TEMP|TMP|PATH|PATHEXT|ProgramFiles|ProgramFiles\(x86\)|ProgramData|NUMBER_OF_PROCESSORS|PROCESSOR_ARCHITECTURE)$/i;
        const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>allowed.test(k)));
        Object.assign(env,environment,{LOCALAGENT_DESKTOP:'1',LOCALAGENT_STATE_DIR:stateDir,LOCALAGENT_WORKSPACE_COOKIE:cookie,NO_PROXY:'127.0.0.1,localhost,::1',OMNIROUTE_ENABLE_LIVE_WS:'0',EMBED_WS_PROXY_HOST:'127.0.0.1',EMBED_WS_PROXY_PORT:'0',PATH:dirname(nodePath)+(process.platform==='win32'?';':':')+(env.PATH||env.Path||'')});
        child=fork(workerPath,[],{execPath:nodePath,execArgv:[],cwd:dirname(workerPath),env,windowsHide:true,stdio:['ignore','ignore','ignore','ipc']});
        const current=child;
        return new Promise((resolve,reject)=>{
          let settled=false;
          const fail=code=>{if(settled)return;settled=true;clearTimeout(timer);update({state:'failed',stage:'failed',code});reject(Error(code));};
          const timer=setTimeout(()=>{fail('startup_timeout');current.send({type:'stop'});},180000);
          current.on('message',message=>{
            if(current!==child)return;
            if(message?.type==='child'&&Number.isInteger(message.pid)&&['gateway','engine','browser','validator'].includes(message.service)){children.set(message.pid,message.service);update({});}
            if(message?.type==='child-exit'){children.delete(message.pid);update({});}
            if(message?.type==='stage'&&typeof message.stage==='string'&&message.stage.length<50)update({stage:message.stage});
            if(message?.type==='ready'){
              if(message.url!==`http://127.0.0.1:${ports.ui}`)return fail('invalid_runtime_origin');
              if(message.previewOrigin&&!/^http:\/\/localhost:\d{1,5}$/.test(message.previewOrigin))return fail('invalid_preview_origin');
              settled=true;clearTimeout(timer);update({state:'ready',stage:'ready',code:undefined,url:message.url,previewOrigin:message.previewOrigin});resolve(message.url);
            }
            if(message?.type==='failed'){if(!settled)fail('startup_failed');else update({state:'failed',stage:'failed',code:'runtime_stopped'});}
          });
          current.once('error',()=>fail('runtime_spawn_failed'));
          current.once('exit',()=>{clearTimeout(timer);killChildren();if(current===child)child=undefined;if(!settled)fail(stopping?'stopped':'runtime_exited');else update({state:stopping?'stopped':'failed',stage:stopping?'stopped':'failed',code:stopping?undefined:'runtime_exited'});});
          current.send({type:'start',ports});
        });
      })();
      try{return await starting;}finally{starting=undefined;}
    },
    async stop(){
      stopping=true;const current=child;if(!current){killChildren();update({state:'stopped',stage:'stopped'});return;}
      update({state:'stopping',stage:'stopping'});
      await new Promise(resolve=>{
        const timer=setTimeout(()=>{killChildren();current.kill();resolve();},7000);
        current.once('exit',()=>{clearTimeout(timer);resolve();});
        if(current.connected)current.send({type:'stop'});else current.kill();
      });
      killChildren();if(child===current)child=undefined;update({state:'stopped',stage:'stopped',code:undefined});
    },
  };
}
