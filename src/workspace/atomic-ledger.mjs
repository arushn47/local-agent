import {mkdirSync,existsSync,lstatSync,openSync,closeSync,fsyncSync,readFileSync,writeFileSync,renameSync,unlinkSync} from 'node:fs';
import {dirname,resolve,parse,join} from 'node:path';
import {randomUUID} from 'node:crypto';
function safe(file){
  let cursor=parse(resolve(file)).root;
  for(const part of resolve(file).slice(cursor.length).split(/[\\/]/)){
    cursor=join(cursor,part);if(!existsSync(cursor))continue;
    const s=lstatSync(cursor);if(s.isSymbolicLink()||(s.isFile()&&s.nlink!==1))throw Error('budget_link_denied');
  }
}
// Synchronous transactions serialize both instances and processes. A crashed
// owner lock fails closed; never steal it based only on a timer/PID heuristic.
export function ledgerTransaction(file,initial,mutate){
  if(!file)return mutate(initial);
  safe(file);mkdirSync(dirname(file),{recursive:true,mode:0o700});
  const lock=file+'.lock';let fd;
  try{fd=openSync(lock,'wx',0o600);}catch(error){if(error.code==='EEXIST')throw Error('budget_ledger_locked');throw error;}
  const temporary=file+'.'+randomUUID()+'.tmp';
  try{
    if(existsSync(file)&&lstatSync(file).size>16*1024*1024)throw Error('budget_ledger_size_limit');
    const state=existsSync(file)?JSON.parse(readFileSync(file,'utf8')):initial;
    const result=mutate(state);
    const encoded=JSON.stringify(state);if(Buffer.byteLength(encoded)>16*1024*1024)throw Error('budget_ledger_size_limit');
    const out=openSync(temporary,'wx',0o600);
    try{writeFileSync(out,encoded);fsyncSync(out);}finally{closeSync(out);}
    safe(file);renameSync(temporary,file);return result;
  }finally{closeSync(fd);if(existsSync(temporary))unlinkSync(temporary);unlinkSync(lock);}
}
