-- Fire the column-scoped automation trigger for recent LinkedIn details that
-- were written before the trigger existed.
update public.interaction_details
set excerpts = excerpts
where channel = 'linkedin'
  and coalesce(window_end, window_start, created_at) >= now() - interval '14 days'
  and exists (
    select 1
    from jsonb_array_elements(excerpts) as excerpt
    where excerpt->>'direction' = 'inbound'
  );
