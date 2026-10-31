import {_electron as electron} from 'playwright';
import {resolve,join} from 'node:path';
import {readFileSync,writeFileSync} from 'node:fs';
const profile=resolve('.localagent/parent-exit-'+Date.now());
const app=await electron.launch({executablePath:resolve('release/win-unpacked/LocalAgent.exe'),env:{...process.env,LOCALAGENT_USER_DATA_DIR:profile},timeout:30000});
const page=await app.firstWindow();await page.waitForURL('http://127.0.0.1:*/',{timeout:180000});
const main=await app.evaluate(()=>process.pid),metadata=JSON.parse(readFileSync(join(profile,'runtime/desktop-state.json')));
const report={main,launcher:app.process().pid,worker:metadata.pid,children:metadata.children};
process.kill(main,'SIGKILL');await new Promise(r=>setTimeout(r,8000));
report.alive=[main,metadata.pid,...metadata.children.map(c=>c.pid)].map(pid=>{try{process.kill(pid,0);return {pid,alive:true};}catch{return {pid,alive:false};}});
writeFileSync('validation/phase3/parent-exit-diagnosis.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
for(const p of report.alive.filter(x=>x.alive)){try{process.kill(p.pid);}catch{}}
await app.close().catch(()=>{});
