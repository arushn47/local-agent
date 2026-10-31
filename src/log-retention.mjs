import {lstatSync,existsSync,renameSync,unlinkSync,appendFileSync,readFileSync,openSync,readSync,closeSync,writeFileSync} from 'node:fs';
import {Writable} from 'node:stream';

// One bounded previous generation; never follow links or touch databases/keys.
export function rotateLog(path,limit=1024*1024){
  if(!existsSync(path))return;
  const stat=lstatSync(path);if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1)throw Error('unsafe_log_file');
  if(stat.size<=limit)return;
  const previous=path+'.1';
  if(existsSync(previous)){const old=lstatSync(previous);if(!old.isFile()||old.isSymbolicLink()||old.nlink!==1)throw Error('unsafe_log_file');unlinkSync(previous);}
  if(stat.size>limit*2){
    const fd=openSync(path,'r'),tail=Buffer.alloc(limit);try{readSync(fd,tail,0,limit,stat.size-limit);}finally{closeSync(fd);}
    writeFileSync(previous,tail,{flag:'wx',mode:0o600});unlinkSync(path);
  }else renameSync(path,previous);
}
export function appendBounded(path,line,limit=1024*1024){
  if(Buffer.byteLength(line)>limit)line=line.slice(0,Math.floor(limit/4));
  rotateLog(path,limit);appendFileSync(path,line,{mode:0o600});
}
export function boundedLogStream(path,limit=1024*1024){
  return new Writable({write(chunk,_encoding,done){try{appendBounded(path,chunk,limit);done();}catch(e){done(e);}}});
}
export function readLogTail(path,limit=1024*1024){
  try{const stat=lstatSync(path);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>limit*2)return '';return readFileSync(path,'utf8');}catch{return '';}
}
