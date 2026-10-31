import {readFileSync,readdirSync,lstatSync,existsSync,writeFileSync,mkdirSync} from 'node:fs';
import {join,resolve,relative} from 'node:path';
import {createHash} from 'node:crypto';
const directory=resolve('validation/phase52-install-fix');mkdirSync(directory,{recursive:true});
const target=join(process.env.LOCALAPPDATA,'Programs/LocalAgent'),stage=target+'.stage',expected=resolve('release/desktop-0.5.2/win-unpacked');
const sha=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
function inventory(root){const rows=[];function walk(p){for(const e of readdirSync(p,{withFileTypes:true})){const f=join(p,e.name),s=lstatSync(f);if(s.isSymbolicLink()||s.isFile()&&s.nlink!==1)throw Error('Linked recovery material requires manual review');if(s.isDirectory())walk(f);else if(s.isFile())rows.push({path:relative(root,f).replaceAll('\\','/'),bytes:s.size,sha256:sha(f)});else throw Error('Unsupported recovery material');}}walk(root);return rows;}
const files=inventory(stage),reference=new Map(inventory(expected).map(r=>[r.path,r]));
const mismatches=files.filter(r=>reference.get(r.path)?.sha256!==r.sha256),missing=[...reference.keys()].filter(p=>!files.some(r=>r.path===p));
const data=join(process.env.APPDATA,'LocalAgent'),protectedNames=['runtime/credentials.dpapi','runtime/projects.json','runtime/sessions.json','runtime/secrets.json','runtime/gateway-key.json'];
const report={target,stage,targetEntries:readdirSync(target),rollbackExists:existsSync(target+'.rollback'),journalExists:existsSync(target+'.transaction.json'),files:files.length,bytes:files.reduce((n,r)=>n+r.bytes,0),version:JSON.parse(readFileSync(join(stage,'resources/runtime/package.json'))).version,mismatches,missing,exactPayloadMatch:!mismatches.length&&!missing.length,protectedFiles:protectedNames.filter(p=>existsSync(join(data,p))).map(p=>({path:p,sha256:sha(join(data,p))})),inferenceRequests:0};
writeFileSync(join(directory,'actual-before.json'),JSON.stringify(report,null,2));writeFileSync(join(directory,'retained-files.json'),JSON.stringify(files));console.log(JSON.stringify({...report,protectedFiles:report.protectedFiles.map(p=>({path:p.path,preservedBaseline:true}))}));
