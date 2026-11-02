'use strict';
const $ = selector => document.querySelector(selector);
const el = (tag, className, content) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
};
const button = (label, className, fn) => { const b = el('button', className, label); b.type = 'button'; b.addEventListener('click', fn); return b; };
const config = window.TURBOSHOT || {};
let apiBase = '';
try { const u = new URL(config.API_BASE); if (u.protocol === 'https:' || (u.protocol === 'http:' && u.hostname === 'localhost')) apiBase = u.href.replace(/\/$/, ''); } catch {}
let session = sessionStorage.getItem('turboshot-session') || '';
let me = null, mode = 'latest', cursor = null, authMode = 'login', linkTicket = '', searchTerm = '', feedRequest = 0;
let toastTimer, viewObserver, otpChallenge='';
let selectedVideo=null,pendingUpload=null,uploadXHR=null,previewURL='',videoSelection=0;
const playbacks=new Set(),loadedPostIds=new Set();
const seenThisVisit = new Set();
function toast(message) { $('#toast').textContent = message; $('#toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 6500); }
function message(target, value, success = false) { target.textContent = value; target.classList.toggle('success', success); }
async function api(action, input = {}, method = 'POST') {
  if (!apiBase) throw new Error('The service address has not been configured yet.');
  const url = new URL(apiBase), options = { method, headers: {}, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(25000) };
  if (session) options.headers.Authorization = `Bearer ${session}`;
  if (method === 'GET') { for (const [k,v] of Object.entries({action,...input})) url.searchParams.set(k,String(v)); }
  else { options.headers['Content-Type'] = 'application/json'; options.body = JSON.stringify({action,...input}); }
  let response;
  try { response = await fetch(url,options); } catch { throw new Error('Unable to connect. Check your internet connection and try again.'); }
  let result;
  try { result = await response.json(); } catch { throw new Error('The service is not responding correctly. Please try again shortly.'); }
  if (!response.ok) {
    if (response.status === 401 && session && action !== 'login') clearSession();
    const detail=result.error || 'Something went wrong. Please try again.';
    const configurationIssue=(response.status===403 && /origin/i.test(detail)) || (response.status===503 && /not configured|configure .*first|vault key|repository connection|origin setting/i.test(detail));
    const error=new Error(configurationIssue?'TurboShot is being set up. Please try again shortly.':detail);
    error.status=response.status; error.configurationIssue=configurationIssue; error.fields=Array.isArray(result.fields)?result.fields:[]; throw error;
  }
  return result;
}
async function cancelUpload() {
  uploadXHR?.abort(); uploadXHR=null;
  const pending=pendingUpload; pendingUpload=null;
  if(pending && session) { try { await api('cancel-upload',{uploadId:pending.id}); } catch {} }
}
function clearVideoSelection() {
  videoSelection++; selectedVideo=null;
  $('#upload-preview').pause(); $('#upload-preview').removeAttribute('src'); $('#upload-preview').load(); $('#upload-preview').hidden=true;
  if(previewURL) URL.revokeObjectURL(previewURL); previewURL='';
  $('#upload-progress').hidden=true; $('#upload-progress').value=0;
  $('#upload-status').textContent='Choose an MP4 or WebM, up to 25 MB and 90 seconds.';
}
$('#post-video').addEventListener('change',async () => {
  await cancelUpload(); clearVideoSelection();
  const file=$('#post-video').files[0]; if(!file) return;
  const type=file.type || (/\.mp4$/i.test(file.name)?'video/mp4':/\.webm$/i.test(file.name)?'video/webm':'');
  if(!['video/mp4','video/webm'].includes(type) || file.size<32 || file.size>25*1024*1024) { $('#post-video').value=''; message($('#post-message'),'Choose an MP4 or WebM file, up to 25 MB.'); return; }
  const selection=videoSelection;
  previewURL=URL.createObjectURL(file); const preview=$('#upload-preview'); preview.hidden=false;
  preview.onloadedmetadata=()=>{
    if(selection!==videoSelection) return;
    if(!Number.isFinite(preview.duration) || preview.duration<=0 || preview.duration>90) { selectedVideo=null; message($('#post-message'),'Choose a video that is 90 seconds or shorter.'); return; }
    selectedVideo={file,type,duration:preview.duration};
    $('#upload-status').textContent=`${file.name} · ${(file.size/1024/1024).toFixed(1)} MB · ${Math.ceil(preview.duration)} seconds. Ready to upload.`;
    message($('#post-message'),'');
  };
  preview.onerror=()=>{ if(selection===videoSelection) { selectedVideo=null; message($('#post-message'),'This browser cannot read the video. Try an H.264 MP4 or a WebM.'); } };
  preview.src=previewURL;
});
function uploadFile(url,selection) {
  return new Promise((resolve,reject)=>{
    const xhr=uploadXHR=new XMLHttpRequest();
    xhr.open('PUT',url); xhr.timeout=180000;
    xhr.setRequestHeader('Content-Type',selection.type); xhr.setRequestHeader('Cache-Control','max-age=60');
    xhr.upload.onprogress=e=>{ if(e.lengthComputable) { const value=Math.round(100*e.loaded/e.total); $('#upload-progress').value=value; $('#upload-status').textContent=`Uploading your Zap… ${value}%`; } };
    xhr.onload=()=>xhr.status>=200 && xhr.status<300 ? resolve() : reject(new Error('Video storage rejected the upload. Check your file and try again.'));
    xhr.onerror=()=>reject(new Error('The upload was interrupted. Check your connection and try again.'));
    xhr.ontimeout=()=>reject(new Error('The upload took too long. Try a smaller video or a stronger connection.'));
    xhr.onabort=()=>reject(new Error('Upload cancelled.'));
    $('#upload-progress').hidden=false; xhr.send(selection.file);
  });
}
$('#post-dialog').addEventListener('close',()=>{ cancelUpload(); clearVideoSelection(); });
function openDialog(id) { document.querySelectorAll('.post video').forEach(v=>v.pause()); const dialog = $(id); if (!dialog.open) dialog.showModal(); }
document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));
document.querySelectorAll('dialog').forEach(d => d.addEventListener('click', e => { if (e.target === d) { const r = d.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) d.close(); } }));
function clearSession() { session = ''; me = null; sessionStorage.removeItem('turboshot-session'); updateAccount(); }
function updateAccount() {
  $('#login').hidden = !!me; $('#signup').hidden = !!me; $('#account').hidden = !me;
  $('#moderation').hidden = !me?.admin;
  $('#account').textContent = me?.username.slice(0,2).toUpperCase() || '';
  $('#composer-avatar').textContent = me?.username.slice(0,2).toUpperCase() || 'T';
  $('#account').title = me ? `@${me.username}` : 'Account';
  $('#right-join').textContent = me ? 'Create post' : 'Create account';
  $('#hero-join').textContent = me ? 'Create post' : 'Find your spark';
  $('#right-login').parentElement.hidden=!!me;
}
function needAccount() { if (me) return true; showAuth('login'); return false; }
function showAuth(next = 'login') {
  authMode = next;
  if(next!=='verify-otp') otpChallenge='';
  document.querySelectorAll('#auth-form [aria-invalid]').forEach(n=>n.removeAttribute('aria-invalid'));
  const code=next==='verify-otp';
  const signup = next === 'signup', login = next === 'login', reset = next === 'reset', verify = next === 'verify';
  const request = next === 'request-reset' || next === 'resend';
  $('#auth-form').reset();
  $('#auth-title').textContent = ({ 'verify-otp':'Check your email',login:'Welcome back',signup:'Create your account', 'request-reset':'Reset your password',resend:'Verify your email',reset:'Choose a new password',verify:'Verify your email' })[next];
  $('#auth-description').textContent = ({ 'verify-otp':'Enter the 6-digit code we sent you. It expires in 10 minutes.',login:'Sign in to your TurboShot account.', signup:'Enter your details to get started.', 'request-reset':'We’ll email you a single-use password reset link.', resend:'We’ll send a new code to finish creating your account.', reset:'Choose a new password with at least 12 characters.',verify:'Confirm this email address for your TurboShot account.' })[next];
  $('#username-label').hidden = !signup; $('#auth-username').required = signup;
  $('#email-label').hidden = reset || verify || code; $('#auth-email').required = !reset && !verify && !code;
  $('#code-label').hidden=!code; $('#auth-code').required=code;
  $('#email-label').firstChild.textContent = login ? 'Email or username' : 'Email address';
  $('#auth-email').type = login ? 'text' : 'email';
  $('#auth-email').autocomplete = login ? 'username' : 'email';
  $('#password-label').hidden = request || verify || code; $('#auth-password').required = !request && !verify && !code;
  $('#auth-password').minLength = signup || reset ? 12 : 1;
  $('#auth-password').autocomplete = signup || reset ? 'new-password' : 'current-password';
  $('#password-help').hidden = !signup && !reset; $('#invite-label').hidden = true;
  $('#auth-submit').textContent = ({'verify-otp':'Verify code',login:'Continue',signup:'Create account','request-reset':'Send reset link',resend:'Send verification code',reset:'Save password',verify:'Verify email'})[next];
  $('#auth-submit').hidden = false;
  $('#auth-switch').hidden = signup || code;
  $('#auth-switch').textContent = login ? 'Create an account' : 'Return to sign in';
  $('#invite-label').open=false;
  $('#forgot').hidden = !login; $('#resend').hidden = !login && !code;
  $('#resend').textContent=code?'Send a new code':'Resend verification';
  message($('#auth-message'),'');
  openDialog('#auth-dialog');
}
$('#auth-switch').addEventListener('click', () => showAuth(authMode === 'login' ? 'signup' : 'login'));
$('#forgot').addEventListener('click', () => showAuth('request-reset'));
$('#resend').addEventListener('click', async () => {
  if(authMode!=='verify-otp') return showAuth('resend');
  const button=$('#resend'); button.disabled=true;
  try { const data=await api('resend-otp',{challenge:otpChallenge}); otpChallenge=data.challenge; $('#auth-code').value=''; $('#auth-code').removeAttribute('aria-invalid'); message($('#auth-message'),data.message,true); }
  catch(error) {message($('#auth-message'),error.message);}
  finally {button.disabled=false;}
});
$('#auth-form').addEventListener('invalid',e=>e.target.setAttribute('aria-invalid','true'),true);
$('#auth-form').addEventListener('input',e=>e.target.removeAttribute('aria-invalid'));
$('#auth-form').addEventListener('submit', async e => {
  e.preventDefault(); const submit = $('#auth-submit'); submit.disabled = true; message($('#auth-message'),'Working…');
  try {
    const payload = { email:$('#auth-email').value.trim(), login:$('#auth-email').value.trim(), username:$('#auth-username').value.trim(), password:$('#auth-password').value, invite:$('#auth-invite').value, ticket:linkTicket, challenge:otpChallenge, code:$('#auth-code').value.trim() };
    const data = await api(authMode, payload);
    $('#auth-password').value = '';
    if(data.requiresCode && data.challenge) {
      showAuth('verify-otp'); otpChallenge=data.challenge; $('#auth-code').focus(); message($('#auth-message'),data.message,true);
    } else if ((authMode === 'login' || authMode==='verify-otp') && data.token && data.user) {
      session = data.token; me = data.user; sessionStorage.setItem('turboshot-session',session); seenThisVisit.clear(); updateAccount();
      $('#auth-dialog').close(); toast(`Welcome, @${me.username}.`); await loadFeed();
    } else {
      message($('#auth-message'),data.message,true);
      if (authMode === 'verify' || authMode === 'reset') { linkTicket = ''; submit.hidden = true; }
    }
  } catch (err) {
    message($('#auth-message'),err.message);
    const fields={email:'#auth-email',password:'#auth-password',username:'#auth-username',code:'#auth-code',invite:'#auth-invite'};
    for(const field of err.fields || []) if(fields[field]) $(fields[field]).setAttribute('aria-invalid','true');
    $('#auth-form [aria-invalid=true]')?.focus();
    if(authMode==='signup' && /invitation code/i.test(err.message)) {$('#invite-label').hidden=false;$('#invite-label').open=true;$('#auth-invite').focus();}
  }
  finally { submit.disabled = false; }
});
$('#auth-dialog').addEventListener('close', () => { otpChallenge=''; $('#auth-code').value=''; $('#auth-password').value = ''; $('#auth-submit').hidden = false; });
for (const id of ['login','right-login']) $(`#${id}`).addEventListener('click', () => showAuth('login'));
for (const id of ['signup','right-join','hero-join']) $(`#${id}`).addEventListener('click', () => me ? compose() : showAuth('signup'));
function compose(kind = 'post') {
  if (!needAccount()) return;
  cancelUpload(); clearVideoSelection();
  $('#post-form').reset(); $('#post-kind').value = kind; updateMediaLabel(); message($('#post-message'),''); openDialog('#post-dialog');
}
function updateMediaLabel() {
  const zap = $('#post-kind').value === 'zap';
  $('#media-label').hidden=zap; $('#media-help').hidden=zap; $('#video-upload').hidden=!zap;
  $('#post-media').required=false; $('#post-video').required=zap;
  $('#post-media').placeholder='https://approved-host.example/image.jpg';
}
$('#post-kind').addEventListener('change',updateMediaLabel);
for (const id of ['launch','quick-post']) $(`#${id}`).addEventListener('click', () => compose());
$('#quick-zap').addEventListener('click', () => compose('zap'));
$('#post-form').addEventListener('submit', async e => {
  e.preventDefault(); const submit = e.target.querySelector('[type=submit]'); submit.disabled = true;
  const kind=$('#post-kind').value;
  try {
    let uploadId='';
    if(kind==='zap') {
      if(!selectedVideo) throw new Error('Choose a valid video and wait for its preview before uploading.');
      $('#post-video').disabled=true; $('#post-kind').disabled=true;
      const selection=selectedVideo;
      if(!pendingUpload) {
        message($('#post-message'),'Preparing your upload…');
        const data=await api('upload-intent',{type:selection.type,size:selection.file.size,duration:selection.duration});
        pendingUpload={...data.upload,uploaded:false};
      }
      if(!$('#post-dialog').open) { await cancelUpload(); return; }
      if(!pendingUpload.uploaded) { await uploadFile(pendingUpload.url,selection); uploadXHR=null; pendingUpload.uploaded=true; }
      uploadId=pendingUpload.id; $('#upload-status').textContent='Video uploaded. Verifying and publishing…';
    }
    const tags=$('#post-tags').value.split(',').map(x=>x.trim().toLowerCase().replace(/^#/, '')).filter(Boolean);
    await api('post',{kind,text:$('#post-text').value,media:kind==='zap'?'':$('#post-media').value.trim(),uploadId,category:kind==='zap'?$('#post-category').value:'other',tags:kind==='zap'?tags:[]});
    pendingUpload=null;
    $('#post-dialog').close(); toast('Your post has been published.'); await chooseMode(kind === 'zap' ? 'zaps' : 'latest');
  } catch (err) { message($('#post-message'),err.message); if(pendingUpload && !pendingUpload.uploaded) await cancelUpload(); }
  finally { submit.disabled = false; $('#post-video').disabled=false; $('#post-kind').disabled=false; }
});
const modeText = {
  latest:['','Your feed','The latest from your community.'],
  trending:['','Trending','The last 7 days, ranked by likes, views, comments and freshness.'],
  zaps:['','Zaps for you','Popular creators first. Your watches help shape what comes next.'],
  mine:['','Your posts','Everything you have shared.']
};
async function chooseMode(next) {
  if (next === 'mine' && !needAccount()) return;
  mode = next;
  document.querySelectorAll('[data-mode]').forEach(b => { b.classList.toggle('active',b.dataset.mode === mode); b.classList.toggle('selected',b.dataset.mode === mode); b.setAttribute('aria-pressed',String(b.dataset.mode === mode)); });
  const copy = modeText[mode]; $('#feed-kicker').textContent = copy[0]; $('#feed-title').textContent=copy[1]; $('#feed-note').textContent = copy[2];
  $('#hero').hidden = mode !== 'latest'; await loadFeed();
}
document.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => chooseMode(b.dataset.mode)));
$('#search-form').addEventListener('submit',e => { e.preventDefault(); searchTerm = $('#search').value.trim(); loadFeed(); });
$('#search').addEventListener('search', () => { if (!$('#search').value) { searchTerm=''; loadFeed(); } });
document.addEventListener('keydown',e => { if (e.key === '/' && !document.querySelector('dialog[open]') && !['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)) { e.preventDefault(); $('#search').focus(); } });
$('#refresh').addEventListener('click', () => loadFeed());
$('#load-more').addEventListener('click', () => loadFeed(true));
function emptyFeed(title, text, cta = true) {
  const box = el('div','empty'); box.append(el('div','empty-icon','＋'),el('h3','',title),el('p','',text));
  if (cta) box.append(button('Create a post','primary',() => me ? compose(mode === 'zaps' ? 'zap' : 'post') : showAuth('signup')));
  return box;
}
async function loadFeed(append = false) {
  await finishPlaybacks();
  const request = ++feedRequest; $('#load-more').hidden = true;
  if (!append) { loadedPostIds.clear(); cursor = null; viewObserver?.disconnect(); $('#feed').replaceChildren(el('div','loading','Loading posts…')); }
  $('#feed').setAttribute('aria-busy','true');
  if (!apiBase) {
    $('#setup').hidden = false;
    $('#feed').replaceChildren(emptyFeed('Your community is getting ready.','Posts will appear when the service is ready.',false));
    $('#feed').setAttribute('aria-busy','false'); return;
  }
  try {
    const data = await api('feed',{mode,search:searchTerm,cursor:append ? cursor : 0},'GET');
    if (request !== feedRequest) return;
    $('#setup').hidden = true;
    if (!append) $('#feed').replaceChildren();
    for (const p of data.posts) if(!loadedPostIds.has(p.id)) { loadedPostIds.add(p.id); $('#feed').append(renderPost(p)); }
    if(mode==='zaps' && data.recommendation) $('#feed-note').textContent=data.recommendation.phase==='personalized'?'Recommended based on your interests.':data.recommendation.phase==='popular'?'Popular creators. Personalization is off.':'Discover popular creators while your feed learns your interests.';
    if (!$('#feed').children.length) $('#feed').append(emptyFeed(searchTerm ? 'No results found' : mode === 'zaps' ? 'No Zaps yet' : 'No posts yet', searchTerm ? 'Try another word or creator name.' : 'Share a post to start the conversation.'));
    cursor = data.next; $('#load-more').hidden = cursor === null;
    observeViews();
  } catch (err) {
    if (request !== feedRequest) return;
    if (!append) {const state=emptyFeed(err.configurationIssue?'TurboShot is getting ready':'The feed is unavailable',err.message,false);state.append(button('Try again','ghost',()=>loadFeed()));$('#feed').replaceChildren(state);} else toast(err.message);
  } finally { if (request === feedRequest) $('#feed').setAttribute('aria-busy','false'); }
}
function ago(time) {
  const seconds = Math.max(0,(Date.now() - time) / 1000);
  if (seconds < 60) return 'just now'; if (seconds < 3600) return `${Math.floor(seconds/60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds/3600)}h ago`;
  return `${Math.floor(seconds/86400)}d ago`;
}
async function perform(action, input, card, onSuccess) {
  if (!needAccount()) return;
  try {
    const data = await api(action,input);
    if (data.post && card?.isConnected) {
      await finishPlaybacks(card);
      const expanded = card.querySelector('.comments')?.hidden === false;
      const replacement = renderPost(data.post);
      if (expanded) { replacement.querySelector('.comments').hidden = false; replacement.querySelector('[aria-expanded]').setAttribute('aria-expanded','true'); }
      card.replaceWith(replacement); observeViews();
    }
    if (data.message) toast(data.message);
    if(data.cleanupPending) toast('Removed from the feed. Video storage cleanup is queued for retry.');
    if (onSuccess) await onSuccess(data);
  }
  catch (err) { toast(err.message); }
}
function renderPost(p) {
  const card = el('article',`post ${p.kind === 'zap' ? 'zap' : ''}`); card.dataset.id = p.id;
  const head = el('div','post-head'), user = el('div');
  user.append(el('p','post-name',`@${p.username}`),el('span','post-time',ago(p.created)));
  head.append(el('div','avatar',p.username.slice(0,2).toUpperCase()),user);
  if (p.kind === 'zap') head.append(el('span','post-label','ZAP ϟ'));
  card.append(head,el('p','post-text',p.text));
  if(p.kind==='zap') {
    card.dataset.zap='true';
    if(p.recommendationReason) card.append(el('p','zap-reason',p.recommendationReason));
    card.append(el('p','post-category',`${p.category || 'other'}${p.tags?.length?' · '+p.tags.map(t=>'#'+t).join(' '):''}`));
  }
  if (p.media) {
    const media=el('div','post-media');
    let url; try { url=new URL(p.media); if(url.protocol!=='https:') url=null; } catch {}
    if(p.kind==='zap' && url) {
      const video=el('video'); video.controls=true; video.playsInline=true; video.preload='metadata'; video.src=url.href;
      video.setAttribute('aria-label',`Zap by @${p.username}: ${p.text}`);
      video.addEventListener('error',()=>toast('This video could not play. Try again later or report the Zap.'));
      media.append(video); trackPlayback(video,p,card);
    } else if(url) {
      const consent=el('div','media-consent');
      consent.append(el('p','','An image from this creator.'));
      consent.append(button('Load image ↗','ghost',()=>{
        const image=el('img'); image.alt='Image shared by this creator'; image.loading='lazy'; image.referrerPolicy='no-referrer'; image.src=url.href;
        image.addEventListener('error',()=>media.replaceChildren(el('p','media-consent','This image is unavailable.'))); media.replaceChildren(image);
      }));
      consent.append(el('p','fine','Loads from an external host.')); media.append(consent);
    }
    card.append(media);
  }
  const actions = el('div','post-actions');
  const like = button(`♡ ${p.likes}`,'action',() => perform('react',{id:p.id,value:p.reaction === 1 ? 0 : 1},card));
  like.setAttribute('aria-label',`${p.reaction === 1 ? 'Unlike' : 'Like'} post, ${p.likes} likes`); like.setAttribute('aria-pressed',String(p.reaction === 1)); if (p.reaction === 1) like.classList.add('reacted');
  const dislike = button(`↓ ${p.dislikes}`,'action',() => perform('react',{id:p.id,value:p.reaction === -1 ? 0 : -1},card));
  dislike.setAttribute('aria-label',`Dislike post, ${p.dislikes} dislikes`); dislike.setAttribute('aria-pressed',String(p.reaction === -1)); if (p.reaction === -1) dislike.classList.add('reacted');
  const comments = renderComments(p,card); comments.hidden = true;
  const toggle = button(`◌ ${p.commentCount}`,'action',() => { comments.hidden = !comments.hidden; toggle.setAttribute('aria-expanded',String(!comments.hidden)); }); toggle.setAttribute('aria-label',`Show ${p.commentCount} comments`); toggle.setAttribute('aria-expanded','false');
  actions.append(like,dislike,toggle,el('span','views',`◉ ${p.views} views`)); card.append(actions);
  const tools = el('div','post-tools');
  if(p.kind==='zap') {
    tools.append(button('Why this Zap?','text-button',()=>toast(p.recommendationReason || 'Zaps starts with popular creators, then learns from your watches and reactions.')));
    tools.append(button('Not interested','text-button',()=>perform('not-interested',{id:p.id},null,()=>loadFeed())));
  }
  tools.append(button('Report','text-button',() => { if (!needAccount()) return; const reason = prompt('What should the administrator review? For a comment, include the username and a short description.'); if (reason?.trim()) perform('report',{id:p.id,reason},card); }));
  if (me && p.userId !== me.id) tools.append(button('Block creator','text-button',() => { if (confirm(`Hide @${p.username} from your feed?`)) perform('block',{username:p.username},null,() => loadFeed()); }));
  if (p.canDelete) tools.append(button('Delete post','text-button',() => { if (confirm('Delete this post and its comments?')) perform('delete-post',{id:p.id},null,() => loadFeed()); }));
  card.append(tools,comments); return card;
}
function renderComments(p,card) {
  const container = el('section','comments');
  container.setAttribute('aria-label','Comments');
  if (!p.comments.length) container.append(el('p','fine','Be the first to say something kind.'));
  for (const c of p.comments) {
    const item = el('div','comment'); item.append(el('strong','',`@${c.username}`),el('p','',c.text));
    if (me && (c.userId === me.id || me.admin)) item.append(button('Delete','text-button',() => perform('delete-comment',{id:p.id,commentId:c.id},card)));
    container.append(item);
  }
  const form = el('form','comment-form'), input = el('input'); input.placeholder = 'Keep the conversation going…'; input.maxLength = 500; input.required = true; input.setAttribute('aria-label','Write a comment');
  const submit = el('button','primary','Send'); submit.type = 'submit'; form.append(input,submit);
  form.addEventListener('submit',async e => { e.preventDefault(); if (!needAccount()) return; submit.disabled = true; await perform('comment',{id:p.id,text:input.value},card); submit.disabled = false; });
  container.append(form); return container;
}
function trackPlayback(video,p,card) {
  let run=null;
  function visible() {
    const r=video.getBoundingClientRect();
    return !document.hidden && !document.querySelector('dialog[open]') && Math.max(0,Math.min(r.bottom,innerHeight)-Math.max(r.top,0))>=Math.min(r.height,innerHeight)*.5;
  }
  function tick() {
    if(!run || run.done) return;
    const current=video.currentTime,wall=performance.now(),delta=current-run.lastMedia,elapsed=(wall-run.lastWall)/1000;
    if(!video.seeking && !video.paused && visible() && delta>0 && delta<=elapsed*Math.max(1,video.playbackRate)+.6) run.seconds+=Math.min(delta,elapsed);
    run.lastMedia=current; run.lastWall=wall;
  }
  async function finish() {
    if(!run) return;
    if(run.done) return run.saving;
    tick(); const completed=run; completed.done=true;
    completed.saving=(async()=>{
      try {
        const receipt=await completed.receipt;
        if(!receipt || completed.seconds<.25) return;
        const result=await api('watch',{id:p.id,ticket:receipt.ticket,seconds:Math.min(90,completed.seconds)});
        const counter=card.querySelector('.views'); if(counter) counter.textContent=`◉ ${result.views} views`;
      } catch {} // Feedback can be lost during a network failure; it never blocks playback.
    })();
    return completed.saving;
  }
  const entry={video,card,finish}; playbacks.add(entry);
  video.addEventListener('play',()=>{
    for(const other of playbacks) if(other.video!==video) other.video.pause();
    if(me && (!run || run.done)) run={done:false,seconds:0,lastMedia:video.currentTime,lastWall:performance.now(),receipt:api('watch-start',{id:p.id},'GET').catch(()=>null)};
  });
  video.addEventListener('timeupdate',tick);
  video.addEventListener('seeking',()=>{ if(run) {run.lastMedia=video.currentTime;run.lastWall=performance.now();} });
  video.addEventListener('seeked',()=>{ if(run) {run.lastMedia=video.currentTime;run.lastWall=performance.now();} });
  video.addEventListener('pause',finish); video.addEventListener('ended',finish);
}
async function finishPlaybacks(within=null) {
  const pending=[];
  for(const entry of playbacks) if(!within || within.contains(entry.video)) {
    entry.video.pause(); pending.push(entry.finish());
    if(!entry.video.isConnected) playbacks.delete(entry);
  }
  await Promise.allSettled(pending);
}
function observeViews() {
  viewObserver?.disconnect();
  viewObserver = new IntersectionObserver(entries => {
    for (const entry of entries) {
      const card = entry.target, id = card.dataset.id;
      if (entry.intersectionRatio < .5) { clearTimeout(card.viewTimer); document.querySelectorAll('video').forEach(v => { if (card.contains(v)) v.pause(); }); continue; }
      if(card.dataset.zap==='true') continue;
      if (!me || seenThisVisit.has(id)) continue;
      clearTimeout(card.viewTimer);
      card.viewTimer = setTimeout(async () => {
        if (!card.isConnected || document.hidden || seenThisVisit.has(id)) return;
        seenThisVisit.add(id);
        try { const result = await api('view',{id}); const counter = card.querySelector('.views'); if (counter && result.post) counter.textContent = `◉ ${result.post.views} views`; }
        catch { seenThisVisit.delete(id); }
      },2000);
    }
  },{threshold:[0,.5]});
  document.querySelectorAll('.post').forEach(p => viewObserver.observe(p));
}
document.addEventListener('visibilitychange',() => { if (document.hidden) document.querySelectorAll('video').forEach(v => v.pause()); });
async function openSettings() {
  if (!needAccount()) return;
  $('#settings-user').textContent = `Signed in as @${me.username}`; $('#password-form').reset(); $('#blocked-list').replaceChildren(el('p','fine','Loading…')); openDialog('#settings-dialog');
  try {
    const data = await api('me',{},'GET'); $('#blocked-list').replaceChildren();
    $('#personalization-toggle').checked=data.recommendations?.enabled!==false;
    const watched=data.recommendations?.watched || 0;
    $('#recommendation-summary').textContent=`${watched} video${watched===1?'':'s'} in your recent watch preferences. Reset clears watches and hidden Zaps. Your explicit likes and dislikes remain.`;
    if (!data.blocked.length) $('#blocked-list').append(el('p','fine','No blocked accounts.'));
    for (const handle of data.blocked) { const row = el('div','blocked-row',`@${handle}`); row.append(button('Unblock','text-button',() => perform('block',{username:handle},null,async () => { row.remove(); await loadFeed(); }))); $('#blocked-list').append(row); }
  } catch (err) { $('#blocked-list').replaceChildren(el('p','fine',err.message)); }
}
for (const id of ['settings','account']) $(`#${id}`).addEventListener('click',openSettings);
$('#guidelines').addEventListener('click',() => openDialog('#info-dialog'));
$('#reset-recommendations').addEventListener('click',async()=>{
  await finishPlaybacks();
  await perform('reset-recommendations',{},null,async()=>{ await openSettings(); if(mode==='zaps') await loadFeed(); });
});
$('#personalization-toggle').addEventListener('change',async e=>{
  const checked=e.target.checked; e.target.disabled=true;
  await finishPlaybacks();
  await perform('set-personalization',{enabled:checked},null,async()=>{ await openSettings(); if(mode==='zaps') await loadFeed(); });
  e.target.disabled=false;
});
$('#cleanup-media').addEventListener('click',async()=>{
  const b=$('#cleanup-media');b.disabled=true;
  try {const data=await api('cleanup-media');$('#cleanup-status').textContent=data.cleanupPending?'Cleanup is queued. Check storage access and retry.':`Processed ${data.mediaCleanup?.processed || 0} cleanup job(s); ${data.mediaCleanup?.pending || 0} waiting or queued. Try again to process the next job.`;}
  catch(err){$('#cleanup-status').textContent=err.message;} finally {b.disabled=false;}
});
$('#logout').addEventListener('click',async () => { try { await api('logout'); clearSession(); $('#settings-dialog').close(); toast('You have been signed out.'); if (mode === 'mine') await chooseMode('latest'); else await loadFeed(); } catch (err) { toast(err.message); } });
$('#password-form').addEventListener('submit',async e => {
  e.preventDefault(); const submit = e.target.querySelector('button'); submit.disabled = true;
  await perform('change-password',{currentPassword:$('#current-password').value,password:$('#new-password').value},null,async () => { $('#password-form').reset(); clearSession(); $('#settings-dialog').close(); await chooseMode('latest'); }); submit.disabled = false;
});
$('#delete-account').addEventListener('click',async () => {
  if (!confirm('Permanently delete your account and active posts? Provider backups and old repository history may retain older data until their retention or cleanup period ends.')) return;
  const currentPassword = $('#current-password').value;
  if (!currentPassword) { toast('Enter your current password in the field above to confirm deletion.'); $('#current-password').focus(); return; }
  await perform('delete-account',{currentPassword},null,async () => { clearSession(); $('#settings-dialog').close(); await chooseMode('latest'); });
});
$('#moderation').addEventListener('click',async () => {
  openDialog('#reports-dialog'); $('#reports-list').replaceChildren(el('p','fine','Loading reports…'));
  try {
    const data = await api('reports',{},'GET'); $('#reports-list').replaceChildren();
    if (!data.reports.length) $('#reports-list').append(el('p','fine','All clear. No open reports.'));
    for (const r of data.reports) {
      const item = el('div','report'); item.append(el('p','',`Reason: ${r.reason}`),el('p','post-text',r.post ? `@${r.post.username}: ${r.post.text}` : 'Post already removed.'));
      if (r.post) { for (const c of r.post.comments) item.append(el('p','fine',`@${c.username}: ${c.text}`)); }
      const resolve = async (remove,ban) => { if ((remove || ban) && !confirm(ban ? 'Remove this post and ban its author?' : 'Remove this post?')) return; await perform('resolve-report',{id:r.id,remove,ban},null,async () => { item.remove(); await loadFeed(); }); };
      item.append(button('Dismiss','ghost',() => resolve(false,false)),button('Remove post','ghost',() => resolve(true,false)),button('Remove & ban author','ghost',() => resolve(true,true))); $('#reports-list').append(item);
    }
  } catch (err) { $('#reports-list').replaceChildren(el('p','fine',err.message)); }
});
async function init() {
  const hash = new URLSearchParams(location.hash.slice(1));
  const kind = hash.has('reset') ? 'reset' : hash.has('verify') ? 'verify' : '';
  if (kind) { linkTicket = hash.get(kind); history.replaceState(null,'',location.pathname + location.search); showAuth(kind); }
  if (apiBase) {
    try { const health = await api('health',{},'GET'); $('#connection').textContent = health.configured ? 'Connected' : 'Setup in progress'; $('#connection').classList.toggle('online',health.configured); }
    catch { $('#connection').textContent = 'Offline'; }
    if (session) { try { me = (await api('me',{},'GET')).user; } catch { clearSession(); } }
  }
  updateAccount(); await loadFeed();
}
init();



