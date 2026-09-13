import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const root=path.resolve('tutorial');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png'};
export async function serveRequest(req,res){try{const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);let file=path.resolve(root,'.'+pathname);if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}if((await stat(file)).isDirectory())file=path.join(file,'index.html');const body=await readFile(file);res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(body);}catch{res.writeHead(404).end('Not found');}}
export const createLabServer=()=>http.createServer(serveRequest);
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){const server=createLabServer();server.listen(Number(process.env.PORT||4173),'127.0.0.1',()=>console.log(`AutoReload Lab: http://127.0.0.1:${server.address().port}`));}
