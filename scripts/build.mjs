import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
await rm('dist', { recursive: true, force: true });
await mkdir('dist/server', { recursive: true });
const [server, html, css, client, markdown] = await Promise.all(['app/server.js','app/index.html','app/style.css','app/client.js','app/markdown.js'].map(p => readFile(p,'utf8')));
const page = html.replace('/*STYLES*/', css).replace('/*CLIENT*/', markdown.replace('export function','function')+'\n'+client);
await writeFile('dist/server/index.js', 'const PAGE = '+JSON.stringify(page)+';\n'+server);
console.log('Built dependency-free Worker and embedded UI.');
