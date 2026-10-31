import test from 'node:test';
import assert from 'node:assert/strict';
import {contextSummary} from '../src/workspace/context-summary.mjs';

const message=(id,tokens,completed=1)=>({info:{id,role:'assistant',time:{completed},tokens},parts:[{type:'reasoning',text:'hidden'},{type:'tool',thought_signature:'secret'}]});
test('context reports latest completed upstream input/cache accounting without private content',()=>{
 const result=contextSummary([message('old',{input:50,output:10,cache:{read:0,write:0}}),message('new',{input:100,output:12,cache:{read:20,write:3}}),message('stream',{input:200,output:20,cache:{read:0,write:0}},null)]);
 assert.equal(result.messageId,'new');assert.equal(result.inputIncludingCache,123);assert.equal(result.outputTokens,12);
 assert.equal(result.contextWindow,null);assert.equal(result.percentage,null);assert.equal(result.breakdown,null);
 assert.ok(!/hidden|secret|thought_signature/.test(JSON.stringify(result)));
});
test('missing, malformed and zero usage are unknown, never fabricated occupancy',()=>{
 assert.equal(contextSummary([]).source,'unavailable');
 assert.equal(contextSummary([message('bad',{input:NaN,output:10})]).source,'unavailable');
 assert.equal(contextSummary([message('zero',{input:0,output:0,cache:{read:0,write:0}})]).source,'unavailable');
 const partial=contextSummary([message('partial',{input:12,output:1})]);
 assert.equal(partial.inputTokens,12);assert.equal(partial.inputIncludingCache,null);
});
