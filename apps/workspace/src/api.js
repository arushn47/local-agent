export async function api(path,body,method=body===undefined?'GET':'POST'){
  const r=await fetch('/api/v1/'+path,{method,headers:{'Content-Type':'application/json','X-LocalAgent-Request':'1'},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const data=await r.json();if(!r.ok)throw Error(data.error||'runtime_unavailable');return data;
}
export const errors={
  invalid_project_path:'Enter the full path to a local project folder.',project_directory_unavailable:'That folder could not be opened. Check the path and permissions.',
  private_runtime_directory:'The private LocalAgent runtime folder cannot be opened as a project.',free_tier_confirmation_required:'Confirm the account is free-tier only before saving.',
  key_required:'Enter an API key.',keychain_unavailable:'Secure credential storage is unavailable. Your key was not saved.',
  runtime_unavailable:'The local runtime is unavailable. Your draft is preserved. Check the runtime terminal.',
  no_eligible_models:'No eligible coding model is available. Configure a free provider first.',task_already_running:'A task is already running. Stop it or wait for completion.',
  configuration_in_progress:'Provider discovery is already running. Please wait.',prompt_failed:'The coding request could not start. Inspect provider availability and routing.',
  project_file_denied:'This file is private, linked, or outside the project boundary.',project_file_binary:'This file is not UTF-8 text. Open it in a suitable local application.',project_file_too_large:'This file exceeds the 1 MB inspection limit.',project_file_not_found:'This file is no longer available. Refresh the project files.',
};
const previewErrors={preview_entry_missing:'Create index.html before starting the preview.',preview_path_denied:'This file is outside the preview allowlist or uses a link. It was not served.',preview_file_too_large:'A preview asset exceeds the 5 MB limit.',preview_project_too_large:'This preview exceeds the static project file or size limit.',preview_not_running:'Start this project’s preview first.',preview_busy:'A preview check is running. Wait for it to finish.',preview_template_requires_empty_folder:'The starter needs an empty folder. Existing files were not changed.',preview_browser_unavailable:'Browser inspection needs the LocalAgent desktop app, or a configured Playwright Chromium executable.',preview_inspection_failed:'The browser check could not finish. Review the preview, then try another check.',preview_build_limit:'Static validation exceeded its bounded file or time limit.',preview_invalid_viewport:'Choose desktop, tablet, or mobile.'};
export const errorText=e=>errors[e?.message]||previewErrors[e?.message]||'This action could not be completed. Check the local runtime and try again.';
