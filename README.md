# Nuva Lab website

GitHub Pages publishes `main` to https://nuvalab.ai.

## Contact form

`survey.js` posts JSON to the Cloudflare Worker configured in `index.html`.
`backend/worker.mjs` sends plain-text email through a restricted Email Service
binding. Recipient is fixed to `info@nuvalab.ai`, sender to
`website@notify.nuvalab.ai`; the visitor email is a validated Reply-To.

Turnstile verification checks the production hostname and action. The API
rejects extra fields, control characters and payloads over 8 KiB. Newlines are
allowed only in the business-goal answer and indented in the plain-text email. Durable
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

The eight-step survey collects business type, a short business problem / desired
result, video volume, service needs, and name/email/company/role. Service needs
include Creative Agent and Business Agent alongside dedicated video generation and
model customization. Questions focus on business outcomes and workflows rather than
a specific model; existing submission values remain stable for compatibility. Business answers are included in the inquiry email, never sent
as analytics event properties. The API accepts legacy submissions without both
business fields during rollout; new submissions must include a valid pair.

Deploy the compatible Worker update before publishing the new frontend. Keep the
`survey.js` and `styles.css` query versions current when updating the form.

## Social preview image

The homepage and FastH3 page share the Nuva brand card. Its PNG contains rendered
text, so changing Open Graph titles alone does not update the image. After a
headline/subtitle change, render a new 1200×630 PNG from the homepage HTML:

```sh
python scripts/render-social-card.py --output assets/nuva-social-2026-09-30-v2.png
```

The renderer needs Pillow and Arial; use its font arguments on other platforms.
The renderer also refreshes the legacy `assets/nuva-social.png` alias for cached
page metadata. Use a new image filename for each copy revision and update both `og:image` and
`twitter:image` on the two pages. Verify the image visually and fetch both the
live HTML and image after deployment. Social platforms may also retain their
own cached page metadata, independently of Google Search indexing.
