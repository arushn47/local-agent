import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { request } from 'node:http';
import { createWorkspaceServer } from '../src/workspace/server.mjs';
import { safeMessages, toolChanges } from '../src/workspace/tasks.mjs';
import { dpapi, credentialStore } from '../src/workspace/credentials.mjs';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig, loadEnvironment, setCredentialOverlay } from '../src/config.mjs';

async function fixture(t){
 const updates=[];const projects={list:()=>[],add:p=>({id:'test',path:p})};
 const server=createWorkspaceServer({config:loadConfig(),projects,tasks:{},credentials:{update:async(p,b)=>updates.push({p,...b})},refreshProviders:async()=>{},port:0});
 server.listen(0,'127.0.0.1');await once(server,'listening');t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));});
 const base='http://127.0.0.1:'+server.address().port;
 const root=await fetch(base);const cookie=root.headers.get('set-cookie').split(';')[0];await root.text();
 return {base,cookie,updates,headers:{cookie,origin:base,'X-LocalAgent-Request':'1','Content-Type':'application/json'}};
}

test('desktop HTTP bootstrap cannot mint API credentials for a local client',async t=>{
 const prior=process.env.LOCALAGENT_DESKTOP,priorCookie=process.env.LOCALAGENT_WORKSPACE_COOKIE;
 process.env.LOCALAGENT_DESKTOP='1';process.env.LOCALAGENT_WORKSPACE_COOKIE='a'.repeat(64);let server;
 try{server=createWorkspaceServer({config:loadConfig(),projects:{list:()=>[]},tasks:{},credentials:{},port:0});
 delete process.env.LOCALAGENT_WORKSPACE_COOKIE;assert.throws(()=>createWorkspaceServer({config:loadConfig(),projects:{},tasks:{},credentials:{}}),/desktop_authentication_unavailable/);
 }finally{if(prior===undefined)delete process.env.LOCALAGENT_DESKTOP;else process.env.LOCALAGENT_DESKTOP=prior;if(priorCookie===undefined)delete process.env.LOCALAGENT_WORKSPACE_COOKIE;else process.env.LOCALAGENT_WORKSPACE_COOKIE=priorCookie;}
 server.listen(0,'127.0.0.1');await once(server,'listening');t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));});
 const base='http://127.0.0.1:'+server.address().port,root=await fetch(base);await root.text();assert.equal(root.headers.get('set-cookie'),null);
 assert.equal((await fetch(base+'/api/v1/projects')).status,401);assert.equal((await fetch(base+'/api/v1/projects',{headers:{cookie:'localagent='+'a'.repeat(64)}})).status,200);
});
test('workspace API requires a session and protects mutations from cross-origin requests',async t=>{
 const f=await fixture(t);assert.equal((await fetch(f.base+'/api/v1/projects')).status,401);
 assert.equal((await fetch(f.base+'/api/v1/projects',{headers:{cookie:f.cookie}})).status,200);
 assert.equal((await fetch(f.base+'/api/v1/projects',{method:'POST',headers:{cookie:f.cookie},body:'{}'})).status,403);
 assert.equal((await fetch(f.base+'/api/v1/projects',{method:'POST',headers:{...f.headers,origin:'https://untrusted.example'},body:'{}'})).status,403);
 const rebound=await new Promise((resolve,reject)=>{const r=request(new URL(f.base+'/api/v1/projects'),{headers:{cookie:f.cookie,host:'untrusted.example'}},response=>{response.resume();resolve(response.statusCode);});r.once('error',reject);r.end();});
 assert.equal(rebound,403);
});
test('credential submission returns metadata only and does not echo the submitted key',async t=>{
 const f=await fixture(t);const response=await fetch(f.base+'/api/v1/providers/openrouter',{method:'POST',headers:f.headers,body:JSON.stringify({key:'sensitive-test-value'})});
 assert.equal(response.status,200);const text=await response.text();assert.ok(!text.includes('sensitive-test-value'));assert.equal(f.updates[0].key,'sensitive-test-value');
 const status=await fetch(f.base+'/api/v1/status',{headers:{cookie:f.cookie}});const data=await status.json();assert.ok(data.providers.every(p=>!('key' in p)));assert.equal(data.policy,'free-only');
});
test('unknown endpoints and malformed JSON cannot dispatch arbitrary runtime methods',async t=>{
 const f=await fixture(t);assert.equal((await fetch(f.base+'/api/v1/admin/providers',{method:'POST',headers:f.headers,body:'{}'})).status,404);
 assert.equal((await fetch(f.base+'/api/v1/providers/openrouter',{method:'POST',headers:f.headers,body:'{invalid'})).status,400);assert.equal(f.updates.length,0);
});
test('message projection excludes reasoning, signatures and arbitrary provider metadata',()=>{
 const value=safeMessages([{info:{id:'m',role:'assistant',metadata:{key:'private'}},parts:[{type:'reasoning',text:'hidden-reasoning'},{type:'text',text:'Visible answer'},{type:'tool',tool:'bash',state:{status:'completed',input:{command:'node --test'},output:'2 passed',metadata:{exit:0,thoughtSignature:'private-signature',nested:{key:'secret'}}}}]}]);
 const json=JSON.stringify(value);assert.ok(json.includes('Visible answer'));assert.ok(json.includes('2 passed'));assert.ok(!json.includes('hidden-reasoning'));assert.ok(!json.includes('signature'));assert.ok(!json.includes('private'));assert.equal(value[0].parts[1].exit,0);
});
test('disconnect overrides inherited/file keys instead of silently reactivating them',()=>{
 setCredentialOverlay({GEMINI_API_KEY:null});assert.equal(loadEnvironment([],{GEMINI_API_KEY:'old'}).GEMINI_API_KEY,undefined);setCredentialOverlay({});
});
test('partial streamed tool records render safely and completed upstream patches populate changes',()=>{
 const messages=[{info:{id:'x',role:'assistant'},parts:[{type:'tool',tool:'edit'},{type:'tool',tool:'edit',state:{status:'completed',metadata:{filediff:{file:'double.mjs',patch:'-return n;\n+return n * 2;',additions:1,deletions:1}}}},{type:'tool',tool:'write',state:{status:'completed',input:{filePath:'double.test.mjs',content:'test code'}}}]}];
 assert.equal(safeMessages(messages)[0].parts[0].status,'pending');const changes=toolChanges(messages);assert.equal(changes.length,2);assert.equal(changes[0].file,'double.mjs');assert.ok(changes[0].patch.includes('return n * 2'));assert.equal(changes[1].after,'test code');assert.equal(changes[1].snapshot,true);assert.equal(changes[1].before,undefined);
});
test('provider onboarding requires literal free-tier confirmation and supports encrypted removal',{skip:process.platform!=='win32'},async()=>{
 const folder=mkdtempSync(join(tmpdir(),'localagent-credentials-'));
 try{
   const store=await credentialStore({file:join(folder,'credentials.dpapi')});
   await assert.rejects(store.update('gemini',{key:'test-only',confirmed:'false'}),/free_tier_confirmation_required/);
   await store.update('gemini',{key:'test-only',confirmed:true});assert.equal(loadEnvironment([]).GEMINI_API_KEY,'test-only');
   await store.update('gemini',{remove:true});assert.equal(loadEnvironment([],{GEMINI_API_KEY:'inherited'}).GEMINI_API_KEY,undefined);
   await credentialStore({file:join(folder,'credentials.dpapi')});assert.equal(loadEnvironment([],{GEMINI_API_KEY:'inherited'}).GEMINI_API_KEY,undefined);
 }finally{setCredentialOverlay({});rmSync(folder,{recursive:true,force:true});}
});
test('Windows credential protection round-trips with no plaintext ciphertext',{skip:process.platform!=='win32'},async()=>{
 const plain=Buffer.from('localagent-test-placeholder');const encrypted=await dpapi(plain);assert.ok(!encrypted.includes(plain));assert.deepEqual(await dpapi(encrypted,true),plain);
});
test('project file endpoints safely list files and read contents while rejecting secrets and path escapes',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'localagent-files-'));
 writeFileSync(join(dir,'hello.txt'),'world');
 writeFileSync(join(dir,'.env'),'SECRET=123');
 mkdirSync(join(dir,'sub'));
 writeFileSync(join(dir,'sub','code.js'),'console.log("ok");');
 const projects={list:()=>[{id:'prj_test',path:dir}],get:id=>id==='prj_test'?{id:'prj_test',path:dir}:(()=>{throw Error('project_not_found');})()};
 const server=createWorkspaceServer({config:loadConfig(),projects,tasks:{},credentials:{},port:0});
 server.listen(0,'127.0.0.1');await once(server,'listening');t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));rmSync(dir,{recursive:true,force:true});});
 const base='http://127.0.0.1:'+server.address().port;
 const root=await fetch(base);const cookie=root.headers.get('set-cookie').split(';')[0];await root.text();
 const headers={cookie};

 const listRes=await fetch(base+'/api/v1/projects/prj_test/files',{headers});
 assert.equal(listRes.status,200);
 const items=await listRes.json();
 assert.ok(items.some(i=>i.name==='hello.txt'));
 assert.ok(items.some(i=>i.name==='code.js'));
 assert.ok(!items.some(i=>i.name==='.env'));

 const readRes=await fetch(base+'/api/v1/projects/prj_test/files/content?path=hello.txt',{headers});
 assert.equal(readRes.status,200);
 const fileData=await readRes.json();
 assert.equal(fileData.content,'world');

 const secretRes=await fetch(base+'/api/v1/projects/prj_test/files/content?path=.env',{headers});
 assert.equal(secretRes.status,400);

 const escapeRes=await fetch(base+'/api/v1/projects/prj_test/files/content?path=../outside.txt',{headers});
 assert.equal(escapeRes.status,400);
});
