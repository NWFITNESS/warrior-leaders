-- Emails sent log (Admin → Emails): every send (test or real), who it went to, Resend's id per
-- recipient (so delivery can be checked later), failures, and attachment names.
create table wl_email_log (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  actor         text not null,
  mode          text not null check (mode in ('test', 'all')),
  audience      text not null,
  audience_label text,
  subject       text not null,
  attachments   jsonb not null default '[]'::jsonb,  -- [{filename, size}]
  recipients    jsonb not null default '[]'::jsonb,  -- [{email, name, team, resend_id, error, last_event, checked_at}]
  sent          int not null default 0,
  failed        int not null default 0
);
create index wl_email_log_created_idx on wl_email_log(created_at desc);
alter table wl_email_log enable row level security;
create policy "wl staff full access" on wl_email_log for all to authenticated using (wl_is_staff()) with check (wl_is_staff());
