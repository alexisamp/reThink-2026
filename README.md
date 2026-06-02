# reThink 2026

Personal operating system for daily focus, relationship work, planning, and positioning.

## Product Map

- `Today` — daily cockpit: one thing, todos, milestones, next steps, journal, and review summary.
- `Review` — Notion and Conversations suggestions are accepted, edited, or dismissed before they write canonical data.
- `People` / `Companies` / `Opportunities` — relationship CRM and active pipeline.
- `Lists` — contextual relationship funnels.
- `Plan` — weekly and monthly planning surface.
- `Playbook` — operational story bank, value bank, scripts, positioning, and LLM context.

Legacy planning screens are intentionally hidden and redirected to `Plan` while the code remains in place for one release cycle.

## Development

```bash
npm install
npm run dev
```

Build:

```bash
npm run build
```

Desktop wrapper:

```bash
npm run tauri dev
```

## Environment

Create `.env.local` with:

```bash
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_GEMINI_API_KEY=...      # optional
VITE_ATTIO_API_KEY=...       # optional
```

## Database

Supabase migrations live in `supabase/migrations`.

Current notable migration:

- `0005_review_queue.sql` adds `review_items` with RLS and duplicate prevention for external-source suggestions.

Apply migrations before using Review Queue in a fresh environment.
