import {tuneGateway} from './gateway-config.mjs';
import {readFileSync,writeFileSync,existsSync,mkdirSync,cpSync,symlinkSync,rmSync} from 'node:fs';
import {join,dirname,resolve,sep,relative} from 'node:path';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
const root=resolve('.'),pin=JSON.parse(readFileSync('integrations/omniroute/source.json'));
const directory=join(root,'.localagent/omniroute-source-'+pin.commit),treeFile=join(root,'.localagent/omniroute-source-tree.json');
const mode=process.argv[2]||'verify';
if(!existsSync(treeFile)){
 if(mode!=='fetch')throw Error('Fetch pinned gateway source first');
 const response=await fetch(`https://api.github.com/repos/cheaper-inference/OmniRoute/git/trees/${pin.commit}?recursive=1`,{signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error('Official source tree unavailable');
 mkdirSync(dirname(treeFile),{recursive:true});writeFileSync(treeFile,JSON.stringify(await response.json()));
}
const tree=JSON.parse(readFileSync(treeFile));if(tree.truncated)throw Error('Truncated source manifest');
const rootFiles=new Set(['package.json','package-lock.json','next.config.mjs','postcss.config.mjs','source.config.ts','tsconfig.json','LICENSE','THIRD_PARTY_NOTICES.md']);
const files=tree.tree.filter(f=>f.type==='blob'&&(rootFiles.has(f.path)||/^(src|open-sse|packages|scripts|public|config|bin|@omniroute)\//.test(f.path))&&!/(__tests__|\.test\.|\.spec\.)/.test(f.path));
const matches=(bytes,f)=>createHash('sha1').update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest('hex')===f.sha;
let index=0,downloaded=0,copied=0;const errors=[];
await Promise.all(Array.from({length:24},async()=>{while(index<files.length){const f=files[index++],target=join(directory,f.path);try{
 if(existsSync(target)&&matches(readFileSync(target),f))continue;
 if(mode!=='fetch')throw Error('missing_or_changed');
 const installed=join(root,'node_modules/omniroute',f.path);
 let bytes=existsSync(installed)?readFileSync(installed):null;
 if(bytes&&matches(bytes,f))copied++;
 else{const response=await fetch(`https://raw.githubusercontent.com/cheaper-inference/OmniRoute/${pin.commit}/${f.path.split('/').map(encodeURIComponent).join('/')}`,{signal:AbortSignal.timeout(45000)});if(!response.ok)throw Error('HTTP '+response.status);bytes=Buffer.from(await response.arrayBuffer());if(!matches(bytes,f))throw Error('hash_mismatch');downloaded++;}
 mkdirSync(dirname(target),{recursive:true});writeFileSync(target,bytes);
 if((downloaded+copied)%500===0)console.log(JSON.stringify({materialized:downloaded+copied,total:files.length}));
 }catch(e){errors.push({path:f.path,code:e.message});}}}));
if(errors.length){writeFileSync(join(root,'.localagent/omniroute-source-errors.json'),JSON.stringify(errors));throw Error('Source files unavailable or changed: '+errors.length);}
console.log(JSON.stringify({commit:pin.commit,verified:files.length,copied,downloaded}));
if(mode==='build'){
 if(!existsSync(join(directory,'node_modules')))symlinkSync(join(root,'node_modules'),join(directory,'node_modules'),'junction');
 const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>!/(KEY|TOKEN|SECRET|PASSWORD|^SENTRY_|^LOCALAGENT_)/i.test(k)));
 // Keep upstream's atomic output rename on the source volume. A cross-volume
 // TEMP fallback copies the node_modules junction as a privileged symlink on
 // Windows; no source patch or Developer Mode requirement is needed.
 const buildTemp=join(root,'.localagent/build-temp');mkdirSync(buildTemp,{recursive:true});env.TEMP=buildTemp;env.TMP=buildTemp;
 Object.assign(env,{NEXT_TELEMETRY_DISABLED:'1',OMNIROUTE_BUILD_BACKEND_ONLY:'1',OMNIROUTE_USE_TURBOPACK:'0',NODE_OPTIONS:'--max-old-space-size=8192'});
 const child=spawn(process.execPath,[join(directory,'scripts/build/build-next-isolated.mjs')],{cwd:directory,env,windowsHide:true,stdio:'inherit'});
 const code=await new Promise((r,j)=>{child.once('exit',r);child.once('error',j);});if(code!==0)process.exit(code??1);
 mkdirSync('validation/phase3',{recursive:true});writeFileSync('validation/phase3/gateway-build.json',JSON.stringify({commit:pin.commit,next:pin.next,profile:pin.profile,sourcePatches:[],buildPassed:true,verifiedSources:files.length},null,2));
}
if(mode==='adopt'){
 const bundle=join(directory,'.build/next/standalone');if(!existsSync(join(bundle,'server-ws.mjs')))throw Error('Upstream standalone assembly missing');
 // Generated artifact overlay only; original upstream source is unchanged.
 const target=resolve(root,'node_modules/omniroute/dist');if(!target.startsWith(resolve(root,'node_modules/omniroute')+sep))throw Error('Unsafe artifact target');
 rmSync(target,{recursive:true,force:true});
 // npm-layout deployment already owns the complete locked production graph.
 // Do not nest Next's traced self-copy of omniroute (and another copy of its
 // dependencies) inside dist. Upstream's npm postinstall colocates its required
 // native/wasm modules into this layout after the generated artifacts are copied.
 cpSync(bundle,target,{recursive:true,dereference:true,filter:source=>{const path=relative(bundle,source);return path!=='node_modules'&&!path.startsWith('node_modules'+sep);}});
 const child=spawn(process.execPath,[join(root,'node_modules/omniroute/scripts/build/postinstall.mjs')],{cwd:root,windowsHide:true,stdio:'inherit'});
 const code=await new Promise((r,j)=>{child.once('exit',r);child.once('error',j);});if(code!==0)process.exit(code??1);
 tuneGateway(join(root,'node_modules/omniroute'));
 console.log('Adopted security-rebuilt backend artifact with on-demand route loading');
}
