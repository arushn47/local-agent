// Installer-owned directory transaction. Never reads or writes user data.
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const registration=require('./registration.cjs');
function canonical(p){return path.resolve(p).toLowerCase();}
function paths(target){
 if(!target||!path.isAbsolute(target)||path.dirname(target)===target)throw Error('invalid_install_target');
 target=path.resolve(target);
 for(let p=target;;p=path.dirname(p)){if(fs.existsSync(p)&&fs.lstatSync(p).isSymbolicLink())throw Error('linked_install_target');if(path.dirname(p)===p)break;}
 for(const file of [target+'.stage',target+'.rollback',target+'.transaction.json'])if(fs.existsSync(file)){const s=fs.lstatSync(file);if(s.isSymbolicLink()||!s.isDirectory()&&s.nlink!==1)throw Error('linked_transaction_path');}
 return {target,stage:target+'.stage',backup:target+'.rollback',journal:target+'.transaction.json'};
}
function product(dir){
 if(fs.lstatSync(dir).isSymbolicLink()||canonical(fs.realpathSync(dir))!==canonical(dir))throw Error('linked_product');
 const p=JSON.parse(fs.readFileSync(path.join(dir,'resources/runtime/package.json')));
 if(p.name!=='localagent-platform'||!['0.3.0','0.4.0','0.5.0','0.5.1','0.5.2'].includes(p.version)||!fs.existsSync(path.join(dir,'LocalAgent.exe')))throw Error('invalid_product');
 return p.version;
}
function journal(p,state,extra={}){const tmp=p.journal+'.tmp';if(fs.existsSync(tmp)&&(fs.lstatSync(tmp).isSymbolicLink()||fs.lstatSync(tmp).nlink!==1))throw Error('linked_transaction_path');fs.writeFileSync(tmp,JSON.stringify({...extra,format:2,state}),{flag:'w',mode:0o600});fs.renameSync(tmp,p.journal);}
function validateStage(p){
 const version=product(p.stage),runtime=path.join(p.stage,'resources/runtime'),node=path.join(p.stage,'resources/node/node.exe');
 const pins=JSON.parse(fs.readFileSync(path.join(runtime,'integrations/runtime-versions.json')));
 for(const [exe,args,expected]of [[node,['--version'],'v'+pins.node],[path.join(runtime,'node_modules/opencode-ai/bin/opencode.exe'),['--version'],pins.opencode]]){
  const r=spawnSync(exe,args,{windowsHide:true,encoding:'utf8',timeout:15000});if(r.status!==0||r.stdout.trim()!==expected)throw Error('staged_runtime_invalid');
 }
 const sqlite=spawnSync(node,['-e',"const D=require('better-sqlite3');const d=new D(':memory:');d.prepare('SELECT 1').get();d.close()"],{cwd:runtime,windowsHide:true,timeout:15000});
 if(sqlite.status!==0||!fs.existsSync(path.join(runtime,'apps/workspace/dist/index.html'))||!fs.existsSync(path.join(runtime,'node_modules/omniroute/dist/server-ws.mjs')))throw Error('staged_runtime_invalid');
 return version;
}
// Windows can briefly deny a directory move while an exiting process/scanner
// releases a descendant handle. Never bypass permissions or overwrite a target.
function moveDirectory(from,to,{rename=fs.renameSync,wait=ms=>Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,ms),platform=process.platform}={}){
 for(let attempt=0;;attempt++){try{return rename(from,to);}catch(e){
  if(platform!=='win32'||!['EPERM','EBUSY'].includes(e.code)||attempt>=20||!fs.existsSync(from)||fs.existsSync(to))throw e;
  if(fs.lstatSync(from).isSymbolicLink())throw Error('linked_transaction_path');wait(100);
 }}
}
function install(target,{validate=validateStage,rename=moveDirectory,writeState=journal,registry=registration}={}){
 const p=paths(target);if(fs.existsSync(p.backup))throw Error('rollback_already_retained');
 const previous=fs.existsSync(p.target)&&fs.readdirSync(p.target).length>0;
 const previousVersion=previous?product(p.target):null;
 const version=validate(p),snapshot=registry.capture(p.target),context={version,previousVersion,registration:snapshot};writeState(p,'prepared',context);let moved=false;
 try{
  if(previous){rename(p.target,p.backup);moved=true;writeState(p,'old_moved',context);}
  else if(fs.existsSync(p.target))fs.rmdirSync(p.target);
  rename(p.stage,p.target);writeState(p,'installed',{...context,rollbackAvailable:moved});
 }catch(e){
  if(moved){if(fs.existsSync(p.target))rename(p.target,p.stage);rename(p.backup,p.target);journal(p,'registry_restore_pending',context);registry.restore(snapshot,p.target);journal(p,'restored',context);}
  throw e;
 }
 return {version,rollbackAvailable:moved};
}
function recover(target,{registry=registration}={}){
 const p=paths(target),context=JSON.parse(fs.readFileSync(p.journal));if(context.format!==2||!context.registration)throw Error('registration_snapshot_missing');registry.validate?.(context.registration,p.target);
 if(context.previousVersion===null&&!fs.existsSync(p.backup)){registry.restore(context.registration,p.target);journal(p,'restored',context);return {restored:true,registrationRestored:true,previousInstallation:false};}
 if(['restored','rolled_back'].includes(context.state)&&fs.existsSync(p.target)&&!fs.existsSync(p.backup)){if(product(p.target)!==context.previousVersion)throw Error('recovery_version_mismatch');registry.restore(context.registration,p.target);return {restored:true,registrationRestored:true,alreadyRestored:true};}
 if(context.state==='registry_restore_pending'){if(product(p.target)!==context.previousVersion)throw Error('recovery_version_mismatch');registry.restore(context.registration,p.target);journal(p,'rolled_back',context);return {restored:true,registrationRestored:true};}
 if(!fs.existsSync(p.backup)&&context.state==='prepared'){registry.restore(context.registration,p.target);return {restored:true,registrationRestored:true,filesUnchanged:true};}
 if(product(p.backup)!==context.previousVersion)throw Error('recovery_version_mismatch');
 if(fs.existsSync(p.stage)&&fs.existsSync(p.target))throw Error('staging_directory_exists');
 if(fs.existsSync(p.target))product(p.target);
 let moved=false;
 try{if(fs.existsSync(p.target)){moveDirectory(p.target,p.stage);moved=true;}moveDirectory(p.backup,p.target);journal(p,'registry_restore_pending',context);registry.restore(context.registration,p.target);journal(p,'rolled_back',context);}
 catch(e){if(moved&&!fs.existsSync(p.target))moveDirectory(p.stage,p.target);throw e;}
 // Retain the unsuccessful version for diagnosis; never delete it implicitly.
 return {restored:true,registrationRestored:true,failedVersionRetained:moved};
}
function commit(target){const p=paths(target),context=JSON.parse(fs.readFileSync(p.journal));if(context.format!==2||product(p.target)!==context.version)throw Error('invalid_commit');const current=registration.capture(p.target);if(current.keys[1].values.find(v=>v.name==='DisplayVersion')?.value!==context.version)throw Error('registration_commit_failed');journal(p,'committed',context);return {committed:true};}
module.exports={paths,product,install,recover,commit,moveDirectory};
if(require.main===module){try{const operation=process.argv[2];if(!['install','recover','commit'].includes(operation))throw Error('invalid_operation');console.log(JSON.stringify(({install,recover,commit})[operation](process.argv[3])));}catch(e){console.error(e.message);process.exitCode=1;}}
