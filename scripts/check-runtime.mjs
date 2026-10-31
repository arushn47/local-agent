import { checkRuntimes } from '../src/runtime-dependencies.mjs';
import { spawnSync } from 'node:child_process';
import { opencodeExe } from '../src/config.mjs';
const result = checkRuntimes();
if (!result.ready) process.exitCode = 1;
else {
  const binary=spawnSync(opencodeExe,['--version'],{encoding:'utf8',timeout:15000,windowsHide:true});
  const matches=binary.status===0&&binary.stdout.trim()==='1.18.31';
  result.binaryVersionMatches=matches;
  if(!matches)process.exitCode=1;
}
console.log(JSON.stringify(result,null,2));
