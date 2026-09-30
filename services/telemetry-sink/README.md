# GhostPrint Telemetry Sink

This Cloudflare Worker accepts only allow-listed metric counts, a random 7-day
cohort token, and an hour bucket. It rejects unknown fields, URLs, domains, raw
timestamps, malformed tokens, unknown metrics, oversized values, and requests
without the `count-only-v1` purpose marker. Events are written to R2 and deleted
after 30 days by the daily Worker cron. No per-user table or dashboard identifier
is created.

The extension-Origin check is a browser CORS boundary, not authentication: non-browser
clients can forge an `Origin` header and submit fabricated counts. Configure Cloudflare
rate limiting before deployment and treat the resulting metrics as directional, not
fraud-proof.

## Deploy

1. Create the R2 bucket named `ghostprint-telemetry-events` in the target Cloudflare
   account.
2. Set Worker secret `ALLOWED_ORIGIN` to the exact published extension origin
   (`chrome-extension://<extension-id>`). Wildcard origins are rejected.
3. Configure a Cloudflare rate limit for `POST /v1/events` before exposing the Worker.
4. From this directory, deploy with `npx wrangler deploy`.
5. Use the deployed HTTPS URL ending in `/v1/events` as the public build-time
   `VITE_TELEMETRY_ENDPOINT` value when building GhostPrint. This URL is not a secret;
   do not put tokens or credentials in it.
6. Review Cloudflare's platform/IP log retention and the consent wording with privacy
   counsel before enabling the endpoint in a public build.

If `VITE_TELEMETRY_ENDPOINT` is empty or is not HTTPS, the extension will not enable
consent or schedule a flush alarm. When consent is declined or revoked, queued local
counts and the cohort token are deleted. An already in-flight request cannot be recalled.

The Worker does not set a stable user identifier. The cohort token rotates at each
UTC seven-day boundary. Consequently, `w4_retained` is a count of devices that return
after four weeks and consent to telemetry at that point; it cannot be joined to an
individual install cohort, so W4 retention is approximate and must be reported with
that limitation.

## Local Reporting

Export Worker payload bodies from R2 as individual JSON files (or a JSON array), then
run the report from the repository root. Repeat `--input` for each file; use UTC dates
and aggregate counts from Chrome Web Store stats and the UTM landing page for the same
period. `--prior-installs` is the install count from the period four weeks earlier.

```sh
npm run telemetry:dashboard -- \
   --input ./telemetry-export/events.json \
   --from 2026-09-01 \
   --through 2026-09-07 \
   --installs 1200 \
   --utm-visits 38 \
   --prior-installs 900 \
   --output ./telemetry-report.md
```

The report separates event share-completion rate from UTM visits per install; neither
is a unique-user share rate. W4 is an approximate consented-return proxy, not linked
cohort retention. Imports are local and make no network requests. Do not include the
same R2 object more than once.