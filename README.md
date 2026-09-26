# SiteScribe

A private construction-monitoring workspace for civil, structural and geotechnical engineers. Create a project, start a visit, capture observations with photos and dictated or typed notes, place drawing pins, review a report, and follow the same items into later visits.

Engineering judgments come from the engineer. Report assembly is deterministic: it copies saved notes and chosen classifications, flags missing information, and allows prose edits. Core capture and reporting need no AI credentials. Optional Whisper dictation uses a server-only OpenAI API key. Reviewed means the engineer explicitly reviewed that version; it is not certification or professional endorsement.

## Run locally

Requires Node.js 22+, pnpm 10 and Docker Desktop for the dedicated local Supabase stack.

```sh
pnpm install
# Copy .env.example to .env.local if you do not already have configuration.
pnpm db:start
pnpm supabase migration up --local
pnpm supabase status
pnpm dev
```

Set these values in your ignored `.env.local`, using the local publishable key shown by `supabase status`:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:55431
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-local-publishable-key
```

Open [the app](http://localhost:3000), request an email code and read it in the [local inbox](http://127.0.0.1:55434). Your first sign-in creates your account. Postgres uses port 55432; Studio uses 55433. Do not replace an existing server: use `pnpm dev --port 3180` if needed.

The existing local starter may have Storage disabled. This version enables it in `supabase/config.toml`. If the stack was already running, restart **only this repository's stack** with `pnpm supabase stop` followed by `pnpm db:start`, then run `pnpm supabase migration up --local`. Stop preserves local data. No reset is needed.

## Migrations and existing data

Apply all migrations in order. The original ideas migration and data are retained; `/ideas` now redirects to `/projects`. Authentication, cookie refresh and verified ownership are reused.

- `20260926000000_sitescribe.sql`: projects, visits, persistent items, append-only evidence, append-only report versions, same-owner/project composite foreign keys, grants/RLS, transactional capture and a private Storage bucket.
- `20260926010000_sitescribe_demo.sql`: an explicit, transactional, idempotent demo loader for the current account.
- `20260926020000_drawing_capture_guard.sql`: reject a capture if its displayed drawing was replaced before it was saved.
- `20260926030000_transcription_limits.sql`: private retry cache, authenticated transcription leases and account request limits.
- `20260926040000_report_versions.sql`: numbered versions per visit, same-owner source-version links and serialized version allocation. Backfills version metadata without changing evidence or stored report JSON; no reset or new configuration is needed.

For an **already approved hosted project**, inspect the target before applying the pending migrations with `pnpm supabase db push`. Do not create a paid service, create another production project, or reset a linked database. Storage must be available before applying the migrations. The private `sitescribe` bucket is created by SQL; do not make it public.

Hosted email-code sign-in still needs the starter's `supabase/templates/magic-link.html` for both Confirm signup and Magic Link, and an approved SMTP setup. Keep `{{ .Token }}` in both templates. Deployment uses the existing Next.js/Vercel configuration and the two public Supabase environment variables; never expose service-role credentials.

## Using SiteScribe

1. **Create a project:** supply name, reference, address and client. Optionally upload one PNG/JPEG drawing and enter its reference/revision.
2. **Start a site visit:** enter date and engineer; optionally record weather, scope and limitations. Existing unresolved items are shown before starting.
3. **Capture observations:** take or upload a photo (PNG/JPEG, maximum 8 MB), type or dictate notes, and explicitly choose category, priority and status. Add action, responsibility and due date as applicable. Tap the photo and drawing to add numbered markers; keyboard users can place at the centre and adjust X/Y percentages. Manual drawing references are always available.
4. **Save:** upload progress is separate from the observation save. The form remains unsaved until the server confirms it. Failed saves keep the capture form for retry. Retry uses the same request ID, preventing duplicate items.
5. **Follow up:** select an existing reference in a later visit, supply new notes/photo, and choose Open, In progress or Resolved. This creates evidence on the original item, including when reopening it. The project history and visit evidence retain earlier records.
6. **Generate a report:** deterministic assembly produces a document header, executive summary, scope/conditions, category-based numbered observations with linked figures, follow-up progress, one action register, and a closing summary with missing information. Edit the summary, observation prose and closing narrative in the draft preview. Original notes, classifications, evidence and earlier records remain unchanged. Missing fields explicitly say “Not recorded”; generation adds no engineering judgments.
7. **Review and print:** explicitly check the review declaration and choose **Mark Reviewed & save snapshot**. Only after persistence succeeds, the app opens the exact new version at `/projects/[projectId]/reports/[reportId]/view`, with a Reviewed confirmation and **Print / Save as PDF**, **Back to project**, and **Create new draft** actions. Failed saves keep edits in the editor. Retrying an unchanged submission reuses its snapshot ID rather than creating a duplicate. Printing waits for fonts and image decoding, and pauses if evidence images are unavailable. Use the browser's Save as PDF destination, A4, and disable its default headers/footers if desired.
8. **Revise a reviewed report:** choose **Create new draft** to copy its saved content into a new, numbered Draft version. Further edits and review create additional rows; the Reviewed version stays locked and accessible. Older Reviewed editor URLs also redirect to the locked view. Legacy snapshots retain their original narrative; absent closing/progress information is labelled as not recorded.

The outstanding-items register reflects the project when the report is **assembled**, including when generating a report for an earlier visit. A saved report never refreshes its register silently. Generate a new draft from the visit when you need current records.

## Three-minute demo

- **0:00–0:30:** Sign in and choose **Load demo project**. Open Riverside Works, explicitly marked fictional. Show two visits, one resolved item and two outstanding items. Repeating the loader opens the same demo without overwriting changes.
- **0:30–1:10:** Open the first visit. Show three sample engineer-authored records, the numbered photo markers, and the original schematic drawing. These are clearly labelled illustrative placeholders, not photographs of a real site.
- **1:10–1:50:** Open the second visit. Show OBS-001 resolved with its earlier evidence intact; OBS-002 and OBS-003 remain open. Open a follow-up form and point out typed notes, the dictation option, status and responsibility.
- **1:50–2:35:** Generate the second visit's draft report. Review its linked evidence and register, edit one prose paragraph, and check the explicit review declaration. Save Reviewed.
- **2:35–3:00:** Use **Print / Save as PDF**. Return to the project and show the retained report versions. Explain that later follow-ups never rewrite the reviewed snapshot.

For a fresh capture demo, create a separate project, upload `public/demo/drawing.png` (label it fictional), then use the three illustrative PNGs as sample evidence. The image sources are original geometric drawings in `scripts/create-demo-images.mjs`; regenerate with `node scripts/create-demo-images.mjs`. No licensed brand artwork or external photography is included.

## Security and data model

All five public tables have explicit authenticated grants, RLS, owner indexes and two-account integration coverage. Composite foreign keys reject cross-owner and cross-project parent/child links even through the direct API. Identity comes from `lib/auth.ts`; action inputs never supply ownership. No service-role client exists in app code.

Items hold stable per-project numbers; immutable evidence holds notes, selected classifications, status, photo paths, normalized markers and the exact drawing reference/path used. A transaction locks the project while allocating references and appending evidence. Current status is the latest evidence sequence. Reports store complete JSON snapshots in immutable rows. Editing and review insert new rows.

Uploads go directly to private Storage using narrowly scoped signed upload URLs. Ownership policies restrict paths to the signed-in user. The bucket enforces PNG/JPEG MIME types and 8 MB limits; actions also inspect file signatures before attachment. Original files cannot be overwritten or deleted through the client. Read URLs expire after one hour; refresh the page to renew them. No photos are sent to an external model. Whisper audio is sent to OpenAI only when you stop recording, as explained beside the control.

## Verification

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:integration
```

The integration suite refuses remote URLs and requires this project's loopback port 55431. It creates temporary local users, uses the local SMTP inbox, runs a production build on a temporary free port, and cleans up its own files/users. It does not reset any database. It covers:

- Existing ideas CRUD, auth input validation and preserved email-code signup/login/sign-out.
- Anonymous denial and two-account isolation on all five new tables, immutable ownership, private file reads/signing, and cross-owner/project foreign keys.
- Idempotent capture and demo loading, concurrent item numbering, resolution/reopening and continuity without duplicate items.
- Original file immutability, MIME/size restrictions and stale-drawing rejection.
- Real HTTP Server Actions for project/visit creation and report generation; explicit review confirmation; the exact saved Reviewed destination/status; edited narrative retention; duplicate/conflicting retries; immutable Reviewed versions; and separate later Draft versions.
- Concurrent report version numbering and cross-account source-version rejection.

Unit tests exercise validation, literal deterministic note assembly, missing-information flags, within-visit evidence retention, status continuity and image signatures. Browser checks are separate from the HTTP suite.

## Report workflow verification (2026-09-26)

The report update passed `pnpm lint`, `pnpm typecheck`, all 15 unit tests, `pnpm build`, and the Docker-backed integration suite on the dedicated local database. The report-version migration was applied incrementally without resetting data. Browser verification on the fictional demo covered generation, narrative editing, explicit review, navigation to the exact newly saved Reviewed snapshot, creation and saving of a later draft, preservation of the reviewed narrative, and return to the project. Reviewed documents and draft forms fit 390 px; desktop documents were inspected at 1280 px and all six private evidence images loaded.

Print preparation was exercised. The print stylesheet specifies A4 margins, hides application controls, preserves photo aspect ratios, avoids splitting figures and table rows, and repeats table headers. Native print preview/PDF pagination could not be inspected through the available in-app browser controls; check the final PDF in a browser with a Save as PDF destination before issuing a report.

## MVP boundaries

- Online, individual-account workspace. No offline queue, teams, billing, PDF/CAD drawing ingestion, automatic interpretation or engineering calculations.
- One photo per evidence record; add another follow-up for additional photos. One active project drawing; older evidence retains older drawing revisions.
- Dictation requires microphone permission, HTTPS (or localhost), MediaRecorder and Web Audio support. Typed notes remain available throughout. Verify live microphone behavior on your target phone.
- Abandoned uploads remain private; automatic orphan cleanup and deletion/retention controls are not part of this MVP. Database and storage backups should be configured for an approved production deployment.
- Browser printing varies by platform. The app has A4 print CSS and image-readiness checks; very long notes or tall portrait images may span pages. Validate the final PDF in the engineer's target browser before distribution.
- No AI rewriting is enabled. Whisper transcribes speech only; report assembly remains deterministic and works without an API key.

## Code map

- `app/projects/`: owned Server Component reads and validated Server Actions.
- `components/sitescribe/`: forms, upload progress, dictation/pins, evidence cards and report review.
- `lib/sitescribe.ts`: shared schemas, record types and deterministic report assembly.
- `lib/sitescribe-server.ts`: paginated evidence reads, private image signing and upload checks.
- `supabase/migrations/`: incremental schema, permissions and transactional functions.
- `scripts/sitescribe-integration.ts`: database/storage security and continuity tests.
- `scripts/test-integration.ts`: preserved starter checks plus real production HTTP workflows.

Code is MIT licensed. Inter is the only bundled font; see `THIRD_PARTY_NOTICES.md`.

## Whisper setup and behavior

1. Apply the incremental `20260926030000_transcription_limits.sql` migration using your normal deployment process. For this dedicated local database, use `pnpm supabase migration up --local`; no reset is needed.
2. Set `OPENAI_API_KEY` in server-only `.env.local` or the deployment secret manager, then restart the server. Never use a `NEXT_PUBLIC_` variable for it. `.env.example` contains only a placeholder. If the key expires, rotate it securely; the key created for this local session has a seven-day expiry.
3. Use **Record note**, then **Stop & transcribe**. You can continue typing. Review/edit the transcript and explicitly **Insert into notes** once. Insertion appends to the current notes, including edits made while waiting. Classification and observation saving remain manual.

The integration follows the [official speech-to-text guide](https://developers.openai.com/api/docs/guides/speech-to-text) and calls `/v1/audio/transcriptions` with `whisper-1`. The browser records supported WebM/Opus or MP4 audio and converts it locally to mono 16 kHz PCM WAV. The server checks the WAV header, actual byte-derived duration, silence, ownership and same origin before calling OpenAI. Maximum duration is 120 seconds (3,840,044 bytes); upload reading times out after 10 seconds, provider requests after 45 seconds and client requests after 55 seconds.

The database serializes requests per account, with one active 90-second lease, at most 10 attempts per hour and 30 per day. Retries retain the recording ID and audio digest; a successful cached response prevents another provider submission. Retried IDs conservatively count earlier attempts in their renewed time window. Failed recordings remain only in browser memory until cancellation, replacement, insertion or form unmount; microphone tracks are released on stop/cancel/unmount. Audio is not stored by SiteScribe. Transcript results and request metadata are kept in an inaccessible private database table for retry deduplication; rows older than 24 hours are removed on that account's next request (there is no scheduled deletion). OpenAI's applicable API data handling also applies to audio sent there.

Unit tests cover dictation state transitions, cancellation/stale callbacks, retries, note preservation, single insertion and PCM validation. Provider transport tests are mocked. Integration tests use only the dedicated local database and a placeholder OpenAI key: authentication, origin, ownership, upload validation, two-account RPC isolation, leases, retry caching and limits are tested without calling the provider.

### Verification record (26 September 2026)

`pnpm lint`, `pnpm typecheck`, `pnpm test` (13 tests), `pnpm build` and `pnpm test:integration` passed against the dedicated local stack. The new migration was applied incrementally, without resetting data. Browser checks covered mobile project search, item filtering and follow-up navigation, typed capture/save/continue, link and Back navigation protection, discard/keep-editing behavior, and report review. Capture/report views fit 390 px and desktop project/report views fit 1280 px; private report images loaded. A fictional verification observation and draft report remain in the local demo project.

The browser successfully started and cancelled a real microphone recording without changing typed notes. Separately, one live OpenAI Whisper request transcribed a short local synthetic speech fixture correctly. Unit provider tests are mocked; routine integration tests never call OpenAI. End-to-end spoken transcription on a physical phone and the actual operating-system A4 PDF/print dialog still need device verification.
