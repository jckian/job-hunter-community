// Deploy a fresh, allowlisted tree. Never upload personal preference/backup files.
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const repo=process.argv[2];
if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo||''))throw new Error('Usage: npm run publish:pages -- OWNER/REPOSITORY');
execFileSync(process.execPath,['--test',...fs.readdirSync(path.join(root,'tests')).filter(x=>x.endsWith('.test.cjs')).map(x=>path.join(root,'tests',x))],{stdio:'inherit',cwd:root});
function api(endpoint,method='GET',data){
  const args=['api',`repos/${repo}/${endpoint}`,'--method',method];
  if(data)args.push('--input','-');
  const response=execFileSync('gh',args,{input:data?JSON.stringify(data):undefined,encoding:'utf8'});
  return response.trim()?JSON.parse(response):null;
}
function optional(endpoint){try{return api(endpoint);}catch(e){if(String(e.stderr).includes('HTTP 404'))return null;throw e;}}
const files=['index.html','base.css','community.css','core.js','app.js','scanner.js','scan-ui.js','icon.svg','preference.example.json','.nojekyll'];
const tree=api('git/trees','POST',{tree:files.map(file=>({path:file,mode:'100644',type:'blob',content:fs.readFileSync(path.join(root,file),'utf8')}))});
const previous=optional('git/ref/heads/gh-pages');
const commit=api('git/commits','POST',{message:'Publish community site',tree:tree.sha,parents:previous?[previous.object.sha]:[]});
if(previous)api('git/refs/heads/gh-pages','PATCH',{sha:commit.sha,force:false});
else api('git/refs','POST',{ref:'refs/heads/gh-pages',sha:commit.sha});
const pages=optional('pages');
if(pages)api('pages','PUT',{build_type:'legacy',source:{branch:'gh-pages',path:'/'}});
else api('pages','POST',{build_type:'legacy',source:{branch:'gh-pages',path:'/'}});
console.log(`Published commit ${commit.sha}. GitHub Pages is building https://${repo.split('/')[0]}.github.io/${repo.split('/')[1]}/`);
