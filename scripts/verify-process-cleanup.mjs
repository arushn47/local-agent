import {readFileSync, statSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
const files=['profile-baseline.json','profile-smol-pilot.json','soak/packaged-fixture.json','foreground-soak/packaged-fixture.json','extended-a11y/accessibility.json'];
const tracked=[];
for(const file of files){
 const path=join('validation/phase52',file),r=JSON.parse(readFileSync(path));
 const start=Number(r.profile.match(/(\d{13})$/)?.[1]),end=statSync(path).mtimeMs;
 if(!Number.isFinite(start))throw Error('Test profile start time missing');
 const ids=new Set(r.runtimePids||[]);
 for(const s of [r.idle,r.active,r.after,...(r.soak?.samples||r.soak||[])].filter(Boolean))for(const p of s.processes||s.os||[])ids.add(p.Id);
 for(const pid of ids)tracked.push({file,pid,start,end});
}
const env={SystemRoot:process.env.SystemRoot,LOCALAGENT_PROCESS_CLEANUP_IDS:[...new Set(tracked.map(x=>x.pid))].join(',')};
const code="$ids=$env:LOCALAGENT_PROCESS_CLEANUP_IDS.Split(',')|ForEach-Object {[int]$_};$filter=($ids|ForEach-Object {'ProcessId = '+$_}) -join ' OR ';$rows=@(Get-CimInstance Win32_Process -Filter $filter -ErrorAction Stop | Select-Object ProcessId,ParentProcessId,@{n='createdMs';e={([DateTimeOffset]$_.CreationDate).ToUnixTimeMilliseconds()}});ConvertTo-Json -InputObject $rows -Compress";
const result=spawnSync(join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-NonInteractive','-Command',code],{env,windowsHide:true,encoding:'utf8',timeout:15000});
if(result.status!==0)throw Error('Native process query failed');
const live=JSON.parse(result.stdout),original=live.filter(p=>tracked.some(t=>t.pid===p.ProcessId&&p.createdMs>=t.start&&p.createdMs<=t.end));
const report={scope:'Tracked baseline/pilot/failed-soak/extended-audit PIDs; creation times distinguish PID reuse. Not a global process-leak certification.',trackedPids:new Set(tracked.map(t=>t.pid)).size,liveOriginalProcesses:original,reusedPids:live.filter(p=>!original.includes(p)).map(p=>p.ProcessId),passed:original.length===0};
writeFileSync('validation/phase52/process-cleanup.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;
