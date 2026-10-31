// Verification-only proxy. Production policy, signatures and routing are unchanged.
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig, secrets, guardToken, urls, root } from '../src/config.mjs';
import { loadCatalog, discover } from '../src/catalog.mjs';
import { loadEnvironment } from '../src/config.mjs';
import { management, qualifyModel } from '../src/omniroute.mjs';
import { contextMetadata } from '../src/telemetry.mjs';
import { tokenMatches, createGuard } from '../src/guard.mjs';

const [primary = 'gemini', fallback = 'groq'] = process.argv.slice(2);
if (![primary, fallback].every(p => ['gemini','groq','openrouter','ollama'].includes(p)) || primary === fallback) throw Error('Invalid provider pair');
const config = loadConfig(), secret = secrets();
if (process.argv[4]) config.providers.openrouter.models=[process.argv[4]];
const catalog = process.argv[4] ? await discover(config,loadEnvironment()) : loadCatalog();
for (const p of [primary, fallback]) if (!catalog.providers[p]?.allowed || !catalog.providers[p]?.models.length) throw Error(`${p}: no admitted available model; no inference attempted`);
const run = Date.now().toString(), name = `localagent/verify/${primary}-${fallback}-${run}`;
const evidenceName = `cross-provider/${primary}-${fallback}-${run}`, evidence = join(root, 'validation', evidenceName);
mkdirSync(evidence, { recursive: true });
const privateGuard=createGuard({config,secret,catalog:()=>catalog,auditPath:join(evidence,'guard.jsonl')});
await new Promise(r=>privateGuard.listen(0,'127.0.0.1',r));
const guardBase=`http://127.0.0.1:${privateGuard.address().port}`;
const trace = []; let succeeded = false, calls = 0, injected = 0;
const blocked=new Set();
const proxy = createServer(async (req, res) => {
  try {
    const p = req.url.split('/')[2];
    if (![primary, fallback].includes(p) || !tokenMatches(req.headers.authorization, `Bearer ${guardToken(secret,p)}`)) { res.writeHead(401); return res.end(); }
    const chunks = []; for await (const chunk of req) { chunks.push(chunk); if (chunks.reduce((n,b)=>n+b.length,0)>1048576) throw Error('oversize'); }
    const raw = Buffer.concat(chunks), body = raw.length ? JSON.parse(raw) : null;
    const event = { at: Date.now(), provider:p, model:body?.model, fields:body ? Object.keys(body) : [], ...(body ? contextMetadata(body.messages || []) : {}) };
    if (body && (++calls > 16 || blocked.has(p))) { event.status=422; event.reason='verification_request_bound_or_previous_failure'; trace.push(event); res.writeHead(422, {'Content-Type':'application/json'}); return res.end(JSON.stringify({error:{message:'Verification stopped after provider failure',type:'verification_stopped'}})); }
    if (body && p === primary && succeeded && body.messages?.some(m=>m.role==='tool')) {
      injected++; event.status=429; event.injected=true; trace.push(event);
      res.writeHead(429, {'Content-Type':'application/json','Retry-After':'120'}); return res.end(JSON.stringify({error:{message:'Controlled verification failure after tool result',type:'rate_limit_error'}}));
    }
    const response = await fetch(guardBase + req.url, {method:req.method, headers:{authorization:req.headers.authorization,'Content-Type':'application/json'}, ...(body ? {body:raw}:{}), signal:AbortSignal.timeout(90000), redirect:'error'});
    // A rejected auxiliary title request must not poison the coding route.
    if(body?.tools?.length && !response.ok) blocked.add(p);
    event.status=response.status; event.injected=false; trace.push(event);
    res.writeHead(response.status,Object.fromEntries([...response.headers].filter(([k])=>['content-type','retry-after'].includes(k) || k.startsWith('x-ratelimit-'))));
    for await (const chunk of response.body) res.write(chunk);
    res.end(); if (body?.tools?.length && p===primary && response.ok) succeeded=true;
  } catch { if (!res.headersSent) res.writeHead(502); res.end(); }
});
await new Promise(r=>proxy.listen(0,'127.0.0.1',r));
const base = `http://127.0.0.1:${proxy.address().port}`;
const api = await management(config), cleanup=[]; let outcome;
try {
  const targets=[];
  for (const p of [primary,fallback]) {
    const model=catalog.providers[p].models[0], baseUrl=`${base}/egress/${p}/v1`;
    const made=await api('/api/provider-nodes',{method:'POST',body:{name:`Verify ${run} ${p}`,prefix:`verify-${run}-${p}`,apiType:'chat',type:'openai-compatible',baseUrl}}), node=made.node||made;
    cleanup.unshift('/api/provider-nodes/'+node.id);
    const madeConnection=await api('/api/providers',{method:'POST',body:{provider:node.id,name:`Verify ${run} ${p}`,apiKey:guardToken(secret,p),providerSpecificData:{baseUrl},defaultModel:model}}), connection=madeConnection.connection||madeConnection;
    cleanup.unshift('/api/providers/'+connection.id);
    await api('/api/providers/'+connection.id+'/sync-models',{method:'POST',body:{}});
    targets.push({model:qualifyModel(node.id,model),providerId:node.id,connectionId:connection.id});
  }
  const madeCombo=await api('/api/combos',{method:'POST',body:{name,strategy:'priority',models:targets,context_length:131072,config:{disableSessionStickiness:true}}});
  const combo=madeCombo.combo||madeCombo; if(combo.id) cleanup.unshift('/api/combos/'+combo.id);
  const madeKey=await api('/api/keys',{method:'POST',body:{name:`Verify ${run}`,noLog:true,allowedConnections:targets.map(t=>t.connectionId)}});
  const key=madeKey.key||madeKey.apiKey?.key||madeKey.apiKey;
  const listed=await api('/api/keys'), metadata=(listed.keys||listed).find(k=>k.name===`Verify ${run}`);
  if(!metadata?.id || typeof key!=='string') throw Error('Verification key setup failed');
  cleanup.unshift('/api/keys/'+metadata.id);
  await api('/api/keys/'+metadata.id,{method:'PATCH',body:{modelAccessMode:'restricted',allowedModels:targets.map(t=>t.model),allowedCombos:[name],allowedConnections:targets.map(t=>t.connectionId),noLog:true}});
  const child=spawn(process.execPath,['scripts/verify-gemini-coding.mjs'],{cwd:root,windowsHide:true,env:{...process.env,LOCALAGENT_VERIFY_ROUTE:name,LOCALAGENT_VERIFY_KEY:key,LOCALAGENT_VERIFY_EVIDENCE:evidenceName},stdio:['ignore','pipe','pipe']});
  let output=''; child.stdout.on('data',b=>output+=b); child.stderr.on('data',()=>{});
  const exit=await new Promise(r=>child.once('exit',r));
  outcome={primary,fallback,route:name,exit,injected,requests:calls,agentReport:output.trim(),continuityPreserved:trace.some(e=>e.injected && e.toolResults.length && trace.some(f=>f.provider===fallback && f.status===200 && e.toolResults.every(t=>f.toolResults?.some(u=>u.call===t.call&&u.content===t.content)))),fallbackResponses:trace.filter(e=>e.provider===fallback&&e.status===200).length};
} finally {
  const cleanupErrors=[]; for(const path of cleanup) try {await api(path,{method:'DELETE'});} catch {cleanupErrors.push(path);}
  proxy.closeAllConnections(); await new Promise(r=>proxy.close(r));
  privateGuard.closeAllConnections(); await new Promise(r=>privateGuard.close(r));
  writeFileSync(join(evidence,'routing.json'),JSON.stringify(trace,null,2));
  const agent=outcome?.agentReport ? JSON.parse(outcome.agentReport) : null;
  writeFileSync(join(evidence,'failover.json'),JSON.stringify({...outcome,failoverDemonstrated:!!(agent?.completed && outcome?.continuityPreserved && injected),cleanupErrors},null,2));
}
console.log(JSON.stringify(outcome));
