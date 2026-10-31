import {readFileSync,writeFileSync,mkdirSync,readdirSync,copyFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
export function prepareNsis({evidenceDirectory='validation/phase52'}={}){
 const file='node_modules/app-builder-lib/templates/nsis/include/extractAppPackage.nsh';
 const expected='e4174388a0f7a1df0b85a0742aa1ea7a4b2b18f9f29dccd6ef10a66212f68148';
 const bytes=readFileSync(file);if(createHash('sha256').update(bytes).digest('hex')!==expected)throw Error('Review changed upstream NSIS extraction template before building');
 const source=bytes.toString(),pattern=/!macro decompress\r?\n[\s\S]*?!macroend/;
 if(!pattern.test(source))throw Error('Unexpected upstream extraction contract');
 mkdirSync('.localagent/nsis',{recursive:true});
 // Preserve the template working-directory lookup order (notably its own
 // multiUser.nsh rather than NSIS's unrelated built-in MultiUser.nsh).
 for(const entry of readdirSync('node_modules/app-builder-lib/templates/nsis',{withFileTypes:true}))if(entry.isFile()&&/\.(nsh|nsi)$/.test(entry.name))copyFileSync('node_modules/app-builder-lib/templates/nsis/'+entry.name,'.localagent/nsis/'+entry.name);
 // The upstream old-version uninstall runs BEFORE extraction, so an extraction
 // failure loses the previous app. Stage/validate/swap instead, preserving all
 // upstream registry, shortcut and generated-uninstaller handling afterward.
 const install=readFileSync('node_modules/app-builder-lib/templates/nsis/installSection.nsh','utf8');
 if(createHash('sha256').update(install).digest('hex')!=='74c4dbb4163cdd90ca4850b75d304e916235c882d6af7b5cdad63bffbc977072')throw Error('Review changed upstream installer transaction before building');
 const old=/!insertmacro uninstallOldVersion SHELL_CONTEXT\r?\n!insertmacro handleUninstallResult SHELL_CONTEXT\r?\n\r?\n\$\{if\} \$installMode == "all"[\s\S]*?\$\{endIf\}/;
 if(!old.test(install))throw Error('Unexpected old uninstall contract');
 writeFileSync('.localagent/nsis/installSection.nsh',install.replace(old,'; LocalAgent validates and retains the previous payload during decompression.'));
 const assisted=readFileSync('node_modules/app-builder-lib/templates/nsis/assistedInstaller.nsh','utf8');
 if(createHash('sha256').update(assisted).digest('hex')!=='8aa1230e9717b428664d613fcc5c6a060883410b34cb7853b517fe11b4ee0a76')throw Error('Review changed upstream directory page');
 writeFileSync('.localagent/nsis/assistedInstaller.nsh',assisted.replace('!insertmacro MUI_PAGE_DIRECTORY','!define MUI_PAGE_CUSTOMFUNCTION_SHOW localagentDirectoryShow\n    !define MUI_PAGE_CUSTOMFUNCTION_LEAVE localagentDirectoryLeave\n    !insertmacro MUI_PAGE_DIRECTORY'));
 const util=readFileSync('node_modules/app-builder-lib/templates/nsis/include/installUtil.nsh','utf8');
 const utilHash='97bd546b5cd2aaf16b77bc9e2be8a18962dd74ab5c4d23b35b163ca89bf4dd2a';
 if(createHash('sha256').update(util).digest('hex')!==utilHash)throw Error('Review changed upstream installer utility before building');
 // Remove the now-unreachable old-version uninstall chain. NSIS correctly
 // treats unreferenced functions as errors; keep warnings enabled globally.
 let isolated=util;
 for(const name of ['GetInQuotes','GetFileParent','handleUninstallResult','uninstallOldVersion']){
  const pattern=new RegExp('^Function '+name+'\\r?\\n[\\s\\S]*?^FunctionEnd\\r?\\n','m');if(!pattern.test(isolated))throw Error('Unexpected installer utility function: '+name);isolated=isolated.replace(pattern,'');
 }
 for(const name of ['GetInQuotes','handleUninstallResult','uninstallOldVersion']){
  const pattern=new RegExp('^!macro '+name+'[^\\r\\n]*\\r?\\n[\\s\\S]*?^!macroend\\r?\\n','m');if(!pattern.test(isolated))throw Error('Unexpected installer utility macro: '+name);isolated=isolated.replace(pattern,'');
 }
 writeFileSync('.localagent/nsis/installUtil.nsh',isolated);
 writeFileSync('.localagent/nsis/extractAppPackage.nsh',source.replace(pattern,'!macro decompress\n  !insertmacro localagentDecompress\n!macroend'));
 mkdirSync(evidenceDirectory,{recursive:true});writeFileSync(evidenceDirectory+'/installer-template.json',JSON.stringify({builder:'26.15.3',extractionHash:expected,installSectionHash:'74c4dbb4163cdd90ca4850b75d304e916235c882d6af7b5cdad63bffbc977072',installUtilHash:utilHash,extension:'Isolated extraction/staged-activation overlays; obsolete uninstall chain removed',warningsAsErrors:true,upstreamFilesModified:0,uninstaller:'Original upstream generation and cleanup hook'},null,2));
}
