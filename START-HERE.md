# TurboShot v1.1 beta — launch guide

**Updated:** direct video uploads and personalized Zaps are included. Read VIDEO-AND-ALGORITHM.md before launching; it contains the required Supabase setup and upgrade steps.

This ZIP contains exactly two folders:

- **TurboShot-Main** → upload its CONTENTS to your public `TurboShot` repository. This is the GitHub Pages website, with your supplied logo.
- **TurboShot-Backend** → upload its CONTENTS to your existing PRIVATE `TurboShot-Backend` repository. Import that repository into Vercel. It contains the API, encryption, account system and tests.

This is functional small-community beta source, not a live deployment or a promise of Instagram-scale service. No real account, key or password is included. Have a parent manage the hosting accounts and review the community before inviting people.

## 1. Put the frontend on GitHub Pages

1. Create/open your public `TurboShot` repository.
2. Upload the files INSIDE `TurboShot-Main`, so `index.html` is at the repository root. Upload `assets` too. Do not upload the backend here.
3. In repository Settings → Pages, choose deployment from `main`, `/ (root)`.
4. Your expected address is `https://arthwarrior3201.github.io/TurboShot/`. Use the actual Pages URL GitHub shows if it differs.
5. The website initially shows a setup message. It does not invent accounts or pretend posts have saved.

## 2. Prepare the private backend repository

1. Keep `TurboShot-Backend` PRIVATE. Upload the files inside that folder, with `api`, `lib`, `package.json` and `vercel.json` at its root.
2. Include `.gitignore`, `.vercelignore` and `.env.example`. Never upload a real `.env`.
3. Create a **fine-grained GitHub personal access token** limited to ONLY `TurboShot-Backend`. Give it repository **Contents: Read and write** and the automatically provided Metadata read access. Choose an expiry and renew before it expires. Do not grant access to other repositories.
4. Keep this token for the Vercel environment settings. Do not paste it into the website, a post, or chat.

The server creates `data/vault.json` in the private repository on its first write. This is encrypted data, not plaintext credentials. Its commits are marked to skip builds. If your default branch is not `main`, use the correct branch in the environment settings.

## 3. Set up real email, with a free option

Verification and forgotten-password recovery require a working mail sender. Choose A or B.

### A. Google Apps Script relay (no purchased domain needed)

Use a parent-managed Google account permitted to run Apps Script and send mail. Workspace or supervised-account policies can restrict this; don't bypass account restrictions.

1. Open https://script.google.com/ and create a project called `TurboShot Email`.
2. Paste the contents of the backend's `email-relay.gs` into its script file.
3. Generate a random secret of at least 32 characters. With Node.js installed on your own computer, run `npm run keygen` from the backend folder. This produces a suitable secret. Save it privately.
4. In Apps Script Project Settings → Script properties, add:
   - `RELAY_SECRET`: the secret you just generated.
   - `FRONTEND_URL`: your full Pages URL, such as `https://arthwarrior3201.github.io/TurboShot/`.
5. Deploy → New deployment → Web app. Execute as the owner; choose access **Anyone** so the Vercel server can call it without a Google browser session. Review and authorize your own script's requested email permission. If your account doesn't permit this setup, use another permitted mail provider.
6. Copy the deployed `/exec` URL for `EMAIL_RELAY_URL`. The secret goes into Vercel as `EMAIL_RELAY_SECRET` too.

The endpoint authenticates its requests with the shared secret. It sends only fixed TurboShot verification/reset messages. Recipients see the parent-managed sender email address. Google daily mail quotas and deployment policies apply; this suits a small beta. Apps Script authorization and actual delivery must be checked in your account.

### B. Resend (optional alternative)

Create a Resend API key and verify your own sending domain. Set `RESEND_API_KEY` and `MAIL_FROM`, and leave both relay variables blank. A test sender cannot mail arbitrary public recipients; domain ownership may cost money if you don't already have one. The code uses Resend's email API directly, with no package dependency.

## 4. Deploy the backend to Vercel

1. Import the private `TurboShot-Backend` repository. Choose framework **Other**. Keep Root Directory at the repository root. Use Node.js **24.x**. No build or install step is needed: the project has no runtime npm dependencies.
2. Before deploying, add these **server-side environment variables**:

| Variable | Value |
| --- | --- |
| `GITHUB_OWNER` | `ArthWarrior3201` (or your actual username) |
| `GITHUB_REPO` | `TurboShot-Backend` |
| `GITHUB_BRANCH` | `main` (or your actual default branch) |
| `GITHUB_TOKEN` | The fine-grained token from step 2 |
| `VAULT_KEY` | A NEW, different 32-byte base64 key, generated with `npm run keygen` |
| `ALLOWED_ORIGIN` | `https://arthwarrior3201.github.io` — NO repo path or trailing slash |
| `FRONTEND_URL` | `https://arthwarrior3201.github.io/TurboShot/` — full path, with trailing slash |
| `EMAIL_RELAY_URL` | Your deployed Apps Script `/exec` URL, if using option A |
| `EMAIL_RELAY_SECRET` | The same secret stored in Apps Script, if using A |
| `RESEND_API_KEY` | Only if using option B |
| `MAIL_FROM` | Only if using B; e.g. `TurboShot <hello@your-verified-domain>` |
| `ADMIN_EMAIL` | Parent/admin email that will sign up and verify; this account gets Moderation |
| `SIGNUP_CODE` | Recommended invitation code for your first small beta; blank allows open registration |
| `MEDIA_HOSTS` | Approved hostnames for ordinary post image links |
| `SUPABASE_URL` | Your Supabase project URL, e.g. `https://YOUR_PROJECT_REF.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only legacy service_role JWT; never the public anon key |
| `SUPABASE_VIDEO_BUCKET` | `turboshot-videos`, configured as described in VIDEO-AND-ALGORITHM.md |

3. Deploy. Your backend's production API address will look like `https://YOUR-PROJECT.vercel.app/api`. Use your actual production deployment domain, not a temporary preview URL.
4. The API needs to be publicly reachable by the Pages frontend; app accounts enforce who can write. If Vercel deployment protection returns a Vercel login page for this API, have the parent review the project's protection settings for the intended public API. Keep the GitHub repository private.
5. In the public frontend's `config.js`, set **only** `API_BASE` to that address. Commit it. This API URL is public; the keys are not.
6. Refresh your Pages site. It should say Connected. That indicates configured values, not an end-to-end mail/storage health guarantee. Run the launch check below.

**Back up `VAULT_KEY` offline.** Losing or changing it makes the existing vault unreadable. Never replace it casually. The relay secret and vault key must be different.

## 5. Check the full live flow

1. Sign up with the administrator email and a nickname. Enter the invite code if one is set. Passwords need at least 12 characters.
2. Open the verification email, click Verify my email, then sign in.
3. Create a post. Refresh and confirm it remains.
4. Use a second verified test account: like, unlike, dislike, comment, report, block and unblock. Users can remove their own posts/comments. Admins can remove other content.
5. Use Forgot password. Open its email link, choose a new password, then confirm the old password and old sessions no longer work. Reusing that reset link must fail.
6. Open the admin Moderation panel and resolve the test report.
7. Configure Supabase Storage using VIDEO-AND-ALGORITHM.md. Create a Zap by selecting an MP4/WebM file, check its preview and upload progress, then play the published video from a second account.
8. Watch three different videos, pause/scroll away to save feedback, then refresh Zaps. Check personalized ranking, Why this Zap?, Not interested, reset and personalization-off settings.

Zaps now use video file uploads, with inline controls and native full-screen playback. Ordinary posts retain approved image links. Existing linked-video posts remain playable after upgrading, but new Zaps require uploads. There is no server transcoding or claim that this is “10× better” than YouTube. Videos may load metadata before Play; they do not autoplay. The storage host receives viewer network requests.

## What works

- Sign up, email verification, sign in/out, password change, emailed password reset, account deletion.
- Posts, captions, optional linked images, direct-upload Zaps, search, paginated feeds, and My posts.
- One like OR dislike per signed-in account; select again to remove it.
- Comments, comment deletion and post deletion with server-side ownership checks.
- View counts: ordinary posts count after two seconds at least half visible. Zaps count after at least three seconds of measured playback, or their full duration if shorter. Signed-in views are deduplicated for 24 hours. Guests do not count. Seeing a video card does not train recommendations. Counts and browser playback telemetry are approximate, not fraud-proof analytics.
- Trending includes posts younger than seven days. Score = `(4 × likes + 0.25 × views + 2 × comments) / (age_in_hours + 2)^1.35`. Dislikes don't boost it. Old posts remain in the normal feed.
- Basic English profanity filtering, reports, blocking, admin removals/bans.
- Responsive dark interface with your logo. No fabricated demo posts or local-only pretend accounts.
- Personalized For you Zaps, popular-creator cold start, creator/category/tag affinity, Not interested, reset and opt-out controls. See VIDEO-AND-ALGORITHM.md.

## Limits and security facts

No vault is uncrackable. The code uses AES-256-GCM for the repository data and salted scrypt for passwords. The server can decrypt the vault; this is not end-to-end encryption. Sessions and email tickets are stored as hashes. Reset links expire in 30 minutes and verification links in 24 hours. Password reset/change invalidates existing sessions.

Session tokens live in browser `sessionStorage`, because GitHub Pages and Vercel are different sites and third-party cookies are unreliable. Treat the frontend origin as trusted: XSS anywhere on that origin could expose sessions. The app uses a restrictive CSP, no third-party scripts, and DOM text rendering for user content. Do not add unsafe HTML rendering or untrusted scripts. Closing the browser tab normally ends the local session; copied server tokens expire after seven days or can be revoked by a password change.

GitHub is a slow, rate-limited storage system, with a new encrypted snapshot committed for every write, including counted views and failed login limits. Optimistic SHA checks retry conflicting writes, but busy traffic may be rejected for retry. This beta caps accounts at 100, posts at 400, and current vault plaintext at 600 KB; it can fill sooner. Rate limits and availability depend on GitHub, Vercel and mail-provider quotas. Free operation is possible within eligible free tiers; unlimited service and future pricing are not guaranteed.

Reports are retained for up to 30 days and expired auth records are cleaned on writes. Unverified registrations expire after one day. Account deletion removes current data and authored content; encrypted copies remain in Git history and any backups. The administrator must manage history/backups separately. The profanity filter is basic English only, can miss evasions, and needs human review. This is not a security-audited public service. Before broad public registration, arrange adult moderation, privacy/retention policies, independent security review and migration of account/social metadata to a real database. Uploaded video files already use dedicated object storage.

## Troubleshooting

- **Backend not connected:** check `API_BASE` in `config.js`, commit it, then refresh Pages.
- **Could not reach:** check the Vercel URL, deployment protection, CORS origin, and network.
- **Origin not allowed:** `ALLOWED_ORIGIN` must match exactly; `FRONTEND_URL` includes the repo path but `ALLOWED_ORIGIN` doesn't.
- **Private repository connection:** check token expiry, chosen repository permissions, owner and branch. The repository must already contain the backend code.
- **Vault could not be opened:** restore the ORIGINAL vault key. Do not delete data to “fix” it.
- **No email:** check spam, email quota, Apps Script `/exec` deployment and script properties, or Resend domain verification. Use Resend verification or Forgot password to request a fresh link. Redeploy after changing Vercel environment variables. Apps Script code edits require updating its deployment.
- **Storage busy/full:** wait for quota reset or ask the administrator to migrate/archive data. Do not loop repeated requests.
- **Image link rejected:** add the image hostname to `MEDIA_HOSTS` and redeploy.
- **Video upload unavailable:** check the Supabase server key, public playback bucket and provider-enforced MIME/size limits; redeploy after changing variables.
- **Video not playing:** use an H.264 MP4 or WebM supported by the browser. Uploading does not transcode.
- **Feed not personalized yet:** watch three distinct videos, pause/scroll away, then refresh. Enable personalization in settings.
- **Unused video files remain:** use Moderation → Clean up unused videos, and retry after the two-hour upload-token window for final cleanup.
- **No Moderation button:** sign up with the exact `ADMIN_EMAIL`, verify, and sign in again.

## Validation and documentation

In the backend folder, run `npm test` with Node.js 24. Tests exercise authentication, reset replay/expiry, access control, data encryption/tampering, reactions, comment deletion, view deduplication, block/report/ban flows, pagination, rate limits, HTTP handling, email transports, competing GitHub writes, upload ownership/validation, provider restrictions, recommendation learning/controls, receipt replay/time caps, storage budgets and cleanup. External services are mocked; real deployment/delivery is not verified by these tests.

Primary integration references:
- https://docs.github.com/en/rest/repos/contents
- https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api
- https://vercel.com/docs/functions/runtimes/node-js
- https://resend.com/docs/api-reference/emails/send-email
- https://developers.google.com/apps-script/reference/mail/mail-app
- https://developers.google.com/apps-script/guides/web
