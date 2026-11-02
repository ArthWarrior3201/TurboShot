# TurboShot v1.1: video uploads + personalized Zaps

Upload both updated folders to their respective repositories. Keep your original `config.js` API address, server secrets, encrypted `data/vault.json` and especially `VAULT_KEY`. Existing accounts/posts are supported; optional upload/recommendation fields are added lazily. Never overwrite your deployed vault with an empty one.

## Video storage setup

Zaps now accept files from the device and play inside the website. File bytes go directly to Supabase Storage; Vercel authorizes the upload, validates the stored object, and publishes it. The encrypted private repository continues to hold accounts, post metadata and preferences. It does not hold video bytes.

1. With a parent, create a Supabase project on an eligible free plan. Copy its project URL and **legacy `service_role` JWT** from API settings. This is a server key, not the public anon key.
2. In Vercel set `SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co`, `SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVER_KEY`, and `SUPABASE_VIDEO_BUCKET=turboshot-videos`. Never put the server key into `config.js`, a public repo, or chat.
3. Create the `turboshot-videos` bucket in Storage. Set **public playback**, **maximum file size 26,214,400 bytes (25 MiB)**, and only `video/mp4` and `video/webm` as allowed MIME types. Leave anonymous INSERT/UPDATE/DELETE policies disabled. Public playback does not grant public writes.
4. Alternatively, create a private local `.env` with the three Supabase variables and run `node --env-file=.env setup-video-storage.mjs` in the backend folder. It creates or updates only that designated bucket and its restrictions. Run this once on your own machine; never commit `.env` or execute it on every request.
5. Redeploy Vercel and publish the updated frontend. A configured upload service is reported separately from account/email readiness. The API refuses upload signing if provider size/type restrictions are missing.
6. Sign in → Create a post → Zap. Select an MP4/WebM file, check the preview, choose a category and optional comma-separated tags, enter a caption, and Launch it. The progress bar tracks the file transfer, followed by server verification and publication.

Accepted files are up to **25 MiB and 90 seconds**. H.264 MP4 usually offers broad compatibility; HEVC and unusual codecs may not play everywhere. Original filenames stay in the local preview and are not stored by the API. The browser checks duration; the API checks exact object size, MIME, ownership, expiry and an MP4/WebM container signature. It does not fully parse media duration/codecs, scan for malware or transcode files. Corrupt/unsupported files can still fail to play and should be reported.

Each verified account may request up to 10 upload authorizations per day, with up to 3 unfinished reservations at once. A signed upload URL is valid for two hours and grants access to one randomly named object without exposing a server key. Existing objects cannot be overwritten; publication consumes a reservation. Another account cannot publish your upload.

The beta has a **500 MiB budget for known published/pending media**. Provider quotas can stop uploads earlier. Storage, bandwidth, request and availability limits still apply on free tiers. This can support a small free beta; unlimited uploads or video traffic are not promised. No provider account or paid plan was created or enabled by this update.

## Public media and deletion

Videos are public media. Anyone with a video's storage URL can view it; the file bytes are not encrypted with the account vault key. Storage providers receive viewer network requests. Share only videos you own or have permission to publish. Video metadata may load before Play, but videos do not autoplay.

Deleting a post/account or removing a reported post queues its uploaded file for deletion and attempts cleanup. Cancellation queues an unfinished upload too. Moderation → **Clean up unused videos** lets the administrator retry one job per click, including abandoned reservations after they expire.

The queue also performs a final deletion after the signed upload token expires, preventing a late re-upload from remaining indefinitely. There is **no background scheduler**: repeat cleanup after roughly two hours for that final sweep. Keep `uploads` and `mediaJobs` in the encrypted vault. Files may remain reachable until cleanup succeeds or CDN caches expire; external copies cannot be recalled. Failed cleanup does not restore the removed post.

## How For you learns

- **New account:** recent creator popularity determines the initial order, using likes, counted views and conversations. If the community has no posts, the feed is empty; popularity is never invented.
- **After three different meaningful watches:** creator, category and tag affinities influence ranking. More complete watches carry more weight than brief ones; likes add affinity and dislikes reduce it. The upload form supplies categories/tags; there is no automatic video classifier.
- **Watch measurement:** foreground playback time is measured, excluding seeks and pauses. A signed server receipt ties it to that user/video/time. A receipt can be used once. Seconds are capped by elapsed wall time and the video's declared duration. Seeing a card does not count as playback. Data is approximate and can still be forged by a modified client.
- **Freshness:** interests have a 14-day half-life. At most 100 recent watched-video preferences, within 30 days, inform ranking. Completed watches move that video lower on later requests. Rewatching the same video does not create unlimited preference weight.
- **Variety:** most slots follow interests; an available discovery candidate can take one in five slots. When alternatives exist, at most two videos from one creator appear consecutively. Blocking, dislikes and Not interested are respected.
- **Feed updates:** preferences influence refreshed/new batches, not cards already on screen. Personalization can change offset pagination order; the frontend removes duplicate cards, and refresh exposes items skipped by a changed order.

This is a working, explainable ranking algorithm. It is not a pretrained neural recommendation model and does not guarantee perfect taste prediction.

**Why this Zap?** explains its ranking reason. **Not interested** hides that video. Account settings can reset watch/hidden-video preferences or turn personalization off. Explicit likes/dislikes remain until you undo them. Reset invalidates outstanding playback receipts, so an old viewing session cannot restore the cleared history. Opt-out stops watch-based preference learning; short-lived receipt hashes and ordinary public view deduplication still operate. Preferences are account-specific and stored in the encrypted vault, and are never returned to another account.

## Launch checks

1. Upload a small real MP4. Check preview/progress, refresh, then play it from another account.
2. Cancel an upload and check that no post appears. Use admin cleanup to remove leftovers.
3. Verify that an oversized/unsupported file is rejected and that one account cannot publish another account's reservation.
4. On a fresh viewer account, watch three different videos long enough to register, then pause/scroll away and refresh. Check that favored creators/categories rise.
5. Try dislike, Not interested, blocking, Why this Zap?, reset and opt-out.
6. Delete a test post, confirm feed removal, then verify storage cleanup and the later final sweep.

Automated tests mock provider services. Live storage credentials, bucket permissions, CORS, network transfer, playback on your devices and actual provider limits must be checked after deployment.

## Primary references

- https://supabase.com/docs/guides/storage/buckets/creating-buckets
- https://supabase.com/docs/reference/javascript/file-buckets-createsigneduploadurl
- https://supabase.com/docs/reference/javascript/file-buckets-uploadtosignedurl
- https://supabase.com/docs/guides/storage/uploads/file-limits
