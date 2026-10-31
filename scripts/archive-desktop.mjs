import {ZipFile} from 'yazl';
import {createWriteStream,createReadStream,readdirSync,statSync,existsSync,unlinkSync,renameSync,writeFileSync,mkdirSync,openSync,readSync,closeSync} from 'node:fs';
import {resolve,join,relative} from 'node:path';
import {pipeline} from 'node:stream/promises';
import {createHash} from 'node:crypto';
import {omitDesktopFile} from './desktop-payload.mjs';
export async function archiveDesktop(version){
 const destination=resolve('release','desktop-'+version),directory=join(destination,'win-unpacked'),output=join(destination,`localagent-desktop-${version}-x64.nsis.zip`),temporary=output+'.partial';
 if(existsSync(temporary))unlinkSync(temporary);
 const zip=new ZipFile(),queue=[directory];let files=0,bytes=0;
 const finished=pipeline(zip.outputStream,createWriteStream(temporary));
 while(queue.length){const dir=queue.pop();for(const entry of readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){
   const path=join(dir,entry.name);if(entry.isSymbolicLink())throw Error('External links are not allowed in desktop payloads');
   if(entry.isDirectory()){queue.push(path);continue;}if(!entry.isFile())continue;
   if(omitDesktopFile(path))continue;
   const stat=statSync(path),name=relative(directory,path).replaceAll('\\','/');files++;bytes+=stat.size;
   zip.addReadStreamLazy(name,{size:stat.size,mtime:new Date('2026-01-01T00:00:00Z'),mode:stat.mode,compressionLevel:6},callback=>callback(null,createReadStream(path)));
 }}
 // Windows tar (our hash-pinned NSIS extraction overlay) supports ZIP64.
 // The upstream nsisunz plugin does not; never remove that overlay silently.
 zip.end();await finished;
 const fd=openSync(temporary,'r'),end=Buffer.alloc(22);
 try{readSync(fd,end,0,22,statSync(temporary).size-22);}finally{closeSync(fd);}
 if(end.readUInt32LE(0)!==0x06054b50||end.readUInt16LE(10)!==Math.min(files,65535))throw Error('Incomplete ZIP central directory');
 renameSync(temporary,output);
 const hash=createHash('sha256');for await(const data of createReadStream(output))hash.update(data);
 mkdirSync('validation/phase52',{recursive:true});writeFileSync('validation/phase52/archive.json',JSON.stringify({writer:'yazl 3.3.1',compressionLevel:6,zip64:files>=65535,files,uncompressedBytes:bytes,compressedBytes:statSync(output).size,sha256:hash.digest('hex')},null,2));
 console.log('Streaming desktop ZIP complete: '+files+' files');return output;
}
