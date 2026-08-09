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
      loadQueue();
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
  /* The Supabase client does NOT throw when a write is rejected. It resolves
     with { error }. Awaiting one and moving on therefore reports success for a
     write that never happened, which silently loses the change and skips the
     retry queue entirely. Every mutation goes through here so that can only be
     got wrong in one place. */
  async function did(q) {
    const r = await q;
    if (r && r.error) throw r.error;
    return r;
  }

  async function updateTrip(code, patch) {
    try { await did(client.from("trips").update(patch).eq("code", code)); return true; }
    catch (e) { writeFailed("updateTrip", e); enqueue({ kind: "updateTrip", code, patch }); return false; }
  }


  /* Every write that fails calls this. The app shows one banner rather than
     relying on sixteen call sites each remembering to check a return value. */
  let onWriteFail = null;
  function writeFailed(what, e) {
    console.warn(what, e);
    try { if (onWriteFail) onWriteFail(what, e); } catch (err) { /* never break a write path */ }
  }

  /* ---- Offline write queue --------------------------------------------------
     A trip happens on planes, foreign SIMs and hotel basements. A write that
     fails is parked here, kept across app restarts, and replayed in order the
     moment the connection comes back. Reads are never queued; stale is fine,
     lost is not.
     -------------------------------------------------------------------------- */
  const qKey = () => "cv_q_" + (currentCode || "none");
  let queue = [];
  let flushing = false;
  let onQueueChange = null;
  const uid = () => (crypto.randomUUID ? crypto.randomUUID()
    : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0; return (c === "x" ? r : (r & 0x3 | 0x8)).toString(16); }));
  function loadQueue() {
    try { queue = JSON.parse(localStorage.getItem(qKey()) || "[]") || []; } catch { queue = []; }
  }
  function saveQueue() {
    try { localStorage.setItem(qKey(), JSON.stringify(queue.slice(-200))); } catch { /* full */ }
    try { if (onQueueChange) onQueueChange(queue.length); } catch { /* never break a write */ }
  }
  function enqueue(op) {
    // Repeated edits to the same row collapse, so a slow connection does not
    // replay every keystroke's worth of saves.
    if (op.kind === "update") {
      const prev = queue.find((o) => o.kind === "update" && o.table === op.table && String(o.id) === String(op.id));
      if (prev) { prev.patch = { ...prev.patch, ...op.patch }; saveQueue(); return; }
    }
    if (op.kind === "updateTrip") {
      const prev = queue.find((o) => o.kind === "updateTrip" && o.code === op.code);
      if (prev) { prev.patch = { ...prev.patch, ...op.patch }; saveQueue(); return; }
    }
    queue.push(op);
    saveQueue();
  }
  // Check the returned error rather than relying on throwOnError, so a replay
  // fails the same way whatever version of the client is underneath.
  const must = async (q) => { const r = await q; if (r && r.error) throw r.error; return r; };
  async function runOp(op) {
    switch (op.kind) {
      case "insert":     await must(client.from(op.table).insert(op.row)); return;
      case "update":     await must(client.from(op.table).update(op.patch).eq("id", op.id)); return;
      case "remove":     await must(client.from(op.table).delete().eq("id", op.id)); return;
      case "updateTrip": await must(client.from("trips").update(op.patch).eq("code", op.code)); return;
      case "vote":
        if (op.choice == null) await must(client.from("votes").delete().match({ trip: op.trip, kind: op.k, topic: op.topic, voter: op.voter }));
        else await must(client.from("votes").upsert({ trip: op.trip, kind: op.k, topic: op.topic, choice: op.choice, voter: op.voter }, { onConflict: "trip,kind,topic,voter" }));
        return;
      case "flight":     await must(client.from("flights").upsert(op.row, { onConflict: "trip,traveler,dir" })); return;
      default: return;
    }
  }
  /* Replay in order and stop at the first failure, so a later write can never
     land before the earlier one it depends on.

     With one exception. Some rejections will never come good however long you
     wait: a NOT NULL or check constraint, a column that does not exist, a
     policy that says no. Leaving one of those at the head of the queue wedges
     every later write behind it forever, and the app goes on truthfully
     reporting "waiting to sync" about something that is never going to sync.
     Those get dropped and counted. Anything that could plausibly be the
     network still blocks, which is the whole point of the ordering. */
  function permanent(e) {
    const code = String((e && e.code) || "");
    // Postgres SQLSTATE: 22 bad data, 23 constraint violation, 42 undefined
    // object or insufficient privilege. PGRST* is PostgREST refusing to parse.
    if (/^(22|23|42)/.test(code) || /^PGRST/.test(code)) return true;
    const status = Number((e && e.status) || 0);
    return status >= 400 && status < 500 && status !== 408 && status !== 429;
  }
  let dropped = [];
  async function flushQueue() {
    if (flushing || !client || !queue.length) return { sent: 0, left: queue.length, dropped: dropped.length };
    flushing = true;
    let sent = 0;
    try {
      while (queue.length) {
        try { await runOp(queue[0]); }
        catch (e) {
          if (!permanent(e)) break;
          console.error("dropping a write the database will never accept", queue[0], e);
          dropped.push({ op: queue[0], why: String((e && e.message) || e) });
          queue.shift(); saveQueue();
          continue;
        }
        queue.shift(); sent++; saveQueue();
      }
    } finally { flushing = false; }
    return { sent, left: queue.length, dropped: dropped.length };
  }
  if (typeof window !== "undefined") {
    window.addEventListener("online", () => { flushQueue(); });
    setInterval(() => { if (queue.length && navigator.onLine !== false) flushQueue(); }, 20000);
  }

  /* ---- Generic helpers (every table is scoped by `trip`) -------------------- */
  async function list(table, trip, order = "created_at", asc = true) {
    try { const { data, error } = await client.from(table).select("*").eq("trip", trip).order(order, { ascending: asc }); if (error) throw error; return data || []; }
    catch (e) { console.warn("list " + table, e); return []; }
  }
  async function insert(table, row) {
    // Give the row its id up front so the screen, the queue and the database
    // all agree on it even if the write only lands later.
    const withId = row && row.id ? row : { ...row, id: uid() };
    try { const { data, error } = await client.from(table).insert(withId).select().single(); if (error) throw error; return data; }
    catch (e) {
      writeFailed("insert " + table, e);
      enqueue({ kind: "insert", table, row: withId });
      return { ...withId, created_at: new Date().toISOString(), _pending: true };
    }
  }
  async function update(table, id, patch) {
    try { await did(client.from(table).update(patch).eq("id", id)); return true; }
    catch (e) { writeFailed("update " + table, e); enqueue({ kind: "update", table, id, patch }); return false; }
  }
  async function remove(table, id) {
    try { await did(client.from(table).delete().eq("id", id)); return true; }
    catch (e) { writeFailed("remove " + table, e); enqueue({ kind: "remove", table, id }); return false; }
  }

  /* ---- Votes (upsert one per person/topic) ---------------------------------- */
  async function castVote(trip, kind, topic, choice, voter) {
    try {
      if (choice == null) await did(client.from("votes").delete().match({ trip, kind, topic, voter }));
      else await did(client.from("votes").upsert({ trip, kind, topic, choice, voter }, { onConflict: "trip,kind,topic,voter" }));
      return true;
    } catch (e) { writeFailed("castVote", e); enqueue({ kind: "vote", trip, k: kind, topic, choice, voter }); return false; }
  }

  /* ---- Bulk helpers --------------------------------------------------------- */
  async function clearTable(table, trip) {
    try { await did(client.from(table).delete().eq("trip", trip)); return true; }
    catch (e) { console.warn("clearTable " + table, e); return false; }
  }
  async function deleteTrip(code) {
    try {
      const tables = ["days", "votes", "expenses", "decisions", "stay_options", "ideas", "flights", "notes", "confirmations", "photos", "guides"];
      for (const t of tables) await did(client.from(t).delete().eq("trip", code));
      await did(client.from("trips").delete().eq("code", code));
      return true;
    } catch (e) { console.warn("deleteTrip", e); return false; }
  }

  /* ---- Flights (upsert per traveler+dir) ------------------------------------ */
  async function upsertFlight(row) {
    try { const { data, error } = await client.from("flights").upsert(row, { onConflict: "trip,traveler,dir" }).select().single(); if (error) throw error; return data; }
    catch (e) { writeFailed("upsertFlight", e); enqueue({ kind: "flight", row }); return { ...row, _pending: true }; }
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
    try { await did(client.from("push_subs").upsert(row, { onConflict: "endpoint" })); return true; }
    catch (e) { console.warn("savePushSub", e); return false; }
  }
  async function removePushSub(endpoint) {
    try { await did(client.from("push_subs").delete().eq("endpoint", endpoint)); return true; }
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
    pending: () => queue.length, flush: flushQueue,
    dropped: () => dropped.slice(), clearDropped: () => { dropped = []; },
    onQueueChange: (cb) => { onQueueChange = cb; },
    onWriteError: (cb) => { onWriteFail = cb; },
    createTrip, getTrip, updateTrip, deleteTrip,
    list, insert, update, remove, clearTable,
    castVote, upsertFlight, savePushSub, removePushSub,
    uploadFile, removeFile,
    watch,
  };
})();
