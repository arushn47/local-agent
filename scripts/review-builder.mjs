// Review the retained completed task; never submits prompts or model requests.
import {_electron} from 'playwright';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {browserEnvironment} from '../src/workspace/browser-inspect.mjs';
import {clickPreview} from './preview-pointer.mjs';
const evidence=resolve('validation/phase4'),previous=JSON.parse(readFileSync(join(evidence,'packaged-coding.json'))),profile=previous.profile;
const result={inferenceRequested:false};let app;
try{
 app=await _electron.launch({executablePath:resolve(process.env.LOCALAGENT_DESKTOP_EXE||'release/desktop-0.4.0/win-unpacked/LocalAgent.exe'),env:{...browserEnvironment(),LOCALAGENT_USER_DATA_DIR:profile},timeout:30000});
 const page=await app.firstWindow();await page.waitForURL('http://127.0.0.1:*/',{timeout:180000});await page.getByRole('heading',{name:new RegExp(previous.fixture.split(/[\\/]/).at(-1))}).waitFor();
 await page.getByRole('button',{name:'Preview',exact:true}).click();const start=page.getByRole('button',{name:'Start isolated preview',exact:true});await start.click();
 const frame=page.frameLocator('iframe[title="Isolated website preview"]'),button=frame.getByRole('button',{name:'Save Note',exact:true});await button.waitFor();
 await app.evaluate(({BrowserWindow})=>{const win=BrowserWindow.getAllWindows()[0];win.show();win.setAlwaysOnTop(true);win.focus();win.webContents.focus();});await page.bringToFront();
 const before=await frame.locator('#count').innerText();await clickPreview(page,button);await page.waitForTimeout(250);result.playwrightPointerUpdatedCounter=await frame.locator('#count').innerText()!==before;
 if(!result.playwrightPointerUpdatedCounter){
  const box=await button.boundingBox();await app.evaluate(({BrowserWindow},box)=>{const win=BrowserWindow.getAllWindows()[0];for(const type of ['mouseMove','mouseDown','mouseUp'])win.webContents.sendInputEvent({type,button:'left',clickCount:1,x:Math.round(box.x+box.width/2),y:Math.round(box.y+box.height/2)});},box);await page.waitForTimeout(250);result.electronPointerUpdatedCounter=await frame.locator('#count').innerText()!==before;
 }
 await page.getByRole('button',{name:'Desktop',exact:true}).click();await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:join(evidence,'workspace-overview.png'),timeout:12000});
 await page.getByRole('button',{name:'Mobile',exact:true}).click();await page.getByRole('button',{name:'Inspect with Playwright',exact:true}).click();await page.getByRole('button',{name:'Inspecting…',exact:true}).waitFor({state:'hidden',timeout:30000});await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:join(evidence,'workspace-mobile.png'),timeout:12000});
 await page.getByRole('button',{name:/Connections/}).click();if(await page.getByRole('button',{name:'Manage connection',exact:true}).count()){await page.getByRole('button',{name:'Manage connection',exact:true}).first().click();await page.getByRole('button',{name:'Disconnect provider',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden',timeout:60000});}result.testCredentialRemoved=true;
 result.passed=true;
}catch(e){result.passed=false;result.failure=e.message;process.exitCode=1;}
finally{await app?.close().catch(()=>{});writeFileSync(join(evidence,'review.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));}
