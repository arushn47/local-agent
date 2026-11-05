// Reuse a frozen, previously proven dependency payload when build traces were
// deliberately removed. Never reinterpret old proof as proof of changed bytes.
import {readFileSync,writeFileSync,existsSync,mkdirSync,cpSync} from 'node:fs';
import {resolve,join,dirname,sep} from 'node:path';
import {createHash} from 'node:crypto';
import {backendTreeHash,lockGraphHash} from './backend-contract.mjs';
const root=resolve('.'),stage=resolve('.localagent/desktop-stage/runtime');
const closureBytes=readFileSync('validation/phase52/backend-closure.json');
const old=JSON.parse(closureBytes),proof=JSON.parse(readFileSync('validation/phase52/backend-proof.json'));
if(!proof.passed||!proof.gatewayFixturePassed||proof.moduleEscapes!==0||createHash('sha256').update(closureBytes).digest('hex')!==proof.closureSha256)throw Error('Preserved backend proof invalid');
if(backendTreeHash(join(stage,'node_modules'))!==proof.treeSha256)throw Error('Preserved backend bytes changed');
const priorLock=JSON.parse(readFileSync(join(stage,'package-lock.json'))),current=JSON.parse(readFileSync('package-lock.json'));
for(const pkg of [{path:'omniroute',name:'omniroute',version:old.gateway},...old.inventory]){
  const id='node_modules/'+pkg.path.replaceAll('\\','/'),a=priorLock.packages[id],b=current.packages[id];
  if(!a||!b||a.version!==b.version||a.integrity!==b.integrity||b.version!==pkg.version)throw Error('Preserved package no longer matches locked source: '+pkg.name);
}
const output=resolve('.localagent/mvp-backend/runtime'),evidence=resolve('validation/mvp');
if(!output.startsWith(join(root,'.localagent')+sep)||existsSync(output))throw Error('Choose a new candidate path');
mkdirSync(output,{recursive:true});mkdirSync(evidence,{recursive:true});
cpSync(join(stage,'node_modules'),join(output,'node_modules'),{recursive:true});
for(const file of ['src','integrations/runtime-versions.json','apps/workspace/dist','package.json','localagent.config.json','THIRD_PARTY_NOTICES.md']){const dest=join(output,file);mkdirSync(dirname(dest),{recursive:true});cpSync(file,dest,{recursive:true});}
const closure={...old,output,lockGraphSha256:lockGraphHash(current),source:'Preserved frozen backend payload; exact historical tree/proof and current locked package versions/integrities revalidated. New isolated compatibility proof still required.',preservedParent:{closureSha256:proof.closureSha256,treeSha256:proof.treeSha256}};
writeFileSync(join(evidence,'backend-closure.json'),JSON.stringify(closure,null,2));
console.log(JSON.stringify({candidate:output,dependencyBytesUnchanged:true,parentTree:proof.treeSha256,packages:old.packages,requiresNewRuntimeProof:true}));
