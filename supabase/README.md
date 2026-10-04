# Daily Inspo Supabase setup

This directory contains the database migration and the `submit-feedback` Edge
Function used by the in-app feedback form. The browser never receives a
service-role key or an email-provider key.

## 1. Create the feedback table and policies

1. Open your Supabase project dashboard.
2. Go to **SQL Editor** and choose **New query**.
3. Paste the complete contents of
   [`migrations/20261003000000_create_feedback.sql`](migrations/20261003000000_create_feedback.sql).
4. Click **Run**.
5. In **Table Editor**, confirm that `public.feedback` exists. Do not add a
   browser-facing SELECT, UPDATE, or DELETE policy for it.

The migration enables RLS. The `anon` and `authenticated` roles can insert a
validated record only; they cannot read, edit, or delete feedback. A trigger
sets `user_id` from the authenticated caller, so a client cannot choose another
user's ID. Guest submissions keep `user_id` null.

## 2. Configure Resend and Edge Function secrets

1. In Resend, verify a sending domain you control (for example
   `daily-inspo.app`) and create an API key with permission to send email.
2. In Supabase Dashboard, open **Edge Functions** → **Secrets** and add:

   | Name | Value |
   | --- | --- |
   | `FEEDBACK_TO_EMAIL` | `support@daily-inspo.app` |
   | `RESEND_API_KEY` | Your Resend API key |
   | `RESEND_FROM_EMAIL` | A verified sender, e.g. `Daily Inspo Feedback <feedback@daily-inspo.app>` |
   | `ALLOWED_ORIGINS` | `https://daily-inspo.app,https://www.daily-inspo.app` |

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are
supplied to deployed Supabase Edge Functions by Supabase. Do not put the
service-role value in the frontend, and do not add it to a checked-in `.env`
file.

## 3. Deploy the Edge Function

In **Edge Functions**, create a function named `submit-feedback`, replace its
source with the contents of
[`functions/submit-feedback/index.ts`](functions/submit-feedback/index.ts),
and deploy it. Keep JWT verification enabled; the deployed configuration in
[`config.toml`](config.toml) explicitly sets `verify_jwt = true`.

Alternatively, with the Supabase CLI linked to this project, deploy the checked
in function with:

```bash
supabase functions deploy submit-feedback
```

Then set the same secrets through the Dashboard or `supabase secrets set`.

The function validates and trims the request, writes with the caller's own
anonymous or authenticated token (so the database trigger records the current
user when available), then uses its server-only service role only to read the
new record and call Resend. If Resend is unavailable, the feedback remains
stored, its status is set to `notification_failed`, and the provider failure is
recorded in the Edge Function logs; no provider detail is returned to the app.
