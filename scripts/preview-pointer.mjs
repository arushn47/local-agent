// Playwright/Electron reports unscaled child-frame boxes for CSS-scaled
// iframes on this Windows build. Use normal mouse input at the rendered point;
// do not invoke the page handler or relax the opaque-origin sandbox.
export async function clickPreview(page,button){
 const handle=await page.locator('iframe[title="Isolated website preview"]').elementHandle();
 const frame=await handle?.contentFrame();if(!frame)throw Error('Preview frame unavailable');
 // Visible HTML can precede deferred module execution. Wait for the actual
 // frame load before sending input, rather than retrying a missed click.
 await frame.waitForLoadState('load');
 await button.scrollIntoViewIfNeeded();
 const outer=await page.locator('iframe[title="Isolated website preview"]').boundingBox();
 const inner=await button.evaluate(el=>{const r=el.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,viewportWidth:innerWidth,viewportHeight:innerHeight};});
 if(!outer||!inner.viewportWidth||!inner.viewportHeight)throw Error('Preview click target unavailable');
 const x=outer.x+(inner.x+inner.width/2)*outer.width/inner.viewportWidth,y=outer.y+(inner.y+inner.height/2)*outer.height/inner.viewportHeight;
 await page.mouse.click(x,y);return {x,y};
}
