import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {existsSync,readFileSync,unlinkSync,copyFileSync,mkdirSync} from 'node:fs';
import {archiveDesktop} from './archive-desktop.mjs';
import {prepareNsis} from './prepare-nsis.mjs';
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
prepareNsis();
const mode=process.argv[2]||'pack';if(!['pack','installer'].includes(mode))throw Error('Unknown desktop build target');
const version=JSON.parse(readFileSync('apps/desktop/package.json')).version,output=resolve('release','desktop-'+version);
if(mode==='installer'){
 const version=JSON.parse(readFileSync('apps/desktop/package.json')).version;
 if(!/^\d+\.\d+\.\d+$/.test(version))throw Error('Unexpected installer version');
 // An interrupted 7z file can otherwise be mistaken for a newer valid cache.
 if(!process.argv.includes('--reuse-archive'))for(const extension of ['7z','zip']){const partial=resolve(output,`localagent-desktop-${version}-x64.nsis.${extension}`);if(existsSync(partial))unlinkSync(partial);}
}
const args=['node_modules/electron-builder/cli.js','--projectDir','apps/desktop','--config','electron-builder.config.cjs','--win','--x64'];
const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>!/(API_KEY|TOKEN|SECRET|PASSWORD|^SENTRY_|^CSC_)/i.test(k)));
if(process.argv.includes('--signed')){
 if(!/^[a-f0-9]{40}$/i.test(process.env.LOCALAGENT_SIGNING_CERT_SHA1||'')||!process.env.LOCALAGENT_SIGNING_PUBLISHER)throw Error('Signing requires an explicitly selected Windows certificate-store thumbprint and publisher. No certificate is selected automatically.');
 env.LOCALAGENT_REQUIRE_SIGNING='1';
}else{delete env.LOCALAGENT_REQUIRE_SIGNING;delete env.LOCALAGENT_SIGNING_CERT_SHA1;delete env.LOCALAGENT_SIGNING_PUBLISHER;}
env.ELECTRON_BUILDER_CACHE=resolve('.localagent/builder-cache');env.CSC_IDENTITY_AUTO_DISCOVERY='false';
// Level 6 compresses the large upstream graph; this changes archive size,
// never the application payload.
env.ELECTRON_BUILDER_COMPRESSION_LEVEL='6';
const run=options=>new Promise((r,j)=>{const child=spawn(process.execPath,[...args,...options],{cwd:resolve('.'),env,windowsHide:true,stdio:'inherit'});child.once('exit',code=>r(code??1));child.once('error',j);});
if(mode==='pack')process.exitCode=await run(['--dir']);
else{
 if(!process.argv.includes('--prepackaged')){const code=await run(['--dir']);if(code!==0)process.exit(code);}
 const archiveName=`localagent-desktop-${version}-x64.nsis.zip`,archivePath=resolve(output,archiveName),cacheDirectory=resolve('.localagent/desktop-archive-cache'),cachePath=resolve(cacheDirectory,archiveName);
 if(process.argv.includes('--reuse-archive')){
   if(!existsSync(archivePath)&&existsSync(cachePath))copyFileSync(cachePath,archivePath);
   if(!process.argv.includes('--prepackaged'))throw Error('Archive reuse is only valid for installer-only changes');
   const expected=JSON.parse(readFileSync('validation/phase52/archive.json')),hash=createHash('sha256');
   for await(const part of createReadStream(resolve(output,`localagent-desktop-${version}-x64.nsis.zip`)))hash.update(part);
   if(hash.digest('hex')!==expected.sha256)throw Error('Cached installer archive hash mismatch');
 }else await archiveDesktop(JSON.parse(readFileSync('apps/desktop/package.json')).version);
 // Upstream deletes its input archive after compilation. Retain a local copy;
 // reuse still requires the exact recorded hash above.
 mkdirSync(cacheDirectory,{recursive:true});copyFileSync(archivePath,cachePath);
 // electron-builder's supported newer-archive cache consumes this valid ZIP;
 // NSIS remains responsible for compilation, installation and uninstall.
 process.exitCode=await run(['--prepackaged',resolve(output,'win-unpacked')]);
}
