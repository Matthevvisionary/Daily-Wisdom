import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ALLOWED_CATEGORIES = new Set([
  'General Feedback',
  'Feature Request',
  'Bug Report',
]);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_MESSAGE_LENGTH = 5000;
const MAX_EMAIL_LENGTH = 254;

function allowedOrigins() {
  return (Deno.env.get('ALLOWED_ORIGINS') ?? 'https://daily-inspo.app,https://www.daily-inspo.app')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function responseHeaders(origin: string | null) {
  const origins = allowedOrigins();
  const allowedOrigin = origin && origins.includes(origin) ? origin : origins[0];

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
    'Vary': 'Origin',
  };
}

function json(body: Record<string, unknown>, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders(origin),
  });
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

Deno.serve(async (request) => {
  const origin = request.headers.get('Origin');
  const origins = allowedOrigins();

  if (origin && !origins.includes(origin)) {
    return json({ error: 'Origin is not allowed.' }, 403, origin);
  }

  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: responseHeaders(origin) });
  }

  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed.' }, 405, origin);
  }

  let payload: { category?: unknown; message?: unknown; email?: unknown };
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'Invalid feedback submission.' }, 400, origin);
  }

  const category = typeof payload.category === 'string' ? payload.category.trim() : '';
  const message = typeof payload.message === 'string' ? payload.message.trim() : '';
  const email = typeof payload.email === 'string' ? payload.email.trim() : '';

  if (!ALLOWED_CATEGORIES.has(category)) {
    return json({ error: 'Invalid feedback category.' }, 400, origin);
  }

  if (!message || message.length > MAX_MESSAGE_LENGTH) {
    return json({ error: 'Invalid feedback message.' }, 400, origin);
  }

  if (email && (email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email))) {
    return json({ error: 'Invalid email address.' }, 400, origin);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  const toEmail = Deno.env.get('FEEDBACK_TO_EMAIL');
  const fromEmail = Deno.env.get('RESEND_FROM_EMAIL');

  if (!supabaseUrl || !anonKey || !serviceRoleKey || !resendApiKey || !toEmail || !fromEmail) {
    console.error('Feedback function is missing required environment variables.');
    return json({ error: 'Feedback is temporarily unavailable.' }, 503, origin);
  }

  const authorization = request.headers.get('Authorization');
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: {
      headers: authorization ? { Authorization: authorization } : {},
    },
  });
  const feedbackId = crypto.randomUUID();

  // Insert with the caller's anonymous or authenticated JWT. This makes the
  // public feedback RLS policy and user-ID trigger authoritative.
  const { error: insertError } = await callerClient
    .from('feedback')
    .insert({
      id: feedbackId,
      email: email || null,
      category,
      message,
    });

  if (insertError) {
    console.error('Could not store feedback:', insertError);
    return json({ error: 'Feedback could not be stored.' }, 500, origin);
  }

  // Reading feedback is never granted to browser roles. Only this server-side
  // client can fetch the record needed to compose the email notification.
  const serviceClient = createClient(supabaseUrl, serviceRoleKey);
  const { data: feedback, error: readError } = await serviceClient
    .from('feedback')
    .select('id, user_id, email, category, message, created_at')
    .eq('id', feedbackId)
    .single();

  if (readError || !feedback) {
    console.error('Feedback was stored but could not be read for notification:', readError);
    return json({ error: 'Feedback could not be stored.' }, 500, origin);
  }

  const submittedAt = new Date(feedback.created_at).toISOString();
  const emailText = feedback.email || 'Not provided';
  const userIdText = feedback.user_id || 'Guest';
  const escapedMessage = escapeHtml(feedback.message).replaceAll('\n', '<br>');

  const resendResponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [toEmail],
      subject: `[Daily Inspo] ${feedback.category}`,
      text: [
        'New Daily Inspo feedback',
        '',
        `Category: ${feedback.category}`,
        `Email: ${emailText}`,
        `User ID: ${userIdText}`,
        `Submitted: ${submittedAt}`,
        '',
        'Message:',
        feedback.message,
      ].join('\n'),
      html: `
        <h2>New Daily Inspo feedback</h2>
        <p><strong>Category:</strong> ${escapeHtml(feedback.category)}<br>
        <strong>Email:</strong> ${escapeHtml(emailText)}<br>
        <strong>User ID:</strong> ${escapeHtml(userIdText)}<br>
        <strong>Submitted:</strong> ${escapeHtml(submittedAt)}</p>
        <p><strong>Message:</strong><br>${escapedMessage}</p>
      `,
    }),
  });

  if (!resendResponse.ok) {
    // The record is already safely retained in Supabase. Log only the provider
    // response for operators; never expose it to the person sending feedback.
    console.error('Feedback stored but Resend notification failed:', await resendResponse.text());
    await serviceClient
      .from('feedback')
      .update({ status: 'notification_failed' })
      .eq('id', feedback.id);
    return json({ stored: true, notified: false }, 202, origin);
  }

  return json({ stored: true, notified: true }, 201, origin);
});
