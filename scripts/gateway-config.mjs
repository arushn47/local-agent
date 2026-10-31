import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
// Next's documented memory setting, applied only to its generated standalone
// configuration. No provider/authentication code or upstream source is patched.
export function tuneGateway(directory){
 const pkg=JSON.parse(readFileSync(join(directory,'package.json')));if(pkg.version!=='3.8.52')throw Error('Review gateway tuning after upstream upgrade');
 const file=join(directory,'dist/server.js'),source=readFileSync(file,'utf8');
 const match=source.match(/^const nextConfig = (\{[^\r\n]+\})$/m);if(!match)throw Error('Unknown standalone configuration template');
 const config=JSON.parse(match[1]);if(!config.experimental||typeof config.experimental.preloadEntriesOnStart!=='boolean'||config.output!=='standalone')throw Error('Unknown Next preload configuration');
 const before=createHash('sha256').update(source).digest('hex'),previous=config.experimental.preloadEntriesOnStart;
 config.experimental.preloadEntriesOnStart=false;
 const output=source.replace(match[0],'const nextConfig = '+JSON.stringify(config));if(previous)writeFileSync(file,output);
 return {gateway:pkg.version,option:'experimental.preloadEntriesOnStart',previous,value:false,sourcePatches:[],generatedArtifactBefore:before,generatedArtifactAfter:createHash('sha256').update(output).digest('hex'),reference:'https://nextjs.org/docs/app/guides/memory-usage'};
}
