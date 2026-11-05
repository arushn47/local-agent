import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
const version=JSON.parse(readFileSync('apps/desktop/package.json')).version;
if(!/^\d+\.\d+\.\d+$/.test(version))throw Error('Invalid candidate version');
const directory=resolve('release','desktop-'+version);
if(!existsSync(join(directory,'win-unpacked/LocalAgent.exe')))throw Error('Build the candidate first');
writeFileSync(join(directory,'Launch-Internal.cmd'),`@echo off\r\nsetlocal\r\nset "LOCALAGENT_USER_DATA_DIR=%LOCALAPPDATA%\\LocalAgent-Internal-${version}"\r\nstart "" "%~dp0win-unpacked\\LocalAgent.exe"\r\nendlocal\r\n`);
writeFileSync(join(directory,'README-INTERNAL.txt'),`LocalAgent ${version} - unsigned internal candidate\r\n\r\nRun Launch-Internal.cmd to use an isolated profile in %LOCALAPPDATA%\\LocalAgent-Internal-${version}. Keep this whole folder together. Launching win-unpacked\\LocalAgent.exe directly uses the application's normal user-data location.\r\n\r\nProduction multi-agent execution remains gated pending separately authorized live acceptance. Single-agent coding requires your own eligible free-provider connection or compatible local model. Static HTML/CSS/JavaScript previews are supported. Agent shell permissions are not an OS sandbox.\r\n\r\nSee win-unpacked\\resources\\docs\\MVP-CANDIDATE.md for feature scope, verification and public-release blockers. This candidate is not signed, published or independently clean-machine certified.\r\n`);
console.log('Wrote isolated-profile internal launcher and instructions.');
