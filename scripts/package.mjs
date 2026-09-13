import {mkdir,readdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {zip} from './binary.mjs';
const manifest=JSON.parse(await readFile('extension/manifest.json','utf8'));
const config=JSON.parse(await readFile('extension/release.json','utf8'));
const repository=process.env.GITHUB_REPOSITORY||config.repository;
if(!/^[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+$/.test(repository))throw new Error('Invalid GITHUB_REPOSITORY');
if(process.env.GITHUB_REF_TYPE==='tag'&&process.env.GITHUB_REF_NAME!==`v${manifest.version}`)throw new Error('Release tag must match manifest version');
const release={repository};
async function entries(dir,prefix){let result=[];for(const e of (await readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){const file=path.join(dir,e.name),name=prefix+e.name;if(e.isDirectory())result.push(...await entries(file,name+'/'));else result.push([name,await readFile(file)]);}return result;}
const extension=await entries('extension','AutoReload/');
extension.find(([name])=>name==='AutoReload/release.json')[1]=Buffer.from(JSON.stringify(release,null,2)+'\n');
extension.push(['INSTALL.md',await readFile('docs/INSTALL.md')],['LICENSE',await readFile('LICENSE')]);
await mkdir('artifacts',{recursive:true});
const outputs=[[`AutoReload-v${manifest.version}.zip`,zip(extension)]];
for(const [name,data] of outputs)await writeFile(path.join('artifacts',name),data);
await writeFile('artifacts/SHA256SUMS.txt',outputs.map(([name,data])=>`${createHash('sha256').update(data).digest('hex')}  ${name}`).join('\n')+'\n');
console.log(outputs.map(([name,data])=>`artifacts/${name} (${data.length} bytes)`).join('\n'));
