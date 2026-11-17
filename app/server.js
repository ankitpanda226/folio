// PAGE is embedded by scripts/build.mjs; API source remains independently testable.
export const USERS = [
  {id:'alice',name:'Alice Chen',email:'alice@folio.demo'},
  {id:'ben',name:'Ben Carter',email:'ben@folio.demo'},
  {id:'casey',name:'Casey Morgan',email:'casey@folio.demo'}
];
const TYPES=new Set(['p','div','h1','h2','h3','strong','b','em','i','u','ul','ol','li','br','blockquote','h4','pre','code','aside','hr','s','mark','sub','sup']);
class HttpError extends Error { constructor(status,message){super(message);this.status=status;} }
const fail=(status,message)=>{throw new HttpError(status,message);};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
export function validateContent(value) {
  let count=0,chars=0;
  function visit(node,depth){
    if(++count>15000 || depth>24) fail(400,'Document structure is too complex.');
    if(typeof node==='string'){chars+=node.length;if(chars>100000)fail(400,'Document text must be under 100,000 characters.');return node;}
    if(!node || typeof node!=='object' || !TYPES.has(node.type) || !Array.isArray(node.children))fail(400,'Invalid document structure.');
    return {type:node.type,children:node.children.map(n=>visit(n,depth+1))};
  }
  if(!Array.isArray(value))fail(400,'Document content must be an array.');
  return value.map(n=>visit(n,0));
}
function title(value){if(typeof value!=='string'||!value.trim()||value.trim().length>120)fail(400,'Use a title between 1 and 120 characters.');return value.trim();}
async function body(request){
 const max=450000;
 if(Number(request.headers.get('content-length'))>max)fail(413,'Request is too large.');
 const reader=request.body?.getReader();let chunks=[],size=0;
 if(reader){for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>max){await reader.cancel();fail(413,'Request is too large.');}chunks.push(value);}}
 const bytes=new Uint8Array(size);let pos=0;for(const part of chunks){bytes.set(part,pos);pos+=part.length;}
 try{const data=JSON.parse(new TextDecoder().decode(bytes));if(!data||Array.isArray(data)||typeof data!=='object')throw 0;return data;}catch{fail(400,'Send a valid JSON object.');}
}
const node=(type,...children)=>({type,children});
export async function seed(db){
 if(await db.prepare('SELECT id FROM documents WHERE id=?').bind('welcome-alice').first())return;
 const now=new Date().toISOString();
 const intro=[node('h1','Make room for good work.'),node('p','A shared space for early ideas, clear decisions, and everything in between. This is your team’s starting point.'),node('h2','A simple place to start'),node('p','Try selecting a few words and making them ',node('strong','bold'),', or add your next idea below. Every change is saved as you go.'),node('ul',node('li','Write something worth sharing.'),node('li','Bring a .txt file into your workspace.'),node('li','Invite a teammate, then switch accounts to try it.')),node('h2','Less friction. More momentum.'),node('p','Folio keeps the essentials close: a thoughtful editor, a clear owner, and a dependable place to return to your work.'),node('blockquote','Small tools. Meaningful progress.')];
 const docs=[['welcome-alice','alice','A calmer way to work',intro],['launch-ben','ben','Launch notes', [node('h1','A launch with intention'),node('p','Shared with Alice. Use this document to try editing work owned by a teammate.'),node('h2','Before we share it'),node('ol',node('li','Agree on the problem.'),node('li','Test the smallest useful solution.'),node('li','Make the next step clear.'))]],['private-casey','casey','Research notebook',[node('h1','Notes from the field'),node('p','Only Casey can see this document until it is shared.')]]];
 await db.batch([...USERS.map(u=>db.prepare('INSERT OR IGNORE INTO users (id,name,email) VALUES (?,?,?)').bind(u.id,u.name,u.email)),...docs.map(([id,owner,t,c])=>db.prepare('INSERT OR IGNORE INTO documents (id,owner_id,title,content,version,created_at,updated_at) VALUES (?,?,?,?,1,?,?)').bind(id,owner,t,JSON.stringify(c),now,now)),db.prepare('INSERT OR IGNORE INTO shares (document_id,user_id) VALUES (?,?)').bind('launch-ben','alice')]);
}
async function accessible(db,id,user){return await db.prepare("SELECT d.*,u.name AS owner_name,u.email AS owner_email,CASE WHEN d.owner_id=? THEN 'owner' ELSE (SELECT role FROM shares WHERE document_id=d.id AND user_id=?) END AS role FROM documents d JOIN users u ON u.id=d.owner_id WHERE d.id=? AND d.deleted_at IS NULL AND (d.owner_id=? OR EXISTS(SELECT 1 FROM shares WHERE document_id=d.id AND user_id=?))").bind(user,user,id,user,user).first();}
const editSQL="deleted_at IS NULL AND (owner_id=? OR EXISTS(SELECT 1 FROM shares WHERE document_id=documents.id AND user_id=? AND role='editor'))";
async function baseline(db,id){await db.prepare('INSERT OR IGNORE INTO document_versions (document_id,version,title,content,saved_by,created_at) SELECT id,version,title,content,NULL,updated_at FROM documents WHERE id=?').bind(id).run();}
const publicDoc=d=>({...d,content:JSON.parse(d.content)});
export default {
 async fetch(request,env){
  const url=new URL(request.url),path=url.pathname;
  try{
   if(path==='/'&&request.method==='GET')return new Response(typeof PAGE==='undefined'?'Run npm run dev or npm run build.':PAGE,{headers:{'content-type':'text/html; charset=utf-8','x-content-type-options':'nosniff','content-security-policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'self'; base-uri 'none'; object-src 'none'",'referrer-policy':'same-origin'}});
   if(!path.startsWith('/api/'))return json({error:'Not found'},404);
   const origin=request.headers.get('origin');if(origin&&origin!==url.origin)fail(403,'Cross-origin writes are not allowed.');
   const user=request.headers.get('x-demo-user');if(!USERS.some(u=>u.id===user))fail(401,'Choose a demo account.');
   const db=env.DB;if(!db)fail(503,'Database unavailable. Please try again shortly.');
   if(path==='/api/bootstrap'&&request.method==='GET'){await seed(db);return json({users:USERS,user:USERS.find(u=>u.id===user)});}
   if(path==='/api/documents'&&request.method==='GET'){
    const {results}=await db.prepare('SELECT d.id,d.title,d.owner_id,d.version,d.created_at,d.updated_at,u.name AS owner_name FROM documents d JOIN users u ON u.id=d.owner_id WHERE d.deleted_at IS NULL AND (d.owner_id=? OR EXISTS(SELECT 1 FROM shares s WHERE s.document_id=d.id AND s.user_id=?)) ORDER BY d.updated_at DESC,d.id').bind(user,user).all();return json({documents:results});
   }
   if((path==='/api/documents'||path==='/api/import')&&request.method==='POST'){
    const data=await body(request);let t,c;
    if(path==='/api/import'){
     if(typeof data.filename!=='string'||!data.filename.toLowerCase().endsWith('.txt'))fail(400,'Import supports .txt files only.');
     if(typeof data.text!=='string'||new TextEncoder().encode(data.text).length>100000||data.text.includes('\0'))fail(400,'Use a UTF-8 .txt file up to 100 KB, without null characters.');
     t=title(data.filename.replace(/\.txt$/i,'').slice(0,120));c=data.text.replace(/\r\n?/g,'\n').split('\n').map(line=>node('p',line));
    }else{t=title(data.title??'Untitled document');c=data.content??[node('p','')];}
    c=validateContent(c);const id=crypto.randomUUID(),now=new Date().toISOString();
    await db.batch([db.prepare('INSERT INTO documents (id,owner_id,title,content,version,created_at,updated_at) VALUES (?,?,?,?,1,?,?)').bind(id,user,t,JSON.stringify(c),now,now),db.prepare('INSERT INTO document_versions (document_id,version,title,content,saved_by,created_at) VALUES (?,1,?,?,?,?)').bind(id,t,JSON.stringify(c),user,now)]);return json({document:publicDoc(await accessible(db,id,user))},201);
   }
   if(path==='/api/trash'&&request.method==='GET'){
    const {results}=await db.prepare('SELECT id,title,deleted_at FROM documents WHERE owner_id=? AND deleted_at IS NOT NULL ORDER BY deleted_at DESC,id').bind(user).all();return json({documents:results});
   }
   const restore=path.match(/^\/api\/trash\/([a-zA-Z0-9-]+)\/restore$/);
   if(restore&&request.method==='POST'){
    const result=await db.prepare('UPDATE documents SET deleted_at=NULL WHERE id=? AND owner_id=? AND deleted_at IS NOT NULL').bind(restore[1],user).run();
    if(!result.meta.changes)fail(404,'Trashed document not found.');return json({ok:true});
   }
   const match=path.match(/^\/api\/documents\/([a-zA-Z0-9-]+)(\/(?:shares|comments|presence|versions(?:\/[0-9]+)?))?$/);if(!match)fail(404,'Not found');
   const id=match[1],doc=await accessible(db,id,user);if(!doc)fail(404,'Document not found or access removed.');
   const section=match[2]||'';
   if(!section){
    if(request.method==='DELETE'){
     if(doc.owner_id!==user)fail(403,'Only the owner can move this document to Trash.');
     const now=new Date().toISOString();await db.batch([db.prepare('UPDATE documents SET deleted_at=? WHERE id=? AND owner_id=? AND deleted_at IS NULL').bind(now,id,user),db.prepare('DELETE FROM presence WHERE document_id=?').bind(id)]);return json({ok:true});
    }
    if(request.method==='GET')return json({document:publicDoc(doc)});
    if(request.method==='PUT'){
     if(doc.role==='viewer')fail(403,'Viewers cannot edit this document.');
     const data=await body(request),t=title(data.title),c=validateContent(data.content);
     if(!Number.isSafeInteger(data.version)||data.version<1)fail(400,'A valid document version is required.');
     const now=new Date().toISOString();
     // The update and its snapshot share one transaction. changes() refers to the preceding UPDATE.
     const results=await db.batch([
      db.prepare('INSERT OR IGNORE INTO document_versions (document_id,version,title,content,saved_by,created_at) SELECT id,version,title,content,NULL,updated_at FROM documents WHERE id=?').bind(id),
      db.prepare('UPDATE documents SET title=?,content=?,version=version+1,updated_at=? WHERE id=? AND version=? AND '+editSQL).bind(t,JSON.stringify(c),now,id,data.version,user,user),
      db.prepare('INSERT INTO document_versions (document_id,version,title,content,saved_by,created_at) SELECT id,version,title,content,?,updated_at FROM documents WHERE id=? AND version=? AND changes()=1').bind(user,id,data.version+1)
     ]);
     if(!results[1].meta.changes){const current=await accessible(db,id,user);if(!current)fail(404,'Document not found or access removed.');if(current.role==='viewer')fail(403,'Your access changed to viewer. Download your draft to keep a copy.');fail(409,'Someone saved a newer version. Download your draft, then reload the latest version.');}
     return json({version:data.version+1,updated_at:now});
    }
   }else if(section==='/shares'){
    if(request.method==='GET'){
     const {results}=await db.prepare('SELECT u.id,u.name,u.email,s.role FROM shares s JOIN users u ON u.id=s.user_id WHERE s.document_id=?').bind(id).all();return json({owner:{id:doc.owner_id,name:doc.owner_name,email:doc.owner_email},members:results});
    }
    if(doc.owner_id!==user)fail(403,'Only the owner can manage sharing.');
    const data=await body(request);if(!USERS.some(u=>u.id===data.user_id)||data.user_id===user)fail(400,'Choose another demo teammate.');
    if(request.method==='POST'){
     const role=data.role??'editor';if(!['editor','viewer'].includes(role))fail(400,'Choose editor or viewer access.');
     await db.prepare('INSERT INTO shares (document_id,user_id,role) VALUES (?,?,?) ON CONFLICT(document_id,user_id) DO UPDATE SET role=excluded.role').bind(id,data.user_id,role).run();return json({ok:true});
    }
    if(request.method==='DELETE'){await db.batch([db.prepare('DELETE FROM shares WHERE document_id=? AND user_id=?').bind(id,data.user_id),db.prepare('DELETE FROM presence WHERE document_id=? AND user_id=?').bind(id,data.user_id)]);return json({ok:true});}
   }else if(section==='/comments'){
    if(request.method==='GET'){
     const {results}=await db.prepare('SELECT c.*,u.name AS author_name FROM comments c JOIN users u ON u.id=c.author_id WHERE c.document_id=? ORDER BY c.created_at DESC,c.id DESC LIMIT 200').bind(id).all();return json({comments:results.reverse(),limit:200});
    }
    if(doc.role==='viewer')fail(403,'Viewers cannot add or remove comments.');
    const data=await body(request);
    if(request.method==='POST'){
     if(typeof data.body!=='string'||!data.body.trim()||data.body.trim().length>2000)fail(400,'Write a comment between 1 and 2,000 characters.');
     const comment={id:crypto.randomUUID(),document_id:id,author_id:user,body:data.body.trim(),created_at:new Date().toISOString()};
     const result=await db.prepare('INSERT INTO comments (id,document_id,author_id,body,created_at) SELECT ?,?,?,?,? FROM documents WHERE id=? AND '+editSQL).bind(comment.id,id,user,comment.body,comment.created_at,id,user,user).run();if(!result.meta.changes)fail(403,'Your access changed. The comment was not posted.');
     return json({comment:{...comment,author_name:USERS.find(u=>u.id===user).name}},201);
    }
    if(request.method==='DELETE'){
     if(typeof data.id!=='string')fail(400,'Choose a comment.');
     const result=await db.prepare('DELETE FROM comments WHERE id=? AND document_id=? AND (author_id=? OR ?=?) AND EXISTS(SELECT 1 FROM documents WHERE id=? AND '+editSQL+')').bind(data.id,id,user,doc.owner_id,user,id,user,user).run();if(!result.meta.changes)fail(404,'Comment not found or you cannot remove it.');return json({ok:true});
    }
   }else if(section.startsWith('/versions')){
    if(request.method==='GET'){
     await baseline(db,id);
     if(section==='/versions'){
      const {results}=await db.prepare('SELECT v.version,v.title,v.created_at,v.saved_by,u.name AS saved_by_name FROM document_versions v LEFT JOIN users u ON u.id=v.saved_by WHERE v.document_id=? ORDER BY v.version DESC LIMIT 100').bind(id).all();return json({versions:results,limit:100});
     }
     const version=Number(section.split('/')[2]);if(!Number.isSafeInteger(version)||version<1)fail(400,'Invalid version.');
     const snapshot=await db.prepare('SELECT v.*,u.name AS saved_by_name FROM document_versions v LEFT JOIN users u ON u.id=v.saved_by WHERE document_id=? AND version=?').bind(id,version).first();if(!snapshot)fail(404,'Version not found.');return json({snapshot:publicDoc(snapshot)});
    }
   }else if(section==='/presence'){
    const now=new Date().toISOString(),cutoff=new Date(Date.now()-45000).toISOString();
    if(['POST','DELETE'].includes(request.method)){
     const data=await body(request);if(typeof data.session_id!=='string'||!/^[a-zA-Z0-9-]{1,80}$/.test(data.session_id))fail(400,'Invalid presence session.');
     if(request.method==='DELETE'){await db.prepare('DELETE FROM presence WHERE document_id=? AND session_id=? AND user_id=?').bind(id,data.session_id,user).run();return json({ok:true});}
     await db.batch([db.prepare('DELETE FROM presence WHERE document_id=? AND last_seen<?').bind(id,cutoff),db.prepare('INSERT INTO presence (document_id,session_id,user_id,editing,last_seen) VALUES (?,?,?,?,?) ON CONFLICT(document_id,session_id) DO UPDATE SET editing=excluded.editing,last_seen=excluded.last_seen WHERE presence.user_id=excluded.user_id').bind(id,data.session_id,user,doc.role!=='viewer'&&data.editing===true?1:0,now)]);
    }else if(request.method!=='GET')return json({error:'Method not allowed'},405);
    const {results}=await db.prepare('SELECT u.id,u.name,MAX(p.editing) AS editing,MAX(p.last_seen) AS last_seen FROM presence p JOIN users u ON u.id=p.user_id WHERE p.document_id=? AND p.last_seen>=? AND (p.user_id=? OR EXISTS(SELECT 1 FROM shares s WHERE s.document_id=p.document_id AND s.user_id=p.user_id)) GROUP BY u.id,u.name ORDER BY u.name').bind(id,cutoff,doc.owner_id).all();return json({people:results,expires_after_seconds:45,role:doc.role});
   }
   return json({error:'Method not allowed'},405);
  }catch(e){if(e instanceof HttpError)return json({error:e.message},e.status);console.error('Folio request failed',e);return json({error:'Something went wrong. Your draft is still in the editor. Please try again.'},500);}
 }
};
