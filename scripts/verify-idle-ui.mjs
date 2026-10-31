import {_electron} from 'playwright';
import {resolve,join} from 'node:path';
import {mkdirSync,writeFileSync} from 'node:fs';
const profile=resolve('.localagent/idle-ui-'+Date.now()),exe=resolve('release/desktop-0.5.1/win-unpacked/LocalAgent.exe');let app;
const report={executable:exe,profile,inferenceRequests:0};
try{const env={...process.env,LOCALAGENT_USER_DATA_DIR:profile,PATH:process.env.SystemRoot+'\\System32;'+process.env.SystemRoot};for(const k of Object.keys(env))if(/API_KEY|TOKEN|SECRET|PASSWORD/i.test(k)||k.toLowerCase()==='path'&&k!=='PATH')delete env[k];const start=Date.now();app=await _electron.launch({executablePath:exe,env,timeout:30000});let page=await app.firstWindow();await page.getByRole('heading',{name:/A workspace for/}).waitFor({timeout:180000});report.startupMs=Date.now()-start;
 const fixture=resolve('.workspace-check/idle-ui-'+Date.now());mkdirSync(fixture,{recursive:true});
 const api=(p,b)=>page.evaluate(async({p,b})=>{const r=await fetch('/api/v1/'+p,{method:'POST',headers:{'Content-Type':'application/json','X-LocalAgent-Request':'1'},body:JSON.stringify(b)});if(!r.ok)throw Error('fixture_api_'+r.status);return r.json();},{p,b});
 const project=await api('projects',{path:fixture}),session=await api('projects/'+project.id+'/sessions',{});
 await page.evaluate(({project,session})=>localStorage.setItem('localagent.workspace',JSON.stringify({project:project.id,session:session.id,draft:''})),{project,session});await page.reload();await page.getByLabel('Describe your coding task').waitFor();await page.waitForResponse(r=>r.url().endsWith('/sessions/'+session.id),{timeout:10000}).catch(()=>{});
 let snapshots=0;const onRequest=r=>{if(r.url().endsWith('/api/v1/sessions/'+session.id))snapshots++;};page.on('request',onRequest);await new Promise(r=>setTimeout(r,10000));report.idleSessionReads=snapshots;report.sampleMs=10000;if(snapshots!==0)throw Error('idle_conversation_polled');report.passed=true;
}catch(e){report.passed=false;report.error=e.message;process.exitCode=1;}finally{if(app)await app.close().catch(()=>{});writeFileSync('validation/phase51/idle-ui.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
