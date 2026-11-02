/* Stable bootstrap: always check deployment files before starting the app. */
(() => {
  'use strict';
  if(window.TurboShotUpdates) return;
  const base=new URL('./',document.currentScript.src);
  const names=['index.html','config.js','styles.css','app.js'];
  let loadedSignature='',pendingSignature='',checking=false,booted=false,notice=null;
  function fingerprint(value) {
    // A cache identity, not an authentication or security hash.
    let a=2166136261,b=5381;
    for(let i=0;i<value.length;i++) {a=Math.imul(a^value.charCodeAt(i),16777619);b=Math.imul(b,33)^value.charCodeAt(i);}
    return (a>>>0).toString(36)+(b>>>0).toString(36)+'-'+value.length;
  }
  async function snapshot() {
    const nonce=Date.now().toString(36);
    const files=await Promise.all(names.map(async name=>{
      const url=new URL(name,base);url.searchParams.set('_fresh',nonce);
      const response=await fetch(url,{cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(15000)});
      if(!response.ok) throw new Error('The latest site files could not be loaded.');
      const content=await response.text();
      return {name,version:fingerprint(content),content};
    }));
    return {files,signature:fingerprint(files.map(f=>f.name+':'+f.version).join('|'))};
  }
  function loadAsset(file) {
    return new Promise((resolve,reject)=>{
      const style=file.name.endsWith('.css');
      const node=style?(document.getElementById('app-styles') || document.createElement('link')):document.createElement('script');
      const url=new URL(file.name,base);url.searchParams.set('build',file.version);
      node.onload=()=>resolve();node.onerror=()=>reject(new Error('An application file could not be loaded.'));
      if(style) {node.id='app-styles';node.rel='stylesheet';node.href=url.href;}
      else {node.async=false;node.src=url.href;}
      if(!node.isConnected) document.head.append(node);
    });
  }
  function busy() {
    const active=document.activeElement;
    return !!document.querySelector('dialog[open]') ||
      !!(active && ['INPUT','TEXTAREA','SELECT'].includes(active.tagName)) ||
      !!document.querySelector('button[type="submit"][disabled]') ||
      !!document.querySelector('input[type="file"][disabled]') ||
      !!document.querySelector('.comments:not([hidden])') ||
      !!(window.getSelection && String(window.getSelection()).length) ||
      Array.from(document.querySelectorAll('video')).some(video=>!video.paused && !video.ended);
  }
  function reloadLatest() {
    const url=new URL(location.href);url.searchParams.set('_ts',pendingSignature || Date.now().toString(36));
    location.replace(url.href);
  }
  function offerUpdate() {
    if(!pendingSignature) return;
    if(notice) return;
    notice=document.createElement('div');notice.className='update-notice';notice.setAttribute('role','status');
    const text=document.createElement('span');text.textContent='An update is ready. It will load when you switch feeds.';
    const button=document.createElement('button');button.type='button';button.textContent='Update now';button.addEventListener('click',()=>{if(!busy())reloadLatest();});
    notice.append(text,button);document.body.append(notice);
  }
  async function check() {
    if(!booted || checking || navigator.onLine===false) return;
    checking=true;
    try {const latest=await snapshot();if(latest.signature!==loadedSignature) {pendingSignature=latest.signature;offerUpdate();}}
    catch {} // A temporary network failure must not interrupt the working page.
    finally {checking=false;}
  }
  async function start() {
    try {
      const latest=await snapshot();
      // A changed HTML shell must load before scripts that depend on its elements.
      const html=latest.files.find(f=>f.name==='index.html').content;
      const remoteShell=/data-shell="([^"]+)"/.exec(html)?.[1];
      if(remoteShell && remoteShell!==document.documentElement.dataset.shell) {pendingSignature=latest.signature;reloadLatest();return;}
      await Promise.all(['styles.css','config.js'].map(name=>loadAsset(latest.files.find(f=>f.name===name))));
      await loadAsset(latest.files.find(f=>f.name==='app.js'));
      loadedSignature=latest.signature;booted=true;
    } catch(error) {
      console.warn('TurboShot could not start:',error.message);
      const feed=document.getElementById('feed');
      if(feed) {
        const error=document.createElement('p');error.className='loader-failure';error.textContent='Unable to load TurboShot. Check your connection and reload this page.';feed.replaceChildren(error);
      }
    }
  }
  window.TurboShotUpdates=Object.freeze({check,safePoint:()=>{if(pendingSignature && !busy())reloadLatest();}});
  window.addEventListener('online',check);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)check();});
  setInterval(check,60000);
  setInterval(()=>{if(pendingSignature)offerUpdate();},5000);
  start();
})();

