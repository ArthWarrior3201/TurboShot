const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync(require('node:path').join(__dirname,'../app.js'),'utf8');
const code=source.slice(source.indexOf('// Device preferences stay'),source.indexOf('async function init()'));
function harness({initial={},translator,detector,content=false}={}){
 const data=new Map(Object.entries(initial)),nodes=new Map(),handlers={};
 for(const id of ['device-theme','device-language','device-message','other-language','other-language-code','apply-language'])nodes.set(id,{id,value:'en',textContent:'',append(o){this.options.push(o);},focus(){},options:['en','hi','fr'].map(value=>({value})),addEventListener:(event,fn)=>handlers[id+':'+event]=fn});
 const parent={closest:selector=>content && selector.includes('.post') ? {} : null},textNode={nodeValue:'Welcome',isConnected:true,parentElement:parent};
 const document={createElement:()=>({}),documentElement:{dataset:{},lang:'en'},body:{},createTreeWalker(){let once=false;return{nextNode(){if(once)return null;once=true;return textNode;}}}};
 class MutationObserver{constructor(fn){this.fn=fn;}observe(){}}
 const ctx=vm.createContext({document,MutationObserver,NodeFilter:{SHOW_TEXT:4},window:{Translator:translator,LanguageDetector:detector},localStorage:{getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)},$:selector=>nodes.get(selector.slice(1)),message:(target,value)=>target.textContent=value});
 vm.runInContext(code,ctx);
 return{ctx,data,nodes,handlers,textNode,document,language:async value=>handlers['device-language:change']({target:{value}}),theme:value=>handlers['device-theme:change']({target:{value}})};
}
test('theme is saved locally and can be restored on this browser',()=>{const a=harness();a.theme('ocean');assert.equal(a.document.documentElement.dataset.theme,'ocean');assert.equal(a.data.get('turboshot-device-theme'),'ocean');const b=harness({initial:Object.fromEntries(a.data)});assert.equal(b.document.documentElement.dataset.theme,'ocean');});
test('available browser translation changes and restores app text',async()=>{const mock={availability:async()=> 'available',create:async()=>({translate:async v=>'XX '+v,destroy(){}})},h=harness({translator:mock});await h.language('hi');assert.equal(h.textNode.nodeValue,'XX Welcome');assert.equal(h.document.documentElement.lang,'hi');assert.equal(h.data.get('turboshot-device-language'),'hi');await h.language('en');assert.equal(h.textNode.nodeValue,'Welcome');assert.equal(h.document.documentElement.lang,'en');});
test('unsupported browsers explain the limitation instead of pretending to translate',async()=>{const h=harness();await h.language('hi');assert.equal(h.nodes.get('device-language').value,'en');assert.match(h.nodes.get('device-message').textContent,/cannot translate/);assert.equal(h.data.get('turboshot-device-language'),'en');});

test('content in the selected language stays unchanged and other detected languages translate',async()=>{
 const translator={availability:async()=> 'available',create:async({sourceLanguage})=>({translate:async v=>sourceLanguage+':'+v,destroy(){}})};
 const detector={availability:async()=> 'available',create:async()=>({detect:async v=>[{detectedLanguage:v==='bonjour'?'fr':'en',confidence:0.99}],destroy(){}})};
 const h=harness({translator,detector,content:true});await vm.runInContext("setDeviceLanguage('fr')",h.ctx);
 h.textNode.nodeValue='bonjour';await vm.runInContext('translateInterface(document.body,translationRun)',h.ctx);assert.equal(h.textNode.nodeValue,'bonjour');
 h.textNode.nodeValue='hello';await vm.runInContext('translateInterface(document.body,translationRun)',h.ctx);assert.equal(h.textNode.nodeValue,'en:hello');
 h.textNode.nodeValue='bonjour';await vm.runInContext("setDeviceLanguage('en')",h.ctx);assert.equal(h.textNode.nodeValue,'fr:bonjour');
});
