// Serial UI/registration checks; running desktop drivers together can occlude screenshots.
import {readFileSync, writeFileSync, createWriteStream} from 'node:fs';
import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
const directory = resolve('validation/phase52'), report = {inferenceRequests: 0, checks: []};
const soak = JSON.parse(readFileSync(resolve(directory, 'foreground-soak/packaged-fixture.json')));
// A failed stability run remains a release blocker; it must not prevent
// independent install/recovery evidence after its processes have stopped.
if (!soak.shutdown) throw Error('Stop the previous UI driver before distribution checks');
report.soakAttempt = {passed: soak.passed, rounds: soak.soak?.samples.length, failure: soak.failure};
const cases = [
  ['installed', ['scripts/verify-desktop-install.mjs', '--builder', '--accessibility', '--memory-probe']],
  ['upgrade-0.5.1', ['scripts/verify-upgrade.mjs', '--from=0.5.1', '--locked-file', '--interrupt-extraction', '--failure-installer=.localagent/phase52-recovery-fixture.exe', '--retain-on-failure']],
  ...['0.3.0', '0.4.0', '0.5.0'].map(version => ['upgrade-' + version, ['scripts/verify-upgrade.mjs', '--from=' + version, '--retain-on-failure']]),
];
for (const [label, args] of cases) {
  report.current = label;
  writeFileSync(resolve(directory, 'distribution-progress.json'), JSON.stringify(report, null, 2));
  const start = Date.now(), log = createWriteStream(resolve(directory, label + '.log'));
  const child = spawn(process.execPath, args, {env: process.env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']});
  child.stdout.pipe(log); child.stderr.pipe(log);
  const code = await new Promise((r, j) => {child.once('exit', r); child.once('error', j);});
  await new Promise(r => log.end(r));
  report.checks.push({label, exit: code, elapsedMs: Date.now() - start});
  console.log(JSON.stringify(report.checks.at(-1)));
  if (code !== 0) {report.passed = false; writeFileSync(resolve(directory, 'distribution.json'), JSON.stringify(report, null, 2)); process.exit(1);}
}
delete report.current; report.passed = true;
writeFileSync(resolve(directory, 'distribution.json'), JSON.stringify(report, null, 2));
