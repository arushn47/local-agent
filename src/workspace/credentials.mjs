import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { stateDir, setCredentialOverlay } from '../config.mjs';
const names={gemini:'GEMINI_API_KEY',groq:'GROQ_API_KEY',openrouter:'OPENROUTER_API_KEY'};
export async function dpapi(value, decrypt=false) {
  if(process.platform!=='win32')throw Error('keychain_unavailable');
  const operation=decrypt?'Unprotect':'Protect';
  const script=`Add-Type -AssemblyName System.Security; $bytes=[Convert]::FromBase64String([Console]::In.ReadToEnd()); $result=[System.Security.Cryptography.ProtectedData]::${operation}($bytes,$null,[System.Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Convert]::ToBase64String($result))`;
  const child=spawn(join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-NonInteractive','-Command',script],{windowsHide:true,stdio:['pipe','pipe','ignore']});
  let output='';child.stdout.on('data',b=>output+=b);
  const timer=setTimeout(()=>child.kill(),10000);child.stdin.end(value.toString('base64'));
  try {const code=await new Promise((r,j)=>{child.once('exit',r);child.once('error',j);});if(code!==0)throw Error('keychain_unavailable');return Buffer.from(output.trim(),'base64');}finally{clearTimeout(timer);}
}
export async function credentialStore({file=join(stateDir,'credentials.dpapi')}={}) {
  let values={};
  if(existsSync(file))values=JSON.parse((await dpapi(readFileSync(file),true)).toString());
  setCredentialOverlay(values);
  return {
    async update(provider,{key,remove=false,confirmed=false}){
      if(!names[provider])throw Error('unknown_provider');
      if(key!==undefined&&(typeof key!=='string'||key.length>4096||/[\r\n\0]/.test(key)))throw Error('invalid_key');
      if(!remove&&!key)throw Error('key_required');
      if(!remove&&provider!=='openrouter'&&confirmed!==true)throw Error('free_tier_confirmation_required');
      const next={...values,[names[provider]]:remove?null:key};
      if(provider==='gemini')next.GEMINI_FREE_TIER_CONFIRMED=remove?null:'true';
      if(provider==='groq')next.GROQ_FREE_TIER_CONFIRMED=remove?null:'true';
      const encrypted=await dpapi(Buffer.from(JSON.stringify(next)));writeFileSync(file+'.tmp',encrypted,{mode:0o600});renameSync(file+'.tmp',file);values=next;setCredentialOverlay(values);
    },
  };
}
