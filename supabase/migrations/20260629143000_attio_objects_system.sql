-- Attio-style CRM Objects foundation.
-- Keeps existing People/Companies/Opportunities tables intact and adds metadata,
-- custom object records, and an Attio-ready object access model.

CREATE TABLE IF NOT EXISTS public.crm_workspace_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  member_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  name text,
  role text NOT NULL DEFAULT 'admin' CHECK (role IN ('admin','member')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, member_user_id)
);

CREATE TABLE IF NOT EXISTS public.crm_teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.crm_team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.crm_teams(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.crm_workspace_members(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_id, member_id)
);

CREATE TABLE IF NOT EXISTS public.crm_objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  slug text NOT NULL,
  singular_name text NOT NULL,
  plural_name text NOT NULL,
  icon text,
  object_type text NOT NULL CHECK (object_type IN ('standard','custom')),
  standard_key text CHECK (standard_key IS NULL OR standard_key IN ('people','companies','deals','users','workspaces')),
  backing_source text NOT NULL DEFAULT 'generic' CHECK (backing_source IN ('people','companies','deals','generic')),
  is_enabled boolean NOT NULL DEFAULT true,
  is_archived boolean NOT NULL DEFAULT false,
  record_text_attribute_id uuid,
  record_image_attribute_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, slug)
);

CREATE TABLE IF NOT EXISTS public.crm_attributes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  object_id uuid NOT NULL REFERENCES public.crm_objects(id) ON DELETE CASCADE,
  key text NOT NULL,
  name text NOT NULL,
  attribute_type text NOT NULL,
  scope text NOT NULL DEFAULT 'object' CHECK (scope IN ('object','system')),
  source text NOT NULL DEFAULT 'custom' CHECK (source IN ('system','custom','enriched','relationship')),
  is_system boolean NOT NULL DEFAULT false,
  is_enriched boolean NOT NULL DEFAULT false,
  is_relationship boolean NOT NULL DEFAULT false,
  is_required boolean NOT NULL DEFAULT false,
  is_unique boolean NOT NULL DEFAULT false,
  is_editable boolean NOT NULL DEFAULT true,
  description text,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (object_id, key)
);

CREATE TABLE IF NOT EXISTS public.crm_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  object_id uuid NOT NULL REFERENCES public.crm_objects(id) ON DELETE CASCADE,
  title text NOT NULL,
  image_url text,
  values jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  is_archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.crm_object_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  object_id uuid NOT NULL REFERENCES public.crm_objects(id) ON DELETE CASCADE,
  subject_type text NOT NULL CHECK (subject_type IN ('workspace','team','member','automation')),
  subject_id uuid,
  label text,
  access_level text NOT NULL DEFAULT 'read_write' CHECK (access_level IN ('read_only','read_write','full_access')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS crm_object_permissions_unique_workspace
  ON public.crm_object_permissions(object_id, subject_type)
  WHERE subject_type = 'workspace';

CREATE UNIQUE INDEX IF NOT EXISTS crm_object_permissions_unique_subject
  ON public.crm_object_permissions(object_id, subject_type, subject_id)
  WHERE subject_type <> 'workspace' AND subject_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_crm_objects_user_enabled
  ON public.crm_objects(user_id, is_enabled, is_archived);
CREATE INDEX IF NOT EXISTS idx_crm_attributes_object
  ON public.crm_attributes(object_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_crm_records_object
  ON public.crm_records(object_id, created_at DESC)
  WHERE NOT is_archived;
CREATE INDEX IF NOT EXISTS idx_crm_records_values
  ON public.crm_records USING gin(values);
CREATE INDEX IF NOT EXISTS idx_crm_permissions_object
  ON public.crm_object_permissions(object_id);

ALTER TABLE public.crm_objects
  ADD CONSTRAINT crm_objects_people_companies_enabled
  CHECK (NOT (object_type = 'standard' AND slug IN ('people', 'companies') AND is_enabled = false));

CREATE TRIGGER crm_workspace_members_updated_at
  BEFORE UPDATE ON public.crm_workspace_members
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER crm_teams_updated_at
  BEFORE UPDATE ON public.crm_teams
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER crm_objects_updated_at
  BEFORE UPDATE ON public.crm_objects
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER crm_attributes_updated_at
  BEFORE UPDATE ON public.crm_attributes
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER crm_records_updated_at
  BEFORE UPDATE ON public.crm_records
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER crm_object_permissions_updated_at
  BEFORE UPDATE ON public.crm_object_permissions
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.crm_workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_attributes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_object_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "crm_workspace_members_owner_all" ON public.crm_workspace_members
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "crm_teams_owner_all" ON public.crm_teams
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "crm_team_members_owner_all" ON public.crm_team_members
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "crm_objects_owner_all" ON public.crm_objects
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "crm_attributes_owner_all" ON public.crm_attributes
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "crm_records_owner_all" ON public.crm_records
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "crm_object_permissions_owner_all" ON public.crm_object_permissions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Seed Attio standard objects for existing users. The frontend also runs an
-- idempotent seed for future users, but this makes the migration immediately
-- usable after it is applied.
INSERT INTO public.crm_workspace_members (user_id, member_user_id, email, name, role)
SELECT
  u.id,
  u.id,
  u.email,
  COALESCE(u.raw_user_meta_data ->> 'full_name', u.email),
  'admin'
FROM auth.users u
ON CONFLICT (user_id, member_user_id) DO NOTHING;

WITH standard_objects(slug, singular_name, plural_name, icon, standard_key, backing_source, is_enabled) AS (
  VALUES
    ('people', 'Person', 'People', '👤', 'people', 'people', true),
    ('companies', 'Company', 'Companies', '🏢', 'companies', 'companies', true),
    ('deals', 'Deal', 'Deals', '◎', 'deals', 'deals', true),
    ('users', 'User', 'Users', '◉', 'users', 'generic', false),
    ('workspaces', 'Workspace', 'Workspaces', '◆', 'workspaces', 'generic', false)
)
INSERT INTO public.crm_objects (
  user_id,
  slug,
  singular_name,
  plural_name,
  icon,
  object_type,
  standard_key,
  backing_source,
  is_enabled
)
SELECT
  u.id,
  so.slug,
  so.singular_name,
  so.plural_name,
  so.icon,
  'standard',
  so.standard_key,
  so.backing_source,
  so.is_enabled
FROM auth.users u
CROSS JOIN standard_objects so
ON CONFLICT (user_id, slug) DO NOTHING;

WITH attrs(slug, key, name, attribute_type, source, is_system, is_enriched, is_relationship, is_required, is_unique, is_editable, sort_order) AS (
  VALUES
    ('people','name','Name','Text','system',true,false,false,true,false,true,10),
    ('people','email','Email addresses','Email','system',true,false,false,false,true,true,20),
    ('people','company','Company','Relationship','relationship',false,false,true,false,false,true,30),
    ('people','job_title','Job title','Text','enriched',false,true,false,false,false,true,40),
    ('people','phone_numbers','Phone numbers','Phone','system',true,false,false,false,false,true,50),
    ('people','owner','Owner','User','system',true,false,false,false,false,true,60),
    ('people','profile_picture_url','Profile picture','URL','enriched',false,true,false,false,false,true,70),
    ('people','description','Description','Text','enriched',false,true,false,false,false,true,80),
    ('people','location','Primary location','Location','enriched',false,true,false,false,false,true,90),
    ('people','facebook_url','Facebook','URL','enriched',false,true,false,false,false,true,100),
    ('people','linkedin_url','LinkedIn','URL','enriched',false,true,false,false,false,true,110),
    ('people','twitter_url','Twitter','URL','enriched',false,true,false,false,false,true,120),
    ('people','angellist_url','AngelList','URL','enriched',false,true,false,false,false,true,130),
    ('people','instagram_url','Instagram','URL','custom',false,false,false,false,false,true,140),
    ('people','employee_range','Employee range','Number','enriched',false,true,false,false,false,true,150),
    ('people','twitter_follower_count','Twitter follower count','Number','enriched',false,true,false,false,false,true,160),
    ('people','first_interaction','First interaction','Interaction','enriched',false,true,false,false,false,false,170),
    ('people','last_interaction_at','Last interaction','Timestamp','enriched',false,true,false,false,false,false,180),
    ('people','next_interaction','Next interaction','Interaction','enriched',false,true,false,false,false,false,190),
    ('people','connection_strength','Connection strength','Number','enriched',false,true,false,false,false,false,200),
    ('people','strongest_connection','Strongest connection','User','enriched',false,true,false,false,false,false,210),
    ('people','associated_deals','Associated deals','Relationship','relationship',false,false,true,false,false,true,220),
    ('people','associated_companies','Associated companies','Relationship','relationship',false,false,true,false,false,true,230),
    ('people','associated_users','Associated users','Relationship','relationship',false,false,true,false,false,true,240),
    ('people','associated_workspaces','Associated workspaces','Relationship','relationship',false,false,true,false,false,true,250),

    ('companies','name','Name','Text','enriched',true,true,false,true,false,true,10),
    ('companies','domain','Domains','Domain','system',true,false,false,false,true,true,20),
    ('companies','team','Team','Relationship','relationship',false,true,true,false,false,true,30),
    ('companies','logo_url','Logo','URL','enriched',false,true,false,false,false,true,40),
    ('companies','description','Description','Text','enriched',false,true,false,false,false,true,50),
    ('companies','sector','Categories','Multi-select','enriched',false,true,false,false,false,true,60),
    ('companies','hq_location','Primary location','Location','enriched',false,true,false,false,false,true,70),
    ('companies','facebook_url','Facebook','URL','enriched',false,true,false,false,false,true,80),
    ('companies','linkedin_url','LinkedIn','URL','enriched',false,true,false,false,false,true,90),
    ('companies','twitter_url','Twitter','URL','enriched',false,true,false,false,false,true,100),
    ('companies','angellist_url','AngelList','URL','enriched',false,true,false,false,false,true,110),
    ('companies','instagram_url','Instagram','URL','custom',false,false,false,false,false,true,120),
    ('companies','twitter_follower_count','Twitter follower count','Number','enriched',false,true,false,false,false,true,130),
    ('companies','estimated_arr','Estimated ARR','Currency','enriched',false,true,false,false,false,false,140),
    ('companies','funding_raised','Funding raised','Currency','enriched',false,true,false,false,false,true,150),
    ('companies','founded_year','Foundation date','Date','enriched',false,true,false,false,false,true,160),
    ('companies','employees_count','Employee range','Number','enriched',false,true,false,false,false,true,170),
    ('companies','first_interaction','First interaction','Interaction','enriched',false,true,false,false,false,false,180),
    ('companies','last_interaction','Last interaction','Interaction','enriched',false,true,false,false,false,false,190),
    ('companies','next_interaction','Next interaction','Interaction','enriched',false,true,false,false,false,false,200),
    ('companies','connection_strength','Connection strength','Number','enriched',false,true,false,false,false,false,210),
    ('companies','strongest_connection','Strongest connection','User','enriched',false,true,false,false,false,false,220),
    ('companies','associated_deals','Associated deals','Relationship','relationship',false,false,true,false,false,true,230),
    ('companies','associated_workspaces','Associated workspaces','Relationship','relationship',false,false,true,false,false,true,240),

    ('deals','title','Deal name','Text','system',true,false,false,true,false,true,10),
    ('deals','owner','Deal owner','User','system',true,false,false,true,false,true,20),
    ('deals','stage','Deal stage','Status','system',true,false,false,true,false,true,30),
    ('deals','estimated_value','Deal value','Currency','system',true,false,false,false,false,true,40),
    ('deals','company_id','Associated company','Relationship','relationship',false,false,true,false,false,true,50),
    ('deals','associated_people','Associated people','Relationship','relationship',false,false,true,false,false,true,60),

    ('users','user_id','User ID','Text','system',true,false,false,true,true,true,10),
    ('users','primary_email','Primary email address','Email','system',true,false,false,true,true,true,20),
    ('users','workspaces','Workspaces','Relationship','relationship',false,false,true,false,false,true,30),
    ('users','person','Person','Relationship','relationship',false,false,true,false,false,true,40),

    ('workspaces','workspace_id','Workspace ID','Text','system',true,false,false,true,true,true,10),
    ('workspaces','name','Name','Text','system',true,false,false,true,false,true,20),
    ('workspaces','users','Users','Relationship','relationship',false,false,true,false,false,true,30),
    ('workspaces','company','Company','Relationship','relationship',false,false,true,false,false,true,40),

    ('people','record_id','Record ID','Record ID','system',true,false,false,false,true,false,900),
    ('companies','record_id','Record ID','Record ID','system',true,false,false,false,true,false,900),
    ('deals','record_id','Record ID','Record ID','system',true,false,false,false,true,false,900),
    ('users','record_id','Record ID','Record ID','system',true,false,false,false,true,false,900),
    ('workspaces','record_id','Record ID','Record ID','system',true,false,false,false,true,false,900),
    ('people','list_entries','List Entries','Relationship','system',true,false,true,false,false,false,910),
    ('companies','list_entries','List Entries','Relationship','system',true,false,true,false,false,false,910),
    ('deals','list_entries','List Entries','Relationship','system',true,false,true,false,false,false,910),
    ('users','list_entries','List Entries','Relationship','system',true,false,true,false,false,false,910),
    ('workspaces','list_entries','List Entries','Relationship','system',true,false,true,false,false,false,910),
    ('people','next_due_task','Next due task','Date','system',true,false,false,false,false,false,920),
    ('companies','next_due_task','Next due task','Date','system',true,false,false,false,false,false,920),
    ('deals','next_due_task','Next due task','Date','system',true,false,false,false,false,false,920),
    ('users','next_due_task','Next due task','Date','system',true,false,false,false,false,false,920),
    ('workspaces','next_due_task','Next due task','Date','system',true,false,false,false,false,false,920),
    ('people','created_at','Created at','Timestamp','system',true,false,false,false,false,false,930),
    ('companies','created_at','Created at','Timestamp','system',true,false,false,false,false,false,930),
    ('deals','created_at','Created at','Timestamp','system',true,false,false,false,false,false,930),
    ('users','created_at','Created at','Timestamp','system',true,false,false,false,false,false,930),
    ('workspaces','created_at','Created at','Timestamp','system',true,false,false,false,false,false,930),
    ('people','created_by','Created by','User','system',true,false,false,false,false,false,940),
    ('companies','created_by','Created by','User','system',true,false,false,false,false,false,940),
    ('deals','created_by','Created by','User','system',true,false,false,false,false,false,940),
    ('users','created_by','Created by','User','system',true,false,false,false,false,false,940),
    ('workspaces','created_by','Created by','User','system',true,false,false,false,false,false,940)
)
INSERT INTO public.crm_attributes (
  user_id,
  object_id,
  key,
  name,
  attribute_type,
  scope,
  source,
  is_system,
  is_enriched,
  is_relationship,
  is_required,
  is_unique,
  is_editable,
  sort_order
)
SELECT
  o.user_id,
  o.id,
  a.key,
  a.name,
  a.attribute_type,
  CASE WHEN a.is_system THEN 'system' ELSE 'object' END,
  a.source,
  a.is_system,
  a.is_enriched,
  a.is_relationship,
  a.is_required,
  a.is_unique,
  a.is_editable,
  a.sort_order
FROM public.crm_objects o
JOIN attrs a ON a.slug = o.slug
WHERE o.object_type = 'standard'
ON CONFLICT (object_id, key) DO NOTHING;

INSERT INTO public.crm_object_permissions (user_id, object_id, subject_type, subject_id, label, access_level)
SELECT
  o.user_id,
  o.id,
  'workspace',
  NULL,
  'Workspace access',
  'read_write'
FROM public.crm_objects o
WHERE o.object_type = 'standard'
ON CONFLICT DO NOTHING;
