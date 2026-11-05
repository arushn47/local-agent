import {checkBackendProof} from './backend-contract.mjs';
import {cpSync,mkdirSync,readFileSync,writeFileSync,existsSync,rmSync,realpathSync,statSync} from 'node:fs';
import {join,dirname,resolve,sep} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {transformSync} from 'esbuild';
import {omitDesktopFile} from './desktop-payload.mjs';
import {tuneGateway} from './gateway-config.mjs';
const root=resolve('.'),stage=join(root,'.localagent/desktop-stage'),runtime=join(stage,'runtime');
mkdirSync(runtime,{recursive:true});
const backendIndex=process.argv.indexOf('--backend-runtime'),backendRoot=backendIndex>=0?resolve(process.argv[backendIndex+1]||''):null;
let backendProfile;
if(backendRoot){const evidence=resolve(process.env.LOCALAGENT_BUILD_EVIDENCE||'validation/phase52'),closureBytes=readFileSync(join(evidence,'backend-closure.json'));backendProfile=checkBackendProof({closure:JSON.parse(closureBytes),proof:JSON.parse(readFileSync(join(evidence,'backend-proof.json'))),closureBytes,lock:JSON.parse(readFileSync('package-lock.json')),candidate:backendRoot,workspace:root});}
const pin=JSON.parse(readFileSync('integrations/runtime-versions.json'));
const lockSha256=createHash('sha256').update(readFileSync('package-lock.json')).digest('hex');
if(process.argv.includes('--reuse-dependencies')){
 if(!existsSync(join(stage,'manifest.json')))throw Error('No cached production graph');
 if(JSON.parse(readFileSync(join(stage,'manifest.json'))).lockSha256!==lockSha256){
  const graph=file=>{const lock=JSON.parse(readFileSync(file));return JSON.stringify(Object.fromEntries(Object.entries(lock.packages).map(([p,v])=>[p,p===''?{...v,version:undefined}:v])));};
  if(graph('package-lock.json')!==graph(join(runtime,'package-lock.json')))throw Error('Cached graph changed; prepare without --reuse-dependencies');
 }
}
if(process.platform!=='win32'||process.arch!=='x64'||process.versions.node.split('.')[0]!==pin.node.split('.')[0])throw Error('Use Windows x64 Node '+pin.node.split('.')[0]+' for native staging');
if(!existsSync('.localagent/desktop-node/manifest.json'))throw Error('Run npm run desktop:node first');
const abi=spawnSync(resolve('.localagent/desktop-node/node.exe'),['--print','process.versions.modules'],{encoding:'utf8',windowsHide:true});
if(abi.status!==0||abi.stdout.trim()!==process.versions.modules)throw Error('Build and bundled Node native ABI differ');
const copy=(from,to)=>{mkdirSync(dirname(to),{recursive:true});cpSync(from,to,{recursive:true});};
for(const file of ['package.json','package-lock.json','localagent.config.json','THIRD_PARTY_NOTICES.md'])copy(join(root,file),join(runtime,file));
copy(join(root,'src'),join(runtime,'src'));copy(join(root,'integrations/runtime-versions.json'),join(runtime,'integrations/runtime-versions.json'));
const uiTarget=resolve(runtime,'apps/workspace/dist');
if(!uiTarget.startsWith(resolve(stage)+sep)||existsSync(uiTarget)&&!realpathSync(uiTarget).startsWith(resolve(stage)+sep))throw Error('Unsafe UI stage path');
rmSync(uiTarget,{recursive:true,force:true});copy(join(root,'apps/workspace/dist'),uiTarget);
copy(join(root,'.localagent/desktop-node'),join(stage,'node'));
// Copy the production lock graph from npm ci's verified install. This preserves
// the Node-24 native artifacts without a second postinstall/download cycle or
// rebuilding them for Electron's different ABI. No dev-tool graph is shipped.
if(backendRoot){const target=resolve(runtime,'node_modules');if(!target.startsWith(resolve(stage)+sep)||existsSync(target)&&!realpathSync(target).startsWith(resolve(stage)+sep))throw Error('Unsafe stage path');rmSync(target,{recursive:true,force:true});copy(join(backendRoot,'node_modules'),target);}
else if(!process.argv.includes('--reuse-dependencies')){
 const target=resolve(runtime,'node_modules');if(!target.startsWith(resolve(stage)+sep))throw Error('Unsafe stage path');
 rmSync(target,{recursive:true,force:true});mkdirSync(target,{recursive:true});
 const lock=JSON.parse(readFileSync('package-lock.json'));
 for(const [path,entry] of Object.entries(lock.packages)){
   if(entry.dev||!/^node_modules\/(?:@[^/]+\/)?[^/]+$/.test(path))continue;
   const installed=join(root,path);if(!existsSync(installed)){if(entry.optional)continue;throw Error('Production dependency missing: '+path);}
   if(!realpathSync(installed).startsWith(join(root,'node_modules')+sep))throw Error('External dependency link rejected');
   const pkg=JSON.parse(readFileSync(join(installed,'package.json')));if(entry.version&&pkg.version!==entry.version)throw Error('Locked package version mismatch: '+path);
   mkdirSync(dirname(join(runtime,path)),{recursive:true});cpSync(installed,join(runtime,path),{recursive:true,dereference:true,filter:source=>statSync(source).isDirectory()||!omitDesktopFile(source)});
 }
}
// Minimal direct upstream reuse: destruction-safe window URL helpers. Full
// upstream shell couples WSL, updater, telemetry and V2 server internals.
const sourcePin=JSON.parse(readFileSync('integrations/opencode/source.json'));
const path='packages/desktop/src/main/window-state.ts';
const source=readFileSync(join(root,'.localagent/upstream/source-'+sourcePin.commit,path));
const tree=JSON.parse(readFileSync('.localagent/upstream/source-tree.json'));
const expected=tree.tree.find(x=>x.path===path).sha;
if(createHash('sha1').update(Buffer.from(`blob ${source.length}\0`)).update(source).digest('hex')!==expected)throw Error('Upstream desktop helper modified');
mkdirSync('apps/desktop/vendor',{recursive:true});
writeFileSync('apps/desktop/vendor/window-state.mjs','// OpenCode '+sourcePin.commit+' · MIT; see THIRD_PARTY_NOTICES.md\n'+transformSync(source.toString(),{loader:'ts',format:'esm'}).code);
const gatewayTuning=tuneGateway(join(runtime,'node_modules/omniroute'));
const metadata={...pin,backendProfile:backendProfile||(process.argv.includes('--reuse-dependencies')&&existsSync(join(stage,'manifest.json'))?JSON.parse(readFileSync(join(stage,'manifest.json'))).backendProfile:undefined),architecture:'x64',upstreamDesktop:sourcePin.commit,node:JSON.parse(readFileSync('.localagent/desktop-node/manifest.json')),lockSha256,gatewayTuning,gatewayBuild:JSON.parse(readFileSync('validation/phase3/gateway-build.json'))};
writeFileSync(join(stage,'manifest.json'),JSON.stringify(metadata,null,2));
console.log('Desktop production stage ready: '+stage);
