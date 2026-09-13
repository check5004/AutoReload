import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {generateKeyPairSync} from 'node:crypto';
import {png} from './binary.mjs';
await mkdir('extension/icons',{recursive:true});
for(const size of [16,32,48,128]){
  const image=png(size,size,(x,y)=>{const X=(x+.5)/size,Y=(y+.5)/size;const dx=X-.5,dy=Y-.5,r=Math.hypot(dx,dy),angle=Math.atan2(dy,dx);const corner=(X<.2&&Y<.2&&Math.hypot(X-.2,Y-.2)>.2)||(X>.8&&Y<.2&&Math.hypot(X-.8,Y-.2)>.2)||(X<.2&&Y>.8&&Math.hypot(X-.2,Y-.8)>.2)||(X>.8&&Y>.8&&Math.hypot(X-.8,Y-.8)>.2);if(corner)return [0,0,0,0];const arc=r>.23&&r<.32&&(angle<-.65||angle>.15);const arrow=X>.59&&X<.83&&Y>.15&&Y<.4&&X+Y> .91;return arc||arrow?[255,255,255,255]:[34,88,232,255];});await writeFile(`extension/icons/${size}.png`,image);
}
const file='extension/manifest.json',manifest=JSON.parse(await readFile(file,'utf8'));
if(!manifest.key){const {publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});manifest.key=publicKey.export({type:'spki',format:'der'}).toString('base64');await writeFile(file,JSON.stringify(manifest,null,2)+'\n');}
console.log('Icons and stable public extension key are ready.');
