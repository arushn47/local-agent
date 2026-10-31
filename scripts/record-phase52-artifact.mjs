import {readFileSync, writeFileSync, createReadStream, statSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
const previous = [
 ['release/LocalAgent-Setup-0.3.0-x64.exe','07550725f063950f2db95b535a466d06a4d8846335295d41c8f2c1244b2167f8'],
 ['release/desktop-0.4.0/LocalAgent-Setup-0.4.0-x64.exe','335b036a2997377a249cab994732dbc3f57eef1412c22f4b65d84db717c58d50'],
 ['release/desktop-0.5.0/LocalAgent-Setup-0.5.0-x64.exe','471d9345d1d6d0ebffe2acd52e1c0fd486721191eb2a5090728b7921eedf6547'],
 ['release/desktop-0.5.1/LocalAgent-Setup-0.5.1-x64.exe','a1ffe81ba54f155e05da2ecc9daa5f742f9757f5a37a4e5d4d2f5fff225bd055'],
];
async function hash(path) {const h=createHash('sha256');for await(const chunk of createReadStream(path))h.update(chunk);return h.digest('hex');}
const identities=[];
for(const [path,expected] of previous){const actual=await hash(path);identities.push({path,sha256:actual,unchanged:actual===expected});if(actual!==expected)throw Error('Accepted artifact changed: '+path);}
const path=resolve('release/desktop-0.5.2/LocalAgent-Setup-0.5.2-x64.exe'),sha256=await hash(path);
if(sha256!==JSON.parse(readFileSync('validation/phase52/installer-hash.json')).Hash.toLowerCase())throw Error('Candidate changed after freeze');
writeFileSync('validation/phase52/artifact.json',JSON.stringify({version:'0.5.2',path,bytes:statSync(path).size,sha256,signed:false,publicReleaseCleared:false,previousArtifacts:identities},null,2));
console.log('Candidate identity and all four accepted installer hashes verified');
