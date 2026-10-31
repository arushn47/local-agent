const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('localagentDesktop',Object.freeze({
  selectProject:()=>ipcRenderer.invoke('localagent:select-project'),
  status:()=>ipcRenderer.invoke('localagent:status'),
  restart:()=>ipcRenderer.invoke('localagent:restart'),
  onStatus:callback=>{const handler=(_,value)=>callback(value);ipcRenderer.on('localagent:status-changed',handler);return ()=>ipcRenderer.removeListener('localagent:status-changed',handler);},
  onOpenProject:callback=>{const handler=()=>callback();ipcRenderer.on('localagent:open-project',handler);return ()=>ipcRenderer.removeListener('localagent:open-project',handler);},
}));
