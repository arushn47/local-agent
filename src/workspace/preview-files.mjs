import {realpathSync,lstatSync,readdirSync,statSync,openSync,fstatSync,readSync,closeSync,constants} from 'node:fs';
import {resolve,relative,sep,extname,join} from 'node:path';

export const previewTypes={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.mjs':'text/javascript','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.ico':'image/x-icon','.woff2':'font/woff2','.woff':'font/woff'};
const forbidden=/^(?:\.|node_modules$|coverage$)|secret|credential|private[-_]?key|api[-_]?key|token/i;
export function permittedName(name,{exporting=false}={}){
 const parts=name.replaceAll('\\','/').split('/');
 return parts.length>0&&parts.every(p=>p&&p!=='.'&&p!=='..'&&!forbidden.test(p))&&(extname(name).toLowerCase() in previewTypes||exporting&&['.json','.md'].includes(extname(name).toLowerCase()));
}
export function previewFile(root,name,{exporting=false}={}){
 if(typeof name!=='string'||name.length>1024||!permittedName(name,{exporting}))throw Error('preview_path_denied');
 const base=realpathSync(root),file=resolve(base,name);
 if(!file.toLowerCase().startsWith((base+sep).toLowerCase()))throw Error('preview_path_denied');
 let cursor=base;for(const part of relative(base,file).split(sep)){cursor=join(cursor,part);if(lstatSync(cursor).isSymbolicLink())throw Error('preview_path_denied');}
 const canonical=realpathSync(file);if(!canonical.toLowerCase().startsWith((base+sep).toLowerCase()))throw Error('preview_path_denied');
 const stat=statSync(canonical);if(!stat.isFile()||stat.nlink>1)throw Error('preview_path_denied');if(stat.size>5*1024*1024)throw Error('preview_file_too_large');
 return {file:canonical,size:stat.size,name:relative(base,canonical).replaceAll('\\','/')};
}
export function readPreviewFile(root,name,options){
 const checked=previewFile(root,name,options),before=statSync(checked.file,{bigint:true});
 const fd=openSync(checked.file,constants.O_RDONLY|(constants.O_NOFOLLOW||0));
 try{
  const opened=fstatSync(fd,{bigint:true});
  if(opened.ino!==before.ino||(before.dev!==0n&&opened.dev!==before.dev)||opened.nlink>1n||lstatSync(checked.file).isSymbolicLink())throw Error('preview_path_denied');
  const data=Buffer.alloc(Math.min(Number(opened.size)+1,5*1024*1024+1)),length=readSync(fd,data,0,data.length,0);
  if(length>5*1024*1024)throw Error('preview_file_too_large');return data.subarray(0,length);
 }finally{closeSync(fd);}
}
export function previewFiles(root,{exporting=false}={}){
 const queue=[''],result=[];let bytes=0,visited=0;
 while(queue.length){const dir=queue.shift();for(const entry of readdirSync(join(root,dir),{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){
   if(++visited>3000)throw Error('preview_project_too_large');
   if(entry.isSymbolicLink()||forbidden.test(entry.name))continue;
   const name=dir?dir+'/'+entry.name:entry.name;
   if(entry.isDirectory()){queue.push(name);continue;}
   if(!entry.isFile()||!permittedName(name,{exporting}))continue;
   const f=previewFile(root,name,{exporting});result.push(f);bytes+=f.size;
   if(result.length>512||bytes>20*1024*1024)throw Error('preview_project_too_large');
 }}return result;
}
