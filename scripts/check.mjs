import {readFile,readdir,access} from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const manifest=JSON.parse(await readFile('extension/manifest.json','utf8'));
const pkg=JSON.parse(await readFile('package.json','utf8'));
if(pkg.version!==manifest.version||!/^\d+\.\d+\.\d+$/.test(manifest.version))throw new Error('package.json / manifest.json versions must match');
if(manifest.manifest_version!==3||!manifest.key)throw new Error('Manifest V3 and stable public key are required');
for(const file of [manifest.background.service_worker,manifest.action.default_popup,manifest.options_page,...Object.values(manifest.icons)])await access(path.join('extension',file));
async function walk(dir){const files=[];for(const entry of await readdir(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);files.push(...entry.isDirectory()?await walk(file):[file]);}return files;}
let count=0;
for(const file of [...await walk('extension'),...await walk('tutorial'),...await walk('scripts'),...await walk('tests')]){
  if(/\.(m?js)$/.test(file)){execFileSync(process.execPath,['--check',file],{stdio:'pipe'});count++;}
  if(file.endsWith('.html')){const html=await readFile(file,'utf8');for(const match of html.matchAll(/(?:src|href)="([^"#]+)"/g)){const value=match[1];if(/^(?:[a-z]+:|#|\/)/i.test(value))continue;const resolved=path.resolve(path.dirname(file),value.split(/[?#]/)[0]);await access(resolved).catch(()=>{throw new Error(`${file}: missing asset ${value}`);});}if(/<script\b[^>]*>\s*[^<\s]/i.test(html))throw new Error(`${file}: inline script is not allowed`);}
}
console.log(`Checked ${count} JavaScript files, manifest, versions and local HTML links.`);
