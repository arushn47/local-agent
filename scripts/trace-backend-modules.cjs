// Test-only module-path recorder and containment guard. No request/code contents.
const {registerHooks}=require('node:module'),{appendFileSync,realpathSync}=require('node:fs'),{fileURLToPath}=require('node:url'),{resolve,sep}=require('node:path');
const root=resolve(process.env.LOCALAGENT_CLOSURE_ROOT),log=process.env.LOCALAGENT_CLOSURE_LOG;
registerHooks({resolve(specifier,context,next){const result=next(specifier,context);if(result.url?.startsWith('file:')){const file=realpathSync(fileURLToPath(result.url));if(!file.toLowerCase().startsWith((root+sep).toLowerCase())){appendFileSync(log,JSON.stringify({event:'escape',file})+'\n');throw Error('backend_dependency_escape');}appendFileSync(log,JSON.stringify({event:'module',file})+'\n');}return result;}});
