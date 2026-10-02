# Third-party models and services

m8 is MIT licensed. It downloads these models and runtimes at build or run time
and commits none of them. Each has its own licence.

| What                       | Used for                                      | Where it comes from                                                     | Licence    |
| -------------------------- | --------------------------------------------- | ----------------------------------------------------------------------- | ---------- |
| MediaPipe Tasks (wasm)     | Running the vision and audio models           | npm `@mediapipe/tasks-vision` and `@mediapipe/tasks-audio`              | Apache 2.0 |
| Face Landmarker            | Faces, where they look, expressions           | `storage.googleapis.com/mediapipe-models`, downloaded by the browser    | Apache 2.0 |
| Gesture Recognizer         | Hand gestures                                 | `storage.googleapis.com/mediapipe-tasks`, downloaded by the browser     | Apache 2.0 |
| YAMNet                     | Room sounds: music, knocks, barks             | `storage.googleapis.com/mediapipe-models`, downloaded by the browser    | Apache 2.0 |
| FaceX nano (MobileFaceNet) | Telling faces apart, when face learning is on | `github.com/facex-engine/facex` release, downloaded by `bun run vendor` | Apache 2.0 |
| ONNX Runtime Web           | Running the face model                        | npm `onnxruntime-web`                                                   | MIT        |

- The FaceX model was trained on MS1M-RefineV2, a cleaned version of the
  MS-Celeb-1M dataset, which Microsoft withdrew in 2019. The model is published
  under Apache 2.0. Some people treat models trained on that data as fit for
  research only. Face learning is off by default; check what applies to you
  before you switch it on in a product.
- The conversation and the memory use the Gemini API with your own key. Google's
  terms for the Gemini API apply to that use, and what you send it.
- The npm dependencies are pinned in the `package.json` files, and each one
  carries its own licence in `node_modules`.
