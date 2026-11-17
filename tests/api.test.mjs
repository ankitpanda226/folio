import {test} from 'node:test';
import assert from 'node:assert/strict';
import worker,{seed} from '../app/server.js';
import {database} from '../scripts/db.mjs';
async function fixture(fn){const DB=database();await seed(DB);const call=async(user,path,method='GET',data)=>{const response=await worker.fetch(new Request('https://folio.test/api'+path,{method,headers:{'x-demo-user':user,'content-type':'application/json'},...(data?{body:JSON.stringify(data)}:{})}),{DB});return {status:response.status,data:await response.json()};};try{await fn(call,DB);}finally{DB.close();}}
const p=text=>[{type:'p',children:[text]}];
test('Owner grants access; teammate edits; owner revokes; all unauthorized routes reject',()=>fixture(async call=>{
 const created=await call('alice','/documents','POST',{title:'Team plan',content:p('Draft')});assert.equal(created.status,201);const id=created.data.document.id;
 assert.equal((await call('ben','/documents/'+id)).status,404);
 assert.equal((await call('ben','/documents/'+id,'PUT',{title:'No',content:p('No'),version:1})).status,404);
 assert.equal((await call('alice','/documents/'+id+'/shares','POST',{user_id:'ben'})).status,200);
 assert.ok((await call('ben','/documents')).data.documents.some(d=>d.id===id));
 const rich=[{type:'h2',children:['Plan']},{type:'p',children:[{type:'strong',children:['Together']}]}];
 assert.equal((await call('ben','/documents/'+id,'PUT',{title:'Shared plan',content:rich,version:1})).status,200);
 assert.deepEqual((await call('alice','/documents/'+id)).data.document.content,rich);
 assert.equal((await call('ben','/documents/'+id+'/shares','POST',{user_id:'casey'})).status,403);
 assert.equal((await call('ben','/documents/'+id+'/shares','DELETE',{user_id:'ben'})).status,403);
 assert.equal((await call('alice','/documents/'+id+'/shares','DELETE',{user_id:'ben'})).status,200);
 assert.equal((await call('ben','/documents/'+id)).status,404);
 assert.equal((await call('ben','/documents/'+id+'/shares')).status,404);
 assert.equal((await call('ben','/documents/'+id,'PUT',{title:'No',content:p('No'),version:2})).status,404);
 assert.ok(!(await call('ben','/documents')).data.documents.some(d=>d.id===id));
}));
test('Stale writes cannot overwrite newer content',()=>fixture(async call=>{
 const id='welcome-alice';const data={title:'First edit',content:p('Keep this'),version:1};
 assert.equal((await call('alice','/documents/'+id,'PUT',data)).status,200);
 assert.equal((await call('alice','/documents/'+id,'PUT',{...data,title:'Stale',content:p('Lost edit')})).status,409);
 assert.equal((await call('alice','/documents/'+id)).data.document.title,'First edit');
}));
test('Import validates file type and byte limit and keeps HTML as harmless text',()=>fixture(async call=>{
 assert.equal((await call('alice','/import','POST',{filename:'x.docx',text:'no'})).status,400);
 assert.equal((await call('alice','/import','POST',{filename:'x.txt',text:'x'.repeat(100001)})).status,400);
 assert.equal((await call('alice','/import','POST',{filename:'x.txt',text:'\0'})).status,400);
 const text='<script>alert(1)</script>\nA second line';const imported=await call('alice','/import','POST',{filename:'Research.txt',text});
 assert.equal(imported.status,201);assert.equal(imported.data.document.title,'Research');assert.deepEqual(imported.data.document.content,[...p('<script>alert(1)</script>'),...p('A second line')]);
}));
test('Malformed rich text is rejected and arbitrary attributes are stripped',()=>fixture(async call=>{
 for(const content of [[{type:'script',children:['alert(1)']}],null,{},[{type:'p',children:null}]])assert.equal((await call('alice','/documents/welcome-alice','PUT',{title:'Safe',content,version:1})).status,400);
 const r=await call('alice','/documents/welcome-alice','PUT',{title:'Safe',content:[{type:'p',onclick:'alert(1)',children:['<img onerror=alert(1)>']}],version:1});assert.equal(r.status,200);
 assert.deepEqual((await call('alice','/documents/welcome-alice')).data.document.content,p('<img onerror=alert(1)>'));
}));
test('Unknown identity, blank title, oversized request and cross-origin requests reject',()=>fixture(async(call,DB)=>{
 assert.equal((await call('stranger','/documents')).status,401);
 assert.equal((await call('alice','/documents','POST',{title:'   '})).status,400);
 const request=new Request('https://folio.test/api/documents',{method:'POST',headers:{'x-demo-user':'alice',origin:'https://other.test'},body:'{}'});
 assert.equal((await worker.fetch(request,{DB})).status,403);
 assert.equal((await call('alice','/documents','POST',{title:'Large',content:p('a'.repeat(460000))})).status,413);
}));
test('Bootstrap is idempotent and never restores revoked seed sharing',()=>fixture(async call=>{
 await call('ben','/documents/launch-ben/shares','DELETE',{user_id:'alice'});
 await call('alice','/bootstrap');
 assert.equal((await call('alice','/documents/launch-ben')).status,404);
}));
test('File-backed SQLite persists content and permissions across a database reopen',async()=>{
 const {mkdtempSync,rmSync}=await import('node:fs');const {tmpdir}=await import('node:os');const {join}=await import('node:path');const dir=mkdtempSync(join(tmpdir(),'folio-test-'));const path=join(dir,'data.sqlite');let db=database(path);
 try{await seed(db);await db.prepare('UPDATE documents SET title=? WHERE id=?').bind('Persisted title','welcome-alice').run();await db.prepare('INSERT INTO shares (document_id,user_id) VALUES (?,?)').bind('welcome-alice','ben').run();db.close();db=database(path);assert.equal((await db.prepare('SELECT title FROM documents WHERE id=?').bind('welcome-alice').first()).title,'Persisted title');assert.ok(await db.prepare('SELECT user_id FROM shares WHERE document_id=? AND user_id=?').bind('welcome-alice','ben').first());}finally{db.close();rmSync(dir,{recursive:true});}
});
