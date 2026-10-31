import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {markdownHtml,safeLink} from '../apps/workspace/src/markdown.mjs';
import {createTasks} from '../src/workspace/tasks.mjs';

test('Markdown parses coding prose while rejecting active HTML, images and unsafe links',()=>{
 const html=markdownHtml('# Result\n\n**Passed** with `node --test`.\n\n```javascript\nconst x = "<script>";\n```\n\n<script>alert(1)</script>\n\n![image](https://tracker.test/a)\n\n[unsafe](javascript:alert%281%29)');
 assert.match(html,/<h1>Result/);assert.match(html,/<strong>Passed/);assert.match(html,/<code class="language-javascript">/);
 assert.ok(!html.includes('<script>'));assert.ok(!html.includes('<img'));assert.ok(!html.includes('href="javascript:'));
 for(const value of ['javascript:alert(1)','data:text/html,x','file:///D:/secret','//tracker.test','relative.txt','java\nscript:alert(1)'])assert.equal(safeLink(value),null);
 assert.equal(safeLink('https://example.test/a'),'https://example.test/a');
});
test('history uses bounded upstream cursor reads, excludes private parts and never dispatches tools',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'localagent-history-')),file=join(dir,'sessions.json');
 writeFileSync(file,JSON.stringify([{id:'ses_history',projectId:'project'}]));
 const calls=[];
 const tasks=createTasks({forProject:()=>({session:{messages:async input=>{calls.push(input);return {data:[{info:{id:'msg_old',role:'assistant'},parts:[{type:'text',text:'Earlier requirement'},{type:'reasoning',text:'hidden'},{type:'compaction',auto:true}]}]};}}})},{get:()=>({path:dir})},{sessionFile:file});
 try{
   const result=await tasks.history('ses_history','msg_current');
   assert.deepEqual(calls,[{sessionID:'ses_history',before:'msg_current',limit:50}]);assert.equal(result.hasMore,false);
   assert.equal(result.messages[0].parts.length,2);assert.ok(!JSON.stringify(result).includes('hidden'));
   await assert.rejects(tasks.history('ses_history','../../secret'),/invalid_history_cursor/);
   await assert.rejects(tasks.history('ses_foreign','msg_current'),/session_not_found/);assert.equal(calls.length,1);
 }finally{tasks.stop();rmSync(dir,{recursive:true,force:true});}
});
