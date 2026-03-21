# Database Migrations for reThink Auto-Capture Extension

This directory contains SQL migrations required for the reThink Auto-Capture browser extension to function.

## Overview

The extension auto-detects interactions from WhatsApp Web and LinkedIn, and requires these new database tables:

1. **contact_phone_mappings** - Maps phone numbers to contacts for WhatsApp detection
2. **extension_interaction_windows** - Tracks 6-hour windows to group messages into interactions
3. **Performance indexes** - Optimizes frequent queries from the extension

## How to Run These Migrations

### Using Supabase SQL Editor (Recommended)

1. Open your Supabase project: https://supabase.com/dashboard/project/amvezbymrnvrwcypivkf
2. Navigate to **SQL Editor** in the left sidebar
3. Click **New Query**
4. Copy and paste the contents of each migration file **in order**:
   - First: `001_contact_phone_mappings.sql`
   - Second: `002_extension_interaction_windows.sql`
   - Third: `003_performance_indexes.sql`
5. Click **Run** for each migration
6. Verify no errors appear in the console

### Verification

After running all migrations, verify in the **Table Editor**:

- [ ] `contact_phone_mappings` table exists
- [ ] `extension_interaction_windows` table exists
- [ ] Both tables have RLS enabled (lock icon visible)
- [ ] RLS policies show 4 policies each (SELECT, INSERT, UPDATE, DELETE)

You can also verify indexes exist by running:

```sql
SELECT indexname, tablename
FROM pg_indexes
WHERE tablename IN ('contact_phone_mappings', 'extension_interaction_windows', 'interactions')
ORDER BY tablename, indexname;
```

Expected indexes:
- `idx_contact_phone_mappings_user_contact`
- `idx_contact_phone_mappings_phone`
- `idx_extension_windows_user_contact`
- `idx_extension_windows_active`
- `idx_interactions_contact_date`

## Dependencies

These migrations depend on:
- Existing `auth.users` table (Supabase Auth)
- Existing `outreach_logs` table (reThink contacts)
- Existing `interactions` table (reThink interaction logs)
- Existing `update_updated_at_column()` function (Supabase helper)

If any of these are missing, the migrations will fail with FK constraint errors.

## Rollback

If you need to rollback these migrations:

```sql
-- Drop in reverse order
DROP INDEX IF EXISTS idx_interactions_contact_date;
DROP TABLE IF EXISTS extension_interaction_windows CASCADE;
DROP TABLE IF EXISTS contact_phone_mappings CASCADE;
DROP FUNCTION IF EXISTS cleanup_expired_windows();
```

⚠️ **Warning:** This will delete all data in these tables. Only rollback if necessary.

## Maintenance

The `extension_interaction_windows` table will accumulate old rows over time. To clean up expired windows (older than 7 days):

```sql
SELECT cleanup_expired_windows();
```

You can set up a Supabase cron job to run this weekly, or call it manually as needed.
