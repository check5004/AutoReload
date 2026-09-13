// HTTP-only regression fixture for the production content-script path.
// The user-facing rehearsal is packaged at extension/tutorial/index.html.
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve('extension/tutorial');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png'};
export async function serveRequest(req,res){
  try{
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    let file=path.resolve(root,'.'+pathname);
    if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
    if((await stat(file)).isDirectory())file=path.join(file,'index.html');
    let body=await readFile(file);
    if(file.endsWith('.html'))body=body.toString('utf8').replace(/<script src="\.\.\/(?:core|dom|content)\.js" defer><\/script>/g,'');
    res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(body);
  }catch{res.writeHead(404).end('Not found');}
}
