import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,existsSync,rmSync,linkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {omitDesktopFile} from '../scripts/desktop-payload.mjs';
import {appendBounded,readLogTail} from '../src/log-retention.mjs';
import {createRequire} from 'node:module';
import {mkdirSync,renameSync} from 'node:fs';
import {generateKeyPairSync,sign} from 'node:crypto';
import {verifyReleaseManifest} from '../src/release-manifest.mjs';
import {withoutWorkspaceAuthentication} from '../src/runtime-environment.mjs';
const {install:installProduct,recover:recoverProduct}=createRequire(import.meta.url)('../apps/desktop/upgrade.cjs');
const fakeRegistry={capture:target=>({format:1,target,keys:[]}),restore:()=>({restored:true})};
const install=(target,options={})=>installProduct(target,{...options,registry:fakeRegistry});
const recover=target=>recoverProduct(target,{registry:fakeRegistry});
test('gateway and engine child environment drops the native workspace credential',()=>{
 const input={LOCALAGENT_WORKSPACE_COOKIE:'private',localagent_workspace_cookie:'private-case',PATH:'bundled-node',LOCALAGENT_DESKTOP:'1'};
 assert.deepEqual(withoutWorkspaceAuthentication(input),{PATH:'bundled-node',LOCALAGENT_DESKTOP:'1'});assert.equal(input.LOCALAGENT_WORKSPACE_COOKIE,'private');
});
test('future update metadata requires pinned trust, valid signature, expiry and upgrade direction',()=>{
 const {privateKey,publicKey}=generateKeyPairSync('ed25519');const value={version:'0.5.1',channel:'stable',platform:'win32-x64',sha256:'a'.repeat(64),bytes:100,url:'https://example.invalid/setup.exe',expiresAt:'2030-01-01T00:00:00Z'};
 const envelope=value=>{const payload=JSON.stringify(value);return {payload,signature:sign(null,Buffer.from(payload),privateKey).toString('base64')};};const options={currentVersion:'0.5.0',now:Date.parse('2026-10-24T00:00:00Z')};
 assert.equal(verifyReleaseManifest(envelope(value),publicKey,options).version,'0.5.1');
 assert.throws(()=>verifyReleaseManifest(envelope(value),null,options),/trust/);
 assert.throws(()=>verifyReleaseManifest({...envelope(value),payload:'{}'},publicKey,options),/signature/);
 for(const update of [{version:'0.4.0'},{expiresAt:'2020-01-01'},{url:'http://example.invalid/setup.exe'},{platform:'linux-x64'}])assert.throws(()=>verifyReleaseManifest(envelope({...value,...update}),publicKey,options));
});
test('upgrade validates before moving, restores on activation failure and supports explicit rollback',()=>{
 const dir=mkdtempSync(join(tmpdir(),'localagent-upgrade-'));assert.ok(resolve(dir).startsWith(resolve(tmpdir())+sep));
 const target=join(dir,'app');const fixture=(p,v)=>{mkdirSync(join(p,'resources/runtime'),{recursive:true});writeFileSync(join(p,'resources/runtime/package.json'),JSON.stringify({name:'localagent-platform',version:v}));writeFileSync(join(p,'LocalAgent.exe'),'fixture '+v);};
 try{
 fixture(target,'0.4.0');fixture(target+'.stage','0.5.0');
 assert.throws(()=>install(target,{validate:()=>{throw Error('invalid_stage');}}),/invalid_stage/);assert.equal(readFileSync(join(target,'LocalAgent.exe'),'utf8'),'fixture 0.4.0');
 assert.throws(()=>install(target,{validate:()=> '0.5.0',rename:(a,b)=>{if(a===target+'.stage')throw Error('locked');renameSync(a,b);}}),/locked/);assert.equal(existsSync(target+'.rollback'),false);assert.equal(readFileSync(join(target,'LocalAgent.exe'),'utf8'),'fixture 0.4.0');
 assert.throws(()=>install(target,{validate:()=> '0.5.0',writeState:(_p,state)=>{if(state==='installed')throw Error('metadata_unwritable');}}),/metadata_unwritable/);assert.equal(readFileSync(join(target,'LocalAgent.exe'),'utf8'),'fixture 0.4.0');assert.equal(existsSync(target+'.stage'),true);
 assert.equal(install(target,{validate:()=> '0.5.0'}).rollbackAvailable,true);assert.equal(readFileSync(join(target,'LocalAgent.exe'),'utf8'),'fixture 0.5.0');
 assert.equal(recover(target).restored,true);assert.equal(readFileSync(join(target,'LocalAgent.exe'),'utf8'),'fixture 0.4.0');assert.equal(readFileSync(join(target+'.stage','LocalAgent.exe'),'utf8'),'fixture 0.5.0');
 const fresh=join(dir,'fresh');mkdirSync(fresh);fixture(fresh+'.stage','0.5.0');assert.equal(install(fresh,{validate:()=> '0.5.0'}).rollbackAvailable,false);assert.equal(existsSync(fresh+'.rollback'),false);
 // Equivalent on-disk state after interruption between the two renames.
 renameSync(target,target+'.rollback');const journal=JSON.parse(readFileSync(target+'.transaction.json'));journal.state='old_moved';writeFileSync(target+'.transaction.json',JSON.stringify(journal));assert.equal(recover(target).restored,true);assert.equal(readFileSync(join(target,'LocalAgent.exe'),'utf8'),'fixture 0.4.0');assert.equal(existsSync(target+'.stage'),true);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('Windows payload retains selected engine and ONNX x64, drops only install alternatives',()=>{
 for(const p of ['omniroute/.env','omniroute/.env.production','omniroute/.npmrc','opencode-windows-x64/bin/opencode.exe','opencode-windows-x64-baseline/bin/opencode.exe','onnxruntime-node/bin/napi-v6/linux/x64/libonnxruntime.so.1','onnxruntime-node/bin/napi-v6/win32/arm64/onnxruntime.dll'])assert.equal(omitDesktopFile('C:/app/node_modules/'+p),true,p);
 for(const p of ['opencode-ai/bin/opencode.exe','onnxruntime-node/bin/napi-v6/win32/x64/onnxruntime.dll','onnxruntime-node/bin/napi-v6/win32/x64/onnxruntime_binding.node','opencode-windows-x64/LICENSE','onnxruntime-node/bin/napi-v6/linux/x64/LICENSE'])assert.equal(omitDesktopFile('C:/app/node_modules/'+p),false,p);
});
test('log retention is bounded, preserves one previous generation and refuses linked files',()=>{
 const dir=mkdtempSync(join(tmpdir(),'localagent-logs-'));assert.ok(resolve(dir).startsWith(resolve(tmpdir())+sep));
 try{const path=join(dir,'routing.jsonl');writeFileSync(path,'a'.repeat(110));appendBounded(path,'new\n',100);assert.equal(readFileSync(path+'.1','utf8').length,110);assert.equal(readLogTail(path),'new\n');writeFileSync(path,'b'.repeat(110));appendBounded(path,'next\n',100);assert.equal(readFileSync(path+'.1','utf8'),'b'.repeat(110));writeFileSync(path,'x'.repeat(500));appendBounded(path,'bounded\n',100);assert.equal(readFileSync(path+'.1').length,100);linkSync(path,join(dir,'link'));assert.throws(()=>appendBounded(path,'fail',100),/unsafe_log/);assert.equal(existsSync(join(dir,'link')),true);}finally{rmSync(dir,{recursive:true,force:true});}
});
