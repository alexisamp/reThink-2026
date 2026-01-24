
-- 1. CLEANUP (WIPE EVERYTHING TO START FRESH)
DROP TABLE IF EXISTS habit_logs CASCADE;
DROP TABLE IF EXISTS habits CASCADE;
DROP TABLE IF EXISTS todos CASCADE;
DROP TABLE IF EXISTS milestones CASCADE;
DROP TABLE IF EXISTS goals CASCADE;
DROP TABLE IF EXISTS workbook_entries CASCADE;
DROP TABLE IF EXISTS workbooks CASCADE;
DROP TABLE IF EXISTS reviews CASCADE;
DROP TABLE IF EXISTS strategies CASCADE;
DROP VIEW IF EXISTS view_daily_context;

-- 2. WORKBOOKS (The Root Parent)
CREATE TABLE workbooks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    year TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, year) -- One workbook per year per user
);

-- 3. WORKBOOK ENTRIES (The Content)
CREATE TABLE workbook_entries (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    workbook_id UUID NOT NULL REFERENCES workbooks(id) ON DELETE CASCADE,
    section_key TEXT NOT NULL,
    answer TEXT,
    list_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. GOALS (Strictly linked to Workbook)
CREATE TABLE goals (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    workbook_id UUID NOT NULL REFERENCES workbooks(id) ON DELETE CASCADE, -- CRITICAL FIX: NOT NULL
    text TEXT NOT NULL,
    metric TEXT,
    motivation TEXT,
    status TEXT DEFAULT 'ACTIVE', -- 'ACTIVE', 'BACKLOG', 'COMPLETED'
    leverage JSONB DEFAULT '[]',
    obstacles JSONB DEFAULT '[]',
    needs_config BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. MILESTONES (Linked to Goals)
CREATE TABLE milestones (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    goal_id UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    target_date TEXT,
    status TEXT DEFAULT 'PENDING',
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. HABITS (Linked to Goals)
CREATE TABLE habits (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    goal_id UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    type TEXT DEFAULT 'BINARY', -- 'BINARY', 'SCALE', 'NON_NEGOTIABLE'
    frequency TEXT DEFAULT 'DAILY',
    default_time TEXT,
    reward TEXT,
    target_value INTEGER,
    unit TEXT,
    last_scheduled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. HABIT LOGS (The Daily Data)
CREATE TABLE habit_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    habit_id UUID NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
    log_date TEXT NOT NULL, -- YYYY-MM-DD
    value INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(habit_id, log_date)
);

-- 8. TODOS (Daily Tasks)
CREATE TABLE todos (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    goal_id UUID REFERENCES goals(id) ON DELETE SET NULL, -- Can exist without goal temporarily
    milestone_id UUID REFERENCES milestones(id) ON DELETE SET NULL,
    text TEXT NOT NULL,
    effort TEXT DEFAULT 'SHALLOW', -- 'DEEP', 'SHALLOW'
    block TEXT, -- 'AM', 'PM'
    completed BOOLEAN DEFAULT false,
    completed_at TIMESTAMPTZ,
    date TEXT NOT NULL, -- YYYY-MM-DD
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. REVIEWS (Daily Journaling)
CREATE TABLE reviews (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    date TEXT NOT NULL, -- YYYY-MM-DD
    text TEXT,
    easy_mode BOOLEAN DEFAULT false,
    energy_level INTEGER DEFAULT 3,
    day_rating TEXT DEFAULT 'GRAY',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, date)
);

-- 10. STRATEGIES (Global Rules)
CREATE TABLE strategies (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    tactic TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11. ENABLE RLS (Security)
ALTER TABLE workbooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE workbook_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE habits ENABLE ROW LEVEL SECURITY;
ALTER TABLE habit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE todos ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE strategies ENABLE ROW LEVEL SECURITY;

-- 12. POLICIES (Simple: Users can only see their own data)
CREATE POLICY "Users can all workbooks" ON workbooks FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can all workbook_entries" ON workbook_entries FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can all goals" ON goals FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can all milestones" ON milestones FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can all habits" ON habits FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can all habit_logs" ON habit_logs FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can all todos" ON todos FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can all reviews" ON reviews FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can all strategies" ON strategies FOR ALL USING (auth.uid() = user_id);

-- 13. VIEW: Daily Context (For AI/Reporting)
CREATE OR REPLACE VIEW view_daily_context AS
SELECT 
    hl.user_id,
    hl.log_date,
    h.text as habit_name,
    hl.value as intensity,
    r.text as journal_entry,
    r.day_rating,
    r.energy_level
FROM habit_logs hl
JOIN habits h ON hl.habit_id = h.id
LEFT JOIN reviews r ON hl.user_id = r.user_id AND hl.log_date = r.date;
