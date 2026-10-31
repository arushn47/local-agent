// Official source only; never modify upstream files to make a build pass.
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join, dirname, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { root } from '../src/config.mjs';
const pin=JSON.parse(readFileSync(join(root,'integrations/opencode/source.json')));
const directory=join(root,'.localagent/upstream/source-'+pin.commit);
const manifestFile=join(root,'.localagent/upstream/source-tree.json');
const mode=process.argv[2]||'verify';
const selected=p=>!p.includes('/')||/^packages\/(app|ui|session-ui|client|schema|core|protocol|llm|sdk|effect-drizzle-sqlite|effect-sqlite-node|plugin|server|httpapi-codegen|codemode)\//.test(p)||p.endsWith('/package.json')||p.startsWith('patches/')||p.startsWith('script/')||p==='packages/desktop/src/main/window-state.ts';
if(!existsSync(manifestFile)){
  if(mode!=='fetch')throw Error('Run npm run upstream:fetch first');
  const r=await fetch(`https://api.github.com/repos/anomalyco/opencode/git/trees/${pin.commit}?recursive=1`,{signal:AbortSignal.timeout(30000)});
  if(!r.ok)throw Error('Official source tree unavailable');
  mkdirSync(dirname(manifestFile),{recursive:true});writeFileSync(manifestFile,JSON.stringify(await r.json()));
}
const tree=JSON.parse(readFileSync(manifestFile));
if(tree.truncated||tree.sha!==pin.commit)throw Error('Invalid pinned source manifest');
const files=tree.tree.filter(f=>f.type==='blob'&&selected(f.path));
const matches=(b,f)=>createHash('sha1').update(Buffer.from(`blob ${b.length}\0`)).update(b).digest('hex')===f.sha;
let index=0;const errors=[];
await Promise.all(Array.from({length:16},async()=>{while(index<files.length){const f=files[index++];try{
  const dest=resolve(directory,f.path);if(!dest.startsWith(resolve(directory)+sep))throw Error('unsafe_source_path');
  if(existsSync(dest)&&matches(readFileSync(dest),f))continue;
  if(mode!=='fetch')throw Error('missing_or_modified');
  const r=await fetch(`https://raw.githubusercontent.com/anomalyco/opencode/${pin.commit}/${f.path.split('/').map(encodeURIComponent).join('/')}`,{signal:AbortSignal.timeout(30000)});
  if(!r.ok)throw Error('HTTP '+r.status);const b=Buffer.from(await r.arrayBuffer());if(!matches(b,f))throw Error('hash_mismatch');
  mkdirSync(dirname(dest),{recursive:true});writeFileSync(dest,b);
}catch(e){errors.push({file:f.path,code:e.message});}}}));
if(errors.length){console.error(JSON.stringify(errors));process.exitCode=1;}
else if(mode==='build'||mode==='install'){
  // Build tools must not inherit provider credentials or upload sourcemaps.
  const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>!/(API_KEY|TOKEN|SECRET|PASSWORD|^SENTRY_|^VITE_)/i.test(k)));
  const bun=join(root,'node_modules/bun/bin',process.platform==='win32'?'bun.exe':'bun');
  const args=mode==='build'?['run','build']:['install','--frozen-lockfile','--ignore-scripts','--filter','@opencode-ai/app'];
  const child=spawn(bun,args,{cwd:mode==='build'?join(directory,'packages/app'):directory,windowsHide:true,env,stdio:'inherit'});
  process.exitCode=await new Promise(r=>child.once('exit',c=>r(c??1)));
  if(!process.exitCode&&mode==='build'){mkdirSync(join(root,'validation'),{recursive:true});writeFileSync(join(root,'validation/upstream-build.json'),JSON.stringify({commit:pin.commit,version:pin.version,bun:pin.bun,verifiedSourceFiles:files.length,modifiedSourceFiles:0,buildPassed:true},null,2));}
}else console.log(JSON.stringify({commit:pin.commit,verifiedSourceFiles:files.length,modifiedSourceFiles:0}));
