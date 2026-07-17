create or replace view public.outreach_daily_metric_contacts
with (security_invoker = true)
as
with normalized as (
  select
    event.id,
    event.user_id,
    event.contact_id,
    event.occurred_on,
    event.occurred_at,
    event.event_type,
    case
      when event.event_type in ('request_sent', 'follow_up_sent', 'reached') then 'reached'
      when event.event_type in ('accepted_detected', 'accepted') then 'accepted'
      when event.event_type in ('inbound_reply_received', 'replies') then 'replies'
      when event.event_type in ('meeting_requested', 'meeting_scheduled', 'meetings') then 'meetings'
      when event.event_type in ('intro_made', 'intros') then 'intros'
      else null
    end as metric
  from public.outreach_events event
), ranked as (
  select normalized.*,
         row_number() over (
           partition by user_id, occurred_on, contact_id, metric
           order by occurred_at, id
         ) as metric_rank
  from normalized
  where metric is not null
)
select id, user_id, contact_id, occurred_on, occurred_at, event_type, metric
from ranked
where metric_rank = 1;

grant select on public.outreach_daily_metric_contacts to authenticated;
