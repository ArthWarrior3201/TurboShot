const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const source=app.slice(app.indexOf("$('#post-form').addEventListener('submit'"),app.indexOf('const modeText'));
function harness({image=false}={}) {
 const nodes=new Map(),calls=[];let handler,release;
 const node=id=>{if(!nodes.has(id))nodes.set(id,{value:id==='post-kind'?'post':id==='post-text'?'Hello community':'',textContent:'Publish',disabled:false,files:id==='post-media'&&image?[{}]:[],open:true,addEventListener:(event,fn)=>handler=fn});return nodes.get(id);};
 const pending=new Promise(resolve=>release=resolve),submit=node('submit');
 const context={$:s=>node(s.slice(1)),postOperation:0,pendingUpload:null,mode:'latest',circleId:'',searchTerm:'',uploadImage:()=>pending,api:async(action,data)=>{calls.push({action,data});if(action==='post'){await pending;throw new Error('Please try again.');}return{};},message:(n,t)=>n.textContent=t};
 vm.runInNewContext(source,context);
 return{node,calls,release,submit,start:()=>handler({preventDefault(){},target:{querySelector:()=>submit}})};
}
test('Publish says Publishing immediately, then restores its label on failure',async()=>{
 const h=harness(),running=h.start();assert.equal(h.submit.textContent,'Publishing…');assert.equal(h.submit.disabled,true);h.release();await running;assert.equal(h.submit.textContent,'Publish');assert.equal(h.submit.disabled,false);assert.equal(h.node('post-message').textContent,'Please try again.');
});
test('closing the composer during an image upload cancels the reservation and never publishes',async()=>{
 const h=harness({image:true}),running=h.start();h.node('post-dialog').open=false;h.release('upload-one');await running;assert.deepEqual(h.calls.map(c=>c.action),['cancel-upload']);assert.equal(h.submit.disabled,false);
});
