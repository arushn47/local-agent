import assert from 'node:assert/strict';
import {readFileSync,readdirSync,lstatSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,join,relative} from 'node:path';
import {createHash} from 'node:crypto';
import {backendTreeHash,lockGraphHash} from './backend-contract.mjs';
const hash=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
const version=JSON.parse(readFileSync('apps/desktop/package.json')).version;
const packageRoot=resolve(`release/desktop-${version}/win-unpacked`),resources=join(packageRoot,'resources'),runtime=join(resources,'runtime');
const manifest=JSON.parse(readFileSync(join(resources,'runtime-manifest.json'))),proof=JSON.parse(readFileSync('validation/mvp/backend-proof.json'));
assert.equal(manifest.lockSha256,hash('package-lock.json'));
assert.equal(backendTreeHash(join(runtime,'node_modules')),proof.treeSha256);
assert.equal(manifest.backendProfile.treeSha256,proof.treeSha256);
assert.equal(JSON.parse(readFileSync(join(runtime,'package.json'))).version,version);
assert.equal(JSON.parse(readFileSync('validation/mvp/backend-closure.json')).lockGraphSha256,lockGraphHash(JSON.parse(readFileSync('package-lock.json'))));
let comparedFiles=0;
function compare(source,target){
  const actualNames=readdirSync(target).sort(),expectedNames=readdirSync(source).sort();assert.deepEqual(actualNames,expectedNames,'Unexpected/missing packaged files under '+source);
  for(const name of expectedNames){const a=join(source,name),b=join(target,name),stat=lstatSync(a);assert.ok(!stat.isSymbolicLink());if(stat.isDirectory())compare(a,b);else{assert.equal(hash(a),hash(b),'Stale packaged file: '+relative(resolve('.'),a));comparedFiles++;}}
}
compare(resolve('src'),join(runtime,'src'));compare(resolve('apps/workspace/dist'),join(runtime,'apps/workspace/dist'));
for(const doc of ['DESKTOP.md','SECURITY.md','MVP-CANDIDATE.md'])assert.equal(hash(join('docs',doc)),hash(join(resources,'docs',doc)));
const report={passed:true,version,comparedSourceAndUIFiles:comparedFiles,dependencyTreeSha256:proof.treeSha256,executableSha256:hash(join(packageRoot,'LocalAgent.exe')),sourceAndUIBytesMatch:true,lockAndManifestMatch:true,scope:'Current source/UI/docs and frozen dependency bytes; desktop behavior and payload secret scan are separate checks.'};
mkdirSync('validation/mvp',{recursive:true});writeFileSync('validation/mvp/package-integrity.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
