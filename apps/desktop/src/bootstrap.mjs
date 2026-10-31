// Dedicated probe never loads application state, preload, credentials or IPC.
if(process.argv.includes('--localagent-preview-probe'))await import('./preview-probe.mjs');
else await import('./main.mjs');
