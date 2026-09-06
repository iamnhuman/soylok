# Vendored MediaPipe Tasks Vision

- Package: `@mediapipe/tasks-vision`
- Version: `0.10.22-rc.20250304`
- Source: https://registry.npmjs.org/@mediapipe/tasks-vision/-/tasks-vision-0.10.22-rc.20250304.tgz
- Upstream: https://github.com/google-ai-edge/mediapipe
- License: Apache-2.0 (copyright notices retained in the runtime files)

The ESM runtime and both SIMD/non-SIMD WebAssembly builds are included so the
editor can perform inference without third-party network requests.

## Model assets

The model files in `../../models` were downloaded from Google's official MediaPipe model storage:

- `face_landmarker.task`: https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task
- `hand_landmarker.task`: https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task

Downloaded on 2026-09-05. Inference runs in the browser; video frames are not uploaded.
