import{readFileSync,realpathSync,existsSync,readdirSync,lstatSync}from'node:fs';import{resolve,join,sep,relative}from'node:path';import{createHash}from'node:crypto';
// Bind runtime evidence to bytes as well as package metadata. Reject links.
export function backendTreeHash(root){
 const hash=createHash('sha256');
 function visit(directory){for(const name of readdirSync(directory).sort()){
  const path=join(directory,name),stat=lstatSync(path);
  if(stat.isSymbolicLink())throw Error('Backend dependency link rejected');
  if(stat.isDirectory())visit(path);
  else{hash.update(relative(root,path).replaceAll('\\','/')+'\0');hash.update(createHash('sha256').update(readFileSync(path)).digest());}
 }}
 visit(root);return hash.digest('hex');
}
export const lockGraphHash=lock=>createHash('sha256').update(JSON.stringify({...lock.packages,'':{...lock.packages[''],version:undefined}})).digest('hex');
export function checkBackendProof({closure,proof,closureBytes,lock,candidate,workspace}){
 if(proof?.passed!==true||proof.moduleEscapes!==0||proof.gatewayFixturePassed!==true||proof.closureSha256!==createHash('sha256').update(closureBytes).digest('hex'))throw Error('Backend runtime proof missing or stale');
 if(closure.gateway!=='3.8.52'||closure.next!=='16.4.3'||closure.lockGraphSha256!==lockGraphHash(lock)||resolve(closure.output)!==resolve(candidate)||resolve(proof.candidate)!==resolve(candidate))throw Error('Backend runtime graph mismatch');
 if(!realpathSync(candidate).startsWith(resolve(workspace,'.localagent')+sep))throw Error('Backend candidate outside workspace');
 for(const name of ['@splinetool/runtime','@giscus/react','@lobehub/ui','@lobehub/icons','antd','monaco-editor'])if(closure.inventory.some(p=>p.name===name)||existsSync(join(candidate,'node_modules',name)))throw Error('Unexpected UI package in backend graph');
 for(const path of ['@opencode-ai/sdk','opencode-ai','solid-js','playwright-core','yazl','next','react','react-dom'])if(!existsSync(join(candidate,'node_modules',path,'package.json')))throw Error('Required runtime package missing: '+path);
 for(const [name,version]of Object.entries({omniroute:'3.8.52',next:'16.4.3'}))if(JSON.parse(readFileSync(join(candidate,'node_modules',name,'package.json'))).version!==version)throw Error('Backend runtime package version mismatch: '+name);
 if(!proof.treeSha256||proof.treeSha256!==backendTreeHash(join(candidate,'node_modules')))throw Error('Backend runtime payload changed after verification');
 return {profile:'backend',closureSha256:proof.closureSha256,treeSha256:proof.treeSha256,packages:closure.packages,sourceCodeChanges:[],scope:proof.scope};
}
