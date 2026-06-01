-- Migration: 0004_todo_content_segments
-- Purpose: store rich todo content separately from plain text.

ALTER TABLE public.todos
  ADD COLUMN IF NOT EXISTS content_segments jsonb;

CREATE OR REPLACE FUNCTION public.todo_plain_text_from_legacy_mentions(p_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT btrim(regexp_replace(regexp_replace(coalesce(p_text, ''), '\[\[mention:(person|company|opportunity):[^\]]+\]\]', '', 'g'), '\s+', ' ', 'g'));
$$;

CREATE OR REPLACE FUNCTION public.todo_segments_from_legacy_mentions(p_text text)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  remaining text := coalesce(p_text, '');
  m text[];
  token text;
  idx integer;
  out jsonb := '[]'::jsonb;
BEGIN
  LOOP
    m := regexp_match(remaining, '\[\[mention:(person|company|opportunity):([^\]]+)\]\]');
    EXIT WHEN m IS NULL;
    token := '[[mention:' || m[1] || ':' || m[2] || ']]';
    idx := strpos(remaining, token);
    IF idx > 1 THEN
      out := out || jsonb_build_array(jsonb_build_object('type', 'text', 'text', substr(remaining, 1, idx - 1)));
    END IF;
    out := out || jsonb_build_array(jsonb_build_object('type', 'mention', 'kind', m[1], 'id', m[2], 'label', m[2]));
    remaining := substr(remaining, idx + length(token));
  END LOOP;
  IF remaining <> '' THEN
    out := out || jsonb_build_array(jsonb_build_object('type', 'text', 'text', remaining));
  END IF;
  RETURN out;
END;
$$;

UPDATE public.todos
SET content_segments = public.todo_segments_from_legacy_mentions(text),
    text = public.todo_plain_text_from_legacy_mentions(text)
WHERE content_segments IS NULL
  AND text ~ '\[\[mention:(person|company|opportunity):[^\]]+\]\]';

UPDATE public.todos
SET content_segments = jsonb_build_array(jsonb_build_object('type', 'text', 'text', text))
WHERE content_segments IS NULL
  AND coalesce(text, '') <> '';

DROP FUNCTION public.todo_segments_from_legacy_mentions(text);
DROP FUNCTION public.todo_plain_text_from_legacy_mentions(text);
