/* =====================================================================
   SUPABASE CLIENT — only api.js should use `sb`.
   Uses the browser-safe anon key; security is enforced by RLS in Postgres.
   If the key is not pasted yet, `sb` stays null and the demo mode keeps working.
   ===================================================================== */
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
