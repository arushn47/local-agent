// Installer preflight: inspect without executing retained files; preserve, never delete.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const upgrade=require('./upgrade.cjs'),registration=require('./registration.cjs');
const states=new Set(['prepared','old_moved','installed','registry_restore_pending','restored','rolled_back','committed']);
function inspect(target,{registry=registration}={}){
 const p=upgrade.paths(target),tmp=p.journal+'.tmp';
 if(fs.existsSync(tmp)&&(fs.lstatSync(tmp).isSymbolicLink()||fs.lstatSync(tmp).nlink!==1))throw Error('linked_transaction_path');
 const present={stage:fs.existsSync(p.stage),rollback:fs.existsSync(p.backup),journal:fs.existsSync(p.journal),temporaryJournal:fs.existsSync(tmp)};
 const active=fs.existsSync(p.target)&&fs.readdirSync(p.target).length>0;
 let snapshot;try{snapshot=registry.capture(p.target);}catch{throw Error('Installation registration ownership could not be verified. Another location may be registered; review it before continuing.');}
 const version=dir=>{try{return upgrade.product(dir);}catch{return null;}};
 const currentVersion=active?version(p.target):null,stageVersion=present.stage?version(p.stage):null,rollbackVersion=present.rollback?version(p.backup):null;
 const report={target:p.target,present,currentVersion,stageVersion,rollbackVersion,registered:snapshot.keys.some(k=>k.exists),actions:[],code:20,kind:'review_required'};
 const ready=(kind,code,summary,actions)=>Object.assign(report,{kind,code,summary,actions});
 if(active&&!currentVersion)return ready('unknown_target',20,'The destination contains files that are not a verified LocalAgent installation. Choose another folder or review these files first.',[]);
 if(!Object.values(present).some(Boolean))return ready('clear',0,'No retained recovery material exists. Installation can continue.',[]);
 if(!present.journal){
  if(present.rollback)return ready('unrecorded_rollback',20,'A rollback folder exists without a transaction journal. Its relationship to the active installation cannot be verified; manual review is required.',[]);
  return ready('unrecorded_stage',10,`Unrecorded extraction material exists${stageVersion?' for LocalAgent '+stageVersion:''}. No activation journal exists. ${currentVersion?'Current version '+currentVersion+' remains in place.':'No active installed version was found.'} Preserve the material before retrying.`,['preserve']);
 }
 let context;
 try{if(fs.statSync(p.journal).size>262144)throw Error();context=JSON.parse(fs.readFileSync(p.journal));if(context.format!==2||!states.has(context.state)||!context.registration)throw Error();registry.validate?.(context.registration,p.target);}catch{return ready('invalid_journal',20,'The retained transaction journal is invalid or lacks a verified registration snapshot. Keep all files and review recovery details.',[]);}
 report.transactionState=context.state;report.previousVersion=context.previousVersion;
 if(['restored','rolled_back'].includes(context.state)&&!active&&!present.rollback&&!report.registered)return ready('missing_restored_install',14,'The journal reports a completed rollback, but the referenced installation and registration are missing. The prior version cannot be restored from these folders. Preserve the retained candidate and journal, then install afresh.',['preserve']);
 const display=snapshot.keys[1]?.values.find(v=>v.name==='DisplayVersion')?.value;
 if(context.state==='committed'&&currentVersion===context.version&&display===context.version){
  if(present.rollback&&rollbackVersion!==context.previousVersion)return ready('mismatched_backup',20,'The retained rollback version does not match the committed transaction. Manual review is required.',[]);
  return ready('completed_install',11,`LocalAgent ${currentVersion} was successfully committed. The retained material belongs to an earlier completed installation. Keep the current version and preserve the older material before continuing.`,['preserve']);
 }
 if(['restored','rolled_back'].includes(context.state)&&!present.rollback&&(context.previousVersion===null||currentVersion===context.previousVersion))return ready('restored_transaction',13,'The previous transaction was already restored. Its diagnostic files are still retained. Preserve them under a dated recovery folder before retrying.',['preserve']);
 if(present.rollback&&rollbackVersion!==context.previousVersion)return ready('mismatched_backup',20,'The rollback folder does not match the journal. Manual review is required.',[]);
 if(present.rollback&&present.stage&&active)return ready('conflicting_payloads',20,'Active, staging and rollback payloads all exist. Recovery cannot safely choose which candidate to move; manual review is required.',[]);
 const recoverable=(context.previousVersion===null&&!present.rollback)||
  (present.rollback&&rollbackVersion===context.previousVersion)||
  (!present.rollback&&['prepared','registry_restore_pending'].includes(context.state)&&currentVersion===context.previousVersion);
 if(recoverable)return ready('interrupted_transaction',12,`An interrupted ${context.state} transaction was found. Restore the previous files and registration, retain the unsuccessful candidate, then retry installation.`,['restore']);
 return ready('inconsistent_transaction',20,'The journal and installed folders do not describe a safely recoverable transaction. Keep all material and review it before retrying.',[]);
}
function preserve(target,{registry=registration,action='preserve',move=upgrade.moveDirectory}={}){
 let report=inspect(target,{registry});if(!report.actions.includes(action))throw Error('recovery_action_not_available');
 if(action==='restore'){const result=upgrade.recover(target,{registry});if(!result.restored)throw Error('recovery_not_restored');report=inspect(target,{registry});if(!report.actions.includes('preserve')&&!(result.filesUnchanged&&report.transactionState==='prepared'))throw Error('recovery_not_restored');}
 const p=upgrade.paths(target),directory=p.target+'.recovery-'+Date.now()+'-'+crypto.randomBytes(4).toString('hex');
 if(path.dirname(directory)!==path.dirname(p.target)||fs.existsSync(directory))throw Error('unsafe_preservation_target');
 fs.mkdirSync(directory);
 const manifest={format:1,target:p.target,action,inspection:report,createdAt:new Date().toISOString(),state:'preserving',moves:[]};
 const file=path.join(directory,'recovery.json'),save=()=>fs.writeFileSync(file,JSON.stringify(manifest,null,2),{mode:0o600});save();
 try{
  for(const [from,name]of [[p.stage,'stage'],[p.backup,'rollback'],[p.journal,'transaction.json'],[p.journal+'.tmp','transaction.json.tmp']]){
   if(!fs.existsSync(from))continue;
   upgrade.paths(target);const stat=fs.lstatSync(from);if(stat.isSymbolicLink()||!stat.isDirectory()&&stat.nlink!==1)throw Error('linked_transaction_path');
   const to=path.join(directory,name);manifest.moves.push({from,to,moved:false});save();
   move(from,to);manifest.moves.at(-1).moved=true;save();
  }
  manifest.state='preserved';save();
 }catch(error){manifest.state='preservation_incomplete';save();throw Error('Recovery material retained at '+directory+'; '+error.message);}
 return {preserved:true,directory,moves:manifest.moves.length,restored:action==='restore'};
}
module.exports={inspect,preserve};
if(require.main===module){
 try{const [operation,target,output]=process.argv.slice(2);if(operation==='inspect'){const report=inspect(target);if(output)fs.writeFileSync(output,JSON.stringify(report,null,2));console.log(report.summary);process.exitCode=report.code;}
 else if(['preserve','restore'].includes(operation)){const result=preserve(target,{action:operation});console.log('Recovery material preserved at '+result.directory);}
 else throw Error('invalid_recovery_operation');}
 catch(error){console.error('Recovery stopped safely: '+error.message);process.exitCode=20;}
}
