import {test} from 'node:test';import assert from 'node:assert/strict';import worker,{seed} from '../app/server.js';import {database} from '../scripts/db.mjs';
async function fixture(fn){const DB=database();await seed(DB);const call=async(user,path,method='GET',body)=>{const r=await worker.fetch(new Request('https://folio.test/api'+path,{method,headers:{'x-demo-user':user,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),{DB});return {status:r.status,data:await r.json()};};try{await fn(call,DB);}finally{DB.close();}}
test('Only owners trash and restore; trashed documents disappear from every active endpoint',()=>fixture(async call=>{
 const id=(await call('alice','/documents','POST',{title:'Keep for later'})).data.document.id;
 await call('alice',`/documents/${id}/shares`,'POST',{user_id:'ben',role:'editor'});
 assert.equal((await call('ben',`/documents/${id}`,'DELETE')).status,403);
 assert.equal((await call('alice',`/documents/${id}`,'DELETE')).status,200);
 for(const user of ['alice','ben']){
  assert.ok(!(await call(user,'/documents')).data.documents.some(d=>d.id===id));
  for(const suffix of ['','/comments','/shares','/versions','/presence'])assert.equal((await call(user,`/documents/${id}${suffix}`)).status,404);
  assert.equal((await call(user,`/documents/${id}`,'PUT',{title:'Blocked',content:[],version:1})).status,404);
 }
 assert.equal((await call('ben','/trash')).data.documents.length,0);
 assert.equal((await call('alice','/trash')).data.documents[0].id,id);
 assert.equal((await call('ben',`/trash/${id}/restore`,'POST')).status,404);
 assert.equal((await call('alice',`/trash/${id}/restore`,'POST')).status,200);
 assert.equal((await call('alice',`/trash/${id}/restore`,'POST')).status,404);
 assert.equal((await call('ben',`/documents/${id}`)).status,200);
}));
test('Restore preserves content, snapshots, comments and sharing; Trash clears presence',()=>fixture(async(call,DB)=>{
 const content=[{type:'p',children:['An idea worth keeping']}];const id=(await call('alice','/documents','POST',{title:'Saved',content})).data.document.id;
 await call('alice',`/documents/${id}/comments`,'POST',{body:'Retain this discussion'});
 await call('alice',`/documents/${id}/shares`,'POST',{user_id:'ben',role:'viewer'});
 await call('alice',`/documents/${id}/presence`,'POST',{session_id:'test-session',editing:true});
 await call('alice',`/documents/${id}`,'DELETE');assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM presence WHERE document_id=?').bind(id).first()).n,0);
 await call('alice',`/trash/${id}/restore`,'POST');const read=(await call('alice',`/documents/${id}`)).data.document;
 assert.deepEqual(read.content,content);assert.equal(read.version,1);assert.equal((await call('alice',`/documents/${id}/versions`)).data.versions.length,1);assert.equal((await call('alice',`/documents/${id}/comments`)).data.comments[0].body,'Retain this discussion');assert.equal((await call('ben',`/documents/${id}`)).data.document.role,'viewer');
}));
