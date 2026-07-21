/* ════════════════════════════════════════════════════════════════
   METADATA — shared config + database helper (loaded by every page
   that talks to the backend, BEFORE the page's own script).

   EDIT THE TWO VALUES BELOW after creating your Supabase project:
   Supabase dashboard → Settings → API →
     - "Project URL"      →  SUPABASE_URL
     - "anon public" key  →  SUPABASE_ANON_KEY

   These two values are SAFE to be public / committed to the repo.
   Privacy is enforced by the database rules in supabase-setup.sql,
   not by hiding these. (The Finnhub key is different — that one
   never goes in any file; it lives only in Supabase secrets.)

   While both values are empty ("") every page still works exactly
   as before — locally, in-memory, nothing stored. Filling them in
   switches the whole site to the shared database.
   ════════════════════════════════════════════════════════════════ */
window.MD_CONFIG = {
  SUPABASE_URL: "https://wdngikecwyzllklosjum.supabase.co",       /* EDIT — e.g. "https://abcdefghijkl.supabase.co" */
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indkbmdpa2Vjd3l6bGxrbG9zanVtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ2NDk2MTQsImV4cCI6MjEwMDIyNTYxNH0.O6GzSqG1SYx9VF54B-m6vzLZpdysOiI-XyIRF9qT_nA",  /* EDIT — the long "anon public" key */
};

/* ---- tiny REST helper over Supabase (no libraries needed) ---- */
window.MD_DB = (() => {
  const cfg = window.MD_CONFIG;
  const enabled = () => !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY);
  const baseHeaders = () => ({
    apikey: cfg.SUPABASE_ANON_KEY,
    Authorization: "Bearer " + cfg.SUPABASE_ANON_KEY,
    "Content-Type": "application/json",
  });

  /* insert one row or an array of rows. opts.onConflict enables upsert. */
  async function insert(table, rows, opts = {}) {
    if (!enabled()) return null;
    try {
      const q = opts.onConflict ? "?on_conflict=" + opts.onConflict : "";
      const prefer = opts.onConflict
        ? "resolution=merge-duplicates,return=minimal"
        : "return=minimal";
      const res = await fetch(`${cfg.SUPABASE_URL}/rest/v1/${table}${q}`, {
        method: "POST",
        headers: { ...baseHeaders(), Prefer: prefer },
        body: JSON.stringify(rows),
        keepalive: true, /* survives page navigation right after submit */
      });
      if (!res.ok) console.warn("[metadata db] insert", table, await res.text());
      return res.ok;
    } catch (e) { console.warn("[metadata db] insert", table, e); return null; }
  }

  async function select(table, query) {
    if (!enabled()) return null;
    try {
      const res = await fetch(`${cfg.SUPABASE_URL}/rest/v1/${table}?${query}`, {
        headers: baseHeaders(),
      });
      if (!res.ok) { console.warn("[metadata db] select", table, await res.text()); return null; }
      return await res.json();
    } catch (e) { console.warn("[metadata db] select", table, e); return null; }
  }

  async function del(table, query) {
    if (!enabled()) return null;
    try {
      const res = await fetch(`${cfg.SUPABASE_URL}/rest/v1/${table}?${query}`, {
        method: "DELETE",
        headers: baseHeaders(),
        keepalive: true,
      });
      if (!res.ok) console.warn("[metadata db] delete", table, await res.text());
      return res.ok;
    } catch (e) { console.warn("[metadata db] delete", table, e); return null; }
  }

  async function rpc(fn, args) {
    if (!enabled()) return null;
    try {
      const res = await fetch(`${cfg.SUPABASE_URL}/rest/v1/rpc/${fn}`, {
        method: "POST",
        headers: baseHeaders(),
        body: JSON.stringify(args),
      });
      if (!res.ok) console.warn("[metadata db] rpc", fn, await res.text());
      return res.ok;
    } catch (e) { console.warn("[metadata db] rpc", fn, e); return null; }
  }

  return { enabled, insert, select, del, rpc };
})();

/* ---- shared participant id: exists even if someone skipped the login ---- */
window.MD_PARTICIPANT_ID = (() => {
  try {
    const idn = JSON.parse(sessionStorage.getItem("md_identity") || "null");
    if (idn && idn.id) return idn.id;
    let x = sessionStorage.getItem("md_anonid");
    if (!x) {
      x = "v-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
      sessionStorage.setItem("md_anonid", x);
    }
    return x;
  } catch (e) { return "v-unknown"; }
})();
