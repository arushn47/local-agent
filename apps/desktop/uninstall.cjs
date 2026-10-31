// Installer-only cleanup, executed by bundled Node before NSIS removes it.
// User data and projects are outside this validated installation payload.
const {resolve,dirname,isAbsolute}=require('node:path');
const {readFileSync,realpathSync,rmSync}=require('node:fs');
try{
 const expected=resolve(dirname(process.execPath),'../runtime'),input=process.argv[2];
 if(!input||!isAbsolute(input))throw Error('invalid_payload_path');
 const target=resolve(input),same=(a,b)=>a.toLowerCase()===b.toLowerCase();
 if(!same(target,expected)||!same(realpathSync(target),expected))throw Error('invalid_payload_path');
 const manifest=JSON.parse(readFileSync(resolve(target,'package.json')));
 const pins=JSON.parse(readFileSync(resolve(target,'integrations/runtime-versions.json')));
 if(manifest.name!=='localagent-platform'||pins.node!==process.versions.node)throw Error('invalid_payload_marker');
 rmSync(target,{recursive:true,force:true,maxRetries:2,retryDelay:150});
 console.log('runtime_payload_removed');
}catch{console.error('runtime_payload_cleanup_failed');process.exitCode=1;}
