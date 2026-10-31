// Private installer failure injection. Never edit the production installer/source.
import {readFileSync, writeFileSync, copyFileSync, existsSync, renameSync} from 'node:fs';
import {resolve, join} from 'node:path';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {prepareNsis} from './prepare-nsis.mjs';

const version = JSON.parse(readFileSync('apps/desktop/package.json')).version;
if (version !== '0.5.2') throw Error('Review fixture for a different release');
prepareNsis();
const include = readFileSync('apps/desktop/installer.nsh', 'utf8');
const anchor = /(!macro customInstall\r?\n[\s\S]*?  Pop \$R1\r?\n)/;
if (!anchor.test(include)) throw Error('Installer fixture anchor changed');
const injected = include.replace(anchor, '$1  ; PRIVATE FIXTURE: real commit must succeed before controlled failure.\n' +
  '  FileOpen $R2 "$INSTDIR.fixture-commit.json" w\n  FileWrite $R2 "$R0"\n  FileClose $R2\n  StrCpy $R0 1\n');
const fixtureInclude = resolve('.localagent/recovery-fixture52.nsh');
writeFileSync(fixtureInclude, injected);
const config = resolve('.localagent/recovery-fixture-config52.cjs');
writeFileSync(config, `const base=require(${JSON.stringify(resolve('apps/desktop/electron-builder.config.cjs'))});module.exports={...base,nsis:{...base.nsis,include:${JSON.stringify(fixtureInclude)}},win:{...base.win,artifactName:'LocalAgent-RecoveryFixture-0.5.2-x64.exe'}};`);
const output = resolve('release/desktop-' + version);
const cache = resolve('.localagent/desktop-archive-cache/localagent-desktop-' + version + '-x64.nsis.zip');
const expected = JSON.parse(readFileSync('validation/phase52/archive.json'));
const hash = createHash('sha256');
const {createReadStream} = await import('node:fs');
for await (const chunk of createReadStream(cache)) hash.update(chunk);
if (hash.digest('hex') !== expected.sha256) throw Error('Private fixture archive mismatch');
copyFileSync(cache, join(output, 'localagent-desktop-' + version + '-x64.nsis.zip'));
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/(API_KEY|TOKEN|SECRET|PASSWORD|^CSC_|^LOCALAGENT_SIGNING|^LOCALAGENT_REQUIRE_SIGNING)/i.test(k)));
Object.assign(env, {CSC_IDENTITY_AUTO_DISCOVERY: 'false', ELECTRON_BUILDER_CACHE: resolve('.localagent/builder-cache')});
const child = spawn(process.execPath, ['node_modules/electron-builder/cli.js', '--projectDir', 'apps/desktop', '--config', config, '--win', '--x64', '--prepackaged', resolve(output, 'win-unpacked')], {env, windowsHide: true, stdio: 'inherit'});
const code = await new Promise((r, j) => {child.once('exit', r); child.once('error', j);});
if (code !== 0) throw Error('Private fixture compilation failed');
const target = resolve('.localagent/phase52-recovery-fixture.exe');
if (existsSync(target)) throw Error('Refusing to replace an existing failure fixture');
renameSync(join(output, 'LocalAgent-RecoveryFixture-0.5.2-x64.exe'), target);
console.log('Private recovery fixture: ' + target);
