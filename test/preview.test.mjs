import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,rmSync,symlinkSync,linkSync,unlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {createServer} from 'node:http';
import {createPreviews} from '../src/workspace/previews.mjs';
import {previewFile,readPreviewFile} from '../src/workspace/preview-files.mjs';
import {browserEnvironment} from '../src/workspace/browser-inspect.mjs';
const wait=ms=>new Promise(r=>setTimeout(r,ms));

test('preview confines assets, refreshes, validates without executing scripts, and exports clean source',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'localagent-preview-'));assert.ok(resolve(directory).startsWith(resolve(tmpdir())+sep));
 const project=join(directory,'project'),outside=join(directory,'outside');mkdirSync(project);mkdirSync(outside);
 writeFileSync(join(project,'index.html'),'<html><head></head><body><h1>Preview proof</h1><script type="module" src="app.mjs"></script></body></html>');
 writeFileSync(join(project,'app.mjs'),'console.log("ready");');writeFileSync(join(project,'.env'),'NEVER_SERVE_THIS');
 writeFileSync(join(project,'credentials.json'),'NEVER_EXPORT_THIS');writeFileSync(join(outside,'leak.js'),'NEVER_READ_OUTSIDE');
 writeFileSync(join(project,'package.json'),JSON.stringify({scripts:{build:'node -e "require(\'fs\').writeFileSync(\'executed\',\'unsafe\')"'}}));
 symlinkSync(outside,join(project,'linked'),'junction');linkSync(join(outside,'leak.js'),join(project,'hardlink.js'));
 const projects={get:id=>{if(id!=='p')throw Error('project_not_found');return {id,path:project};}},preview=await createPreviews({projects,directory:join(directory,'private'),uiOrigin:'http://127.0.0.1:20140'});let download;
 try{
  const started=await preview.start('p');assert.equal(new URL(started.url).hostname,'localhost');
  const response=await fetch(started.url),html=await response.text();assert.match(html,/Preview proof/);assert.match(html,/localagent-preview/);
  const csp=response.headers.get('content-security-policy');assert.match(csp,/sandbox allow-scripts/);assert.doesNotMatch(csp,/allow-same-origin/);assert.match(csp,/connect-src 'none'/);assert.match(csp,/frame-src 'none'/);
  assert.equal(response.headers.get('set-cookie'),null);assert.equal(response.headers.get('access-control-allow-credentials'),null);
  for(const name of ['.env','credentials.json','linked/leak.js','hardlink.js','%2e%2e/outside/leak.js','package.json']){const r=await fetch(started.url+name);assert.ok([403,404].includes(r.status),name);assert.doesNotMatch(await r.text(),/NEVER_/);}
  assert.throws(()=>readPreviewFile(project,'hardlink.js'),/preview_path_denied/);assert.throws(()=>previewFile(project,'linked/leak.js'),/preview_path_denied/);
  unlinkSync(join(project,'hardlink.js'));
  writeFileSync(join(project,'app.mjs'),'const = invalid;');await wait(400);assert.ok(preview.status('p').revision>started.revision);
  const failed=await preview.build('p');assert.equal(failed.passed,false);assert.equal(failed.diagnostics[0].file,'app.mjs');assert.equal(existsSync(join(project,'executed')),false);
  writeFileSync(join(project,'app.mjs'),'console.log("fixed");');const passed=await preview.build('p');assert.equal(passed.passed,true);assert.equal(existsSync(join(project,'executed')),false);
  download=createServer((_req,res)=>preview.export('p',res));await new Promise(r=>download.listen(0,'127.0.0.1',r));const zip=Buffer.from(await (await fetch('http://127.0.0.1:'+download.address().port)).arrayBuffer());
  assert.equal(zip.readUInt32LE(0),0x04034b50);assert.ok(zip.includes(Buffer.from('index.html')));assert.ok(!zip.includes(Buffer.from('credentials.json')));assert.ok(!zip.includes(Buffer.from('hardlink.js')));
  assert.throws(()=>preview.template('p'),/empty_folder/);await preview.stop('p');assert.equal((await fetch(started.url)).status,403);
 }finally{download?.close();preview.close();rmSync(directory,{recursive:true,force:true});}
});

test('starter refuses overwrites and browser environment excludes inference and process injection',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'localagent-starter-'));assert.ok(resolve(directory).startsWith(resolve(tmpdir())+sep));
 const project=join(directory,'site');mkdirSync(project);
 const preview=await createPreviews({projects:{get:()=>({path:project})},directory:join(directory,'.state'),uiOrigin:'http://127.0.0.1:1'});
 try{
  const result=preview.template('p');assert.equal(result.created.length,3);const before=readFileSync(join(project,'index.html'),'utf8');
  assert.throws(()=>preview.template('p'),/empty_folder/);
  assert.equal(readFileSync(join(project,'index.html'),'utf8'),before);
  process.env.LOCALAGENT_TEST_API_KEY='not-a-key';process.env.NODE_OPTIONS='--conditions=test';const env=browserEnvironment();assert.ok(!('LOCALAGENT_TEST_API_KEY'in env));assert.ok(!('NODE_OPTIONS'in env));
 }finally{delete process.env.LOCALAGENT_TEST_API_KEY;delete process.env.NODE_OPTIONS;preview.close();rmSync(directory,{recursive:true,force:true});}
});
