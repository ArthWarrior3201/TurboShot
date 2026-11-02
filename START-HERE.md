# TurboShot setup

The frontend is already pointed at `https://turboshot-backend.vercel.app/api` in config.js. It stays on GitHub Pages. Do not place secret keys or a GitHub PAT in this repository.

Follow the complete **[Supabase setup guide in the private backend repository](https://github.com/ArthWarrior3201/TurboShot-Backend/blob/main/SUPABASE-SETUP.md)**. It covers the SQL migration, exact Vercel Secret variable names, your Supabase project URL, Argon2id passwords, Code.gs email codes, deployment and tests.

Supabase stores the app's encrypted account/social state and actual video uploads. Vercel runs the API and reads its private runtime environment. Google Apps Script or Resend delivers mail. This version uses custom TurboShot authentication, so accounts do not appear under Supabase Authentication > Users.

Signup and password login proceed to a six-digit email code screen. No session is created before the correct code is checked on the server. Wrong/expired/reused codes fail; wrong fields are marked red. Duplicate case-insensitive emails and known temporary/masking services are rejected at signup. The blacklist cannot detect every service or custom-domain alias.

`loader.js` checks for fresh HTML, config, styles and app code at startup and periodically online. It waits for active dialogs/drafts/video before refreshing. Keep the data-shell attribute in index.html aligned with incompatible HTML/JS changes. No service worker is used and users do not need to clear their cache for normal deployments.
