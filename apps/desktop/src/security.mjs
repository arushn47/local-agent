export function isDesktopURL(value,origin,splash,allowSplash=false){
  if(allowSplash&&value===splash)return true;
  if(!origin||typeof value!=='string')return false;
  try{const url=new URL(value);return url.origin===origin&&url.protocol==='http:'&&url.hostname==='127.0.0.1'&&!url.username&&!url.password;}catch{return false;}
}
export function isTrustedSender(event,win,origin,splash,allowSplash=false){
  return !!event.senderFrame&&event.sender===win?.webContents&&event.senderFrame===win.webContents.mainFrame&&isDesktopURL(event.senderFrame.url,origin,splash,allowSplash);
}
