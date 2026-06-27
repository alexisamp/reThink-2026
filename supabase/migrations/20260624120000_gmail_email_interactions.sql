-- Gmail activity capture.
-- Logs one interaction per Gmail message and treats email as a first-class
-- contact channel alongside WhatsApp/LinkedIn/X/Exit5.

ALTER TABLE public.interactions
  ADD COLUMN IF NOT EXISTS external_id text,
  ADD COLUMN IF NOT EXISTS channel text;
CREATE UNIQUE INDEX IF NOT EXISTS interactions_external_id_unique
  ON public.interactions(user_id, contact_id, external_id)
  WHERE external_id IS NOT NULL;
DO $$
DECLARE
  constraint_name text;
BEGIN
  IF to_regclass('public.contact_channels') IS NULL THEN
    RETURN;
  END IF;

  FOR constraint_name IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.contact_channels'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%channel%'
  LOOP
    EXECUTE format('ALTER TABLE public.contact_channels DROP CONSTRAINT %I', constraint_name);
  END LOOP;

  ALTER TABLE public.contact_channels
    ADD CONSTRAINT contact_channels_channel_check
    CHECK (channel IN ('whatsapp','wa','linkedin','exit5','x','email'));
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS contact_channels_unique
  ON public.contact_channels(channel, channel_identifier);
