/**
 * Real face/hand landmarks in source-video coordinates (x/y normalized to 0–1).
 * Runtime and models are served locally: no uploads, CDN requests or API keys.
 */
const RUNTIME = new URL('./vendor/mediapipe/vision_bundle.mjs', import.meta.url).href;
const WASM = new URL('./vendor/mediapipe/wasm', import.meta.url).href;
const MODEL_URLS = {
  face: new URL('./models/face_landmarker.task', import.meta.url).href,
  hand: new URL('./models/hand_landmarker.task', import.meta.url).href,
};
const INTERVAL_MS = 80;
const STALE_MS = 500;

const message = error => error instanceof Error ? error.message : String(error);
const copyLandmarks = points => points.map(({ x, y, z = 0 }) => ({ x, y, z }));
const makeCanvas = () => typeof document === 'undefined' ? new OffscreenCanvas(1, 1) : document.createElement('canvas');

export class VideoTracker {
  constructor({ onStatus, preferCPU = false } = {}) {
    this.state = { faces: [], hands: [], status: 'idle', error: null };
    this.onStatus = typeof onStatus === 'function' ? onStatus : () => {};
    this.preferCPU = preferCPU;
    this._tasks = { face: null, hand: null };
    this._delegates = { face: null, hand: null };
    this._errors = { face: null, hand: null };
    this._recoveries = { face: null, hand: null };
    this._initialization = null;
    this._vision = null;
    this._fileset = null;
    this._disposed = false;
    this._video = null;
    this._source = '';
    this._lastVideoTime = -1;
    this._lastDetectionWall = -Infinity;
    this._lastTimestamp = -1;
    this._lastGood = { face: -Infinity, hand: -Infinity };
    this._forceNext = true;
    this._faceCrop = null;
    this._faceSearchIndex = 0;
    this._faceCanvas = null;
    this._handCrop = null;
    this._handSearchIndex = 0;
    this._handCanvas = null;
    this._handFullCheckAt = -Infinity;
    this._lastNotification = '';
    this._invalidate = () => this.reset();
  }

  /** Idempotent; model failures are reported through state, without rejecting. */
  async init() {
    if (this._disposed) return this.state;
    if (this._initialization) return this._initialization;
    if (this._tasks.face && this._tasks.hand) return this.state;
    this._publish('loading');
    this._initialization = (async () => {
      try {
        this._vision ||= await import(RUNTIME);
        this._fileset ||= await this._vision.FilesetResolver.forVisionTasks(WASM);
        // MediaPipe loaders share browser globals. Initialize sequentially,
        // while keeping success/failure independent for the two models.
        for (const kind of ['face', 'hand']) {
          if (this._disposed) break;
          if (this._tasks[kind]) continue;
          try {
            await this._createModel(kind);
            this._errors[kind] = null;
          } catch (error) {
            this._errors[kind] = message(error);
          }
        }
      } catch (error) {
        this._errors.face = this._errors.hand = message(error);
      }
      if (!this._disposed) this._forceNext = true;
      return this.state;
    })();
    try {
      return await this._initialization;
    } finally {
      this._initialization = null;
      if (!this._disposed) this._publish(this._availability('ready'));
    }
  }

  async _createModel(kind, cpuOnly = false) {
    const Task = kind === 'face' ? this._vision.FaceLandmarker : this._vision.HandLandmarker;
    const options = kind === 'face' ? {
      numFaces: 1,
      minFaceDetectionConfidence: 0.5,
      minFacePresenceConfidence: 0.6,
      minTrackingConfidence: 0.5,
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: false,
    } : {
      numHands: 2,
      minHandDetectionConfidence: 0.45,
      minHandPresenceConfidence: 0.6,
      minTrackingConfidence: 0.5,
    };
    let failure;
    for (const delegate of cpuOnly || this.preferCPU ? ['CPU'] : ['GPU', 'CPU']) {
      try {
        const task = await Task.createFromOptions(this._fileset, {
          ...options,
          baseOptions: { modelAssetPath: MODEL_URLS[kind], delegate },
          runningMode: 'VIDEO',
        });
        if (this._disposed) {
          task.close();
          return;
        }
        this._tasks[kind] = task;
        this._delegates[kind] = delegate;
        return;
      } catch (error) {
        failure = error;
      }
    }
    throw failure;
  }

  /** Call from the render loop, and after a paused seek. No duplicate-frame work. */
  async update(video, timestampMs) {
    if (this._disposed) return this.state;
    if (this.state.status === 'idle') {
      await this.init();
      if (this._disposed) return this.state;
    }
    if (video !== this._video) this._bindVideo(video);
    const source = video?.currentSrc || video?.src || '';
    if (source !== this._source) {
      this._source = source;
      this.reset();
    }
    if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight || video.seeking) {
      this.state.faces = [];
      this.state.hands = [];
      this._forceNext = true;
      this._publish(this._availability('waiting'));
      return this.state;
    }
    const now = performance.now();
    if (!video.paused) {
      if (now - this._lastGood.face > STALE_MS) this.state.faces = [];
      if (now - this._lastGood.hand > STALE_MS) this.state.hands = [];
    }
    // Keep landmarks on an unchanged paused frame. On seeking/emptied they are
    // cleared immediately; seeked forces detection even if the time is equal.
    if (!this._forceNext && video.currentTime === this._lastVideoTime) {
      this._publish(this._availability(this._hasDetections() ? 'tracking' : 'searching'));
      return this.state;
    }
    if (now - this._lastDetectionWall < INTERVAL_MS) return this.state;
    if (!this._tasks.face && !this._tasks.hand) {
      this._publish(this._availability('waiting'));
      return this.state;
    }
    this._lastDetectionWall = now;
    this._lastVideoTime = video.currentTime;
    this._forceNext = false;
    // MediaPipe requires strictly increasing inference timestamps. Never feed
    // currentTime directly: source replacements, seeks and loops can rewind it.
    const requested = Number.isFinite(timestampMs) ? timestampMs : now;
    const timestamp = Math.max(1, this._lastTimestamp + 1, requested);
    this._lastTimestamp = timestamp;

    for (const kind of ['face', 'hand']) {
      const task = this._tasks[kind];
      if (!task) continue;
      try {
        if (kind === 'face') {
          this.state.faces = this._detectFaces(task, video, timestamp);
        } else {
          this.state.hands = this._detectHands(task, video, this._lastTimestamp);
        }
        this._lastGood[kind] = performance.now();
        this._errors[kind] = null;
      } catch (error) {
        if (kind === 'face') this.state.faces = [];
        else this.state.hands = [];
        this._errors[kind] = message(error);
        this._tasks[kind] = null;
        try { task.close(); } catch { /* The failed graph may already be closed. */ }
        if (this._delegates[kind] === 'GPU' && !this._recoveries[kind]) {
          // Recover only the affected model; hand tracking survives a face error.
          this._recoveries[kind] = this._createModel(kind, true)
            .then(() => { this._errors[kind] = null; this._forceNext = true; })
            .catch(recoveryError => { this._errors[kind] = message(recoveryError); })
            .finally(() => {
              this._recoveries[kind] = null;
              if (!this._disposed) this._publish(this._availability('ready'));
            });
        }
      }
    }
    this._publish(this._availability(this._hasDetections() ? 'tracking' : 'searching'));
    return this.state;
  }

  _detectFaces(task, video, timestamp) {
    const detect = crop => {
      let source = video;
      if (crop) {
        this._faceCanvas ||= makeCanvas();
        const width = video.videoWidth * crop.w;
        const height = video.videoHeight * crop.h;
        const scale = Math.min(1, 640 / Math.max(width, height));
        this._faceCanvas.width = Math.round(width * scale);
        this._faceCanvas.height = Math.round(height * scale);
        this._faceCanvas.getContext('2d').drawImage(video,
          video.videoWidth * crop.x, video.videoHeight * crop.y, width, height,
          0, 0, this._faceCanvas.width, this._faceCanvas.height);
        source = this._faceCanvas;
      }
      const faces = (task.detectForVideo(source, timestamp).faceLandmarks || []).map(copyLandmarks);
      if (!crop) return faces;
      return faces.map(points => points.map(point => ({
        x: crop.x + point.x * crop.w,
        y: crop.y + point.y * crop.h,
        z: point.z * crop.w,
      })));
    };
    const previousCrop = this._faceCrop;
    let faces = detect(previousCrop);
    if (faces.length) return faces;
    // Short-range face models can miss a small subject in a wide music-video
    // shot. Scan genuine source-image crops, then map detections back exactly.
    // Keep the successful crop stable until the subject leaves it.
    const landscape = video.videoWidth >= video.videoHeight;
    const crops = landscape ? [
      { x: 0.2, y: 0.1, w: 0.6, h: 0.8 },
      { x: 0, y: 0, w: 0.6, h: 0.8 },
      { x: 0.4, y: 0, w: 0.6, h: 0.8 },
      { x: 0.2, y: 0.2, w: 0.6, h: 0.8 },
    ] : [
      { x: 0.1, y: 0.2, w: 0.8, h: 0.6 },
      { x: 0, y: 0, w: 0.8, h: 0.6 },
      { x: 0.2, y: 0, w: 0.8, h: 0.6 },
      { x: 0.1, y: 0.4, w: 0.8, h: 0.6 },
    ];
    const crop = previousCrop ? null : crops[this._faceSearchIndex % crops.length];
    timestamp = ++this._lastTimestamp;
    faces = detect(crop);
    this._faceCrop = faces.length ? crop : null;
    if (!faces.length) {
      this._faceSearchIndex += 1;
      // Finish scanning a paused image over a few throttled passes as well.
      if (this._faceSearchIndex < crops.length) this._forceNext = true;
    }
    return faces;
  }

  _detectHands(task, video, timestamp) {
    const detect = crop => {
      let source = video;
      if (!crop) this._handFullCheckAt = performance.now();
      if (crop) {
        this._handCanvas ||= makeCanvas();
        const width = video.videoWidth * crop.w;
        const height = video.videoHeight * crop.h;
        const scale = Math.min(1, 640 / Math.max(width, height));
        this._handCanvas.width = Math.round(width * scale);
        this._handCanvas.height = Math.round(height * scale);
        this._handCanvas.getContext('2d').drawImage(video,
          video.videoWidth * crop.x, video.videoHeight * crop.y, width, height,
          0, 0, this._handCanvas.width, this._handCanvas.height);
        source = this._handCanvas;
      }
      const result = task.detectForVideo(source, timestamp);
      const handedness = result.handedness || result.handednesses || [];
      return (result.landmarks || []).map((landmarks, index) => ({
        landmarks: crop ? landmarks.map(point => ({
          x: crop.x + point.x * crop.w,
          y: crop.y + point.y * crop.h,
          z: (point.z || 0) * crop.w,
        })) : copyLandmarks(landmarks),
        handedness: handedness[index]?.[0]?.categoryName || 'Unknown',
      }));
    };
    const previousCrop = this._handCrop;
    let hands = detect(previousCrop);
    if (hands.length) {
      // A crop must not permanently exclude another hand entering the scene.
      if (previousCrop && performance.now() - this._handFullCheckAt > 1000) {
        timestamp = ++this._lastTimestamp;
        const fullFrameHands = detect(null);
        if (fullFrameHands.length) {
          this._handCrop = null;
          return fullFrameHands;
        }
      }
      return hands;
    }
    // A keyboard shot often makes hands small relative to the frame. Enlarging
    // real pixels improves palm detection without guessing hidden fingers.
    const crops = video.videoWidth >= video.videoHeight ? [
      { x: 0.15, y: 0.2, w: 0.65, h: 0.7 },
      { x: 0, y: 0.2, w: 0.65, h: 0.7 },
      { x: 0.35, y: 0.2, w: 0.65, h: 0.7 },
      { x: 0.175, y: 0, w: 0.65, h: 0.7 },
    ] : [
      { x: 0.15, y: 0.25, w: 0.7, h: 0.65 },
      { x: 0, y: 0.35, w: 0.7, h: 0.65 },
      { x: 0.3, y: 0.35, w: 0.7, h: 0.65 },
      { x: 0.15, y: 0, w: 0.7, h: 0.65 },
    ];
    const crop = previousCrop ? null : crops[this._handSearchIndex % crops.length];
    timestamp = ++this._lastTimestamp;
    hands = detect(crop);
    this._handCrop = hands.length ? crop : null;
    if (!hands.length) {
      this._handSearchIndex += 1;
      if (this._handSearchIndex < crops.length) this._forceNext = true;
    }
    return hands;
  }

  _bindVideo(video) {
    for (const event of ['seeking', 'seeked', 'emptied', 'loadeddata']) {
      this._video?.removeEventListener?.(event, this._invalidate);
      video?.addEventListener?.(event, this._invalidate);
    }
    this._video = video;
    this.reset();
  }

  _hasDetections() {
    return this.state.faces.length > 0 || this.state.hands.length > 0;
  }

  _availability(healthyStatus) {
    if (this._disposed) return 'disposed';
    if (this._initialization || this._recoveries.face || this._recoveries.hand) {
      return this._tasks.face || this._tasks.hand ? 'partial' : 'loading';
    }
    if (this._tasks.face && this._tasks.hand) return healthyStatus;
    return this._tasks.face || this._tasks.hand ? 'partial' : 'error';
  }

  _publish(status) {
    this.state.status = status;
    const errors = Object.entries(this._errors).filter(([, error]) => error);
    this.state.error = errors.length
      ? errors.map(([kind, error]) => `${kind === 'face' ? 'Face' : 'Hand'} tracking: ${error}`).join('; ')
      : null;
    const signature = `${status}|${this.state.error}|${this.state.faces.length}|${this.state.hands.length}`;
    if (signature !== this._lastNotification) {
      this._lastNotification = signature;
      try { this.onStatus(this.state); } catch (error) { console.warn('Tracking status callback:', error); }
    }
  }

  /** Clear overlays immediately without reloading models or rewinding their clock. */
  reset() {
    this.state.faces = [];
    this.state.hands = [];
    this._lastVideoTime = -1;
    this._lastGood = { face: -Infinity, hand: -Infinity };
    this._forceNext = true;
    this._faceCrop = null;
    this._faceSearchIndex = 0;
    this._handCrop = null;
    this._handSearchIndex = 0;
    if (!this._disposed && this.state.status !== 'idle') this._publish(this._availability('ready'));
  }

  dispose() {
    this._disposed = true;
    this._bindVideo(null);
    for (const kind of ['face', 'hand']) {
      try { this._tasks[kind]?.close(); } catch { /* Dispose stays idempotent. */ }
      this._tasks[kind] = null;
    }
    this._publish('disposed');
  }
}
