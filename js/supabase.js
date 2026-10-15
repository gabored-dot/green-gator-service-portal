/* =====================================================================
   SUPABASE CLIENT — only api.js should use `sb`.
   Uses the browser-safe anon key; security is enforced by RLS in Postgres.
   If the key is not pasted yet, `sb` stays null and the demo mode keeps working.
   ===================================================================== */
/* Read what Supabase put in the URL (recovery link, expired-link error) BEFORE the client strips it */
const AUTH_URL = (() => { const q = new URLSearchParams(location.search), h = new URLSearchParams(location.hash.replace(/^#/, ''));
  const get = k => h.get(k) || q.get(k);
  const out = { recovery: get('type') === 'recovery', error: get('error_description') || get('error') || null, code: get('error_code') };
  if (out.error) history.replaceState(null, '', location.pathname);   // clean the error out of the address bar
  return out; })();
let sb = null;
function initSupabase() {
  const { url, anonKey } = CONFIG.supabase;
  if (!window.supabase || !anonKey || anonKey.startsWith('PASTE_')) {
    console.warn('Supabase not configured: paste the anon key into CONFIG.supabase.anonKey (js/config.js). Demo mode only.');
    return null;
  }
  try { sb = window.supabase.createClient(url, anonKey, { auth:{ persistSession:true, autoRefreshToken:true } }); console.log('Supabase client initialized'); }
  catch (e) { console.error('Supabase client init failed:', e); sb = null; }
  return sb;
}
initSupabase();
