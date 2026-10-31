import {mkdirSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
const pin=JSON.parse(readFileSync('integrations/runtime-versions.json'));
const base=`https://nodejs.org/dist/v${pin.node}`;
const directory=join('.localagent','desktop-node');mkdirSync(directory,{recursive:true});
const sums=await fetch(base+'/SHASUMS256.txt',{signal:AbortSignal.timeout(30000)});if(!sums.ok)throw Error('Official Node checksums unavailable');
const checksum=(await sums.text()).split('\n').find(l=>l.trim().endsWith('win-x64/node.exe'))?.split(/\s+/)[0];
if(!/^[a-f0-9]{64}$/.test(checksum))throw Error('Node checksum missing');
const file=join(directory,'node.exe'),digest=b=>createHash('sha256').update(b).digest('hex');
if(!existsSync(file)||digest(readFileSync(file))!==checksum){
  const local=process.platform==='win32'&&process.versions.node===pin.node?readFileSync(process.execPath):null;
  if(local&&digest(local)===checksum)writeFileSync(file,local);
  else {const response=await fetch(base+'/win-x64/node.exe',{signal:AbortSignal.timeout(180000)});if(!response.ok)throw Error('Official Node download unavailable');
    const bytes=Buffer.from(await response.arrayBuffer());if(digest(bytes)!==checksum)throw Error('Node binary checksum mismatch');writeFileSync(file,bytes);}
}
writeFileSync(join(directory,'manifest.json'),JSON.stringify({version:pin.node,source:base+'/win-x64/node.exe',sha256:checksum},null,2));
const license=await fetch(`https://raw.githubusercontent.com/nodejs/node/v${pin.node}/LICENSE`,{signal:AbortSignal.timeout(30000)});if(!license.ok)throw Error('Official Node license unavailable');writeFileSync(join(directory,'LICENSE'),await license.text());
console.log('Verified official Node '+pin.node+' win-x64 binary');
