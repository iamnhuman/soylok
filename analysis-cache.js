const abort = () => new DOMException('Экспорт отменён.', 'AbortError');
export function seekFrame(video,time,signal){
  if(signal?.aborted)return Promise.reject(abort());
  if(Math.abs(video.currentTime-time)<.001&&!video.seeking&&video.readyState>=2)return Promise.resolve();
  return new Promise((resolve,reject)=>{
    const cleanup=()=>{clearTimeout(timer);video.removeEventListener('seeked',done);signal?.removeEventListener('abort',cancel);};
    const done=()=>{if(!video.seeking){cleanup();resolve();}};
    const cancel=()=>{cleanup();reject(abort());};
    const timer=setTimeout(()=>{cleanup();reject(new Error('Не удалось прочитать кадр видео.'));},15000);
    video.addEventListener('seeked',done);signal?.addEventListener('abort',cancel,{once:true});video.currentTime=time;
  });
}
// Resolve true landmarks before recording. Encoding then has the entire
// compositor thread available and never races delayed inference results.
export async function analyzeTracking({video,tracker,signal,onProgress}){
  const fps=8,frames=[],count=Math.ceil(video.duration*fps);
  video.pause();await tracker.init();
  if(tracker.state.error)throw new Error('Трекинг не готов. Нажми «Повторить» в настройках трекинга.');
  for(let i=0;i<count;i++){
    if(signal.aborted)throw abort();
    const time=Math.min(i/fps,video.duration-.001);
    await seekFrame(video,time,signal);tracker.reset();
    const started=performance.now();
    while(true){
      if(signal.aborted)throw abort();
      await tracker.update(video,performance.now());
      if(tracker.resultGeneration===tracker.generation&&Math.abs(tracker.resultTime-time)<.002)break;
      if(tracker.state.error)throw new Error(tracker.state.error);
      if(performance.now()-started>15000)throw new Error('Распознавание кадра не ответило вовремя. Попробуй ещё раз.');
      await new Promise(resolve=>setTimeout(resolve,15));
    }
    frames.push(structuredClone({faces:tracker.state.faces,hands:tracker.state.hands}));onProgress?.((i+1)/count);
  }
  return {fps,frames};
}
export function cachedFrame(cache,time){return cache.frames[Math.min(cache.frames.length-1,Math.max(0,Math.round(time*cache.fps)))];}
