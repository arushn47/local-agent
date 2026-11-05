// Build-only npm, isolated from application dependencies and the user's global
// installation. Official bundled package; no lifecycle scripts are executed.
import {mkdirSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const version='12.2.2',integrity='KglgbZyacf7jH+FHuNRqVuCzQi8VhI2a7J87Ix43FsPTuZoGWmIXXGdZtBUOA79vwL+IJREqURVzupA7PsQTcA==';
const directory=resolve('.localagent/build-npm-'+version),archive=join(directory,'npm.tgz');
mkdirSync(directory,{recursive:true});
if(!existsSync(archive)){
  const response=await fetch(`https://registry.npmjs.org/npm/-/npm-${version}.tgz`,{redirect:'error',signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw Error('npm_tool_download_failed');
  const data=Buffer.from(await response.arrayBuffer());if(data.length>20*1024*1024)throw Error('npm_tool_size_limit');writeFileSync(archive,data,{flag:'wx'});
}
if(createHash('sha512').update(readFileSync(archive)).digest('base64')!==integrity)throw Error('npm_tool_integrity_mismatch');
const paths=execFileSync('tar',['-tzf',archive],{encoding:'utf8',maxBuffer:1024*1024}).trim().split(/\r?\n/);
if(paths.some(path=>!path.startsWith('package/')||path.split('/').includes('..')||/[\\:\x00]/.test(path)))throw Error('npm_tool_archive_path');
execFileSync('tar',['-xzf',archive,'-C',directory],{windowsHide:true});
const pkg=JSON.parse(readFileSync(join(directory,'package/package.json')));
if(pkg.version!==version||pkg.license!=='Artistic-2.0'||Object.keys(pkg.scripts||{}).some(key=>['preinstall','install','postinstall'].includes(key)))throw Error('npm_tool_package_mismatch');
const cli=join(directory,'package/bin/npm-cli.js');
if([process.execPath,cli].some(path=>/["%\r\n]/.test(path)))throw Error('npm_tool_shim_path');
writeFileSync(join(directory,'npm.cmd'),`@"${process.execPath}" "${cli}" %*\r\n`);
console.log(JSON.stringify({directory,version,license:pkg.license,integrityVerified:true,applicationDependencyChanges:0,lifecycleScriptsExecuted:0}));
