import {createRefreshQueue} from '../apps/workspace/src/refresh.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,existsSync,renameSync} from 'node:fs';
import {resolve,join,sep} from 'node:path';
import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';
import {createTasks} from '../src/workspace/tasks.mjs';
import {tuneGateway} from '../scripts/gateway-config.mjs';
const require=createRequire(import.meta.url),{install,recover}=require('../apps/desktop/upgrade.cjs'),registration=require('../apps/desktop/registration.cjs');
function temp(){const p=mkdtempSync(join(tmpdir(),'localagent-stabilize-'));assert.ok(resolve(p).startsWith(resolve(tmpdir())+sep));return p;}
test('concurrent snapshots share upstream reads without retaining stale results',async()=>{
 const directory=temp();let messages=0,permissions=0,diffs=0;
 const client={session:{create:async()=>({data:{id:'ses_fixture'}}),messages:async()=>{messages++;await new Promise(r=>setTimeout(r,20));return {data:[]};},diff:async()=>{diffs++;return {data:[]};}},permission:{list:async()=>{permissions++;return {data:[]};}}};
 const tasks=createTasks({forProject:()=>client},{get:()=>({path:directory})},{sessionFile:join(directory,'sessions.json')});
 try{await tasks.create('project');const [a,b]=await Promise.all([tasks.snapshot('ses_fixture'),tasks.snapshot('ses_fixture')]);assert.equal(a,b);assert.deepEqual([messages,permissions,diffs],[1,1,1]);await tasks.snapshot('ses_fixture');assert.deepEqual([messages,permissions,diffs],[2,2,2]);}finally{tasks.stop();rmSync(directory,{recursive:true,force:true});}
});
test('documented Next tuning changes only preload flag and rejects incompatible artifacts',()=>{
 const dir=temp();try{mkdirSync(join(dir,'dist'));writeFileSync(join(dir,'package.json'),JSON.stringify({version:'3.8.52'}));const config={output:'standalone',experimental:{preloadEntriesOnStart:true},security:'preserve'};writeFileSync(join(dir,'dist/server.js'),'const nextConfig = '+JSON.stringify(config)+'\n');tuneGateway(dir);assert.deepEqual(JSON.parse(readFileSync(join(dir,'dist/server.js'),'utf8').slice(19)),{...config,experimental:{preloadEntriesOnStart:false}});assert.equal(tuneGateway(dir).previous,false);writeFileSync(join(dir,'package.json'),'{"version":"unknown"}');assert.throws(()=>tuneGateway(dir),/upstream upgrade/);}finally{rmSync(dir,{recursive:true,force:true});}
});
test('rollback restores registration and retries pending registry recovery without moving files twice',()=>{
 const dir=temp(),target=join(dir,'app');const product=(p,v)=>{mkdirSync(join(p,'resources/runtime'),{recursive:true});writeFileSync(join(p,'resources/runtime/package.json'),JSON.stringify({name:'localagent-platform',version:v}));writeFileSync(join(p,'LocalAgent.exe'),v);};
 let current='0.5.0',fail=false;const registry={capture:()=>({version:current}),restore:s=>{if(fail)throw Error('registry_locked');current=s.version;}};
 try{product(target,'0.5.0');product(target+'.stage','0.5.1');install(target,{validate:()=> '0.5.1',registry});current='0.5.1';fail=true;assert.throws(()=>recover(target,{registry}),/registry_locked/);assert.equal(readFileSync(join(target,'LocalAgent.exe'),'utf8'),'0.5.0');assert.equal(JSON.parse(readFileSync(target+'.transaction.json')).state,'registry_restore_pending');fail=false;recover(target,{registry});assert.equal(current,'0.5.0');assert.equal(JSON.parse(readFileSync(target+'.transaction.json')).state,'rolled_back');assert.equal(recover(target,{registry}).alreadyRestored,true);}finally{rmSync(dir,{recursive:true,force:true});}
});
test('registration restoration rejects paths outside the two fixed app keys',()=>{
 const target=resolve('.localagent/fixture');assert.throws(()=>registration.validate({format:1,target,keys:[{path:'Software\\Other',exists:true,values:[]},{path:registration.keys[1],exists:false,values:[]}]},target),/snapshot/);
});


test('explicit task refresh waits for in-flight idle refresh then reads session',async()=>{
 let release;const gate=new Promise(r=>release=r),reads=[];
 const refresh=createRefreshQueue(async options=>{reads.push(options.includeSession);if(reads.length===1)await gate;});
 const idle=refresh({includeSession:false,force:false});await Promise.resolve();const action=refresh();assert.deepEqual(reads,[false]);release();await Promise.all([idle,action]);assert.deepEqual(reads,[false,true]);
});

test('background active ticks coalesce and failed observations do not lock refresh',async()=>{
 let release,reads=0;const gate=new Promise(r=>release=r);const refresh=createRefreshQueue(async()=>{reads++;await gate;if(reads===1)throw Error('offline');});
 const first=refresh({force:false}),second=refresh({force:false});assert.equal(first,second);release();await assert.rejects(first,/offline/);await refresh({force:false});assert.equal(reads,2);
});


test('Windows sharing denial retries only bounded, non-overwriting directory moves',()=>{
 const {moveDirectory}=require('../apps/desktop/upgrade.cjs'),dir=temp(),source=join(dir,'from'),target=join(dir,'to');mkdirSync(source);let calls=0,waits=0;
 try{moveDirectory(source,target,{platform:'win32',wait:()=>waits++,rename:(a,b)=>{if(++calls<3)throw Object.assign(Error('sharing'),{code:'EPERM'});renameSync(a,b);}});assert.equal(calls,3);assert.equal(waits,2);assert.ok(existsSync(target));let persistent=0;assert.throws(()=>moveDirectory(target,source,{platform:'win32',wait:()=>{},rename:()=>{persistent++;throw Object.assign(Error('still locked'),{code:'EBUSY'});}}),/still locked/);assert.equal(persistent,21);assert.ok(existsSync(target));assert.ok(!existsSync(source));}finally{rmSync(dir,{recursive:true,force:true});}
});

test('directory sharing retries never override an existing destination or unrelated errors',()=>{
 const {moveDirectory}=require('../apps/desktop/upgrade.cjs'),dir=temp(),source=join(dir,'from'),target=join(dir,'to');mkdirSync(source);mkdirSync(target);let waited=0;
 try{assert.throws(()=>moveDirectory(source,target,{platform:'win32',wait:()=>waited++,rename:()=>{throw Object.assign(Error('blocked'),{code:'EPERM'});}}),/blocked/);assert.equal(waited,0);assert.throws(()=>moveDirectory(source,join(dir,'new'),{platform:'win32',wait:()=>waited++,rename:()=>{throw Object.assign(Error('invalid'),{code:'EINVAL'});}}),/invalid/);assert.equal(waited,0);}finally{rmSync(dir,{recursive:true,force:true});}
});
