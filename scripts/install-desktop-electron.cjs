const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto'),{createRequire}=require('node:module');
const version=JSON.parse(fs.readFileSync('integrations/runtime-versions.json')).electron;
const name=`electron-v${version}-win32-x64.zip`,file=path.resolve('.localagent/downloads',name);
const expected=JSON.parse(fs.readFileSync('node_modules/electron/checksums.json'))[name];
const actual=createHash('sha256').update(fs.readFileSync(file)).digest('hex');
if(actual!==expected)throw Error('Electron archive checksum mismatch');
const requireElectron=createRequire(path.resolve('node_modules/electron/package.json'));
const {extract}=requireElectron('@electron-internal/extract-zip');
extract(file,{dir:path.resolve('node_modules/electron/dist')}).then(()=>{
 fs.writeFileSync('node_modules/electron/path.txt','electron.exe');
 fs.writeFileSync('.localagent/electron-download.json',JSON.stringify({version,source:`https://github.com/electron/electron/releases/download/v${version}/${name}`,sha256:actual},null,2));
 console.log('Verified and installed Electron '+version);
}).catch(()=>{console.error('Electron extraction failed');process.exitCode=1;});
