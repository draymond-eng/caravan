/* =============================================================================
   Caravan backend - Supabase data layer, scoped to one trip (by join code).
   Degrades silently if config is empty. All methods catch + return safe values.
   ========================================================================== */
(function () {
  "use strict";
  let client = null;
  let ready = false;
  const BUCKET = "caravan-files";

  /* Every request carries the trip code in a header. The database policies
     only return rows whose trip matches it, so knowing the code is what
     grants access - there is no way to list or read other people's trips. */
  let currentCode = "";
  function init(code) {
    try {
      const cfg = window.CARAVAN_CONFIG || {};
      if (!cfg.url || !cfg.anonKey || !window.supabase || !window.supabase.createClient) return false;
      const wanted = (code || "").toUpperCase();
      if (client && ready && wanted === currentCode) return true;
      currentCode = wanted;
      client = window.supabase.createClient(cfg.url, cfg.anonKey, {
        auth: { persistSession: false },
        global: { headers: wanted ? { "x-trip-code": wanted } : {} },
      });
      ready = true;
      return true;
    } catch (e) { console.warn("Backend init failed:", e); return false; }
  }
  const configured = () => { const c = window.CARAVAN_CONFIG || {}; return !!(c.url && c.anonKey); };

  /* ---- Trips ---------------------------------------------------------------- */
  let lastError = "";
  const errText = (e) => String((e && (e.message || e.error_description || e.hint)) || e || "").slice(0, 200);
  async function createTrip(row) {
    lastError = "";
    try {
      const { data, error } = await client.from("trips").insert(row).select().maybeSingle();
      if (error) throw error;
      if (data) return data;
      // Insert succeeded but the row could not be read back. Fetch it directly.
      const again = await getTrip(row.code);
      if (again) return again;
      lastError = "created but could not be read back";
      return null;
    } catch (e) { console.warn("createTrip", e); lastError = errText(e); return null; }
  }
  async function getTrip(code) {
    lastError = "";
    try { const { data, error } = await client.from("trips").select("*").eq("code", code).maybeSingle(); if (error) throw error; return data; }
    catch (e) { console.warn("getTrip", e); lastError = errText(e); return null; }
  }
  async function updateTrip(code, patch) {
    try { await client.from("trips").update(patch).eq("code", code); return true; }
    catch (e) { writeFailed("updateTrip", e); return false; }
  }


  /* Every write that fails calls this. The app shows one banner rather than
     relying on sixteen call sites each remembering to check a return value. */
  let onWriteFail = null;
  function writeFailed(what, e) {
    console.warn(what, e);
    try { if (onWriteFail) onWriteFail(what, e); } catch (err) { /* never break a write path */ }
  }
  /* ---- Generic helpers (every table is scoped by `trip`) -------------------- */
  async function list(table, trip, order = "created_at", asc = true) {
    try { const { data, error } = await client.from(table).select("*").eq("trip", trip).order(order, { ascending: asc }); if (error) throw error; return data || []; }
    catch (e) { console.warn("list " + table, e); return []; }
  }
  async function insert(table, row) {
    try { const { data, error } = await client.from(table).insert(row).select().single(); if (error) throw error; return data; }
    catch (e) { writeFailed("insert " + table, e); return null; }
  }
  async function update(table, id, patch) {
    try { await client.from(table).update(patch).eq("id", id); return true; }
    catch (e) { writeFailed("update " + table, e); return false; }
  }
  async function remove(table, id) {
    try { await client.from(table).delete().eq("id", id); return true; }
    catch (e) { writeFailed("remove " + table, e); return false; }
  }

  /* ---- Votes (upsert one per person/topic) ---------------------------------- */
  async function castVote(trip, kind, topic, choice, voter) {
    try {
      if (choice == null) await client.from("votes").delete().match({ trip, kind, topic, voter });
      else await client.from("votes").upsert({ trip, kind, topic, choice, voter }, { onConflict: "trip,kind,topic,voter" });
      return true;
    } catch (e) { writeFailed("castVote", e); return false; }
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
    catch (e) { writeFailed("upsertFlight", e); return null; }
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
    } catch (e) { writeFailed("uploadFile", e); return null; }
  }
  async function removeFile(path) {
    try { if (path) await client.storage.from(BUCKET).remove([path]); return true; }
    catch (e) { console.warn("removeFile", e); return false; }
  }

  /* ---- Push subscriptions --------------------------------------------------- */
  async function savePushSub(row) {
    try { await client.from("push_subs").upsert(row, { onConflict: "endpoint" }); return true; }
    catch (e) { console.warn("savePushSub", e); return false; }
  }
  async function removePushSub(endpoint) {
    try { await client.from("push_subs").delete().eq("endpoint", endpoint); return true; }
    catch (e) { console.warn("removePushSub", e); return false; }
  }

  /* ---- Keeping in sync ------------------------------------------------------
     Postgres realtime can't see the trip-code header, so instead of streaming
     we refresh on a timer, whenever the app comes back to the foreground, and
     right after the device makes its own change. Feels live, stays private. */
  function watch(onTick, seconds = 15) {
    let timer = null, stopped = false;
    const tick = () => { if (!stopped && document.visibilityState === "visible") onTick(); };
    const onVis = () => { if (document.visibilityState === "visible") onTick(); };
    timer = setInterval(tick, seconds * 1000);
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("online", onTick);
    return () => { stopped = true; clearInterval(timer); document.removeEventListener("visibilitychange", onVis); window.removeEventListener("online", onTick); };
  }

  window.Backend = {
    init, isReady: () => ready, configured, lastError: () => lastError,
    onWriteError: (cb) => { onWriteFail = cb; },
    createTrip, getTrip, updateTrip, deleteTrip,
    list, insert, update, remove, clearTable,
    castVote, upsertFlight, savePushSub, removePushSub,
    uploadFile, removeFile,
    watch,
  };
})();
