import test from 'node:test';
import assert from 'node:assert/strict';
import {isDesktopURL,isTrustedSender} from '../apps/desktop/src/security.mjs';
import {mkdtempSync,mkdirSync,writeFileSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {spawnSync} from 'node:child_process';
const origin='http://127.0.0.1:34567',splash='file:///C:/LocalAgent/startup.html';
test('desktop native capabilities require the owned exact-origin top frame',()=>{
 const frame={url:origin+'/'},contents={mainFrame:frame},win={webContents:contents},event={sender:contents,senderFrame:frame};
 assert.equal(isTrustedSender(event,win,origin,splash),true);
 assert.equal(isTrustedSender({...event,senderFrame:{url:origin+'/'}},win,origin,splash),false);
 assert.equal(isTrustedSender({...event,sender:{}},win,origin,splash),false);
 assert.equal(isTrustedSender({...event,senderFrame:null},win,origin,splash),false);
 for(const url of ['https://evil.example/','http://127.0.0.1:34568/','http://127.0.0.1:34567.evil.example/','http://evil@127.0.0.1:34567/',splash])assert.equal(isDesktopURL(url,origin,splash),false,url);
 assert.equal(isDesktopURL(splash,origin,splash,true),true);assert.equal(isDesktopURL('file:///C:/other.html',origin,splash,true),false);
});

test('uninstaller refuses an unrelated directory even with valid product markers',()=>{
 const directory=mkdtempSync(join(tmpdir(),'localagent-uninstall-'));
 assert.ok(resolve(directory).startsWith(resolve(tmpdir())+sep));
 try{
  mkdirSync(join(directory,'integrations'));
  writeFileSync(join(directory,'package.json'),JSON.stringify({name:'localagent-platform'}));
  writeFileSync(join(directory,'integrations/runtime-versions.json'),JSON.stringify({node:process.versions.node}));
  writeFileSync(join(directory,'keep.txt'),'must remain');
  const result=spawnSync(process.execPath,[resolve('apps/desktop/uninstall.cjs'),directory],{windowsHide:true,encoding:'utf8'});
  assert.equal(result.status,1);assert.equal(existsSync(join(directory,'keep.txt')),true);
 }finally{rmSync(directory,{recursive:true,force:true});}
});
