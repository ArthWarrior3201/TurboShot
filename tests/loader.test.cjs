const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const source=fs.readFileSync(require('node:path').join(__dirname,'../loader.js'),'utf8');
async function harness({busy=false,offline=false,shell='spark-v1'}={}) {
 let changed=false;const requests=[],scripts=[],reloads=[],notices=[],intervals=[];
 const create=tag=>({tag,isConnected:false,setAttribute(){},addEventListener(name,fn){this[name]=fn;},append(...nodes){this.children=nodes;}});
 const style=create('link');style.isConnected=true;
 Object.defineProperty(style,'href',{set(value){this.url=value;queueMicrotask(()=>this.onload());}});
 const document={currentScript:{src:'https://example.com/TurboShot/loader.js?v=1'},documentElement:{dataset:{shell}},activeElement:null,hidden:false,
  getElementById:id=>id==='app-styles'?style:null,
  createElement:create,querySelector:selector=>selector==='dialog[open]' && busy?{}:null,querySelectorAll:()=>[],addEventListener(){},
  head:{append(node){node.isConnected=true;scripts.push(node.src);queueMicrotask(()=>node.onload());}},body:{append(node){notices.push(node);}}};
 const window={addEventListener(){}};
 const context={window,document,URL,AbortSignal,navigator:{onLine:!offline},location:{href:'https://example.com/TurboShot/',replace:url=>reloads.push(url)},setInterval:(fn,ms)=>intervals.push({fn,ms}),fetch:async(url,opts)=>{requests.push({url:String(url),opts});return {ok:true,text:async()=>String(url).includes('index.html')?'<html data-shell="spark-v1">':String(url).includes('app.js') && changed?'new application':'existing '+new URL(url).pathname};}};
 vm.runInNewContext(source,context);
 await new Promise(resolve=>setImmediate(resolve));
 return {window,requests,scripts,reloads,notices,intervals,change(){changed=true;},idle(){busy=false;}};
}
test('boot checks fresh files and loads configuration before the application',async()=>{
 const h=await harness();assert.equal(h.requests.length,4);assert.ok(h.requests.every(x=>x.opts.cache==='no-store' && x.url.includes('_fresh=')));
 assert.equal(h.scripts.length,2);assert.ok(h.scripts[0].includes('config.js?build='));assert.ok(h.scripts[1].includes('app.js?build='));
});
test('a later deployment reloads an idle page without manual cache clearing',async()=>{
 const h=await harness();h.change();await h.window.TurboShotUpdates.check();assert.equal(h.reloads.length,1);assert.ok(h.reloads[0].includes('_ts='));
});
test('updates wait for a draft/dialog and apply once the page is idle',async()=>{
 const h=await harness({busy:true});h.change();await h.window.TurboShotUpdates.check();assert.equal(h.reloads.length,0);assert.equal(h.notices.length,1);
 h.idle();h.intervals.find(x=>x.ms===5000).fn();assert.equal(h.reloads.length,1);
});
test('unchanged or offline pages do not reload',async()=>{
 const h=await harness();await h.window.TurboShotUpdates.check();assert.equal(h.reloads.length,0);
 const offline=await harness({offline:true});offline.change();await offline.window.TurboShotUpdates.check();assert.equal(offline.reloads.length,0);
});
test('a changed HTML shell reloads before starting incompatible application code',async()=>{
 const h=await harness({shell:'old-shell'});assert.equal(h.reloads.length,1);assert.equal(h.scripts.length,0);
});
