import {isAbsolute,relative} from 'node:path';
import {assertPublicFile,confinedPath} from './workflow-storage.mjs';

// Expose a bounded location, never raw tool arguments or private/external paths.
export function latestFileActivity(messages,directory){
  let latest=null;
  for(const message of messages)for(const part of message.parts||[]){
    if(part.type!=='tool'||!['read','edit','write','apply_patch'].includes(part.tool))continue;
    const candidate=part.state?.input?.filePath||part.state?.metadata?.filediff?.file;
    if(typeof candidate!=='string')continue;
    try{
      const path=assertPublicFile((isAbsolute(candidate)?relative(directory,candidate):candidate).replaceAll('\\','/'));
      confinedPath(directory,path);
      latest={id:part.id||message.info?.id,path,tool:part.tool,status:part.state?.status||'pending',offset:Number.isSafeInteger(part.state?.input?.offset)?Math.max(1,part.state.input.offset):1};
    }catch{/* Private or invalid activity is intentionally not projected. */}
  }
  return latest;
}
