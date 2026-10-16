# Datasheet Questionnaire Builder

A Vercel-ready Next.js app for turning long industrial datasheets into end-user configuration questionnaires and live part-number previews.

## What It Does

- Reads PDF text in the browser, so large datasheet files are not posted directly to a serverless function.
- Runs browser OCR on pages that have little or no embedded text.
- Splits extracted text into safe chunks for Vercel API routes.
- Uses the OpenAI Responses API with structured JSON output to extract ordering tables, option codes, constraints, and part-number patterns.
- Synthesizes chunk results into a questionnaire with cited source pages.
- Lets users answer the generated questions and preview a part number.
- Provides an AI refinement chat for correcting fields, option codes, citations, and part-number logic after generation.
- Saves, loads, and deletes generated datasheets in Neon Postgres.
- Exports customer-ready questionnaire PDFs.
- Exports the generated questionnaire, answers, and part-number preview as JSON.

## Local Setup

```bash
npm install
npm run dev
```

On Windows PowerShell, `npm run dev` can fail before the app starts if script execution is disabled for `npm.ps1`. Use one of these project-local alternatives:

```powershell
npm.cmd run dev
.\dev.cmd
```

Create `.env.local` from `.env.example`:

```bash
OPENAI_API_KEY=your_api_key_here
OPENAI_MODEL=gpt-5.4-mini
DATABASE_URL=your_neon_connection_string
ADMIN_PASSWORD=choose_a_shared_admin_password
ADMIN_SESSION_SECRET=a_random_long_string
```

`OPENAI_MODEL` is optional. `gpt-5.4-mini` is a cost-aware default for extraction workloads. Use `gpt-5.5` for harder datasheets when accuracy matters more than cost.

`ADMIN_PASSWORD`, and `ADMIN_SESSION_SECRET` are only needed for the `/admin` vendor/branch/contact directory section (see below). `ADMIN_SESSION_SECRET` can be any long random string, e.g. from `openssl rand -hex 32`.

## Database Setup (Neon)

1. In Vercel, open the project -> Storage -> Create Database -> Neon (Free plan) and connect it to this project. Vercel adds `DATABASE_URL` automatically.
2. For local dev, copy the `DATABASE_URL` value from the Neon dashboard (Connection string) into `.env.local`.
3. Restart the dev server.

Tables (`datasheets`, `vendor_directory`, `admin_uploads`) are created automatically on first request. All database access goes through server-side API routes (`/api/datasheets`, `/api/admin/vendor-directory`), so the connection string never reaches the browser. The `supabase-schema*.sql` files are kept only for reference.

## Admin: Vendor / Branch / Contact Directory

Visit `/admin` to upload Excel/PDF files that map vendors or product lines to an MCE branch and contact. Log in with `ADMIN_PASSWORD`. Uploaded files are read client-side (same PDF/XLSX extraction as the rest of the app), sent to the server to be parsed into structured rows via OpenAI, then reviewed and edited before being saved to the `vendor_directory` table. The Part Sourcer recommendation flow (`/api/source-part`) reads this table and will surface a matching branch/contact alongside its MCE group/line-card recommendation.

## Vercel Deployment

1. Push this folder to GitHub.
2. Import the repository in Vercel.
3. Add `OPENAI_API_KEY` in Project Settings -> Environment Variables.
4. Optionally add `OPENAI_MODEL`.
5. Connect a Neon database from Vercel Storage (adds `DATABASE_URL`) for saved datasheets.
6. Add `ADMIN_PASSWORD`, and `ADMIN_SESSION_SECRET` if using the `/admin` vendor directory section.
7. Deploy.

The app intentionally extracts PDF text client-side because Vercel Functions have request and response payload limits. Chunking also keeps each AI call easier to retry if a long datasheet has one troublesome section.

## Notes

- Searchable PDFs extract fastest. Scanned image-only pages are OCR'd in the browser and can take noticeably longer on large catalogs.
- The generated questionnaire includes review notes for ambiguous or missing evidence.
- Part-number previews are evidence-based, not a replacement for manufacturer validation.

## Sources

- Vercel Functions limits: https://vercel.com/docs/functions/limitations
- OpenAI Responses API: https://platform.openai.com/docs/api-reference/responses
- OpenAI Structured Outputs: https://platform.openai.com/docs/guides/structured-outputs
- OpenAI model selection: https://developers.openai.com/api/docs/models
