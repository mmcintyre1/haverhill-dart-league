// Self-instrumented Netlify Function invocation tracking, since Netlify's own
// API/UI expose no account-wide usage numbers -- see site-admin's snapshot.mjs.
// The anon key below is intentionally public (RLS protects the data, not the
// key), same as any other Supabase anon key already embedded client-side
// elsewhere in this portfolio.

const SUPABASE_URL = "https://iqzmlnefqkkvcmckfnqf.supabase.co";
const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlxem1sbmVmcWtrdmNtY2tmbnFmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2MjM5OTgsImV4cCI6MjA4NzE5OTk5OH0.AnTuMzAKR1xI1CdnIRzjWrL2iZFZMBbCqWydKUka8Os";
const SITE = "haverhill-dart-league";

export function logInvocation(route: string) {
  fetch(`${SUPABASE_URL}/rest/v1/function_invocations`, {
    method: "POST",
    headers: {
      apikey: ANON_KEY,
      "Content-Type": "application/json",
      "Content-Profile": "telemetry",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ site: SITE, route }),
  }).catch(() => {
    // fire-and-forget -- never blocks or breaks the page on failure
  });
}
