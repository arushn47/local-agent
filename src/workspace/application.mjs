import { loadConfig,root,secrets } from '../config.mjs';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { startPlatform } from '../runtime.mjs';
import { credentialStore } from './credentials.mjs';
import { projectStore } from './projects.mjs';
import { createTasks } from './tasks.mjs';
import { startEngine } from './engine.mjs';
import { createWorkspaceServer } from './server.mjs';
import {createPreviews} from './previews.mjs';
import {stateDir} from '../config.mjs';

// One application lifecycle shared by web and desktop; policy/agent stay upstream.
export async function startWorkspace({ports={ui:20140,engine:20144,gateway:20151,guard:20152},onChild=()=>{},onStage=()=>{},onFailure=()=>{},signal}={}){
  if(!existsSync(join(root,'apps/workspace/dist/index.html')))throw Error('workspace_not_built');
  const controller=new AbortController();
  if(signal){signal.addEventListener('abort',()=>controller.abort(),{once:true});if(signal.aborted)controller.abort();}
  const config=loadConfig();config.gatewayPort=ports.gateway;config.guardPort=ports.guard;
  let platform,engine,tasks,server,previews,stopped=false;
  const stop=()=>{if(stopped)return;stopped=true;controller.abort();server?.closeAllConnections();server?.close();previews?.close();tasks?.stop();engine?.stop();platform?.stop();};
  const fail=code=>{if(stopped)return;stop();onFailure(code);};
  try{
    secrets();onStage('credentials');const credentials=await credentialStore();controller.signal.throwIfAborted();
    platform=await startPlatform(config,{onChild,onStage,onFailure:fail,signal:controller.signal});
    onStage('engine');engine=await startEngine({port:ports.engine,onChild,signal:controller.signal});
    engine.child.once('exit',()=>fail('engine_exited'));
    const projects=projectStore();tasks=createTasks(engine,projects,{coordinateProject:true});controller.signal.throwIfAborted();
    previews=await createPreviews({projects,directory:join(stateDir,'previews'),uiOrigin:'http://127.0.0.1:'+ports.ui,onChild});
    server=createWorkspaceServer({config,projects,tasks,credentials,previews,engine,port:ports.ui});
    await new Promise((r,j)=>{server.once('error',j);server.listen(ports.ui,'127.0.0.1',r);});
    controller.signal.throwIfAborted();const url='http://127.0.0.1:'+server.address().port;
    onStage('ready');return {stop,url,previewOrigin:previews.origin};
  }catch(e){stop();throw e;}
}
