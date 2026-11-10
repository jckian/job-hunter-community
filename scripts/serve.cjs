const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const files={'/':'index.html','/index.html':'index.html','/base.css':'base.css','/community.css':'community.css','/core.js':'core.js','/app.js':'app.js','/icon.svg':'icon.svg','/preference.example.json':'preference.example.json'};
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.json':'application/json; charset=utf-8'};
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1');const file=files[url.pathname];
  if(!file||!['GET','HEAD'].includes(req.method)){res.writeHead(404);res.end('Not found');return;}
  res.writeHead(200,{'Content-Type':types[path.extname(file)],'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  if(req.method==='HEAD')res.end();else fs.createReadStream(path.join(root,file)).pipe(res);
});
server.listen(8787,'127.0.0.1',()=>console.log('Local: http://127.0.0.1:8787/'));
