import {readFileSync, writeFileSync, statSync, existsSync} from 'node:fs';
import {resolve} from 'node:path';
const load = path => JSON.parse(readFileSync('validation/phase52/' + path));
const mib = value => Math.round(value / 1048576 * 10) / 10;
const report = {conditions: 'Current Windows host; file caches and competing load uncontrolled. No independent cold/clean-machine claim.', inferenceRequests: 0};
const baseline = load('profile-baseline.json');
const engine = sample => sample.processes.find(p => p.Id === sample.roles.find(r => r.service === 'engine').pid);
const tail = baseline.soak.slice(-15).map(engine);
report.engine = {scope: '31-minute no-inference session-read/static-build baseline, unchanged production engine',
  readyMs: baseline.readyMs, samples: baseline.soak.length, elapsedMs: baseline.soak.at(-1).elapsedMs,
  settledPrivateMiB: mib(tail.at(-1).PrivateMemorySize64), settledWorkingSetMiB: mib(tail.at(-1).WorkingSet64),
  last15PrivateRangeMiB: [mib(Math.min(...tail.map(p => p.PrivateMemorySize64))), mib(Math.max(...tail.map(p => p.PrivateMemorySize64)))],
  last15PrivateNetMiB: mib(tail.at(-1).PrivateMemorySize64 - tail[0].PrivateMemorySize64),
  note: 'Short --smol pilot showed no convincing improvement. No production flag or upstream behavior change; longer inference/large-repository behavior remains unverified.'};
report.packagedSoaks=[];
for(const file of ['soak/packaged-fixture.json','foreground-soak/packaged-fixture.json']){
 if(existsSync('validation/phase52/'+file)){
  const soak = load(file);
  if (soak.soak?.samples.length) {
    const samples = soak.soak.samples, sorted = samples.map(s => s.latencyMs).sort((a, b) => a - b);
    const roles = {};
    for (const name of ['engine', 'gateway']) {
      const metrics = samples.map(s => s.os.find(p => p.Id === s.roles.find(r => r.service === name).pid));
      roles[name] = {privateFirstLastMiB: [mib(metrics[0].PrivateMemorySize64), mib(metrics.at(-1).PrivateMemorySize64)],
        privateRangeMiB: [mib(Math.min(...metrics.map(p => p.PrivateMemorySize64))), mib(Math.max(...metrics.map(p => p.PrivateMemorySize64)))],
        handlesFirstLast: [metrics[0].HandleCount, metrics.at(-1).HandleCount], threadsFirstLast: [metrics[0].Threads, metrics.at(-1).Threads]};
    }
    report.packagedSoaks.push({file,passed:soak.passed,failure:soak.failure,rounds: samples.length, minimumWaitMs: samples.length * 60000, shutdown: soak.shutdown,
      workflowLatencyMs: {median: sorted[Math.floor(sorted.length / 2)], p95: sorted[Math.ceil(sorted.length * .95) - 1], max: sorted.at(-1)}, roles,
      scope: 'Completed cycles only, not a passing 20-round soak. Repeated HTML edits/builds and occasional responsive inspections; inspection rounds include browser launch. Engine has no inference workload; coding leak freedom is not established.'});
  }
 }
}
if(existsSync('validation/phase52/packaged-fixture.json'))report.rendererMemory=load('packaged-fixture.json').rendererMemory;
if(existsSync('validation/phase52/renderer-probe/packaged-fixture.json')){const p=load('renderer-probe/packaged-fixture.json');report.repeatedRendererProbe={passed:p.passed,shutdown:p.shutdown,...p.rendererMemory};}
if(existsSync('validation/phase52/accessibility.json')){const a=load('accessibility.json');report.installedAccessibility={passed:a.passed,startupMs:a.startupMs,views:a.audits.length,violations:a.audits.reduce((n,x)=>n+x.violations.length,0),humanScreenReaderVerified:false};}
if(existsSync('validation/phase52/extended-a11y/accessibility.json')){const a=load('extended-a11y/accessibility.json');report.extendedPackagedAccessibility={passed:a.passed,views:a.audits.length,violations:a.audits.reduce((n,x)=>n+x.violations.length,0),zoom400:a.checks.zoom400,humanScreenReaderVerified:false};}
if(existsSync('validation/phase52/distribution.json'))report.distribution=load('distribution.json');
const installer = resolve('release/desktop-0.5.2/LocalAgent-Setup-0.5.2-x64.exe');
const oldBytes = 673721007, bytes = statSync(installer).size;
report.artifact = {path: installer, bytes, previousBytes: oldBytes, savedBytes: oldBytes - bytes,
  reductionPercent: Math.round((1 - bytes / oldBytes) * 10000) / 100, sha256: load('installer-hash.json').Hash.toLowerCase(), signed: false};
writeFileSync('validation/phase52/summary.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
