/* =============================================================================
   SquadTrip - app logic. Vanilla JS, no build step.
   Two modes:
     • Landing  (no ?t= code): create a trip / join by code
     • Trip app (?t=CODE): the full shared trip - everything scoped to the code
   Shared data lives in Supabase; per-device prefs in localStorage.
   ========================================================================== */
(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const PALETTE = ["#c4432e", "#2f6f9f", "#1f9d8f", "#7a5cc0", "#c98a3d", "#d98aa0", "#6d7d50", "#b28a34", "#557d9f", "#a04c6a", "#4c7a5c", "#8a6a3d"];
  const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const makeCode = () => Array.from({ length: 6 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join("");
  const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || ("x" + Math.random().toString(36).slice(2, 6));

  const initials = (name) => name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const avatarHTML = (t, size = 42, fs = 14) =>
    t.photo
      ? `<span class="avatar" style="width:${size}px;height:${size}px;background-image:url('${t.photo}')"></span>`
      : `<span class="avatar" style="width:${size}px;height:${size}px;font-size:${fs}px;background:${t.color}">${initials(t.name)}</span>`;

  const fmtDate = (iso) => {
    const d = new Date(iso + "T12:00:00");
    return { day: d.getDate(), mon: d.toLocaleString("en-US", { month: "short" }), wd: d.toLocaleString("en-US", { weekday: "short" }) };
  };
  const fmtRange = (a, b) => { const fa = fmtDate(a), fb = fmtDate(b); return `${fa.mon} ${fa.day} → ${fb.mon} ${fb.day}`; };
  const nightsBetween = (a, b) => Math.max(0, Math.round((new Date(b + "T12:00:00") - new Date(a + "T12:00:00")) / 86400000));

  /* =========================================================================
     ROUTER
     ====================================================================== */
  const params = new URLSearchParams(location.search);
  const TRIP_CODE = (params.get("t") || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const HAS_BACKEND = window.Backend && Backend.configured();

  const LSG = { // global (per-device) storage
    get(k, d) { try { return JSON.parse(localStorage.getItem("cv_" + k)) ?? d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem("cv_" + k, JSON.stringify(v)); } catch {} },
  };

  if (!TRIP_CODE) { bootLanding(); } else { bootTrip(); }

  /* =========================================================================
     LANDING - create / join
     ====================================================================== */
  function bootLanding() {
    $("#landing").style.display = "block";
    if (!HAS_BACKEND) {
      $("#landingSetup").innerHTML = `<div class="card" style="border-color:#e2ad55;background:#fdf6ea">
        <h3>⚙️ One-time setup needed</h3>
        <p class="r-sub" style="margin:6px 0 0">SquadTrip needs its Supabase backend connected before trips can be created.
        Create a free project, run <code>supabase/schema.sql</code>, and put the URL + publishable key in <code>js/config.js</code>.</p>
      </div>`;
      $("#createBtn").disabled = true;
      $("#createBtn").style.opacity = 0.5;
    } else { Backend.init(); }

    // recent trips on this device
    const mine = LSG.get("mytrips", []);
    if (mine.length) {
      $("#myTrips").innerHTML = `<div class="section-title" style="font-size:17px;margin-top:6px">Your trips on this phone</div>` +
        mine.map((t) => `<button class="trip-chip" data-open="${esc(t.code)}">
          <span aria-hidden="true"><svg viewBox="0 0 76 108" width="17" height="24"><path d="M0 42 C0 12 20 0 38 0 C56 0 76 12 76 42 C76 72 38 108 38 108 C38 108 0 72 0 42 Z" fill="#f09c4a"/><circle cx="38" cy="42" r="16" fill="#241b45"/></svg></span>
          <span style="flex:1"><span class="tc-name">${esc(t.name)}</span><br><span class="tc-sub">${esc(t.dates || "")} · code ${esc(t.code)}</span></span>
          <span style="color:var(--ink-3)">›</span>
        </button>`).join("");
      $$("#myTrips [data-open]").forEach((b) => b.addEventListener("click", () => { location.search = "?t=" + b.dataset.open; }));
    }

    $("#joinBtn").addEventListener("click", joinTrip);
    $("#joinCode").addEventListener("keydown", (e) => { if (e.key === "Enter") joinTrip(); });
    $("#createBtn").addEventListener("click", () => { openWizard(); });

    registerSW();
  }

  async function joinTrip() {
    const code = $("#joinCode").value.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (code.length < 4) { $("#joinErr").textContent = "That code looks too short."; return; }
    if (!HAS_BACKEND || !Backend.isReady()) { $("#joinErr").textContent = "Backend isn't configured yet."; return; }
    $("#joinErr").textContent = "Checking…";
    const trip = await Backend.getTrip(code);
    if (!trip) { $("#joinErr").textContent = "No trip found with that code. Double-check it."; return; }
    location.search = "?t=" + code;
  }

  /* ---- Create-trip wizard -------------------------------------------------- */
  const wiz = { step: 0, mode: "trip", name: "", destination: "", start: "", end: "", stops: [], travelers: [], tz: "", currency: "USD", home_currency: "USD" };
  function openWizard() {
    wiz.step = 0;
    wiz.tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    if (!wiz.travelers.length) wiz.travelers = [""];
    $("#wizModal").classList.add("open");
    renderWizard();
  }
  function closeWizard() { $("#wizModal").classList.remove("open"); document.body.classList.remove("theme-wedding"); }

  function renderWizard() {
    const B = $("#wizBody");
    const dots = `<div class="wiz-step-dots">${[0, 1, 2].map((i) => `<i class="${i <= wiz.step ? "on" : ""}"></i>`).join("")}</div>`;
    if (wiz.step === 0) {
      const w = wiz.mode === "wedding";
      B.innerHTML = `${dots}
        <label class="wiz-label">What are we planning?</label>
        <div style="display:flex;gap:8px;margin-bottom:4px">
          <button class="who-opt ${!w ? "sel" : ""}" id="wModeTrip" style="flex:1;justify-content:center;margin:0">🌍 Group trip</button>
          <button class="who-opt ${w ? "sel" : ""}" id="wModeWed" style="flex:1;justify-content:center;margin:0">💍 Destination wedding</button>
        </div>
        <label class="wiz-label">${w ? "Wedding name" : "Trip name"}</label>
        <input id="wName" class="wiz-in" placeholder="${w ? "e.g. Maya & Jordan in Tulum" : "e.g. Japan 2027"}" value="${esc(wiz.name)}" style="width:100%;padding:12px;border:1px solid var(--line);border-radius:var(--r-sm);font-size:15px" />
        <label class="wiz-label">Destination</label>
        <input id="wDest" placeholder="${w ? "e.g. Tulum, Mexico" : "e.g. Japan"}" value="${esc(wiz.destination)}" style="width:100%;padding:12px;border:1px solid var(--line);border-radius:var(--r-sm);font-size:15px" />
        <div style="display:flex;gap:10px">
          <div style="flex:1"><label class="wiz-label">First day</label>
            <input id="wStart" type="date" value="${esc(wiz.start)}" style="width:100%;padding:12px;border:1px solid var(--line);border-radius:var(--r-sm);font-size:14px" /></div>
          <div style="flex:1"><label class="wiz-label">Last day</label>
            <input id="wEnd" type="date" value="${esc(wiz.end)}" style="width:100%;padding:12px;border:1px solid var(--line);border-radius:var(--r-sm);font-size:14px" /></div>
        </div>
        <div class="btn-row" style="margin-top:18px">
          <button class="btn ghost" id="wCancel" style="flex:1">Cancel</button>
          <button class="btn primary" id="wNext" style="flex:2">Next: stops →</button>
        </div>`;
      $("#wCancel").addEventListener("click", closeWizard);
      const keep = () => { wiz.name = $("#wName").value.trim(); wiz.destination = $("#wDest").value.trim(); wiz.start = $("#wStart").value; wiz.end = $("#wEnd").value; };
      $("#wModeTrip").addEventListener("click", () => { keep(); wiz.mode = "trip"; document.body.classList.remove("theme-wedding"); renderWizard(); });
      $("#wModeWed").addEventListener("click", () => { keep(); wiz.mode = "wedding"; document.body.classList.add("theme-wedding"); renderWizard(); });
      $("#wNext").addEventListener("click", () => {
        keep();
        if (!wiz.name) return alert("Give the trip a name.");
        if (!wiz.start || !wiz.end || wiz.end < wiz.start) return alert("Pick valid dates.");
        wiz.step = 1; renderWizard();
      });
    } else if (wiz.step === 1) {
      if (!wiz.stops.length) wiz.stops = [""];
      B.innerHTML = `${dots}
        <label class="wiz-label">${wiz.mode === "wedding" ? "Where is it happening? (venue town; add more stops if events span places)" : "Stops / bases (in order): where you'll sleep"}</label>
        ${wiz.stops.map((s, i) => `<div class="trav-row">
          <input data-stop="${i}" placeholder="e.g. Tokyo" value="${esc(s)}" style="padding:12px;border:1px solid var(--line);border-radius:var(--r-sm);font-size:15px" />
          ${wiz.stops.length > 1 ? `<button class="rm" data-rmstop="${i}">✕</button>` : ""}
        </div>`).join("")}
        <button class="btn ghost" id="wAddStop" style="width:100%">＋ Add a stop</button>
        <div class="btn-row" style="margin-top:18px">
          <button class="btn ghost" id="wBack" style="flex:1">← Back</button>
          <button class="btn primary" id="wNext" style="flex:2">Next: crew →</button>
        </div>`;
      const readStops = () => { wiz.stops = $$("#wizBody [data-stop]").map((i) => i.value); };
      $("#wAddStop").addEventListener("click", () => { readStops(); wiz.stops.push(""); renderWizard(); });
      $$("#wizBody [data-rmstop]").forEach((b) => b.addEventListener("click", () => { readStops(); wiz.stops.splice(+b.dataset.rmstop, 1); renderWizard(); }));
      $("#wBack").addEventListener("click", () => { readStops(); wiz.step = 0; renderWizard(); });
      $("#wNext").addEventListener("click", () => {
        readStops();
        wiz.stops = wiz.stops.map((s) => s.trim()).filter(Boolean);
        if (!wiz.stops.length) return alert("Add at least one stop.");
        wiz.step = 2; renderWizard();
      });
    } else {
      B.innerHTML = `${dots}
        <label class="wiz-label">${wiz.mode === "wedding" ? "The hosts: the couple + anyone helping plan. Guests add themselves when they join." : "Who's coming? (everyone, including you)"}</label>
        ${wiz.travelers.map((t, i) => `<div class="trav-row">
          <input data-trav="${i}" placeholder="Name" value="${esc(t)}" style="padding:12px;border:1px solid var(--line);border-radius:var(--r-sm);font-size:15px" />
          ${wiz.travelers.length > 1 ? `<button class="rm" data-rmtrav="${i}">✕</button>` : ""}
        </div>`).join("")}
        <button class="btn ghost" id="wAddTrav" style="width:100%">＋ Add a traveler</button>
        <div style="display:flex;gap:10px;margin-top:6px">
          <div style="flex:1"><label class="wiz-label">Their money</label>
            <input id="wCur" placeholder="e.g. JPY" maxlength="3" value="${esc(wiz.currency)}" style="width:100%;padding:12px;border:1px solid var(--line);border-radius:var(--r-sm);font-size:14px;text-transform:uppercase" /></div>
          <div style="flex:1"><label class="wiz-label">Your money</label>
            <input id="wHomeCur" placeholder="e.g. USD" maxlength="3" value="${esc(wiz.home_currency)}" style="width:100%;padding:12px;border:1px solid var(--line);border-radius:var(--r-sm);font-size:14px;text-transform:uppercase" /></div>
        </div>
        <label class="wiz-label">Destination timezone</label>
        <input id="wTz" list="tzlist" value="${esc(wiz.tz)}" style="width:100%;padding:12px;border:1px solid var(--line);border-radius:var(--r-sm);font-size:14px" />
        <datalist id="tzlist">${(Intl.supportedValuesOf ? Intl.supportedValuesOf("timeZone") : ["UTC"]).map((z) => `<option value="${z}">`).join("")}</datalist>
        <div class="btn-row" style="margin-top:18px">
          <button class="btn ghost" id="wBack" style="flex:1">← Back</button>
          <button class="btn primary" id="wCreate" style="flex:2">Create trip</button>
        </div>
        <div id="wErr" class="r-sub" style="color:var(--vermilion);margin-top:8px"></div>`;
      const readTravs = () => { wiz.travelers = $$("#wizBody [data-trav]").map((i) => i.value); };
      $("#wAddTrav").addEventListener("click", () => { readTravs(); wiz.travelers.push(""); renderWizard(); });
      $$("#wizBody [data-rmtrav]").forEach((b) => b.addEventListener("click", () => { readTravs(); wiz.travelers.splice(+b.dataset.rmtrav, 1); renderWizard(); }));
      $("#wBack").addEventListener("click", () => { readTravs(); wiz.step = 1; renderWizard(); });
      $("#wCreate").addEventListener("click", createTripGo);
    }
  }

  async function createTripGo() {
    wiz.travelers = $$("#wizBody [data-trav]").map((i) => i.value.trim()).filter(Boolean);
    if (!wiz.travelers.length) { $("#wErr").textContent = "Add at least one traveler."; return; }
    wiz.currency = ($("#wCur").value.trim() || "USD").toUpperCase();
    wiz.home_currency = ($("#wHomeCur").value.trim() || "USD").toUpperCase();
    wiz.tz = $("#wTz").value.trim() || "UTC";
    $("#wErr").textContent = "Creating…";

    const travelers = wiz.travelers.map((n, i) => ({ id: slug(n) + "-" + i, name: n, color: PALETTE[i % PALETTE.length] }));
    const stops = wiz.stops.map((s, i) => ({ id: slug(s) + "-" + i, label: s }));
    const row = {
      code: makeCode(), name: wiz.name, destination: wiz.destination,
      start_date: wiz.start, end_date: wiz.end, tz: wiz.tz,
      currency: wiz.currency, home_currency: wiz.home_currency,
      travelers, stops,
    };
    if (wiz.mode === "wedding") { row.mode = "wedding"; row.hosts = travelers.map((t) => t.id); row.links = {}; }
    const created = await Backend.createTrip(row);
    if (!created) { $("#wErr").textContent = wiz.mode === "wedding"
      ? "Couldn't create it. Wedding mode needs the latest database migration (see README) run in Supabase."
      : "Couldn't create the trip. Check the backend setup and try again."; return; }
    const mine = LSG.get("mytrips", []);
    mine.unshift({ code: created.code, name: created.name, dates: fmtRange(created.start_date, created.end_date) });
    LSG.set("mytrips", mine.slice(0, 8));
    location.search = "?t=" + created.code;
  }

  /* =========================================================================
     TRIP APP
     ====================================================================== */
  let TRIP = null;       // the trips row
  const SYNC = { on: false };
  const LS = { // per-trip, per-device
    get(k, d) { try { return JSON.parse(localStorage.getItem(`cv_${TRIP_CODE}_${k}`)) ?? d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(`cv_${TRIP_CODE}_${k}`, JSON.stringify(v)); } catch {} },
  };
  const state = {
    me: null, packing: {}, cityFilter: "all",
    days: [], allVotes: [], expenses: [], decisions: [], stayOptions: [],
    ideas: [], flights: [], notes: [], confirmations: [], photos: [], guides: [],
    liveRate: null,
  };

  const byId = (id) => (TRIP.travelers || []).find((t) => t.id === id);
  const stopById = (id) => (TRIP.stops || []).find((s) => s.id === id) || { label: id };
  const stopPillClass = (id) => { const i = (TRIP.stops || []).findIndex((s) => s.id === id); return "pill " + (i >= 0 ? "s" + (i % 6) : "any"); };
  // Wedding mode: one party plans (hosts), everyone else RSVPs and follows.
  const isWedding = () => !!TRIP && TRIP.mode === "wedding";
  const isHost = () => !isWedding() || (TRIP.hosts || []).includes(state.me);
  const voterChips = (ids) => (ids || []).map((id) => { const t = byId(id); return t ? `<span class="avatar vchip" style="background:${t.color}" title="${esc(t.name)}">${initials(t.name)}</span>` : ""; }).join("");

  const TYPE = {
    travel: { emoji: "🚆", label: "Travel" }, sight: { emoji: "🏛️", label: "Sight" },
    food: { emoji: "🍽️", label: "Food" }, activity: { emoji: "🎟️", label: "Activity" },
    rest: { emoji: "🛌", label: "Rest" }, meet: { emoji: "📍", label: "Meetup" },
  };

  async function bootTrip() {
    $("#tripApp").style.display = "block";
    if (!HAS_BACKEND || !Backend.init()) {
      $("#screen-home").innerHTML = `<div class="card" style="margin-top:20px"><h3>⚙️ Backend not configured</h3>
        <p class="r-sub">Caravan needs its Supabase config filled in before trips can load. See the README.</p></div>`;
      return;
    }
    TRIP = await Backend.getTrip(TRIP_CODE);
    if (!TRIP) {
      $("#screen-home").innerHTML = `<div class="card" style="margin-top:20px"><h3>🤔 Trip not found</h3>
        <p class="r-sub">No trip with code <b>${esc(TRIP_CODE)}</b>. Check the code, or <a href="./">create a new trip</a>.</p></div>`;
      return;
    }
    SYNC.on = true;
    document.body.classList.toggle("theme-wedding", isWedding());
    state.me = LS.get("me", null);
    state.packing = LS.get("packing", {});
    $("#brandName").textContent = TRIP.name;
    $("#brandSub").textContent = fmtRange(TRIP.start_date, TRIP.end_date);
    document.title = `${TRIP.name} · SquadTrip`;

    // remember on this device
    const mine = LSG.get("mytrips", []).filter((t) => t.code !== TRIP.code);
    mine.unshift({ code: TRIP.code, name: TRIP.name, dates: fmtRange(TRIP.start_date, TRIP.end_date) });
    LSG.set("mytrips", mine.slice(0, 8));

    await hydrate("all");
    Backend.subscribe(TRIP_CODE, async (table) => { await hydrate(table); renderCurrent(); });

    bindShell();
    renderAll();
    renderWhoami();
    if (!LSG.get("onboarded", false)) setTimeout(openWelcome, 500);
    else if (!state.me) setTimeout(openWho, 700);
    else setTimeout(maybeOfferInstall, 1200); // already tagged: nudge once, then snooze
    loadRate();
    registerSW();
  }

  async function hydrate(t) {
    const jobs = [];
    const J = (cond, p) => { if (t === "all" || t === cond) jobs.push(p); };
    J("trips", (async () => { const fresh = await Backend.getTrip(TRIP_CODE); if (fresh) { TRIP = fresh; } })());
    J("days", Backend.list("days", TRIP_CODE, "date").then((r) => state.days = r));
    J("votes", Backend.list("votes", TRIP_CODE).then((r) => state.allVotes = r));
    J("expenses", Backend.list("expenses", TRIP_CODE).then((r) => state.expenses = r));
    J("decisions", Backend.list("decisions", TRIP_CODE).then((r) => state.decisions = r));
    J("stay_options", Backend.list("stay_options", TRIP_CODE).then((r) => state.stayOptions = r));
    J("ideas", Backend.list("ideas", TRIP_CODE, "created_at", false).then((r) => state.ideas = r));
    J("flights", Backend.list("flights", TRIP_CODE).then((r) => state.flights = r));
    J("notes", Backend.list("notes", TRIP_CODE).then((r) => state.notes = r));
    J("confirmations", Backend.list("confirmations", TRIP_CODE, "created_at", false).then((r) => state.confirmations = r));
    J("photos", Backend.list("photos", TRIP_CODE, "created_at", false).then((r) => state.photos = r));
    J("guides", Backend.list("guides", TRIP_CODE).then((r) => state.guides = r));
    await Promise.all(jobs);
  }

  /* ---- votes --------------------------------------------------------------- */
  function myVote(kind, topic) {
    const r = state.allVotes.find((v) => v.kind === kind && v.topic === topic && v.voter === state.me);
    return r ? r.choice : null;
  }
  function tally(kind, topic) {
    const m = {};
    state.allVotes.filter((v) => v.kind === kind && v.topic === topic).forEach((v) => (m[v.choice] = m[v.choice] || []).push(v.voter));
    return m;
  }
  async function setVote(kind, topic, choice) {
    if (!state.me) { openWho(); return; }
    const cur = myVote(kind, topic);
    const next = cur === choice ? null : choice;
    state.allVotes = state.allVotes.filter((v) => !(v.kind === kind && v.topic === topic && v.voter === state.me));
    if (next != null) state.allVotes.push({ kind, topic, choice: next, voter: state.me });
    renderCurrent();
    await Backend.castVote(TRIP_CODE, kind, topic, next, state.me);
  }

  /* ---- shell --------------------------------------------------------------- */
  function bindShell() {
    $$(".tab[data-screen]").forEach((t) => t.addEventListener("click", () => show(t.dataset.screen)));
    $$(".sheet-item").forEach((t) => t.addEventListener("click", () => show(t.dataset.screen)));
    $("#moreTab").addEventListener("click", () => { $("#moreSheet").classList.add("open"); $("#sheetBackdrop").classList.add("open"); });
    $("#sheetBackdrop").addEventListener("click", closeSheet);
    $("#whoamiBtn").addEventListener("click", openWho);
    $("#whoClose").addEventListener("click", () => $("#whoModal").classList.remove("open"));
    $("#whoModal").addEventListener("click", (e) => { if (e.target.id === "whoModal") $("#whoModal").classList.remove("open"); });
  }
  const closeSheet = () => { $("#moreSheet").classList.remove("open"); $("#sheetBackdrop").classList.remove("open"); };
  function show(screen) {
    $$("#tripApp .screen").forEach((s) => s.classList.remove("active"));
    const el = $("#screen-" + screen); if (el) el.classList.add("active");
    $$(".tab").forEach((t) => t.classList.toggle("active", t.dataset.screen === screen));
    if (!["home", "itinerary", "decisions", "crew"].includes(screen)) $("#moreTab").classList.add("active");
    window.scrollTo(0, 0);
    closeSheet();
    renderCurrent();
  }

  /* ---- welcome walkthrough (first open on this device) ---------------------- */
  const WELCOME_STEPS = [
    { emoji: "\u{1F4CD}", title: "Welcome to SquadTrip", body: () => `This is <b>${esc(TRIP.name)}</b> \u2014 your group's trip HQ. Everything in here is <b>shared live</b>: when anyone votes, plans, or adds something, the whole crew sees it instantly. No accounts, no downloads.` },
    { emoji: "\u{1F44B}", title: "First: say who you are", body: () => `You'll pick your name from the crew list in a second. Your votes, RSVPs, and expenses get tagged to you \u2014 that's the whole login.` },
    { emoji: "\u{1F5D3}\uFE0F", title: "Plan it together", body: () => `The <b>Plan</b> tab is the shared itinerary \u2014 anyone can add days and activities, and you tap <b>\uFF0B I'm in</b> on the ones you'd join. Empty plan? The <b>\u2728 AI setup</b> drafts the whole trip \u2014 itinerary, destination guide, neighborhoods \u2014 for the group to reshape.` },
    { emoji: "\u{1F5F3}\uFE0F", title: "Decide by voting", body: () => `No more 47-message group chats. Pose questions in <b>Votes</b>, submit hotels in <b>Stays</b>, thumbs-up <b>Ideas</b> \u2014 everyone taps their pick and the tallies settle it.` },
    { emoji: "\u{1F4B0}", title: "\u2026and the boring stuff, handled", body: () => `Split expenses in <b>Budget</b> (it computes who owes who), stash confirmations in the <b>Vault</b>, drop pics in <b>Photos</b>, and ask the <b>\u2728 Assistant</b> anything about your trip. Have a great one.` },
  ];
  const WEDDING_WELCOME = [
    { emoji: "\u{1F48D}", title: "You're invited", body: () => `Welcome to <b>${esc(TRIP.name)}</b>. Everything about the wedding weekend lives here. Schedule, RSVP, where to stay, travel plans. No accounts, no downloads.` },
    { emoji: "\u{1F44B}", title: "First: say who you are", body: () => `Pick your name from the guest list, or add yourself if you're not on it yet. Your RSVP gets tagged to you. That's the whole login.` },
    { emoji: "\u{1F48C}", title: "RSVP on the Home screen", body: () => `Tap <b>Joyfully accept</b> (and how many are in your party) so the hosts can plan headcounts. You can change it any time.` },
    { emoji: "\u{1F5D3}️", title: "The weekend, in one place", body: () => `The <b>Plan</b> tab has every event: times, dress codes, locations. Tap <b>＋ I'm in</b> on the optional stuff so the hosts know who's joining.` },
    { emoji: "✈️", title: "Travel, handled", body: () => `Drop your flight into <b>Flights</b> so shuttle groups can be organized, check <b>Stays</b> for the room block, and put your pics in <b>Photos</b> all weekend. See you there!` },
  ];
  let welcomeStep = 0;
  const welcomeSteps = () => (isWedding() ? WEDDING_WELCOME : WELCOME_STEPS);
  function openWelcome() {
    welcomeStep = 0;
    renderWelcome();
    $("#welcomeModal").classList.add("open");
  }
  function renderWelcome() {
    const STEPS = welcomeSteps();
    const s = STEPS[welcomeStep];
    const last = welcomeStep === STEPS.length - 1;
    $("#welcomeBody").innerHTML = `
      <div class="wiz-step-dots">${STEPS.map((_, i) => `<i class="${i <= welcomeStep ? "on" : ""}"></i>`).join("")}</div>
      <div style="text-align:center;font-size:52px;margin:6px 0 10px">${s.emoji}</div>
      <h3 style="text-align:center;margin:0 0 10px">${s.title}</h3>
      <p class="section-sub" style="text-align:center;margin:0 0 18px;font-size:14px;line-height:1.6">${s.body()}</p>
      <div class="btn-row">
        ${welcomeStep > 0 ? `<button class="btn ghost" id="wlBack" style="flex:1">\u2190</button>` : `<button class="btn ghost" id="wlSkip" style="flex:1">Skip</button>`}
        <button class="btn primary" id="wlNext" style="flex:3">${last ? "Pick my name \u2192" : "Next"}</button>
      </div>`;
    const back = $("#wlBack"); if (back) back.addEventListener("click", () => { welcomeStep--; renderWelcome(); });
    const skip = $("#wlSkip"); if (skip) skip.addEventListener("click", finishWelcome);
    $("#wlNext").addEventListener("click", () => {
      if (welcomeStep < welcomeSteps().length - 1) { welcomeStep++; renderWelcome(); }
      else finishWelcome();
    });
  }
  function finishWelcome() {
    LSG.set("onboarded", true);
    $("#welcomeModal").classList.remove("open");
    if (!state.me) openWho();
    else maybeOfferInstall();
  }

  /* ---- Add to home screen --------------------------------------------------
     SquadTrip is a real app once it's on the home screen: full screen, offline,
     its own icon, and (crucially) able to receive push alerts on iOS. We ask
     right after someone says who they are, then back off for a week if dismissed.
     -------------------------------------------------------------------------- */
  let deferredInstall = null;
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferredInstall = e; });
  const isStandalone = () =>
    window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  function maybeOfferInstall(force) {
    if (!TRIP) return;
    if (!force) {
      if (isStandalone()) return;                       // already installed
      if (!state.me) return;                            // wait until they're tagged
      const snooze = LSG.get("installSnooze", 0);
      if (snooze && Date.now() < snooze) return;        // dismissed recently
      if (LSG.get("installDone", false)) return;
    }
    if (isStandalone()) {
      $("#installBody").innerHTML = `
        <div style="text-align:center;font-size:46px;margin:4px 0 8px">✅</div>
        <h3 style="text-align:center;margin:0 0 8px">You're all set</h3>
        <p class="section-sub" style="text-align:center;margin:0 0 16px">SquadTrip is installed on this phone. Trip updates land here.</p>
        <button class="btn primary" id="instClose" style="width:100%">Nice</button>`;
      $("#installModal").classList.add("open");
      $("#instClose").addEventListener("click", closeInstall);
      return;
    }
    const ua = navigator.userAgent;
    const iOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const steps = iOS
      ? `<div class="inst-step"><span class="n">1</span><div>Tap the <b>Share</b> button <span class="inst-icon">􀈂</span> at the bottom of Safari</div></div>
         <div class="inst-step"><span class="n">2</span><div>Scroll down and tap <b>Add to Home Screen</b></div></div>
         <div class="inst-step"><span class="n">3</span><div>Tap <b>Add</b>. Done, it's on your phone</div></div>`
      : deferredInstall
        ? `<div class="inst-step"><span class="n">1</span><div>Tap <b>Install</b> below and confirm</div></div>
           <div class="inst-step"><span class="n">2</span><div>SquadTrip lands on your home screen like any app</div></div>`
        : `<div class="inst-step"><span class="n">1</span><div>Open your browser menu <b>⋮</b></div></div>
           <div class="inst-step"><span class="n">2</span><div>Tap <b>Install app</b> or <b>Add to Home screen</b></div></div>`;
    $("#installBody").innerHTML = `
      <div style="text-align:center;margin:2px 0 10px"><svg viewBox="0 0 100 74" width="64" height="47" aria-hidden="true"><g fill="#f3d3c4"><path d="M8 32 C8 20 16 15 23 15 C30 15 38 20 38 32 C38 44 23 60 23 60 C23 60 8 44 8 32 Z"/></g><circle cx="23" cy="31" r="6" fill="#241b45"/><g fill="#f09c4a"><path d="M34 22 C34 8 44 2 52 2 C60 2 70 8 70 22 C70 36 52 55 52 55 C52 55 34 36 34 22 Z"/></g><circle cx="52" cy="21" r="7" fill="#241b45"/><g fill="#e2593a"><path d="M66 32 C66 20 74 15 81 15 C88 15 96 20 96 32 C96 44 81 60 81 60 C81 60 66 44 66 32 Z"/></g><circle cx="81" cy="31" r="6" fill="#241b45"/></svg></div>
      <h3 style="text-align:center;margin:0 0 6px">Put ${esc(TRIP.name)} on your home screen</h3>
      <p class="section-sub" style="text-align:center;margin:0 0 16px;font-size:13.5px">One tap to open, works without signal, and you'll get alerts when plans change.</p>
      <div class="inst-steps">${steps}</div>
      <div class="btn-row" style="margin-top:18px">
        <button class="btn ghost" id="instLater" style="flex:1">Later</button>
        ${deferredInstall ? `<button class="btn primary" id="instGo" style="flex:2">Install</button>`
                          : `<button class="btn primary" id="instGot" style="flex:2">Got it</button>`}
      </div>`;
    $("#installModal").classList.add("open");
    $("#instLater").addEventListener("click", () => { LSG.set("installSnooze", Date.now() + 7 * 864e5); closeInstall(); });
    const got = $("#instGot"); if (got) got.addEventListener("click", () => { LSG.set("installSnooze", Date.now() + 2 * 864e5); closeInstall(); });
    const go = $("#instGo"); if (go) go.addEventListener("click", async () => {
      if (!deferredInstall) return closeInstall();
      deferredInstall.prompt();
      const res = await deferredInstall.userChoice.catch(() => ({}));
      if (res && res.outcome === "accepted") LSG.set("installDone", true);
      deferredInstall = null;
      closeInstall();
    });
  }
  function closeInstall() { $("#installModal").classList.remove("open"); }

  /* ---- who am I ------------------------------------------------------------ */
  function renderWhoami() {
    const t = byId(state.me);
    $("#whoamiName").textContent = t ? t.name.split(" ")[0] : "Who are you?";
    $("#whoamiAvatar").innerHTML = t ? avatarHTML(t, 26, 10) : "👤";
  }
  function openWho() {
    $("#whoOptions").innerHTML = (TRIP.travelers || []).map((t) => `<div class="who-opt ${state.me === t.id ? "sel" : ""}" data-me="${t.id}">
      ${avatarHTML(t, 34, 12)}${esc(t.name)}</div>`).join("")
      + (isWedding() ? `<div class="who-opt" id="whoAddMe" style="justify-content:center;font-weight:800;color:var(--ai-2)">＋ I'm not on the list. Add me</div>` : "");
    $$("#whoOptions [data-me]").forEach((o) => o.addEventListener("click", () => {
      const first = !state.me;
      state.me = o.dataset.me; LS.set("me", state.me); renderWhoami();
      $$("#whoOptions .who-opt").forEach((x) => x.classList.toggle("sel", x === o));
      renderCurrent();
      if (first) setTimeout(() => { $("#whoModal").classList.remove("open"); maybeOfferInstall(); }, 450);
    }));
    const am = $("#whoAddMe"); if (am) am.addEventListener("click", () => {
      $("#whoOptions").innerHTML = `
        <input id="whoNewName" placeholder="Your full name" style="width:100%;padding:12px;border:1px solid var(--line);border-radius:var(--r-sm);font-size:15px;margin-bottom:10px" />
        <button class="btn primary" id="whoNewSave" style="width:100%">That's me, add me to the guest list</button>
        <div id="whoNewMsg" class="r-sub" style="margin-top:6px"></div>`;
      $("#whoNewName").focus();
      $("#whoNewSave").addEventListener("click", async () => {
        const name = $("#whoNewName").value.trim();
        if (!name) { $("#whoNewMsg").textContent = "Type your name first."; return; }
        $("#whoNewMsg").textContent = "Adding you…";
        const fresh = await Backend.getTrip(TRIP_CODE); // re-fetch so we don't clobber other new guests
        if (fresh) TRIP = fresh;
        const travs = TRIP.travelers || [];
        const existing = travs.find((t) => t.name.toLowerCase() === name.toLowerCase());
        if (existing) { state.me = existing.id; LS.set("me", state.me); renderWhoami(); renderCurrent(); openWho(); return; }
        const me = { id: slug(name) + "-" + travs.length, name, color: PALETTE[travs.length % PALETTE.length] };
        const next = [...travs, me];
        const ok = await Backend.updateTrip(TRIP_CODE, { travelers: next });
        if (!ok) { $("#whoNewMsg").textContent = "Couldn't save. Try again."; return; }
        TRIP.travelers = next;
        state.me = me.id; LS.set("me", state.me);
        renderWhoami(); renderCurrent();
        $("#whoModal").classList.remove("open");
        setTimeout(maybeOfferInstall, 450);
      });
    });
    $("#whoModal").classList.add("open");
  }

  /* =========================================================================
     HOME
     ====================================================================== */
  function renderHome() {
    const s = $("#screen-home");
    const openCount = state.decisions.filter((d) => d.status !== "decided").length;
    s.innerHTML = `
      <div class="hero">
        <div class="sun"></div>
        <div class="kicker">${isWedding() ? "💍 You're invited · " + esc(TRIP.destination || "") : esc(TRIP.destination || "The trip")}</div>
        <h1 style="font-size:34px">${esc(TRIP.name)}</h1>
        <div class="dates">${fmtRange(TRIP.start_date, TRIP.end_date)} · ${nightsBetween(TRIP.start_date, TRIP.end_date)} nights</div>
        <div class="cities-row">${(TRIP.stops || []).map((c) => `<span class="city-chip">${esc(c.label)}</span>`).join("")}</div>
      </div>

      ${isWedding() ? weddingRsvpCard() : ""}

      <div class="countdown" id="countdown"></div>
      <div class="clocks" id="clocks"></div>

      ${todayCard()}
      ${isWedding() ? weddingLinksCard() : ""}

      <div class="section-title" style="margin-top:20px">${isWedding() ? "Who's coming" : "The crew"}</div>
      <div class="card">
        ${isWedding() ? weddingAttendanceHTML() : `
        <div class="crew-strip">${(TRIP.travelers || []).map((t) => `<span class="avatar stack" style="background:${t.color}" title="${esc(t.name)}">${initials(t.name)}</span>`).join("")}</div>
        <p style="margin:12px 0 0;font-size:13px;color:var(--ink-2)">${(TRIP.travelers || []).length} travelers${openCount ? ` · <b>${openCount} open vote${openCount === 1 ? "" : "s"}</b>` : ""}</p>`}
      </div>
      ${isWedding() ? weddingHostPanelHTML() + weddingCostCard() + weddingFaqCard() : ""}

      <div class="section-title">At a glance</div>
      <div class="quick-grid">
        <button class="quick-tile" data-go="itinerary"><div class="qi">🗓️</div><div class="qt">Plan</div><div class="qs">${state.days.length ? state.days.length + " days planned" : "Build the itinerary"}</div></button>
        <button class="quick-tile" data-go="decisions"><div class="qi">🗳️</div><div class="qt">Votes</div><div class="qs">${openCount ? openCount + " open" : "Ask the group"}</div></button>
        <button class="quick-tile" data-go="stays"><div class="qi">🏨</div><div class="qt">Stays</div><div class="qs">Submit & vote</div></button>
        <button class="quick-tile" data-go="budget"><div class="qi">💰</div><div class="qt">Budget</div><div class="qs">Split & settle</div></button>
        <button class="quick-tile" data-go="photos"><div class="qi">📸</div><div class="qt">Photos</div><div class="qs">${state.photos.length || "Shared album"}</div></button>
        <button class="quick-tile" data-go="vault"><div class="qi">🔐</div><div class="qt">Vault</div><div class="qs">Confirmations</div></button>
      </div>

      <div class="card" style="margin-top:16px">
        <h3>📍 Trip code</h3>
        <p class="section-sub" style="margin:4px 0 0">Friends join with this code (or the link below).</p>
        <div class="code-big">${esc(TRIP.code)}</div>
        <button class="btn ghost" id="copyLink" style="width:100%">Copy invite link</button>
      </div>

      <div class="foot-note">SquadTrip · everything syncs live for the whole group</div>`;
    s.querySelectorAll("[data-go]").forEach((b) => b.addEventListener("click", () => show(b.dataset.go)));
    s.querySelectorAll("[data-wrsvp]").forEach((b) => b.addEventListener("click", () => setVote("wrsvp", "attend", b.dataset.wrsvp)));
    s.querySelectorAll("[data-wparty]").forEach((b) => b.addEventListener("click", () => {
      const cur = myVote("wrsvp", "attend");
      if (cur !== "yes:" + b.dataset.wparty) setVote("wrsvp", "attend", "yes:" + b.dataset.wparty);
    }));
    const wds = $("#wrDetSave"); if (wds) wds.addEventListener("click", async () => {
      if (!state.me) { openWho(); return; }
      const choice = JSON.stringify({ names: $("#wrNames").value.trim(), dietary: $("#wrDiet").value.trim() });
      state.allVotes = state.allVotes.filter((v) => !(v.kind === "wrsvp" && v.topic === "details" && v.voter === state.me));
      state.allVotes.push({ kind: "wrsvp", topic: "details", choice, voter: state.me });
      const ok = await Backend.castVote(TRIP_CODE, "wrsvp", "details", choice, state.me);
      $("#wrDetMsg").textContent = ok ? "Saved ✓ (the hosts can see this)" : "Couldn't save. Try again.";
    });
    $("#copyLink").addEventListener("click", () => {
      const url = location.origin + location.pathname + "?t=" + TRIP.code;
      navigator.clipboard?.writeText(url).then(() => { $("#copyLink").textContent = "Copied ✓"; setTimeout(() => $("#copyLink").textContent = "Copy invite link", 1500); }).catch(() => {});
    });
    tickCountdown(); renderClocks();
  }
  /* ---- Wedding mode: RSVP, links, attendance ------------------------------ */
  function myRsvpDetails() {
    try { return JSON.parse(myVote("wrsvp", "details") || "{}") || {}; } catch { return {}; }
  }
  function weddingRsvpCard() {
    const mine = myVote("wrsvp", "attend");
    const accepted = typeof mine === "string" && mine.startsWith("yes");
    const party = accepted ? (parseInt(mine.split(":")[1], 10) || 1) : 1;
    const deadline = (TRIP.links || {}).rsvp_deadline;
    const det = myRsvpDetails();
    const ghost = "background:rgba(255,255,255,.12);color:#f6f1e8;border-color:rgba(246,241,232,.35)";
    return `<div class="card ai-card" style="margin-top:14px">
      <h3>💌 Will you be there?</h3>
      <p class="section-sub" style="margin:4px 0 12px">${deadline ? `Please RSVP by <b>${esc(deadline)}</b>. The hosts need headcounts.` : "RSVP so the hosts can plan headcounts."} You can change it any time.</p>
      <div class="btn-row">
        <button class="btn ${accepted ? "primary" : "ghost"}" data-wrsvp="yes:${party}" style="flex:1;${accepted ? "" : ghost}">Joyfully accept</button>
        <button class="btn ${mine === "no" ? "primary" : "ghost"}" data-wrsvp="no" style="flex:1;${mine === "no" ? "" : ghost}">Can't make it</button>
      </div>
      ${accepted ? `<div style="display:flex;align-items:center;gap:8px;margin-top:12px;flex-wrap:wrap">
        <span style="font-size:13px;font-weight:700">In my party:</span>
        ${[1, 2, 3, 4, 5].map((n) => `<button class="rsvp-btn ${party === n ? "on" : ""}" data-wparty="${n}" style="${party === n ? "" : ghost}">${n}</button>`).join("")}
      </div>
      <div class="expense-add" style="margin-top:12px">
        <input id="wrNames" placeholder="Names in your party (incl. you)" value="${esc(det.names || "")}" style="background:rgba(255,255,255,.94)" />
        <input id="wrDiet" placeholder="Meals / dietary notes (allergies, vegetarian…)" value="${esc(det.dietary || "")}" style="background:rgba(255,255,255,.94)" />
        <button class="btn ghost" id="wrDetSave" style="${ghost}">Save details</button>
      </div>
      <div id="wrDetMsg" class="r-sub" style="margin-top:4px"></div>` : ""}
    </div>`;
  }
  function weddingLinksCard() {
    const L = TRIP.links || {};
    const rows = [
      L.roomblock ? `<a class="btn ghost" href="${esc(L.roomblock)}" target="_blank" rel="noopener" style="display:block;text-align:center;text-decoration:none;margin-bottom:8px">🏨 Book the room block${L.deadline ? ` · by ${esc(L.deadline)}` : ""}</a>` : "",
      L.registry ? `<a class="btn ghost" href="${esc(L.registry)}" target="_blank" rel="noopener" style="display:block;text-align:center;text-decoration:none;margin-bottom:8px">🎁 Registry</a>` : "",
      L.site ? `<a class="btn ghost" href="${esc(L.site)}" target="_blank" rel="noopener" style="display:block;text-align:center;text-decoration:none">💒 Wedding website</a>` : "",
    ].filter(Boolean).join("");
    if (!rows) return isHost() ? `<div class="card" style="margin-top:2px"><h3>💍 Wedding links</h3><p class="section-sub" style="margin:4px 0 0">Add the room block, registry, and website links in <b>More → Settings</b> so guests see them here.</p></div>` : "";
    return `<div class="card" style="margin-top:2px"><h3>💍 The essentials</h3><div style="margin-top:10px">${rows}</div></div>`;
  }
  function weddingAttendanceHTML() {
    const t = tally("wrsvp", "attend");
    let parties = [], people = 0, declined = (t["no"] || []).length;
    Object.entries(t).forEach(([choice, voters]) => {
      if (choice.startsWith("yes")) { parties.push(...voters); people += voters.length * (parseInt(choice.split(":")[1], 10) || 1); }
    });
    return `${parties.length ? `<div class="crew-strip">${voterChips(parties)}</div>` : ""}
      <p style="margin:${parties.length ? "12px" : "0"} 0 0;font-size:13px;color:var(--ink-2)">
        ${parties.length ? `<b>${people}</b> attending across ${parties.length} ${parties.length === 1 ? "party" : "parties"}${declined ? ` · ${declined} can't make it` : ""}` : "No RSVPs yet. Be the first."}
      </p>`;
  }
  function weddingCostCard() {
    const cost = (TRIP.links || {}).cost;
    if (!cost) return "";
    return `<div class="card"><h3>💵 What this weekend roughly costs</h3>
      <p style="margin:8px 0 0;font-size:13.5px;color:var(--ink-2);line-height:1.6">${esc(cost)}</p></div>`;
  }
  function weddingFaqCard() {
    const faq = (TRIP.links || {}).faq || [];
    if (!faq.length) return "";
    return `<div class="card"><h3>❓ Good to know</h3>
      ${faq.map((f) => `<details style="margin-top:10px"><summary style="font-weight:700;font-size:13.5px;cursor:pointer">${esc(f.q)}</summary>
        <p style="margin:6px 0 0;font-size:13px;color:var(--ink-2);line-height:1.55">${esc(f.a)}</p></details>`).join("")}
    </div>`;
  }
  function weddingHostPanelHTML() {
    if (!isHost()) return "";
    const t = tally("wrsvp", "attend");
    const responded = new Set(Object.values(t).flat());
    const waiting = (TRIP.travelers || []).filter((tr) => !responded.has(tr.id));
    const yes = [];
    Object.entries(t).forEach(([choice, voters]) => {
      if (choice.startsWith("yes")) voters.forEach((v) => yes.push({ id: v, n: parseInt(choice.split(":")[1], 10) || 1 }));
    });
    const detailRows = yes.map(({ id, n }) => {
      const tr = byId(id); if (!tr) return "";
      let det = {}; try { det = JSON.parse((state.allVotes.find((v) => v.kind === "wrsvp" && v.topic === "details" && v.voter === id) || {}).choice || "{}") || {}; } catch { /* noop */ }
      return `<div class="row">${avatarHTML(tr, 34, 11)}
        <div class="r-main"><div class="r-title">${esc(tr.name)} · party of ${n}</div>
          <div class="r-sub">${esc(det.names || "")}${det.names && det.dietary ? " · " : ""}${det.dietary ? "🍽 " + esc(det.dietary) : ""}${!det.names && !det.dietary ? "No details yet" : ""}</div></div>
      </div>`;
    }).join("");
    return `<div class="card" style="border-color:var(--gold-soft)">
      <h3>📋 Host view</h3>
      ${waiting.length ? `<p class="section-sub" style="margin:6px 0 8px"><b>Waiting on ${waiting.length}:</b> ${waiting.map((w) => esc(w.name.split(" ")[0])).join(", ")}</p>` : `<p class="section-sub" style="margin:6px 0 8px">Everyone on the list has answered ✓</p>`}
      ${detailRows ? `<div class="check-cat" style="margin:10px 0 2px">Accepted parties</div>${detailRows}` : ""}
    </div>`;
  }
  function todayCard() {
    const now = new Date();
    if (now < new Date(TRIP.start_date + "T00:00:00") || now > new Date(TRIP.end_date + "T23:59:59")) return "";
    const iso = now.toISOString().slice(0, 10);
    const day = state.days.find((d) => d.date === iso) || state.days.find((d) => d.date >= iso);
    if (!day) return "";
    return `<div class="card" style="margin-top:14px;border-color:var(--ai)">
      <span class="pill any">Today</span>
      <h3 style="margin:8px 0 4px">${esc(day.title)}</h3>
      <div class="r-sub">${esc(day.summary || "")}</div>
      ${day.meetup ? `<div class="meetup" style="margin:10px 0 0">📍 ${esc(day.meetup)}</div>` : ""}
    </div>`;
  }
  function tickCountdown() {
    const box = $("#countdown"); if (!box) return;
    const target = new Date(TRIP.start_date + "T08:00:00");
    const now = new Date();
    let diff = Math.max(0, target - now);
    const day = Math.floor(diff / 86400000); diff -= day * 86400000;
    const hr = Math.floor(diff / 3600000); diff -= hr * 3600000;
    const mn = Math.floor(diff / 60000); diff -= mn * 60000;
    const sc = Math.floor(diff / 1000);
    box.innerHTML = (now >= target)
      ? `<div class="count-box" style="grid-column:1/-1"><div class="num">🎉 It's trip time!</div></div>`
      : [[day, "Days"], [hr, "Hours"], [mn, "Min"], [sc, "Sec"]].map(([n, l]) => `<div class="count-box"><div class="num">${n}</div><div class="lbl">${l}</div></div>`).join("");
  }
  setInterval(() => { if (TRIP && $("#screen-home").classList.contains("active")) tickCountdown(); }, 1000);
  function renderClocks() {
    const box = $("#clocks"); if (!box) return;
    const homeTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const fmt = (tz) => { try { return new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit", hour12: true }).format(new Date()); } catch { return "–"; } };
    box.innerHTML = `
      <div class="clock"><div class="place">Home</div><div class="time">${fmt(homeTz)}</div></div>
      <div class="clock"><div class="place">${esc(TRIP.destination || "There")}</div><div class="time">${fmt(TRIP.tz)}</div></div>`;
  }
  setInterval(() => { if (TRIP && $("#screen-home").classList.contains("active")) renderClocks(); }, 15000);

  /* =========================================================================
     ITINERARY - editable, with RSVP
     ====================================================================== */
  const openDays = new Set();
  function renderItinerary() {
    const s = $("#screen-itinerary");
    s.innerHTML = `
      <div class="section-title">${isWedding() ? "The weekend" : "The plan"}</div>
      <div class="section-sub">${isWedding()
        ? (isHost() ? "The event schedule your guests see. Add days and events; guests tap <b>＋ I'm in</b> to RSVP to each one." : "The schedule of events. Tap <b>＋ I'm in</b> on anything you'll join so the hosts can plan headcounts.")
        : "Anyone can add days and activities. Hit <b>＋ I'm in</b> on anything you'd join."}</div>
      ${state.days.length < 2 && isHost() ? `<div class="card ai-card">
        <h3>✨ Set up my ${isWedding() ? "wedding weekend" : "trip"} with AI</h3>
        <p class="section-sub" style="margin:4px 0 12px">Claude drafts the works for ${esc(TRIP.destination || "your destination")}: a full day-by-day ${isWedding() ? "schedule" : "itinerary"}, destination guide, neighborhood breakdowns${isWedding() ? "" : " for picking where to stay"}, and starter ${isWedding() ? "ideas" : "votes & ideas"} for the group. Everything stays editable.</p>
        <button class="btn primary" id="aiBuild" style="width:100%">✨ Set it up</button>
        <div id="aiStatus" class="r-sub" style="margin-top:8px"></div>
      </div>` : ""}
      <div id="dayList"></div>
      ${isHost() ? `<div class="card">
        <h3>＋ Add a day</h3>
        <div class="expense-add">
          <input id="dDate" type="date" min="${esc(TRIP.start_date)}" max="${esc(TRIP.end_date)}" />
          <input id="dTitle" placeholder="${isWedding() ? "Title (e.g. Welcome dinner day)" : "Title (e.g. Old-town day)"}" />
          <input id="dSummary" placeholder="One-line summary (optional)" />
          <input id="dMeetup" placeholder="${isWedding() ? "Dress code / details (optional)" : "Meetup spot + time (optional)"}" />
          <button class="btn primary" id="dAdd">Add day</button>
        </div>
      </div>` : ""}`;
    renderDayList();
    const da = $("#dAdd"); if (da) da.addEventListener("click", addDay);
    const ab = $("#aiBuild"); if (ab) ab.addEventListener("click", aiBuildPlan);
  }
  async function callAI(mode) {
    const cfg = window.CARAVAN_CONFIG;
    const res = await fetch(`${cfg.url}/functions/v1/generate-plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + cfg.anonKey, "apikey": cfg.anonKey },
      body: JSON.stringify({ code: TRIP_CODE, mode }),
    });
    return await res.json().catch(() => ({ error: "Bad response from the AI function" }));
  }
  async function aiBuildPlan() {
    const btn = $("#aiBuild"), st = $("#aiStatus");
    btn.disabled = true; btn.style.opacity = 0.6;
    try {
      st.textContent = "✨ Step 1/2: drafting your day-by-day itinerary… (~30s)";
      const plan = await callAI("plan");
      if (!plan.ok) { st.textContent = plan.error || "Generation failed. Is the edge function deployed?"; btn.disabled = false; btn.style.opacity = 1; return; }
      await hydrate("days");
      st.textContent = `✓ ${plan.days} days drafted. ✨ Step 2/2: guides, neighborhoods & starter votes… (~30s)`;
      const intel = await callAI("intel");
      await hydrate("all");
      st.textContent = intel.ok
        ? `Done! ${plan.days} days, ${intel.guides} guide cards, ${intel.decisions} votes, ${intel.ideas} ideas. Explore the Guide tab + Votes.`
        : `Itinerary done (${plan.days} days). Intel step: ${intel.error || "failed"}.`;
      renderItinerary();
    } catch (e) {
      st.textContent = "Couldn't reach the AI function. Check it's deployed (see README).";
      btn.disabled = false; btn.style.opacity = 1;
    }
  }
  function renderDayList() {
    const list = $("#dayList"); if (!list) return;
    if (!state.days.length) { list.innerHTML = `<div class="empty">No days yet. Add the first one below.</div>`; return; }
    list.innerHTML = state.days.map((d) => {
      const f = fmtDate(d.date);
      const items = (d.items || []).map((it, ii) => {
        const tm = TYPE[it.type] || TYPE.activity;
        const iid = `${d.id}#${ii}`;
        const going = tally("rsvp", iid)["in"] || [];
        const meIn = myVote("rsvp", iid) === "in";
        return `<div class="tl-item ${it.type || "activity"}">
          ${it.time ? `<div class="tl-time">${esc(it.time)}</div>` : ""}
          <div class="tl-title"><span class="type-emoji">${tm.emoji}</span>${esc(it.title)}</div>
          ${it.note ? `<div class="tl-note">${esc(it.note)}</div>` : ""}
          <div class="rsvp">
            <button class="rsvp-btn ${meIn ? "on" : ""}" data-rsvp="${iid}">${meIn ? "✓ You're in" : "＋ I'm in"}</button>
            ${going.length ? `<span class="tally" style="margin:0">${voterChips(going)}</span>` : ""}
            <a class="tl-map" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(it.title + " " + (TRIP.destination || ""))}" target="_blank" rel="noopener">📍</a>
            ${isHost() ? `<span class="tl-map" style="color:var(--vermilion)" data-rmitem="${d.id}#${ii}">✕</span>` : ""}
          </div>
        </div>`;
      }).join("");
      return `<div class="day ${openDays.has(d.id) ? "open" : ""}" data-date="${d.id}">
        <div class="day-head">
          <div class="day-date"><div class="d">${f.day}</div><div class="m">${f.wd} ${f.mon}</div></div>
          <div class="info"><div class="t">${esc(d.title)}${d.stop ? ` <span class="${stopPillClass(d.stop)}">${esc(stopById(d.stop).label)}</span>` : ""}</div>
            <div class="s">${esc(d.summary || "")}</div></div>
          <div class="caret">▶</div>
        </div>
        <div class="day-body">
          ${d.meetup ? `<div class="meetup">${isWedding() ? "👔" : "📍"} <span>${isWedding() ? esc(d.meetup) : "Meetup: " + esc(d.meetup)}</span></div>` : ""}
          <div class="timeline">${items || ""}</div>
          ${isHost() ? `<div class="expense-add" style="margin:10px 0 8px">
            <div style="display:flex;gap:8px">
              <input data-itime="${d.id}" type="time" style="flex:1" />
              <select data-itype="${d.id}" style="flex:1.2">${Object.entries(TYPE).map(([k, v]) => `<option value="${k}">${v.emoji} ${v.label}</option>`).join("")}</select>
            </div>
            <input data-ititle="${d.id}" placeholder="${isWedding() ? "Add an event…" : "Add an activity…"}" />
            <div class="btn-row">
              <button class="btn primary" data-iadd="${d.id}" style="flex:2">＋ Add</button>
              <button class="btn danger" data-rmday="${d.id}" style="flex:1">Delete day</button>
            </div>
          </div>` : ""}
        </div>
      </div>`;
    }).join("");
    list.querySelectorAll(".day-head").forEach((h) => h.addEventListener("click", () => {
      const id = h.parentElement.dataset.date;
      if (openDays.has(id)) openDays.delete(id); else openDays.add(id);
      h.parentElement.classList.toggle("open");
    }));
    list.querySelectorAll("[data-rsvp]").forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); setVote("rsvp", b.dataset.rsvp, "in"); }));
    list.querySelectorAll("[data-iadd]").forEach((b) => b.addEventListener("click", () => addItem(b.dataset.iadd)));
    list.querySelectorAll("[data-rmitem]").forEach((b) => b.addEventListener("click", () => removeItem(b.dataset.rmitem)));
    list.querySelectorAll("[data-rmday]").forEach((b) => b.addEventListener("click", async () => {
      if (!confirm("Delete this whole day?")) return;
      state.days = state.days.filter((x) => x.id !== b.dataset.rmday);
      renderDayList();
      await Backend.remove("days", b.dataset.rmday);
    }));
  }
  async function addDay() {
    const date = $("#dDate").value, title = $("#dTitle").value.trim();
    if (!date || !title) { alert("Pick a date and give the day a title."); return; }
    const row = await Backend.insert("days", { trip: TRIP_CODE, date, title, summary: $("#dSummary").value.trim(), meetup: $("#dMeetup").value.trim(), items: [] });
    if (row) { state.days.push(row); state.days.sort((a, b) => a.date.localeCompare(b.date)); openDays.add(row.id); renderItinerary(); }
  }
  async function addItem(dayId) {
    const d = state.days.find((x) => x.id === dayId); if (!d) return;
    const title = $(`[data-ititle="${dayId}"]`).value.trim(); if (!title) return;
    const item = { time: $(`[data-itime="${dayId}"]`).value, type: $(`[data-itype="${dayId}"]`).value, title, note: "" };
    d.items = [...(d.items || []), item];
    renderDayList();
    await Backend.update("days", dayId, { items: d.items });
  }
  async function removeItem(key) {
    const [dayId, idx] = key.split("#");
    const d = state.days.find((x) => x.id === dayId); if (!d) return;
    d.items = (d.items || []).filter((_, i) => i !== +idx);
    renderDayList();
    await Backend.update("days", dayId, { items: d.items });
  }

  /* =========================================================================
     CREW
     ====================================================================== */
  function renderCrew() {
    const s = $("#screen-crew");
    s.innerHTML = `
      <div class="section-title">The crew</div>
      <div class="section-sub">${(TRIP.travelers || []).length} travelers. Tap "Who are you?" up top to tag yourself, then add a photo.</div>
      <div class="pair-card">
        ${(TRIP.travelers || []).map((t) => `<div class="person">
          ${avatarHTML(t, 52, 17)}
          <div class="p-info"><div class="p-name">${esc(t.name)}${state.me === t.id ? '<span class="badge-you">YOU</span>' : ""}</div>
            ${state.me === t.id ? `<div class="p-sub"><label class="tl-map" for="crewPhoto" style="cursor:pointer">📷 ${t.photo ? "Change photo" : "Add your photo"}</label></div>` : ""}</div>
        </div>`).join("")}
      </div>
      <input id="crewPhoto" type="file" accept="image/*" style="display:none" />
      <div id="crewPhotoStatus" class="r-sub" style="margin:0 4px 12px"></div>
      <div class="card">
        <h3>📍 Invite someone</h3>
        <p class="section-sub" style="margin:4px 0 0">Share the code <b>${esc(TRIP.code)}</b> or copy the link from Home. New joiners pick their name from this list.</p>
      </div>`;
    const cp = $("#crewPhoto");
    if (cp) cp.addEventListener("change", async () => {
      const file = cp.files[0]; if (!file || !state.me) return;
      $("#crewPhotoStatus").textContent = "Uploading\u2026";
      try {
        const blob = await squarePhoto(file, 400);
        const up = await Backend.uploadFile(TRIP_CODE, new File([blob], "avatar.jpg", { type: "image/jpeg" }));
        if (!up) { $("#crewPhotoStatus").textContent = "Upload failed \u2014 try again."; return; }
        const t = (TRIP.travelers || []).find((x) => x.id === state.me);
        if (t) t.photo = up.url;
        await Backend.updateTrip(TRIP.code, { travelers: TRIP.travelers });
        renderCrew(); renderWhoami();
      } catch (e) { $("#crewPhotoStatus").textContent = "Couldn't process that image."; }
    });
  }
  // Center-crop an image file to a square JPEG of the given size.
  function squarePhoto(file, size) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas");
        c.width = c.height = size;
        const s2 = Math.min(img.width, img.height);
        const sx = (img.width - s2) / 2, sy = (img.height - s2) / 2;
        c.getContext("2d").drawImage(img, sx, sy, s2, s2, 0, 0, size, size);
        c.toBlob((b) => b ? resolve(b) : reject(new Error("blob")), "image/jpeg", 0.85);
        URL.revokeObjectURL(img.src);
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }

  /* =========================================================================
     DECISIONS
     ====================================================================== */
  function renderDecisions() {
    const s = $("#screen-decisions");
    s.innerHTML = `
      <div class="section-title">Votes</div>
      <div class="section-sub">${isWedding() ? "Questions from the hosts. Tap your pick, tallies update live." : "Open questions for the group. Tap your pick, tallies update live. Anyone can add one."}</div>
      ${!state.me ? `<div class="card" style="border-color:var(--sakura-deep);background:#fdf3f5"><b>Tag yourself first</b>. Tap "Who are you?" up top. <button class="btn primary" id="decWho" style="margin-top:10px;width:100%">Set who I am</button></div>` : ""}
      ${state.decisions.length ? state.decisions.map((d) => {
        const mine = myVote("decision", d.id);
        const counts = tally("decision", d.id);
        const author = d.author ? (byId(d.author) || {}).name : "";
        return `<div class="card">
          <h3 style="margin:0">${esc(d.title)}</h3>
          ${d.note ? `<p class="section-sub" style="margin:8px 0 12px">${esc(d.note)}</p>` : `<div style="height:8px"></div>`}
          <div style="display:grid;gap:8px">
            ${(d.options || []).map((o) => {
              const voters = counts[o.id] || [];
              const sel = mine === o.id;
              return `<button class="who-opt ${sel ? "sel" : ""}" data-dec="${d.id}" data-opt="${o.id}" style="text-align:left;width:100%;align-items:flex-start">
                <span style="font-size:18px;margin-top:1px">${sel ? "🔘" : "⚪"}</span>
                <div style="flex:1;min-width:0"><div style="font-weight:700">${esc(o.label)}</div>
                  ${voters.length ? `<div class="tally">${voterChips(voters)}<span class="tally-n">${voters.length}</span></div>` : ""}
                </div>
              </button>`;
            }).join("")}
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px">
            <span class="r-sub" style="font-size:11px">${author ? "asked by " + esc(author.split(" ")[0]) : ""}</span>
            ${d.author === state.me ? `<button class="btn danger" data-decdel="${d.id}">Remove</button>` : ""}
          </div>
        </div>`;
      }).join("") : `<div class="empty">No questions yet. Pose the first one.</div>`}
      ${isHost() ? `<div class="card">
        <h3>Ask the group</h3>
        <div class="expense-add">
          <input id="decTitle" placeholder="The question" />
          <input id="decNote" placeholder="Context (optional)" />
          <input id="decO0" placeholder="Option 1" />
          <input id="decO1" placeholder="Option 2" />
          <input id="decO2" placeholder="Option 3 (optional)" />
          <input id="decO3" placeholder="Option 4 (optional)" />
          <button class="btn primary" id="decAdd">Post it</button>
        </div>
      </div>` : ""}`;
    s.querySelectorAll("[data-dec]").forEach((b) => b.addEventListener("click", () => setVote("decision", b.dataset.dec, b.dataset.opt)));
    s.querySelectorAll("[data-decdel]").forEach((b) => b.addEventListener("click", async () => {
      state.decisions = state.decisions.filter((x) => x.id !== b.dataset.decdel); renderDecisions();
      await Backend.remove("decisions", b.dataset.decdel);
    }));
    const dA = $("#decAdd"); if (dA) dA.addEventListener("click", addDecision);
    const dw = $("#decWho"); if (dw) dw.addEventListener("click", openWho);
  }
  async function addDecision() {
    if (!state.me) { openWho(); return; }
    const title = $("#decTitle").value.trim();
    const opts = [0, 1, 2, 3].map((i) => $("#decO" + i).value.trim()).filter(Boolean);
    if (!title || opts.length < 2) { alert("Add the question and at least two options."); return; }
    const options = opts.map((label, i) => ({ id: "opt" + i, label }));
    const row = await Backend.insert("decisions", { trip: TRIP_CODE, title, note: $("#decNote").value.trim(), options, status: "open", author: state.me });
    if (row) { state.decisions.push(row); renderDecisions(); }
  }

  /* =========================================================================
     STAYS - submit up to 2 per stop, vote
     ====================================================================== */
  const MAX_STAY = 2;
  function renderStays() {
    const s = $("#screen-stays");
    if (isWedding()) {
      const L = TRIP.links || {};
      s.innerHTML = `
        <div class="section-title">Where to stay</div>
        <div class="section-sub">The hosts' picks for where guests should base themselves.</div>
        ${L.roomblock ? `<div class="card ai-card">
          <h3>🏨 Room block</h3>
          <p class="section-sub" style="margin:4px 0 12px">The hosts reserved rooms at group rates${L.deadline ? ` (<b>book by ${esc(L.deadline)}</b>)` : ""}.</p>
          <a class="btn primary" href="${esc(L.roomblock)}" target="_blank" rel="noopener" style="display:block;text-align:center;text-decoration:none">Book a room</a>
        </div>` : (isHost() ? `<div class="card"><h3>🏨 Room block</h3><p class="section-sub" style="margin:4px 0 0">Add the room-block link in <b>More → Settings</b> and guests will see a big Book button here.</p></div>` : `<div class="empty">No room block posted yet. Check back soon.</div>`)}
        ${(TRIP.stops || []).map((st) => {
          const hoods = state.guides.filter((g) => g.kind === "hood" && g.stop === st.id);
          return hoods.length ? `<div style="margin-bottom:20px">
            <div style="display:flex;align-items:center;gap:9px;margin:0 2px 10px"><span class="${stopPillClass(st.id)}">${esc(st.label)}</span><span class="r-sub" style="font-size:12px">neighborhoods, if you're booking your own</span></div>
            <div class="hood-scroll">${hoods.map((n) => `<div class="hood-card">
              <div class="hood-name">${esc(n.emoji || "📍")} ${esc(n.title)}</div>
              <div class="hood-tags">${(n.tags || []).map((t) => `<span>${esc(t)}</span>`).join("")}</div>
              <div class="hood-blurb">${esc(n.body)}</div>
              ${n.base ? `<div class="hood-base">🛏️ ${esc(n.base)}</div>` : ""}
            </div>`).join("")}</div>
          </div>` : "";
        }).join("")}`;
      return;
    }
    s.innerHTML = `
      <div class="section-title">Where we sleep</div>
      <div class="section-sub">Everyone submits up to ${MAX_STAY} places per stop, then the group votes.</div>
      ${(TRIP.stops || []).map((st) => {
        const mine = myVote("stay", st.id);
        const counts = tally("stay", st.id);
        const options = state.stayOptions.filter((p) => p.stop === st.id);
        const myCount = options.filter((o) => o.author === state.me).length;
        return `<div style="margin-bottom:28px">
          <div style="display:flex;align-items:center;gap:9px;margin:0 2px 10px"><span class="${stopPillClass(st.id)}">${esc(st.label)}</span></div>
          ${(() => { const hoods = state.guides.filter((g) => g.kind === "hood" && g.stop === st.id); return hoods.length ? `<div class="hood-scroll">${hoods.map((n) => `<div class="hood-card">
            <div class="hood-name">${esc(n.emoji || "📍")} ${esc(n.title)}</div>
            <div class="hood-tags">${(n.tags || []).map((t) => `<span>${esc(t)}</span>`).join("")}</div>
            <div class="hood-blurb">${esc(n.body)}</div>
            ${n.base ? `<div class="hood-base">🛏️ ${esc(n.base)}</div>` : ""}
          </div>`).join("")}</div>` : ""; })()}
          ${options.length ? options.map((o) => {
            const voters = counts[o.id] || [];
            const sel = mine === o.id;
            const author = byId(o.author);
            return `<button class="stay-opt ${sel ? "sel" : ""}" data-stay="${st.id}" data-opt="${o.id}">
              <div class="stay-opt-main">
                <div class="stay-opt-name">${esc(o.name)}</div>
                <div class="stay-opt-tag">${esc(o.tag || "")}${author ? ` · by ${esc(author.name.split(" ")[0])}` : ""}</div>
                ${o.note ? `<div class="stay-opt-note">${esc(o.note)}</div>` : ""}
                <div style="display:flex;align-items:center;gap:14px;margin-top:8px;flex-wrap:wrap">
                  ${o.link ? `<a class="tl-map" href="${esc(o.link)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">🔗 Link</a>` : ""}
                  <a class="tl-map" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(o.name + " " + st.label)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">📍 Map</a>
                  ${o.author === state.me ? `<span class="tl-map" style="color:var(--vermilion)" data-staydel="${o.id}">Remove</span>` : ""}
                </div>
                ${voters.length ? `<div class="tally" style="margin-top:8px">${voterChips(voters)}<span class="tally-n">${voters.length} vote${voters.length === 1 ? "" : "s"}</span></div>` : ""}
              </div>
              <div class="stay-check">${sel ? "◉" : "◯"}</div>
            </button>`;
          }).join("") : `<div class="empty" style="padding:14px">Nothing for ${esc(st.label)} yet.</div>`}
          ${myCount < MAX_STAY
            ? `<button class="btn ghost" data-proposestop="${st.id}" style="width:100%">+ Submit a place (${MAX_STAY - myCount} left)</button>`
            : `<div class="r-sub" style="text-align:center;padding:8px">You've used your ${MAX_STAY} for ${esc(st.label)}.</div>`}
        </div>`;
      }).join("")}
      <div id="proposeForm"></div>`;
    s.querySelectorAll("[data-opt]").forEach((b) => b.addEventListener("click", () => setVote("stay", b.dataset.stay, b.dataset.opt)));
    s.querySelectorAll("[data-staydel]").forEach((b) => b.addEventListener("click", async (e) => {
      e.stopPropagation();
      state.stayOptions = state.stayOptions.filter((x) => x.id !== b.dataset.staydel); renderStays();
      await Backend.remove("stay_options", b.dataset.staydel);
    }));
    s.querySelectorAll("[data-proposestop]").forEach((b) => b.addEventListener("click", () => openProposeStay(b.dataset.proposestop)));
  }
  function openProposeStay(stopId) {
    if (!state.me) { openWho(); return; }
    const st = stopById(stopId);
    $("#proposeForm").innerHTML = `<div class="card" style="border-color:var(--ai)">
      <h3>Submit a place in ${esc(st.label)}</h3>
      <div class="expense-add">
        <input id="psName" placeholder="Hotel / house name" />
        <input id="psTag" placeholder="Neighborhood + vibe (optional)" />
        <input id="psNote" placeholder="Why it's good (optional)" />
        <input id="psLink" placeholder="Link (optional)" />
        <button class="btn primary" id="psAdd">Add it</button>
      </div>
    </div>`;
    $("#psAdd").addEventListener("click", () => addProposedStay(stopId));
    $("#proposeForm").scrollIntoView({ behavior: "smooth", block: "center" });
  }
  async function addProposedStay(stopId) {
    const name = $("#psName").value.trim(); if (!name) { alert("Add a place name."); return; }
    const row = await Backend.insert("stay_options", { trip: TRIP_CODE, stop: stopId, name, tag: $("#psTag").value.trim(), note: $("#psNote").value.trim(), link: $("#psLink").value.trim(), author: state.me });
    if (row) { state.stayOptions.push(row); renderStays(); }
  }

  /* =========================================================================
     FLIGHTS
     ====================================================================== */
  function renderFlights() {
    const s = $("#screen-flights");
    const mine = (dir) => state.flights.find((f) => f.traveler === state.me && f.dir === dir) || {};
    const flightRow = (f) => {
      const t = byId(f.traveler) || { name: "?" , color: "#999" };
      const line = [f.airline, f.flight_no].filter(Boolean).join(" ");
      const when = [f.date ? `${fmtDate(f.date).wd} ${fmtDate(f.date).mon} ${fmtDate(f.date).day}` : "", f.time].filter(Boolean).join(" · ");
      return `<div class="row">${avatarHTML(t, 34, 11)}
        <div class="r-main"><div class="r-title">${esc(t.name.split(" ")[0])}${f.airport ? " · " + esc(f.airport) : ""}</div>
          <div class="r-sub">${esc([line, when].filter(Boolean).join(" · ") || "–")}${f.note ? " · " + esc(f.note) : ""}</div></div>
      </div>`;
    };
    const sortK = (f) => (f.date || "") + (f.time || "");
    const arr = state.flights.filter((f) => f.dir === "arrive").sort((a, b) => sortK(a).localeCompare(sortK(b)));
    const dep = state.flights.filter((f) => f.dir === "depart").sort((a, b) => sortK(a).localeCompare(sortK(b)));
    const fields = (p, dir) => `<div class="expense-add">
      <input id="${p}_airline" placeholder="Airline" value="${esc(mine(dir).airline || "")}" />
      <div style="display:flex;gap:8px">
        <input id="${p}_flight" placeholder="Flight #" value="${esc(mine(dir).flight_no || "")}" style="flex:2" />
        <input id="${p}_airport" placeholder="Airport" value="${esc(mine(dir).airport || "")}" style="flex:1" />
      </div>
      <div style="display:flex;gap:8px">
        <input id="${p}_date" type="date" value="${esc(mine(dir).date || (dir === "arrive" ? TRIP.start_date : TRIP.end_date))}" style="flex:2" />
        <input id="${p}_time" type="time" value="${esc(mine(dir).time || "")}" style="flex:1" />
      </div>
      <input id="${p}_note" placeholder="Note (optional)" value="${esc(mine(dir).note || "")}" />
      <button class="btn primary" id="${p}Save">Save ${dir === "arrive" ? "arrival" : "departure"}</button>
    </div>`;
    s.innerHTML = `
      <div class="section-title">Flights</div>
      <div class="section-sub">Everyone adds their own. The whole group sees the boards.</div>
      ${!state.me ? `<div class="card" style="border-color:var(--sakura-deep);background:#fdf3f5"><b>Tag yourself first</b> so flights save to you. <button class="btn primary" id="flWho" style="margin-top:10px;width:100%">Set who I am</button></div>` : `
      <div class="card">
        <h3>✈️ Your flights</h3>
        <div class="check-cat" style="margin:8px 0 8px">🛬 Arrival</div>${fields("fa", "arrive")}
        <div class="check-cat" style="margin:18px 0 8px">🛫 Departure</div>${fields("fd", "depart")}
      </div>`}
      <div class="section-title" style="font-size:16px">🛬 Arrivals${isWedding() ? " · shuttle windows" : ""}</div>
      ${isWedding() ? shuttleBoard(arr, flightRow) : `<div class="card">${arr.length ? arr.map(flightRow).join("") : `<div class="empty">None yet.</div>`}</div>`}
      <div class="section-title" style="font-size:16px">🛫 Departures${isWedding() ? " · shuttle windows" : ""}</div>
      ${isWedding() ? shuttleBoard(dep, flightRow) : `<div class="card">${dep.length ? dep.map(flightRow).join("") : `<div class="empty">None yet.</div>`}</div>`}`;
    const w = $("#flWho"); if (w) w.addEventListener("click", openWho);
    const fa = $("#faSave"); if (fa) fa.addEventListener("click", () => saveFlight("arrive"));
    const fd = $("#fdSave"); if (fd) fd.addEventListener("click", () => saveFlight("depart"));
  }
  // Wedding: group flights by date, then 3-hour windows - shuttle groups assemble themselves.
  function shuttleBoard(list, flightRow) {
    if (!list.length) return `<div class="card"><div class="empty">None yet. Everyone adds their own above.</div></div>`;
    const byDate = {};
    list.forEach((f) => { const d = f.date || "TBD"; (byDate[d] = byDate[d] || []).push(f); });
    return Object.keys(byDate).sort().map((d) => {
      const buckets = {};
      byDate[d].forEach((f) => {
        const h = f.time ? parseInt(f.time.slice(0, 2), 10) : NaN;
        const key = Number.isNaN(h) ? "zz" : String(Math.floor(h / 3) * 3).padStart(2, "0");
        (buckets[key] = buckets[key] || []).push(f);
      });
      const dh = d === "TBD" ? "Date TBD" : `${fmtDate(d).wd} ${fmtDate(d).mon} ${fmtDate(d).day}`;
      return `<div class="card">
        <h3 style="margin-bottom:2px">${dh}</h3>
        ${Object.keys(buckets).sort().map((k) => {
          const rows = buckets[k];
          const label = k === "zz" ? "Time TBD" : `${k}:00–${String(+k + 3).padStart(2, "0")}:00`;
          const airports = [...new Set(rows.map((f) => f.airport).filter(Boolean))].join("/");
          return `<div style="margin-top:12px">
            <div class="when-chip" style="display:inline-block">${label}${airports ? " · " + esc(airports) : ""} · ${rows.length}</div>
            ${rows.map(flightRow).join("")}
          </div>`;
        }).join("")}
      </div>`;
    }).join("");
  }
  async function saveFlight(dir) {
    if (!state.me) { openWho(); return; }
    const p = dir === "arrive" ? "fa" : "fd";
    const row = { trip: TRIP_CODE, traveler: state.me, dir,
      airline: $("#" + p + "_airline").value.trim(), flight_no: $("#" + p + "_flight").value.trim(),
      airport: $("#" + p + "_airport").value.trim().toUpperCase(), date: $("#" + p + "_date").value,
      time: $("#" + p + "_time").value, note: $("#" + p + "_note").value.trim() };
    state.flights = state.flights.filter((f) => !(f.traveler === state.me && f.dir === dir));
    state.flights.push(row);
    renderFlights();
    await Backend.upsertFlight(row);
  }

  /* =========================================================================
     BUDGET - expenses, settle-up, converter
     ====================================================================== */
  const effectiveRate = () => Number(state.liveRate) || 1;
  async function loadRate() {
    try {
      if (TRIP.currency === TRIP.home_currency) { state.liveRate = 1; return; }
      const res = await fetch(`https://open.er-api.com/v6/latest/${encodeURIComponent(TRIP.home_currency)}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data && data.rates && data.rates[TRIP.currency]) {
        state.liveRate = data.rates[TRIP.currency];
        if ($("#screen-budget").classList.contains("active")) renderBudget();
      }
    } catch (e) {}
  }
  const toHome = (amount, cur) => cur === TRIP.currency && TRIP.currency !== TRIP.home_currency ? amount / effectiveRate() : Number(amount);
  const homeSym = () => { try { return (0).toLocaleString("en-US", { style: "currency", currency: TRIP.home_currency }).replace(/[\d.,\s]/g, ""); } catch { return TRIP.home_currency + " "; } };

  function renderBudget() {
    const s = $("#screen-budget");
    const nets = {}; (TRIP.travelers || []).forEach((t) => nets[t.id] = 0);
    state.expenses.forEach((e) => {
      const v = toHome(Number(e.amount), e.currency);
      const share = v / ((e.split_among || []).length || 1);
      if (nets[e.paid_by] != null) nets[e.paid_by] += v;
      (e.split_among || []).forEach((id) => { if (nets[id] != null) nets[id] -= share; });
    });
    const S = homeSym();
    s.innerHTML = `
      <div class="section-title">Budget & settle-up</div>
      <div class="section-sub">Log who paid for what - balances and the settle-up update live for everyone.</div>

      ${TRIP.currency !== TRIP.home_currency ? `<div class="card">
        <h3>💱 Converter</h3>
        <div class="r-sub" style="margin:2px 0 12px">Live: <b>${state.liveRate ? state.liveRate.toFixed(2) + " " + esc(TRIP.currency) + " = 1 " + esc(TRIP.home_currency) : "loading…"}</b></div>
        <div style="display:flex;align-items:flex-end;gap:10px">
          <div style="flex:1"><label class="r-sub" style="font-weight:800">${esc(TRIP.currency)}</label>
            <input id="convThere" type="number" inputmode="decimal" placeholder="0" style="width:100%;padding:12px;border:1px solid var(--line);border-radius:var(--r-sm);font-size:17px;font-family:var(--serif)" /></div>
          <span style="font-size:20px;color:var(--ink-3);padding-bottom:10px">⇄</span>
          <div style="flex:1"><label class="r-sub" style="font-weight:800">${esc(TRIP.home_currency)}</label>
            <input id="convHome" type="number" inputmode="decimal" placeholder="0" style="width:100%;padding:12px;border:1px solid var(--line);border-radius:var(--r-sm);font-size:17px;font-family:var(--serif)" /></div>
        </div>
      </div>` : ""}

      <div class="section-title" style="font-size:16px">Balances</div>
      <div class="balance-grid">
        ${(TRIP.travelers || []).map((t) => {
          const v = nets[t.id]; const cls = v > 0.5 ? "owed" : (v < -0.5 ? "owes" : "");
          const txt = Math.abs(v) < 0.5 ? "even" : (v > 0 ? "+" + S + v.toFixed(0) : "-" + S + Math.abs(v).toFixed(0));
          return `<div class="balance"><div class="bn">${avatarHTML(t, 20, 8)} ${esc(t.name.split(" ")[0])}</div><div class="bv ${cls}">${txt}</div></div>`;
        }).join("")}
      </div>
      ${settleText(nets, S)}

      <div class="section-title" style="font-size:16px">Add an expense</div>
      <div class="card expense-add">
        <input id="exLabel" placeholder="What was it?" />
        <div style="display:flex;gap:8px">
          <input id="exAmount" type="number" inputmode="decimal" placeholder="Amount" style="flex:2" />
          <select id="exCur" style="flex:1">
            <option value="${esc(TRIP.currency)}">${esc(TRIP.currency)}</option>
            ${TRIP.currency !== TRIP.home_currency ? `<option value="${esc(TRIP.home_currency)}">${esc(TRIP.home_currency)}</option>` : ""}
          </select>
        </div>
        <label class="r-sub" style="font-weight:700">Paid by</label>
        <select id="exPaid">${(TRIP.travelers || []).map((t) => `<option value="${t.id}" ${state.me === t.id ? "selected" : ""}>${esc(t.name)}</option>`).join("")}</select>
        <label class="r-sub" style="font-weight:700">Split among</label>
        <div id="exSplit">${(TRIP.travelers || []).map((t) => `<label class="split-chip"><input type="checkbox" value="${t.id}" checked>${avatarHTML(t, 24, 9)}${esc(t.name.split(" ")[0])}</label>`).join("")}</div>
        <button class="btn primary" id="exAdd">Add expense</button>
      </div>

      <div class="section-title" style="font-size:16px">Log</div>
      <div>${state.expenses.length ? state.expenses.slice().reverse().map((e) => `<div class="row">
        <div class="r-main"><div class="r-title">${esc(e.label)}</div>
          <div class="r-sub">${esc(e.currency)} ${Number(e.amount).toLocaleString()} · paid by ${esc((byId(e.paid_by) || { name: "?" }).name.split(" ")[0])} · split ${(e.split_among || []).length}</div></div>
        <button class="btn danger" data-del="${e.id}">Delete</button>
      </div>`).join("") : `<div class="empty">No expenses yet.</div>`}</div>`;
    $("#exAdd").addEventListener("click", addExpense);
    s.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", async () => {
      state.expenses = state.expenses.filter((e) => String(e.id) !== String(b.dataset.del));
      renderBudget();
      await Backend.remove("expenses", b.dataset.del);
    }));
    const ct = $("#convThere"), ch = $("#convHome");
    if (ct && ch) {
      ct.addEventListener("input", () => { const v = parseFloat(ct.value); ch.value = isFinite(v) && state.liveRate ? (v / state.liveRate).toFixed(2) : ""; });
      ch.addEventListener("input", () => { const v = parseFloat(ch.value); ct.value = isFinite(v) && state.liveRate ? Math.round(v * state.liveRate) : ""; });
    }
  }
  function settleText(nets, S) {
    const cred = Object.entries(nets).filter(([, v]) => v > 0.5).map(([id, v]) => ({ id, v }));
    const debt = Object.entries(nets).filter(([, v]) => v < -0.5).map(([id, v]) => ({ id, v: -v }));
    if (!cred.length || !debt.length) return "";
    cred.sort((a, b) => b.v - a.v); debt.sort((a, b) => b.v - a.v);
    const lines = []; let i = 0, j = 0;
    while (i < debt.length && j < cred.length) {
      const pay = Math.min(debt[i].v, cred[j].v);
      lines.push(`${esc((byId(debt[i].id) || { name: "?" }).name.split(" ")[0])} → ${esc((byId(cred[j].id) || { name: "?" }).name.split(" ")[0])}: <b>${S}${pay.toFixed(0)}</b>`);
      debt[i].v -= pay; cred[j].v -= pay;
      if (debt[i].v < 0.5) i++; if (cred[j].v < 0.5) j++;
    }
    return `<div class="card"><h3>Suggested settle-up</h3>${lines.map((l) => `<div class="r-sub" style="font-size:13.5px;padding:3px 0">${l}</div>`).join("")}</div>`;
  }
  async function addExpense() {
    const label = $("#exLabel").value.trim(), amount = parseFloat($("#exAmount").value);
    if (!label || !(amount > 0)) { alert("Add a description and amount."); return; }
    const split_among = $$("#exSplit input:checked").map((c) => c.value);
    if (!split_among.length) { alert("Pick who splits it."); return; }
    const row = await Backend.insert("expenses", { trip: TRIP_CODE, label, amount, currency: $("#exCur").value, paid_by: $("#exPaid").value, split_among });
    if (row) { state.expenses.push(row); renderBudget(); }
  }

  /* =========================================================================
     VAULT
     ====================================================================== */
  function renderVault() {
    const s = $("#screen-vault");
    s.innerHTML = `
      <div class="section-title">Vault</div>
      <div class="section-sub">Every confirmation in one shared place. No inbox digging at the airport.</div>
      <div class="card">
        <h3>Add a confirmation</h3>
        <div class="expense-add">
          <select id="confCat">
            <option>Flight</option><option>Hotel</option><option>Train</option>
            <option>Activity</option><option>Restaurant</option><option>Other</option>
          </select>
          <input id="confLabel" placeholder="Label (e.g. Hotel, 4 nights)" />
          <input id="confNo" placeholder="Confirmation # (optional)" />
          <label class="btn ghost" for="confFile" id="confFileLabel" style="text-align:center">📎 Attach file (optional)</label>
          <input id="confFile" type="file" accept="image/*,application/pdf" style="display:none" />
          <button class="btn primary" id="confAdd">Save to vault</button>
          <div id="confStatus" class="r-sub"></div>
        </div>
      </div>
      ${state.confirmations.length ? state.confirmations.map((c) => `<div class="card">
        <div style="display:flex;align-items:flex-start;gap:10px">
          <span style="font-size:20px">${({ Flight: "✈️", Hotel: "🏨", Train: "🚄", Activity: "🎟️", Restaurant: "🍽️" })[c.category] || "📄"}</span>
          <div style="flex:1;min-width:0">
            <div class="r-title">${esc(c.label)}</div>
            <div class="r-sub">${esc(c.category)}${c.confirmation_no ? " · #" + esc(c.confirmation_no) : ""}${c.author ? " · " + esc((byId(c.author) || { name: "" }).name.split(" ")[0]) : ""}</div>
            ${c.url ? `<a class="tl-map" href="${esc(c.url)}" target="_blank" rel="noopener" style="margin-top:6px">📎 Open file</a>` : ""}
          </div>
          ${c.author === state.me ? `<button class="btn danger" data-confdel="${c.id}">✕</button>` : ""}
        </div>
      </div>`).join("") : `<div class="empty">Nothing saved yet.</div>`}`;
    const fi = $("#confFile"), fl = $("#confFileLabel");
    fi.addEventListener("change", () => { fl.textContent = fi.files[0] ? "📎 " + fi.files[0].name : "📎 Attach file (optional)"; });
    $("#confAdd").addEventListener("click", async () => {
      const label = $("#confLabel").value.trim(); if (!label) { alert("Add a label."); return; }
      $("#confStatus").textContent = "Saving…";
      let fileMeta = { path: "", url: "" };
      if (fi.files[0]) { const up = await Backend.uploadFile(TRIP_CODE, fi.files[0]); if (up) fileMeta = up; }
      const row = await Backend.insert("confirmations", { trip: TRIP_CODE, category: $("#confCat").value, label, confirmation_no: $("#confNo").value.trim(), ...fileMeta, author: state.me || "" });
      if (row) { state.confirmations.unshift(row); renderVault(); } else $("#confStatus").textContent = "Failed. Try again.";
    });
    s.querySelectorAll("[data-confdel]").forEach((b) => b.addEventListener("click", async () => {
      const c = state.confirmations.find((x) => String(x.id) === String(b.dataset.confdel));
      state.confirmations = state.confirmations.filter((x) => x !== c); renderVault();
      if (c) { await Backend.removeFile(c.path); await Backend.remove("confirmations", c.id); }
    }));
  }

  /* =========================================================================
     PHOTOS
     ====================================================================== */
  function renderPhotos() {
    const s = $("#screen-photos");
    s.innerHTML = `
      <div class="section-title">Photos</div>
      <div class="section-sub">The group's shared album. Everyone sees new shots live.</div>
      <div class="card">
        <label class="btn primary" for="photoInput" style="display:block;text-align:center">📷 Add a photo</label>
        <input id="photoInput" type="file" accept="image/*" style="display:none" />
        <input id="photoCaption" placeholder="Caption (optional)" style="width:100%;margin-top:10px;padding:11px 12px;border:1px solid var(--line);border-radius:var(--r-sm);font-size:14px" />
        <div id="photoStatus" class="r-sub" style="margin-top:8px"></div>
      </div>
      <div class="photo-grid">
        ${state.photos.length ? state.photos.map((p) => `<div class="photo-cell">
          <img src="${esc(p.url)}" alt="${esc(p.caption || "photo")}" loading="lazy" />
          ${p.caption ? `<div class="photo-cap">${esc(p.caption)}</div>` : ""}
          ${p.author === state.me ? `<button class="photo-del" data-photodel="${p.id}">✕</button>` : ""}
        </div>`).join("") : `<div class="empty" style="grid-column:1/-1">No photos yet.</div>`}
      </div>`;
    $("#photoInput").addEventListener("change", async () => {
      const file = $("#photoInput").files[0]; if (!file) return;
      if (!state.me) { openWho(); return; }
      $("#photoStatus").textContent = "Uploading…";
      const up = await Backend.uploadFile(TRIP_CODE, file);
      if (!up) { $("#photoStatus").textContent = "Upload failed."; return; }
      const row = await Backend.insert("photos", { trip: TRIP_CODE, ...up, caption: $("#photoCaption").value.trim(), author: state.me });
      if (row) { state.photos.unshift(row); renderPhotos(); }
    });
    s.querySelectorAll("[data-photodel]").forEach((b) => b.addEventListener("click", async () => {
      const p = state.photos.find((x) => String(x.id) === String(b.dataset.photodel));
      state.photos = state.photos.filter((x) => x !== p); renderPhotos();
      if (p) { await Backend.removeFile(p.path); await Backend.remove("photos", p.id); }
    }));
  }

  /* =========================================================================
     NOTES + shopping
     ====================================================================== */
  function renderNotes() {
    const s = $("#screen-notes");
    const lists = [
      { key: "note", title: "Notes & to-dos", ph: "Anything the group should remember", icon: "📝" },
      { key: "shopping", title: "Shopping & souvenirs", ph: "e.g. gifts to bring back", icon: "🎁" },
    ];
    s.innerHTML = `
      <div class="section-title">Notes</div>
      <div class="section-sub">Shared running lists for the whole group.</div>
      ${lists.map((L) => {
        const items = state.notes.filter((n) => (n.list || "note") === L.key);
        return `<div class="card">
          <h3>${L.icon} ${L.title}</h3>
          <div style="margin:8px 0 12px">
            ${items.length ? items.map((n) => `<div class="check ${n.done ? "done" : ""}" style="box-shadow:none;margin-bottom:6px">
              <input type="checkbox" ${n.done ? "checked" : ""} data-notedone="${n.id}" />
              <label style="flex:1">${esc(n.text)}${n.author ? ` <span class="r-sub" style="font-size:11px">· ${esc((byId(n.author) || { name: "" }).name.split(" ")[0])}</span>` : ""}</label>
              <button class="btn danger" data-notedel="${n.id}" style="padding:5px 9px">✕</button>
            </div>`).join("") : `<div class="empty" style="padding:12px">Nothing yet.</div>`}
          </div>
          <div style="display:flex;gap:8px">
            <input id="note_${L.key}" placeholder="${L.ph}" style="flex:1;padding:11px 12px;border:1px solid var(--line);border-radius:var(--r-sm);font-size:14px" />
            <button class="btn primary" data-noteadd="${L.key}">Add</button>
          </div>
        </div>`;
      }).join("")}`;
    s.querySelectorAll("[data-noteadd]").forEach((b) => b.addEventListener("click", async () => {
      const inp = $("#note_" + b.dataset.noteadd), text = inp.value.trim(); if (!text) return;
      const row = await Backend.insert("notes", { trip: TRIP_CODE, list: b.dataset.noteadd, text, done: false, author: state.me || "" });
      if (row) { state.notes.push(row); renderNotes(); }
    }));
    s.querySelectorAll("[data-notedone]").forEach((c) => c.addEventListener("change", async () => {
      const n = state.notes.find((x) => String(x.id) === String(c.dataset.notedone)); if (n) n.done = c.checked;
      renderNotes();
      await Backend.update("notes", c.dataset.notedone, { done: c.checked });
    }));
    s.querySelectorAll("[data-notedel]").forEach((b) => b.addEventListener("click", async () => {
      state.notes = state.notes.filter((x) => String(x.id) !== String(b.dataset.notedel)); renderNotes();
      await Backend.remove("notes", b.dataset.notedel);
    }));
  }

  /* =========================================================================
     IDEAS
     ====================================================================== */
  function renderIdeas() {
    const s = $("#screen-ideas");
    s.innerHTML = `
      <div class="section-title">Ideas board</div>
      <div class="section-sub">Things nobody's committed to yet. 👍 what you'd want to do; post your own.</div>
      ${state.ideas.length ? state.ideas.map((i) => {
        const voters = tally("idea", i.id)["up"] || [];
        const on = myVote("idea", i.id) === "up";
        const author = i.author ? (byId(i.author) || { name: "" }).name.split(" ")[0] : "";
        return `<div class="idea">
          <div class="i-main">
            <div class="i-title">${esc(i.title)}${i.tag ? ` <span class="pill any">${esc(i.tag)}</span>` : ""}</div>
            <div class="i-note">${esc(i.note || "")}${author ? ` · <i>by ${esc(author)}</i>` : ""}</div>
            ${voters.length ? `<div class="tally" style="margin-top:8px">${voterChips(voters)}</div>` : ""}
            ${i.author === state.me ? `<button class="btn danger" data-iddel="${i.id}" style="margin-top:8px">Remove</button>` : ""}
          </div>
          <div class="vote"><button class="${on ? "voted" : ""}" data-idea="${i.id}">👍</button><span class="vcount">${voters.length || ""}</span></div>
        </div>`;
      }).join("") : `<div class="empty">No ideas yet. Start the board.</div>`}
      <div class="card">
        <h3>Add an idea</h3>
        <div class="expense-add">
          <input id="ideaTitle" placeholder="Your idea" />
          <input id="ideaTag" placeholder="Where / when (optional)" />
          <input id="ideaNote" placeholder="One line about it (optional)" />
          <button class="btn primary" id="ideaAdd">Post idea</button>
        </div>
      </div>`;
    s.querySelectorAll("[data-idea]").forEach((b) => b.addEventListener("click", () => setVote("idea", b.dataset.idea, "up")));
    s.querySelectorAll("[data-iddel]").forEach((b) => b.addEventListener("click", async () => {
      state.ideas = state.ideas.filter((x) => String(x.id) !== String(b.dataset.iddel)); renderIdeas();
      await Backend.remove("ideas", b.dataset.iddel);
    }));
    $("#ideaAdd").addEventListener("click", async () => {
      const title = $("#ideaTitle").value.trim(); if (!title) return alert("Give it a title.");
      const row = await Backend.insert("ideas", { trip: TRIP_CODE, title, tag: $("#ideaTag").value.trim(), note: $("#ideaNote").value.trim(), author: state.me || "" });
      if (row) { state.ideas.unshift(row); renderIdeas(); }
    });
  }

  /* =========================================================================
     GUIDE - AI destination intel (guide cards + neighborhoods)
     ====================================================================== */
  function renderGuide() {
    const s = $("#screen-guide");
    const guides = state.guides.filter((g) => g.kind === "guide");
    const hoodsByStop = (TRIP.stops || []).map((st) => ({ st, hoods: state.guides.filter((g) => g.kind === "hood" && g.stop === st.id) })).filter((x) => x.hoods.length);
    if (!guides.length && !hoodsByStop.length) {
      s.innerHTML = `<div class="section-title">Guide</div>
        <div class="section-sub">Destination intel lives here once it's generated.</div>
        <div class="card"><h3>📖 Nothing yet</h3><p class="r-sub" style="margin:6px 0 0">Run <b>✨ Set up my trip</b> on the Plan tab and Claude will write a destination guide + neighborhood breakdowns for every stop.</p></div>`;
      return;
    }
    s.innerHTML = `
      <div class="section-title">${esc(TRIP.destination || "Destination")} guide</div>
      <div class="section-sub">The stuff a well-traveled friend would tell you, written for this trip's dates.</div>
      ${guides.map((g) => `<div class="guide-card">
        <div class="g-head"><span>${esc(g.emoji || "📌")}</span> ${esc(g.title)}</div>
        <div class="g-body">${esc(g.body)}</div>
      </div>`).join("")}
      ${hoodsByStop.map(({ st, hoods }) => `
        <div class="section-title" style="font-size:18px;margin-top:22px">Neighborhoods · ${esc(st.label)}</div>
        <div class="hood-scroll">
          ${hoods.map((n) => `<div class="hood-card">
            <div class="hood-name">${esc(n.emoji || "📍")} ${esc(n.title)}</div>
            <div class="hood-tags">${(n.tags || []).map((t) => `<span>${esc(t)}</span>`).join("")}</div>
            <div class="hood-blurb">${esc(n.body)}</div>
            ${n.base ? `<div class="hood-base">🛏️ ${esc(n.base)}</div>` : ""}
          </div>`).join("")}
        </div>`).join("")}`;
  }

  /* =========================================================================
     PACKING (per-device checks; generic list)
     ====================================================================== */
  const PACKING = [
    { cat: "Documents", items: ["Passport / ID", "Flight confirmations", "Stay confirmations", "Travel insurance", "Copies of documents"] },
    { cat: "Money & phone", items: ["Local cash", "2+ cards", "eSIM / roaming plan", "Charger + power bank", "Plug adapter"] },
    { cat: "Clothes", items: ["Weather-right layers", "Comfortable walking shoes", "One nicer outfit", "Sleepwear", "Enough socks"] },
    { cat: "Daypack", items: ["Small daypack", "Water bottle", "Portable charger", "Meds / first-aid basics", "Sunscreen"] },
  ];
  function renderPacking() {
    const s = $("#screen-packing");
    const all = PACKING.flatMap((c) => c.items);
    const done = all.filter((i) => state.packing[i]).length;
    const pct = all.length ? Math.round((done / all.length) * 100) : 0;
    s.innerHTML = `
      <div class="section-title">Packing</div>
      <div class="section-sub">Your personal checklist (saved on this phone). ${done}/${all.length} packed.</div>
      <div class="progress"><i style="width:${pct}%"></i></div>
      ${PACKING.map((cat) => `
        <div class="check-cat">${esc(cat.cat)}</div>
        ${cat.items.map((it, i) => {
          const on = !!state.packing[it];
          const id = "pk" + cat.cat.replace(/\W/g, "") + i;
          return `<div class="check ${on ? "done" : ""}"><input type="checkbox" ${on ? "checked" : ""} data-pack="${esc(it)}" id="${id}"><label for="${id}">${esc(it)}</label></div>`;
        }).join("")}`).join("")}`;
    s.querySelectorAll("[data-pack]").forEach((c) => c.addEventListener("change", () => {
      state.packing[c.dataset.pack] = c.checked; LS.set("packing", state.packing); renderPacking();
    }));
  }

  /* =========================================================================
     TRANSLATE
     ====================================================================== */
  const LANGS = [["ja", "Japanese"], ["es", "Spanish"], ["fr", "French"], ["it", "Italian"], ["de", "German"], ["pt", "Portuguese"], ["ko", "Korean"], ["zh", "Chinese"], ["th", "Thai"], ["vi", "Vietnamese"], ["el", "Greek"], ["tr", "Turkish"]];
  let trLang = null, trDir = "to";
  function renderTranslate() {
    const s = $("#screen-translate");
    if (trLang == null) trLang = LS.get("trLang", "ja");
    const toLocal = trDir === "to";
    s.innerHTML = `
      <div class="section-title">Translate</div>
      <div class="section-sub">Type, translate, tap 🔊 to have your phone say it aloud. Needs a connection.</div>
      <div class="card">
        <label class="r-sub" style="font-weight:800">Language</label>
        <select id="trLang" style="width:100%;padding:12px;border:1px solid var(--line);border-radius:var(--r-sm);font-size:14px;margin:6px 0 12px">
          ${LANGS.map(([c, n]) => `<option value="${c}" ${c === trLang ? "selected" : ""}>${n}</option>`).join("")}
        </select>
        <div class="btn-row" style="margin-bottom:12px">
          <button class="btn ${toLocal ? "primary" : "ghost"}" id="trTo" style="flex:1">English → there</button>
          <button class="btn ${!toLocal ? "primary" : "ghost"}" id="trFrom" style="flex:1">There → English</button>
        </div>
        <textarea id="trInput" rows="3" placeholder="${toLocal ? "Type in English…" : "Type what you saw/heard…"}" style="width:100%;padding:12px;border:1px solid var(--line);border-radius:var(--r-sm);font-size:16px;font-family:inherit;resize:vertical;background:#fffdfa;color:var(--ink)"></textarea>
        <button class="btn primary" id="trGo" style="width:100%;margin-top:10px">Translate</button>
        <div id="trResult"></div>
      </div>`;
    $("#trLang").addEventListener("change", () => { trLang = $("#trLang").value; LS.set("trLang", trLang); });
    $("#trTo").addEventListener("click", () => { trDir = "to"; renderTranslate(); });
    $("#trFrom").addEventListener("click", () => { trDir = "from"; renderTranslate(); });
    $("#trGo").addEventListener("click", doTranslate);
  }
  function speak(text, lang) {
    try { const u = new SpeechSynthesisUtterance(text); u.lang = lang; u.rate = 0.9; window.speechSynthesis.cancel(); window.speechSynthesis.speak(u); } catch (e) {}
  }
  async function doTranslate() {
    const text = $("#trInput").value.trim(); if (!text) return;
    const from = trDir === "to" ? "en" : trLang, to = trDir === "to" ? trLang : "en";
    const R = $("#trResult");
    R.innerHTML = `<div class="r-sub" style="margin-top:12px">Translating…</div>`;
    try {
      const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${from}|${to}`);
      const data = await res.json();
      const out = (data && data.responseData && data.responseData.translatedText) || "(no translation)";
      R.innerHTML = `<div class="card" style="margin:12px 0 0;border-color:var(--ai)">
        <div style="font-size:19px;font-weight:600;line-height:1.5">${esc(out)}</div>
        <div class="btn-row" style="margin-top:12px">
          <button class="btn primary" id="trSpeak" style="flex:1">🔊 Speak</button>
          <button class="btn ghost" id="trCopy" style="flex:1">Copy</button>
        </div></div>`;
      $("#trSpeak").addEventListener("click", () => speak(out, to === "en" ? "en-US" : to));
      $("#trCopy").addEventListener("click", () => { navigator.clipboard?.writeText(out); $("#trCopy").textContent = "Copied ✓"; setTimeout(() => { const c = $("#trCopy"); if (c) c.textContent = "Copy"; }, 1400); });
    } catch (e) {
      R.innerHTML = `<div class="r-sub" style="margin-top:12px;color:var(--vermilion)">Couldn't translate. Check your connection.</div>`;
    }
  }

  /* =========================================================================
     ASSISTANT - trip-aware AI chat with apply-able itinerary edits
     ====================================================================== */
  let chatLog = null;      // [{role, content}]
  let pendingDays = null;  // days block awaiting Apply
  function renderAssistant() {
    const s = $("#screen-assistant");
    if (chatLog == null) chatLog = LS.get("chat", []);
    s.innerHTML = `
      <div class="section-title">Assistant</div>
      <div class="section-sub">Knows this trip: the plan, the votes, the dates. Ask anything, or tell it to change the itinerary.</div>
      <div id="chatFeed">
        ${chatLog.length ? chatLog.map((m) => `<div class="chat-msg ${m.role}">${esc(m.content)}</div>`).join("")
          : `<div class="card"><h3>✨ Try asking…</h3><div class="r-sub" style="line-height:2">
              “What's our most packed day, and how would you lighten it?”<br>
              “Add a rainy-day backup to the plan for ${esc(fmtDate(TRIP.start_date).mon)} ${fmtDate(TRIP.start_date).day + 2}”<br>
              “Where should we eat near our first stop the night we land?”<br>
              “Rework day 3 to be more chill”</div></div>`}
      </div>
      ${pendingDays ? `<div class="card" style="border-color:var(--matcha)">
        <h3>🪄 Proposed itinerary change</h3>
        <div class="r-sub" style="margin:6px 0 10px">${pendingDays.map((d) => `<b>${esc(d.date)}</b> · ${esc(d.title)}`).join("<br>")}</div>
        <div class="btn-row">
          <button class="btn primary" id="chatApply" style="flex:2">Apply to the plan</button>
          <button class="btn ghost" id="chatDismiss" style="flex:1">Dismiss</button>
        </div>
      </div>` : ""}
      <div class="card" style="position:sticky;bottom:calc(var(--nav-h) + 10px)">
        <div style="display:flex;gap:8px">
          <input id="chatInput" placeholder="Ask about the trip…" style="flex:1;padding:12px;border:1px solid var(--line);border-radius:var(--r-sm);font-size:15px;background:#fffdfa;color:var(--ink)" />
          <button class="btn primary" id="chatSend">Send</button>
        </div>
        <div id="chatStatus" class="r-sub" style="margin-top:6px"></div>
      </div>`;
    const send = () => sendChat();
    $("#chatSend").addEventListener("click", send);
    $("#chatInput").addEventListener("keydown", (e) => { if (e.key === "Enter") send(); });
    const ap = $("#chatApply"); if (ap) ap.addEventListener("click", applyChatDays);
    const dm = $("#chatDismiss"); if (dm) dm.addEventListener("click", () => { pendingDays = null; renderAssistant(); });
    const feed = $("#chatFeed"); if (feed && chatLog.length) window.scrollTo(0, document.body.scrollHeight);
  }
  async function sendChat() {
    const inp = $("#chatInput"), st = $("#chatStatus");
    const text = inp.value.trim(); if (!text) return;
    chatLog.push({ role: "user", content: text });
    LS.set("chat", chatLog.slice(-30));
    inp.value = "";
    renderAssistant();
    $("#chatStatus").textContent = "✨ Thinking…";
    try {
      const cfg = window.CARAVAN_CONFIG;
      const res = await fetch(`${cfg.url}/functions/v1/generate-plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + cfg.anonKey, "apikey": cfg.anonKey },
        body: JSON.stringify({ code: TRIP_CODE, mode: "chat", messages: chatLog.slice(-12) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!data.ok) { chatLog.push({ role: "assistant", content: "⚠️ " + (data.error || "Something went wrong. Try again.") }); }
      else {
        chatLog.push({ role: "assistant", content: data.reply || "…" });
        pendingDays = Array.isArray(data.days) && data.days.length ? data.days : null;
      }
      LS.set("chat", chatLog.slice(-30));
      renderAssistant();
    } catch (e) {
      chatLog.push({ role: "assistant", content: "⚠️ Couldn't reach the assistant. Check the edge function." });
      renderAssistant();
    }
  }
  async function applyChatDays() {
    const st = $("#chatStatus");
    const days = pendingDays; pendingDays = null;
    renderAssistant();
    for (const d of days) {
      const existing = state.days.find((x) => x.date === d.date);
      if (existing) {
        Object.assign(existing, { stop: d.stop, title: d.title, summary: d.summary, meetup: d.meetup, items: d.items });
        await Backend.update("days", existing.id, { stop: d.stop, title: d.title, summary: d.summary, meetup: d.meetup, items: d.items });
      } else {
        const row = await Backend.insert("days", { trip: TRIP_CODE, date: d.date, stop: d.stop, title: d.title, summary: d.summary, meetup: d.meetup, items: d.items });
        if (row) { state.days.push(row); state.days.sort((a, b) => a.date.localeCompare(b.date)); }
      }
    }
    chatLog.push({ role: "assistant", content: `✓ Applied: ${days.length} day${days.length === 1 ? "" : "s"} updated in the plan.` });
    LS.set("chat", chatLog.slice(-30));
    renderAssistant();
  }

  /* =========================================================================
     SETTINGS - edit the trip after creation
     ====================================================================== */
  function renderSettings() {
    const s = $("#screen-settings");
    const inp = (id, val, ph, type = "text") =>
      `<input id="${id}" type="${type}" value="${esc(val ?? "")}" placeholder="${esc(ph)}" style="width:100%;padding:12px;border:1px solid var(--line);border-radius:var(--r-sm);font-size:14px;background:#fffdfa;color:var(--ink)" />`;
    if (!isHost()) {
      s.innerHTML = `
        <div class="section-title">Settings</div>
        <div class="card">
          <h3>📱 App on your phone</h3>
          <p class="section-sub" style="margin:2px 0 10px">Put this wedding on your home screen: opens in one tap, works without signal, and gets alerts when plans change.</p>
          <button class="btn ghost" id="stInstall" style="width:100%">Show me how</button>
        </div>
        <div class="card"><h3>💍 Hosts only</h3>
        <p class="section-sub" style="margin:4px 0 0">Only the hosts can change this wedding's setup. If you should be a host, ask them to add you in Settings → Hosts.</p></div>`;
      $("#stInstall").addEventListener("click", () => maybeOfferInstall(true));
      return;
    }
    s.innerHTML = `
      <div class="section-title">Trip settings</div>
      <div class="section-sub">Changes apply for everyone on the trip.</div>

      ${isWedding() ? `<div class="card">
        <h3>💍 Wedding links</h3>
        <p class="section-sub" style="margin:2px 0 10px">Shown to every guest on Home and in Stays.</p>
        <label class="wiz-label">Room block link (hotel booking)</label>${inp("wlRoom", (TRIP.links || {}).roomblock, "https://…")}
        <label class="wiz-label">Room block deadline</label>${inp("wlDeadline", (TRIP.links || {}).deadline, "e.g. March 1")}
        <label class="wiz-label">Registry link</label>${inp("wlReg", (TRIP.links || {}).registry, "https://…")}
        <label class="wiz-label">Wedding website</label>${inp("wlSite", (TRIP.links || {}).site, "https://…")}
        <label class="wiz-label">RSVP deadline (shown on the RSVP card)</label>${inp("wlRsvpBy", (TRIP.links || {}).rsvp_deadline, "e.g. March 1")}
        <label class="wiz-label">What it roughly costs guests (shown on Home)</label>${inp("wlCost", (TRIP.links || {}).cost, "e.g. Flights ~$450 · rooms $180/night · plan on ~$1,200")}
        <label class="wiz-label">FAQ: one per line, format Question? = Answer</label>
        <textarea id="wlFaq" rows="5" placeholder="Are kids welcome? = We love your kids, but this one's adults-only.&#10;Is there a shuttle? = Yes, from the room-block hotel, times posted here." style="width:100%;padding:12px;border:1px solid var(--line);border-radius:var(--r-sm);font-size:13.5px;font-family:inherit;background:#fffdfa;color:var(--ink)">${esc(((TRIP.links || {}).faq || []).map((f) => `${f.q} = ${f.a}`).join("\n"))}</textarea>
        <button class="btn primary" id="wlSave" style="width:100%;margin-top:14px">Save wedding info</button>
        <div id="wlMsg" class="r-sub" style="margin-top:6px"></div>
      </div>

      <div class="card">
        <h3>Hosts</h3>
        <p class="section-sub" style="margin:2px 0 10px">Hosts can edit the schedule, links, and settings. Everyone else RSVPs and follows along.</p>
        <div id="hostChips" style="display:flex;flex-wrap:wrap;gap:8px">
          ${(TRIP.travelers || []).map((t) => `<label class="split-chip"><input type="checkbox" data-host="${t.id}" ${(TRIP.hosts || []).includes(t.id) ? "checked" : ""} /><span class="avatar" style="background:${t.color}">${initials(t.name)}</span>${esc(t.name.split(" ")[0])}</label>`).join("")}
        </div>
        <button class="btn primary" id="hostSave" style="width:100%;margin-top:12px">Save hosts</button>
        <div id="hostMsg" class="r-sub" style="margin-top:6px"></div>
      </div>` : ""}

      <div class="card">
        <h3>Basics</h3>
        <label class="wiz-label">Trip name</label>${inp("stName", TRIP.name, "Trip name")}
        <label class="wiz-label">Destination</label>${inp("stDest", TRIP.destination, "Destination")}
        <div style="display:flex;gap:10px">
          <div style="flex:1"><label class="wiz-label">First day</label>${inp("stStart", TRIP.start_date, "", "date")}</div>
          <div style="flex:1"><label class="wiz-label">Last day</label>${inp("stEnd", TRIP.end_date, "", "date")}</div>
        </div>
        <div style="display:flex;gap:10px">
          <div style="flex:1"><label class="wiz-label">Their money</label>${inp("stCur", TRIP.currency, "JPY")}</div>
          <div style="flex:1"><label class="wiz-label">Your money</label>${inp("stHomeCur", TRIP.home_currency, "USD")}</div>
        </div>
        <label class="wiz-label">Destination timezone</label>
        <input id="stTz" list="tzlist2" value="${esc(TRIP.tz)}" style="width:100%;padding:12px;border:1px solid var(--line);border-radius:var(--r-sm);font-size:14px;background:#fffdfa;color:var(--ink)" />
        <datalist id="tzlist2">${(Intl.supportedValuesOf ? Intl.supportedValuesOf("timeZone") : ["UTC"]).map((z) => `<option value="${z}">`).join("")}</datalist>
        <button class="btn primary" id="stSaveBasics" style="width:100%;margin-top:14px">Save basics</button>
        <div id="stBasicsMsg" class="r-sub" style="margin-top:6px"></div>
      </div>

      <div class="card">
        <h3>Travelers</h3>
        <p class="section-sub" style="margin:2px 0 10px">Rename anyone, add newcomers, or remove someone.</p>
        <div id="stTravs">
          ${(TRIP.travelers || []).map((t, i) => `<div class="trav-row">
            ${avatarHTML(t, 34, 12)}
            <input data-sttrav="${i}" value="${esc(t.name)}" style="padding:11px;border:1px solid var(--line);border-radius:var(--r-sm);font-size:14px" />
            <button class="rm" data-strmtrav="${i}" title="Remove">✕</button>
          </div>`).join("")}
        </div>
        <div class="btn-row" style="margin-top:8px">
          <button class="btn ghost" id="stAddTrav" style="flex:1">＋ Add traveler</button>
          <button class="btn primary" id="stSaveTravs" style="flex:1">Save travelers</button>
        </div>
        <div id="stTravMsg" class="r-sub" style="margin-top:6px"></div>
      </div>

      <div class="card">
        <h3>Stops</h3>
        <p class="section-sub" style="margin:2px 0 10px">The bases you'll sleep in, in order. Removing a stop hides its stay submissions.</p>
        <div id="stStops">
          ${(TRIP.stops || []).map((st, i) => `<div class="trav-row">
            <input data-ststop="${i}" value="${esc(st.label)}" style="padding:11px;border:1px solid var(--line);border-radius:var(--r-sm);font-size:14px" />
            <button class="rm" data-strmstop="${i}" title="Remove">✕</button>
          </div>`).join("")}
        </div>
        <div class="btn-row" style="margin-top:8px">
          <button class="btn ghost" id="stAddStop" style="flex:1">＋ Add stop</button>
          <button class="btn primary" id="stSaveStops" style="flex:1">Save stops</button>
        </div>
        <div id="stStopMsg" class="r-sub" style="margin-top:6px"></div>
      </div>

      <div class="card">
        <h3>AI plan</h3>
        <p class="section-sub" style="margin:2px 0 10px">Clear the itinerary or guide to unlock a fresh ✨ AI draft (${Math.max(0, 6 - (TRIP.gen_count || 0))} generation${6 - (TRIP.gen_count || 0) === 1 ? "" : "s"} left).</p>
        <div class="btn-row">
          <button class="btn ghost" id="stClearPlan" style="flex:1">Clear itinerary</button>
          <button class="btn ghost" id="stClearGuide" style="flex:1">Clear guide</button>
        </div>
        <div id="stAiMsg" class="r-sub" style="margin-top:6px"></div>
      </div>

      <div class="card">
        <h3>📱 App on your phone</h3>
        <p class="section-sub" style="margin:2px 0 10px">Put SquadTrip on your home screen: opens in one tap, works without signal, and gets alerts when plans change.</p>
        <button class="btn ghost" id="stInstall" style="width:100%">Show me how</button>
      </div>

      <div class="card" style="border-color:var(--sakura-deep)">
        <h3 style="color:var(--vermilion)">Danger zone</h3>
        <p class="section-sub" style="margin:2px 0 10px">Deletes the trip and everything in it, for everyone. No undo.</p>
        <button class="btn danger" id="stDelete" style="width:100%;padding:12px">Delete this trip forever</button>
      </div>`;

    const sti = $("#stInstall"); if (sti) sti.addEventListener("click", () => maybeOfferInstall(true));
    const wls = $("#wlSave"); if (wls) wls.addEventListener("click", async () => {
      const links = {
        roomblock: $("#wlRoom").value.trim(), deadline: $("#wlDeadline").value.trim(),
        registry: $("#wlReg").value.trim(), site: $("#wlSite").value.trim(),
        rsvp_deadline: $("#wlRsvpBy").value.trim(), cost: $("#wlCost").value.trim(),
      };
      Object.keys(links).forEach((k) => { if (!links[k]) delete links[k]; });
      const faq = $("#wlFaq").value.split("\n").map((l) => {
        const i = l.indexOf("=");
        return i > 0 ? { q: l.slice(0, i).trim(), a: l.slice(i + 1).trim() } : null;
      }).filter((f) => f && f.q && f.a).slice(0, 20);
      if (faq.length) links.faq = faq;
      const ok = await Backend.updateTrip(TRIP_CODE, { links });
      $("#wlMsg").textContent = ok ? "Saved ✓" : "Couldn't save. Try again.";
      if (ok) TRIP.links = links;
    });
    const hs = $("#hostSave"); if (hs) hs.addEventListener("click", async () => {
      const hosts = $$("#hostChips [data-host]").filter((c) => c.checked).map((c) => c.dataset.host);
      if (!hosts.length) { $("#hostMsg").textContent = "Keep at least one host."; return; }
      const ok = await Backend.updateTrip(TRIP_CODE, { hosts });
      $("#hostMsg").textContent = ok ? "Saved ✓" : "Couldn't save. Try again.";
      if (ok) TRIP.hosts = hosts;
    });
    $("#stSaveBasics").addEventListener("click", async () => {
      const patch = {
        name: $("#stName").value.trim() || TRIP.name,
        destination: $("#stDest").value.trim(),
        start_date: $("#stStart").value || TRIP.start_date,
        end_date: $("#stEnd").value || TRIP.end_date,
        currency: ($("#stCur").value.trim() || "USD").toUpperCase(),
        home_currency: ($("#stHomeCur").value.trim() || "USD").toUpperCase(),
        tz: $("#stTz").value.trim() || TRIP.tz,
      };
      if (patch.end_date < patch.start_date) { $("#stBasicsMsg").textContent = "Last day can't be before the first day."; return; }
      Object.assign(TRIP, patch);
      $("#stBasicsMsg").textContent = "Saved ✓";
      $("#brandName").textContent = TRIP.name;
      $("#brandSub").textContent = fmtRange(TRIP.start_date, TRIP.end_date);
      await Backend.updateTrip(TRIP.code, patch);
      loadRate();
    });

    $("#stAddTrav").addEventListener("click", () => {
      TRIP.travelers = [...(TRIP.travelers || []), { id: "t" + Date.now().toString(36), name: "New traveler", color: PALETTE[(TRIP.travelers || []).length % PALETTE.length] }];
      renderSettings();
    });
    $$("#stTravs [data-strmtrav]").forEach((b) => b.addEventListener("click", () => {
      const i = +b.dataset.strmtrav;
      const t = TRIP.travelers[i];
      if (!confirm(`Remove ${t.name} from the trip?`)) return;
      TRIP.travelers = TRIP.travelers.filter((_, x) => x !== i);
      if (state.me === t.id) { state.me = null; LS.set("me", null); renderWhoami(); }
      renderSettings();
      Backend.updateTrip(TRIP.code, { travelers: TRIP.travelers });
    }));
    $("#stSaveTravs").addEventListener("click", async () => {
      $$("#stTravs [data-sttrav]").forEach((inp2) => {
        const i = +inp2.dataset.sttrav;
        if (TRIP.travelers[i]) TRIP.travelers[i].name = inp2.value.trim() || TRIP.travelers[i].name;
      });
      $("#stTravMsg").textContent = "Saved ✓";
      await Backend.updateTrip(TRIP.code, { travelers: TRIP.travelers });
      renderWhoami();
    });

    $("#stAddStop").addEventListener("click", () => {
      TRIP.stops = [...(TRIP.stops || []), { id: "s" + Date.now().toString(36), label: "New stop" }];
      renderSettings();
    });
    $$("#stStops [data-strmstop]").forEach((b) => b.addEventListener("click", () => {
      const i = +b.dataset.strmstop;
      if (!confirm(`Remove ${TRIP.stops[i].label}?`)) return;
      TRIP.stops = TRIP.stops.filter((_, x) => x !== i);
      renderSettings();
      Backend.updateTrip(TRIP.code, { stops: TRIP.stops });
    }));
    $("#stSaveStops").addEventListener("click", async () => {
      $$("#stStops [data-ststop]").forEach((inp2) => {
        const i = +inp2.dataset.ststop;
        if (TRIP.stops[i]) TRIP.stops[i].label = inp2.value.trim() || TRIP.stops[i].label;
      });
      $("#stStopMsg").textContent = "Saved ✓";
      await Backend.updateTrip(TRIP.code, { stops: TRIP.stops });
    });

    $("#stClearPlan").addEventListener("click", async () => {
      if (!confirm("Clear the whole itinerary for everyone?")) return;
      $("#stAiMsg").textContent = "Clearing…";
      await Backend.clearTable("days", TRIP.code);
      state.days = [];
      $("#stAiMsg").textContent = "Itinerary cleared. The ✨ AI card is back on the Plan tab.";
    });
    $("#stClearGuide").addEventListener("click", async () => {
      if (!confirm("Clear the destination guide + neighborhoods?")) return;
      $("#stAiMsg").textContent = "Clearing…";
      await Backend.clearTable("guides", TRIP.code);
      state.guides = [];
      $("#stAiMsg").textContent = "Guide cleared.";
    });

    $("#stDelete").addEventListener("click", async () => {
      const typed = prompt(`This deletes "${TRIP.name}" for EVERYONE, permanently.\nType the trip code (${TRIP.code}) to confirm:`);
      if ((typed || "").trim().toUpperCase() !== TRIP.code) { alert("Code didn't match. Nothing deleted."); return; }
      await Backend.deleteTrip(TRIP.code);
      LSG.set("mytrips", LSG.get("mytrips", []).filter((t) => t.code !== TRIP.code));
      location.href = location.pathname; // back to the landing page
    });
  }

  /* =========================================================================
     BOOT / RENDER
     ====================================================================== */
  const RENDERERS = {
    home: renderHome, itinerary: renderItinerary, crew: renderCrew, decisions: renderDecisions,
    stays: renderStays, flights: renderFlights, budget: renderBudget, vault: renderVault,
    photos: renderPhotos, notes: renderNotes, ideas: renderIdeas, packing: renderPacking, translate: renderTranslate, guide: renderGuide,
    settings: renderSettings, assistant: renderAssistant,
  };
  function renderCurrent() {
    if (!TRIP) return;
    const active = $("#tripApp .screen.active");
    const id = active ? active.id.replace("screen-", "") : "home";
    if (RENDERERS[id]) RENDERERS[id]();
  }
  function renderAll() { renderCurrent(); }

  /* ---- Service worker with auto-update ------------------------------------- */
  function registerSW() {
    if (!("serviceWorker" in navigator)) return;
    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshing) return; refreshing = true; location.reload();
    });
    window.addEventListener("load", async () => {
      try {
        const reg = await navigator.serviceWorker.register("sw.js");
        reg.update();
        if (reg.waiting) reg.waiting.postMessage("skip-waiting");
        reg.addEventListener("updatefound", () => {
          const nw = reg.installing;
          if (nw) nw.addEventListener("statechange", () => {
            if (nw.state === "installed" && navigator.serviceWorker.controller) nw.postMessage("skip-waiting");
          });
        });
        setInterval(() => reg.update(), 30 * 1000);
        document.addEventListener("visibilitychange", () => { if (!document.hidden) reg.update(); });
      } catch (e) {}
    });
  }
})();
