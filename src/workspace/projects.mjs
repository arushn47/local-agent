import { existsSync, readFileSync, writeFileSync, realpathSync, statSync } from 'node:fs';
import { join, basename, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { stateDir } from '../config.mjs';
export function projectStore() {
  const file=join(stateDir,'projects.json');
  let projects=existsSync(file)?JSON.parse(readFileSync(file)):[];
  const save=()=>writeFileSync(file,JSON.stringify(projects,null,2),{mode:0o600});
  return {
    list:()=>projects.map(p=>({...p})),
    get(id){const p=projects.find(p=>p.id===id);if(!p)throw Error('project_not_found');return {...p};},
    add(directory){
      if(typeof directory!=='string'||!directory.trim()||directory.length>4096)throw Error('invalid_project_path');
      let canonical;try{canonical=realpathSync(directory);if(!statSync(canonical).isDirectory())throw Error();}catch{throw Error('project_directory_unavailable');}
      if(canonical===resolve(stateDir)||canonical.startsWith(resolve(stateDir)+sep))throw Error('private_runtime_directory');
      const prior=projects.find(p=>p.path===canonical);if(prior)return {...prior};
      const project={id:randomUUID(),path:canonical,name:basename(canonical),openedAt:new Date().toISOString()};projects=[project,...projects];save();return {...project};
    },
    remove(id){projects=projects.filter(p=>p.id!==id);save();},
  };
}
