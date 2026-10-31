import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { createOpencodeClient } from '@opencode-ai/sdk/v2/client';
import { loadConfig, opencodeExe, stateDir } from '../config.mjs';
import { prepareGuidance } from './guidance.mjs';
import {withoutWorkspaceAuthentication} from '../runtime-environment.mjs';
export async function startEngine({port=20144,profileName='opencode-profile',onChild=()=>{},signal} = {}) {
  const profile=join(stateDir,profileName);for(const p of ['config','data','cache'])mkdirSync(join(profile,p),{recursive:true});
  const config=JSON.parse(readFileSync(join(stateDir,'opencode.json')));
  config.permission={'*':'ask',glob:'allow',grep:'allow',list:'allow',read:{'*':'allow','**/.env*':'deny','**/credentials*':'deny','**/.localagent/**':'deny'},external_directory:'deny',webfetch:'deny',task:'deny',skill:'deny'};
  // Desktop state is outside .localagent, so protect its absolute subtree too.
  config.permission.read[stateDir.replaceAll('\\','/')+'/**']='deny';
  // Opt-in ambient guidance lives in the engine's global config directory, which
  // upstream reads as AGENTS.md. It adds no request and changes no permission.
  await prepareGuidance({profileDirectory:profile, enabled:loadConfig().executionGuidance===true});
  const password=randomBytes(32).toString('hex'),baseUrl='http://127.0.0.1:'+port;
  const env=Object.fromEntries(Object.entries(withoutWorkspaceAuthentication(process.env)).filter(([k])=>!/(API_KEY|TOKEN|SECRET|PASSWORD)/i.test(k)));
  const child=spawn(opencodeExe,['serve','--pure','--hostname','127.0.0.1','--port',String(port)],{cwd:profile,windowsHide:true,env:{...env,OPENCODE_SERVER_PASSWORD:password,LOCALAGENT_GATEWAY_KEY:JSON.parse(readFileSync(join(stateDir,'gateway-key.json'))).key,OPENCODE_CONFIG_CONTENT:JSON.stringify(config),OPENCODE_CONFIG_DIR:join(profile,'config'),XDG_CONFIG_HOME:join(profile,'config'),XDG_DATA_HOME:join(profile,'data'),XDG_CACHE_HOME:join(profile,'cache'),OPENCODE_DISABLE_DEFAULT_PLUGINS:'true',OPENCODE_DISABLE_AUTOUPDATE:'true',OPENCODE_DISABLE_MODELS_FETCH:'true'},stdio:'ignore'});
  onChild(child,'engine');child.once('error',()=>{});
  const headers={Authorization:'Basic '+Buffer.from('opencode:'+password).toString('base64')};
  try{
    let ready=false;for(let i=0;i<80;i++){signal?.throwIfAborted();if(child.exitCode!==null)throw Error('engine_exited');try{const r=await fetch(baseUrl+'/global/health',{headers,signal:AbortSignal.timeout(1000)});if(r.ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,500));}
    if(!ready)throw Error('engine_startup_timeout');
    return {forProject:directory=>createOpencodeClient({baseUrl,headers,directory,throwOnError:true}),stop:()=>child.kill(),child};
  }catch(e){child.kill();throw e;}
}
