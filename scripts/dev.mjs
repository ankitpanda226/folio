import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { database } from './db.mjs';
import worker from '../app/server.js';
const DB=database(process.env.FOLIO_DB || '.local/folio.sqlite');
const port=Number(process.env.PORT || 4173);
const server=createServer(async(req,res)=>{
 try {
  const body=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>500000){res.writeHead(413);res.end('Too large');return;}body.push(chunk);}
  const url='http://'+req.headers.host+req.url;
  let response;
  if(new URL(url).pathname==='/'){
   const [html,css,js,markdown]=await Promise.all(['app/index.html','app/style.css','app/client.js','app/markdown.js'].map(p=>readFile(p,'utf8')));
   response=new Response(html.replace('/*STYLES*/',css).replace('/*CLIENT*/',markdown.replace('export function','function')+'\n'+js),{headers:{'content-type':'text/html; charset=utf-8'}});
  }else response=await worker.fetch(new Request(url,{method:req.method,headers:req.headers,...(body.length?{body:Buffer.concat(body)}:{})}),{DB});
  res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
 }catch(e){console.error(e);res.writeHead(500);res.end('Local server error');}
});
server.listen(port,'127.0.0.1',()=>console.log('Folio local preview: http://127.0.0.1:'+port));
