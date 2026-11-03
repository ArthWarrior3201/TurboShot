/* TurboShot browser processing. Pinned single-thread ffmpeg.wasm core.
 * https://github.com/ffmpegwasm/ffmpeg.wasm (MIT wrapper; core includes
 * FFmpeg and codec libraries with their own licenses, supplied by the CDN).
 * This worker receives only the selected video, never account credentials.
 */
'use strict';
const CORE='https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd/ffmpeg-core.js';
const LIMIT=50*1024*1024;
self.onmessage=async ({data})=>{
  let core;
  try {
    const file=data.file;
    if(!file || file.size>500*1024*1024)throw Error('Choose a video up to 500 MB to process on this device.');
    postMessage({status:'Loading video processor…',progress:0});
    importScripts(CORE);
    core=await createFFmpegCore({mainScriptUrlOrBlob:CORE+'#'+btoa(JSON.stringify({wasmURL:CORE.replace(/\.js$/,'.wasm')}))});
    core.FS.writeFile('input',new Uint8Array(await file.arrayBuffer()));
    postMessage({status:'Checking video…',progress:0});
    core.setTimeout(60000);
    core.ffprobe('-v','error','-show_entries','format=duration','-of','json','-o','probe.json','input');
    core.reset();
    let probe;try{probe=JSON.parse(core.FS.readFile('probe.json',{encoding:'utf8'}));}catch{throw Error('This file could not be read. Try exporting it as an MP4.');}
    const duration=Number(probe.format?.duration);
    if(!Number.isFinite(duration) || duration<=0 || duration>345)throw Error('Zaps must be 5 minutes and 45 seconds or shorter.');
    // Avoid reducing quality when a playable file already fits the provider limit.
    if(file.size<=LIMIT && !data.force){postMessage({done:true,original:true,duration});return;}
    const budget=46*1024*1024;
    let bitrate=Math.max(64000,Math.floor(budget*8/duration)-96000);
    for(let attempt=0;attempt<2;attempt++) {
      postMessage({status:attempt?'Adjusting file size…':'Processing video…',progress:0});
      core.setProgress(({time})=>postMessage({status:'Processing video…',progress:Math.min(99,Math.max(0,time/1000000/duration*100))}));
      core.setTimeout(30*60*1000);
      core.exec('-i','input','-map','0:v:0','-map','0:a:0?','-sn','-dn','-vf',"scale=w='min(1280,iw)':h='min(720,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2",'-r','30','-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p','-b:v',String(bitrate),'-maxrate',String(bitrate),'-bufsize',String(bitrate*2),'-c:a','aac','-b:a','96k','-movflags','+faststart','-map_metadata','-1','output.mp4');
      const result=core.ret;core.reset();
      if(result!==0)throw Error('Processing could not finish on this device. Try a smaller MP4.');
      const output=core.FS.readFile('output.mp4');
      if(output.length<=LIMIT){postMessage({done:true,duration,buffer:output.buffer},[output.buffer]);return;}
      core.FS.unlink('output.mp4');bitrate=Math.floor(bitrate*.65);
    }
    throw Error('The processed video is still too large. Try a shorter video or a lower resolution.');
  } catch(error) {
    postMessage({error:error instanceof Error?error.message:'Video processing could not finish on this device.'});
  }
};
