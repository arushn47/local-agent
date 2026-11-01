import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, join, sep, extname } from 'node:path';
import { randomBytes } from 'node:crypto';
import { root, stateDir, loadEnvironment } from '../config.mjs';
import { loadCatalog, discover, saveCatalog } from '../catalog.mjs';
import { configureGateway } from '../omniroute.mjs';
import { compilePlan } from '../routing.mjs';
import { readEvents } from '../telemetry.mjs';
import { providerEligibility } from '../policy.mjs';
import { listProjectFiles, readProjectFile } from './project-files.mjs';
import { listWorkflows, createWorkflowInstance, loadWorkflow, pauseWorkflow, resumeWorkflow, cancelWorkflow, retryStep, rollbackToCheckpoint, runWorkflow, recoverWorkflow } from './workflow-engine.mjs';
import { createPlan, validatePlan } from './planner.mjs';
import { listTemplates } from './workflow-templates.mjs';
import { getAllModels, validateModelAssignment } from './models.mjs';
import { listCheckpoints, previewCheckpointRestore } from './checkpoints.mjs';
const workflowReady=engine=>engine?.workflowReady===true&&engine?.permissionEnforcementVerified===true;
const keys={gemini:'GEMINI_API_KEY',groq:'GROQ_API_KEY',openrouter:'OPENROUTER_API_KEY'};
function send(res,status,value){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));}
async function json(req){let text='';for await(const b of req){text+=b;if(Buffer.byteLength(text)>65536)throw Error('request_too_large');}try{return JSON.parse(text||'{}');}catch{throw Error('invalid_json');}}
export function createWorkspaceServer({config,projects,tasks,credentials,previews,engine=null,port=20140,refreshProviders=async()=>{const catalog=await discover(config,loadEnvironment());saveCatalog(catalog);return configureGateway(config,catalog);}}){
  const desktop=process.env.LOCALAGENT_DESKTOP==='1';
  const inheritedCookie=desktop&&process.env.LOCALAGENT_WORKSPACE_COOKIE;
  if(desktop&&!(typeof inheritedCookie==='string'&&/^[a-f0-9]{64}$/.test(inheritedCookie)))throw Error('desktop_authentication_unavailable');
  const cookie=typeof inheritedCookie==='string'&&/^[a-f0-9]{64}$/.test(inheritedCookie)?inheritedCookie:randomBytes(32).toString('hex');
  const dist=join(root,'apps/workspace/dist');let configuring=false;
  const server=createServer(async(req,res)=>{
    const boundPort=server.address()?.port||port,origin=`http://127.0.0.1:${boundPort}`;
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; frame-src "+(previews?previews.origin:"'none'"));
    if(req.headers.host!==`127.0.0.1:${boundPort}`){res.writeHead(403);return res.end();}
    const url=new URL(req.url,origin),path=url.pathname;
    if(req.headers.origin&&req.headers.origin!==origin||req.headers['sec-fetch-site']==='cross-site'){res.writeHead(403);return res.end();}
    if(!path.startsWith('/api/')){
      if(req.method!=='GET'){res.writeHead(405);return res.end();}
      let decoded;try{decoded=decodeURIComponent(path);}catch{return send(res,400,{error:'invalid_path'});}
      const file=resolve(dist,'.'+decoded);
      const target=file.startsWith(resolve(dist)+sep)&&existsSync(file)&&extname(file)?file:join(dist,'index.html');
      if(!existsSync(target))return send(res,503,{error:'workspace_not_built'});
      // Production desktop authentication is seeded by the native main process
      // into its private Chromium session. A random loopback port is not auth:
      // never issue that credential to an arbitrary local HTTP client.
      if(target.endsWith('index.html')&&!desktop)res.setHeader('Set-Cookie',`localagent=${cookie}; HttpOnly; SameSite=Strict; Path=/`);
      res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[extname(target)]||'application/octet-stream');return res.end(readFileSync(target));
    }
    if(!(req.headers.cookie||'').split(';').some(c=>c.trim()===`localagent=${cookie}`))return send(res,401,{error:'workspace_authentication_required'});
    if(req.method!=='GET'&&(req.headers.origin!==origin||req.headers['x-localagent-request']!=='1'))return send(res,403,{error:'invalid_origin'});
    try{
      if(path==='/api/v1/status'&&req.method==='GET'){
        const catalog=loadCatalog(),env=loadEnvironment(),plan=compilePlan(config,catalog);
        const providers=Object.entries(config.providers).map(([id,p])=>{const c=catalog.providers[id];return {id,configured:id==='ollama'||!!env[keys[id]],eligible:!!c?.allowed&&!!c?.models?.length,reason:c?.reason||providerEligibility(id,env).reason||'not_checked',models:c?.models||[],codingEligible:plan.targets.some(t=>t.provider===id),local:id==='ollama'};});
        const events=readEvents(join(stateDir,'routing.jsonl')).slice(-40).map(e=>({timestamp:e.timestamp,event:e.event,provider:e.provider,model:e.model,status:e.status,quota:e.quota,budget:e.budget?{fits:e.budget.fits,contextWindow:e.budget.contextWindow}:undefined}));
        return send(res,200,{providers,plan,events,policy:'free-only',workflowExecutionReady:workflowReady(engine),keyStorage:process.platform==='win32'?'Windows DPAPI · current user':'Local keychain unavailable',running:true});
      }
      if(path==='/api/v1/projects'&&req.method==='GET')return send(res,200,projects.list());
      if(path==='/api/v1/projects'&&req.method==='POST')return send(res,201,projects.add((await json(req)).path));
      const preview=path.match(/^\/api\/v1\/projects\/([a-f0-9-]+)\/preview(?:\/(start|stop|template|build|inspect|screenshot|export))?$/);
      if(preview&&previews){
        const id=preview[1],operation=preview[2];projects.get(id);
        if(!operation&&req.method==='GET')return send(res,200,previews.status(id));
        if(operation==='screenshot'&&req.method==='GET'){const data=previews.screenshot(id);res.writeHead(200,{'Content-Type':'image/png','Cache-Control':'no-store'});return res.end(data);}
        if(operation==='export'&&req.method==='GET')return previews.export(id,res);
        if(req.method==='POST'){
          const body=await json(req);
          if(operation==='start')return send(res,200,await previews.start(id));
          if(operation==='stop')return send(res,200,previews.stop(id));
          if(operation==='template'){if(tasks.active(id))throw Error('task_already_running');return send(res,201,previews.template(id));}
          if(operation==='build')return send(res,200,await previews.build(id));
          if(operation==='inspect')return send(res,200,await previews.inspect(id,body.device));
        }
      }
      const filesRoute=path.match(/^\/api\/v1\/projects\/([A-Za-z0-9_-]+)\/files(?:\/(content))?$/);
      if(filesRoute&&req.method==='GET'){const id=filesRoute[1],op=filesRoute[2];const prj=projects.get(id);if(!op)return send(res,200,listProjectFiles(prj.path));if(op==='content'){return send(res,200,readProjectFile(prj.path,url.searchParams.get('path')));}}
      const p=path.match(/^\/api\/v1\/projects\/([A-Za-z0-9_-]+)(?:\/(sessions))?$/);
      if(p){projects.get(p[1]);if(p[2]==='sessions'&&req.method==='GET')return send(res,200,tasks.list(p[1]));if(p[2]==='sessions'&&req.method==='POST')return send(res,201,await tasks.create(p[1]));if(!p[2]&&req.method==='DELETE'){if(tasks.active(p[1]))throw Error('task_already_running');previews?.stop(p[1]);projects.remove(p[1]);return send(res,200,{removed:true});}}
      if(path==='/api/v1/providers/refresh'&&req.method==='POST'){
        if(configuring)throw Error('configuration_in_progress');configuring=true;
        try{await refreshProviders();return send(res,200,{refreshed:true});}finally{configuring=false;}
      }
      const provider=path.match(/^\/api\/v1\/providers\/(gemini|groq|openrouter)$/);
      if(provider&&req.method==='POST'){
        if(configuring)throw Error('configuration_in_progress');configuring=true;
        try{await credentials.update(provider[1],await json(req));const configured=await refreshProviders().then(()=>true).catch(()=>false);return send(res,200,{saved:true,routingReady:configured});}finally{configuring=false;}
      }
      const session=path.match(/^\/api\/v1\/sessions\/([A-Za-z0-9_-]+)(?:\/(prompt|cancel|permission|history))?$/);
      if(session){const id=session[1];if(session[2]==='history'&&req.method==='GET')return send(res,200,await tasks.history(id,url.searchParams.get('before')));if(!session[2]&&req.method==='GET')return send(res,200,await tasks.snapshot(id));if(req.method==='POST'){
        const body=await json(req);
        if(session[2]==='prompt'){const catalog=loadCatalog();if(!compilePlan(config,catalog).targets.length)throw Error('no_eligible_models');await tasks.prompt(id,body.text);return send(res,202,{accepted:true});}
        if(session[2]==='cancel'){await tasks.cancel(id);return send(res,200,{cancelled:true});}
        if(session[2]==='permission'){await tasks.permission(id,body.requestID,body.reply);return send(res,200,{replied:true});}
      }}
      if(path==='/api/v1/templates'&&req.method==='GET')return send(res,200,listTemplates());
      if(path==='/api/v1/models'&&req.method==='GET')return send(res,200,getAllModels(loadCatalog()));
      const wfList=path.match(/^\/api\/v1\/projects\/([A-Za-z0-9_-]+)\/workflows$/);
      if(wfList){
        const prj=projects.get(wfList[1]);
        if(req.method==='GET')return send(res,200,listWorkflows(prj.path));
        if(req.method==='POST'){
          const body=await json(req);const catalog=loadCatalog();
          if(!body || typeof body!=='object' || Array.isArray(body))throw Error('invalid_workflow_request');
          if(body.prompt!==undefined && (typeof body.prompt!=='string'||body.prompt.length>16000))throw Error('invalid_workflow_prompt');
          if(body.targetFiles!==undefined && (!Array.isArray(body.targetFiles)||body.targetFiles.length>100))throw Error('invalid_workflow_files');
          const plan=body.plan||createPlan({prompt:body.prompt||'',templateId:body.templateId,mode:body.mode,policy:body.policy||'free_only',targetFiles:body.targetFiles||[],catalog,workspaceDir:prj.path});
          const validation=validatePlan(plan,catalog);
          if(!validation.valid)throw Error('invalid_workflow_plan');
          if(plan.policy!=='free_only')throw Error('invalid_workflow_paid_authorization_unavailable');
          // Production activation is fail-closed until supervised session and
          // guard attribution integration has independently passed its gates.
          if(body.autoStart!==false && !workflowReady(engine)) return send(res,409,{error:'workflow_execution_not_ready'});
          const instance=createWorkflowInstance({plan,workspaceDir:prj.path});
          if(body.autoStart!==false){void runWorkflow({workflowId:instance.id,workspaceDir:prj.path,projectId:prj.id,engine,tasks,catalog}).catch(()=>{});}
          return send(res,201,instance);
        }
      }
      const wfAction=path.match(/^\/api\/v1\/projects\/([A-Za-z0-9_-]+)\/workflows\/([A-Za-z0-9_.-]+)(?:\/(pause|resume|cancel|retry|rollback|rollback-preview|session|recover|start))?$/);
      if(wfAction){
        const prj=projects.get(wfAction[1]);const wfid=wfAction[2];const op=wfAction[3];
        if(op==='session'&&req.method==='GET'){
          const wf=loadWorkflow(wfid,prj.path),step=wf?.stepStates?.[url.searchParams.get('stepId')];
          if(!step?.sessionID)throw Error('invalid_workflow_session');
          const owner=tasks.workflowSession(step.sessionID);
          if(owner?.workflowId!==wfid||owner?.stepId!==step.id)throw Error('invalid_workflow_session');
          return send(res,200,await tasks.snapshot(step.sessionID));
        }
        if(!op&&req.method==='GET'){const wf=loadWorkflow(wfid,prj.path);if(!wf)return send(res,404,{error:'workflow_not_found'});return send(res,200,wf);}
        if(req.method==='POST'){
          const body=await json(req);
          if(!body || typeof body!=='object' || Array.isArray(body))throw Error('invalid_workflow_request');
          if(['start','resume','retry'].includes(op) && !workflowReady(engine))return send(res,409,{error:'workflow_execution_not_ready'});
          if(op==='start'){const wf=loadWorkflow(wfid,prj.path);if(wf?.status!=='pending')throw Error('invalid_workflow_start_state');void runWorkflow({workflowId:wfid,workspaceDir:prj.path,projectId:prj.id,engine,tasks,catalog:loadCatalog()}).catch(()=>{});return send(res,202,{accepted:true});}
          if(op==='recover')return send(res,200,await recoverWorkflow({workflowId:wfid,workspaceDir:prj.path,tasks}));
          if(op==='pause')return send(res,200,pauseWorkflow(wfid,prj.path));
          if(op==='resume'){const r=resumeWorkflow(wfid,prj.path);void runWorkflow({workflowId:wfid,workspaceDir:prj.path,projectId:prj.id,engine,tasks,catalog:loadCatalog()}).catch(()=>{});return send(res,200,r);}
          if(op==='cancel')return send(res,200,cancelWorkflow(wfid,prj.path,body.reason));
          if(op==='retry'){const wf=loadWorkflow(wfid,prj.path);const step=wf?.stepStates?.[body.stepId];if(!step)throw Error('invalid_workflow_step');if(body.alternateModelId&&!validateModelAssignment({catalog:loadCatalog(),modelId:body.alternateModelId,role:step.agent,policy:wf.policy}).valid)throw Error('invalid_workflow_model');const r=retryStep(wfid,body.stepId,{alternateModelId:body.alternateModelId,workspaceDir:prj.path});void runWorkflow({workflowId:wfid,workspaceDir:prj.path,projectId:prj.id,engine,tasks,catalog:loadCatalog()}).catch(()=>{});return send(res,200,r);}
          if(op==='rollback-preview'){const wf=loadWorkflow(wfid,prj.path);if(!wf)throw Error('invalid_workflow_identifier');if(wf.status==='running'||tasks.active(prj.id))throw Error('invalid_checkpoint_active_workflow');return send(res,200,previewCheckpointRestore({workspaceDir:prj.path,checkpointId:body.checkpointId,workflowId:wfid}));}
          if(op==='rollback'){if(tasks.active(prj.id))throw Error('invalid_checkpoint_active_workflow');return send(res,200,rollbackToCheckpoint(wfid,body.checkpointId,prj.path,body.approval));}
        }
      }
      const chkList=path.match(/^\/api\/v1\/projects\/([A-Za-z0-9_-]+)\/checkpoints$/);
      if(chkList&&req.method==='GET'){
        const prj=projects.get(chkList[1]);
        return send(res,200,listCheckpoints({workspaceDir:prj.path,workflowId:url.searchParams.get('workflowId')}));
      }
      return send(res,404,{error:'endpoint_not_found'});
    }catch(error){
      const known=/^(invalid_|unknown_|key_|free_tier_|project_|private_|session_|task_|permission_|configuration_|no_eligible_|prompt_|snapshot_|preview_|checkpoint_|workflow_)/.test(error.message);
      const status=error.message==='checkpoint_restore_approval_required'?428:error.message==='checkpoint_restore_conflict'||error.message==='invalid_checkpoint_active_workflow'?409:known?400:503;
      if(!known)console.error(JSON.stringify({scope:'workspace_api',type:error.name,frames:error.stack?.split('\n').slice(1,4)}));
      return send(res,status,{error:known?error.message:'runtime_unavailable'});
    }
  });
  return server;
}
