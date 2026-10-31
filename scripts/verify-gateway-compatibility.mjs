// Upgrade regression only. All upstream responses come from this loopback
// fixture; no credentials, external provider calls or production fault hooks.
import {createServer} from 'node:http';
import {join,resolve} from 'node:path';
import {mkdirSync,writeFileSync} from 'node:fs';
process.env.LOCALAGENT_STATE_DIR=resolve('.localagent/gateway-compatibility-'+Date.now());
const {loadConfig,setCredentialOverlay}=await import('../src/config.mjs');
const {startPlatform}=await import('../src/runtime.mjs');const {management,qualifyModel}=await import('../src/omniroute.mjs');
setCredentialOverlay({GEMINI_API_KEY:null,GROQ_API_KEY:null,OPENROUTER_API_KEY:null});
const config=loadConfig();config.gatewayPort=20161;config.guardPort=20162;config.providers.ollama.enabled=false;
let platform,primaryCalls=0,secondaryCalls=0,metadataCalls=0,historyPreserved=false;
const call={id:'fixture_call',type:'function',function:{name:'read_fixture',arguments:'{"path":"fixture.txt"}'}};
const fixture=createServer(async(req,res)=>{
 if(req.method!=='POST'||!req.url.endsWith('/chat/completions')){metadataCalls++;res.writeHead(200,{'Content-Type':'application/json'});return res.end(JSON.stringify({data:[{id:'fixture',object:'model'}]}));}
 let body='';for await(const chunk of req)body+=chunk;const input=JSON.parse(body||'{}');
 if(req.url.startsWith('/primary/')){primaryCalls++;res.writeHead(429,{'Content-Type':'application/json','Retry-After':'3600'});return res.end(JSON.stringify({error:{message:'Controlled local fixture limit',type:'rate_limit_error'}}));}
 secondaryCalls++;
 if(input.messages?.length>1)writeFileSync('.localagent/gateway-fixture-request.json',JSON.stringify(input.messages,null,2));
 historyPreserved=input.messages?.some(m=>m.role==='tool'&&m.tool_call_id===call.id&&m.content==='fixture-continued-context')&&input.messages?.some(m=>m.tool_calls?.some(c=>c.id===call.id&&c.function.arguments===call.function.arguments));
 const delta=historyPreserved?{role:'assistant',content:'context_preserved'}:{role:'assistant',tool_calls:[{index:0,...call}]};
 res.writeHead(200,{'Content-Type':'text/event-stream'});
 res.write('data: '+JSON.stringify({id:'fixture',object:'chat.completion.chunk',created:0,model:'fixture',choices:[{index:0,delta,finish_reason:null}]})+'\n\n');
 res.end('data: '+JSON.stringify({id:'fixture',object:'chat.completion.chunk',created:0,model:'fixture',choices:[{index:0,delta:{},finish_reason:historyPreserved?'stop':'tool_calls'}]})+'\n\ndata: [DONE]\n\n');
});
await new Promise(r=>fixture.listen(0,'127.0.0.1',r));
const report={fixturesOnly:true,externalProviderRequests:0};
try{
 platform=await startPlatform(config);const api=await management(config),targets=[];
 for(const name of ['primary','secondary']){
   const baseUrl='http://127.0.0.1:'+fixture.address().port+'/'+name+'/v1';
   const created=await api('/api/provider-nodes',{method:'POST',body:{name:'Fixture '+name,prefix:'fixture-'+name,apiType:'chat',type:'openai-compatible',baseUrl}}),node=created.node||created;
   const connected=await api('/api/providers',{method:'POST',body:{provider:node.id,name:'Fixture '+name,apiKey:'fixture-only',providerSpecificData:{baseUrl},defaultModel:'fixture'}}),connection=connected.connection||connected;
   targets.push({model:qualifyModel(node.id,'fixture'),providerId:node.id,connectionId:connection.id});
 }
 await api('/api/combos',{method:'POST',body:{name:'fixture/upgrade',strategy:'priority',context_length:32768,models:targets,config:{disableSessionStickiness:false}}});
 const created=await api('/api/keys',{method:'POST',body:{name:'Fixture key',noLog:true,allowedConnections:targets.map(t=>t.connectionId)}}),key=created.key||created.apiKey?.key||created.apiKey;
 const keyResponse=await api('/api/keys'),keys=Array.isArray(keyResponse)?keyResponse:keyResponse.keys,meta=keys.find(k=>k.name==='Fixture key');
 await api('/api/keys/'+meta.id,{method:'PATCH',body:{modelAccessMode:'restricted',allowedModels:targets.map(t=>t.model),allowedCombos:['fixture/upgrade'],allowedConnections:targets.map(t=>t.connectionId),noLog:true}});
 const request=async messages=>{const response=await fetch('http://127.0.0.1:20161/v1/chat/completions',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({model:'fixture/upgrade',messages,stream:true,tools:[{type:'function',function:{name:'read_fixture',parameters:{type:'object',properties:{path:{type:'string'}}}}}],max_tokens:64}),signal:AbortSignal.timeout(20000)});if(!response.ok)throw Error('Fixture gateway HTTP '+response.status);return response.text();};
 const first=await request([{role:'user',content:'fixture start'}]);if(!first.includes(call.id))throw Error('Gateway lost streamed tool ID');
 const next=await request([{role:'user',content:'fixture start'},{role:'assistant',content:null,tool_calls:[call]},{role:'tool',tool_call_id:call.id,content:'fixture-continued-context'},{role:'user',content:'continue'}]);
 Object.assign(report,{primaryCalls,secondaryCalls,metadataCalls,historyPreserved,returnMarker:next.includes('context_preserved')});
 if(!historyPreserved||!next.includes('context_preserved')||primaryCalls!==1||secondaryCalls!==2)throw Error('Gateway continuation/cooldown fixture mismatch');
 Object.assign(report,{gateway:'3.8.52',next:'16.4.3',primaryCalls,secondaryCalls,toolIdPreserved:true,contextPreserved:true,cooldownHonored:true,passed:true});
}catch(e){report.passed=false;report.error=e.message;process.exitCode=1;}
finally{platform?.stop();fixture.closeAllConnections();await new Promise(r=>fixture.close(r));mkdirSync('validation/phase51',{recursive:true});writeFileSync('validation/phase51/gateway-compatibility.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
