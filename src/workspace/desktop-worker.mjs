import { startWorkspace } from './application.mjs';
import { spawnSync } from 'node:child_process';
import { opencodeExe } from '../config.mjs';
import { runtimeVersions } from '../runtime-dependencies.mjs';
let application,starting=false,stopping=false;
const controller=new AbortController(),children=new Set();
const send=message=>{if(process.connected)process.send(message);};
async function stop(code=0,reason){
  if(stopping)return;stopping=true;controller.abort();application?.stop();
  const exits=[...children].map(child=>new Promise(r=>{if(child.exitCode!==null)return r();child.once('exit',r);child.kill();}));
  await Promise.race([Promise.all(exits),new Promise(r=>setTimeout(r,4000))]);
  if(reason)send({type:'failed',code:reason});else send({type:'stopped'});
  process.exit(code);
}
process.once('disconnect',()=>void stop());
process.once('SIGTERM',()=>void stop());process.once('SIGINT',()=>void stop());
process.once('uncaughtException',()=>void stop(1,'runtime_crashed'));
process.once('unhandledRejection',()=>void stop(1,'runtime_crashed'));
process.on('message',async message=>{
  if(message?.type==='stop')return void stop();
  if(message?.type!=='start'||starting||stopping)return;
  const ports=message.ports,values=ports&&['ui','engine','gateway','guard'].map(k=>ports[k]);
  if(!values||values.some(p=>!Number.isInteger(p)||p<1024||p>65535)||new Set(values).size!==4)return void stop(1,'invalid_runtime_ports');
  starting=true;
  try{
    const version=spawnSync(opencodeExe,['--version'],{windowsHide:true,encoding:'utf8',timeout:10000});
    if(process.versions.node!==runtimeVersions.node||version.status!==0||version.stdout.trim()!==runtimeVersions.opencode)throw Error('runtime_version_mismatch');
    application=await startWorkspace({ports,signal:controller.signal,onStage:stage=>send({type:'stage',stage}),onFailure:code=>void stop(1,code),onChild:(child,service)=>{
      children.add(child);send({type:'child',pid:child.pid,service});child.once('exit',()=>{children.delete(child);send({type:'child-exit',pid:child.pid});});
    }});
    if(stopping){application.stop();return;}
    send({type:'ready',url:application.url,previewOrigin:application.previewOrigin});
  }catch{if(!stopping)void stop(1,'startup_failed');}
});
