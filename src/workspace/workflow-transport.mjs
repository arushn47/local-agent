import {createServer} from 'node:http';
import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';
import {once} from 'node:events';
import {guardToken,urls} from '../config.mjs';
import {registerWorkflowAttempt} from '../omniroute.mjs';
const match=(a,b)=>{const x=Buffer.from(a||''),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);};

// Narrow authenticated OpenCode ingress. It never contacts providers: every
// request goes through a single-target OmniRoute attempt connection and guard.
export async function createWorkflowTransport({config,secret,registerAttempt=scope=>registerWorkflowAttempt(config,scope),fetcher=fetch}){
  const bindings=new Map(),token=randomBytes(32).toString('hex');
  const admin=async(path,body)=>{
    const response=await fetcher(urls(config).guard+path,{method:'POST',redirect:'error',headers:{Authorization:`Bearer ${guardToken(secret,'admin')}`,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});
    if(!response.ok)throw Error('workflow_guard_scope_unavailable');return response.json();
  };
  const server=createServer(async(req,res)=>{
    try {
    const fail=(status,code)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify({error:{code}}));};
    if(req.headers.host!==`127.0.0.1:${server.address().port}`||!match(req.headers.authorization,`Bearer ${token}`))return fail(401,'unauthorized');
    if(req.method!=='POST'||req.url!=='/v1/chat/completions')return fail(404,'unknown_endpoint');
    const sessionID=req.headers['x-session-id']||req.headers['x-session-affinity'],binding=bindings.get(sessionID);
    if(!binding)return fail(403,'workflow_session_unbound');
    let bytes=0;const chunks=[];for await(const c of req){bytes+=c.length;if(bytes>1024*1024)return fail(413,'body_too_large');chunks.push(c);}
    let input;try{input=JSON.parse(Buffer.concat(chunks).toString());}catch{return fail(400,'invalid_json');}
    if(input.model!==binding.modelAlias)return fail(403,'workflow_exact_model_mismatch');
    input.model=binding.route.alias;
    const controller=new AbortController();res.once('close',()=>{if(!res.writableEnded)controller.abort();});
    try{
      const response=await fetcher(urls(config).gateway+'/v1/chat/completions',{method:'POST',redirect:'error',headers:{Authorization:`Bearer ${binding.route.key}`,'Content-Type':'application/json','x-session-affinity':sessionID},body:JSON.stringify(input),signal:AbortSignal.any([controller.signal,AbortSignal.timeout(120000)])});
      const headers={'Content-Type':response.headers.get('content-type')||'application/json'};
      for(const key of ['retry-after'])if(response.headers.has(key))headers[key]=response.headers.get(key);
      res.writeHead(response.status,headers);
      for await(const chunk of response.body||[]){if(res.destroyed)break;if(!res.write(chunk))await once(res,'drain');}
      if(!res.destroyed)res.end();
    }catch{if(!res.headersSent)fail(502,'workflow_gateway_unavailable');else res.destroy();}
    }catch{if(!res.headersSent){res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({error:{code:'workflow_transport_unavailable'}}));}else res.destroy();}
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');
  return {url:`http://127.0.0.1:${server.address().port}/v1`,token,
    async bind({sessionID,workspaceDir,workflowId,stepId,attemptId,qualifiedModel,modelAlias,limits}){
      if(bindings.has(sessionID))throw Error('workflow_session_already_bound');
      const slash=qualifiedModel.indexOf('/'),provider=qualifiedModel.slice(0,slash),model=qualifiedModel.slice(slash+1);
      const namespace=createHash('sha256').update(workspaceDir.toLowerCase()).digest('hex').slice(0,16);
      const scope=await admin('/api/v1/workflow-scopes',{workflowId:`${namespace}_${workflowId}`,taskId:stepId,attemptId,provider,model,policy:'free_only',maxSpendUsd:0,maxRequests:limits?.maxRequests??60,maxTokens:limits?.maxTokens??24000});
      try{const route=await registerAttempt({...scope,provider,model});bindings.set(sessionID,{scope,route,modelAlias});}
      catch(error){await admin(`/api/v1/workflow-scopes/${scope.id}/close`,{});throw error;}
    },
    async release(sessionID){const binding=bindings.get(sessionID);if(!binding)return;bindings.delete(sessionID);await admin(`/api/v1/workflow-scopes/${binding.scope.id}/close`,{});await binding.route.disable?.();},
    async close(){for(const id of [...bindings.keys()]){const b=bindings.get(id);bindings.delete(id);await admin(`/api/v1/workflow-scopes/${b.scope.id}/close`,{}).catch(()=>{});}server.closeAllConnections();await new Promise(r=>server.close(r));}
  };
}
