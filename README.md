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
- Saves, loads, and deletes generated datasheets in Supabase.
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
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

`OPENAI_MODEL` is optional. `gpt-5.4-mini` is a cost-aware default for extraction workloads. Use `gpt-5.5` for harder datasheets when accuracy matters more than cost.

## Supabase Setup

1. Create a Supabase project.
2. Open the SQL editor and run `supabase-schema.sql`.
3. Copy the project URL and anon public key into `.env.local`.
4. Restart the dev server.

The included schema allows anonymous reads, inserts, updates, and deletes so the local app works without authentication. For a production customer portal, add Supabase Auth and tighten the row-level security policies before deployment.

## Vercel Deployment

1. Push this folder to GitHub.
2. Import the repository in Vercel.
3. Add `OPENAI_API_KEY` in Project Settings -> Environment Variables.
4. Optionally add `OPENAI_MODEL`.
5. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` if using saved datasheets.
6. Deploy.

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
