import {mkdirSync,writeFileSync} from 'node:fs';
import {launchBrowser} from './browser.mjs';
// Original code-drawn mark; no external asset or paid image service.
mkdirSync('apps/desktop/assets',{recursive:true});const browser=await launchBrowser();
try{const page=await browser.newPage({viewport:{width:256,height:256},deviceScaleFactor:1});await page.setContent('<html><body style="margin:0;background:transparent"><canvas width="256" height="256"></canvas></body></html>');
 const data=await page.evaluate(()=>{const c=document.querySelector('canvas'),g=c.getContext('2d');g.fillStyle='#f5f4ef';g.beginPath();g.roundRect(0,0,256,256,46);g.fill();g.transform(1,-.18,0,1,44,36);g.fillStyle='#263126';g.fillRect(0,87,43,95);g.fillRect(57,43,43,139);g.fillStyle='#577c47';g.fillRect(114,70,43,112);return c.toDataURL().split(',')[1];});
 const png=Buffer.from(data,'base64'),header=Buffer.alloc(22);header.writeUInt16LE(1,2);header.writeUInt16LE(1,4);header.writeUInt16LE(1,10);header.writeUInt16LE(32,12);header.writeUInt32LE(png.length,14);header.writeUInt32LE(22,18);
 writeFileSync('apps/desktop/assets/icon.png',png);writeFileSync('apps/desktop/assets/icon.ico',Buffer.concat([header,png]));
}finally{await browser.close();}
