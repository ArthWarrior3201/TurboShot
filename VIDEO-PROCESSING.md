# Browser video processing

TurboShot runs a pinned single-thread ffmpeg.wasm core 0.12.10 in a dedicated worker. The worker receives only the selected video and no sign-in credentials. The engine and WebAssembly file are loaded on demand from jsDelivr (about 31 MB). Upstream source, build instructions and component license notices: https://github.com/ffmpegwasm/ffmpeg.wasm and https://www.npmjs.com/package/@ffmpeg/core/v/0.12.10.

Clicking Publish checks videos above 25 MB with FFprobe. Files above 50 MB, or files the browser cannot preview, are converted to H.264/AAC MP4 using the ultrafast preset. Smaller playable files retain their quality. Conversion uses a duration-based bitrate budget, checks the actual output size, and retries once at a lower bitrate if necessary. Inputs are capped at 500 MB; output is capped at 50 MB and duration at 345 seconds. Videos are uploaded and published only after processing succeeds. Closing the composer terminates processing.

Processing runs on the visitor's device. The tab must remain open, sufficient memory is required, and there is no guaranteed completion time. This is not a background server job. A first-use engine download requires internet access. Large files may exceed a phone's memory. No larger source file is sent to Supabase.

Verification: executed the real pinned core locally, generated a sample H.264 MP4, and ran the worker's probe/transcode path with that file. Existing frontend checks pass. Browser CDN loading, mobile memory behavior and full-size uploads still require device testing.
