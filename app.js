import { BackgroundTracker } from './tracking-client.js';
import { AudioEngine, exportVideo } from './media.js';
import { EffectRenderer, PRESETS, EFFECT_KEYS, clamp } from './effects.js';
import { analyzeTracking, cachedFrame, seekFrame } from './analysis-cache.js';

const $ = id => document.getElementById(id);
const video = $('video'), canvas = $('output'), ctx = canvas.getContext('2d', {alpha:false});
export const settings = {preset:'sequence',intensity:65,color:'#ff6b16',face:true,hands:true,audio:true,original:false,text:'МЫ СДЕЛАЕМ ЭТО'};
export const audio = new AudioEngine(video);
export const renderer = new EffectRenderer();
try{renderer.setVariant(Number(localStorage.getItem('soylok.astra.composition')));}catch{}
let ready=false, loading=false, trackerBusy=false, exporting=false, exportController=null, mediaUrl='', downloadUrl='', loadTimer, toastTimer, lastUi=0;
let metrics={level:0,bass:0,mid:0,high:0,peak:0};
let trackingCache=null,replayTracking=false;
export const tracker = new BackgroundTracker({onStatus: showTrackingStatus});

function clock(seconds, tenths=false){const n=Math.max(0,Number.isFinite(seconds)?seconds:0);return `${String(Math.floor(n/60)).padStart(2,'0')}:${String(Math.floor(n%60)).padStart(2,'0')}${tenths?'.'+Math.floor(n%1*10):''}`;}
function toast(message){clearTimeout(toastTimer);$('toast').textContent=message;$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,6000);}
function updatePlayback(){
  const paused=video.paused || video.ended;
  $('playButton').textContent=paused?'▶':'Ⅱ';$('playButton').setAttribute('aria-label',paused?'Воспроизвести':'Пауза');
  $('playButton').disabled=!ready || exporting;$('restartButton').disabled=!ready || exporting;
  $('centerPlay').hidden=!ready || !paused || exporting;
}
async function togglePlayback(){
  if(exporting)return;
  if(!ready){toast(loading?'Видео ещё открывается.':'Сначала открой видеофайл.');return;}
  if(!video.paused){video.pause();return;}
  try{
    // Start the media element directly inside the click gesture. Model loading
    // is independent and never delays the user's Play action.
    video.muted=false;
    const playPromise=video.play();
    const audioPromise=audio.init().catch(error=>{toast(error.message);});
    await playPromise;await audioPromise;
  }catch(error){toast(`Не удалось воспроизвести видео: ${error.message}`);}
  updatePlayback();
}
function showTrackingStatus(state){
  if(!$('trackingStatus'))return;
  const enabled=settings.face||settings.hands;
  const labels={idle:'Ожидание',loading:'Загрузка',ready:'Готов',tracking:'В кадре',searching:'Поиск',waiting:'Ожидание видео',partial:'Частично',error:'Ошибка',disposed:'Выключен'};
  const status=$('trackingStatus');status.textContent=enabled?(labels[state.status]||state.status):'Выключен';
  status.className='status-badge'+(enabled&&state.status==='tracking'?' ready':'')+(state.error?' error':'');
  const faces=settings.face?state.faces.length:0,hands=settings.hands?state.hands.length:0;
  $('faceCount').textContent=faces;$('handCount').textContent=hands;
  $('faceDot').classList.toggle('detected',faces>0);$('handDot').classList.toggle('detected',hands>0);
  $('retryTracking').hidden=!state.error;
  $('trackingDetail').textContent=!enabled?'Трекинг выключен.':state.error?'Не удалось запустить часть распознавания. Нажми «Повторить».':state.status==='loading'?'Подготавливаю модели распознавания…':faces||hands?'Элементы привязаны к распознанным точкам.':'Элементы появятся, когда лицо или руки будут видны в кадре.';
  $('trackingDetail').title=state.error||'';
}
function fitStage(){
  const well=$('dropZone'),ratio=video.videoWidth/video.videoHeight || 16/9;
  well.style.setProperty('--source-ratio',String(ratio));
  const width=Math.min(well.clientWidth,well.clientHeight*ratio);
  $('stage').style.width=`${width}px`;$('stage').style.height=`${width/ratio}px`;$('stage').style.aspectRatio=String(ratio);
}
function resizeOutput(){
  if(!video.videoWidth)return;
  const size=$('exportSize').value,max=size==='source'?Infinity:Number(size)*16/9;
  const scale=Math.min(1,max/Math.max(video.videoWidth,video.videoHeight));
  canvas.width=Math.max(2,Math.round(video.videoWidth*scale/2)*2);canvas.height=Math.max(2,Math.round(video.videoHeight*scale/2)*2);
  $('frameInfo').textContent=`${canvas.width} × ${canvas.height} · до 30 FPS`;
  fitStage();render();
}
function updateTimeline(){
  const duration=video.duration||0;$('duration').textContent=clock(duration,true);
  $('timelineRuler').replaceChildren(...Array.from({length:6},(_,i)=>{const el=document.createElement('span');el.textContent=clock(duration*i/5);return el;}));
  const scenes=settings.preset==='sequence'?renderer.timeline(duration):[{preset:settings.preset,start:0,end:duration||1,index:0}];
  $('clipStrip').classList.toggle('auto-timeline',settings.preset==='sequence');
  $('clipStrip').replaceChildren(...scenes.map((scene,i)=>{const el=document.createElement('span');el.textContent=settings.preset==='sequence'?String(i+1).padStart(2,'0'):PRESETS[scene.preset].code;el.style.flex=String(scene.end-scene.start);el.title=`${clock(scene.start)} — ${PRESETS[scene.preset].name}`;return el;}));
  $('timelineLabel').textContent=settings.preset==='sequence'?`Автомонтаж · ${scenes.length} сцен`:PRESETS[settings.preset].name;
}
function activeLabel(){
  const scene=renderer.activeScene(settings,video.currentTime,video.duration);
  return settings.preset==='sequence'?`АВТО · ${String(scene.index+1).padStart(2,'0')}/${renderer.timeline(video.duration).length} · ${PRESETS[scene.preset].code}`:`${PRESETS[scene.preset].code} / ${String(renderer.variant).padStart(2,'0')}`;
}
function buildLibrary(){
  $('effectLibrary').replaceChildren(...EFFECT_KEYS.map(key=>{
    const preset=PRESETS[key],button=document.createElement('button');button.className='preset';button.dataset.preset=key;button.dataset.group=preset.group;button.setAttribute('aria-pressed','false');
    const preview=document.createElement('canvas');preview.className='preset-art';preview.width=256;preview.height=144;preview.setAttribute('aria-hidden','true');
    const name=document.createElement('span');name.className='preset-name';name.textContent=preset.name;
    const number=document.createElement('span');number.textContent=String(preset.index).padStart(2,'0');name.append(number);button.append(preview,name);return button;
  }));
}
function paintPreviews(){
  if(video.readyState<2)return;
  for(const key of EFFECT_KEYS){const preview=document.querySelector(`[data-preset="${key}"] canvas`);if(preview)renderer.draw(preview.getContext('2d'),video,{...settings,preset:key,original:false,intensity:65},tracker.state,{level:.25,bass:.3,mid:.2,high:.1,peak:0},{time:1.8});}
}
function loadSource(source,name){
  if(exporting)return;
  video.pause();ready=false;loading=true;tracker.reset();audio.reset();
  trackingCache=null;
  clearTimeout(loadTimer);$('mediaLoader').hidden=false;$('emptyState').hidden=true;$('centerPlay').hidden=true;
  $('previewTag').hidden=true;$('fileName').textContent=name;$('fileName').title=name;$('exportButton').disabled=true;
  $('currentTime').textContent='00:00.0';$('duration').textContent='00:00.0';$('sourceInfo').textContent='—';
  video.src=source;video.load();updatePlayback();
  loadTimer=setTimeout(()=>mediaFailure('Видео не загрузилось. Попробуй открыть его через «Открыть видео».'),25000);
}
function mediaFailure(message){
  ready=false;loading=false;clearTimeout(loadTimer);$('mediaLoader').hidden=true;$('emptyState').hidden=false;
  $('previewTag').hidden=true;$('exportButton').disabled=true;updatePlayback();toast(message);
}
function openFile(file){
  if(!file || exporting)return;
  if(!file.type.startsWith('video/')&&!/\.(mp4|webm|mov|m4v|ogv)$/i.test(file.name)){toast('Выбери видеофайл MP4, MOV или WebM.');return;}
  const previous=mediaUrl;mediaUrl=URL.createObjectURL(file);loadSource(mediaUrl,file.name);
  if(previous)URL.revokeObjectURL(previous);
}
video.addEventListener('loadeddata',()=>{
  clearTimeout(loadTimer);loading=false;ready=true;$('mediaLoader').hidden=true;$('emptyState').hidden=true;$('previewTag').hidden=false;
  $('sourceInfo').textContent=`${video.videoWidth} × ${video.videoHeight}`;$('exportButton').disabled=false;
  resizeOutput();updateTimeline();updatePlayback();
  paintPreviews();
});
video.addEventListener('error',()=>mediaFailure('Не удалось открыть видео. Выбери другой файл или MP4 с кодеком H.264.'));
video.addEventListener('play',updatePlayback);video.addEventListener('pause',updatePlayback);video.addEventListener('ended',updatePlayback);
video.addEventListener('seeking',()=>{tracker.reset();audio.reset();});
video.addEventListener('seeked',()=>{tracker.reset();render();});
video.addEventListener('durationchange',()=>{if(Number.isFinite(video.duration))updateTimeline();});

export function render(now=performance.now()){
  if(ready){
    if((settings.face||settings.hands)&&!trackerBusy&&!replayTracking){
      trackerBusy=true;
      tracker.update(video,now).catch(error=>{console.error('Tracking:',error);}).finally(()=>{trackerBusy=false;});
    }
    metrics=audio.sample();renderer.draw(ctx,video,settings,replayTracking&&trackingCache?cachedFrame(trackingCache,video.currentTime):tracker.state,metrics);
  }
  if(now-lastUi>80){
    lastUi=now;$('currentTime').textContent=clock(video.currentTime,true);
    const progress=clamp(video.currentTime/(video.duration||1),0,1);$('seek').value=String(progress*1000);$('timelineProgress').style.width=`${progress*100}%`;
    $('activePreset').textContent=activeLabel();
    if(settings.preset==='sequence'){const index=renderer.activeScene(settings,video.currentTime,video.duration).index;[...$('clipStrip').children].forEach((el,i)=>el.classList.toggle('active',i===index));}
    const bands=[metrics.bass,metrics.mid,metrics.high];
    [...$('audioMeter').children].forEach((el,i)=>el.style.height=`${3+bands[i%3]*(8+(i%5)*3)}px`);
    $('audioMeter').classList.toggle('active',metrics.level>.001&&settings.audio);
    $('audioStatus').textContent=!settings.audio?'Выключено':video.paused?'Нажми ▶':metrics.level>.001?'Есть сигнал':'Тишина';
  }
}
function frame(now){try{render(now);}catch(error){console.error('Render:',error);}requestAnimationFrame(frame);}
function selectPreset(preset){
  settings.preset=preset;
  document.querySelectorAll('[data-preset]').forEach(button=>{const selected=button.dataset.preset===preset;button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',String(selected));});
  $('presetDescription').textContent=PRESETS[preset].description;$('textSetting').hidden=preset!=='sequence'&&PRESETS[preset].group!=='type'&&PRESETS[preset].group!=='layout';
  $('intensity').closest('.control-section').hidden=false;
  $('activePreset').textContent=activeLabel();
  updateTimeline();render();
}
$('presets').addEventListener('click',event=>{const button=event.target.closest('[data-preset]');if(button)selectPreset(button.dataset.preset);});
function updateCompositionControls(){
  $('variantNumber').textContent=String(renderer.variant).padStart(2,'0');
  $('previousComposition').disabled=renderer.variant<=1;
}
function changeComposition(variant){
  if(exporting)return;
  renderer.setVariant(variant);
  try{localStorage.setItem('soylok.astra.composition',String(renderer.variant));}catch{}
  // A new design should be visible even if source comparison was left on.
  settings.original=false;$('compareButton').setAttribute('aria-pressed','false');$('originalTag').hidden=true;
  updateCompositionControls();updateTimeline();paintPreviews();render();
  $('activePreset').textContent=activeLabel();
}
$('variationButton').addEventListener('click',()=>changeComposition(renderer.variant+1));
$('previousComposition').addEventListener('click',()=>changeComposition(Math.max(1,renderer.variant-1)));
$('intensity').addEventListener('input',event=>{settings.intensity=Number(event.target.value);$('intensityValue').textContent=`${settings.intensity}%`;event.target.style.background=`linear-gradient(to right,var(--accent) ${settings.intensity}%,#4b4f3f ${settings.intensity}%)`;render();});
function setColor(color){settings.color=color;document.querySelectorAll('[data-color]').forEach(el=>{const selected=el.dataset.color===color;el.classList.toggle('selected',selected);el.setAttribute('aria-pressed',String(selected));});$('customColor').value=color;paintPreviews();render();}
document.querySelectorAll('[data-color]').forEach(el=>el.addEventListener('click',()=>setColor(el.dataset.color)));
$('customColor').addEventListener('input',event=>setColor(event.target.value));
$('titleText').addEventListener('input',event=>{settings.text=event.target.value;render();});
$('titleText').addEventListener('change',paintPreviews);
$('effectGroup').addEventListener('change',event=>{document.querySelectorAll('#effectLibrary .preset').forEach(button=>button.hidden=event.target.value!=='all'&&button.dataset.group!==event.target.value);$('effectLibrary').scrollTop=0;});
for(const [id,key] of [['faceToggle','face'],['handToggle','hands'],['audioToggle','audio']])$(id).addEventListener('change',event=>{settings[key]=event.target.checked;if(key!=='audio'){tracker.reset();showTrackingStatus(tracker.state);}render();});
$('retryTracking').addEventListener('click',()=>{tracker.init();});
$('playButton').addEventListener('click',togglePlayback);$('centerPlay').addEventListener('click',togglePlayback);
$('restartButton').addEventListener('click',()=>{video.currentTime=0;});
$('seek').addEventListener('input',event=>{if(ready&&!exporting)video.currentTime=Number(event.target.value)/1000*video.duration;});
$('muteButton').addEventListener('click',()=>{audio.setVolume(audio.volume?0:1);$('muteButton').textContent=audio.volume?'Звук вкл.':'Без звука';$('muteButton').setAttribute('aria-pressed',String(!audio.volume));video.muted=!audio.context&&!audio.volume;});
function compare(){settings.original=!settings.original;$('compareButton').setAttribute('aria-pressed',String(settings.original));$('originalTag').hidden=!settings.original;render();}
$('compareButton').addEventListener('click',compare);
$('fullscreenButton').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $('stage').requestFullscreen();}catch{toast('Полный экран недоступен в этом браузере.');}});
document.addEventListener('fullscreenchange',()=>{if(!document.fullscreenElement)fitStage();});
$('exportSize').addEventListener('change',resizeOutput);
const picker=()=>$('videoFile').click();$('importButton').addEventListener('click',picker);$('emptyImport').addEventListener('click',picker);
$('videoFile').addEventListener('change',event=>{openFile(event.target.files[0]);event.target.value='';});
let dragDepth=0;
document.addEventListener('dragover',event=>{event.preventDefault();});
document.addEventListener('drop',event=>{event.preventDefault();dragDepth=0;$('dropHint').hidden=true;openFile(event.dataTransfer?.files[0]);});
$('dropZone').addEventListener('dragenter',event=>{event.preventDefault();dragDepth++;$('dropHint').hidden=false;});
$('dropZone').addEventListener('dragleave',()=>{dragDepth=Math.max(0,dragDepth-1);if(!dragDepth)$('dropHint').hidden=true;});
document.addEventListener('keydown',event=>{
  if(exporting||$('exportDialog').open||event.target.closest('input,select,textarea,button,a'))return;
  if(event.code==='Space'){event.preventDefault();togglePlayback();}
  else if(event.key.toLowerCase()==='o')compare();
  else if(ready&&['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();video.currentTime=clamp(video.currentTime+(event.key==='ArrowLeft'?-1:1),0,video.duration);}
});
$('audioMeter').replaceChildren(...Array.from({length:21},()=>document.createElement('i')));

async function startExport(){
  if(!ready||exporting)return;
  exporting=true;exportController=new AbortController();const wasOriginal=settings.original;settings.original=false;
  const savedTime=video.currentTime,savedPaused=video.paused;
  let completed=false,cancelled=false;
  $('exportTitle').textContent='Собираю твой клип';$('exportDetail').textContent='Видео записывается со звуком и всеми эффектами. Оставь эту вкладку открытой.';
  $('exportProgress').value=0;$('exportPercent').textContent='0%';$('exportTime').textContent=`00:00 / ${clock(video.duration)}`;
  $('downloadExport').hidden=true;$('cancelExport').textContent='Отменить';$('exportDialog').showModal();
  $('importButton').disabled=true;$('exportButton').disabled=true;$('seek').disabled=true;updatePlayback();
  try{
    await audio.init();
    if((settings.face||settings.hands)&&!trackingCache){
      $('exportTitle').textContent='Анализирую движение';$('exportDetail').textContent='Сначала распознаю лицо и руки по всему ролику. Затем сохраню видео с плавной графикой.';
      trackingCache=await analyzeTracking({video,tracker,signal:exportController.signal,onProgress:progress=>{
        $('exportProgress').value=progress*100;$('exportPercent').textContent=`${Math.round(progress*100)}%`;$('exportTime').textContent=`${clock(progress*video.duration)} / ${clock(video.duration)}`;
      }});
    }
    replayTracking=Boolean(trackingCache);
    $('exportTitle').textContent='Собираю твой клип';$('exportDetail').textContent='Движение распознано. Сохраняю видео со звуком и эффектами. Оставь вкладку активной.';
    const result=await exportVideo({video,canvas,render,audio,signal:exportController.signal,onProgress:progress=>{
      $('exportProgress').value=progress*100;$('exportPercent').textContent=`${Math.round(progress*100)}%`;$('exportTime').textContent=`${clock(progress*video.duration)} / ${clock(video.duration)}`;
    }});
    if(downloadUrl)URL.revokeObjectURL(downloadUrl);downloadUrl=URL.createObjectURL(result.blob);
    $('downloadExport').href=downloadUrl;$('downloadExport').download=`${$('fileName').textContent.replace(/\.[^.]+$/,'')}-soylok.${result.extension}`;
    completed=true;$('cancelExport').textContent='Закрыть';$('exportTitle').textContent='Клип готов';
    $('exportDetail').textContent=`${result.extension.toUpperCase()} · ${canvas.width} × ${canvas.height} · ${(result.blob.size/1048576).toFixed(1)} МБ. Всё видео со звуком и эффектами.`;
  }catch(error){
    if(error.name==='AbortError'){cancelled=true;}
    else{$('exportTitle').textContent='Экспорт не завершён';$('exportDetail').textContent=error.message;$('cancelExport').textContent='Закрыть';}
  }finally{
    replayTracking=false;
    try{await seekFrame(video,savedTime);if(!savedPaused)await video.play();else video.pause();}catch{}
    exporting=false;exportController=null;settings.original=wasOriginal;$('importButton').disabled=false;$('exportButton').disabled=!ready;$('seek').disabled=false;updatePlayback();render();
    if(completed)$('downloadExport').hidden=false;
    if(cancelled){$('exportDialog').close();toast('Экспорт отменён.');}
  }
}
$('exportButton').addEventListener('click',startExport);
$('cancelExport').addEventListener('click',()=>{if(exporting){exportController?.abort();$('cancelExport').textContent='Отменяю…';}else $('exportDialog').close();});
$('exportDialog').addEventListener('cancel',event=>{if(exporting){event.preventDefault();exportController?.abort();}});
window.addEventListener('beforeunload',event=>{if(exporting){event.preventDefault();event.returnValue='';}});
new ResizeObserver(fitStage).observe($('dropZone'));
buildLibrary();updateCompositionControls();updateTimeline();updatePlayback();requestAnimationFrame(frame);
loadSource('./base%20video.mp4','base video.mp4');
// The player is ready independently of model initialization.
tracker.init();
