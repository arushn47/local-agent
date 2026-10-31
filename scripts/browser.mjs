import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
export function launchBrowser(){
  const cached=process.env.LOCALAPPDATA&&join(process.env.LOCALAPPDATA,'ms-playwright/chromium-1208/chrome-win64/chrome.exe');
  const executablePath=process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||(!existsSync(chromium.executablePath())&&cached&&existsSync(cached)?cached:undefined);
  return chromium.launch({headless:true,...(executablePath?{executablePath}:{})});
}
