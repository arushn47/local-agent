const path=require('node:path');
const fs=require('node:fs');
const {spawnSync}=require('node:child_process');
module.exports={
 appId:'io.localagent.desktop',productName:'LocalAgent',electronVersion:'42.11.18',electronDist:path.resolve(__dirname,'../../node_modules/electron/dist'),
 directories:{app:__dirname,output:path.resolve(__dirname,'../../release/desktop-'+require('./package.json').version),buildResources:path.join(__dirname,'assets')},
 files:['src/**/*','vendor/**/*','assets/**/*','package.json','!node_modules/**/*'],asar:true,npmRebuild:false,
 electronLanguages:['en-US'],
 extraResources:[{from:path.resolve(__dirname,'../../.localagent/desktop-stage/runtime'),to:'runtime',filter:['**/*']},{from:path.resolve(__dirname,'../../.localagent/desktop-stage/runtime/node_modules'),to:'runtime/node_modules',filter:['**/*']},{from:path.resolve(__dirname,'../../.localagent/desktop-stage/node'),to:'node'},{from:path.resolve(__dirname,'../../.localagent/desktop-stage/manifest.json'),to:'runtime-manifest.json'},{from:path.resolve(__dirname,'../../THIRD_PARTY_NOTICES.md'),to:'THIRD_PARTY_NOTICES.md'},{from:path.join(__dirname,'upgrade.cjs'),to:'upgrade.cjs'},{from:path.join(__dirname,'registration.cjs'),to:'registration.cjs'},{from:path.resolve(__dirname,'../../docs'),to:'docs',filter:['RELEASE.md','TROUBLESHOOTING.md','RELEASE-NOTES.md','SECURITY.md','DESKTOP.md','BUILDER.md','LICENSE_REVIEW.md','RELEASE_DECISIONS.md','third-party/**/*']}],
 electronFuses:{runAsNode:false,enableCookieEncryption:true,enableNodeOptionsEnvironmentVariable:false,enableEmbeddedAsarIntegrityValidation:true,onlyLoadAppFromAsar:true},
 win:{target:[{target:'nsis',arch:['x64']}],icon:path.join(__dirname,'assets/icon.ico'),artifactName:'LocalAgent-Setup-${version}-${arch}.${ext}',signAndEditExecutable:true,verifyUpdateCodeSignature:true,...(process.env.LOCALAGENT_REQUIRE_SIGNING==='1'?{signtoolOptions:{certificateSha1:process.env.LOCALAGENT_SIGNING_CERT_SHA1,publisherName:process.env.LOCALAGENT_SIGNING_PUBLISHER,signingHashAlgorithms:['sha256']}}:{})},
 nsis:{oneClick:false,perMachine:false,allowElevation:false,packElevateHelper:false,useZip:true,differentialPackage:false,include:path.join(__dirname,'installer.nsh'),allowToChangeInstallationDirectory:true,createDesktopShortcut:true,createStartMenuShortcut:true,shortcutName:'LocalAgent',runAfterFinish:false,deleteAppDataOnUninstall:false},
 publish:null,
 forceCodeSigning:process.env.LOCALAGENT_REQUIRE_SIGNING==='1',
 afterPack:async context=>{
   const runtime=path.join(context.appOutDir,'resources/runtime'),node=path.join(context.appOutDir,'resources/node/node.exe');
   for(const file of ['node_modules/opencode-ai/bin/opencode.exe','node_modules/omniroute/dist/server-ws.mjs','node_modules/@opencode-ai/sdk/package.json','apps/workspace/dist/index.html'])if(!fs.existsSync(path.join(runtime,file)))throw Error('Packaged runtime file missing: '+file);
   const pin=JSON.parse(fs.readFileSync(path.join(runtime,'integrations/runtime-versions.json')));
   const version=spawnSync(node,['--version'],{encoding:'utf8',windowsHide:true});if(version.status!==0||version.stdout.trim()!=='v'+pin.node)throw Error('Packaged Node version mismatch');
   const engine=spawnSync(path.join(runtime,'node_modules/opencode-ai/bin/opencode.exe'),['--version'],{encoding:'utf8',windowsHide:true});if(engine.status!==0||engine.stdout.trim()!==pin.opencode)throw Error('Packaged OpenCode version mismatch');
   const sqlite=spawnSync(node,['-e',"const D=require('better-sqlite3');const d=new D(':memory:');if(d.prepare('SELECT 1 AS ok').get().ok!==1)process.exit(1);d.close()"],{cwd:runtime,encoding:'utf8',windowsHide:true});if(sqlite.status!==0)throw Error('Packaged SQLite native ABI check failed');
   fs.mkdirSync(path.resolve(__dirname,'../../validation/phase52'),{recursive:true});fs.writeFileSync(path.resolve(__dirname,'../../validation/phase52/package-binaries.json'),JSON.stringify({node:pin.node,opencode:pin.opencode,nativeSqlite:true,requiredFiles:true},null,2));
 },
};
