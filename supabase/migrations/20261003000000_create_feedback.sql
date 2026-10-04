-- Feedback is intentionally append-only for browser clients. The Edge Function
-- uses its server-only service role only after insert, for notification work.
create extension if not exists pgcrypto;

create table if not exists public.feedback (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references auth.users(id) on delete set null,
    email text,
    category text not null check (category in ('General Feedback', 'Feature Request', 'Bug Report')),
    message text not null check (char_length(btrim(message)) between 1 and 5000),
    status text not null default 'new',
    created_at timestamptz not null default now(),
    constraint feedback_email_is_valid check (
        email is null
        or (
            email = btrim(email)
            and char_length(email) between 3 and 254
            and email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
        )
    )
);

-- Do not trust a user_id sent by the browser. For normal client inserts this
-- assigns the authenticated caller, while anonymous feedback remains null.
create or replace function public.assign_feedback_user_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    -- Preserve a user_id only for a trusted server-side write. Browser inserts
    -- always receive their authenticated caller's ID (or null for a guest).
    if auth.role() = 'service_role' then
        return new;
    end if;

    new.user_id := auth.uid();
    return new;
end;
$$;

drop trigger if exists set_feedback_user_id on public.feedback;
create trigger set_feedback_user_id
before insert on public.feedback
for each row execute function public.assign_feedback_user_id();

alter table public.feedback enable row level security;

-- Browser roles get exactly one capability: create a feedback record. There
-- are deliberately no SELECT, UPDATE, or DELETE policies for either role.
revoke all on table public.feedback from anon, authenticated;
grant insert on table public.feedback to anon, authenticated;

create policy "Anyone can submit feedback"
on public.feedback
for insert
to anon, authenticated
with check (
    category in ('General Feedback', 'Feature Request', 'Bug Report')
    and char_length(btrim(message)) between 1 and 5000
    and (
        email is null
        or (
            email = btrim(email)
            and char_length(email) between 3 and 254
            and email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
        )
    )
);

revoke execute on function public.assign_feedback_user_id() from public, anon, authenticated;
