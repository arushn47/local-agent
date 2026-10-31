import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
process.env.LOCALAGENT_STATE_DIR ||= join(fileURLToPath(new URL('../../',import.meta.url)),'.localagent/workspace-runtime');
const { startWorkspace } = await import('./application.mjs');
let application;
try {
  application=await startWorkspace();
  process.once('SIGINT',()=>application.stop());process.once('SIGTERM',()=>application.stop());
  console.log('LocalAgent workspace: '+application.url);
} catch {
  application?.stop();console.error('LocalAgent startup failed. Check the runtime log and local ports.');process.exitCode=1;
}
