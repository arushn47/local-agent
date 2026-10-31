import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,readdirSync,existsSync,rmSync,renameSync} from 'node:fs';
import {join,resolve,sep} from 'node:path';
import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{inspect,preserve}=require('../apps/desktop/installer-recovery.cjs'),upgrade=require('../apps/desktop/upgrade.cjs');
function fixture(){
 const root=mkdtempSync(join(tmpdir(),'localagent-recovery-')),target=join(root,'app');let registered=null,restores=0;
 const registry={capture:()=>({format:1,target,keys:[{exists:!!registered,values:[]},{exists:!!registered,values:registered?[{name:'DisplayVersion',value:registered}]:[]}]}),validate:()=>{},restore:s=>{restores++;registered=s.keys[1].values.find(v=>v.name==='DisplayVersion')?.value||null;}};
 const product=(dir,version)=>{mkdirSync(join(dir,'resources/runtime'),{recursive:true});writeFileSync(join(dir,'resources/runtime/package.json'),JSON.stringify({name:'localagent-platform',version}));writeFileSync(join(dir,'LocalAgent.exe'),'fixture '+version);};
 return {root,target,registry,product,setRegistered:v=>registered=v,restores:()=>restores,cleanup:()=>{assert.ok(resolve(root).startsWith(resolve(tmpdir())+sep));rmSync(root,{recursive:true,force:true});}};
}
test('unrecorded stage is preserved intact without touching active files or registration',()=>{
 const f=fixture();try{mkdirSync(f.target);mkdirSync(f.target+'.stage');writeFileSync(join(f.target+'.stage','unverified-project.txt'),'must survive');
 assert.equal(inspect(f.target,{registry:f.registry}).kind,'unrecorded_stage');const saved=preserve(f.target,{registry:f.registry});
 assert.equal(readFileSync(join(saved.directory,'stage/unverified-project.txt'),'utf8'),'must survive');assert.equal(existsSync(f.target+'.stage'),false);assert.equal(f.restores(),0);assert.deepEqual(readdirSync(f.target),[]);
 }finally{f.cleanup();}
});
test('successful committed upgrade is not automatically rolled back on the next install',()=>{
 const f=fixture();try{f.product(f.target,'0.5.1');f.setRegistered('0.5.1');f.product(f.target+'.stage','0.5.2');upgrade.install(f.target,{registry:f.registry,validate:()=> '0.5.2'});f.setRegistered('0.5.2');
 const p=f.target+'.transaction.json',j=JSON.parse(readFileSync(p));j.state='committed';writeFileSync(p,JSON.stringify(j));
 assert.equal(inspect(f.target,{registry:f.registry}).kind,'completed_install');const saved=preserve(f.target,{registry:f.registry});assert.equal(upgrade.product(f.target),'0.5.2');assert.equal(upgrade.product(join(saved.directory,'rollback')),'0.5.1');assert.equal(f.restores(),0);
 }finally{f.cleanup();}
});
test('interrupted activation restores prior files and registration, retaining failed candidate and journal',()=>{
 const f=fixture();try{f.product(f.target,'0.5.1');f.setRegistered('0.5.1');f.product(f.target+'.stage','0.5.2');upgrade.install(f.target,{registry:f.registry,validate:()=> '0.5.2'});f.setRegistered('0.5.2');
 assert.equal(inspect(f.target,{registry:f.registry}).kind,'interrupted_transaction');const saved=preserve(f.target,{registry:f.registry,action:'restore'});assert.equal(upgrade.product(f.target),'0.5.1');assert.equal(upgrade.product(join(saved.directory,'stage')),'0.5.2');assert.equal(JSON.parse(readFileSync(join(saved.directory,'transaction.json'))).state,'rolled_back');assert.ok(f.restores()>0);
 }finally{f.cleanup();}
});
test('prepared transaction without moved files can be restored and preserved before retry',()=>{
 const f=fixture();try{f.product(f.target,'0.5.1');f.setRegistered('0.5.1');f.product(f.target+'.stage','0.5.2');writeFileSync(f.target+'.transaction.json',JSON.stringify({format:2,state:'prepared',version:'0.5.2',previousVersion:'0.5.1',registration:f.registry.capture()}));
 const saved=preserve(f.target,{registry:f.registry,action:'restore'});assert.equal(upgrade.product(f.target),'0.5.1');assert.ok(existsSync(join(saved.directory,'stage/LocalAgent.exe')));
 }finally{f.cleanup();}
});
test('invalid journals, orphan backups and foreign registration fail closed without deleting material',()=>{
 const f=fixture();try{f.product(f.target+'.rollback','0.5.1');assert.equal(inspect(f.target,{registry:f.registry}).kind,'unrecorded_rollback');assert.throws(()=>preserve(f.target,{registry:f.registry}),/not_available/);writeFileSync(f.target+'.transaction.json','broken');assert.equal(inspect(f.target,{registry:f.registry}).kind,'invalid_journal');assert.ok(existsSync(f.target+'.rollback/LocalAgent.exe'));assert.throws(()=>inspect(f.target,{registry:{capture:()=>{throw Error();}}}),/ownership/);
 }finally{f.cleanup();}
});
test('interrupted preservation records both moved and unmoved material and never deletes it',()=>{
 const f=fixture();try{mkdirSync(f.target+'.stage');writeFileSync(f.target+'.stage/keep.txt','keep');writeFileSync(f.target+'.transaction.json.tmp','unfinished');let calls=0;
 assert.throws(()=>preserve(f.target,{registry:f.registry,move:(a,b)=>{if(++calls===2)throw Error('held_file');renameSync(a,b);}}),/retained at/);
 const archive=join(f.root,readdirSync(f.root).find(n=>n.startsWith('app.recovery-')));assert.equal(readFileSync(join(archive,'stage/keep.txt'),'utf8'),'keep');assert.equal(readFileSync(f.target+'.transaction.json.tmp','utf8'),'unfinished');assert.equal(JSON.parse(readFileSync(join(archive,'recovery.json'))).state,'preservation_incomplete');
 }finally{f.cleanup();}
});
test('stale rolled-back journal with missing prior installation can preserve material for fresh install',()=>{
 const f=fixture();try{mkdirSync(f.target);f.product(f.target+'.stage','0.5.1');writeFileSync(f.target+'.transaction.json',JSON.stringify({format:2,state:'rolled_back',version:'0.5.1',previousVersion:'0.3.0',registration:f.registry.capture()}));
 assert.equal(inspect(f.target,{registry:f.registry}).kind,'missing_restored_install');const saved=preserve(f.target,{registry:f.registry});assert.equal(upgrade.product(join(saved.directory,'stage')),'0.5.1');assert.equal(f.restores(),0);assert.deepEqual(readdirSync(f.target),[]);
 }finally{f.cleanup();}
});
