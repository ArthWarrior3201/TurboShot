const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const source=app.slice(app.indexOf('function showAuth('),app.indexOf("for (const id of ['login','right-login'])"));
function harness(){
 const nodes=new Map(),calls=[],answers=[],saved=new Map();let feedLoads=0;
 const node=id=>{if(!nodes.has(id)) nodes.set(id,{id,value:'',hidden:false,disabled:false,open:false,textContent:'',attrs:{},events:{},firstChild:{textContent:''},addEventListener(k,fn){this.events[k]=fn;},setAttribute(k,v){this.attrs[k]=v;},removeAttribute(k){delete this.attrs[k];},setCustomValidity(value){this.customValidity=value;},focus(){this.focused=true;},reset(){for(const n of nodes.values())n.value='';},close(){this.open=false;this.events.close?.();}});return nodes.get(id);};
 const query=s=>s==='#auth-form [aria-invalid=true]'?[...nodes.values()].find(n=>n.attrs['aria-invalid']==='true')||null:node(s.slice(1));
 const document={querySelectorAll:()=>[...nodes.values()].filter(n=>n.attrs['aria-invalid'])};
 const context=vm.createContext({$,document,sessionStorage:{setItem:(k,v)=>saved.set(k,v)},seenThisVisit:new Set(),message:(n,value)=>n.textContent=value,openDialog:s=>query(s).open=true,toast(){},updateAccount(){},loadFeed:async()=>feedLoads++,api:async(action,input)=>{calls.push({action,input});const answer=answers.shift();if(answer instanceof Error)throw answer;return answer;}});
 function $(s){return query(s);}
 vm.runInContext("let authMode='login',otpChallenge='',linkTicket='',session='',me=null;",context);
 vm.runInContext(source,context);
 return {node,calls,answers,saved,feedLoads:()=>feedLoads,state:()=>vm.runInContext('({authMode,otpChallenge,session,me})',context),show:mode=>vm.runInContext(`showAuth('${mode}')`,context),submit:()=>node('auth-form').events.submit({preventDefault(){}}),resend:()=>node('resend').events.click()};
}
test('signup moves to email code entry without saving a session or showing a back button',async()=>{
 const h=harness();h.show('signup');assert.equal(h.node('auth-switch').hidden,true);
 h.node('auth-email').value='alice@example.com';h.node('auth-password').value='a long enough password';h.node('auth-username').value='alice';
 h.answers.push({requiresCode:true,challenge:'challenge-one',message:'Enter the code'});await h.submit();
 assert.equal(h.state().authMode,'verify-otp');assert.equal(h.state().otpChallenge,'challenge-one');assert.equal(h.state().session,'');assert.equal(h.saved.size,0);
 assert.equal(h.node('auth-password').value,'');assert.equal(h.node('code-label').hidden,false);assert.equal(h.node('auth-code').required,true);assert.equal(h.node('email-label').hidden,true);assert.equal(h.node('auth-switch').hidden,true);
});
test('wrong OTP stays on the same screen, marks it red and cannot advance; correct proof finishes login',async()=>{
 const h=harness();h.show('login');h.answers.push({requiresCode:true,challenge:'login-challenge',message:'Code sent'});await h.submit();
 h.node('auth-code').value='000000';const bad=new Error('That code is incorrect.');bad.fields=['code'];h.answers.push(bad);await h.submit();
 assert.equal(h.state().authMode,'verify-otp');assert.equal(h.state().session,'');assert.equal(h.node('auth-dialog').open,true);assert.equal(h.node('auth-code').attrs['aria-invalid'],'true');assert.equal(h.node('auth-submit').disabled,false);assert.equal(h.node('auth-message').textContent,bad.message);assert.equal(h.feedLoads(),0);
 h.node('auth-form').events.input({target:h.node('auth-code')});assert.equal(h.node('auth-code').attrs['aria-invalid'],undefined);
 h.node('auth-code').value='123456';h.answers.push({token:'server-session',user:{username:'alice'}});await h.submit();
 assert.equal(h.state().session,'server-session');assert.equal(h.saved.get('turboshot-session'),'server-session');assert.equal(h.node('auth-dialog').open,false);assert.equal(h.feedLoads(),1);
 assert.equal(h.calls[1].action,'verify-otp');assert.equal(h.calls[1].input.challenge,'login-challenge');
});
test('duplicate email keeps signup open and highlights the email input',async()=>{
 const h=harness();h.show('signup');const error=new Error('This email already has an account.');error.fields=['email'];h.answers.push(error);await h.submit();
 assert.equal(h.state().authMode,'signup');assert.equal(h.node('auth-email').attrs['aria-invalid'],'true');assert.equal(h.node('auth-code').required,false);assert.equal(h.saved.size,0);
});
test('resending replaces the held challenge without creating a session',async()=>{
 const h=harness();h.show('login');h.answers.push({requiresCode:true,challenge:'old',message:'Code sent'});await h.submit();
 h.answers.push({requiresCode:true,challenge:'new',message:'New code sent'});await h.resend();
 assert.equal(h.calls[1].action,'resend-otp');assert.equal(h.calls[1].input.challenge,'old');assert.equal(h.state().otpChallenge,'new');assert.equal(h.state().session,'');assert.equal(h.node('resend').disabled,false);
});


test('password visibility toggles twice and resets on mode changes, submit and close',async()=>{
 const h=harness();h.show('signup');const input=h.node('auth-password'),toggle=h.node('password-toggle');input.value='my private password';
 assert.equal(input.type,'password');toggle.events.click();assert.equal(input.type,'text');assert.equal(toggle.textContent,'Hide');assert.equal(toggle.attrs['aria-pressed'],'true');
 toggle.events.click();assert.equal(input.type,'password');assert.equal(input.value,'my private password');
 toggle.events.click();h.show('login');assert.equal(input.type,'password');assert.equal(toggle.textContent,'Show');
 toggle.events.click();h.node('auth-dialog').close();assert.equal(input.type,'password');assert.equal(input.value,'');
});
