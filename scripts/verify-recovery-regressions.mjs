// Isolate legacy UI verifiers: they intentionally seed catalog/state and write
// screenshots. Never run those mutations against the developer's own profile.
import { cpSync, mkdirSync, mkdtempSync, symlinkSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { root } from '../src/config.mjs';
const isolated=mkdtempSync(join(tmpdir(),'localagent-ui-regression-'));
for(const name of ['src','scripts','apps'])cpSync(join(root,name),join(isolated,name),{recursive:true});
for(const name of ['package.json','localagent.config.json'])cpSync(join(root,name),join(isolated,name));
symlinkSync(join(root,'node_modules'),join(isolated,'node_modules'),process.platform==='win32'?'junction':'dir');
mkdirSync(join(isolated,'.localagent'));
const env={...process.env,LOCALAGENT_STATE_DIR:join(isolated,'.localagent'),LOCALAGENT_DESKTOP:'0'};
for(const key of Object.keys(env))if(/API_KEY|TOKEN|SECRET|PASSWORD/.test(key))delete env[key];
const checks=[];
for(const script of ['verify-phase7-ui.mjs','verify-phase8-workflows.mjs','verify-workflow-recovery-ui.mjs']){
  const result=spawnSync(process.execPath,[join(isolated,'scripts',script)],{cwd:isolated,env,windowsHide:true,encoding:'utf8',timeout:120000});
  writeFileSync(join(isolated,script+'.log'),(result.stdout||'')+(result.stderr||''));
  checks.push({script,passed:result.status===0,error:result.error?.code});
}
const phase7=JSON.parse(readFileSync(join(isolated,'validation/phase7-research/phase7-verification.json'),'utf8'));
checks[0].passed&&=phase7.passed;
console.log(JSON.stringify({passed:checks.every(c=>c.passed),inferenceRequests:0,checks,phase7Incomplete:phase7.audits?.flatMap(a=>a.incomplete?.map(i=>i.id)||[])},null,2));
if(checks.some(c=>!c.passed))process.exitCode=1;
