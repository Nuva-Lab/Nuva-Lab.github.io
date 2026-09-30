# Nuva Lab website

GitHub Pages publishes `main` to https://nuvalab.ai.

## Contact form

`survey.js` posts JSON to the Cloudflare Worker configured in `index.html`.
`backend/worker.mjs` sends plain-text email through a restricted Email Service
binding. Recipient is fixed to `info@nuvalab.ai`, sender to
`website@notify.nuvalab.ai`; the visitor email is a validated Reply-To.

Turnstile verification checks the production hostname and action. The API
rejects extra fields, control characters and payloads over 8 KiB. Durable
Objects enforce 10 attempts/IP/10 minutes, 3 submissions/email/hour and 100
submissions/day globally. Rate-limit keys use hashed values and expire through
alarms. Logs contain receipt IDs, not contact details or challenge tokens.

```sh
npm ci
npm test
node --check survey.js
npm run deploy:api
npx wrangler secret put TURNSTILE_SECRET --config backend/wrangler.jsonc
```

The secret must match the public Turnstile sitekey in `index.html`; never commit
it. The sender domain must be enabled in Cloudflare Email Sending. API responses
confirm provider acceptance; mailbox receipt must be verified separately.
Local preview: `python -m http.server 4173`. The production API intentionally
accepts only nuvalab.ai origins and challenge hostnames.

Publish frontend changes through an authorized PR merge, wait for GitHub Pages
and verify the live page. Backend source, tests and dependencies are excluded
from the generated static site. Redeploy a prior Worker revision and revert the
frontend through a PR to roll back.
