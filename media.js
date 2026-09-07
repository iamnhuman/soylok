const audioGraphs = new WeakMap();
const activeExports = new WeakSet();
const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const silence = () => ({ level: 0, bass: 0, mid: 0, high: 0, peak: 0 });
const abortError = () => new DOMException('Экспорт отменён.', 'AbortError');

/** One audio graph per element; preview volume never changes the export bus. */
export class AudioEngine {
  constructor(video) {
    this.video = video;
    this.context = null;
    this.destination = null;
    this.volume = 1;
    this.reset();
  }

  async init() {
    let graph = audioGraphs.get(this.video);
    if (!graph) {
      const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!Context) throw new Error('Этот браузер не поддерживает обработку аудио.');
      const context = new Context();
      const source = context.createMediaElementSource(this.video);
      const analyser = context.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.55;
      const gain = context.createGain();
      const destination = context.createMediaStreamDestination();
      source.connect(analyser);
      analyser.connect(destination);
      analyser.connect(gain);
      gain.connect(context.destination);
      graph = { context, source, analyser, gain, destination };
      audioGraphs.set(this.video, graph);
    }
    Object.assign(this, graph);
    if (!this.frequencyData) {
      this.frequencyData = new Uint8Array(this.analyser.frequencyBinCount);
      this.timeData = new Float32Array(this.analyser.fftSize);
    }
    this.setVolume(this.volume);
    if (this.context.state === 'suspended') await this.context.resume();
    return this;
  }

  setVolume(value) {
    this.volume = clamp(Number.isFinite(Number(value)) ? Number(value) : 1);
    if (this.gain) {
      this.gain.gain.cancelScheduledValues(this.context.currentTime);
      this.gain.gain.setTargetAtTime(this.volume, this.context.currentTime, 0.015);
    }
  }

  reset() {
    this.metrics = silence();
    this.motion = 0;
    this.previousBass = 0;
    this.lastSampleTime = 0;
  }

  /** Actual waveform energy, frequency bands, and bass onsets; no simulated beat. */
  sample() {
    if (!this.analyser || this.context.state !== 'running' || this.video.paused || this.video.ended) {
      this.previousBass=0;this.lastSampleTime=0;
      this.metrics={...silence(),motion:this.motion};
      return this.metrics;
    }
    this.analyser.getByteFrequencyData(this.frequencyData);
    this.analyser.getFloatTimeDomainData(this.timeData);
    let energy = 0;
    for (const value of this.timeData) energy += value * value;
    const level = clamp(Math.sqrt(energy / this.timeData.length) * 3);
    const binWidth = this.context.sampleRate / this.analyser.fftSize;
    const band = (low, high) => {
      const start = Math.max(1, Math.floor(low / binWidth));
      const end = Math.min(this.frequencyData.length, Math.ceil(high / binWidth));
      let sum = 0;
      for (let i = start; i < end; i++) sum += this.frequencyData[i] / 255;
      return end > start ? sum / (end - start) : 0;
    };
    const bass = band(35, 250);
    const mid = band(250, 2200);
    const high = band(2200, 12000);
    const now = this.context.currentTime;
    const elapsed = this.lastSampleTime ? clamp(now - this.lastSampleTime, 0, 0.2) : 1 / 60;
    const onset = level > 0.006 ? clamp((bass - this.previousBass - 0.012) * 7) : 0;
    const peak = Math.max(onset, this.metrics.peak * Math.exp(-elapsed * 10));
    this.previousBass = bass;
    this.lastSampleTime = now;
    // A frequency analyser may retain previous samples briefly after seeking.
    if(level>=.001)this.motion+=elapsed*(bass*1.8+level+peak*8);
    this.metrics = level < 0.001 ? {...silence(),motion:this.motion} : { level, bass, mid, high, peak, motion:this.motion };
    return this.metrics;
  }
}

function waitForMedia(video, eventName, ready, signal, timeout = 15000) {
  if (signal?.aborted) return Promise.reject(abortError());
  if (ready()) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      video.removeEventListener(eventName, onReady);
      video.removeEventListener('error', onError);
      signal?.removeEventListener('abort', onAbort);
    };
    const finish = (error) => { cleanup(); error ? reject(error) : resolve(); };
    const onReady = () => { if (ready()) finish(); };
    const onError = () => finish(new Error('Не удалось прочитать исходное видео.'));
    const onAbort = () => finish(abortError());
    const timer = setTimeout(() => finish(new Error('Видео не ответило вовремя. Попробуйте ещё раз.')), timeout);
    video.addEventListener(eventName, onReady);
    video.addEventListener('error', onError);
    signal?.addEventListener('abort', onAbort, { once: true });
    onReady();
  });
}

async function seek(video, time, signal) {
  if (signal?.aborted) throw abortError();
  if (Math.abs(video.currentTime - time) < 0.001 && !video.seeking && video.readyState >= 2) return;
  video.currentTime = time;
  await waitForMedia(video, 'seeked', () => !video.seeking && video.readyState >= 2 && Math.abs(video.currentTime - time) < 0.05, signal);
}

function boundedOperation(operation, signal, message, timeout = 15000) {
  if (signal?.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const finish = (error, value) => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
      error ? reject(error) : resolve(value);
    };
    const cancel = () => finish(abortError());
    const timer = setTimeout(() => finish(new Error(message)), timeout);
    signal?.addEventListener('abort', cancel, { once: true });
    Promise.resolve(operation).then((value) => finish(null, value), (error) => finish(error));
  });
}

function createRecorder(stream, canvas) {
  const candidates = [
    'video/mp4;codecs=avc1.424028,mp4a.40.2',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];
  const bitrate = Math.round(clamp(canvas.width * canvas.height * 30 * 0.16, 4000000, 24000000));
  let lastError;
  for (const mimeType of candidates) {
    if (!MediaRecorder.isTypeSupported(mimeType)) continue;
    try {
      return new MediaRecorder(stream, { mimeType, videoBitsPerSecond: bitrate, audioBitsPerSecond: 192000 });
    } catch (error) { lastError = error; }
  }
  // Let the browser choose its native encoder if it does not advertise a MIME.
  try { return new MediaRecorder(stream, { videoBitsPerSecond: bitrate }); }
  catch (error) { throw new Error('Браузер не смог запустить запись видео.', { cause: lastError || error }); }
}

function recordPlayback({ video, canvas, render, recorder, onProgress, signal }) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let settled = false;
    let reachedEnd = false;
    let lastTime = video.currentTime;
    let lastAdvance = performance.now();
    let endTimer;
    let startTimer;
    const cleanup = () => {
      clearInterval(watchdog);
      clearTimeout(startTimer);
      clearTimeout(endTimer);
      video.removeEventListener('ended', finishVideo);
      video.removeEventListener('error', mediaError);
      signal?.removeEventListener('abort', cancel);
      recorder.removeEventListener('dataavailable', receiveData);
      recorder.removeEventListener('error', recorderError);
      recorder.removeEventListener('stop', stopped);
    };
    const fail = (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      video.pause();
      if (recorder.state !== 'inactive') {
        try { recorder.stop(); } catch { /* Already stopping after encoder failure. */ }
      }
      reject(error);
    };
    const report = (value) => {
      try { onProgress?.(clamp(value)); }
      catch (error) { fail(error); }
    };
    const receiveData = (event) => { if (event.data?.size) chunks.push(event.data); };
    const recorderError = (event) => fail(event.error || new Error('Ошибка кодирования видео.'));
    const mediaError = () => fail(new Error('Во время экспорта не удалось прочитать видео.'));
    const cancel = () => fail(abortError());
    const stopped = () => {
      if (settled) return;
      if (!reachedEnd) return fail(new Error('Запись прервалась до конца видео.'));
      if (signal?.aborted) return fail(abortError());
      const mimeType = recorder.mimeType || chunks[0]?.type || 'video/webm';
      const blob = new Blob(chunks, { type: mimeType });
      if (!blob.size) return fail(new Error('Браузер создал пустое видео. Попробуйте другой браузер.'));
      report(1);
      if (settled) return;
      settled = true;
      cleanup();
      resolve({ blob, mimeType, extension: mimeType.includes('mp4') ? 'mp4' : 'webm' });
    };
    const finishVideo = () => {
      if (settled || reachedEnd) return;
      reachedEnd = true;
      video.pause();
      try { render(); }
      catch (error) { fail(error); return; }
      // Allow captureStream to observe the final painted source frame.
      endTimer = setTimeout(() => {
        if (settled) return;
        try {
          if (recorder.state !== 'inactive') recorder.stop();
          else fail(new Error('Запись остановилась до сохранения последнего кадра.'));
        } catch (error) { fail(error); }
        endTimer = setTimeout(() => fail(new Error('Кодировщик не завершил сохранение видео.')), 15000);
      }, 40);
    };
    const watchdog = setInterval(() => {
      if (settled || reachedEnd) return;
      if (signal?.aborted) { cancel(); return; }
      if (video.ended) { finishVideo(); return; }
      if (video.currentTime > lastTime + 0.001) {
        lastTime = video.currentTime;
        lastAdvance = performance.now();
      } else if (performance.now() - lastAdvance > 20000) {
        fail(new Error('Воспроизведение остановилось. Экспорт не завершён.'));
        return;
      }
      report(Math.min(0.999, video.currentTime / video.duration));
    }, 200);
    video.addEventListener('ended', finishVideo);
    video.addEventListener('error', mediaError);
    signal?.addEventListener('abort', cancel, { once: true });
    recorder.addEventListener('dataavailable', receiveData);
    recorder.addEventListener('error', recorderError);
    recorder.addEventListener('stop', stopped);
    if (signal?.aborted) { cancel(); return; }
    try {
      render();
      recorder.start(1000);
      report(0);
      if (settled) return;
      startTimer = setTimeout(() => fail(new Error('Не удалось начать воспроизведение для экспорта.')), 15000);
      Promise.resolve(video.play()).then(() => clearTimeout(startTimer), fail);
    } catch (error) { fail(error); }
  });
}

/** Real-time, full-length export. The supplied canvas must use the source aspect ratio. */
export async function exportVideo({ video, canvas, render, audio, onProgress, signal }) {
  if (signal?.aborted) throw abortError();
  if (activeExports.has(video)) throw new Error('Экспорт этого видео уже запущен.');
  if (!globalThis.MediaRecorder || !canvas?.captureStream) {
    throw new Error('Этот браузер не поддерживает экспорт. Откройте редактор в Chrome или Edge.');
  }
  if (typeof render !== 'function') throw new TypeError('Для экспорта нужна функция отрисовки кадра.');
  activeExports.add(video);
  const saved = {
    currentTime: video.currentTime, paused: video.paused, loop: video.loop,
    muted: video.muted, volume: video.volume, playbackRate: video.playbackRate,
  };
  let stream;
  try {
    await waitForMedia(video, 'loadeddata', () => video.readyState >= 2, signal);
    if (!Number.isFinite(video.duration) || video.duration <= 0) throw new Error('Нужно загрузить видео с конечной длительностью.');
    if (!canvas.width || !canvas.height) throw new Error('Кадр видео ещё не готов.');
    await boundedOperation(audio.init(), signal, 'Не удалось включить аудио для экспорта.');
    if (signal?.aborted) throw abortError();
    video.pause();
    video.loop = false;
    video.playbackRate = 1;
    video.muted = false;
    video.volume = 1;
    await seek(video, 0, signal);
    audio.reset();
    render();
    stream = canvas.captureStream(30);
    for (const track of audio.destination.stream.getAudioTracks()) stream.addTrack(track.clone());
    const recorder = createRecorder(stream, canvas);
    return await recordPlayback({ video, canvas, render, recorder, onProgress, signal });
  } finally {
    video.pause();
    stream?.getTracks().forEach((track) => track.stop());
    video.loop = saved.loop;
    video.muted = saved.muted;
    video.volume = saved.volume;
    video.playbackRate = saved.playbackRate;
    try {
      await seek(video, saved.currentTime);
      audio?.reset();
      render();
    } catch { /* Restoring a source removed during export cannot recover that source. */ }
    if (!saved.paused) {
      try {
        await boundedOperation(video.play(), null, 'Не удалось возобновить просмотр.', 3000);
      } catch { /* Autoplay permission may expire during export. */ }
    }
    activeExports.delete(video);
  }
}
