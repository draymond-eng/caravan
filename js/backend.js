/* =============================================================================
   Caravan backend - Supabase data layer, scoped to one trip (by join code).
   Degrades silently if config is empty. All methods catch + return safe values.
   ========================================================================== */
(function () {
  "use strict";
  let client = null;
  let ready = false;
  const BUCKET = "caravan-files";

  function init() {
    try {
      const cfg = window.CARAVAN_CONFIG || {};
      if (!cfg.url || !cfg.anonKey || !window.supabase || !window.supabase.createClient) return false;
      client = window.supabase.createClient(cfg.url, cfg.anonKey, { auth: { persistSession: false } });
      ready = true;
      return true;
    } catch (e) { console.warn("Backend init failed:", e); return false; }
  }
  const configured = () => { const c = window.CARAVAN_CONFIG || {}; return !!(c.url && c.anonKey); };

  /* ---- Trips ---------------------------------------------------------------- */
  async function createTrip(row) {
    try { const { data, error } = await client.from("trips").insert(row).select().single(); if (error) throw error; return data; }
    catch (e) { console.warn("createTrip", e); return null; }
  }
  async function getTrip(code) {
    try { const { data, error } = await client.from("trips").select("*").eq("code", code).maybeSingle(); if (error) throw error; return data; }
    catch (e) { console.warn("getTrip", e); return null; }
  }
  async function updateTrip(code, patch) {
    try { await client.from("trips").update(patch).eq("code", code); return true; }
    catch (e) { console.warn("updateTrip", e); return false; }
  }

  /* ---- Generic helpers (every table is scoped by `trip`) -------------------- */
  async function list(table, trip, order = "created_at", asc = true) {
    try { const { data, error } = await client.from(table).select("*").eq("trip", trip).order(order, { ascending: asc }); if (error) throw error; return data || []; }
    catch (e) { console.warn("list " + table, e); return []; }
  }
  async function insert(table, row) {
    try { const { data, error } = await client.from(table).insert(row).select().single(); if (error) throw error; return data; }
    catch (e) { console.warn("insert " + table, e); return null; }
  }
  async function update(table, id, patch) {
    try { await client.from(table).update(patch).eq("id", id); return true; }
    catch (e) { console.warn("update " + table, e); return false; }
  }
  async function remove(table, id) {
    try { await client.from(table).delete().eq("id", id); return true; }
    catch (e) { console.warn("remove " + table, e); return false; }
  }

  /* ---- Votes (upsert one per person/topic) ---------------------------------- */
  async function castVote(trip, kind, topic, choice, voter) {
    try {
      if (choice == null) await client.from("votes").delete().match({ trip, kind, topic, voter });
      else await client.from("votes").upsert({ trip, kind, topic, choice, voter }, { onConflict: "trip,kind,topic,voter" });
      return true;
    } catch (e) { console.warn("castVote", e); return false; }
  }

  /* ---- Bulk helpers --------------------------------------------------------- */
  async function clearTable(table, trip) {
    try { await client.from(table).delete().eq("trip", trip); return true; }
    catch (e) { console.warn("clearTable " + table, e); return false; }
  }
  async function deleteTrip(code) {
    try {
      const tables = ["days", "votes", "expenses", "decisions", "stay_options", "ideas", "flights", "notes", "confirmations", "photos", "guides"];
      for (const t of tables) await client.from(t).delete().eq("trip", code);
      await client.from("trips").delete().eq("code", code);
      return true;
    } catch (e) { console.warn("deleteTrip", e); return false; }
  }

  /* ---- Flights (upsert per traveler+dir) ------------------------------------ */
  async function upsertFlight(row) {
    try { const { data, error } = await client.from("flights").upsert(row, { onConflict: "trip,traveler,dir" }).select().single(); if (error) throw error; return data; }
    catch (e) { console.warn("upsertFlight", e); return null; }
  }

  /* ---- Files (photos + confirmations) --------------------------------------- */
  async function uploadFile(trip, file) {
    try {
      const ext = (file.name.split(".").pop() || "bin").toLowerCase();
      const path = `${trip}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const up = await client.storage.from(BUCKET).upload(path, file, { cacheControl: "3600", upsert: false });
      if (up.error) throw up.error;
      const { data: pub } = client.storage.from(BUCKET).getPublicUrl(path);
      return { path, url: pub.publicUrl };
    } catch (e) { console.warn("uploadFile", e); return null; }
  }
  async function removeFile(path) {
    try { if (path) await client.storage.from(BUCKET).remove([path]); return true; }
    catch (e) { console.warn("removeFile", e); return false; }
  }

  /* ---- Realtime: subscribe to this trip's rows on all tables ---------------- */
  function subscribe(trip, onChange) {
    try {
      const tables = ["trips", "days", "votes", "expenses", "decisions", "stay_options", "ideas", "flights", "notes", "confirmations", "photos"];
      let ch = client.channel("caravan-" + trip);
      tables.forEach((t) => {
        const col = t === "trips" ? "code" : "trip";
        ch = ch.on("postgres_changes", { event: "*", schema: "public", table: t, filter: `${col}=eq.${trip}` }, () => onChange(t));
      });
      return ch.subscribe();
    } catch (e) { console.warn("subscribe", e); return null; }
  }

  window.Backend = {
    init, isReady: () => ready, configured,
    createTrip, getTrip, updateTrip, deleteTrip,
    list, insert, update, remove, clearTable,
    castVote, upsertFlight,
    uploadFile, removeFile,
    subscribe,
  };
})();
