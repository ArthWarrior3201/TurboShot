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
let toastTimer, viewObserver, otpChallenge='', circleId='', circleName='', circleCache=[], postOperation=0, profileRefreshing=false;
let selectedVideo=null,pendingUpload=null,uploadXHR=null,previewURL='',videoSelection=0;
const playbacks=new Set(),loadedPostIds=new Set();
const seenThisVisit = new Set(), liveProfiles=new Map();
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
$('#post-dialog').addEventListener('close',()=>{ postOperation++; cancelUpload(); clearVideoSelection(); });
function openDialog(id) { document.querySelectorAll('.post video').forEach(v=>v.pause()); const dialog = $(id); if (!dialog.open) dialog.showModal(); }
document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));
document.querySelectorAll('dialog').forEach(d => d.addEventListener('click', e => { if (e.target === d) { const r = d.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) d.close(); } }));
function clearSession() { session = ''; me = null; sessionStorage.removeItem('turboshot-session'); updateAccount(); }
function updateAccount() {
  $('#login').hidden = !!me; $('#signup').hidden = !!me; $('#account').hidden = !me;
  $('#moderation').hidden = !me?.admin;
  paintAvatar($('#account'),me);
  paintAvatar($('#composer-avatar'),me);
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
  $('#auth-password').setCustomValidity(''); hidePassword();
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
  $('#forgot').hidden = !login; $('#resend').hidden = !code;
  $('#resend').textContent='Resend verification code';
  message($('#auth-message'),'');
  openDialog('#auth-dialog');
}
function hidePassword() {
  $('#auth-password').type='password'; $('#password-toggle').textContent='Show';
  $('#password-toggle').setAttribute('aria-label','Show password'); $('#password-toggle').setAttribute('aria-pressed','false');
}
$('#password-toggle').addEventListener('click',()=>{
  const show=$('#auth-password').type==='password'; $('#auth-password').type=show?'text':'password';
  $('#password-toggle').textContent=show?'Hide':'Show'; $('#password-toggle').setAttribute('aria-label',show?'Hide password':'Show password'); $('#password-toggle').setAttribute('aria-pressed',String(show));
});
$('#auth-switch').addEventListener('click', () => showAuth(authMode === 'login' ? 'signup' : 'login'));
$('#forgot').addEventListener('click', () => showAuth('request-reset'));
$('#resend').addEventListener('click', async () => {
  if(authMode!=='verify-otp' || !otpChallenge) return;
  const button=$('#resend'); button.disabled=true;
  try { const data=await api('resend-otp',{challenge:otpChallenge}); otpChallenge=data.challenge; $('#auth-code').value=''; $('#auth-code').removeAttribute('aria-invalid'); message($('#auth-message'),data.message,true); }
  catch(error) {message($('#auth-message'),error.message);}
  finally {button.disabled=false;}
});
$('#auth-form').addEventListener('invalid',e=>{e.target.setAttribute('aria-invalid','true');if(e.target.id==='auth-password' && e.target.validity.tooShort)e.target.setCustomValidity('Use at least 12 characters for your password.');},true);
$('#auth-form').addEventListener('input',e=>{e.target.removeAttribute('aria-invalid');e.target.setCustomValidity('');});
$('#auth-form').addEventListener('submit', async e => {
  e.preventDefault(); const submit = $('#auth-submit'); submit.disabled = true; message($('#auth-message'),''); submit.setAttribute('aria-busy','true'); hidePassword();
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
  finally { submit.disabled = false; submit.removeAttribute('aria-busy'); }
});
$('#auth-dialog').addEventListener('close', () => { otpChallenge=''; $('#auth-code').value=''; $('#auth-password').value = ''; hidePassword(); $('#auth-submit').hidden = false; });
for (const id of ['login','right-login']) $(`#${id}`).addEventListener('click', () => showAuth('login'));
for (const id of ['signup','right-join','hero-join']) $(`#${id}`).addEventListener('click', () => me ? compose() : showAuth('signup'));
function compose(kind = 'post') {
  if (!needAccount()) return;
  cancelUpload(); clearVideoSelection();
  $('#post-form').reset(); refreshCircleOptions(); $('#post-kind').value = kind; updateMediaLabel(); message($('#post-message'),''); openDialog('#post-dialog');
}
function updateMediaLabel() {
  const zap = $('#post-kind').value === 'zap';
  $('#media-label').hidden=zap; $('#media-help').hidden=zap; $('#video-upload').hidden=!zap;
  $('#post-media').required=false; $('#post-video').required=zap;

}
$('#post-kind').addEventListener('change',updateMediaLabel);
for (const id of ['launch','quick-post']) $(`#${id}`).addEventListener('click', () => compose());
$('#quick-zap').addEventListener('click', () => compose('zap'));
$('#post-form').addEventListener('submit', async e => {
  e.preventDefault(); const submit = e.target.querySelector('[type=submit]'); submit.disabled = true; submit.textContent='Publishing…';
  const kind=$('#post-kind').value, operation=postOperation; let imageUploadId='';
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
    if(kind!=='zap' && $('#post-media').files[0]) {imageUploadId=await uploadImage($('#post-media').files[0],'image');uploadId=imageUploadId;}
    if(!$('#post-dialog').open || operation!==postOperation) {if(imageUploadId)await api('cancel-upload',{uploadId:imageUploadId});return;}
    const tags=$('#post-tags').value.split(',').map(x=>x.trim().toLowerCase().replace(/^#/, '')).filter(Boolean);
    const published=await api('post',{circleId:$('#post-circle').value,kind,text:$('#post-text').value,media:'',uploadId,category:kind==='zap'?$('#post-category').value:'other',tags:kind==='zap'?tags:[]});
    pendingUpload=null;
    $('#post-dialog').close(); toast('Your post has been published.');
    if(mode==='latest' && !searchTerm && (published.post.circleId || '')===circleId) {$('#feed .empty')?.remove();$('#feed').prepend(renderPost(published.post));loadedPostIds.add(published.post.id);observeViews();}
    else await chooseMode(kind === 'zap' ? 'zaps' : 'latest');
  } catch (err) { message($('#post-message'),err.message); if(imageUploadId)try{await api('cancel-upload',{uploadId:imageUploadId});}catch{} if(pendingUpload && !pendingUpload.uploaded) await cancelUpload(); }
  finally { submit.disabled = false; submit.textContent='Publish'; $('#post-video').disabled=false; $('#post-kind').disabled=false; }
});
const modeText = {
  latest:['','Your feed','The latest from your community.'],
  trending:['','Trending','The last 7 days, ranked by likes, views, comments and freshness.'],
  zaps:['','Zaps for you','Popular creators first. Your watches help shape what comes next.'],
  mine:['','Your posts','Everything you have shared.']
};
async function chooseMode(next, keepCircle = false) {
  if(!keepCircle) {circleId='';circleName='';}
  window.TurboShotUpdates?.safePoint?.();
  if (next === 'mine' && !needAccount()) return;
  mode = next;
  document.querySelectorAll('[data-mode]').forEach(b => { b.classList.toggle('active',b.dataset.mode === mode); b.classList.toggle('selected',b.dataset.mode === mode); b.setAttribute('aria-pressed',String(b.dataset.mode === mode)); });
  const copy = modeText[mode]; $('#feed-kicker').textContent = copy[0]; $('#feed-title').textContent=circleName || copy[1]; $('#feed-note').textContent = copy[2];
  $('#hero').hidden = mode !== 'latest' || !!circleId; await loadFeed();
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
    const data = await api('feed',{mode,circleId,search:searchTerm,cursor:append ? cursor : 0},'GET');
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
  const avatar=el('div','avatar'); paintAvatar(avatar,{id:p.userId,username:p.username,avatar:p.avatar}); head.append(avatar,user);
  if (p.kind === 'zap') head.append(el('span','post-label','ZAP ϟ'));
  card.append(head,el('p','post-text',p.text));
  if(p.circleName) card.append(el('p','circle-badge',`◎ ${p.circleName}`));
  card.append(button('Open post','text-button post-open',()=>{const reader=$('#reader-content');reader.replaceChildren(renderPost(p));reader.querySelector('.post-open')?.remove();openDialog('#reader-dialog');}));
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
    } else if(url && p.uploaded) {
      const image=el('img');image.alt=p.text || 'Image shared by this creator';image.loading='lazy';image.decoding='async';image.src=url.href;media.append(image);
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
    const item = el('div','comment'); const header=el('div','comment-author'),avatar=el('div','avatar');paintAvatar(avatar,{id:c.userId,username:c.username,avatar:c.avatar});header.append(avatar,el('strong','',`@${c.username}`));item.append(header,el('p','',c.text));
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
  $('#settings-user').textContent = `Signed in as @${me.username}`; paintAvatar($('#profile-avatar'),me); message($('#profile-message'),''); $('#password-form').reset(); $('#blocked-list').replaceChildren(el('p','fine','Loading…')); openDialog('#settings-dialog');
  try {
    const data = await api('me',{},'GET'); me=data.user; updateAccount();paintAvatar($('#profile-avatar'),me); $('#blocked-list').replaceChildren();
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
function paintAvatar(node,user) {
  user=liveProfiles.get(user?.id) || user;
  const letter=Array.from((user?.username || 'T').trim())[0]?.toUpperCase() || 'T';
  let src=''; try {const url=new URL(user?.avatar);if(url.protocol==='https:')src=url.href;} catch {}
  node.dataset.userId=user?.id || '';node.dataset.username=user?.username || '';
  if(node.dataset.avatar===src && node.dataset.letter===letter) return;
  node.dataset.avatar=src;node.dataset.letter=letter;node.textContent=letter;
  if(src) {const image=el('img');image.alt=`${user.username}'s profile picture`;image.src=src;image.decoding='async';image.addEventListener('error',()=>{node.textContent=letter;node.dataset.avatar='';});node.replaceChildren(image);}
}
function applyProfiles(profiles) {
  const byId=new Map(profiles.map(p=>[p.id,p]));for(const profile of profiles)liveProfiles.set(profile.id,profile);
  document.querySelectorAll('.avatar[data-user-id]').forEach(node=>{const user=byId.get(node.dataset.userId);if(user)paintAvatar(node,user);});
  if(me && byId.has(me.id)) {me={...me,...byId.get(me.id)};updateAccount();}
}
async function refreshProfiles() {
  if(!apiBase || profileRefreshing || document.hidden || navigator.onLine===false || document.querySelector('#post-dialog[open]') || !document.querySelector('.post'))return;
  profileRefreshing=true;
  try {applyProfiles((await api('profiles',{},'GET')).profiles);} catch {} finally {profileRefreshing=false;}
}
setInterval(refreshProfiles,15000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshProfiles();});
async function prepareImage(file,purpose) {
  if(!file || file.size>20*1024*1024 || !['image/jpeg','image/png','image/webp'].includes(file.type)) throw new Error('Choose a JPG, PNG or WebP image up to 20 MB.');
  const image=new Image(),url=URL.createObjectURL(file);
  try {
    await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(new Error('This image could not be opened. Try a JPG, PNG or WebP.'));image.src=url;});
    if(!image.naturalWidth || image.naturalWidth*image.naturalHeight>40000000)throw new Error('This image is too large. Please choose a smaller one.');
    const side=purpose==='avatar'?512:1600,scale=Math.min(1,side/Math.max(image.naturalWidth,image.naturalHeight));
    const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.84));
    if(!blob || blob.size>(purpose==='avatar'?1024*1024:3*1024*1024))throw new Error('Please choose a smaller image.');
    return blob;
  } finally {URL.revokeObjectURL(url);}
}
async function uploadImage(file,purpose) {
  const blob=await prepareImage(file,purpose);
  const data=await api('upload-intent',{purpose,type:blob.type,size:blob.size});
  try {const response=await fetch(data.upload.url,{method:'PUT',headers:{'Content-Type':blob.type},body:blob,credentials:'omit',signal:AbortSignal.timeout(90000)});if(!response.ok)throw new Error('The image could not be uploaded. Please try again.');return data.upload.id;}
  catch(error) {try {await api('cancel-upload',{uploadId:data.upload.id});}catch {}throw error;}
}
$('#avatar-file').addEventListener('change',async()=>{
  const input=$('#avatar-file'),file=input.files[0];if(!file || !me)return;input.disabled=true;$('#remove-avatar').disabled=true;message($('#profile-message'),'Uploading picture…');let uploadId='';
  try {uploadId=await uploadImage(file,'avatar');const data=await api('update-avatar',{uploadId});me=data.user;applyProfiles([me]);paintAvatar($('#profile-avatar'),me);message($('#profile-message'),'Profile picture updated.',true);}
  catch(error) {message($('#profile-message'),error.message);if(uploadId)try{await api('cancel-upload',{uploadId});}catch{}}
  finally {input.disabled=false;input.value='';$('#remove-avatar').disabled=false;}
});
$('#remove-avatar').addEventListener('click',async()=>{
  const button=$('#remove-avatar');button.disabled=true;
  try {const data=await api('update-avatar',{remove:true});me=data.user;applyProfiles([me]);paintAvatar($('#profile-avatar'),me);message($('#profile-message'),'Profile picture removed.',true);}catch(error){message($('#profile-message'),error.message);}finally{button.disabled=false;}
});
async function refreshCircleOptions() {
  const initial=$('#post-circle');initial.replaceChildren();const homeChoice=el('option','','Home feed');homeChoice.value='';initial.append(homeChoice);
  if(circleId){const choice=el('option','',circleName);choice.value=circleId;initial.append(choice);initial.value=circleId;}
  try {circleCache=(await api('circles',{},'GET')).circles;}catch{}
  const select=$('#post-circle');select.replaceChildren();const home=el('option','','Home feed');home.value='';select.append(home);
  for(const circle of circleCache.filter(c=>c.joined)){const option=el('option','',circle.name);option.value=circle.id;select.append(option);}
  select.value=circleId;
}
async function showCircles() {
  openDialog('#circles-dialog');$('#circles-list').replaceChildren(el('p','','Loading Circles…'));
  try {circleCache=(await api('circles',{},'GET')).circles;$('#circles-list').replaceChildren();
    if(!circleCache.length)$('#circles-list').append(el('p','','Be the first to create a Circle.'));
    for(const circle of circleCache){const row=el('div','circle-item');row.append(el('h3','',circle.name),el('p','',circle.description),el('small','',`${circle.members} member${circle.members===1?'':'s'}`));
      row.append(button('Open Circle','ghost',()=>{circleId=circle.id;circleName=circle.name;$('#circles-dialog').close();chooseMode('latest',true);}));
      row.append(button(circle.joined?'Leave':'Join','text-button',async()=>{if(!needAccount())return;try{await api('join-circle',{id:circle.id,leave:circle.joined});await showCircles();}catch(error){toast(error.message);}}));$('#circles-list').append(row);
    }
  }catch(error){$('#circles-list').replaceChildren(el('p','',error.message));}
}
$('#circles-button').addEventListener('click',()=>{window.TurboShotUpdates?.safePoint?.();showCircles();});
$('#circle-form').addEventListener('submit',async event=>{
  event.preventDefault();if(!needAccount())return;const submit=event.target.querySelector('[type=submit]');submit.disabled=true;submit.textContent='Creating…';
  try {const data=await api('create-circle',{name:$('#circle-name').value,description:$('#circle-description').value});event.target.reset();await showCircles();message($('#circle-message'),`Your Circle, ${data.circle.name}, is ready.`,true);}catch(error){message($('#circle-message'),error.message);}finally{submit.disabled=false;submit.textContent='Create Circle';}
});
async function init() {
  const hash = new URLSearchParams(location.hash.slice(1));
  const kind = hash.has('reset') ? 'reset' : hash.has('verify') ? 'verify' : '';
  if (kind) { linkTicket = hash.get(kind); history.replaceState(null,'',location.pathname + location.search); showAuth(kind); }
  if (apiBase) {
    if (session) { try { me = (await api('me',{},'GET')).user; } catch { clearSession(); } }
  }
  updateAccount(); await loadFeed();
}
init();




