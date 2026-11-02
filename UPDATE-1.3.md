# TurboShot 1.3

New: device image uploads, editable profile pictures, one-letter fallback avatars, Show/Hide password, Publishing… feedback, public Circles, simpler password errors and Join the community copy.

Source is already connected to the Vercel API. No secret keys belong in the frontend. Copy the updated Code.gs from the private backend repository into your existing Apps Script deployment to apply the revised signup/login email templates.

Deployment checks run every 60 seconds and queue updates until an explicit safe feed/Circles switch. The updater does not refresh a page merely because it is idle. Reading a post in its dialog, visible comments, selected text, active forms/uploads and playing video block an update.

Profile changes update your current page after saving and other visible pages on their next 15-second profile check. Images use the native browser/device file picker. Supported image formats are JPG, PNG and WebP; the browser reduces their size before uploading. Standard browser file inputs support modern desktop/mobile browsers; individual mobile devices were not tested here.

Circles are public. Join one before posting to it using Share to in the composer.

See the private backend UPDATE-1.3.md for details and verification limits.
