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

  /* A row can outlive the person it points at, and that is never worth a blank
     app, so an unknown traveler degrades to a "?" rather than throwing. */
  const initials = (name) => String(name == null ? "" : name).trim().split(/\s+/)
    .map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?";
  const avatarHTML = (t, size = 42, fs = 14) =>
    t.photo
      ? `<span class="avatar" style="width:${size}px;height:${size}px;background-image:url('${t.photo}')"></span>`
      : `<span class="avatar" style="width:${size}px;height:${size}px;font-size:${fs}px;background:${t.color}">${initials(t.name)}</span>`;

  const fmtDate = (iso) => {
    const d = new Date(iso + "T12:00:00");
    return { day: d.getDate(), mon: d.toLocaleString("en-US", { month: "short" }), wd: d.toLocaleString("en-US", { weekday: "short" }) };
  };
  const fmtRange = (a, b) => {
    if (!a || !b) return "Dates not set";
    const fa = fmtDate(a), fb = fmtDate(b);
    return `${fa.mon} ${fa.day} → ${fb.mon} ${fb.day}`;
  };
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


  /* =========================================================================
     LANDING - create / join
     ====================================================================== */
  /* ---- Landing flavors -------------------------------------------------------
     Someone planning a wedding and someone planning a golf trip want different
     pages. Same product, same code: only the words and which screens we lead
     with change. Picked from the path (/weddings) or ?for=, so a link can be
     sent to the right person.
     -------------------------------------------------------------------------- */
  const SHOTS = {
    guest:   ["app-wedding.jpg", "Everything a guest needs", "What is next, where it is, what to wear, their table, their shuttle."],
    live:    ["app-live.jpg",    "During the trip it changes", "One card: the next thing, when it starts, and how to get there."],
    plan:    ["app-plan.jpg",    "One shared plan", "Times, places and notes. Tap I'm in and everyone knows who is coming."],
    votes:   ["app-votes.jpg",   "Decisions that settle", "Ask the question once. The tally is the answer, and the thread is right there."],
    money:   ["app-money.jpg",   "Money that closes", "Who owes who, worked out for you. Mark it paid and it disappears."],
    ai:      ["app-ai.jpg",      "An assistant that knows the trip", "Ask it anything about your own plan. Send it a photo of a tee sheet and it reads it."],
    seating: ["app-seating.jpg", "Seating, from the yeses", "Tables built from who accepted, plus-ones included, with the meal counts per table."],
    dayof:   ["app-dayof.jpg",   "The day itself", "A run of show and every vendor's number. Hosts only, guests never see it."],
  };
  const LANDINGS = {
    general: {
      eyebrow: "SquadTrip",
      h1: "Ten people.<br>One plan.<br><em>No group chat.</em>",
      lede: "Every trip has one person holding it together. This is for them. Share one link and the plan, the votes, the money and the flights live in the same place for everybody.",
      shots: ["plan", "ai", "votes", "money", "live", "guest"],
      caption: "Swipe. Nobody in any of these downloaded anything.",
      what: [
        ["One shared plan", "Every day and event, with locations, that anyone can add to."],
        ["Decisions that settle", "Vote on anything, argue in the same place, see where the group landed."],
        ["Money that closes", "Log who paid, see who owes who, mark it settled and it disappears."],
        ["Everyone's flights", "Who lands when, so rides and arrivals plan themselves."],
        ["An assistant that knows the trip", "Drafts the whole itinerary from your dates. Send it a photo of a tee sheet and it reads it."],
        ["Nothing gets lost", "Works on a plane. Anything you change offline syncs the moment you land."],
      ],
      asideTitle: "Planning a wedding?",
      aside: "There is a whole function for it. RSVPs with party sizes and meal choices, room blocks and who has actually booked, dress codes on every event, a seating chart built from the yeses, and a run of show your guests never see.",
      asideLink: ["See the wedding version", "?for=weddings"],
      heroLink: ["Planning a wedding?", "See the wedding version", "weddings/"],
      createLabel: "Create a trip",
    },
    wedding: {
      eyebrow: "SquadTrip for weddings",
      h1: "Everyone knows<br>where to be.<br><em>Without asking you.</em>",
      lede: "One link for your guests. The schedule, the dress codes, the room block, the shuttles and their table, all in the place they already have open. And a planning side they never see.",
      shots: ["guest", "seating", "dayof", "ai", "live", "votes"],
      caption: "Your guests see the first one. The rest is yours.",
      what: [
        ["RSVPs that actually count", "Party sizes capped by the invitation, meal choices and dietary notes per seat. Your caterer's numbers, ready to copy."],
        ["Who has really booked", "Saying yes is not booking. See who has a room, who has not, and who never answered, before the block releases."],
        ["A seating chart from the yeses", "Tables built from who accepted, plus-ones included, with the meal counts and allergies per table."],
        ["The run of show", "Hair at nine, first look at three, and every vendor's number a tap away. Hosts only."],
        ["Guests stop texting you", "Dress codes on every event, shuttle windows from their real flights, and an assistant that answers from what you filled in."],
        ["Nothing gets lost", "Works with one bar at the venue. Anything you change offline syncs when you have signal."],
      ],
      asideTitle: "Not a wedding?",
      aside: "The same app runs group trips: golf weekends, ski houses, beach weeks, bachelor parties and family reunions. The plan, the votes and the money work the same way.",
      asideLink: ["See the group trip version", "/"],
      heroLink: ["Not a wedding?", "See the group trip version", "/"],
      createLabel: "Start your wedding",
    },
  };
  function whichLanding() {
    const stamped = document.body.getAttribute("data-landing");
    if (stamped && LANDINGS[stamped]) return stamped;
    const q = (new URLSearchParams(location.search).get("for") || "").toLowerCase();
    if (q === "weddings" || q === "wedding") return "wedding";
    return "general";
  }
  /* /weddings/ and /golf/ sit one level down, so anything this file builds by
     hand has to climb out. The markup is rewritten at build time; this is not. */
  function assetBase() {
    return /\/(weddings|golf)\/[^/]*$/.test(location.pathname) ? "../" : "";
  }
  function renderLanding() {
    const L = LANDINGS[whichLanding()] || LANDINGS.general;
    const base = assetBase();
    const set = (sel, html) => { const el = $(sel); if (el) el.innerHTML = html; };
    set(".lp-eyebrow", esc(L.eyebrow));
    set(".lp-h1", L.h1);
    set(".lp-lede", esc(L.lede));
    // A vertical list, not a slider. Nothing scrolls sideways, so nothing can
    // drag the rest of the page out of alignment with it.
    set("#lpStrip", L.shots.map((k) => {
      const [file, title, body] = SHOTS[k];
      return `<figure class="lp-slide">
        <div class="lp-phone"><img src="${base}assets/${file}" width="585" height="1230" loading="lazy" alt="${esc(title)}" /></div>
        <figcaption><b>${esc(title)}</b>${esc(body)}</figcaption>
      </figure>`;
    }).join(""));
    set(".lp-caption", esc(L.caption));
    set(".lp-list", L.what.map(([t, d]) => `<div><dt>${esc(t)}</dt><dd>${esc(d)}</dd></div>`).join(""));
    set("#asideTitle", esc(L.asideTitle));
    set("#asideBody", esc(L.aside));
    const hl = $("#lpHeroLink");
    if (hl) {
      const [lead, label, href] = L.heroLink;
      hl.innerHTML = `<span>${esc(lead)}</span> <a href="${href === "/" ? (base || "./") : (base ? base + href : href)}">${esc(label)} \u203a</a>`;
    }
    const al = $("#asideLink");
    if (al) { al.textContent = L.asideLink[0] + " \u203a"; al.setAttribute("href", L.asideLink[1] === "/" ? (base || "./") : L.asideLink[1]); }
    $$("#createBtn, #createBtn2").forEach((b) => { b.textContent = L.createLabel; });
    // a generated page already carries a proper title and description, so only
    // the query-string route needs one written for it
    if (!document.body.getAttribute("data-landing")) {
      document.title = L.eyebrow === "SquadTrip" ? "SquadTrip - plan trips together"
        : L.eyebrow + " - SquadTrip";
    }
  }
  function bootLanding() {
    $("#landing").style.display = "block";
    renderLanding();
    if (!HAS_BACKEND) {
      $("#landingSetup").innerHTML = `<div class="card" style="border-color:#e2ad55;background:#fdf6ea">
        <h3>⚙️ One-time setup needed</h3>
        <p class="r-sub" style="margin:6px 0 0">SquadTrip needs its Supabase backend connected before trips can be created.
        Create a free project, run <code>supabase/schema.sql</code>, and put the URL + publishable key in <code>js/config.js</code>.</p>
      </div>`;
      $$("#createBtn, #createBtn2").forEach((b) => { b.disabled = true; b.style.opacity = 0.5; });
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
    $$("#createBtn, #createBtn2").forEach((b) => b.addEventListener("click", () =>
      openWizard(whichLanding() === "wedding" ? "wedding" : "trip")));
    $$('.lp-link[href="#join"]').forEach((a) => a.addEventListener("click", (e) => {
      e.preventDefault();
      const j = $("#join"); if (j) j.scrollIntoView({ behavior: "smooth", block: "start" });
      setTimeout(() => $("#joinCode") && $("#joinCode").focus(), 420);
    }));

    // the dots track the strip, so it reads as something to swipe
    const strip = $("#lpStrip"), dots = $("#lpDots");
    if (strip && dots) {
      const n = strip.children.length;
      dots.innerHTML = Array.from({ length: n }, (_, i) => `<i class="${i === 0 ? "on" : ""}"></i>`).join("");
      strip.addEventListener("scroll", () => {
        const at = Math.min(n - 1, Math.round(strip.scrollLeft / (strip.scrollWidth / n)));
        Array.from(dots.children).forEach((d, i) => { d.className = i === at ? "on" : ""; });
      }, { passive: true });
    }
    registerSW();
  }

  async function joinTrip() {
    const code = $("#joinCode").value.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (code.length < 4) { $("#joinErr").textContent = "That code looks too short."; return; }
    if (!HAS_BACKEND) { $("#joinErr").textContent = "Backend isn't configured yet."; return; }
    $("#joinErr").textContent = "Checking…";
    try { Backend.init(code); } catch (e) { console.warn("init", e); } // scope the lookup to the typed code
    const trip = await Backend.getTrip(code);
    if (!trip) { $("#joinErr").textContent = "No trip found with that code. Double-check it."; return; }
    location.search = "?t=" + code;
  }

  /* ---- Create-trip wizard -------------------------------------------------- */
  const wiz = { step: 0, mode: "trip", name: "", destination: "", start: "", end: "", datesTbd: false, stops: [], travelers: [], tz: "", currency: "USD", home_currency: "USD", home_city: "", home_airport: "", trip_type: "general" };
  function openWizard(mode) {
    wiz.step = 0;
    wiz.tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    /* Every open starts clean. Tapping Wedding, backing out and tapping Create
       again used to leave the wizard still in wedding mode, so a group trip
       came out the other end as a wedding. The wedding landing page still gets
       what it asks for, because it says so explicitly. */
    wiz.mode = mode === "wedding" ? "wedding" : "trip";
    wiz.datesTbd = false;
    document.body.classList.toggle("theme-wedding", wiz.mode === "wedding");
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
          <button class="who-opt ${w ? "sel" : ""}" id="wModeWed" style="flex:1;justify-content:center;margin:0">💍 Wedding</button>
        </div>
        ${w ? "" : `<label class="wiz-label">What kind of trip?</label>
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:4px">
          ${TRIP_TYPES.map((t) => `<button class="chip ${wiz.trip_type === t.id ? "active" : ""}" data-wtype="${t.id}">${t.emoji} ${t.label}</button>`).join("")}
        </div>`}
        <label class="wiz-label">${w ? "Wedding name" : "Trip name"}</label>
        <input id="wName" class="wiz-in" placeholder="${w ? "e.g. Maya & Jordan in Tulum" : "e.g. Japan 2027"}" value="${esc(wiz.name)}" style="width:100%;padding:12px;border:1px solid var(--line);border-radius:var(--r-sm);font-size:15px" />
        <label class="wiz-label">Destination</label>
        <input id="wDest" data-suggest="city" autocomplete="off" placeholder="${w ? "Start typing, e.g. Tulum" : "Start typing, e.g. Tokyo"}" value="${esc(wiz.destination)}" style="width:100%;padding:12px;border:1px solid var(--line);border-radius:var(--r-sm);font-size:15px" />
        ${cityListHTML()}
        <label class="wiz-label">When</label>
        <div class="wiz-tbd">
          <button class="chip ${wiz.datesTbd ? "" : "active"}" id="wDatesKnown">📅 We have dates</button>
          <button class="chip ${wiz.datesTbd ? "active" : ""}" id="wDatesTbd">🤷 Not sure yet</button>
        </div>
        ${wiz.datesTbd ? `<p class="section-sub" style="margin:8px 0 0;font-size:12.5px">Then the trip opens with a vote on it. Everyone picks the months that work, and you fill the dates in from Settings once one wins.</p>`
        : `<div style="display:flex;gap:10px;margin-top:8px">
          <div style="flex:1"><label class="wiz-label">First day</label>
            <input id="wStart" type="date" value="${esc(wiz.start)}" style="width:100%;padding:12px;border:1px solid var(--line);border-radius:var(--r-sm);font-size:14px" /></div>
          <div style="flex:1"><label class="wiz-label">Last day</label>
            <input id="wEnd" type="date" value="${esc(wiz.end)}" style="width:100%;padding:12px;border:1px solid var(--line);border-radius:var(--r-sm);font-size:14px" /></div>
        </div>`}
        <div class="btn-row" style="margin-top:18px">
          <button class="btn ghost" id="wCancel" style="flex:1">Cancel</button>
          <button class="btn primary" id="wNext" style="flex:2">Next: stops →</button>
        </div>`;
      $("#wCancel").addEventListener("click", closeWizard);
      const keep = () => {
        wiz.name = $("#wName").value.trim();
        wiz.destination = $("#wDest").value.trim();
        const st = $("#wStart"), en = $("#wEnd");
        if (st) wiz.start = st.value;
        if (en) wiz.end = en.value;
      };
      $("#wDatesKnown").addEventListener("click", () => { keep(); wiz.datesTbd = false; renderWizard(); });
      $("#wDatesTbd").addEventListener("click", () => { keep(); wiz.datesTbd = true; renderWizard(); });
      $$("#wizBody [data-wtype]").forEach((b) => b.addEventListener("click", () => { keep(); wiz.trip_type = b.dataset.wtype; renderWizard(); }));
      $("#wModeTrip").addEventListener("click", () => { keep(); wiz.mode = "trip"; document.body.classList.remove("theme-wedding"); renderWizard(); });
      $("#wModeWed").addEventListener("click", () => { keep(); wiz.mode = "wedding"; document.body.classList.add("theme-wedding"); renderWizard(); });
      const syncDestTz = () => {
        const tz = tzForCity($("#wDest").value);
        if (tz) { wiz.tz = tz; wiz.tzAuto = true; }
      };
      $("#wDest").addEventListener("change", syncDestTz);
      $("#wDest").addEventListener("blur", syncDestTz);
      $("#wNext").addEventListener("click", () => {
        keep();
        syncDestTz();
        if (!wiz.name) return alert("Give the trip a name.");
        if (wiz.datesTbd) { wiz.start = ""; wiz.end = ""; }
        else if (!wiz.start || !wiz.end || wiz.end < wiz.start) return alert("Pick valid dates, or tap \"Not sure yet\".");
        wiz.step = 1; renderWizard();
      });
    } else if (wiz.step === 1) {
      if (!wiz.stops.length) wiz.stops = [""];
      B.innerHTML = `${dots}
        <label class="wiz-label">${wiz.mode === "wedding" ? "Where is it happening? (venue town; add more stops if events span places)" : "Stops / bases (in order): where you'll sleep"}</label>
        ${wiz.stops.map((s, i) => `<div class="trav-row">
          <input data-stop="${i}" data-suggest="city" autocomplete="off" placeholder="Start typing a city" value="${esc(s)}" style="padding:12px;border:1px solid var(--line);border-radius:var(--r-sm);font-size:15px" />
          ${wiz.stops.length > 1 ? `<button class="rm" data-rmstop="${i}">✕</button>` : ""}
        </div>`).join("")}
        ${cityListHTML()}
        <button class="btn ghost" id="wAddStop" style="width:100%">＋ Add a stop</button>
        <p class="section-sub" style="margin:10px 0 0;font-size:12.5px">Not decided where yet? Leave this blank${wiz.destination ? " and clear the destination on the last step" : ""} and the trip opens with a vote on it instead. Anyone can put a place up.</p>
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
        const stopTz = wiz.stops.length ? tzForCity(wiz.stops[0]) : "";
        if (stopTz && (wiz.tzAuto || !wiz.tz)) { wiz.tz = stopTz; wiz.tzAuto = true; }
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
        <label class="wiz-label">Destination timezone ${wiz.tzAuto ? `<span style="color:var(--matcha)">detected from ${esc(wiz.destination || wiz.stops[0] || "your destination")}</span>` : ""}</label>
        <input id="wTz" list="tzlist" value="${esc(wiz.tz)}" style="width:100%;padding:12px;border:1px solid var(--line);border-radius:var(--r-sm);font-size:14px" />
        <div class="r-sub" id="wTzNow" style="margin-top:4px;font-size:11.5px">${wiz.tz ? `It's ${new Intl.DateTimeFormat("en-US", { timeZone: wiz.tz, hour: "numeric", minute: "2-digit", hour12: true }).format(new Date())} there right now.` : ""}</div>
        <datalist id="tzlist">${(Intl.supportedValuesOf ? Intl.supportedValuesOf("timeZone") : ["UTC"]).map((z) => `<option value="${z}">`).join("")}</datalist>
        <div style="display:flex;gap:10px">
          <div style="flex:2"><label class="wiz-label">Where's home?</label>
            <input id="wHome" data-suggest="city" autocomplete="off" placeholder="e.g. Chicago, USA" value="${esc(wiz.home_city)}" style="width:100%;padding:12px;border:1px solid var(--line);border-radius:var(--r-sm);font-size:14px" /></div>
          <div style="flex:1"><label class="wiz-label">Home airport</label>
            <input id="wHomeAir" maxlength="3" autocomplete="off" placeholder="ORD" value="${esc(wiz.home_airport)}" style="width:100%;padding:12px;border:1px solid var(--line);border-radius:var(--r-sm);font-size:14px;text-transform:uppercase" /></div>
        </div>
        <div class="r-sub" style="margin-top:4px;font-size:11.5px">Used for the home clock and for watching fares from your airport.</div>
        ${cityListHTML()}
        <div class="btn-row" style="margin-top:18px">
          <button class="btn ghost" id="wBack" style="flex:1">← Back</button>
          <button class="btn primary" id="wCreate" style="flex:2">Create trip</button>
        </div>
        <div id="wErr" class="r-sub" style="color:var(--vermilion);margin-top:8px"></div>`;
      const showTzNow = () => {
        const el = $("#wTzNow"); if (!el) return;
        const tz = $("#wTz").value.trim();
        try { el.textContent = `It's ${new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit", hour12: true }).format(new Date())} there right now.`; }
        catch { el.textContent = "That timezone isn't recognized."; }
      };
      $("#wTz").addEventListener("change", () => { wiz.tzAuto = false; showTzNow(); });
      $("#wHome").addEventListener("change", () => {
        const t = tzForCity($("#wHome").value);
        if (t) wiz.home_tz = t;
      });
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
    wiz.home_city = $("#wHome").value.trim();
    wiz.home_airport = $("#wHomeAir").value.trim().toUpperCase();
    $("#wErr").textContent = "Creating…";

    const travelers = wiz.travelers.map((n, i) => ({ id: slug(n) + "-" + i, name: n, color: PALETTE[i % PALETTE.length] }));
    const stops = wiz.stops.map((s, i) => ({ id: slug(s) + "-" + i, label: s }));
    const row = {
      code: makeCode(), name: wiz.name, destination: wiz.destination,
      start_date: wiz.start, end_date: wiz.end, tz: wiz.tz,
      currency: wiz.currency, home_currency: wiz.home_currency,
      home_city: wiz.home_city, home_airport: wiz.home_airport, trip_type: wiz.trip_type || "general",
      home_tz: tzForCity(wiz.home_city) || wiz.home_tz || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      travelers, stops,
    };
    if (wiz.mode === "wedding") { row.mode = "wedding"; row.hosts = travelers.map((t) => t.id); row.links = {}; }
    // Present the new code before inserting: the row is read back immediately,
    // and the policies only return a trip whose code the request carries.
    try { Backend.init(row.code); } catch (e) { console.warn("init", e); }
    const created = await Backend.createTrip(row);
    if (!created) {
      const why = (Backend.lastError && Backend.lastError()) || "";
      $("#wErr").textContent = why
        ? `Couldn't create the trip: ${why}`
        : (wiz.mode === "wedding"
            ? "Couldn't create it. Wedding mode needs the latest database migration run in Supabase."
            : "Couldn't create the trip. Check the backend setup and try again.");
      return;
    }
    await seedUndecidedVotes(created);
    const mine = LSG.get("mytrips", []);
    mine.unshift({ code: created.code, name: created.name, dates: fmtRange(created.start_date, created.end_date) });
    LSG.set("mytrips", mine.slice(0, 8));
    // remember that this phone made it, so only the host gets asked to invite
    LSG.set("made_" + created.code, true);
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
    ideas: [], flights: [], notes: [], confirmations: [], photos: [], guides: [], announcements: [], comments: [], groups: [], fares: [], ops: [],
    liveRate: null,
  };

  const byId = (id) => (TRIP.travelers || []).find((t) => t.id === id);
  /* Every screen explains itself when it has nothing in it yet. */
  function emptyState(emoji, title, body, ctaLabel, ctaGo) {
    return `<div class="card empty-state">
      <div class="es-emoji">${emoji}</div>
      <h3>${title}</h3>
      <p class="section-sub" style="margin:6px 0 ${ctaLabel ? "14px" : "0"}">${body}</p>
      ${ctaLabel ? `<button class="btn ghost" data-go="${ctaGo}" style="width:100%">${ctaLabel}</button>` : ""}
    </div>`;
  }
  /* Suggestions that work everywhere. Safari, especially an installed
     home-screen app, does not reliably show native datalist options, so we
     draw our own list and position it under the field. */
  let suggestBox = null, suggestFor = null;
  function suggestSource(kind) {
    if (kind === "place") return knownPlaces();
    return (window.CITIES || []).map((x) => x.c);
  }
  function hideSuggest() {
    if (suggestBox) suggestBox.style.display = "none";
    suggestFor = null;
  }
  function showSuggest(input) {
    const kind = input.dataset.suggest;
    const q = input.value.trim().toLowerCase();
    const pool = suggestSource(kind);
    let list;
    if (!q) {
      list = pool.slice(0, 8);
    } else {
      const starts = [], has = [];
      for (const item of pool) {
        const low = item.toLowerCase();
        if (low.startsWith(q)) starts.push(item);
        else if (low.includes(q)) has.push(item);
      }
      // shortest name first, so a query matching two cities favours the closer one
      starts.sort((a, b) => a.length - b.length);
      has.sort((a, b) => a.length - b.length);
      // "obx" and "nola" are what people type, so they resolve too
      const aliased = kind === "city" && window.cityAliasHits ? window.cityAliasHits(q) : [];
      list = aliased.concat(starts, has).filter((x, i, a) => a.indexOf(x) === i).slice(0, 8);
    }
    if (!list.length) { hideSuggest(); return; }
    if (!suggestBox) {
      suggestBox = document.createElement("div");
      suggestBox.className = "suggest";
      document.body.appendChild(suggestBox);
      suggestBox.addEventListener("mousedown", (e) => e.preventDefault()); // keep focus
      suggestBox.addEventListener("click", (e) => {
        const row = e.target.closest("[data-sv]");
        if (!row || !suggestFor) return;
        suggestFor.value = row.dataset.sv;
        suggestFor.dispatchEvent(new Event("input", { bubbles: true }));
        suggestFor.dispatchEvent(new Event("change", { bubbles: true }));
        hideSuggest();
      });
    }
    suggestFor = input;
    suggestBox.innerHTML = list.map((x) => `<div data-sv="${esc(x)}">${esc(x)}</div>`).join("");
    const r = input.getBoundingClientRect();
    suggestBox.style.display = "block";
    suggestBox.style.left = Math.round(r.left) + "px";
    suggestBox.style.width = Math.round(r.width) + "px";
    const below = window.innerHeight - r.bottom;
    if (below < 180 && r.top > 200) {
      suggestBox.style.top = "auto";
      suggestBox.style.bottom = Math.round(window.innerHeight - r.top + 4) + "px";
    } else {
      suggestBox.style.bottom = "auto";
      suggestBox.style.top = Math.round(r.bottom + 4) + "px";
    }
  }
  document.addEventListener("input", (e) => {
    if (e.target.dataset && e.target.dataset.suggest) showSuggest(e.target);
  });
  document.addEventListener("focusin", (e) => {
    if (e.target.dataset && e.target.dataset.suggest) showSuggest(e.target);
    else hideSuggest();
  });
  document.addEventListener("focusout", (e) => {
    if (e.target.dataset && e.target.dataset.suggest) setTimeout(hideSuggest, 150);
  });
  document.addEventListener("pointerdown", (e) => {
    if (suggestBox && suggestBox.contains(e.target)) return; // picking one
    if (e.target === suggestFor) return;                     // back in the field
    hideSuggest();
  }, true);
  window.addEventListener("scroll", hideSuggest, true);
  window.addEventListener("resize", hideSuggest);

  function knownPlaces() {
    const L = TRIP.links || {};
    const set = new Set();
    if (L.venue_name) set.add(L.venue_name);
    state.stayOptions.forEach((o) => { if (o.name) set.add(o.name); });
    state.days.forEach((d) => (d.items || []).forEach((i) => { if (i.where) set.add(i.where); }));
    return [...set];
  }
  const placeListHTML = () => "";
  const cityListHTML = () => ""; // suggestions are drawn by the typeahead now
  const tzForCity = (city) => (window.tzForCity ? window.tzForCity(city) : "");
  const nowIn = (tz) => {
    try { return new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit", hour12: true }).format(new Date()); }
    catch { return "unknown"; }
  };
  const tzLabel = (tz) => {
    if (!tz) return "";
    try {
      const p = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "short" }).formatToParts(new Date());
      return (p.find((x) => x.type === "timeZoneName") || {}).value || tz;
    } catch { return tz; }
  };
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
    tee: { emoji: "⛳️", label: "Tee time" },
  };
  /* Golf trips lead with tee times; everyone else keeps the usual order. */
  const typeOrder = () => tripType() === "golf"
    ? ["tee", "food", "activity", "travel", "rest", "meet", "sight"]
    : ["travel", "sight", "food", "activity", "rest", "meet", "tee"];

  async function bootTrip() {
    $("#tripApp").style.display = "block";
    try { bindShell(); } catch (e) { console.warn("bindShell", e); } // navigation works no matter what
    try { bindItineraryDelegates(); } catch (e) { console.warn("delegates", e); }
    let backendUp = false;
    try { backendUp = !!Backend.init(TRIP_CODE); } catch (e) { console.warn("init", e); }
    if (!HAS_BACKEND || !backendUp) {
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
    startSync();

    renderAll();
    renderWhoami();
    /* Seen-it was stored per device, so anyone who had ever opened one trip
       never got the walkthrough on any other. It belongs to the trip: each one
       is a different plan with different people. The exception is whoever just
       built it, who has been told all this by the wizard. */
    const built = LSG.get("made_" + TRIP.code, false);
    if (built) LS.set("onboarded", true);
    if (!LS.get("onboarded", false)) setTimeout(openWelcome, 500);
    else if (!state.me) setTimeout(openWho, 700);
    else setTimeout(maybeOfferInstall, 1200); // already tagged: nudge once, then snooze
    watchForInviteMoment();
    loadRate();
    registerSW();
  }

  /* Keeping in sync. Works with either backend build, so a half-updated
     cache can never leave the app blank. */
  /* A background refresh must never eat what someone is typing. Snapshot the
     fields on the active screen, re-render, then put the values, focus and
     cursor position back exactly as they were. */
  function fieldKey(el, i) {
    return [el.tagName, el.id || "", el.name || "",
            el.getAttribute("placeholder") || "",
            el.dataset ? JSON.stringify(el.dataset) : "", i].join("|");
  }
  function preservingInput(render) {
    const active = $("#tripApp .screen.active");
    if (!active) { render(); return; }
    const fields = Array.from(active.querySelectorAll("input, textarea, select"));
    const focused = document.activeElement;
    const snap = fields.map((el, i) => ({
      key: fieldKey(el, i),
      value: el.type === "checkbox" || el.type === "radio" ? el.checked : el.value,
      checkable: el.type === "checkbox" || el.type === "radio",
      focused: el === focused,
      start: el.selectionStart, end: el.selectionEnd,
    })).filter((f) => f.checkable ? true : (f.value !== "" || f.focused));
    render();
    if (!snap.length) return;
    const after = Array.from(($("#tripApp .screen.active") || active).querySelectorAll("input, textarea, select"));
    const byKey = new Map();
    after.forEach((el, i) => byKey.set(fieldKey(el, i), el));
    snap.forEach((f) => {
      const el = byKey.get(f.key);
      if (!el) return;
      if (f.checkable) el.checked = f.value;
      else if (el.value !== f.value) el.value = f.value;
      if (f.focused) {
        try { el.focus({ preventScroll: true }); if (f.start != null && el.setSelectionRange) el.setSelectionRange(f.start, f.end); }
        catch (e) { /* not all inputs support selection */ }
      }
    });
  }

  function startSync() {
    const isTyping = () => {
      const el = document.activeElement;
      return !!el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
    };
    const refresh = async () => {
      try {
        await hydrate("all");
        // Fetch fresh data either way, but leave the screen alone mid-edit.
        if (isTyping()) return;
        preservingInput(renderCurrent);
      } catch (e) { console.warn("refresh", e); }
    };
    try {
      if (Backend && typeof Backend.watch === "function") { Backend.watch(refresh); return; }
      if (Backend && typeof Backend.subscribe === "function") { Backend.subscribe(TRIP_CODE, refresh); return; }
    } catch (e) { console.warn("sync setup", e); }
    setInterval(() => { if (document.visibilityState === "visible") refresh(); }, 15000);
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") refresh(); });
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
    J("announcements", Backend.list("announcements", TRIP_CODE, "created_at", false).then((r) => state.announcements = r));
    J("comments", Backend.list("comments", TRIP_CODE, "created_at", true).then((r) => state.comments = r));
    J("groups", Backend.list("groups", TRIP_CODE, "sort", true).then((r) => state.groups = r));
    J("fares", Backend.list("fares", TRIP_CODE, "created_at", true).then((r) => state.fares = r).catch(() => {}));
    J("wedding_ops", Backend.list("wedding_ops", TRIP_CODE, "sort", true).then((r) => state.ops = r).catch(() => {}));
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
  /* Some questions have one answer and some have several. A multi-answer vote
     keeps its picks in the one row the unique constraint allows, comma joined,
     so it needs no migration and an old client still reads something sane. */
  /* Which questions take several answers lives in trips.links, not a new
     column: an insert against a column the database has not got yet fails
     outright, and nobody should have to run a migration to ask a question. */
  const multiIds = () => ((TRIP.links || {}).multi_dec || []);
  const isMulti = (d) => !!d && multiIds().includes(String(d.id));
  async function setMulti(id, on) {
    const cur = multiIds().filter((x) => x !== String(id));
    if (on) cur.push(String(id));
    await saveLinks({ multi_dec: cur }, ["multi_dec"]);
  }
  const splitChoice = (c) => String(c == null ? "" : c).split(",").map((x) => x.trim()).filter(Boolean);
  function myPicks(topic) { return splitChoice(myVote("decision", topic)); }
  function tallyMulti(topic) {
    const m = {};
    state.allVotes.filter((v) => v.kind === "decision" && v.topic === topic).forEach((v) => {
      splitChoice(v.choice).forEach((c) => (m[c] = m[c] || []).push(v.voter));
    });
    return m;
  }
  /* Going from many answers back to one would leave old rows holding a comma
     list, which reads as a vote for an option that does not exist. */
  async function collapseMultiVotes(topic) {
    const rows = state.allVotes.filter((v) => v.kind === "decision" && v.topic === topic && splitChoice(v.choice).length > 1);
    for (const r of rows) {
      const first = splitChoice(r.choice)[0];
      r.choice = first;
      await Backend.castVote(TRIP_CODE, "decision", topic, first, r.voter);
    }
  }
  async function togglePick(topic, optId) {
    if (!state.me) { openWho(); return; }
    const cur = myPicks(topic);
    const next = cur.includes(optId) ? cur.filter((x) => x !== optId) : cur.concat(optId);
    const joined = next.join(",");
    state.allVotes = state.allVotes.filter((v) => !(v.kind === "decision" && v.topic === topic && v.voter === state.me));
    if (joined) state.allVotes.push({ kind: "decision", topic, choice: joined, voter: state.me });
    renderDecisions();
    await Backend.castVote(TRIP_CODE, "decision", topic, joined || null, state.me);
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
  /* The itinerary re-renders constantly, so its buttons are handled by one
     listener on the screen itself rather than re-attached to every button. */
  function bindItineraryDelegates() {
    const screen = $("#screen-itinerary");
    if (!screen || screen.dataset.delegated) return;
    screen.dataset.delegated = "1";
    screen.addEventListener("click", async (e) => {
      const add = e.target.closest("[data-iadd]");
      if (!add) return;
      e.preventDefault();
      const dayId = add.dataset.iadd;
      try { await addItem(dayId); }
      catch (err) {
        console.error("addItem", err);
        const el = $(`[data-imsg="${dayId}"]`);
        if (el) el.textContent = "Error: " + (err && err.message ? err.message : String(err));
        else alert("Couldn't add that: " + (err && err.message ? err.message : err));
      }
    });
  }

  /* Any button anywhere can carry data-go="<screen>" and it just works. One
     listener on the app, so a screen can never forget to wire its own. */
  function bindGoDelegate() {
    const app = $("#tripApp");
    if (!app || app.dataset.goDelegated) return;
    app.dataset.goDelegated = "1";
    app.addEventListener("click", (e) => {
      const go = e.target.closest("[data-go]");
      if (!go || !app.contains(go)) return;
      e.stopPropagation();
      show(go.dataset.go);
    });
  }
  /* Nothing you do is lost to a bad connection. Failed writes are parked in a
     queue that survives closing the app, and this bar shows what is still
     waiting. It clears itself the moment the queue drains. */
  function saveBar() {
    let bar = $("#saveBar");
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "saveBar";
      bar.className = "save-bar";
      document.body.appendChild(bar);
    }
    return bar;
  }
  function showPending(n) {
    const bar = saveBar();
    if (!n) {
      if (bar.classList.contains("open")) {
        bar.className = "save-bar done open";
        bar.innerHTML = `<span>✓ Everything is saved.</span>`;
        setTimeout(() => { bar.className = "save-bar"; }, 2200);
      }
      return;
    }
    bar.className = "save-bar open";
    bar.innerHTML = `<span>${navigator.onLine === false ? "📡 Offline." : "⏳"} ${n} change${n === 1 ? "" : "s"} waiting to sync. Nothing is lost.</span>
      <button class="btn" id="saveRetry">Try now</button>`;
    $("#saveRetry").addEventListener("click", async () => {
      $("#saveRetry").textContent = "Syncing…";
      const r = await Backend.flush();
      if (r && r.left) { $("#saveRetry").textContent = "Still offline"; setTimeout(() => showPending(r.left), 1400); }
      else { showPending(0); await hydrate("all"); renderCurrent(); }
    });
  }
  function watchSaves() {
    if (!window.Backend || !Backend.onQueueChange) return;
    Backend.onQueueChange((n) => showPending(n));
    if (Backend.pending && Backend.pending()) showPending(Backend.pending());
    // A queue that drains in the background should refresh what you are looking at.
    window.addEventListener("online", async () => {
      const r = await Backend.flush();
      if (r && !r.left && r.sent) { await hydrate("all"); renderCurrent(); }
    });
  }
  /* ---- Undo -----------------------------------------------------------------
     Deleting a day takes every event on it. One mis-tap should not be final,
     so anything destructive offers a few seconds to take it back. Restoring
     re-inserts the same row with the same id, so nothing else has to change.
     -------------------------------------------------------------------------- */
  let undoTimer = null;
  function offerUndo(what, restore) {
    const el = $("#undoBar") || (() => {
      const d = document.createElement("div");
      d.id = "undoBar"; d.className = "undo-bar";
      document.body.appendChild(d);
      return d;
    })();
    clearTimeout(undoTimer);
    el.innerHTML = `<span>${esc(what)} deleted</span><button class="btn" id="undoGo">Undo</button>`;
    el.classList.add("open");
    const close = () => { el.classList.remove("open"); clearTimeout(undoTimer); };
    $("#undoGo").addEventListener("click", async () => {
      close();
      try { await restore(); } catch (e) { console.warn("undo", e); }
      renderCurrent();
    });
    undoTimer = setTimeout(close, 7000);
  }
  /* Delete a row and hand back a way to put it exactly as it was. */
  async function deleteWithUndo(table, row, label, onLocal, onRestore) {
    onLocal();
    renderCurrent();
    await Backend.remove(table, row.id);
    offerUndo(label, async () => {
      const back = await Backend.insert(table, row);
      if (back) onRestore(back);
    });
  }

  /* ---- Search ---------------------------------------------------------------
     Seventeen screens and a confirmation number you need at a check-in desk.
     Everything is already in memory, so this is instant and works offline.
     -------------------------------------------------------------------------- */
  const SEARCH_IN = [
    { screen: "itinerary", icon: "🗓️", label: "Plan", rows: () => (state.days || []).flatMap((d) => {
        const when = `${fmtDate(d.date).wd} ${fmtDate(d.date).mon} ${fmtDate(d.date).day}`;
        return [{ title: d.title, sub: [when, d.summary, d.meetup].filter(Boolean).join(" · "), open: d.id }]
          .concat((d.items || []).map((i) => ({
            title: i.title, sub: [when, i.time, i.where, i.dress, i.note].filter(Boolean).join(" · "), open: d.id })));
      }) },
    { screen: "decisions", icon: "🗳️", label: "Votes", rows: () => (state.decisions || []).map((d) => ({
        title: d.title, sub: [d.note, (d.options || []).map((o) => o.label).join(", ")].filter(Boolean).join(" · ") })) },
    { screen: "stays", icon: "🏨", label: "Stays", rows: () => (state.stayOptions || []).map((o) => ({
        title: o.name, sub: [o.tag, o.note, o.booked ? "Booked" : ""].filter(Boolean).join(" · ") })) },
    { screen: "vault", icon: "🔐", label: "Vault", rows: () => (state.confirmations || []).map((c) => ({
        title: c.label, sub: [c.category, c.confirmation_no && "#" + c.confirmation_no].filter(Boolean).join(" · ") })) },
    { screen: "notes", icon: "📝", label: "Notes", rows: () => (state.notes || []).map((n) => ({ title: n.text, sub: n.list || "" })) },
    { screen: "ideas", icon: "💡", label: "Ideas", rows: () => (state.ideas || []).map((i) => ({ title: i.title, sub: [i.tag, i.note].filter(Boolean).join(" · ") })) },
    { screen: "guide", icon: "📖", label: "Guide", rows: () => (state.guides || []).map((g) => ({
        title: g.title, sub: [(g.tags || []).join(", "), g.body, g.base].filter(Boolean).join(" · ") })) },
    { screen: "announce", icon: "📣", label: "Updates", rows: () => (state.announcements || []).map((a) => ({ title: a.title || "Update", sub: a.body || "" })) },
    { screen: "flights", icon: "✈️", label: "Flights", rows: () => (state.flights || []).map((f) => {
        const t = byId(f.traveler) || { name: "Someone" };
        return { title: [f.airline, f.flight_no].filter(Boolean).join(" ") || t.name,
                 sub: [t.name, f.dir === "arrive" ? "Arrival" : "Departure", f.airport, f.date, f.time, f.note].filter(Boolean).join(" · ") }; }) },
    { screen: "budget", icon: "💰", label: "Budget", rows: () => (state.expenses || []).map((e) => ({
        title: e.label, sub: [e.amount && `${e.currency || ""} ${e.amount}`, (byId(e.paid_by) || {}).name].filter(Boolean).join(" · ") })) },
    { screen: "dayof", icon: "⏱️", label: "Day of", rows: () => (isWedding() && isHost() ? (state.ops || []) : []).map((o) => ({
        title: o.label || o.who, sub: [o.time, o.who, o.phone, o.note].filter(Boolean).join(" · ") })) },
    { screen: "booking", icon: "📋", label: "Booking", rows: () => (TRIP.start_date ? bookingItems() : []).map((i) => ({ title: i.label, sub: [i.due, i.note].filter(Boolean).join(" · ") })) },
    { screen: "crew", icon: "👥", label: "Crew", rows: () => (TRIP.travelers || []).map((t) => ({ title: t.name, sub: "" })) },
    { screen: "outfits", icon: "👗", label: "Outfits", rows: () => (outfitsOn() ? (state.allVotes || []) : []).filter((v) => v.kind === "outfit").map((v) => {
        const d = (state.days || []).find((x) => x.id === v.topic), t = byId(v.voter);
        if (!d || !t) return null;
        const f = fmtDate(d.date);
        return { title: v.choice, sub: [t.name, `${f.wd} ${f.mon} ${f.day}`, d.title].filter(Boolean).join(" · ") };
      }).filter(Boolean) },
  ];
  function searchAll(q) {
    const needle = q.trim().toLowerCase();
    if (needle.length < 2) return [];
    const out = [];
    SEARCH_IN.forEach((src) => {
      let rows = [];
      try { rows = src.rows() || []; } catch (e) { rows = []; }
      rows.forEach((r) => {
        const hay = `${r.title || ""} ${r.sub || ""}`.toLowerCase();
        const at = hay.indexOf(needle);
        if (at === -1) return;
        // an exact hit in the title beats a mention buried in the details
        const score = String(r.title || "").toLowerCase().indexOf(needle) === 0 ? 0
          : String(r.title || "").toLowerCase().includes(needle) ? 1 : 2;
        out.push({ ...r, screen: src.screen, icon: src.icon, label: src.label, score });
      });
    });
    return out.sort((a, b) => a.score - b.score).slice(0, 40);
  }
  const mark = (text, q) => {
    const t = String(text || "");
    const i = t.toLowerCase().indexOf(q.toLowerCase());
    if (i === -1 || !q) return esc(t);
    return esc(t.slice(0, i)) + "<mark>" + esc(t.slice(i, i + q.length)) + "</mark>" + esc(t.slice(i + q.length));
  };
  function runSearch() {
    const q = $("#searchInput").value;
    const box = $("#searchResults");
    if (q.trim().length < 2) {
      box.innerHTML = `<p class="section-sub" style="padding:18px 4px;text-align:center">Type at least two letters. This searches your whole trip: the plan, votes, stays, the vault, notes, ideas, flights, updates and more.</p>`;
      return;
    }
    const hits = searchAll(q);
    if (!hits.length) {
      box.innerHTML = `<p class="section-sub" style="padding:18px 4px;text-align:center">Nothing matches “${esc(q)}”.</p>`;
      return;
    }
    box.innerHTML = `<div class="r-sub" style="padding:4px 4px 10px">${hits.length} result${hits.length === 1 ? "" : "s"}</div>` +
      hits.map((h, n) => `<button class="search-hit" data-hit="${n}">
        <span class="sh-icon">${h.icon}</span>
        <span class="sh-main"><span class="sh-title">${mark(h.title, q)}</span>
        ${h.sub ? `<span class="sh-sub">${mark(String(h.sub).slice(0, 120), q)}</span>` : ""}</span>
        <span class="sh-where">${esc(h.label)}</span>
      </button>`).join("");
    box.querySelectorAll("[data-hit]").forEach((b) => b.addEventListener("click", () => {
      const h = hits[Number(b.dataset.hit)];
      closeSearch();
      if (h.open) openDays.add(h.open);   // land with the right day already open
      show(h.screen);
    }));
  }
  function openSearch() {
    $("#searchModal").classList.add("open");
    const i = $("#searchInput");
    i.value = "";
    runSearch();
    setTimeout(() => i.focus(), 60);
  }
  function closeSearch() { $("#searchModal").classList.remove("open"); }
  function bindSearch() {
    const btn = $("#searchBtn"); if (!btn) return;
    btn.addEventListener("click", openSearch);
    $("#searchClose").addEventListener("click", closeSearch);
    $("#searchModal").addEventListener("click", (e) => { if (e.target.id === "searchModal") closeSearch(); });
    $("#searchInput").addEventListener("input", runSearch);
    $("#searchInput").addEventListener("keydown", (e) => { if (e.key === "Escape") closeSearch(); });
  }

  function bindShell() {
    bindGoDelegate();
    watchSaves();
    bindSearch();
    $$(".tab[data-screen]").forEach((t) => t.addEventListener("click", () => show(t.dataset.screen)));
    $$(".sheet-item").forEach((t) => t.addEventListener("click", () => show(t.dataset.screen)));
    // Tapping More again puts the sheet away, the same as tapping it opened it.
    $("#moreTab").addEventListener("click", () => {
      const sheet = $("#moreSheet");
      if (sheet.classList.contains("open")) return closeSheet();
      sheet.classList.add("open"); $("#sheetBackdrop").classList.add("open");
    });
    $("#sheetBackdrop").addEventListener("click", closeSheet);
    bindSheetGrab();
    $("#whoamiBtn").addEventListener("click", openWho);
    $("#whoClose").addEventListener("click", () => {
      $("#whoModal").classList.remove("open");
      // whether or not they tagged themselves, this is the moment to offer it
      setTimeout(maybeOfferInstall, 400);
    });
    $("#whoModal").addEventListener("click", (e) => { if (e.target.id === "whoModal") $("#whoModal").classList.remove("open"); });
  }
  function closeSheet() {
    const sheet = $("#moreSheet");
    sheet.classList.remove("open");
    sheet.style.transform = "";
    $("#sheetBackdrop").classList.remove("open");
  }
  /* The handle looks like every drag-to-dismiss pill on a phone, so it has to
     work like one: tap closes it, and a drag down follows your thumb. */
  function bindSheetGrab() {
    const hit = $("#sheetGrab"), sheet = $("#moreSheet");
    if (!hit || !sheet) return;
    let startY = null, dy = 0;
    hit.addEventListener("click", (e) => { e.preventDefault(); if (dy < 6) closeSheet(); });
    const down = (y) => { startY = y; dy = 0; sheet.style.transition = "none"; };
    const move = (y) => {
      if (startY == null) return;
      dy = Math.max(0, y - startY);
      sheet.style.transform = `translateX(-50%) translateY(${dy}px)`;
    };
    const up = () => {
      if (startY == null) return;
      startY = null;
      sheet.style.transition = "";
      if (dy > 60) closeSheet(); else sheet.style.transform = "";
    };
    hit.addEventListener("touchstart", (e) => down(e.touches[0].clientY), { passive: true });
    hit.addEventListener("touchmove", (e) => { move(e.touches[0].clientY); if (dy > 4) e.preventDefault(); }, { passive: false });
    hit.addEventListener("touchend", up);
    hit.addEventListener("touchcancel", up);
    hit.addEventListener("pointerdown", (e) => { if (e.pointerType !== "touch") down(e.clientY); });
    window.addEventListener("pointermove", (e) => { if (e.pointerType !== "touch") move(e.clientY); });
    window.addEventListener("pointerup", (e) => { if (e.pointerType !== "touch") up(); });
  }
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
    { emoji: "\u{1F4CD}", title: "Welcome to SquadTrip", body: () => `This is <b>${esc(TRIP.name)}</b>, your group's trip HQ. Everything in here is <b>shared live</b>: when anyone votes, plans, or adds something, the whole crew sees it instantly. No accounts, no downloads.` },
    { emoji: "\u{1F44B}", title: "First: say who you are", body: () => `Pick your name from the crew list in a second, or tap <b>I'm not on this list</b> and add yourself. Your votes and expenses get tagged to you. That is the whole login.` },
    { emoji: "\u{1F5D3}\uFE0F", title: "Plan it together", body: () => `The <b>Plan</b> tab is the shared itinerary. Anyone can add days and activities, and you tap <b>\uFF0B I'm in</b> on the ones you'd join. Empty plan? The <b>\u2728 AI setup</b> drafts the whole trip (itinerary, destination guide, neighborhoods) for the group to reshape.` },
    { emoji: "\u{1F5F3}\uFE0F", title: "Decide by voting", body: () => `No more 47-message group chats. Pose questions in <b>Votes</b>, submit hotels in <b>Stays</b>, thumbs-up <b>Ideas</b>. Everyone taps their pick and the tallies settle it. Some questions take more than one answer.` },
    { emoji: "\u{1F5D3}\uFE0F", title: "No dates yet? Say when you're free", body: () => `If the trip has no dates, <b>Votes</b> opens with a month by month picker. Open the months that could work and tick the weeks you're free. The overlap picks the week, and one tap turns it into the trip.` },
    { emoji: "\u{1F4B0}", title: "\u2026and the boring stuff, handled", body: () => `Split expenses in <b>Budget</b> (it computes who owes who), stash confirmations in the <b>Vault</b>, drop pics in <b>Photos</b>, sort out what you're wearing in <b>Outfits</b>, and ask the <b>\u2728 Assistant</b> anything about your trip.` },
    { emoji: "\u{1F4F1}", title: "Put it on your home screen", body: () => `It opens full screen and works with no signal, which is what you want once you're actually there. On iPhone: tap <b>Share</b> at the bottom of Safari, then <b>Add to Home Screen</b>. On Android: the <b>\u22EE</b> menu, then <b>Install app</b>. Have a great one.` },
  ];
  const WEDDING_WELCOME = [
    { emoji: "\u{1F48D}", title: "You're invited", body: () => `Welcome to <b>${esc(TRIP.name)}</b>. Everything about the wedding weekend lives here. Schedule, RSVP, where to stay, travel plans. No accounts, no downloads.` },
    { emoji: "\u{1F44B}", title: "First: say who you are", body: () => `Pick your name from the guest list, or add yourself if you're not on it yet. Your RSVP gets tagged to you. That's the whole login.` },
    { emoji: "\u{1F48C}", title: "RSVP on the Home screen", body: () => `Tap <b>Joyfully accept</b> (and how many are in your party) so the hosts can plan headcounts. You can change it any time.` },
    { emoji: "\u{1F5D3}️", title: "The weekend, in one place", body: () => `The <b>Plan</b> tab has every event: times, dress codes, locations. Tap <b>＋ I'm in</b> on the optional stuff so the hosts know who's joining.` },
    { emoji: "✈️", title: "Travel, handled", body: () => `Drop your flight into <b>Flights</b> so shuttle groups can be organized, check <b>Stays</b> for the room block, and put your pics in <b>Photos</b> all weekend.` },
    { emoji: "\u{1F4F1}", title: "Put it on your home screen", body: () => `It opens full screen and works with no signal, which is what you want at the venue. On iPhone: tap <b>Share</b> at the bottom of Safari, then <b>Add to Home Screen</b>. On Android: the <b>\u22EE</b> menu, then <b>Install app</b>. See you there!` },
  ];
  const HOST_WELCOME = [
    { emoji: "\u{1F48D}", title: "You're hosting", body: () => `<b>${esc(TRIP.name)}</b> is yours to run. Guests get the invitation side: schedule, RSVP, travel. You get the planning side, and they never see it.` },
    { emoji: "\u{1F4E5}", title: "Get everyone in", body: () => `Paste your guest list in <b>Settings</b>, then share your trip code. As people accept, headcounts, meal counts and dietary notes fill themselves in on your Home screen.` },
    { emoji: "\u23F1\uFE0F", title: "Day of is your document", body: () => `The <b>Day of</b> tab holds your run of show and every vendor number. Start from a typical wedding day and change what does not fit, then copy the whole thing to your coordinator.` },
    { emoji: "\u{1FA91}", title: "Seating builds itself", body: () => `<b>Seating</b> turns the yeses into seats, plus-ones included, and totals the meals per table. Guests see only their own table.` },
    { emoji: "\u{1F4CB}", title: "The timeline knows the order", body: () => `<b>Booking</b> is your planning calendar counted back from the date: venue, save the dates, vendors, invitations, final counts, seating, run of show. Have a great one.` },
  ];
  let welcomeStep = 0;
  const welcomeSteps = () => (isWedding() ? (isHost() ? HOST_WELCOME : WEDDING_WELCOME) : WELCOME_STEPS);
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
    LS.set("onboarded", true);
    $("#welcomeModal").classList.remove("open");
    if (!state.me) openWho();
    else { maybeOfferInstall(); maybeOfferInvite(); }
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
      // Normally we wait until someone is tagged, so the ask lands after the
      // introductions. But a first-time visitor who skipped that is exactly
      // the person who most needs this, so they get it on the way out.
      if (!state.me && !LS.get("sawWho", false)) return;
      const snooze = LSG.get("installSnooze", 0);
      if (snooze && Date.now() < snooze) return;        // dismissed recently
      if (LSG.get("installDone", false)) return;
    }
    if (isStandalone()) {
      const alertsOn = pushState() === "on";
      $("#installBody").innerHTML = `
        <div style="text-align:center;font-size:46px;margin:4px 0 8px">✅</div>
        <h3 style="text-align:center;margin:0 0 8px">You're all set</h3>
        <p class="section-sub" style="text-align:center;margin:0 0 16px">SquadTrip is installed on this phone.${alertsOn ? " Alerts are on, so you'll know the moment plans change." : " Turn on alerts and you'll know the moment plans change."}</p>
        ${alertsOn ? "" : `<button class="btn primary" id="instAlerts" style="width:100%;margin-bottom:8px">Turn on alerts</button>`}
        <div id="instAlertMsg" class="r-sub" style="text-align:center;margin-bottom:8px"></div>
        <button class="btn ghost" id="instClose" style="width:100%">${alertsOn ? "Nice" : "Not now"}</button>`;
      $("#installModal").classList.add("open");
      $("#instClose").addEventListener("click", closeInstall);
      const ia = $("#instAlerts"); if (ia) ia.addEventListener("click", async () => {
        $("#instAlertMsg").textContent = "Asking your phone…";
        const r = await enablePush();
        $("#instAlertMsg").textContent = r.msg;
        if (r.ok) { renderCurrent(); setTimeout(closeInstall, 900); }
      });
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
  function closeInstall() {
    $("#installModal").classList.remove("open");
    maybeOfferInvite();
  }
  /* The trip is useless until other people are in it, and the moment right
     after setup is the only moment the host is definitely paying attention.
     Asked once, on the device that made the trip, and never again. */
  function maybeOfferInvite() {
    if (!TRIP || invitedCount() > 0) return;
    if (!LSG.get("made_" + TRIP.code, false)) return;   // not the creator's phone
    if (LS.get("inviteOffered", false)) return;
    const busy = ["welcomeModal", "installModal", "whoModal"]
      .some((id) => { const el = $("#" + id); return el && el.classList.contains("open"); });
    if (busy) return;                                    // wait for the queue to clear
    LS.set("inviteOffered", true);
    setTimeout(openInvite, 500);
  }
  /* The prompt chain is welcome, then identity, then install, and any of them
     can be dismissed in a way that skips the next. Rather than thread the ask
     through every exit, keep looking until the screen is actually clear. */
  function watchForInviteMoment() {
    let tries = 0;
    const t = setInterval(() => {
      if (++tries > 40 || LS.get("inviteOffered", false) || invitedCount() > 0) { clearInterval(t); return; }
      if (!LSG.get("made_" + (TRIP ? TRIP.code : ""), false)) { clearInterval(t); return; }
      maybeOfferInvite();
    }, 700);
  }

  /* ---- Push notifications --------------------------------------------------
     Subscribe this device to the trip's alerts. iOS only allows this from a
     home-screen install, which is why the install prompt comes first.
     -------------------------------------------------------------------------- */
  const pushSupported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  function pushState() {
    if (!pushSupported()) return "unsupported";
    if (!(window.CARAVAN_CONFIG || {}).vapidPublic) return "unconfigured";
    if (Notification.permission === "denied") return "blocked";
    if (Notification.permission === "granted" && LS.get("pushOn", false)) return "on";
    return "off";
  }
  function urlB64ToUint8Array(base64String) {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const raw = atob(base64);
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }
  async function enablePush() {
    const cfg = window.CARAVAN_CONFIG || {};
    if (!pushSupported() || !cfg.vapidPublic) return { ok: false, msg: "This browser can't do notifications." };
    if (!isStandalone() && /iPad|iPhone|iPod/.test(navigator.userAgent))
      return { ok: false, msg: "On iPhone, add SquadTrip to your home screen first, then turn alerts on from there." };
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return { ok: false, msg: "Notifications are blocked. Turn them on in your phone's settings for SquadTrip." };
    try {
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8Array(cfg.vapidPublic) });
      const j = sub.toJSON();
      const ok = await Backend.savePushSub({
        endpoint: sub.endpoint, trip: TRIP_CODE, voter: state.me || "",
        p256dh: j.keys.p256dh, auth: j.keys.auth,
      });
      if (!ok) return { ok: false, msg: "Couldn't save your subscription. Is the push_subs table set up?" };
      LS.set("pushOn", true);
      return { ok: true, msg: "Alerts are on for this phone." };
    } catch (e) {
      console.warn(e);
      return { ok: false, msg: "Couldn't turn on alerts on this device." };
    }
  }
  async function disablePush() {
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) { await Backend.removePushSub(sub.endpoint); await sub.unsubscribe(); }
    } catch (e) { console.warn(e); }
    LS.set("pushOn", false);
  }

  function renderAnnounce() {
    const s = $("#screen-announce");
    const st = pushState();
    const canPost = isHost();
    const toggle = {
      on: `<div class="r-sub" style="color:var(--matcha);font-weight:800">✓ Alerts are on for this phone</div>
           <button class="btn ghost" id="pushOff" style="width:100%;margin-top:10px">Turn alerts off</button>`,
      off: `<button class="btn primary" id="pushOn" style="width:100%">Turn on alerts</button>`,
      blocked: `<div class="r-sub">Notifications are blocked for SquadTrip. Turn them back on in your phone's settings, then reopen this screen.</div>`,
      unsupported: `<div class="r-sub">This browser doesn't support notifications. Try Safari on iPhone or Chrome on Android.</div>`,
      unconfigured: `<div class="r-sub">Push isn't configured for this SquadTrip yet (missing VAPID key).</div>`,
    }[st];
    s.innerHTML = `
      <div class="section-title">Updates</div>
      <div class="section-sub">${canPost ? "Post an update and it lands on everyone's lock screen." : "Announcements from the " + (isWedding() ? "hosts" : "group") + "."}</div>

      <div class="card">
        <h3>🔔 Alerts on this phone</h3>
        <p class="section-sub" style="margin:2px 0 10px">Get a notification when plans change: times, locations, shuttles.
          ${!isStandalone() && /iPad|iPhone|iPod/.test(navigator.userAgent) ? "<b>On iPhone you must add SquadTrip to your home screen first.</b>" : ""}</p>
        ${toggle}
        <div id="pushMsg" class="r-sub" style="margin-top:8px"></div>
      </div>

      ${canPost ? `<div class="card">
        <h3>📣 Post an update</h3>
        <div class="expense-add">
          <input id="annTitle" placeholder="Short headline (optional)" maxlength="80" />
          <textarea id="annBody" rows="3" placeholder="What changed? e.g. Shuttle now leaves at 3:45 from the hotel lobby." style="width:100%;padding:12px;border:1px solid var(--line);border-radius:var(--r-sm);font-size:14px;font-family:inherit;background:#fffdfa;color:var(--ink)"></textarea>
          <button class="btn primary" id="annSend">Send to everyone</button>
        </div>
        <div id="annMsg" class="r-sub" style="margin-top:8px"></div>
      </div>` : ""}

      ${state.announcements.length ? state.announcements.map((a) => {
        const who = byId(a.author);
        return `<div class="card">
          ${a.title ? `<h3 style="margin-bottom:4px">${esc(a.title)}</h3>` : ""}
          <div style="font-size:14px;line-height:1.55;white-space:pre-wrap">${esc(a.body)}</div>
          <div class="r-sub" style="margin-top:8px;font-size:11.5px">${who ? esc(who.name.split(" ")[0]) + " · " : ""}${fmtWhen(a.created_at)}${canPost ? ` · <span style="color:var(--vermilion);cursor:pointer" data-anndel="${a.id}">Remove</span>` : ""}</div>
        </div>`;
      }).join("") : emptyState("📣", "No updates yet", isHost() ? "Post one above and it lands on everyone's phone. Great for time changes, shuttle info, or a last-minute plan." : "When the " + (isWedding() ? "hosts" : "group") + " post something important, it shows up here and on your lock screen.")}`;

    const on = $("#pushOn"); if (on) on.addEventListener("click", async () => {
      $("#pushMsg").textContent = "Asking your phone…";
      const r = await enablePush();
      $("#pushMsg").textContent = r.msg;
      if (r.ok) renderAnnounce();
    });
    const off = $("#pushOff"); if (off) off.addEventListener("click", async () => { await disablePush(); renderAnnounce(); });
    const send = $("#annSend"); if (send) send.addEventListener("click", sendAnnouncement);
    s.querySelectorAll("[data-anndel]").forEach((b) => b.addEventListener("click", async () => {
      state.announcements = state.announcements.filter((x) => x.id !== b.dataset.anndel); renderAnnounce();
      await Backend.remove("announcements", b.dataset.anndel);
    }));
  }
  function fmtWhen(ts) {
    if (!ts) return "";
    const d = new Date(ts), now = new Date();
    const mins = Math.round((now - d) / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return mins + "m ago";
    if (mins < 1440) return Math.round(mins / 60) + "h ago";
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  async function sendAnnouncement() {
    if (!state.me) { openWho(); return; }
    const title = $("#annTitle").value.trim(), body = $("#annBody").value.trim();
    if (!body) { $("#annMsg").textContent = "Type the update first."; return; }
    $("#annMsg").textContent = "Sending…";
    try {
      const cfg = window.CARAVAN_CONFIG;
      const res = await fetch(`${cfg.url}/functions/v1/send-push`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + cfg.anonKey, "apikey": cfg.anonKey },
        body: JSON.stringify({ code: TRIP_CODE, title, body, author: state.me }),
      });
      const data = await res.json().catch(() => ({}));
      if (!data.ok) { $("#annMsg").textContent = data.error || "Couldn't send. Is the send-push function deployed?"; return; }
      $("#annTitle").value = ""; $("#annBody").value = "";
      await hydrate("announcements");
      renderAnnounce();
      $("#annMsg").textContent = data.sent
        ? `Posted, and buzzed ${data.sent} phone${data.sent === 1 ? "" : "s"}.`
        : "Posted. Nobody has alerts turned on yet, so it shows in the app only.";
    } catch (e) {
      $("#annMsg").textContent = "Couldn't reach the push function. Check it's deployed.";
    }
  }

  /* ---- who am I ------------------------------------------------------------ */
  function renderWhoami() {
    const t = byId(state.me);
    $("#whoamiName").textContent = t ? t.name.split(" ")[0] : "Who are you?";
    $("#whoamiAvatar").innerHTML = t ? avatarHTML(t, 26, 10) : "👤";
  }
  function openWho() {
    LS.set("sawWho", true);
    if (isWedding()) { openWhoWedding(); return; }
    const travs = TRIP.travelers || [];
    /* Whoever set the trip up typed a list from memory, and that list is
       always missing someone: the plus one, the friend who got the link
       forwarded, the name spelled wrong. Adding yourself has to be right
       there, not something to ask the host for. */
    $("#whoOptions").innerHTML = travs.map((t) => `<div class="who-opt ${state.me === t.id ? "sel" : ""}" data-me="${t.id}">
      ${avatarHTML(t, 34, 12)}${esc(t.name)}</div>`).join("")
      + `<div class="who-opt who-add" id="whoAddMe"><span class="who-plus">＋</span>${
        travs.length ? "I'm not on this list" : "Add yourself to the trip"}</div>`;
    $$("#whoOptions [data-me]").forEach((o) => o.addEventListener("click", () => {
      const first = !state.me;
      state.me = o.dataset.me; LS.set("me", state.me); renderWhoami();
      $$("#whoOptions .who-opt").forEach((x) => x.classList.toggle("sel", x === o));
      renderCurrent();
      if (first) setTimeout(() => { $("#whoModal").classList.remove("open"); maybeOfferInstall(); }, 450);
    }));
    const am = $("#whoAddMe"); if (am) am.addEventListener("click", () => {
      $("#whoOptions").innerHTML = `
        <input id="whoNewName" placeholder="Your full name" autocomplete="name" style="width:100%;padding:12px;border:1px solid var(--line);border-radius:var(--r-sm);font-size:15px;margin-bottom:10px" />
        <button class="btn primary" id="whoNewSave" style="width:100%">That's me, add me to the ${isWedding() ? "guest list" : "trip"}</button>
        <div id="whoNewMsg" class="r-sub" style="margin-top:6px"></div>`;
      $("#whoNewName").focus();
      $("#whoNewName").addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); $("#whoNewSave").click(); }
        if (e.key === "Escape") openWho();
      });
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

  /* What kind of trip this is. Tunes the AI, the group presets and the
     packing prompts, without forcing anyone to pick one. */
  const TRIP_TYPES = [
    { id: "general",   emoji: "🌍", label: "General" },
    { id: "golf",      emoji: "⛳️", label: "Golf" },
    { id: "ski",       emoji: "🎿", label: "Ski" },
    { id: "beach",     emoji: "🏖️", label: "Beach" },
    { id: "city",      emoji: "🌆", label: "City" },
    { id: "bachelor",  emoji: "🥂", label: "Bach party" },
    { id: "reunion",   emoji: "👨‍👩‍👧", label: "Family" },
    { id: "outdoors",  emoji: "🏔️", label: "Outdoors" },
  ];
  const tripType = () => (TRIP && TRIP.trip_type) || "general";
  /* The banner paints a scene that matches the trip. Trip type decides it when
     it can, otherwise the destination gives it away. Falls back to the dunes. */
  const SCENE_WORDS = [
    [/\b(ski|snow|alps|alpine|aspen|vail|whistler|zermatt|chamonix|tahoe|banff|niseko|jackson hole|telluride|st moritz)\b/i, "ski"],
    [/\b(beach|island|isla|keys|coast|cabo|tulum|maui|hawaii|bahamas|caribbean|cancun|maldives|phuket|bali|aruba|jamaica|turks|riviera|amalfi|algarve|ibiza|mykonos|santorini|barbados|st lucia|punta cana)\b/i, "beach"],
    [/\b(golf|links|pebble beach|streamsong|bandon|pinehurst|kiawah|sawgrass|scottsdale)\b/i, "golf"],
    [/\b(mountain|mountains|hike|hiking|trail|canyon|national park|forest|yosemite|zion|glacier|patagonia|dolomites|rockies|yellowstone|moab|torres)\b/i, "outdoors"],
    [/\b(tokyo|kyoto|osaka|new york|nyc|manhattan|london|paris|chicago|hong kong|singapore|dubai|seoul|berlin|madrid|rome|lisbon|porto|barcelona|amsterdam|toronto|sydney|shanghai|bangkok|istanbul|vienna|prague|copenhagen)\b/i, "city"],
  ];
  function heroScene() {
    const t = tripType();
    if (["golf", "ski", "beach", "city", "outdoors"].includes(t)) return t;
    const hay = `${(TRIP && TRIP.destination) || ""} ${(TRIP && TRIP.name) || ""} ${((TRIP && TRIP.stops) || []).map((s) => s.label).join(" ")}`;
    for (const [re, s] of SCENE_WORDS) if (re.test(hay)) return s;
    return "desert";
  }
  const typeMeta = (id) => TRIP_TYPES.find((t) => t.id === (id || tripType())) || TRIP_TYPES[0];
  /* Sensible groupings per kind of trip. Every trip can make its own too. */
  const GROUP_PRESETS = {
    golf:     [{ name: "Foursomes", size: 4, note: "Four to a group, one card each." }, { name: "Cars", size: 4 }, { name: "Bedrooms", size: 2 }],
    ski:      [{ name: "Ability groups", size: 4, note: "Keep people with others at their pace." }, { name: "Cars", size: 4 }, { name: "Bedrooms", size: 2 }],
    beach:    [{ name: "Bedrooms", size: 2 }, { name: "Boat groups", size: 6 }, { name: "Cars", size: 4 }],
    city:     [{ name: "Dinner tables", size: 6 }, { name: "Rooms", size: 2 }],
    bachelor: [{ name: "Rooms", size: 2 }, { name: "Cars", size: 4 }, { name: "Teams", size: 4 }],
    reunion:  [{ name: "Rooms", size: 3 }, { name: "Cars", size: 5 }],
    outdoors: [{ name: "Tents", size: 2 }, { name: "Hiking groups", size: 4 }, { name: "Cars", size: 4 }],
    wedding:  [{ name: "Shuttle runs", size: 8, note: "Match these to the arrival windows in Flights." }, { name: "Tables", size: 8 }],
    general:  [{ name: "Rooms", size: 2 }, { name: "Cars", size: 4 }, { name: "Teams", size: 4 }],
  };
  const presetsForTrip = () => GROUP_PRESETS[isWedding() ? "wedding" : tripType()] || GROUP_PRESETS.general;

  /* A wedding has two audiences. Guests say their own name and never see the
     rest of the list. Hosts pick themselves from the short host list. */
  function openWhoWedding(step) {
    const box = $("#whoOptions");
    const hosts = (TRIP.travelers || []).filter((t) => (TRIP.hosts || []).includes(t.id));
    if (!step) {
      box.innerHTML = `
        <p class="section-sub" style="margin:-4px 0 12px">So we know who is who.</p>
        <div class="who-opt" id="whoGuest" style="justify-content:center;font-weight:800">I'm a guest</div>
        <div class="who-opt" id="whoHost" style="justify-content:center;font-weight:800">I'm hosting</div>`;
      $("#whoGuest").addEventListener("click", () => openWhoWedding("guest"));
      $("#whoHost").addEventListener("click", () => openWhoWedding("host"));
    } else if (step === "host") {
      box.innerHTML = (hosts.length
        ? hosts.map((t) => `<div class="who-opt ${state.me === t.id ? "sel" : ""}" data-me="${t.id}">${avatarHTML(t, 34, 12)}${esc(t.name)}</div>`).join("")
        : `<p class="section-sub">No hosts are set up yet.</p>`)
        + `<div class="who-opt" id="whoBack" style="justify-content:center;color:var(--ink-2)">← Back</div>`;
      $$("#whoOptions [data-me]").forEach((o) => o.addEventListener("click", () => {
        const first = !state.me;
        state.me = o.dataset.me; LS.set("me", state.me); renderWhoami(); renderCurrent();
        $("#whoModal").classList.remove("open");
        if (first) setTimeout(maybeOfferInstall, 450);
      }));
      $("#whoBack").addEventListener("click", () => openWhoWedding());
    } else {
      const mine = byId(state.me);
      box.innerHTML = `
        <p class="section-sub" style="margin:-4px 0 10px">Your name, so your RSVP is tagged to you. Only the hosts see the full list.</p>
        <input id="whoName" placeholder="First and last name" value="${esc(mine ? mine.name : "")}" style="width:100%;padding:12px;border:1px solid var(--line);border-radius:var(--r-sm);font-size:15px;margin-bottom:10px" />
        <button class="btn primary" id="whoSave" style="width:100%">That's me</button>
        <div id="whoMsg" class="r-sub" style="margin-top:6px"></div>
        <div class="who-opt" id="whoBack" style="justify-content:center;color:var(--ink-2);margin-top:10px">← Back</div>`;
      $("#whoName").focus();
      $("#whoBack").addEventListener("click", () => openWhoWedding());
      $("#whoSave").addEventListener("click", async () => {
        const name = $("#whoName").value.trim();
        if (!name) { $("#whoMsg").textContent = "Type your name first."; return; }
        $("#whoMsg").textContent = "One moment…";
        const fresh = await Backend.getTrip(TRIP_CODE); // never clobber other guests
        if (fresh) TRIP = fresh;
        const travs = TRIP.travelers || [];
        const hit = travs.find((t) => t.name.trim().toLowerCase() === name.toLowerCase());
        if (hit) {
          state.me = hit.id; LS.set("me", state.me);
        } else {
          const me = { id: slug(name) + "-" + travs.length, name, color: PALETTE[travs.length % PALETTE.length] };
          const ok = await Backend.updateTrip(TRIP_CODE, { travelers: [...travs, me] });
          if (!ok) { $("#whoMsg").textContent = "Couldn't save. Try again."; return; }
          TRIP.travelers = [...travs, me];
          state.me = me.id; LS.set("me", state.me);
        }
        const first = true;
        renderWhoami(); renderCurrent();
        $("#whoModal").classList.remove("open");
        if (first) setTimeout(maybeOfferInstall, 450);
      });
    }
    $("#whoModal").classList.add("open");
  }

  /* =========================================================================
     HOME
     ====================================================================== */
  /* The things asking for you, stated plainly, one action each. */
  function actCard(tone, label, title, body, cta, go) {
    return `<div class="act ${tone}">
      <span class="act-pill">${label}</span>
      <h3>${title}</h3>
      <p>${body}</p>
      <button class="btn act-btn" data-go="${go}">${cta}</button>
    </div>`;
  }
  /* A host is not waiting to be asked anything. They are waiting on other
     people, so their cards are about who has not answered and what is unbuilt. */
  function hostNeedsYou() {
    const cards = [];
    const t = tally("wrsvp", "attend");
    const responded = new Set(Object.values(t).flat());
    const guests = (TRIP.travelers || []).filter((tr) => !(TRIP.hosts || []).includes(tr.id));
    const waiting = guests.filter((tr) => !responded.has(tr.id));
    const yes = [];
    Object.entries(t).forEach(([choice, voters]) => {
      if (String(choice).startsWith("yes")) voters.forEach((v) => yes.push({ id: v, n: parseInt(String(choice).split(":")[1], 10) || 1 }));
    });
    const heads = yes.reduce((a, y) => a + y.n, 0);

    if (!guests.length) {
      cards.push(actCard("rose", "Start here", "Nobody is invited yet",
        "Import your guest list in Settings, then share the trip code. Everything else on this screen fills in as they reply.",
        "⚙️ Add the guest list", "settings"));
      return cards.join("");
    }
    if (waiting.length) {
      cards.push(actCard("rose", "Waiting on guests", `${waiting.length} ${waiting.length === 1 ? "person has" : "people have"} not replied`,
        waiting.slice(0, 4).map((w) => esc(w.name.split(" ")[0])).join(" · ") + (waiting.length > 4 ? " and more" : ""),
        "💌 Nudge them", "booking"));
    }
    if (heads) {
      const rooms = bookedStats("room");
      if (rooms.total && rooms.done.length < rooms.total) {
        const behind = rooms.total - rooms.done.length;
        cards.push(actCard("rose", "Room block", `${behind} of ${rooms.total} ${rooms.total === 1 ? "guest" : "guests"} still ${behind === 1 ? "needs" : "need"} to book a room`,
          rooms.quiet.length ? `${rooms.quiet.length} never answered. That is the group to call.` : "They said not yet. A nudge usually does it.",
          "✅ See who has booked", "home"));
      }
      const seats = allSeats();
      const noMeal = seats.filter((x) => !x.meal).length;
      if (noMeal && mealOptions().length) {
        cards.push(actCard("amber", "Catering", `${noMeal} ${noMeal === 1 ? "guest has" : "guests have"} not picked a meal`,
          "Catering wants a number. The Host view below totals what you have and lists every dietary note.",
          "📋 See the counts", "home"));
      }
      const placed = new Set(seatTables().flatMap((g) => g.members || []));
      const unseated = seats.filter((x) => !placed.has(x.key)).length;
      if (unseated) {
        cards.push(actCard("green", "Seating", `${unseated} of ${seats.length} ${unseated === 1 ? "seat is" : "seats are"} unplaced`,
          seatTables().length ? "Tables are started. Keep going while the yeses are fresh." : "No tables yet. They build themselves from the guests who accepted.",
          "🪑 Open the seating chart", "seating"));
      }
    }
    if (!opsOf("run").length) {
      cards.push(actCard("amber", "Day of", "The run of show is empty",
        "Start from a typical wedding day and change what does not fit. Your coordinator will ask for this.",
        "⏱️ Build the run of show", "dayof"));
    } else if (!opsOf("vendor").length) {
      cards.push(actCard("green", "Day of", "No vendor numbers saved",
        "Coordinator, photographer, catering. The ones you would need to call in a hurry.",
        "📇 Add your vendors", "dayof"));
    }
    if (TRIP.start_date && !["live", "eve", "after"].includes(tripPhase())) {
      const due = bookingItems().filter((i) => i.bucket === "now" && !(tally("booking", i.id).done || []).length);
      if (due.length) {
        cards.push(actCard("amber", "Worth doing now", `${due.length} thing${due.length === 1 ? "" : "s"} on the timeline`,
          due.slice(0, 3).map((i) => esc(i.label)).join(" · "),
          "📋 Open the planning timeline", "booking"));
      }
    }
    if (!cards.length) {
      cards.push(actCard("calm", "All caught up", "Everyone has answered and everything is built",
        `${heads} coming, seated, and the day is mapped out. Nothing needs you right now.`,
        "⏱️ Look over the day", "dayof"));
    }
    return cards.slice(0, 3).join("");
  }
  function needsYou() {
    if (isWedding() && isHost()) return hostNeedsYou();
    const cards = [];
    // votes you have not weighed in on
    // the dates picker is a question too, and the loudest one while it is open
    if (!datesKnown() && !myAnsweredAvail()) {
      cards.push(actCard("rose", "When can you go?", "The trip has no dates yet",
        "Open the months that could work and tick the weeks you're free. The overlap picks the week.",
        "🗓️ Say when you're free", "decisions"));
    }
    const open = state.decisions.filter((d) => d.status !== "decided");
    const mine = open.filter((d) => !myVote("decision", d.id));
    if (mine.length) {
      cards.push(actCard("rose", "Open decisions", `${mine.length} ${mine.length === 1 ? "question needs" : "questions need"} your vote`,
        mine.slice(0, 3).map((d) => esc(d.title)).join(" · ") + (mine.length > 3 ? " and more" : ""),
        "🗳️ Cast your votes", "decisions"));
    }
    // things due on the booking timeline
    if (TRIP.start_date && !["live", "eve", "after"].includes(tripPhase())) {
      const due = bookingItems().filter((i) => i.bucket === "now" && !(tally("booking", i.id).done || []).length);
      if (due.length) {
        cards.push(actCard("amber", "Worth doing now", `${due.length} thing${due.length === 1 ? "" : "s"} to book`,
          due.slice(0, 4).map((i) => esc(i.label)).join(" · "),
          "📋 Open the booking timeline", "booking"));
      }
    }
    // stops still waiting on a decision about where to sleep
    if (!isWedding()) {
      const unsettled = (TRIP.stops || []).filter((st) => {
        const opts = state.stayOptions.filter((o) => o.stop === st.id && o.kind !== "block");
        return opts.length && !opts.some((o) => o.booked) && !myVote("stay", st.id);
      });
      if (unsettled.length) {
        cards.push(actCard("green", "Where we sleep", `Pick your favorite in ${unsettled.map((x) => esc(x.label)).join(" and ")}`,
          "Places are in. The group is waiting on votes before anyone books.",
          "🏨 Go to Stays", "stays"));
      }
    }
    // nothing outstanding is worth saying out loud too
    if (!cards.length) {
      return `<div class="act calm">
        <span class="act-pill">All caught up</span>
        <h3>Nothing needs you right now</h3>
        <p>Every vote is in and nothing is due. Have a look around, or add something for the group.</p>
        <button class="btn act-btn" data-go="assistant">✨ Ask the assistant</button>
      </div>`;
    }
    return cards.join("");
  }

  function renderHome() {
    const s = $("#screen-home");
    const openCount = state.decisions.filter((d) => d.status !== "decided").length;
    const phase = tripPhase();
    s.innerHTML = `
      <div class="hero compact" data-scene="${heroScene()}">
        <div class="sun"></div>
        <div class="kicker">${isWedding() ? (isHost() ? "💍 You're hosting · " : "💍 You're invited · ") + esc(TRIP.destination || "") : esc(TRIP.destination || "The trip")}</div>
        <h1 style="font-size:32px">${esc(TRIP.name)}</h1>
        <div class="dates">${datesKnown()
          ? `${fmtRange(TRIP.start_date, TRIP.end_date)} · ${nightsBetween(TRIP.start_date, TRIP.end_date)} nights`
          : "Dates not set yet"}</div>
        <div class="cities-row">${(TRIP.stops || []).map((c) => `<span class="city-chip">${esc(c.label)}</span>`).join("")}</div>
      </div>

      ${tzWarningCard()}
      ${undecidedCard()}
      ${justSettledCard()}
      ${isWedding() ? weddingRsvpCard() : ""}
      ${latestAnnouncementCard()}

      ${phase === "live" || phase === "eve" ? `
        ${liveCard()}
        ${needsYou()}
        <div class="clocks" id="clocks"></div>`
      : phase === "after" ? `
        ${afterCard()}
        ${needsYou()}`
      : `
        ${todayCard()}
        ${needsYou()}
        <div class="countdown" id="countdown"></div>
        <div class="clocks" id="clocks"></div>
        ${datesKnown() ? bookedAskCard() + bookedHostCard() : ""}
        ${askedCard()}`}
      ${isWedding() ? weddingYouCard() + weddingLinksCard() : ""}

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
        <h3>❓ New here?</h3>
        <p class="section-sub" style="margin:4px 0 10px">The two minute tour of how this works. Worth a look if someone forwarded you the link.</p>
        <button class="btn ghost" id="showHowto" style="width:100%">How this works</button>
      </div>

      <div class="card" style="margin-top:16px">
        <h3>📍 ${isWedding() ? "Guest code" : "Trip code"}</h3>
        <p class="section-sub" style="margin:4px 0 0">${isWedding() ? "Guests" : "Friends"} join with this code (or the link below).</p>
        <div class="code-big">${esc(TRIP.code)}</div>
        <div class="btn-row">
          <button class="btn primary" id="inviteBtn" style="flex:2">✉️ Send the invite</button>
          <button class="btn ghost" id="copyLink" style="flex:1">Copy link</button>
        </div>
        <p class="r-sub" style="margin:9px 0 0">${invitedCount() ? `Sent to <b>${invitedCount()}</b> so far.` : "Nobody has been sent the walkthrough yet."}</p>
      </div>

      <div class="foot-note">SquadTrip · everything syncs live for the whole group</div>`;
    bindBookedCards(s);
    bindAsked(s);
    const hc = $("#hostCopy"); if (hc) hc.addEventListener("click", () => {
      navigator.clipboard?.writeText(cateringList())
        .then(() => { $("#hostMsg2").textContent = "Copied. Paste it straight into an email."; })
        .catch(() => { $("#hostMsg2").textContent = "Couldn't copy on this device."; });
    });
    const hn = $("#hostNudge"); if (hn) hn.addEventListener("click", () => nudgeMissing());
    const tzf = $("#tzFixNow"); if (tzf) tzf.addEventListener("click", async () => {
      const guess = tzForCity(TRIP.destination) || tzForCity((TRIP.stops || [])[0] && TRIP.stops[0].label);
      $("#tzFixMsg").textContent = "Saving…";
      const ok = await Backend.updateTrip(TRIP_CODE, { tz: guess });
      if (ok) { TRIP.tz = guess; renderHome(); } else $("#tzFixMsg").textContent = "Couldn't save. Try again.";
    });
    const ua = $("#undecidedAsk"); if (ua) ua.addEventListener("click", startUndecidedVote);
    s.querySelectorAll("[data-wrsvp]").forEach((b) => b.addEventListener("click", () => setVote("wrsvp", "attend", b.dataset.wrsvp)));
    s.querySelectorAll("[data-wparty]").forEach((b) => b.addEventListener("click", () => {
      const cur = myVote("wrsvp", "attend");
      if (cur !== "yes:" + b.dataset.wparty) setVote("wrsvp", "attend", "yes:" + b.dataset.wparty);
    }));
    const wds = $("#wrDetSave"); if (wds) wds.addEventListener("click", async () => {
      if (!state.me) { openWho(); return; }
      const party = $$("[data-seatname]").map((el, i) => ({
        name: el.value.trim(),
        meal: ($(`[data-seatmeal="${i}"]`) || {}).value || "",
        diet: ($(`[data-seatdiet="${i}"]`) || {}).value.trim() || "",
      })).filter((x) => x.name || x.meal || x.diet);
      const choice = JSON.stringify({ party });
      state.allVotes = state.allVotes.filter((v) => !(v.kind === "wrsvp" && v.topic === "details" && v.voter === state.me));
      state.allVotes.push({ kind: "wrsvp", topic: "details", choice, voter: state.me });
      const ok = await Backend.castVote(TRIP_CODE, "wrsvp", "details", choice, state.me);
      $("#wrDetMsg").textContent = ok ? "Saved ✓ (the hosts can see this)" : "Couldn't save. Try again.";
    });
    $("#copyLink").addEventListener("click", () => {
      const url = tripUrl();
      navigator.clipboard?.writeText(url).then(() => { $("#copyLink").textContent = "Copied ✓"; setTimeout(() => $("#copyLink").textContent = "Copy link", 1500); }).catch(() => {});
    });
    const ib = $("#inviteBtn"); if (ib) ib.addEventListener("click", openInvite);
    const sh = $("#showHowto"); if (sh) sh.addEventListener("click", openWelcome);
    tickCountdown(); renderClocks();
  }
  /* When a trip is created without dates or without a destination, that is not
     a gap to nag about later. It is the first thing the group has to decide,
     so the trip opens with the vote already on the board.

     The "when" vote comes seeded with real months, because a vote with nothing
     in it is just a question, and a month is how groups actually narrow a date
     before arguing about a weekend. The "where" vote starts empty on purpose:
     guessing destinations for someone else is worse than useless, and anyone
     can now put a candidate up. */
  function nextMonths(n) {
    const out = [], d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() + 2);   // two months out, the earliest most groups can book
    for (let i = 0; i < n; i++) {
      out.push({ id: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
                 label: d.toLocaleDateString("en-US", { month: "long", year: "numeric" }) });
      d.setMonth(d.getMonth() + 1);
    }
    return out;
  }
  async function seedUndecidedVotes(trip) {
    const jobs = [];
    // "when" is not a seeded question any more: the Votes tab grows an
    // availability picker on its own whenever the trip has no dates, which
    // beats a month-shaped poll you cannot narrow.
    if (!trip.destination && !(trip.stops || []).length) {
      jobs.push(Backend.insert("decisions", {
        trip: trip.code, title: "Where should we go?",
        note: "Add the places you'd actually go, then everyone votes. Anyone can put one up.",
        options: [], status: "open", author: "",
      }));
    }
    if (jobs.length) { try { await Promise.all(jobs); } catch (e) { console.warn("seed votes", e); } }
  }

  /* =========================================================================
     THE INVITE

     The code on its own asks people to work out what this is. Most of them
     have never seen the app, and half will read the text on a phone, in a
     group chat, between other things. So the invite is a written message: what
     it is, what to tap first, and the two or three things that actually need
     them. The host can edit every word before it goes.
     ====================================================================== */
  const tripUrl = () => location.origin + location.pathname + "?t=" + TRIP.code;
  const invitedCount = () => Number((TRIP.links || {}).invited_count || 0);

  /* Written for the person receiving it, not the person sending it. Numbered,
     because a numbered list survives a group chat and a paragraph does not. */
  function inviteText() {
    const L = TRIP.links || {};
    const wed = isWedding();
    const when = datesKnown()
      ? `${fmtRange(TRIP.start_date, TRIP.end_date)}`
      : "Dates are not locked in yet, which is part of what we're sorting";
    const where = TRIP.destination || (TRIP.stops || []).map((x) => x.label).filter(Boolean).join(", ");
    const lines = [];

    lines.push(wed ? `You're invited to ${TRIP.name}.` : `${TRIP.name} is happening.`);
    lines.push("");
    lines.push(`${when}${where ? ` · ${where}` : ""}`);
    lines.push("");
    lines.push(wed
      ? `Everything for the weekend lives in one place. The schedule, the dress codes, where to stay, and your table when we get there. No app store, no account, no password. Open this and you're in:`
      : `I put everything in one place so it isn't spread across six group chats. No app store, no account, no password. Open this and you're in:`);
    lines.push("");
    lines.push(tripUrl());
    lines.push("");
    lines.push(`If it asks for a code, it's ${TRIP.code}.`);
    lines.push("");
    lines.push("Three things when you're in:");
    lines.push("");
    lines.push("1. Tap your name so everything you do is tagged to you.");
    lines.push(wed ? "2. RSVP, and say who is coming with you." : "2. Vote on the open questions. That is how we actually decide anything.");
    lines.push(wed
      ? "3. Add your flights so we know when to expect you."
      : (datesKnown() ? "3. Check the Booking tab. It says what to book and by when." : "3. Add the dates that work for you so we can pick a weekend."));
    lines.push("");
    lines.push("Last thing, put it on your home screen. It opens full screen and works with no signal, which matters once we're there.");
    lines.push("");
    lines.push("iPhone: tap Share at the bottom of Safari, scroll down, tap Add to Home Screen.");
    lines.push("Android: tap the ⋮ menu, then Install app.");
    return lines.join("\n");
  }

  let inviteDraft = null;
  function openInvite() {
    if (inviteDraft == null) inviteDraft = inviteText();
    const m = $("#inviteModal");
    $("#inviteBody").innerHTML = `
      <h3 style="margin:0 0 4px">✉️ Send the invite</h3>
      <p class="section-sub" style="margin:0 0 12px">This is the whole message, written for someone who has never seen the app. Change anything you like before it goes.</p>
      <textarea id="inviteText" rows="14" style="width:100%;padding:12px;border:1px solid var(--line);border-radius:var(--r-sm);font-size:13.5px;line-height:1.6;background:#fffdfa;color:var(--ink);font-family:inherit;resize:vertical">${esc(inviteDraft)}</textarea>
      <div class="btn-row" style="margin-top:12px">
        <button class="btn ghost" id="inviteReset" style="flex:1">Reset</button>
        <button class="btn primary" id="inviteSend" style="flex:2">${navigator.share ? "Share it" : "Copy it"}</button>
      </div>
      <button class="btn ghost" id="inviteClose" style="width:100%;margin-top:8px">Close</button>
      <div id="inviteMsg" class="r-sub" style="margin-top:8px"></div>`;
    m.classList.add("open");
    const keep = () => { inviteDraft = $("#inviteText").value; };
    $("#inviteClose").addEventListener("click", () => { keep(); m.classList.remove("open"); });
    $("#inviteReset").addEventListener("click", () => { inviteDraft = inviteText(); openInvite(); });
    $("#inviteSend").addEventListener("click", async () => {
      keep();
      const text = inviteDraft;
      const say = (t) => { const el = $("#inviteMsg"); if (el) el.textContent = t; };
      let sent = false;
      if (navigator.share) {
        try { await navigator.share({ title: TRIP.name, text }); sent = true; }
        catch (e) { if (e && e.name === "AbortError") return; }   // they backed out, leave it be
      }
      if (!sent) {
        try { await navigator.clipboard.writeText(text); say("Copied. Paste it into the group chat."); sent = true; }
        catch (e) { say("Couldn't copy automatically. Select the text above and copy it."); }
      } else say("Sent.");
      if (sent) await markInvited();
    });
  }
  /* A count, not a list. We cannot know who actually received a text, so the
     card says how many times the invite went out and nothing more. */
  async function markInvited() {
    const n = invitedCount() + 1;
    await saveLinks({ invited_count: n }, ["invited_count"]);
    if ($("#screen-home").classList.contains("active")) renderHome();
  }

  /* ---- Wedding mode: RSVP, links, attendance ------------------------------ */
  /* How many seats a guest's invitation covers, and what is on the menu.
     Both live on data we already store, so no migration is needed. */
  const mealOptions = () => ((TRIP.links || {}).meals || []).filter(Boolean);
  const defaultAllowance = () => Number((TRIP.links || {}).allowance ?? 2);
  const allowanceFor = (id) => {
    const t = byId(id);
    const v = t && t.allow != null ? Number(t.allow) : defaultAllowance();
    return Math.max(1, Math.min(8, v || 1));
  };
  function myParty() {
    // [{name, meal, diet}] with graceful fallback to the older shape
    const raw = myRsvpDetails();
    if (Array.isArray(raw.party)) return raw.party;
    if (raw.names || raw.dietary) {
      return String(raw.names || "").split(/,|\n/).map((n) => n.trim()).filter(Boolean)
        .map((n, i) => ({ name: n, meal: "", diet: i === 0 ? (raw.dietary || "") : "" }));
    }
    return [];
  }
  function partyOf(voterId) {
    const rec = state.allVotes.find((v) => v.kind === "wrsvp" && v.topic === "details" && v.voter === voterId);
    if (!rec) return [];
    try {
      const d = JSON.parse(rec.choice || "{}");
      if (Array.isArray(d.party)) return d.party;
      if (d.names) return String(d.names).split(/,|\n/).map((n) => n.trim()).filter(Boolean).map((n, i) => ({ name: n, meal: "", diet: i === 0 ? (d.dietary || "") : "" }));
    } catch { /* ignore */ }
    return [];
  }

  function myRsvpDetails() {
    try { return JSON.parse(myVote("wrsvp", "details") || "{}") || {}; } catch { return {}; }
  }
  /* ---- Booked yet? -----------------------------------------------------------
     The gap between "yes I am coming" and "I have actually booked" is where a
     trip quietly falls apart, and for a wedding it costs the couple real money
     when a room block releases unsold. Three states, not two: booked, not yet,
     and never answered. The last one is the group that needs a phone call.
     -------------------------------------------------------------------------- */
  function bookables() {
    const L = TRIP.links || {};
    if (isWedding()) return [
      { id: "room", emoji: "🛏️", label: "Your room",
        note: L.deadline ? `The block releases ${esc(L.deadline)}.` : "Group rates are held for a limited time.",
        link: L.roomblock || "" },
      { id: "flight", emoji: "✈️", label: "Your flights",
        note: `Fares to ${esc(TRIP.destination || "there")} climb as the date gets close.`, link: "" },
    ];
    return [
      { id: "flight", emoji: "✈️", label: "Your flights", note: "So the group knows who is locked in.", link: "" },
      { id: "stay", emoji: "🏨", label: "Where you sleep", note: "Whatever the group settled on.", link: "" },
    ];
  }
  const bookedByMe = (id) => myVote("booked", id);
  /* Who is expected to answer: the yeses at a wedding, everyone on a trip. */
  function expectedToBook() {
    const people = (TRIP.travelers || []).filter((t) => !(isWedding() && (TRIP.hosts || []).includes(t.id)));
    if (!isWedding()) return people;
    const t = tally("wrsvp", "attend");
    const yes = new Set();
    Object.entries(t).forEach(([choice, voters]) => { if (String(choice).startsWith("yes")) voters.forEach((v) => yes.add(v)); });
    return people.filter((p) => yes.has(p.id));
  }
  function bookedStats(id) {
    const t = tally("booked", id);
    const done = new Set(t.yes || []), soon = new Set(t.no || []);
    const expected = expectedToBook();
    return {
      done: expected.filter((p) => done.has(p.id)),
      soon: expected.filter((p) => soon.has(p.id)),
      quiet: expected.filter((p) => !done.has(p.id) && !soon.has(p.id)),
      total: expected.length,
    };
  }
  /* Asked of you at the moment it is relevant, not buried in a checklist. */
  function bookedAskCard() {
    if (!state.me || isHost() && isWedding()) return "";
    if (isWedding()) {
      const mine = myVote("wrsvp", "attend");
      if (typeof mine !== "string" || !mine.startsWith("yes")) return "";
    }
    const rows = bookables();
    if (rows.every((r) => bookedByMe(r.id) === "yes")) return "";
    return `<div class="card" style="border-color:var(--gold-soft)">
      <h3>✅ Have you booked?</h3>
      <p class="section-sub" style="margin:4px 0 12px">${isWedding()
        ? "The hosts are counting on these. It takes one tap and you can change it any time."
        : "So nobody is guessing who is actually locked in."}</p>
      ${rows.map((r) => {
        const mine = bookedByMe(r.id);
        return `<div style="margin-bottom:14px">
          <div class="r-title" style="font-size:14.5px">${r.emoji} ${r.label}</div>
          <div class="r-sub" style="margin:2px 0 8px">${r.note}</div>
          <div class="btn-row">
            <button class="btn ${mine === "yes" ? "primary" : "ghost"}" data-bkd="${r.id}:yes" style="flex:1">${mine === "yes" ? "✓ Booked" : "Booked it"}</button>
            <button class="btn ${mine === "no" ? "primary" : "ghost"}" data-bkd="${r.id}:no" style="flex:1">${mine === "no" ? "✓ Not yet" : "Not yet"}</button>
          </div>
          ${r.link && mine !== "yes" ? `<a class="tl-map" href="${esc(r.link)}" target="_blank" rel="noopener" style="display:inline-block;margin-top:8px">Open the booking link ›</a>` : ""}
        </div>`;
      }).join("")}
    </div>`;
  }
  /* What the host actually needs: the number, and the names to chase. */
  function bookedHostCard() {
    if (isWedding() && !isHost()) return "";
    const rows = bookables().map((r) => ({ ...r, st: bookedStats(r.id) }));
    if (!rows.some((r) => r.st.total)) return "";
    return `<div class="card" style="border-color:var(--gold-soft)">
      <h3>✅ Who has actually booked</h3>
      <p class="section-sub" style="margin:4px 0 12px">Saying yes is not the same as booking. ${isWedding()
        ? "This is the number that decides whether the room block releases unsold." : "This is who is really locked in."}</p>
      ${rows.map((r) => {
        const { done, soon, quiet, total } = r.st;
        const pct = total ? Math.round((done.length / total) * 100) : 0;
        return `<div style="margin-bottom:16px">
          <div style="display:flex;align-items:baseline;gap:8px">
            <div class="r-title" style="font-size:14.5px;flex:1">${r.emoji} ${r.label}</div>
            <div class="r-sub"><b>${done.length}</b> of ${total}</div>
          </div>
          <div class="progress" style="margin:8px 0 8px"><i style="width:${pct}%"></i></div>
          <div style="display:flex;flex-wrap:wrap;gap:7px">
            ${soon.length ? `<span class="when-chip">Not yet: ${soon.length}</span>` : ""}
            ${quiet.length ? `<span class="when-chip" style="border-color:var(--sakura-deep);color:var(--vermilion-2)">No answer: ${quiet.length}</span>` : ""}
            ${!soon.length && !quiet.length ? `<span class="when-chip" style="border-color:var(--matcha);color:var(--matcha)">Everyone is booked</span>` : ""}
          </div>
          ${quiet.length ? `<div class="r-sub" style="margin-top:8px">Waiting on ${quiet.slice(0, 8).map((p) => esc(p.name.split(" ")[0])).join(", ")}${quiet.length > 8 ? ` and ${quiet.length - 8} more` : ""}</div>` : ""}
        </div>`;
      }).join("")}
      <button class="btn ghost" id="bkdNudge" style="width:100%">Nudge whoever has not booked</button>
      <div id="bkdMsg" class="r-sub" style="margin-top:8px"></div>
    </div>`;
  }
  function bindBookedCards(root) {
    (root || document).querySelectorAll("[data-bkd]").forEach((b) => b.addEventListener("click", () => {
      const [id, val] = b.dataset.bkd.split(":");
      setVote("booked", id, val);
    }));
    const n = $("#bkdNudge"); if (n) n.addEventListener("click", async () => {
      const say = (m) => { const el = $("#bkdMsg"); if (el) el.textContent = m; };
      const missing = [];
      bookables().forEach((r) => bookedStats(r.id).quiet.concat(bookedStats(r.id).soon)
        .forEach((p) => { if (!missing.some((x) => x.id === p.id)) missing.push(p); }));
      if (!missing.length) { say("Everyone is booked."); return; }
      const link = `${location.origin + location.pathname}?t=${TRIP.code}`;
      const L = TRIP.links || {};
      const msg = `Quick one about ${TRIP.name}: have you booked yet? ${isWedding() && L.deadline ? `The room block releases ${L.deadline}. ` : ""}Tap yes or not yet here so we know where we stand: ${link}`;
      if (navigator.share) {
        try { await navigator.share({ title: TRIP.name, text: `${msg}\n\nStill waiting on: ${missing.map((m) => m.name).join(", ")}` }); say("Sent."); return; }
        catch (e) { if (e && e.name === "AbortError") { say("Cancelled."); return; } }
      }
      navigator.clipboard?.writeText(`${missing.map((m) => m.name).join(", ")}\n\n${msg}`)
        .then(() => say(`Copied a nudge for ${missing.length}.`))
        .catch(() => say("Couldn't copy on this device."));
    });
  }
  function weddingRsvpCard() {
    if (isHost()) return "";   // you are throwing it, you do not RSVP to it
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
      ${accepted ? (() => {
        const cap = allowanceFor(state.me);
        const meals = mealOptions();
        const seats = myParty();
        return `<div style="display:flex;align-items:center;gap:8px;margin-top:12px;flex-wrap:wrap">
          <span style="font-size:13px;font-weight:700">In my party:</span>
          ${Array.from({ length: cap }, (_, i) => i + 1).map((n) => `<button class="rsvp-btn ${party === n ? "on" : ""}" data-wparty="${n}" style="${party === n ? "" : ghost}">${n}</button>`).join("")}
        </div>
        <div class="r-sub" style="margin-top:6px;font-size:11.5px;color:rgba(246,241,232,.8)">
          ${cap === 1 ? "Your invitation is for one." : `Your invitation covers up to ${cap}.`}</div>
        <div class="expense-add" style="margin-top:12px">
          ${Array.from({ length: party }, (_, i) => {
            const seat = seats[i] || {};
            return `<div class="seat">
              <input data-seatname="${i}" placeholder="${i === 0 ? "Your name" : "Guest " + (i + 1) + " name"}" value="${esc(seat.name || (i === 0 && byId(state.me) ? byId(state.me).name : ""))}" />
              ${meals.length ? `<select data-seatmeal="${i}">
                <option value="">Meal…</option>
                ${meals.map((m) => `<option value="${esc(m)}" ${seat.meal === m ? "selected" : ""}>${esc(m)}</option>`).join("")}
              </select>` : ""}
              <input data-seatdiet="${i}" placeholder="Allergies or dietary notes (optional)" value="${esc(seat.diet || "")}" />
            </div>`;
          }).join("")}
          <button class="btn ghost" id="wrDetSave" style="${ghost}">Save details</button>
        </div>
        <div id="wrDetMsg" class="r-sub" style="margin-top:4px"></div>`;
      })() : ""}
    </div>`;
  }
  /* One card that answers "where do I go and what do I wear", pulled from what
     the hosts already filled in. Guests should not have to hunt five tabs. */
  function weddingYouCard() {
    if (!isWedding() || isHost() || !state.me) return "";
    const mine = myVote("wrsvp", "attend");
    if (typeof mine !== "string" || !mine.startsWith("yes")) return "";
    const today = new Date().toISOString().slice(0, 10);
    const next = (state.days || []).filter((d) => d.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0];
    const ev = next && (next.items || [])[0];
    const table = myTable();
    const mineFlight = (state.flights || []).find((f) => f.traveler === state.me && f.dir === "arrive");
    const shuttle = mineFlight && mineFlight.time
      ? `${String(mineFlight.time).slice(0, 2)}:00 window${mineFlight.airport ? " from " + esc(mineFlight.airport) : ""}`
      : "";
    const seats = myParty().length || (parseInt(mine.split(":")[1], 10) || 1);
    const rows = [];
    if (next) {
      const f = fmtDate(next.date);
      rows.push(["🗓️", "Next up", `${f.wd} ${f.mon} ${f.day} · ${esc(next.title)}${ev && ev.time ? " at " + esc(ev.time) : ""}`]);
      if (ev && ev.where) rows.push(["📍", "Where", esc(ev.where)]);
      if (ev && ev.dress) rows.push(["👗", "Dress code", esc(ev.dress)]);
    }
    if (table) rows.push(["🪑", "Your table", esc(table)]);
    if (shuttle) rows.push(["🚐", "Your shuttle", shuttle]);
    rows.push(["🎟️", "Your party", `${seats} ${seats === 1 ? "seat" : "seats"}`]);
    if (!rows.length) return "";
    return `<div class="card" style="border-color:var(--gold-soft);background:linear-gradient(180deg,#fdfaf3,#fffdf8)">
      <h3>✨ Your wedding at a glance</h3>
      <div style="margin-top:10px">
        ${rows.map(([emoji, label, val]) => `<div class="row" style="padding:7px 0">
          <span style="font-size:17px;width:26px;text-align:center">${emoji}</span>
          <div class="r-main"><div class="r-sub" style="font-size:11px;letter-spacing:.6px;text-transform:uppercase">${label}</div>
            <div class="r-title" style="font-size:14.5px">${val}</div></div>
        </div>`).join("")}
      </div>
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
    if (!isHost()) {
      return `<p style="margin:0;font-size:13px;color:var(--ink-2)">${people
        ? `<b>${people}</b> people are coming so far. The guest list stays with the hosts.`
        : "No RSVPs yet. Be the first."}</p>`;
    }
    return `${parties.length ? `<div class="crew-strip">${voterChips(parties)}</div>` : ""}
      <p style="margin:${parties.length ? "12px" : "0"} 0 0;font-size:13px;color:var(--ink-2)">
        ${parties.length ? `<b>${people}</b> attending across ${parties.length} ${parties.length === 1 ? "party" : "parties"}${declined ? ` · ${declined} can't make it` : ""}` : "No RSVPs yet. Be the first."}
      </p>`;
  }
  function tzWarningCard() {
    const guess = tzForCity(TRIP.destination) || tzForCity((TRIP.stops || [])[0] && TRIP.stops[0].label);
    if (!guess || !TRIP.tz || guess === TRIP.tz) return "";
    // Only warn if the clocks actually differ right now.
    if (nowIn(guess) === nowIn(TRIP.tz)) return "";
    if (!isHost()) return "";
    return `<div class="card" style="margin-top:14px;border-color:var(--vermilion)">
      <h3>🕐 That clock looks off</h3>
      <p class="section-sub" style="margin:6px 0 12px">The trip's timezone is set to <b>${esc(TRIP.tz)}</b>, but ${esc(TRIP.destination || "your destination")} is on <b>${esc(guess)}</b>, where it's <b>${esc(nowIn(guess))}</b> right now.</p>
      <button class="btn primary" id="tzFixNow" style="width:100%">Fix it: use ${esc(guess)}</button>
      <div id="tzFixMsg" class="r-sub" style="margin-top:6px"></div>
    </div>`;
  }
  function latestAnnouncementCard() {
    const a = state.announcements[0];
    if (!a) return "";
    const who = byId(a.author);
    return `<div class="card" style="margin-top:14px;border-color:var(--amber)">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
        <span class="pill" style="background:var(--sakura);color:var(--vermilion-2)">📣 Latest update</span>
        <span class="r-sub" style="font-size:11px">${fmtWhen(a.created_at)}</span>
      </div>
      ${a.title ? `<h3 style="margin:0 0 4px">${esc(a.title)}</h3>` : ""}
      <div style="font-size:13.5px;line-height:1.55;white-space:pre-wrap">${esc(a.body)}</div>
      <div class="r-sub" style="margin-top:8px;font-size:11.5px">${who ? "from " + esc(who.name.split(" ")[0]) + " · " : ""}<span style="color:var(--ai-2);font-weight:800;cursor:pointer" data-go="announce">All updates ›</span></div>
    </div>`;
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
  /* Buzz the phones that have alerts on, then hand the rest to the share sheet
     so the nudge actually leaves the app instead of sitting on a clipboard. */
  async function nudgeMissing() {
    const say = (m) => { const el = $("#hostMsg2"); if (el) el.textContent = m; };
    const t = tally("wrsvp", "attend");
    const responded = new Set(Object.values(t).flat());
    const waiting = (TRIP.travelers || []).filter((tr) => !responded.has(tr.id));
    if (!waiting.length) { say("Everyone has answered."); return; }
    const L = TRIP.links || {};
    const link = `${location.origin + location.pathname}?t=${TRIP.code}`;
    const msg = `Quick nudge about ${TRIP.name}: we still need your RSVP${L.rsvp_deadline ? ` by ${L.rsvp_deadline}` : ""}. It takes a minute here: ${link}`;
    say("Nudging…");
    let buzzed = 0;
    try {
      const cfg = window.CARAVAN_CONFIG;
      const res = await fetch(`${cfg.url}/functions/v1/send-push`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + cfg.anonKey, "apikey": cfg.anonKey },
        body: JSON.stringify({ code: TRIP_CODE, title: "RSVP reminder", body: msg, author: state.me, silent: true }),
      });
      const data = await res.json().catch(() => ({}));
      buzzed = (data && data.sent) || 0;
    } catch (e) { /* push may not be deployed; the share sheet still works */ }
    const names = waiting.map((w) => w.name).join(", ");
    const buzzTxt = buzzed ? `Buzzed ${buzzed} phone${buzzed === 1 ? "" : "s"}. ` : "";
    if (navigator.share) {
      try {
        await navigator.share({ title: TRIP.name, text: `${msg}\n\nStill waiting on: ${names}` });
        say(`${buzzTxt}Nudge sent.`);
        return;
      } catch (e) { if (e && e.name === "AbortError") { say(buzzTxt || "Cancelled."); return; } }
    }
    navigator.clipboard?.writeText(`${names}\n\n${msg}`)
      .then(() => say(`${buzzTxt}Copied a nudge for ${waiting.length}. Paste it into your group chat.`))
      .catch(() => say(buzzTxt || "Couldn't copy on this device."));
  }
  function weddingHostPanelHTML() {
    if (!isHost()) return "";
    const t = tally("wrsvp", "attend");
    const responded = new Set(Object.values(t).flat());
    const waiting = (TRIP.travelers || []).filter((tr) => !responded.has(tr.id));
    const declined = (t["no"] || []).length;
    const yes = [];
    Object.entries(t).forEach(([choice, voters]) => {
      if (choice.startsWith("yes")) voters.forEach((v) => yes.push({ id: v, n: parseInt(choice.split(":")[1], 10) || 1 }));
    });
    const heads = yes.reduce((a, y) => a + y.n, 0);
    const meals = {}, diets = [];
    let named = 0;
    yes.forEach(({ id }) => partyOf(id).forEach((seat) => {
      if (seat.name) named++;
      if (seat.meal) meals[seat.meal] = (meals[seat.meal] || 0) + 1;
      if (seat.diet) diets.push(`${seat.name || "Guest"}: ${seat.diet}`);
    }));
    const stat = (n, label) => `<div class="count-box"><div class="num">${n}</div><div class="lbl">${label}</div></div>`;
    return `<div class="card" style="border-color:var(--gold-soft)">
      <h3>📋 Host view</h3>
      <div class="countdown" style="margin:10px 0 6px">
        ${stat(heads, "Attending")}${stat(declined, "Can't come")}${stat(waiting.length, "No reply")}${stat(yes.length, "Parties")}
      </div>
      ${waiting.length ? `<p class="section-sub" style="margin:8px 0 0"><b>Waiting on:</b> ${waiting.slice(0, 12).map((w) => esc(w.name.split(" ")[0])).join(", ")}${waiting.length > 12 ? ` and ${waiting.length - 12} more` : ""}</p>` : `<p class="section-sub" style="margin:8px 0 0">Everyone on the list has answered ✓</p>`}
      ${Object.keys(meals).length ? `<div class="check-cat" style="margin:16px 0 6px">Meal counts</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px">
          ${Object.entries(meals).map(([m, n]) => `<span class="when-chip">${esc(m)}: <b>${n}</b></span>`).join("")}
          ${named < heads ? `<span class="when-chip" style="color:var(--vermilion);border-color:var(--sakura-deep)">${heads - named} not chosen</span>` : ""}
        </div>` : ""}
      ${diets.length ? `<div class="check-cat" style="margin:16px 0 6px">Dietary notes</div>
        ${diets.map((d) => `<div class="r-sub" style="padding:2px 0">${esc(d)}</div>`).join("")}` : ""}
      <div class="btn-row" style="margin-top:14px">
        <button class="btn ghost" id="hostCopy" style="flex:1">Copy list for the caterer</button>
        ${waiting.length ? `<button class="btn ghost" id="hostNudge" style="flex:1">Nudge the ${waiting.length} missing</button>` : ""}
      </div>
      <div id="hostMsg2" class="r-sub" style="margin-top:8px"></div>
    </div>`;
  }
  function cateringList() {
    const t = tally("wrsvp", "attend");
    const lines = [`${TRIP.name} - guest list`, ""];
    Object.entries(t).forEach(([choice, voters]) => {
      if (!choice.startsWith("yes")) return;
      voters.forEach((v) => {
        const who = byId(v);
        const seats = partyOf(v);
        const n = parseInt(choice.split(":")[1], 10) || 1;
        lines.push(`${who ? who.name : "Guest"} (party of ${n})`);
        if (seats.length) seats.forEach((sx) => lines.push(`   - ${sx.name || "unnamed"}${sx.meal ? " | " + sx.meal : ""}${sx.diet ? " | " + sx.diet : ""}`));
        else lines.push("   - details not filled in");
      });
    });
    const no = (t["no"] || []).map((v) => (byId(v) || {}).name).filter(Boolean);
    if (no.length) { lines.push("", "Not attending:", ...no.map((n) => "   " + n)); }
    const responded = new Set(Object.values(t).flat());
    const waiting = (TRIP.travelers || []).filter((tr) => !responded.has(tr.id)).map((tr) => tr.name);
    if (waiting.length) { lines.push("", "No reply yet:", ...waiting.map((n) => "   " + n)); }
    return lines.join("\n");
  }
  /* ---- Phases ---------------------------------------------------------------
     A trip is used for a year and needs different things in each stretch of it.
     The same screen, weighted differently, rather than a tool that does not
     know what week it is.
     -------------------------------------------------------------------------- */
  function tripPhase() {
    if (!datesKnown()) return "planning";
    const out = daysUntilTrip();
    if (out > 0 && out <= 1) return "eve";
    if (out <= 0) {
      const end = new Date(TRIP.end_date + "T23:59:59");
      return new Date() <= end ? "live" : "after";
    }
    if (out > 180) return "early";
    if (out > 45) return "planning";
    return "final";
  }
  /* The next thing happening, and the one after it. */
  function upcoming() {
    const now = new Date();
    const iso = now.toISOString().slice(0, 10);
    const hhmm = now.toTimeString().slice(0, 5);
    const out = [];
    (state.days || []).slice().sort((a, b) => String(a.date).localeCompare(String(b.date))).forEach((d) => {
      if (d.date < iso) return;
      (d.items || []).forEach((i) => {
        if (d.date === iso && i.time && i.time < hhmm) return;
        out.push({ ...i, date: d.date, dayTitle: d.title, meetup: d.meetup });
      });
      if (!(d.items || []).length) out.push({ title: d.title, date: d.date, dayTitle: d.title, meetup: d.meetup, time: "" });
    });
    return out;
  }
  /* Live mode: during the trip nobody wants a planning tool. One thing, where
     it is, when it starts, what to wear. Everything else waits. */
  function liveCard() {
    const next = upcoming();
    if (!next.length) return `<div class="card" style="border-color:var(--ai)">
      <span class="pill any">Right now</span>
      <h3 style="margin:8px 0 4px">Nothing scheduled</h3>
      <div class="r-sub">Enjoy it. Anything anyone adds to the Plan shows up here.</div>
    </div>`;
    const n = next[0], rest = next.slice(1, 4);
    const f = fmtDate(n.date);
    const today = n.date === new Date().toISOString().slice(0, 10);
    const when = today ? (n.time ? `Today at ${esc(n.time)}` : "Today") : `${f.wd} ${f.mon} ${f.day}${n.time ? " at " + esc(n.time) : ""}`;
    const mapQ = n.where ? encodeURIComponent(`${n.where}, ${TRIP.destination || ""}`) : "";
    return `<div class="card live-now">
      <span class="pill any">Up next</span>
      <h3 style="margin:9px 0 2px;font-size:22px">${esc(n.title)}</h3>
      <div class="live-when" id="liveWhen" data-at="${esc(n.date)}T${esc(n.time || "00:00")}">${when}</div>
      ${n.where ? `<div class="live-row">📍 <span>${esc(n.where)}</span>
        <a class="tl-map" href="https://www.google.com/maps/search/?api=1&query=${mapQ}" target="_blank" rel="noopener">Directions ›</a></div>` : ""}
      ${n.dress ? `<div class="live-row">👗 <span>${esc(n.dress)}</span></div>` : ""}
      ${n.meetup ? `<div class="live-row">🤝 <span>${esc(n.meetup)}</span></div>` : ""}
      ${n.note ? `<div class="r-sub" style="margin-top:10px">${esc(n.note)}</div>` : ""}
      ${rest.length ? `<div class="live-rest">
        <div class="check-cat" style="margin:16px 0 8px">Then</div>
        ${rest.map((r) => {
          const rf = fmtDate(r.date);
          const sameDay = r.date === n.date;
          return `<div class="row" style="padding:6px 0">
            <span class="when-chip" style="min-width:64px;text-align:center">${esc(r.time || (sameDay ? "later" : `${rf.mon} ${rf.day}`))}</span>
            <div class="r-main"><div class="r-title" style="font-size:14px">${esc(r.title)}</div>
              ${r.where ? `<div class="r-sub">${esc(r.where)}</div>` : ""}</div>
          </div>`;
        }).join("")}` : ""}
      </div>
      <button class="btn ghost" data-go="itinerary" style="width:100%;margin-top:14px">See the whole plan</button>
    </div>`;
  }
  function tickLive() {
    const el = $("#liveWhen"); if (!el) return;
    const at = el.dataset.at; if (!at) return;
    const t = new Date(at.replace(" ", "T"));
    if (isNaN(t)) return;
    const diff = t - new Date();
    if (diff <= 0 || diff > 86400000) return;                 // only count the last day down
    const h = Math.floor(diff / 3600000), m = Math.floor((diff % 3600000) / 60000);
    el.textContent = h ? `Starts in ${h}h ${m}m` : `Starts in ${m} min`;
  }
  setInterval(() => { if (TRIP && $("#screen-home") && $("#screen-home").classList.contains("active")) tickLive(); }, 30000);
  /* After it is over, the app should say something rather than count upward. */
  function afterCard() {
    const days = nightsBetween(TRIP.start_date, TRIP.end_date);
    const shots = (state.photos || []).length;
    return `<div class="card" style="border-color:var(--gold-soft);background:linear-gradient(180deg,#fdfaf3,#fffdf8)">
      <h3>🎉 That's a wrap</h3>
      <p class="section-sub" style="margin:6px 0 12px">${esc(TRIP.name)} is done. ${days} night${days === 1 ? "" : "s"}${shots ? `, ${shots} photo${shots === 1 ? "" : "s"} in the album` : ""}.</p>
      <div class="btn-row">
        ${shots ? `<button class="btn primary" data-go="photos" style="flex:1">📸 The album</button>` : ""}
        <button class="btn ghost" data-go="budget" style="flex:1">💰 Settle up</button>
      </div>
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
  /* A trip with no dates and no stops is not broken, it is early. But it does
     need a next move, and a countdown to nothing is not it. So the card says
     what is missing and hands over the tool that settles it: a vote, because
     that is how a group actually picks a weekend. */
  function undecidedCard() {
    const noDates = !datesKnown();
    const noWhere = !(TRIP.stops || []).length && !TRIP.destination;
    if (!noDates && !noWhere) return "";
    const missing = noDates && noWhere ? "when or where" : noDates ? "when" : "where";
    const live = (state.decisions || []).filter((d) => d.title === "Where should we go?");
    const answered = anyAnsweredAvail().size;
    const votes = live.reduce((n, d) => n + Object.values(tallyMulti(d.id)).reduce((m, v) => m + v.length, 0), 0) + answered;
    const heads = (TRIP.travelers || []).length;
    const top = noDates ? bestWeeks(1)[0] : null;
    return `<div class="card" style="border-color:var(--gold-soft);background:linear-gradient(180deg,#fffaf0,#fdf4e4)">
      <h3>🗳️ First things first: ${missing}</h3>
      <p class="section-sub" style="margin:4px 0 12px">${
        top ? `<b>${weekLabel(top.id)}</b> is ahead so far, ${top.who.length} of ${heads || top.who.length} free. ` : ""}${
        votes ? `<b>${votes}</b> ${votes === 1 ? "answer is" : "answers are"} in.` : "Nobody has weighed in yet."} ${
        noDates ? "Open the months that could work and tick the weeks you're free." : "Add the places you'd actually go, then everyone votes."}</p>
      <div class="btn-row">
        <button class="btn primary" id="undecidedAsk" style="flex:2">${noDates ? "🗓️ Say when you're free" : "🗳️ Open the vote"}</button>
        <button class="btn ghost" data-go="settings" style="flex:1">Fill it in</button>
      </div>
      <div class="r-sub" id="undecidedMsg" style="margin-top:8px"></div>
    </div>`;
  }
  async function startUndecidedVote() {
    const msg = $("#undecidedMsg");
    // dates need no seeding: the Votes tab carries the availability picker
    if (datesKnown() && !(state.decisions || []).some((d) => d.title === "Where should we go?")) {
      if (msg) msg.textContent = "Starting it…";
      await seedUndecidedVotes({ code: TRIP_CODE, start_date: TRIP.start_date, end_date: TRIP.end_date, destination: "", stops: [] });
      await hydrate("decisions");
    }
    show("decisions");
  }

  /* Deciding where is the moment the app becomes useful, and the moment a
     group is most likely to lose momentum. So the screen names what that
     unlocks and hands over the next thing rather than going quiet. Shown until
     the plan has days on it, then it has done its job. */
  function justSettledCard() {
    if (!datesKnownPlace() || (state.days || []).length) return "";
    if (isWedding()) return "";
    const where = TRIP.destination || ((TRIP.stops || [])[0] || {}).label || "";
    if (!where) return "";
    const noStays = !state.stayOptions.some((o) => o.kind !== "block");
    return `<div class="card settled-card">
      <h3>📍 ${esc(where)} it is</h3>
      <p class="section-sub" style="margin:4px 0 12px">The plan is empty, which is the right time to fill it. ${
        datesKnown() ? "" : "Dates can land later, none of this waits on them. "}Pick one:</p>
      <div class="settled-next">
        <button class="settled-row" data-go="itinerary">
          <span class="si">✨</span><span><b>Let the AI draft it</b><br><span class="r-sub">A day by day plan for ${esc(where)}, plus a guide and the neighborhoods. Everything stays editable.</span></span>
        </button>
        <button class="settled-row" data-go="stays">
          <span class="si">🏨</span><span><b>${noStays ? "Put up somewhere to stay" : "Vote on where you sleep"}</b><br><span class="r-sub">${
            noStays ? "Everyone adds a couple of places, then the group votes." : "Places are in and waiting on votes."}</span></span>
        </button>
        <button class="settled-row" data-go="ideas">
          <span class="si">💡</span><span><b>Throw ideas in</b><br><span class="r-sub">The things people keep saying they want to do. Sort it out later.</span></span>
        </button>
      </div>
    </div>`;
  }

  function tickCountdown() {
    const box = $("#countdown"); if (!box || !datesKnown()) return;
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
  setInterval(() => { if (TRIP && $("#screen-home").classList.contains("active") && $("#countdown")) tickCountdown(); }, 1000);
  function renderClocks() {
    const box = $("#clocks"); if (!box) return;
    const homeTz = TRIP.home_tz || Intl.DateTimeFormat().resolvedOptions().timeZone;
    const fmt = (tz) => { try { return new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit", hour12: true }).format(new Date()); } catch { return "–"; } };
    box.innerHTML = `
      <div class="clock"><div class="place">${esc(TRIP.home_city ? TRIP.home_city.split(",")[0] : "Home")}</div><div class="time">${fmt(homeTz)}</div></div>
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
      ${state.days.length < 2 && isHost() ? `<div class="card">
        <h3>📋 Already have a schedule?</h3>
        <p class="section-sub" style="margin:4px 0 12px">However you have it: tee times, a text from the group, notes from an email, or a photo of the confirmation. The assistant reads it and turns it into days here.</p>
        <button class="btn ghost" data-go="assistant" style="width:100%;margin-bottom:8px">Paste a schedule</button>
        <button class="btn ghost" id="planPhoto" style="width:100%">📷 Upload a photo of it</button>
      </div>` : ""}
      ${state.days.length < 2 && isHost() ? `<div class="card ai-card">
        <h3>✨ Set up my ${isWedding() ? "wedding weekend" : "trip"} with AI</h3>
        <p class="section-sub" style="margin:4px 0 12px">Claude drafts the works for ${esc(TRIP.destination || "your destination")}: a full day-by-day ${isWedding() ? "schedule" : "itinerary"}, destination guide, neighborhood breakdowns${isWedding() ? "" : " for picking where to stay"}, and starter ${isWedding() ? "ideas" : "votes & ideas"} for the group. Everything stays editable.</p>
        <button class="btn primary" id="aiBuild" style="width:100%">✨ Set it up</button>
        <div id="aiStatus" class="r-sub" style="margin-top:8px"></div>
      </div>` : ""}
      ${placeListHTML()}
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
    // Photo lives with the assistant, so hop there and open the picker straight away.
    // The picker has to open inside this tap, so it goes first and the screen
    // change follows. A timer here loses the gesture and iOS ignores the click.
    const pp = $("#planPhoto"); if (pp) pp.addEventListener("click", () => { pickChatPhoto(true); show("assistant"); });
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
      st.textContent = "✨ Step 1/3: drafting your day-by-day itinerary… (~30s)";
      const plan = await callAI("plan");
      if (!plan.ok) { st.textContent = plan.error || "Generation failed. Is the edge function deployed?"; btn.disabled = false; btn.style.opacity = 1; return; }
      await hydrate("days");
      st.textContent = `✓ ${plan.days} days drafted. ✨ Step 2/3: guides, neighborhoods & starter votes… (~30s)`;
      const intel = await callAI("intel");
      await hydrate("all");
      st.textContent = `✓ Guides in. ✨ Step 3/3: recommended places to stay… (~20s)`;
      const stays = await callAI("stays");
      await hydrate("all");
      st.textContent = intel.ok
        ? `Done! ${plan.days} days, ${intel.guides} guide cards, ${intel.decisions} votes, ${intel.ideas} ideas${stays.ok ? `, ${stays.stays} stay picks` : ""}. Explore Stays, Guide, and Votes.`
        : `Itinerary done (${plan.days} days). Intel step: ${intel.error || "failed"}.`;
      renderItinerary();
    } catch (e) {
      st.textContent = "Couldn't reach the AI function. Check it's deployed (see README).";
      btn.disabled = false; btn.style.opacity = 1;
    }
  }
  /* Show a linked set of groups right under the event, so a tee time reads
     like a tee sheet instead of pointing somewhere else. */
  function groupsInline(setName) {
    const rows = state.groups.filter((g) => g.set_name === setName);
    if (!rows.length) return "";
    return `<div class="pairings">
      ${rows.map((g) => {
        const names = (g.members || []).map((id) => (byId(id) || {}).name).filter(Boolean).map((n) => n.split(" ")[0]);
        return `<div class="pair-row"><b>${esc(g.label)}</b> ${names.length ? esc(names.join(", ")) : "<span class=\"r-sub\">nobody yet</span>"}</div>`;
      }).join("")}
      <div class="tl-map" data-go="groups" style="cursor:pointer;margin-top:4px">Edit ${esc(setName)} ›</div>
    </div>`;
  }
  function renderDayList() {
    const list = $("#dayList"); if (!list) return;
    if (!state.days.length) { list.innerHTML = emptyState("🗓️", "The plan is empty", isHost() ? "Add your first day below, or let ✨ AI draft the whole thing in about a minute. Everything stays editable." : "The " + (isWedding() ? "hosts haven't" : "group hasn't") + " added days yet. Check back soon."); return; }
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
          ${it.where ? `<div class="tl-where">${it.type === "tee" ? "⛳️" : "📍"} ${esc(it.where)}</div>` : ""}
          ${it.dress ? `<div class="tl-dress">👔 ${esc(it.dress)}</div>` : ""}
          ${it.groupSet ? groupsInline(it.groupSet) : ""}
          ${it.note ? `<div class="tl-note">${esc(it.note)}</div>` : ""}
          <div class="rsvp">
            <button class="rsvp-btn ${meIn ? "on" : ""}" data-rsvp="${iid}">${meIn ? "✓ You're in" : "＋ I'm in"}</button>
            ${going.length ? `<span class="tally" style="margin:0">${voterChips(going)}</span>` : ""}
            <a class="tl-map" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent((it.where || it.title) + " " + (TRIP.destination || ""))}" target="_blank" rel="noopener">📍 Map</a>
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
          ${outfitLine(d)}
          ${commentBlock("day:" + d.id)}
          ${isHost() ? `<div class="expense-add" style="margin:10px 0 8px">
            <div style="display:flex;gap:8px">
              <input data-itime="${d.id}" type="time" style="flex:1" />
              <select data-itype="${d.id}" style="flex:1.2">${typeOrder().map((k) => `<option value="${k}">${TYPE[k].emoji} ${TYPE[k].label}</option>`).join("")}</select>
            </div>
            <input data-ititle="${d.id}" placeholder="${isWedding() ? "Add an event…" : (tripType() === "golf" ? "Add a round, e.g. Round 1" : "Add an activity…")}" />
            <input data-iwhere="${d.id}" data-suggest="place" autocomplete="off" placeholder="${isWedding() ? "Where? e.g. Hacienda del Mar, beach club" : (tripType() === "golf" ? "Course, e.g. Grayhawk (Raptor)" : "Where? (optional)")}" />
            ${setsOf().length ? `<select data-igroup="${d.id}">
              <option value="">${tripType() === "golf" ? "Pairings (optional)" : "Groups (optional)"}</option>
              ${setsOf().map((n) => `<option value="${esc(n)}">${esc(n)}</option>`).join("")}
            </select>` : ""}
            ${isWedding() ? `<input data-idress="${d.id}" placeholder="Dress code for this event (optional)" />` : ""}
            <div class="btn-row">
              <button class="btn primary" data-iadd="${d.id}" style="flex:2">＋ Add</button>
              <button class="btn danger" data-rmday="${d.id}" style="flex:1">Delete day</button>
            </div>
            <div class="r-sub" data-imsg="${d.id}" style="color:var(--vermilion)"></div>
          </div>` : ""}
        </div>
      </div>`;
    }).join("");
    bindComments(list);
    list.querySelectorAll(".day-head").forEach((h) => h.addEventListener("click", () => {
      const id = h.parentElement.dataset.date;
      if (openDays.has(id)) openDays.delete(id); else openDays.add(id);
      h.parentElement.classList.toggle("open");
    }));
    list.querySelectorAll("[data-rsvp]").forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); setVote("rsvp", b.dataset.rsvp, "in"); }));

    list.querySelectorAll("[data-rmitem]").forEach((b) => b.addEventListener("click", () => removeItem(b.dataset.rmitem)));
    list.querySelectorAll("[data-rmday]").forEach((b) => b.addEventListener("click", async () => {
      const row = state.days.find((x) => String(x.id) === String(b.dataset.rmday));
      if (!row) return;
      const n = (row.items || []).length;
      if (!confirm(`Delete this whole day${n ? ` and its ${n} event${n === 1 ? "" : "s"}` : ""}?`)) return;
      await deleteWithUndo("days", row, row.title || "Day",
        () => { state.days = state.days.filter((x) => String(x.id) !== String(row.id)); },
        (back) => { state.days.push(back); state.days.sort((a, c) => String(a.date).localeCompare(String(c.date))); });
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
    const say = (msg) => { const el = $(`[data-imsg="${dayId}"]`); if (el) el.textContent = msg; };
    const titleEl = $(`[data-ititle="${dayId}"]`);
    const whereEl = $(`[data-iwhere="${dayId}"]`), dressEl = $(`[data-idress="${dayId}"]`);
    const type = $(`[data-itype="${dayId}"]`).value;
    const where = whereEl ? whereEl.value.trim() : "";
    let title = titleEl.value.trim();
    // Filling in only the course, or only a place, is a reasonable thing to do.
    if (!title) title = where ? (type === "tee" ? "Tee time" : where) : "";
    if (!title) { say(type === "tee" ? "Add the course, or a name for the round." : "Give it a name first."); titleEl.focus(); return; }

    const item = {
      time: $(`[data-itime="${dayId}"]`).value, type, title, note: "",
      where, dress: dressEl ? dressEl.value.trim() : "",
      groupSet: ($(`[data-igroup="${dayId}"]`) || {}).value || "",
    };
    const prev = d.items || [];
    d.items = [...prev, item];
    say("");
    renderDayList();
    const ok = await Backend.update("days", dayId, { items: d.items });
    if (ok) {
      // A write that silently affects no rows looks identical to success,
      // so read the day back and make sure the event is really there.
      const fresh = await Backend.list("days", TRIP_CODE, "date");
      const saved = (fresh || []).find((x) => x.id === dayId);
      if (saved && (saved.items || []).length < d.items.length) {
        d.items = prev; renderDayList();
        const el = $(`[data-imsg="${dayId}"]`);
        if (el) el.textContent = "The server did not save that. Reload the app and try once more.";
        return;
      }
      if (saved) { d.items = saved.items || d.items; }
    }
    if (!ok) {
      d.items = prev;
      renderDayList();
      const el = $(`[data-imsg="${dayId}"]`);
      if (el) el.textContent = "Couldn't save that. Check your connection and try again.";
    }
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
    const me = byId(state.me);
    const photoRow = `<input id="crewPhoto" type="file" accept="image/*" style="display:none" />
      <div id="crewPhotoStatus" class="r-sub" style="margin:0 4px 12px"></div>`;

    // A wedding guest sees the hosts and a headcount, never the full list.
    if (isWedding() && !isHost()) {
      const t = tally("wrsvp", "attend");
      let people = 0;
      Object.entries(t).forEach(([choice, voters]) => {
        if (choice.startsWith("yes")) people += voters.length * (parseInt(choice.split(":")[1], 10) || 1);
      });
      const hosts = (TRIP.travelers || []).filter((x) => (TRIP.hosts || []).includes(x.id));
      s.innerHTML = `
        <div class="section-title">Who's who</div>
        <div class="section-sub">The people putting this on, and how the headcount is shaping up.</div>
        ${hosts.length ? `<div class="pair-card">
          <div class="pair-name">Your hosts</div>
          ${hosts.map((h) => `<div class="person">${avatarHTML(h, 52, 17)}
            <div class="p-info"><div class="p-name">${esc(h.name)}</div></div></div>`).join("")}
        </div>` : ""}
        <div class="card">
          <h3>🥂 ${people ? people + " coming so far" : "No RSVPs yet"}</h3>
          <p class="section-sub" style="margin:4px 0 0">The full guest list stays with the hosts.</p>
        </div>
        ${me ? `<div class="card">
          <h3>You</h3>
          <div class="person" style="border:none;padding-top:6px">${avatarHTML(me, 52, 17)}
            <div class="p-info"><div class="p-name">${esc(me.name)}<span class="badge-you">YOU</span></div>
              <div class="p-sub"><label class="tl-map" for="crewPhoto" style="cursor:pointer">📷 ${me.photo ? "Change photo" : "Add your photo"}</label></div></div>
          </div>
        </div>` : `<div class="card"><h3>Tell us who you are</h3>
          <p class="section-sub" style="margin:4px 0 12px">So your RSVP is tagged to you.</p>
          <button class="btn primary" id="crewWho" style="width:100%">That's me</button></div>`}
        ${photoRow}`;
      const cw = $("#crewWho"); if (cw) cw.addEventListener("click", openWho);
      bindCrewPhoto();
      return;
    }

    const wed = isWedding();
    const rsvp = tally("wrsvp", "attend");
    const rsvpFor = (id) => {
      const hit = Object.entries(rsvp).find(([, voters]) => voters.includes(id));
      if (!hit) return "";
      if (hit[0] === "no") return "Can't make it";
      const n = parseInt(hit[0].split(":")[1], 10) || 1;
      return `Coming, party of ${n}`;
    };
    s.innerHTML = `
      <div class="section-title">${wed ? "Guest list" : "The crew"}</div>
      <div class="section-sub">${(TRIP.travelers || []).length} ${wed ? "on the list. Only hosts see this." : 'travelers. Tap "Who are you?" up top to tag yourself, then add a photo.'}</div>
      <div class="pair-card">
        ${(TRIP.travelers || []).map((t) => `<div class="person">
          ${avatarHTML(t, 52, 17)}
          <div class="p-info"><div class="p-name">${esc(t.name)}${state.me === t.id ? '<span class="badge-you">YOU</span>' : ""}${wed && (TRIP.hosts || []).includes(t.id) ? ' <span class="pill any">Host</span>' : ""}</div>
            ${wed && rsvpFor(t.id) ? `<div class="p-sub">${esc(rsvpFor(t.id))}</div>` : ""}
            ${wed && isHost() ? `<div class="p-sub" style="margin-top:4px">Invitation covers
              <select data-allow="${t.id}" style="padding:3px 6px;border:1px solid var(--line);border-radius:6px;font-size:12px">
                ${[1, 2, 3, 4, 5, 6].map((n) => `<option value="${n}" ${allowanceFor(t.id) === n ? "selected" : ""}>${n}</option>`).join("")}
              </select></div>` : ""}
            ${state.me === t.id ? `<div class="p-sub"><label class="tl-map" for="crewPhoto" style="cursor:pointer">📷 ${t.photo ? "Change photo" : "Add your photo"}</label></div>` : ""}</div>
        </div>`).join("")}
      </div>
      ${photoRow}
      <div class="card">
        <h3>📍 Invite someone</h3>
        <p class="section-sub" style="margin:4px 0 0">Share the code <b>${esc(TRIP.code)}</b> or copy the link from Home.${wed ? " Guests just type their name when they open it." : " New joiners pick their name from this list."}</p>
      </div>`;
    s.querySelectorAll("[data-allow]").forEach((sel) => sel.addEventListener("change", async () => {
      const t = (TRIP.travelers || []).find((x) => x.id === sel.dataset.allow);
      if (!t) return;
      t.allow = parseInt(sel.value, 10) || 2;
      await Backend.updateTrip(TRIP_CODE, { travelers: TRIP.travelers });
    }));
    bindCrewPhoto();
  }
  function bindCrewPhoto() {
    const cp = $("#crewPhoto");
    if (cp) cp.addEventListener("change", async () => {
      const file = cp.files[0]; if (!file || !state.me) return;
      $("#crewPhotoStatus").textContent = "Uploading\u2026";
      try {
        const blob = await squarePhoto(file, 400);
        const up = await Backend.uploadFile(TRIP_CODE, new File([blob], "avatar.jpg", { type: "image/jpeg" }));
        if (!up) { $("#crewPhotoStatus").textContent = "Upload failed. Try again."; return; }
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
     MAP - everything on the trip that has a location, in one picture.
     Places are geocoded once through OpenStreetMap and cached on the trip,
     so the lookup does not repeat for anyone else.
     ====================================================================== */
  let mapObj = null, mapLayer = null;
  function mapPlaces() {
    const out = [];
    const push = (name, label, kind) => {
      if (!name) return;
      const key = name.trim();
      if (!key || out.some((p) => p.name.toLowerCase() === key.toLowerCase())) return;
      out.push({ name: key, label, kind });
    };
    const L = TRIP.links || {};
    if (L.venue_name) push(L.venue_name, "The venue", "venue");
    state.stayOptions.forEach((o) => { if (o.booked || o.kind === "block") push(o.name, o.kind === "block" ? "Room block" : "Where we sleep", "stay"); });
    state.days.forEach((d) => (d.items || []).forEach((i) => {
      if (i.where) push(i.where, `${fmtDate(d.date).mon} ${fmtDate(d.date).day} · ${i.title}`, "event");
    }));
    return out;
  }
  const geoCache = () => (TRIP.geo && typeof TRIP.geo === "object") ? TRIP.geo : {};
  function renderMap() {
    const s = $("#screen-map");
    const places = mapPlaces();
    const cache = geoCache();
    const missing = places.filter((p) => !cache[p.name.toLowerCase()]);
    s.innerHTML = `
      <div class="section-title">Map</div>
      <div class="section-sub">${places.length
        ? "Everywhere this trip touches. Add a location to an event and it lands here."
        : "Nothing has a location yet."}</div>
      ${places.length ? `<div id="map"></div>
        <div class="map-legend">
          <span><i class="dot" style="background:var(--vermilion)"></i> Events</span>
          <span><i class="dot" style="background:var(--matcha)"></i> Where we sleep</span>
          ${isWedding() ? `<span><i class="dot" style="background:var(--gold)"></i> Venue</span>` : ""}
        </div>
        ${missing.length ? `<div class="card" style="margin-top:14px">
          <h3>📍 ${missing.length} place${missing.length === 1 ? "" : "s"} to look up</h3>
          <p class="section-sub" style="margin:4px 0 12px">Find them on the map once and everyone gets the pins.</p>
          <button class="btn primary" id="geoRun" style="width:100%">Find them</button>
          <div id="geoMsg" class="r-sub" style="margin-top:8px"></div>
        </div>` : ""}
        <div class="card">
          <h3>Places</h3>
          ${places.map((p) => `<div class="row">
            <div class="r-main"><div class="r-title">${esc(p.name)}</div><div class="r-sub">${esc(p.label)}</div></div>
            <a class="tl-map" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.name + " " + (TRIP.destination || ""))}" target="_blank" rel="noopener">Open</a>
          </div>`).join("")}
        </div>`
        : emptyState("🗺️", "Nothing to map yet", "Give an event a location in the Plan tab, or mark where you are staying, and it will show up here.")}`;
    if (places.length) { setTimeout(drawMap, 60); }
    const gr = $("#geoRun"); if (gr) gr.addEventListener("click", () => geocodeMissing(missing));
  }
  function drawMap() {
    if (!window.L || !$("#map")) return;
    const cache = geoCache();
    const pts = mapPlaces().map((p) => ({ ...p, ll: cache[p.name.toLowerCase()] })).filter((p) => p.ll);
    if (!mapObj) {
      mapObj = L.map("map", { scrollWheelZoom: false });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap", maxZoom: 18,
      }).addTo(mapObj);
    }
    if (mapLayer) mapLayer.remove();
    mapLayer = L.layerGroup().addTo(mapObj);
    if (!pts.length) { mapObj.setView([20, 0], 2); return; }
    const colors = { event: "#e2593a", stay: "#4e7d5b", venue: "#b28a34" };
    pts.forEach((p) => {
      L.circleMarker([p.ll.lat, p.ll.lng], {
        radius: 9, color: "#fff", weight: 2, fillColor: colors[p.kind] || "#e2593a", fillOpacity: 1,
      }).addTo(mapLayer).bindPopup(`<div class="pin-pop"><b>${esc(p.name)}</b><div class="pp-note">${esc(p.label)}</div></div>`);
    });
    mapObj.fitBounds(pts.map((p) => [p.ll.lat, p.ll.lng]), { padding: [40, 40], maxZoom: 14 });
  }
  async function geocodeMissing(missing) {
    const btn = $("#geoRun"), msg = $("#geoMsg");
    if (btn) { btn.disabled = true; btn.style.opacity = .6; }
    const cache = { ...geoCache() };
    let found = 0;
    for (let i = 0; i < missing.length; i++) {
      const p = missing[i];
      if (msg) msg.textContent = `Looking up ${i + 1} of ${missing.length}…`;
      try {
        const q = encodeURIComponent(p.name + ", " + (TRIP.destination || ""));
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${q}`);
        const data = await res.json();
        if (data && data[0]) { cache[p.name.toLowerCase()] = { lat: +data[0].lat, lng: +data[0].lon }; found++; }
      } catch (e) { console.warn("geocode", e); }
      await new Promise((r) => setTimeout(r, 1100)); // be polite to a free service
    }
    if (found) {
      TRIP.geo = cache;
      await Backend.updateTrip(TRIP_CODE, { geo: cache });
    }
    if (msg) msg.textContent = found ? `Found ${found}. Pins are shared with the group.` : "Couldn't find those. Try a more specific name, like adding the city.";
    renderMap();
  }

  /* =========================================================================
     GROUPS - split the crew into foursomes, cars, bedrooms, shuttle runs.
     One idea that covers golf pairings, ski ability groups, wedding
     shuttles and who sleeps in which room of the house.
     ====================================================================== */
  let groupPick = null; // {set, id} waiting for a person to be tapped
  function setsOf() {
    const names = [];
    state.groups.forEach((g) => { if (!names.includes(g.set_name)) names.push(g.set_name); });
    return names;
  }
  function renderGroups() {
    const s = $("#screen-groups");
    const sets = setsOf();
    const people = TRIP.travelers || [];
    s.innerHTML = `
      <div class="section-title">Groups</div>
      <div class="section-sub">${isWedding()
        ? "Shuttle runs, tables, whatever needs splitting up. Everyone can see where they are."
        : "Foursomes, cars, bedrooms, teams. Make a set, then tap a group and tap who goes in it."}</div>

      ${sets.map((setName) => {
        const rows = state.groups.filter((g) => g.set_name === setName);
        const assigned = new Set(rows.flatMap((g) => g.members || []));
        const spare = people.filter((p) => !assigned.has(p.id));
        return `<div style="margin-bottom:26px">
          <div style="display:flex;align-items:center;gap:8px;margin:0 2px 10px">
            <span class="pill s0">${esc(setName)}</span>
            <span class="r-sub" style="font-size:11.5px">${assigned.size}/${people.length} placed</span>
            <span style="flex:1"></span>
            <span class="tl-map" style="color:var(--vermilion);cursor:pointer" data-setdel="${esc(setName)}">Delete set</span>
          </div>
          ${rows.map((g) => {
            const picking = groupPick && groupPick.id === g.id;
            return `<div class="card" style="${picking ? "border-color:var(--ai)" : ""}">
              <div style="display:flex;align-items:center;gap:8px">
                <h3 style="margin:0;flex:1">${esc(g.label)}</h3>
                <span class="r-sub" style="font-size:11.5px">${(g.members || []).length}</span>
              </div>
              ${g.note ? `<div class="r-sub" style="margin-top:2px">${esc(g.note)}</div>` : ""}
              <div style="display:flex;flex-wrap:wrap;gap:7px;margin-top:10px">
                ${(g.members || []).map((id) => { const t = byId(id); return t
                  ? `<span class="split-chip" data-gremove="${g.id}:${id}">${avatarHTML(t, 24, 9)}${esc(t.name.split(" ")[0])} ✕</span>` : ""; }).join("")
                  || `<span class="r-sub">Nobody yet.</span>`}
              </div>
              <button class="btn ghost" data-gpick="${g.id}" style="width:100%;margin-top:12px">${picking ? "Done adding" : "＋ Add people"}</button>
              ${picking ? `<div style="display:flex;flex-wrap:wrap;gap:7px;margin-top:10px">
                ${spare.length ? spare.map((p) => `<span class="split-chip" data-gadd="${g.id}:${p.id}">${avatarHTML(p, 24, 9)}${esc(p.name.split(" ")[0])}</span>`).join("")
                              : `<span class="r-sub">Everyone is placed.</span>`}
              </div>` : ""}
            </div>`;
          }).join("")}
          <div class="btn-row">
            <button class="btn ghost" data-gaddgroup="${esc(setName)}" style="flex:1">＋ Add a group</button>
            <button class="btn ghost" data-gshuffle="${esc(setName)}" style="flex:1">🎲 Shuffle everyone</button>
          </div>
        </div>`;
      }).join("")}

      ${!sets.length ? emptyState("👥", "No groups yet", isWedding()
        ? "Split guests into shuttle runs or tables, and everyone can see which one they are in."
        : "Split the crew into foursomes, cars, bedrooms or teams. Pick a starting point below.") : ""}

      <div class="card">
        <h3>New set</h3>
        <p class="section-sub" style="margin:2px 0 10px">${presetsForTrip().length ? "Common ones for this kind of trip:" : ""}</p>
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px">
          ${presetsForTrip().map((pz) => `<button class="chip" data-gpreset="${esc(pz.name)}|${pz.size}|${esc(pz.note || "")}">${esc(pz.name)}</button>`).join("")}
        </div>
        <div class="expense-add">
          <input id="gName" placeholder="Or name your own, e.g. Saturday foursomes" />
          <button class="btn primary" id="gCreate">Create set</button>
        </div>
        <div id="gMsg" class="r-sub" style="margin-top:6px"></div>
      </div>`;

    s.querySelectorAll("[data-gpick]").forEach((b) => b.addEventListener("click", () => {
      groupPick = groupPick && groupPick.id === b.dataset.gpick ? null : { id: b.dataset.gpick };
      renderGroups();
    }));
    s.querySelectorAll("[data-gadd]").forEach((b) => b.addEventListener("click", async () => {
      const [gid, pid] = b.dataset.gadd.split(":");
      const g = state.groups.find((x) => x.id === gid); if (!g) return;
      g.members = [...(g.members || []), pid];
      renderGroups();
      await Backend.update("groups", gid, { members: g.members });
    }));
    s.querySelectorAll("[data-gremove]").forEach((b) => b.addEventListener("click", async () => {
      const [gid, pid] = b.dataset.gremove.split(":");
      const g = state.groups.find((x) => x.id === gid); if (!g) return;
      g.members = (g.members || []).filter((m) => m !== pid);
      renderGroups();
      await Backend.update("groups", gid, { members: g.members });
    }));
    s.querySelectorAll("[data-gaddgroup]").forEach((b) => b.addEventListener("click", () => addGroupTo(b.dataset.gaddgroup)));
    s.querySelectorAll("[data-gshuffle]").forEach((b) => b.addEventListener("click", () => shuffleSet(b.dataset.gshuffle)));
    s.querySelectorAll("[data-setdel]").forEach((b) => b.addEventListener("click", async () => {
      const setName = b.dataset.setdel;
      if (!confirm(`Delete "${setName}" and its groups?`)) return;
      const doomed = state.groups.filter((g) => g.set_name === setName);
      state.groups = state.groups.filter((g) => g.set_name !== setName);
      renderGroups();
      for (const g of doomed) await Backend.remove("groups", g.id);
    }));
    s.querySelectorAll("[data-gpreset]").forEach((b) => b.addEventListener("click", () => {
      const [name, size, note] = b.dataset.gpreset.split("|");
      createSet(name, parseInt(size, 10) || 4, note);
    }));
    $("#gCreate").addEventListener("click", () => {
      const name = $("#gName").value.trim();
      if (!name) { $("#gMsg").textContent = "Give the set a name."; return; }
      createSet(name, 4, "");
    });
  }
  const LETTERS = "ABCDEFGHIJKL";
  async function createSet(name, size, note) {
    if (setsOf().includes(name)) { const el = $("#gMsg"); if (el) el.textContent = "There's already a set with that name."; return; }
    const people = (TRIP.travelers || []).length || size;
    const count = Math.max(1, Math.ceil(people / (size || 4)));
    const rows = [];
    for (let i = 0; i < count; i++) {
      const row = await Backend.insert("groups", {
        trip: TRIP_CODE, set_name: name, label: `Group ${LETTERS[i] || i + 1}`,
        members: [], note: i === 0 ? (note || "") : "", sort: i,
      });
      if (row) rows.push(row);
    }
    if (!rows.length) { const el = $("#gMsg"); if (el) el.textContent = "Couldn't create it. Has the groups table been added in Supabase?"; return; }
    state.groups.push(...rows);
    renderGroups();
  }
  async function addGroupTo(setName) {
    const rows = state.groups.filter((g) => g.set_name === setName);
    const row = await Backend.insert("groups", {
      trip: TRIP_CODE, set_name: setName, label: `Group ${LETTERS[rows.length] || rows.length + 1}`,
      members: [], note: "", sort: rows.length,
    });
    if (row) { state.groups.push(row); renderGroups(); }
  }
  async function shuffleSet(setName) {
    const rows = state.groups.filter((g) => g.set_name === setName);
    if (!rows.length) return;
    const people = (TRIP.travelers || []).map((t) => t.id);
    for (let i = people.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [people[i], people[j]] = [people[j], people[i]];
    }
    rows.forEach((g) => (g.members = []));
    people.forEach((id, i) => rows[i % rows.length].members.push(id));
    renderGroups();
    for (const g of rows) await Backend.update("groups", g.id, { members: g.members });
  }

  /* =========================================================================
     COMMENTS - discussion attached to the thing being discussed, so the
     group chat does not have to stay alive alongside the app.
     ====================================================================== */
  const openThreads = new Set();
  const commentsFor = (topic) => state.comments.filter((c) => c.topic === topic);
  function commentBlock(topic) {
    const list = commentsFor(topic);
    const open = openThreads.has(topic);
    if (!open) {
      return `<div class="thread-toggle" data-thread="${topic}">${list.length
        ? `💬 ${list.length} comment${list.length === 1 ? "" : "s"}`
        : "💬 Add a comment"}</div>`;
    }
    return `<div class="thread">
      ${list.map((c) => {
        const who = byId(c.author);
        return `<div class="cmt">
          ${who ? avatarHTML(who, 26, 9) : `<span class="avatar" style="width:26px;height:26px;font-size:9px;background:var(--ink-3)">?</span>`}
          <div class="cmt-main">
            <div class="cmt-head">${who ? esc(who.name.split(" ")[0]) : "Someone"} <span>${fmtWhen(c.created_at)}</span></div>
            <div class="cmt-body">${esc(c.body)}</div>
          </div>
          ${c.author === state.me ? `<span class="cmt-del" data-cmtdel="${c.id}">✕</span>` : ""}
        </div>`;
      }).join("")}
      <div class="cmt-add">
        <input data-cmtinput="${topic}" placeholder="Say something…" />
        <button class="btn primary" data-cmtsend="${topic}">Post</button>
      </div>
      <div class="thread-toggle" data-thread="${topic}" style="margin-top:6px">Hide</div>
    </div>`;
  }
  function bindComments(root) {
    root.querySelectorAll("[data-thread]").forEach((b) => b.addEventListener("click", () => {
      const t = b.dataset.thread;
      if (openThreads.has(t)) openThreads.delete(t); else openThreads.add(t);
      renderCurrent();
    }));
    root.querySelectorAll("[data-cmtsend]").forEach((b) => b.addEventListener("click", () => postComment(b.dataset.cmtsend)));
    root.querySelectorAll("[data-cmtinput]").forEach((i) => i.addEventListener("keydown", (e) => {
      if (e.key === "Enter") postComment(i.dataset.cmtinput);
    }));
    root.querySelectorAll("[data-cmtdel]").forEach((b) => b.addEventListener("click", async () => {
      state.comments = state.comments.filter((c) => c.id !== b.dataset.cmtdel);
      renderCurrent();
      await Backend.remove("comments", b.dataset.cmtdel);
    }));
  }
  async function postComment(topic) {
    if (!state.me) { openWho(); return; }
    const input = $(`[data-cmtinput="${topic}"]`); if (!input) return;
    const body = input.value.trim(); if (!body) return;
    input.value = "";
    const row = await Backend.insert("comments", { trip: TRIP_CODE, topic, body: body.slice(0, 600), author: state.me });
    if (row) { state.comments.push(row); renderCurrent(); }
  }

  /* The one or two things each kind of trip has to lock in early. */
  const BOOKING_BY_TYPE = {
    golf:     [{ id: "tee", by: 90, label: "Lock in tee times", note: "Prime weekend slots at good courses go months out, and a group of eight or more needs consecutive times." },
               { id: "clubs", by: 21, label: "Clubs: shipping or rentals", note: "Shipping takes about a week each way. Rentals should be reserved, not assumed." }],
    ski:      [{ id: "lift", by: 75, label: "Lift tickets and passes", note: "Window prices are the worst prices. Multi-day tickets bought ahead save real money." },
               { id: "rentals", by: 30, label: "Ski or board rentals", note: "Reserve sizes ahead, especially over a holiday week, and ask about slopeside pickup." },
               { id: "lessons", by: 30, label: "Lessons, if anyone needs them", note: "Instructors book out first on weekends." }],
    beach:    [{ id: "bigticket", by: 60, label: "Boat day or excursions", note: "Charters and catamarans for a group book up, especially anything at sunset." }],
    city:     [{ id: "bigticket", by: 75, label: "Tickets for the big things", note: "Headline museums, shows and observation decks. If it has a queue at home, it has one there." }],
    bachelor: [{ id: "tables", by: 45, label: "Tables, clubs and the big night", note: "Venues want a deposit and a headcount, and good nights go fast." },
               { id: "activity", by: 45, label: "The daytime activity", note: "Whatever the group thing is, it needs a booking and a headcount." }],
    reunion:  [{ id: "bigticket", by: 60, label: "Anything the whole family does together", note: "Large tables and group activities need notice. Ask about kid and senior pricing." }],
    outdoors: [{ id: "permits", by: 120, label: "Permits and campsites", note: "Popular trails and sites release on a schedule and sell out in minutes. Find the release date now." },
               { id: "gear", by: 30, label: "Gear checks and rentals", note: "Confirm who owns what before anyone buys a second tent." }],
    general:  [{ id: "bigticket", by: 75, label: "Anything that sells out", note: "Headline tours, tickets and tastings. If it has a queue at home, it has one there." }],
  };

  /* A trip can exist before its dates do. Everything that counts down, sorts by
     date or nags about a deadline has to ask this first. */
  const datesKnown = () => !!(TRIP && TRIP.start_date && TRIP.end_date);

  /* =========================================================================
     BOOKING TIMELINE - what to lock in, and when, built from this trip's dates
     ====================================================================== */
  function daysUntilTrip() {
    if (!datesKnown()) return Infinity;
    const start = new Date(TRIP.start_date + "T00:00:00");
    return Math.ceil((start - new Date()) / 86400000);
  }
  function dateMinusDays(days) {
    if (!datesKnown()) return "";
    const d = new Date(TRIP.start_date + "T00:00:00");
    d.setDate(d.getDate() - days);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  function bookingItems() {
    const L = TRIP.links || {};
    const wed = isWedding();
    const dest = TRIP.destination || "the destination";
    // Hosts and guests are running two different races on the same calendar.
    const list = wed && isHost() ? [
      { id: "hvenue",   by: 300, label: "Lock the venue and the date", note: "Everything else hangs off this. Get the contract signed and the deposit down." },
      { id: "hblock",   by: 240, label: "Hold the room block", note: `Hotels want a headcount early and release unsold rooms later.${L.deadline ? ` Yours releases ${L.deadline}.` : ""}`, hard: L.deadline },
      { id: "hsave",    by: 210, label: "Send save the dates", note: "People book flights around this. The trip code and link are on your Home screen." },
      { id: "hvendors", by: 180, label: "Book the vendors who only do one wedding a day", note: "Photographer, band or DJ, and whoever is feeding everyone. Put them in Day of as you sign them." },
      { id: "hinvite",  by: 120, label: "Send the invitations", note: `Import the guest list in Settings, then share the link.${L.rsvp_deadline ? ` Ask for answers by ${L.rsvp_deadline}.` : ""}` },
      { id: "hchase",   by: 60,  label: "Chase the people who have not replied", note: "There are always some. The Host view has a nudge button that opens your share sheet." },
      { id: "hmeals",   by: 45,  label: "Final headcount and meal counts to catering", note: "Copy the caterer list from the Host view. It totals the meals and lists every dietary note." },
      { id: "hseating", by: 30,  label: "Build the seating chart", note: "Tables come straight from the yeses in the Seating tab, plus-ones included." },
      { id: "hrun",     by: 21,  label: "Run of show to the coordinator", note: "Build it in Day of and copy it out as text. Vendors want it about three weeks ahead." },
      { id: "hpay",     by: 14,  label: "Final payments and tips", note: "Sort the envelopes now so nobody is at an ATM on the day." },
      { id: "hbags",    by: 10,  label: "Welcome bags, signage, place cards", note: "The last of the physical stuff. Anything printed needs the final seating chart." },
      { id: "hshuttle", by: 7,   label: "Confirm transport against arrivals", note: "The Flights tab groups everyone into arrival windows, so shuttle times write themselves." },
    ] : wed ? [
      { id: "rsvp",     by: 90, label: "RSVP", note: `Tell the hosts if you're coming and how many are in your party.${L.rsvp_deadline ? ` They asked for answers by ${L.rsvp_deadline}.` : ""}`, hard: L.rsvp_deadline },
      { id: "rooms",    by: 75, label: "Book your room", note: `Group rates are held for a limited time, then the block releases.${L.deadline ? ` Book by ${L.deadline}.` : ""}`, hard: L.deadline },
      { id: "flights",  by: 90, label: "Book flights", note: `Fares to ${dest} climb as the date gets close, and everyone booking at once makes it worse.` },
      { id: "outfits",  by: 30, label: "Sort out what you're wearing", note: "Check the dress code on each event in the Plan tab. Alterations take a couple of weeks." },
      { id: "gift",     by: 21, label: "Gift or registry", note: "Easier now than in the airport. Shipping to the couple beats carrying it." },
      { id: "docs",     by: 30, label: "Passport and any visa", note: "Passports should be valid six months past your return date." },
      { id: "transfer", by: 10, label: "Airport transfer", note: "Check the Flights tab for the shuttle windows, or arrange a ride." },
      { id: "checkin",  by: 1,  label: "Check in for your flight", note: "24 hours before. Grab a seat while there are still good ones." },
    ] : [
      { id: "flights",  by: 120, label: "Book flights", note: `Fares to ${dest} are usually best two to four months out, and a group booking together needs the seats.` },
      { id: "lodging",  by: 110, label: "Lock in where you sleep", note: "The good places for a group go first. Settle the vote in Stays, then book." },
      ...(BOOKING_BY_TYPE[tripType()] || BOOKING_BY_TYPE.general),
      { id: "transport",by: 60,  label: "Trains, rail passes or a car", note: "Cheaper in advance almost everywhere, and it settles how you move between stops." },
      { id: "docs",     by: 60,  label: "Passports and visas", note: "Passports should be valid six months past your return date. Check if anyone needs a visa." },
      { id: "food",     by: 30,  label: "The restaurants worth planning", note: "Anywhere notable takes bookings about a month out. Pick two or three, not every night." },
      { id: "transfer", by: 14,  label: "Airport transfers", note: "Sort out how you get from the airport with bags, especially if you land late." },
      { id: "money",    by: 7,   label: "Money and data", note: `Tell your bank you're travelling, and sort an eSIM if ${dest} needs one.` },
      { id: "checkin",  by: 1,   label: "Check in and pack", note: "Check in 24 hours ahead. The Packing tab has the list." },
    ];
    const out = daysUntilTrip();
    // Your own items sit alongside the generated ones, and anything that does
    // not apply to this trip can be hidden rather than argued with.
    const L2 = TRIP.links || {};
    const hidden = new Set(L2.booking_hidden || []);
    const extra = (L2.booking_extra || []).map((e) => ({
      id: e.id, by: Number(e.by) || 30, label: e.label, note: e.note || "", hard: e.hard || "", mine: true,
    }));
    return list.concat(extra)
      .filter((i) => !hidden.has(i.id))
      .map((i) => ({
        ...i,
        // no dates means no deadline to print, and no honest way to rank urgency
        due: i.hard || (datesKnown() ? `by ${dateMinusDays(i.by)}` : ""),
        bucket: !datesKnown() ? "later" : out <= i.by ? "now" : (out <= i.by + 45 ? "soon" : "later"),
      }))
      .sort((a, b) => b.by - a.by);
  }
  function renderBooking() {
    const s = $("#screen-booking");
    const items = bookingItems();
    const doneOf = (id) => tally("booking", id).done || [];
    const done = items.filter((i) => doneOf(i.id).length).length;
    const out = daysUntilTrip();
    const buckets = [
      { key: "now",   title: "Do this now", sub: "Due, or close enough that waiting costs money." },
      { key: "soon",  title: "Coming up",   sub: "Get it on the radar. Not urgent yet." },
      { key: "later", title: datesKnown() ? "Later" : "Everything",
        sub: datesKnown() ? "Too early to bother. It will move up on its own."
                          : "Once the dates are in, these sort themselves by what is most urgent." },
    ];
    s.innerHTML = `
      <div class="section-title">Booking timeline</div>
      <div class="section-sub">${!datesKnown()
        ? `No dates yet, so nothing here has a deadline. <b data-go="settings" style="cursor:pointer;text-decoration:underline">Set them</b> and the whole list starts counting itself.`
        : `${out > 0 ? `${out} day${out === 1 ? "" : "s"} out.` : "Trip time."} Things move up the list as the date gets closer.`} Tap ✓ when one is handled and the whole group sees it. ${done}/${items.length} done.</div>
      <div class="progress"><i style="width:${Math.round((done / items.length) * 100)}%"></i></div>
      ${buckets.map((bk) => {
        const rows = items.filter((i) => i.bucket === bk.key);
        if (!rows.length) return "";
        return `<div style="margin-bottom:22px">
          <div class="check-cat" style="margin:18px 2px 2px">${bk.title}</div>
          <div class="section-sub" style="margin:4px 2px 12px">${bk.sub}</div>
          ${rows.map((i) => {
            const who = doneOf(i.id);
            const isDone = who.length > 0;
            return `<div class="card" style="${isDone ? "opacity:.7" : ""}">
              <div style="display:flex;align-items:flex-start;gap:12px">
                <button class="book-check ${isDone ? "on" : ""}" data-book="${i.id}" aria-label="Mark done">${isDone ? "✓" : ""}</button>
                <div style="flex:1;min-width:0">
                  <div class="r-title" style="font-size:15px;${isDone ? "text-decoration:line-through" : ""}">${esc(i.label)}</div>
                  <div class="r-sub" style="margin-top:3px">${esc(i.note)}</div>
                  <div style="display:flex;align-items:center;gap:8px;margin-top:8px;flex-wrap:wrap">
                    ${i.due ? `<span class="when-chip">${esc(i.due)}</span>` : ""}
                    ${i.mine ? `<span class="pill any">yours</span>` : ""}
                    ${who.length ? `<span class="tally" style="margin:0">${voterChips(who)}<span class="tally-n">handled</span></span>` : ""}
                    ${isHost() ? `<span class="tl-map" style="color:var(--ink-3);cursor:pointer;margin-left:auto" data-bkhide="${esc(i.id)}">${i.mine ? "Remove" : "Not for us"}</span>` : ""}
                  </div>
                </div>
              </div>
            </div>`;
          }).join("")}
        </div>`;
      }).join("")}

      ${isHost() ? `<div class="card">
        <h3>＋ Add your own</h3>
        <p class="section-sub" style="margin:4px 0 10px">The things only you know about. "Shinkansen seats open exactly 30 days before each leg." It slots into the timeline by when it is due.</p>
        <div class="expense-add">
          <input id="bkLabel" placeholder="What needs doing" />
          <input id="bkNote2" placeholder="Why, or how (optional)" />
          <div style="display:flex;gap:8px;align-items:center">
            <input id="bkBy" type="number" inputmode="numeric" placeholder="Days before the trip" style="flex:2" />
            <span class="r-sub" style="flex:1">days out</span>
          </div>
          <button class="btn primary" id="bkAdd">Add to the timeline</button>
        </div>
        <div id="bkMsg" class="r-sub" style="margin-top:8px"></div>
      </div>
      ${(TRIP.links || {}).booking_hidden && (TRIP.links || {}).booking_hidden.length ? `<button class="btn ghost" id="bkRestore" style="width:100%">Bring back ${(TRIP.links || {}).booking_hidden.length} hidden item${(TRIP.links || {}).booking_hidden.length === 1 ? "" : "s"}</button>` : ""}` : ""}`;
    s.querySelectorAll("[data-book]").forEach((b) => b.addEventListener("click", () => setVote("booking", b.dataset.book, "done")));
    s.querySelectorAll("[data-bkhide]").forEach((b) => b.addEventListener("click", () => hideBookingItem(b.dataset.bkhide)));
    const ba = $("#bkAdd"); if (ba) ba.addEventListener("click", addBookingItem);
    const br = $("#bkRestore"); if (br) br.addEventListener("click", async () => {
      await saveLinks({ booking_hidden: [] }, ["booking_hidden"]);
      renderBooking();
    });
  }
  async function addBookingItem() {
    const label = $("#bkLabel").value.trim();
    if (!label) { $("#bkMsg").textContent = "Say what needs doing."; return; }
    const by = parseInt($("#bkBy").value, 10);
    const extra = ((TRIP.links || {}).booking_extra || []).concat([{
      id: "own-" + Date.now().toString(36),
      label: label.slice(0, 140),
      note: $("#bkNote2").value.trim().slice(0, 300),
      by: by > 0 ? by : 30,
    }]);
    const ok = await saveLinks({ booking_extra: extra }, []);
    if (!ok) { $("#bkMsg").textContent = "Couldn't save it. It will sync when you're back online."; }
    renderBooking();
  }
  async function hideBookingItem(id) {
    const L = TRIP.links || {};
    if (String(id).startsWith("own-")) {
      await saveLinks({ booking_extra: (L.booking_extra || []).filter((e) => e.id !== id) }, []);
    } else {
      await saveLinks({ booking_hidden: [...new Set([...(L.booking_hidden || []), id])] }, []);
    }
    renderBooking();
  }

  /* =========================================================================
     DECISIONS
     ====================================================================== */
  /* A vote that cannot grow is a dead end when the whole point is "we have not
     decided". On a trip anyone can put a candidate up; on a wedding the
     questions belong to the couple, so only they can. */
  const canAddOption = () => (isWedding() ? isHost() : true) && !!state.me;
  /* Whoever asked it can reword it. So can a host, which on a group trip is
     everyone, and which matters for the questions the app seeded itself with
     since those have no author to claim them. */
  const canEditDecision = (d) => !!state.me && (isHost() || d.author === state.me);
  let decEditing = null;
  function optionPlaceholder(d) {
    const t = String(d.title || "").toLowerCase();
    if (/where/.test(t)) return "Add a place, e.g. Outer Banks";
    if (/when/.test(t)) return "Add a window, e.g. first week of June";
    return "Add another option";
  }
  async function addOption(decId) {
    const inp = $(`[data-decopt="${decId}"]`), msg = $(`[data-decoptmsg="${decId}"]`);
    const say = (t) => { if (msg) msg.textContent = t; };
    const label = (inp ? inp.value : "").trim();
    if (!label) return;
    if (!state.me) { openWho(); return; }
    const d = state.decisions.find((x) => String(x.id) === String(decId));
    if (!d) return;
    const opts = (d.options || []).slice();
    if (opts.length >= 12) { say("That's plenty of options already."); return; }
    if (opts.some((o) => o.label.toLowerCase() === label.toLowerCase())) { say("That one is already up there."); return; }
    opts.push({ id: slug(label) + "-" + opts.length, label: label.slice(0, 80) });
    d.options = opts;
    if (inp) inp.value = "";
    renderDecisions();
    const ok = await Backend.update("decisions", decId, { options: opts });
    if (!ok) { const m = $(`[data-decoptmsg="${decId}"]`); if (m) m.textContent = "Saved on this phone. It will sync when you're back online."; }
  }

  async function saveDecision(id) {
    const d = state.decisions.find((x) => String(x.id) === String(id));
    if (!d) return;
    const t = $(`[data-dectitle="${id}"]`), n = $(`[data-decnote="${id}"]`);
    const title = (t ? t.value : "").trim();
    if (!title) { if (t) t.focus(); return; }
    const mu = $(`[data-decmulti="${id}"]`);
    const patch = { title: title.slice(0, 140), note: (n ? n.value : "").trim().slice(0, 300) };
    Object.assign(d, patch);
    const wantMulti = mu ? !!mu.checked : isMulti(d);
    decEditing = null;
    renderDecisions();
    await Backend.update("decisions", id, patch);
    if (wantMulti !== isMulti(d)) {
      await setMulti(id, wantMulti);
      if (!wantMulti) await collapseMultiVotes(id);
      renderDecisions();
    }
  }
  /* Removing an option takes its votes with it, otherwise the tally counts
     people against something that is no longer on the ballot. */
  async function removeOption(key) {
    const [id, optId] = key.split("#");
    const d = state.decisions.find((x) => String(x.id) === String(id));
    if (!d) return;
    const gone = (d.options || []).find((o) => o.id === optId);
    const voters = (tally("decision", id)[optId] || []).slice();   // read before we clear them
    if (voters.length && !confirm(`"${gone ? gone.label : "That option"}" has ${voters.length} vote${voters.length === 1 ? "" : "s"}. Remove it anyway?`)) return;
    d.options = (d.options || []).filter((o) => o.id !== optId);
    state.allVotes = state.allVotes.filter((v) => !(v.kind === "decision" && v.topic === id && v.choice === optId));
    renderDecisions();
    await Backend.update("decisions", id, { options: d.options });
    for (const voter of voters) await Backend.castVote(TRIP_CODE, "decision", id, null, voter);
  }

  /* =========================================================================
     WHEN CAN EVERYONE GO

     "Which month" is too coarse to book anything and "which exact days" is
     too much to ask six months out. So it is two taps: open the months that
     could work, then tick the weeks inside them you are actually free. The
     answer falls out of the overlap.

     One row per person per month (kind "avail", topic the month), with the
     weeks comma joined into the single choice the unique constraint allows.
     No migration, and it reads as nonsense to nothing.
     ====================================================================== */
  const AVAIL = "avail";
  const myAnsweredAvail = () => state.allVotes.some((v) => v.kind === AVAIL && v.voter === state.me && splitChoice(v.choice).length);
  const anyAnsweredAvail = () => new Set(state.allVotes.filter((v) => v.kind === AVAIL && splitChoice(v.choice).length).map((v) => v.voter));
  const monthLabel = (id) => new Date(id + "-01T12:00:00").toLocaleDateString("en-US", { month: "long", year: "numeric" });

  /* Weeks are Monday to Sunday and belong to the month their Thursday is in,
     so a week is never offered twice and never split across two cards. */
  function weeksOf(monthId) {
    const [y, m] = monthId.split("-").map(Number);
    const out = [];
    const d = new Date(y, m - 1, 1);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));      // back to Monday
    for (let i = 0; i < 6; i++) {
      const thu = new Date(d); thu.setDate(thu.getDate() + 3);
      if (thu.getMonth() === m - 1) {
        const end = new Date(d); end.setDate(end.getDate() + 6);
        out.push({
          id: isoDay(d),
          start: isoDay(d), end: isoDay(end),
          label: `${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })} to ${end.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
        });
      }
      d.setDate(d.getDate() + 7);
    }
    return out;
  }
  /* Which months are on the board is the group's call, not a fixed guess. Six
     starting two months out is a sane default, but a trip aimed at next summer
     or at three weeks from now needs to say so. Kept in trips.links, so
     everyone is looking at the same board. */
  const AVAIL_MAX = 12;
  function availWindow() {
    const L = TRIP.links || {};
    const count = Math.max(2, Math.min(AVAIL_MAX, Number(L.avail_count) || 6));
    const from = /^\d{4}-\d{2}$/.test(L.avail_from || "") ? L.avail_from : nextMonths(1)[0].id;
    return { from, count };
  }
  function availMonths() {
    const { from, count } = availWindow();
    const [y, m] = from.split("-").map(Number);
    const out = [];
    const d = new Date(y, m - 1, 1);
    for (let i = 0; i < count; i++) {
      out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
      d.setMonth(d.getMonth() + 1);
    }
    return out;
  }
  const myWeeks = (monthId) => splitChoice(myVote(AVAIL, monthId));
  /* Everyone's weeks, flattened: week id -> voters free that week. Scoped to
     the months currently on the board, so widening or moving the window never
     leaves a winning week nobody can see. Answers outside it are kept, not
     deleted, and come back if the window moves back. */
  function weekTally() {
    const m = {};
    const inWindow = new Set(availMonths());
    state.allVotes.filter((v) => v.kind === AVAIL && inWindow.has(v.topic)).forEach((v) => {
      splitChoice(v.choice).forEach((w) => (m[w] = m[w] || []).push(v.voter));
    });
    return m;
  }
  function bestWeeks(n) {
    const t = weekTally();
    return Object.keys(t)
      .map((id) => ({ id, who: t[id] }))
      .sort((a, b) => b.who.length - a.who.length || a.id.localeCompare(b.id))
      .slice(0, n || 3);
  }
  const weekLabel = (id) => {
    const a = new Date(id + "T12:00:00"), b = new Date(a); b.setDate(b.getDate() + 6);
    return `${a.toLocaleDateString("en-US", { month: "short", day: "numeric" })} to ${b.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
  };
  async function toggleWeek(monthId, weekId) {
    if (!state.me) { openWho(); return; }
    const cur = myWeeks(monthId);
    const next = cur.includes(weekId) ? cur.filter((x) => x !== weekId) : cur.concat(weekId).sort();
    const joined = next.join(",");
    state.allVotes = state.allVotes.filter((v) => !(v.kind === AVAIL && v.topic === monthId && v.voter === state.me));
    if (joined) state.allVotes.push({ kind: AVAIL, topic: monthId, choice: joined, voter: state.me });
    renderDecisions();
    await Backend.castVote(TRIP_CODE, AVAIL, monthId, joined || null, state.me);
  }
  let openMonths = null;
  let availEditing = false;
  function availCard() {
    if (datesKnown()) return "";
    if (availEditing) {
      const { from, count } = availWindow();
      return `<div class="card avail-card">
        <h3 style="margin:0 0 4px">🗓️ Which months are we looking at?</h3>
        <p class="section-sub" style="margin:0 0 12px">Everyone sees the same window, so widen it if the trip is further out than this.</p>
        <label class="wiz-label">Start from</label>
        <input id="availFrom" type="month" value="${esc(from)}" style="width:100%;padding:12px;border:1px solid var(--line);border-radius:var(--r-sm);font-size:15px;background:#fffdfa;color:var(--ink)" />
        <label class="wiz-label">How many months</label>
        <div style="display:flex;flex-wrap:wrap;gap:6px">
          ${[3, 6, 9, 12].map((n) => `<button class="chip ${count === n ? "active" : ""}" data-availcount="${n}">${n} months</button>`).join("")}
        </div>
        <div class="btn-row" style="margin-top:16px">
          <button class="btn ghost" id="availCancel" style="flex:1">Cancel</button>
          <button class="btn primary" id="availSave" style="flex:2">Save</button>
        </div>
        ${myAnsweredAvail() ? `<button class="btn danger" id="availClear" style="width:100%;margin-top:10px">Clear my answers</button>` : ""}
        <div class="r-sub" id="availMsg" style="margin-top:8px"></div>
      </div>`;
    }
    if (openMonths == null) {
      // start with whatever you already said yes to open, so it picks up where you left off
      openMonths = new Set(availMonths().filter((id) => myWeeks(id).length));
    }
    const heads = (TRIP.travelers || []).length || 1;
    const best = bestWeeks(3).filter((w) => w.who.length > 0);
    const answered = new Set(state.allVotes.filter((v) => v.kind === AVAIL && splitChoice(v.choice).length).map((v) => v.voter)).size;
    return `<div class="card avail-card">
      <div style="display:flex;align-items:flex-start;gap:8px">
        <h3 style="margin:0;flex:1">🗓️ When can everyone go?</h3>
        ${isHost() ? `<button class="tl-map" id="availEdit" style="flex:0 0 auto">Edit</button>` : ""}
      </div>
      <p class="section-sub" style="margin:6px 0 12px">Open the months that could work, then tick the weeks you're actually free. ${
        answered ? `<b>${answered}</b> of ${heads} ${answered === 1 ? "has" : "have"} answered.` : "Nobody has answered yet."}</p>
      ${best.length ? `<div class="avail-best">
        <div class="r-sub" style="font-weight:800;margin-bottom:6px">Best so far</div>
        ${best.map((w) => `<div class="avail-best-row">
          <div style="flex:1;min-width:0"><b>${weekLabel(w.id)}</b>
            <div class="tally" style="margin-top:2px">${voterChips(w.who)}<span class="tally-n">${w.who.length} of ${heads} free</span></div></div>
          ${isHost() ? `<button class="btn ghost" data-availuse="${w.id}">Use it</button>` : ""}
        </div>`).join("")}
      </div>` : ""}
      <div class="avail-months">
        ${availMonths().map((id) => {
          const open = openMonths.has(id);
          const mine = myWeeks(id);
          return `<div class="avail-month ${open ? "open" : ""}">
            <button class="avail-head" data-availmonth="${id}">
              <span class="avail-caret">▶</span>
              <span style="flex:1;text-align:left">${monthLabel(id)}</span>
              ${mine.length ? `<span class="avail-count">${mine.length} week${mine.length === 1 ? "" : "s"}</span>` : ""}
            </button>
            ${open ? `<div class="avail-weeks">
              ${weeksOf(id).map((w) => {
                const who = weekTally()[w.id] || [];
                const on = mine.includes(w.id);
                return `<button class="avail-week ${on ? "on" : ""}" data-availweek="${id}#${w.id}">
                  <span style="font-size:17px">${on ? "☑️" : "⬜️"}</span>
                  <span style="flex:1;text-align:left">${w.label}</span>
                  ${who.length ? `<span class="tally" style="margin:0">${voterChips(who)}</span>` : ""}
                </button>`;
              }).join("")}
            </div>` : ""}
          </div>`;
        }).join("")}
      </div>
      <div class="r-sub" id="availMsg" style="margin-top:8px"></div>
    </div>`;
  }
  /* Dates without days is a plan tab that still says "the plan is empty" the
     moment you have just settled when you are going. So the skeleton gets
     built: one day per date, named enough to be useful and vague enough to
     be obviously a starting point. Only ever fills gaps, never removes a day
     someone has put work into. */
  async function fillDays(start, end) {
    if (!start || !end || end < start) return 0;
    const have = new Set((state.days || []).map((d) => d.date));
    const a = new Date(start + "T12:00:00"), b = new Date(end + "T12:00:00");
    const span = Math.round((b - a) / 864e5);
    if (span < 0 || span > 60) return 0;      // a sane ceiling, not a guess
    let made = 0;
    for (let i = 0; i <= span; i++) {
      const d = new Date(a); d.setDate(d.getDate() + i);
      const date = isoDay(d);
      if (have.has(date)) continue;
      const title = i === 0 ? "Arrive" : i === span ? "Head home"
        : d.toLocaleDateString("en-US", { weekday: "long" });
      const row = await Backend.insert("days", { trip: TRIP_CODE, date, stop: ((TRIP.stops || [])[0] || {}).id || "",
        title, summary: "", meetup: "", items: [] });
      if (row) { state.days.push(row); made++; }
    }
    state.days.sort((x, y) => String(x.date).localeCompare(String(y.date)));
    return made;
  }

  /* Turning the winning week into the trip's actual dates is the whole point,
     so it is one tap rather than a trip to Settings. */
  async function useWeek(weekId) {
    const a = new Date(weekId + "T12:00:00"), b = new Date(a); b.setDate(b.getDate() + 6);
    const start = isoDay(a), end = isoDay(b);
    const say = (t) => { const el = $("#availMsg"); if (el) el.textContent = t; };
    if (!confirm(`Set the trip to ${weekLabel(weekId)}? Everyone sees it straight away, and you can change it in Settings.`)) return;
    say("Setting the dates…");
    const ok = await Backend.updateTrip(TRIP_CODE, { start_date: start, end_date: end });
    if (!ok) { say("Couldn't save that. Check you're online."); return; }
    TRIP.start_date = start; TRIP.end_date = end;
    $("#brandSub").textContent = fmtRange(start, end);
    say("Building the days…");
    const made = await fillDays(start, end);
    renderAll();
    show(made ? "itinerary" : "home");
  }

  /* A vote that lands has to actually change the trip, or it is just a poll.
     When a "where" question has a leader, offer to make it the destination:
     that fills the timezone, the weather, the map and every screen that has
     been saying it does not know where this is. */
  const isPlaceVote = (d) => /\bwhere\b/i.test(d.title || "");
  function leaderOf(d, counts) {
    const ranked = (d.options || []).map((o) => ({ o, n: (counts[o.id] || []).length }))
      .sort((a, b) => b.n - a.n);
    if (!ranked.length || !ranked[0].n) return null;
    const tie = ranked.length > 1 && ranked[1].n === ranked[0].n;
    return { ...ranked[0], tie };
  }
  function placeWinnerRow(d, counts) {
    if (!isPlaceVote(d) || datesKnownPlace()) return "";
    const lead = leaderOf(d, counts);
    if (!lead) return "";
    const heads = (TRIP.travelers || []).length;
    return `<div class="dec-winner">
      <div style="flex:1;min-width:0">
        <div class="r-sub" style="font-weight:800">${lead.tie ? "Tied so far" : "Leading"}</div>
        <b>${esc(lead.o.label)}</b> <span class="r-sub">${lead.n} of ${heads || lead.n}</span>
      </div>
      ${isHost() ? `<button class="btn ghost" data-useplace="${d.id}#${lead.o.id}">Make it official</button>` : ""}
    </div>`;
  }
  const datesKnownPlace = () => !!(TRIP.destination || (TRIP.stops || []).length);
  /* Setting the destination is the recalibration: name, stop, timezone. The
     stop is what the itinerary, stays and map hang off, so it goes in too. */
  async function usePlace(key) {
    const [decId, optId] = key.split("#");
    const d = state.decisions.find((x) => String(x.id) === String(decId));
    const opt = d && (d.options || []).find((o) => o.id === optId);
    if (!opt) return;
    if (!confirm(`Set this trip's destination to ${opt.label}? Everyone sees it straight away, and Settings can change it.`)) return;
    const tz = tzForCity(opt.label) || TRIP.tz || "UTC";
    const stops = (TRIP.stops || []).length ? TRIP.stops : [{ id: slug(opt.label) + "-0", label: opt.label }];
    const ok = await Backend.updateTrip(TRIP_CODE, { destination: opt.label, tz, stops });
    if (!ok) { alert("Couldn't save that. Check you're online."); return; }
    TRIP.destination = opt.label; TRIP.tz = tz; TRIP.stops = stops;
    // the question is answered, so it stops taking up the top of the board
    await Backend.update("decisions", decId, { status: "decided" });
    d.status = "decided";
    renderAll();
    show("home");
  }

  function renderDecisions() {
    const s = $("#screen-decisions");
    s.innerHTML = `
      <div class="section-title">Votes</div>
      <div class="section-sub">${isWedding() ? "Questions from the hosts. Tap your pick, tallies update live." : "Open questions for the group. Tap your pick, tallies update live. Anyone can add one."}</div>
      ${availCard()}
      ${!state.me ? `<div class="card" style="border-color:var(--sakura-deep);background:#fdf3f5"><b>Tag yourself first</b>. Tap "Who are you?" up top. <button class="btn primary" id="decWho" style="margin-top:10px;width:100%">Set who I am</button></div>` : ""}
      ${state.decisions.length ? state.decisions.map((d) => {
        const multi = isMulti(d);
        const picks = multi ? myPicks(d.id) : [];
        const mine = myVote("decision", d.id);
        const counts = multi ? tallyMulti(d.id) : tally("decision", d.id);
        const author = d.author ? (byId(d.author) || {}).name : "";
        const editing = decEditing === d.id;
        return `<div class="card">
          ${editing ? `<div class="expense-add" style="margin:0 0 12px">
            <input data-dectitle="${d.id}" value="${esc(d.title)}" placeholder="The question" />
            <input data-decnote="${d.id}" value="${esc(d.note || "")}" placeholder="Context (optional)" />
            <label class="dec-multi"><input type="checkbox" data-decmulti="${d.id}" ${multi ? "checked" : ""} /> Let people pick more than one</label>
            <div class="btn-row">
              <button class="btn ghost" data-deccancel="${d.id}" style="flex:1">Cancel</button>
              <button class="btn primary" data-decsave="${d.id}" style="flex:2">Save</button>
            </div>
          </div>`
          : `<div style="display:flex;align-items:flex-start;gap:8px">
            <h3 style="margin:0;flex:1">${esc(d.title)}</h3>
            ${canEditDecision(d) ? `<button class="tl-map" data-decedit="${d.id}" style="flex:0 0 auto">Edit</button>` : ""}
          </div>
          ${d.note ? `<p class="section-sub" style="margin:8px 0 12px">${esc(d.note)}</p>` : `<div style="height:8px"></div>`}
          ${multi ? `<div class="r-sub" style="margin:-4px 0 10px">Pick as many as work for you.</div>` : ""}`}
          <div style="display:grid;gap:8px">
            ${(d.options || []).map((o) => {
              const voters = counts[o.id] || [];
              const sel = multi ? picks.includes(o.id) : mine === o.id;
              return `<div style="display:flex;align-items:center;gap:6px">
                <button class="who-opt ${sel ? "sel" : ""}" data-dec="${d.id}" data-opt="${o.id}" data-multi="${multi ? 1 : 0}" style="text-align:left;flex:1;min-width:0;align-items:flex-start">
                  <span style="font-size:18px;margin-top:1px">${multi ? (sel ? "☑️" : "⬜️") : (sel ? "🔘" : "⚪")}</span>
                  <div style="flex:1;min-width:0"><div style="font-weight:700">${esc(o.label)}</div>
                    ${voters.length ? `<div class="tally">${voterChips(voters)}<span class="tally-n">${voters.length}</span></div>` : ""}
                  </div>
                </button>
                ${editing ? `<button class="btn danger" data-decrmopt="${d.id}#${o.id}" style="flex:0 0 auto" aria-label="Remove this option">✕</button>` : ""}
              </div>`;
            }).join("")}
          </div>
          ${(d.options || []).length ? "" : `<p class="r-sub" style="margin:2px 0 0">Nothing to vote on yet. Put the first one up.</p>`}
          ${placeWinnerRow(d, counts)}
          ${canAddOption() ? `<div class="dec-add-opt">
            <input data-decopt="${d.id}"${/where/i.test(d.title || "") ? ` data-suggest="city" autocomplete="off"` : ""} placeholder="${esc(optionPlaceholder(d))}" />
            <button class="btn ghost" data-decoptadd="${d.id}">＋ Add</button>
          </div>
          <div class="r-sub" data-decoptmsg="${d.id}"></div>` : ""}
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px">
            <span class="r-sub" style="font-size:11px">${author ? "asked by " + esc(author.split(" ")[0]) : ""}</span>
            ${canEditDecision(d) ? `<button class="btn danger" data-decdel="${d.id}">Remove</button>` : ""}
          </div>
          ${commentBlock("decision:" + d.id)}
        </div>`;
      }).join("") : emptyState("🗳️", "Nothing to vote on yet", isHost() ? "Pose a question below: where to eat, which day for the big excursion, whatever the group keeps going back and forth on. Everyone taps a pick and the tally settles it." : "When a question goes up, you'll vote on it here.")}
      ${isHost() ? `<div class="card">
        <h3>Ask the group</h3>
        <div class="expense-add">
          <input id="decTitle" placeholder="The question" />
          <input id="decNote" placeholder="Context (optional)" />
          <input id="decO0" placeholder="Option 1" />
          <input id="decO1" placeholder="Option 2" />
          <input id="decO2" placeholder="Option 3 (optional)" />
          <input id="decO3" placeholder="Option 4 (optional)" />
          <label class="dec-multi"><input type="checkbox" id="decMulti" /> Let people pick more than one</label>
          <button class="btn primary" id="decAdd">Post it</button>
        </div>
      </div>` : ""}`;
    s.querySelectorAll("[data-dec]").forEach((b) => b.addEventListener("click", () =>
      (b.dataset.multi === "1" ? togglePick(b.dataset.dec, b.dataset.opt) : setVote("decision", b.dataset.dec, b.dataset.opt))));
    s.querySelectorAll("[data-decdel]").forEach((b) => b.addEventListener("click", async () => {
      const row = state.decisions.find((x) => String(x.id) === String(b.dataset.decdel));
      if (!row) return;
      await deleteWithUndo("decisions", row, row.title || "Question",
        () => { state.decisions = state.decisions.filter((x) => String(x.id) !== String(row.id)); },
        (back) => state.decisions.push(back));
    }));
    bindComments(s);
    const dA = $("#decAdd"); if (dA) dA.addEventListener("click", addDecision);
    s.querySelectorAll("[data-decoptadd]").forEach((b) => b.addEventListener("click", () => addOption(b.dataset.decoptadd)));
    s.querySelectorAll("[data-decedit]").forEach((b) => b.addEventListener("click", () => { decEditing = b.dataset.decedit; renderDecisions(); }));
    s.querySelectorAll("[data-deccancel]").forEach((b) => b.addEventListener("click", () => { decEditing = null; renderDecisions(); }));
    s.querySelectorAll("[data-decsave]").forEach((b) => b.addEventListener("click", () => saveDecision(b.dataset.decsave)));
    s.querySelectorAll("[data-decrmopt]").forEach((b) => b.addEventListener("click", () => removeOption(b.dataset.decrmopt)));
    s.querySelectorAll("[data-availmonth]").forEach((b) => b.addEventListener("click", () => {
      const id = b.dataset.availmonth;
      if (openMonths.has(id)) openMonths.delete(id); else openMonths.add(id);
      renderDecisions();
    }));
    s.querySelectorAll("[data-availweek]").forEach((b) => b.addEventListener("click", () => {
      const [m, w] = b.dataset.availweek.split("#");
      toggleWeek(m, w);
    }));
    s.querySelectorAll("[data-availuse]").forEach((b) => b.addEventListener("click", () => useWeek(b.dataset.availuse)));
    s.querySelectorAll("[data-useplace]").forEach((b) => b.addEventListener("click", () => usePlace(b.dataset.useplace)));
    const ae = $("#availEdit"); if (ae) ae.addEventListener("click", () => { availEditing = true; renderDecisions(); });
    const ac = $("#availCancel"); if (ac) ac.addEventListener("click", () => { availEditing = false; renderDecisions(); });
    let pendingCount = null;
    s.querySelectorAll("[data-availcount]").forEach((b) => b.addEventListener("click", () => {
      pendingCount = Number(b.dataset.availcount);
      s.querySelectorAll("[data-availcount]").forEach((x) => x.classList.toggle("active", x === b));
    }));
    const as = $("#availSave"); if (as) as.addEventListener("click", async () => {
      const from = ($("#availFrom") || {}).value || "";
      const count = pendingCount || availWindow().count;
      if (!/^\d{4}-\d{2}$/.test(from)) { $("#availMsg").textContent = "Pick a month to start from."; return; }
      $("#availMsg").textContent = "Saving…";
      const ok = await saveLinks({ avail_from: from, avail_count: count }, ["avail_from", "avail_count"]);
      if (!ok) { $("#availMsg").textContent = "Couldn't save. Check you're online."; return; }
      availEditing = false; openMonths = null;
      renderDecisions();
    });
    const acl = $("#availClear"); if (acl) acl.addEventListener("click", async () => {
      const mine = state.allVotes.filter((v) => v.kind === AVAIL && v.voter === state.me);
      state.allVotes = state.allVotes.filter((v) => !(v.kind === AVAIL && v.voter === state.me));
      availEditing = false; openMonths = null;
      renderDecisions();
      for (const v of mine) await Backend.castVote(TRIP_CODE, AVAIL, v.topic, null, state.me);
    });
    s.querySelectorAll("[data-decopt]").forEach((i) => i.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); addOption(i.dataset.decopt); }
    }));
    const dw = $("#decWho"); if (dw) dw.addEventListener("click", openWho);
  }
  async function addDecision() {
    if (!state.me) { openWho(); return; }
    const title = $("#decTitle").value.trim();
    const opts = [0, 1, 2, 3].map((i) => $("#decO" + i).value.trim()).filter(Boolean);
    if (!title || opts.length < 2) { alert("Add the question and at least two options."); return; }
    const options = opts.map((label, i) => ({ id: "opt" + i, label }));
    const many = !!($("#decMulti") || {}).checked;
    const row = await Backend.insert("decisions", { trip: TRIP_CODE, title, note: $("#decNote").value.trim(),
      options, status: "open", author: state.me });
    if (row) {
      state.decisions.push(row);
      if (many) await setMulti(row.id, true);
      renderDecisions();
    }
  }

  /* =========================================================================
     STAYS - submit up to 2 per stop, vote
     ====================================================================== */
  const MAX_STAY = 2;
  let stayForm = null; // {kind: "propose"|"booked"|"block", stop}
  /* A stop can be settled two ways: the group votes, or someone already
     booked it. A booked place takes over the stop and skips the vote. */
  function bookedCard(o, stopLabel) {
    const who = byId(o.author);
    return `<div class="card" style="border-color:var(--matcha);background:linear-gradient(180deg,#f4f9f4,#fffdf8)">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
        <span class="pill" style="background:#e2efe5;color:#3c6b4a">✓ Booked</span>
        ${stopLabel ? `<span class="r-sub" style="font-size:11.5px">${esc(stopLabel)}</span>` : ""}
      </div>
      <h3 style="margin:0 0 4px">${esc(o.name)}</h3>
      ${o.address ? `<div class="r-sub" style="margin-bottom:4px">${esc(o.address)}</div>` : ""}
      ${o.note ? `<div style="font-size:13.5px;line-height:1.5;margin-top:6px">${esc(o.note)}</div>` : ""}
      ${o.conf ? `<div class="r-sub" style="margin-top:8px">Confirmation <b>${esc(o.conf)}</b></div>` : ""}
      <div style="display:flex;align-items:center;gap:14px;margin-top:10px;flex-wrap:wrap">
        ${o.link ? `<a class="tl-map" href="${esc(o.link)}" target="_blank" rel="noopener">🔗 Booking</a>` : ""}
        <a class="tl-map" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(o.name + " " + (o.address || stopLabel || ""))}" target="_blank" rel="noopener">📍 Map</a>
        ${who ? `<span class="r-sub" style="font-size:11.5px">added by ${esc(who.name.split(" ")[0])}</span>` : ""}
        ${(o.author === state.me || isHost()) ? `<span class="tl-map" style="color:var(--vermilion);cursor:pointer" data-unbook="${o.id}">Not booked after all</span>` : ""}
      </div>
    </div>`;
  }
  function openBookedForm(stopId, container, keep) {
    if (!state.me) { openWho(); return; }
    if (!keep) stayForm = { kind: "booked", stop: stopId, container };
    const st = stopById(stopId);
    $(container).innerHTML = `<div class="card" style="border-color:var(--matcha)">
      <h3>✓ Add the booked place in ${esc(st.label)}</h3>
      <p class="section-sub" style="margin:4px 0 10px">This settles the stop, so nobody has to submit or vote for it.</p>
      <div class="expense-add">
        <input id="bkName" placeholder="Hotel / house name" />
        <input id="bkAddr" placeholder="Address or neighborhood (optional)" />
        <input id="bkNote" placeholder="Anything the group should know (optional)" />
        <input id="bkLink" placeholder="Booking link (optional)" />
        <input id="bkConf" placeholder="Confirmation number (optional)" />
        <div class="btn-row">
          <button class="btn ghost" id="bkCancel" style="flex:1">Cancel</button>
          <button class="btn primary" id="bkSave" style="flex:2">Save as booked</button>
        </div>
      </div>
    </div>`;
    $("#bkCancel").addEventListener("click", () => { stayForm = null; $(container).innerHTML = ""; });
    $("#bkSave").addEventListener("click", async () => {
      const name = $("#bkName").value.trim();
      if (!name) { alert("Add the name of the place."); return; }
      const row = await Backend.insert("stay_options", {
        trip: TRIP_CODE, stop: stopId, name, tag: "Booked",
        address: $("#bkAddr").value.trim(), note: $("#bkNote").value.trim(),
        link: $("#bkLink").value.trim(), conf: $("#bkConf").value.trim(),
        booked: true, author: state.me,
      });
      if (row) { state.stayOptions.push(row); renderStays(); }
    });
  }
  function openBlockForm(container, keep) {
    if (!state.me) { openWho(); return; }
    if (!keep) stayForm = { kind: "block", container };
    $(container).innerHTML = `<div class="card" style="border-color:var(--ai)">
      <h3>🏨 Add a room block</h3>
      <p class="section-sub" style="margin:4px 0 10px">Add each hotel you've reserved rooms at. Guests book from here.</p>
      <div class="expense-add">
        <input id="blName" placeholder="Hotel name" />
        <input id="blRate" placeholder="Rate, e.g. $189/night" />
        <input id="blDeadline" placeholder="Book-by date, e.g. Sep 1" />
        <input id="blAddr" placeholder="Address or distance from the venue (optional)" />
        <input id="blNote" placeholder="Anything else guests should know (optional)" />
        <input id="blLink" placeholder="Booking link" />
        <div class="btn-row">
          <button class="btn ghost" id="blCancel" style="flex:1">Cancel</button>
          <button class="btn primary" id="blSave" style="flex:2">Add block</button>
        </div>
      </div>
    </div>`;
    $("#blCancel").addEventListener("click", () => { stayForm = null; $(container).innerHTML = ""; });
    $("#blSave").addEventListener("click", async () => {
      const name = $("#blName").value.trim();
      if (!name) { alert("Add the hotel name."); return; }
      const row = await Backend.insert("stay_options", {
        trip: TRIP_CODE, stop: (TRIP.stops || [{ id: "" }])[0].id, kind: "block",
        name, rate: $("#blRate").value.trim(), deadline: $("#blDeadline").value.trim(),
        address: $("#blAddr").value.trim(), note: $("#blNote").value.trim(),
        link: $("#blLink").value.trim(), tag: "Room block", booked: false, author: state.me,
      });
      if (row) { stayForm = null; state.stayOptions.push(row); renderStays(); }
    });
  }
  function renderStays() {
    const s = $("#screen-stays");
    if (isWedding()) {
      const L = TRIP.links || {};
      const blocks = state.stayOptions.filter((o) => o.kind === "block");
      const myBlock = myVote("block", "staying");
      const booked = state.stayOptions.filter((o) => o.booked);
      s.innerHTML = `
        <div class="section-title">Venue and rooms</div>
        <div class="section-sub">Where it all happens, and where to sleep.</div>

        ${L.venue_name ? `<div class="card ai-card">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px"><span class="pill" style="background:rgba(255,255,255,.16);color:#f6f1e8">💒 The venue</span></div>
          <h3 style="margin:0 0 4px">${esc(L.venue_name)}</h3>
          ${L.venue_address ? `<div class="section-sub" style="margin:0 0 10px">${esc(L.venue_address)}</div>` : ""}
          <div style="display:flex;gap:14px;flex-wrap:wrap">
            <a class="tl-map" style="color:var(--gold-soft)" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(L.venue_name + " " + (L.venue_address || TRIP.destination || ""))}" target="_blank" rel="noopener">📍 Map</a>
            ${L.venue_link ? `<a class="tl-map" style="color:var(--gold-soft)" href="${esc(L.venue_link)}" target="_blank" rel="noopener">🔗 Venue site</a>` : ""}
          </div>
        </div>` : (isHost() ? emptyState("💒", "No venue posted yet", "Add the venue in <b>More → Settings</b> and guests will see it here with a map.") : "")}

        <div class="section-title" style="font-size:17px;margin-top:22px">Room blocks</div>
        <div class="section-sub">${blocks.length ? "Reserved at group rates. Book whichever suits you, then tap <b>I'm staying here</b> so the hosts can plan shuttles." : ""}</div>
        ${blocks.length ? blocks.map((b) => {
          const staying = myBlock === b.id;
          const others = (tally("block", "staying")[b.id] || []);
          return `<div class="card" style="${staying ? "border-color:var(--matcha)" : ""}">
            <div style="display:flex;align-items:flex-start;gap:10px">
              <div style="flex:1;min-width:0">
                <h3 style="margin:0 0 2px">${esc(b.name)}</h3>
                <div class="stay-opt-tag">${esc(b.rate || "Group rate")}${b.deadline ? ` · book by ${esc(b.deadline)}` : ""}</div>
                ${b.address ? `<div class="r-sub" style="margin-top:4px">${esc(b.address)}</div>` : ""}
                ${b.note ? `<div class="stay-opt-note">${esc(b.note)}</div>` : ""}
              </div>
            </div>
            ${others.length ? `<div class="tally" style="margin-top:8px">${voterChips(others)}<span class="tally-n">${others.length} staying here</span></div>` : ""}
            <div class="btn-row" style="margin-top:12px">
              ${b.link ? `<a class="btn primary" href="${esc(b.link)}" target="_blank" rel="noopener" style="flex:2;text-align:center;text-decoration:none">Book a room</a>` : ""}
              <button class="btn ${staying ? "primary" : "ghost"}" data-block="${b.id}" style="flex:1">${staying ? "✓ You're here" : "I'm staying here"}</button>
            </div>
            ${isHost() ? `<div style="text-align:right;margin-top:8px"><span class="tl-map" style="color:var(--vermilion);cursor:pointer" data-blockdel="${b.id}">Remove</span></div>` : ""}
          </div>`;
        }).join("") : (L.roomblock ? `<div class="card">
          <h3>🏨 Room block</h3>
          <p class="section-sub" style="margin:4px 0 12px">Reserved at group rates${L.deadline ? `, <b>book by ${esc(L.deadline)}</b>` : ""}.</p>
          <a class="btn primary" href="${esc(L.roomblock)}" target="_blank" rel="noopener" style="display:block;text-align:center;text-decoration:none">Book a room</a>
        </div>` : emptyState("🏨", "No room blocks yet", isHost()
            ? "Add each hotel you've blocked rooms at, with the rate and booking deadline. Guests book from here and tell you where they're staying."
            : "The hosts haven't posted where to stay yet. Once they do, you'll get booking links and deadlines right here."))}

        ${isHost() ? `<div id="blockForm"></div>
          <button class="btn ghost" id="addBlock" style="width:100%;margin-bottom:18px">＋ Add a room block</button>` : ""}

        ${booked.length ? `<div class="section-title" style="font-size:17px;margin-top:22px">Already booked</div>` +
          booked.map((o) => bookedCard(o, stopById(o.stop).label)).join("") : ""}
        ${isHost() ? `<div id="wedBookedForm"></div>
          <button class="btn ghost" id="wedAddBooked" style="width:100%">✓ Add a place that's already booked</button>` : ""}

        ${(TRIP.stops || []).map((st) => {
          const hoods = state.guides.filter((g) => g.kind === "hood" && g.stop === st.id);
          return hoods.length ? `<div style="margin-top:24px">
            <div class="section-title" style="font-size:17px">Booking your own?</div>
            <div class="section-sub">Neighborhoods around ${esc(st.label)}.</div>
            <div class="hood-scroll">${hoods.map((n) => `<div class="hood-card">
              <div class="hood-name">${esc(n.emoji || "📍")} ${esc(n.title)}</div>
              <div class="hood-tags">${(n.tags || []).map((t) => `<span>${esc(t)}</span>`).join("")}</div>
              <div class="hood-blurb">${esc(n.body)}</div>
              ${n.base ? `<div class="hood-base">🛏️ ${esc(n.base)}</div>` : ""}
            </div>`).join("")}</div>
          </div>` : "";
        }).join("")}`;

      s.querySelectorAll("[data-block]").forEach((b) => b.addEventListener("click", () => setVote("block", "staying", b.dataset.block)));
      s.querySelectorAll("[data-blockdel]").forEach((b) => b.addEventListener("click", async () => {
        const id = b.dataset.blockdel;
        state.stayOptions = state.stayOptions.filter((x) => x.id !== id); renderStays();
        await Backend.remove("stay_options", id);
      }));
      const ab = $("#addBlock"); if (ab) ab.addEventListener("click", () => openBlockForm("#blockForm"));
      const wab = $("#wedAddBooked");
      if (wab) wab.addEventListener("click", () => openBookedForm((TRIP.stops || [{ id: "" }])[0].id, "#wedBookedForm"));
      s.querySelectorAll("[data-unbook]").forEach((b) => b.addEventListener("click", async () => {
        const id = b.dataset.unbook;
        state.stayOptions = state.stayOptions.filter((x) => x.id !== id); renderStays();
        await Backend.remove("stay_options", id);
      }));
    // An open form is part of the screen's state, so bring it back.
    if (stayForm) {
      try {
        if (stayForm.kind === "propose") openProposeStay(stayForm.stop, true);
        else if (stayForm.kind === "booked") openBookedForm(stayForm.stop, stayForm.container || "#proposeForm", true);
        else if (stayForm.kind === "block") openBlockForm(stayForm.container || "#blockForm", true);
      } catch (e) { console.warn("reopen form", e); }
    }
      return;
    }
    s.innerHTML = `
      <div class="section-title">Where we sleep</div>
      <div class="section-sub">Everyone submits up to ${MAX_STAY} places per stop, then the group votes.</div>
      ${(TRIP.stops || []).map((st) => {
        const mine = myVote("stay", st.id);
        const counts = tally("stay", st.id);
        const options = state.stayOptions.filter((p) => p.stop === st.id && p.kind !== "block");
        const booked = options.find((o) => o.booked);
        const myCount = options.filter((o) => o.author === state.me && !o.booked).length;
        if (booked) return `<div style="margin-bottom:28px">
          <div style="display:flex;align-items:center;gap:9px;margin:0 2px 10px"><span class="${stopPillClass(st.id)}">${esc(st.label)}</span></div>
          ${bookedCard(booked, "")}
        </div>`;
        return `<div style="margin-bottom:28px">
          <div style="display:flex;align-items:center;gap:9px;margin:0 2px 10px"><span class="${stopPillClass(st.id)}">${esc(st.label)}</span></div>
          ${(() => { const hoods = state.guides.filter((g) => g.kind === "hood" && g.stop === st.id); return hoods.length ? `<div class="hood-scroll">${hoods.map((n) => `<div class="hood-card">
            <div class="hood-name">${esc(n.emoji || "📍")} ${esc(n.title)}</div>
            <div class="hood-tags">${(n.tags || []).map((t) => `<span>${esc(t)}</span>`).join("")}</div>
            <div class="hood-blurb">${esc(n.body)}</div>
            ${n.base ? `<div class="hood-base">🛏️ ${esc(n.base)}</div>` : ""}
          </div>`).join("")}</div>` : ""; })()}
          ${(() => {
            const recs = options.filter((o) => o.author === "ai");
            if (!recs.length) return "";
            return `<div class="check-cat" style="margin:4px 0 8px">Recommended to get you started</div>` + recs.map((o) => `<div class="stay-opt" style="cursor:default">
              <div class="stay-opt-main">
                <div class="stay-opt-name">${esc(o.name)}</div>
                <div class="stay-opt-tag">${esc(o.tag || "")}</div>
                ${o.note ? `<div class="stay-opt-note">${esc(o.note)}</div>` : ""}
                <a class="tl-map" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(o.name + " " + st.label)}" target="_blank" rel="noopener">📍 Look it up</a>
              </div>
            </div>`).join("") + `<div class="check-cat" style="margin:16px 0 8px">The group's picks</div>`;
          })()}
          ${options.filter((o) => o.author !== "ai").length ? options.filter((o) => o.author !== "ai").map((o) => {
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
          }).join("") : emptyState("🏨", `No submissions for ${esc(st.label)} yet`, "Everyone submits up to " + MAX_STAY + " places, then the group votes. Use the recommendations above as a starting point, or add your own find.")}
          ${!options.some((o) => o.author === "ai") && isHost() ? `<button class="btn ghost" id="staysAI" data-stopfor="${st.id}" style="width:100%;margin-bottom:10px">✨ Suggest places at every price point</button><div id="staysAIMsg" class="r-sub" style="margin-bottom:10px"></div>` : ""}
          <div class="btn-row">
            ${myCount < MAX_STAY
              ? `<button class="btn ghost" data-proposestop="${st.id}" style="flex:2">+ Submit a place (${MAX_STAY - myCount} left)</button>`
              : `<div class="r-sub" style="flex:2;text-align:center;padding:8px">You've used your ${MAX_STAY} for ${esc(st.label)}.</div>`}
            <button class="btn ghost" data-bookedstop="${st.id}" style="flex:1">✓ Already booked</button>
          </div>
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
    s.querySelectorAll("[data-bookedstop]").forEach((b) => b.addEventListener("click", () => openBookedForm(b.dataset.bookedstop, "#proposeForm")));
    s.querySelectorAll("[data-unbook]").forEach((b) => b.addEventListener("click", async () => {
      const id = b.dataset.unbook;
      state.stayOptions = state.stayOptions.filter((x) => x.id !== id); renderStays();
      await Backend.remove("stay_options", id);
    }));
    // An open form is part of the screen's state, so bring it back.
    if (stayForm) {
      try {
        if (stayForm.kind === "propose") openProposeStay(stayForm.stop, true);
        else if (stayForm.kind === "booked") openBookedForm(stayForm.stop, stayForm.container || "#proposeForm", true);
        else if (stayForm.kind === "block") openBlockForm(stayForm.container || "#blockForm", true);
      } catch (e) { console.warn("reopen form", e); }
    }
    const sai = $("#staysAI"); if (sai) sai.addEventListener("click", async () => {
      sai.disabled = true; sai.style.opacity = .6;
      $("#staysAIMsg").textContent = "✨ Finding places at each price point… (~20s)";
      const r = await callAI("stays");
      if (r.ok) { await hydrate("stay_options"); renderStays(); }
      else { $("#staysAIMsg").textContent = r.error || "Couldn't fetch suggestions."; sai.disabled = false; sai.style.opacity = 1; }
    });
  }
  function openProposeStay(stopId, keep) {
    if (!state.me) { openWho(); return; }
    if (!keep) stayForm = { kind: "propose", stop: stopId };
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
      ${isWedding() ? shuttleBoard(arr, flightRow) : `<div class="card">${arr.length ? arr.map(flightRow).join("") : emptyState("🛬", "No arrivals yet", "Add yours above. Once a few people do, everyone can see who lands when and share rides in.")}</div>`}
      <div class="section-title" style="font-size:16px">🛫 Departures${isWedding() ? " · shuttle windows" : ""}</div>
      ${isWedding() ? shuttleBoard(dep, flightRow) : `<div class="card">${dep.length ? dep.map(flightRow).join("") : emptyState("🛫", "No departures yet", "Add yours above so the group knows who leaves when.")}</div>`}`;
    const w = $("#flWho"); if (w) w.addEventListener("click", openWho);
    const fa = $("#faSave"); if (fa) fa.addEventListener("click", () => saveFlight("arrive"));
    const fd = $("#fdSave"); if (fd) fd.addEventListener("click", () => saveFlight("depart"));
  }
  // Wedding: group flights by date, then 3-hour windows - shuttle groups assemble themselves.
  function shuttleBoard(list, flightRow) {
    if (!list.length) return emptyState("✈️", "No flights entered yet", "As guests add their flights, they group into arrival windows here so you can plan shuttles.");
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
     SEATING - tables built from who actually said yes, plus-ones included.
     Rides on the groups table under a reserved set name, so no new schema.
     ====================================================================== */
  const SEAT_SET = "__seating";
  let seatPick = null;
  /* Every seat that RSVP'd yes, as {key, name, meal, diet, host}. The key is
     voter id plus seat index, because a plus-one is not a traveler. */
  function allSeats() {
    const out = [];
    const t = tally("wrsvp", "attend");
    Object.entries(t).forEach(([choice, voters]) => {
      if (!String(choice).startsWith("yes")) return;
      const claimed = parseInt(String(choice).split(":")[1], 10) || 1;
      voters.forEach((v) => {
        const who = byId(v) || { name: "Guest" };
        const party = partyOf(v);
        for (let i = 0; i < claimed; i++) {
          const seat = party[i] || {};
          out.push({
            key: `${v}#${i}`,
            name: seat.name || (i === 0 ? who.name : `Guest of ${who.name.split(" ")[0]}`),
            meal: seat.meal || "", diet: seat.diet || "", host: v,
          });
        }
      });
    });
    return out;
  }
  const seatTables = () => state.groups.filter((g) => g.set_name === SEAT_SET)
    .slice().sort((a, b) => (a.sort || 0) - (b.sort || 0));
  function renderSeating() {
    const s = $("#screen-seating");
    if (!isWedding() || !isHost()) {
      s.innerHTML = `<div class="section-title">Seating</div>${emptyState("🪑", "Hosts only", "The table plan is yours to build. Guests will see their own table on the Home screen once you place them.")}`;
      return;
    }
    const seats = allSeats();
    const tables = seatTables();
    const placed = new Set(tables.flatMap((g) => g.members || []));
    const byKey = {}; seats.forEach((x) => byKey[x.key] = x);
    const spare = seats.filter((x) => !placed.has(x.key));
    // a seat can linger on a table after someone lowers their party size
    const stale = [...placed].filter((k) => !byKey[k]).length;
    const chip = (x, action) => `<span class="split-chip" data-${action}="${esc(x.key)}">${esc(x.name)}${x.meal ? ` · ${esc(x.meal)}` : ""}${action === "seatrm" ? " ✕" : ""}</span>`;
    s.innerHTML = `
      <div class="section-title">Seating</div>
      <div class="section-sub">${seats.length} ${seats.length === 1 ? "seat" : "seats"} from the yeses, plus-ones included. ${placed.size ? `${Math.min(placed.size, seats.length)} placed.` : "None placed yet."}</div>

      ${!seats.length ? emptyState("🪑", "Nobody has said yes yet", "Tables build themselves from the RSVPs. Once guests accept, every seat including plus-ones shows up here to be placed.") : ""}

      ${tables.map((g) => {
        const mem = (g.members || []).filter((k) => byKey[k]);
        const picking = seatPick === g.id;
        const meals = {}; mem.forEach((k) => { const m = byKey[k].meal; if (m) meals[m] = (meals[m] || 0) + 1; });
        const diets = mem.filter((k) => byKey[k].diet);
        const cap = parseInt(g.note, 10) || 0;
        return `<div class="card" style="${picking ? "border-color:var(--ai)" : ""}">
          <div style="display:flex;align-items:center;gap:8px">
            <h3 style="margin:0;flex:1">${esc(g.label)}</h3>
            <span class="r-sub" style="font-size:11.5px">${mem.length}${cap ? ` / ${cap}` : ""}</span>
            <button class="btn danger" data-tabledel="${esc(g.id)}">✕</button>
          </div>
          ${cap && mem.length > cap ? `<div class="r-sub" style="color:var(--vermilion);margin-top:4px">${mem.length - cap} over the ${cap} seats at this table</div>` : ""}
          <div style="display:flex;flex-wrap:wrap;gap:7px;margin-top:10px">
            ${mem.length ? mem.map((k) => chip(byKey[k], "seatrm")).join("") : `<span class="r-sub">Empty.</span>`}
          </div>
          ${Object.keys(meals).length ? `<div style="display:flex;flex-wrap:wrap;gap:7px;margin-top:10px">
            ${Object.entries(meals).map(([m, n]) => `<span class="when-chip">${esc(m)}: <b>${n}</b></span>`).join("")}</div>` : ""}
          ${diets.length ? `<div class="r-sub" style="margin-top:8px">⚠️ ${diets.map((k) => esc(byKey[k].name + ": " + byKey[k].diet)).join(" · ")}</div>` : ""}
          <button class="btn ghost" data-tablepick="${esc(g.id)}" style="width:100%;margin-top:12px">${picking ? "Done" : "＋ Seat someone here"}</button>
          ${picking ? `<div style="display:flex;flex-wrap:wrap;gap:7px;margin-top:10px">
            ${spare.length ? spare.map((x) => chip(x, "seatadd")).join("") : `<span class="r-sub">Everyone has a seat.</span>`}
          </div>` : ""}
        </div>`;
      }).join("")}

      ${seats.length ? `<div class="card">
        <h3>＋ Add a table</h3>
        <div class="expense-add">
          <div style="display:flex;gap:8px">
            <input id="tblName" placeholder="Table ${tables.length + 1}" style="flex:2" />
            <input id="tblCap" type="number" inputmode="numeric" placeholder="Seats" style="flex:1" />
          </div>
          <button class="btn primary" id="tblAdd">Add table</button>
        </div>
        <div id="tblMsg" class="r-sub" style="margin-top:8px"></div>
      </div>` : ""}

      ${spare.length ? `<div class="card" style="border-color:var(--sakura-deep)">
        <h3>Not seated yet (${spare.length})</h3>
        <div style="display:flex;flex-wrap:wrap;gap:7px;margin-top:10px">${spare.map((x) => `<span class="split-chip">${esc(x.name)}</span>`).join("")}</div>
      </div>` : (seats.length && tables.length ? `<div class="card" style="border-color:var(--matcha)">
        <h3>✓ Everyone has a seat</h3>
        <p class="section-sub" style="margin:6px 0 0">All ${seats.length} seats are placed${stale ? `. ${stale} old placement${stale === 1 ? " was" : "s were"} dropped when party sizes changed` : ""}.</p>
      </div>` : "")}

      ${tables.length ? `<button class="btn ghost" id="seatCopy" style="width:100%">Copy the seating chart</button>
      <div id="seatMsg" class="r-sub" style="margin-top:8px;text-align:center"></div>` : ""}`;
    const ta = $("#tblAdd"); if (ta) ta.addEventListener("click", addTable);
    s.querySelectorAll("[data-tablepick]").forEach((b) => b.addEventListener("click", () => {
      seatPick = seatPick === b.dataset.tablepick ? null : b.dataset.tablepick; renderSeating();
    }));
    s.querySelectorAll("[data-tabledel]").forEach((b) => b.addEventListener("click", async () => {
      state.groups = state.groups.filter((g) => String(g.id) !== String(b.dataset.tabledel));
      seatPick = null; renderSeating();
      await Backend.remove("groups", b.dataset.tabledel);
    }));
    s.querySelectorAll("[data-seatadd]").forEach((b) => b.addEventListener("click", () => moveSeat(seatPick, b.dataset.seatadd, true)));
    s.querySelectorAll("[data-seatrm]").forEach((b) => b.addEventListener("click", () => {
      const g = seatTables().find((x) => (x.members || []).includes(b.dataset.seatrm));
      if (g) moveSeat(g.id, b.dataset.seatrm, false);
    }));
    const sc = $("#seatCopy"); if (sc) sc.addEventListener("click", () => {
      navigator.clipboard?.writeText(seatingText())
        .then(() => { $("#seatMsg").textContent = "Copied. Send it to the venue."; })
        .catch(() => { $("#seatMsg").textContent = "Couldn't copy on this device."; });
    });
  }
  async function addTable() {
    const label = ($("#tblName").value.trim() || `Table ${seatTables().length + 1}`).slice(0, 60);
    const cap = $("#tblCap").value.trim();
    const row = await Backend.insert("groups", { trip: TRIP_CODE, set_name: SEAT_SET, label, members: [], note: cap, sort: seatTables().length });
    if (!row) { $("#tblMsg").textContent = "Couldn't add it. Has the groups table been added in Supabase?"; return; }
    state.groups.push(row);
    renderSeating();
  }
  async function moveSeat(tableId, seatKey, add) {
    const g = state.groups.find((x) => String(x.id) === String(tableId));
    if (!g) return;
    // a seat belongs to one table, so clear it from any other first
    if (add) seatTables().forEach((o) => { if (o !== g) o.members = (o.members || []).filter((k) => k !== seatKey); });
    g.members = add ? [...new Set([...(g.members || []), seatKey])] : (g.members || []).filter((k) => k !== seatKey);
    renderSeating();
    await Backend.update("groups", g.id, { members: g.members });
    if (add) for (const o of seatTables()) if (o !== g) await Backend.update("groups", o.id, { members: o.members });
  }
  function seatingText() {
    const seats = {}; allSeats().forEach((x) => seats[x.key] = x);
    const lines = [`${TRIP.name} - seating`, ""];
    seatTables().forEach((g) => {
      const mem = (g.members || []).filter((k) => seats[k]);
      lines.push(`${g.label} (${mem.length})`);
      mem.forEach((k) => lines.push(`  ${seats[k].name}${seats[k].meal ? " - " + seats[k].meal : ""}${seats[k].diet ? " (" + seats[k].diet + ")" : ""}`));
      lines.push("");
    });
    return lines.join("\n");
  }
  /* A guest only needs one line: which table they are at. */
  function myTable() {
    const mine = seatTables().find((g) => (g.members || []).some((k) => String(k).split("#")[0] === state.me));
    return mine ? mine.label : "";
  }

  /* =========================================================================
     DAY OF - the run of show and the vendor list. Hosts only: this is the
     couple's working document, not something guests should be reading.
     ====================================================================== */
  const opsOf = (kind) => state.ops.filter((o) => o.kind === kind)
    .slice().sort((a, b) => (a.kind === "run" ? String(a.time || "~").localeCompare(String(b.time || "~")) : (a.sort || 0) - (b.sort || 0)));
  const VENDOR_ROLES = ["Coordinator", "Venue", "Photographer", "Videographer", "Florist", "Band or DJ", "Catering", "Cake", "Hair", "Makeup", "Transport", "Officiant", "Rentals", "Other"];
  /* A first draft beats a blank page, and every wedding runs roughly this shape. */
  const RUN_TEMPLATE = [
    { time: "09:00", label: "Hair and makeup starts", who: "Bridal party" },
    { time: "12:00", label: "Lunch delivered", who: "Everyone getting ready" },
    { time: "13:30", label: "Photographer arrives", who: "" },
    { time: "14:00", label: "Getting-ready photos", who: "" },
    { time: "15:00", label: "First look", who: "Couple" },
    { time: "15:30", label: "Wedding party photos", who: "" },
    { time: "16:00", label: "Guests arrive, music starts", who: "Ushers" },
    { time: "16:30", label: "Ceremony", who: "" },
    { time: "17:00", label: "Cocktail hour", who: "" },
    { time: "17:15", label: "Family photos", who: "See the shot list" },
    { time: "18:15", label: "Guests seated for dinner", who: "" },
    { time: "18:30", label: "Entrances and first dance", who: "" },
    { time: "19:00", label: "Dinner served", who: "Catering" },
    { time: "19:45", label: "Toasts", who: "" },
    { time: "20:30", label: "Cake and dancing", who: "" },
    { time: "23:00", label: "Last song and send-off", who: "" },
  ];
  function renderDayOf() {
    const s = $("#screen-dayof");
    if (!isWedding()) {
      s.innerHTML = `<div class="section-title">Day of</div>${emptyState("⏱️", "Wedding trips only", "This is the run of show and vendor list for a wedding. Switch the trip to wedding mode in Settings to use it.")}`;
      return;
    }
    if (!isHost()) {
      s.innerHTML = `<div class="section-title">Day of</div>${emptyState("⏱️", "Hosts only", "This is the couple's working timeline for the day, with vendor phone numbers. Your schedule is on the Plan tab.")}`;
      return;
    }
    const run = opsOf("run"), vendors = opsOf("vendor");
    s.innerHTML = `
      <div class="section-title">Day of</div>
      <div class="section-sub">Your run of show and everyone you need to call. Guests never see this.</div>

      <div class="card">
        <h3>⏱️ Run of show</h3>
        ${run.length ? `<div style="margin-top:10px">${run.map((r) => `<div class="row">
          <span class="when-chip" style="min-width:58px;text-align:center">${esc(r.time || "TBD")}</span>
          <div class="r-main"><div class="r-title">${esc(r.label)}</div>
            ${r.who || r.note ? `<div class="r-sub">${esc([r.who, r.note].filter(Boolean).join(" · "))}</div>` : ""}</div>
          <button class="btn danger" data-opdel="${esc(r.id)}">✕</button>
        </div>`).join("")}</div>`
        : `<p class="section-sub" style="margin:6px 0 12px">Nothing yet. Start from the usual shape and change what does not fit, or add your own below.</p>
           <button class="btn primary" id="runSeed" style="width:100%">Start from a typical day</button>`}
      </div>

      <div class="card">
        <h3>＋ Add to the run of show</h3>
        <div class="expense-add">
          <div style="display:flex;gap:8px">
            <input id="runTime" type="time" style="flex:1" />
            <input id="runLabel" placeholder="What happens" style="flex:2" />
          </div>
          <input id="runWho" placeholder="Who it involves (optional)" />
          <input id="runNote" placeholder="Note (optional)" />
          <button class="btn primary" id="runAdd">Add</button>
        </div>
        <div id="runMsg" class="r-sub" style="margin-top:8px"></div>
      </div>

      <div class="section-title" style="margin-top:22px">Vendors</div>
      <div class="section-sub">Tap a number to call it.</div>
      ${vendors.length ? vendors.map((v) => `<div class="card">
        <div style="display:flex;align-items:flex-start;gap:10px">
          <div style="flex:1;min-width:0">
            <div class="r-title">${esc(v.who || v.label)}</div>
            <div class="r-sub">${esc(v.label)}${v.note ? " · " + esc(v.note) : ""}</div>
            ${v.phone ? `<a class="tl-map" href="tel:${esc(String(v.phone).replace(/[^0-9+]/g, ""))}" style="margin-top:6px">📞 ${esc(v.phone)}</a>` : ""}
          </div>
          <button class="btn danger" data-opdel="${esc(v.id)}">✕</button>
        </div>
      </div>`).join("") : emptyState("📇", "No vendors yet", "Add the coordinator, photographer, and anyone else you would have to call in a hurry.")}

      <div class="card">
        <h3>＋ Add a vendor</h3>
        <div class="expense-add">
          <select id="venRole">${VENDOR_ROLES.map((r) => `<option>${r}</option>`).join("")}</select>
          <input id="venName" placeholder="Name or company" />
          <input id="venPhone" type="tel" inputmode="tel" placeholder="Phone" />
          <input id="venNote" placeholder="Note (arrival time, what they need)" />
          <button class="btn primary" id="venAdd">Add vendor</button>
        </div>
        <div id="venMsg" class="r-sub" style="margin-top:8px"></div>
      </div>

      ${run.length || vendors.length ? `<button class="btn ghost" id="opsCopy" style="width:100%">Copy the whole day as text</button>
      <div id="opsMsg" class="r-sub" style="margin-top:8px;text-align:center"></div>` : ""}`;
    const seed = $("#runSeed"); if (seed) seed.addEventListener("click", seedRunOfShow);
    $("#runAdd").addEventListener("click", addRunItem);
    $("#venAdd").addEventListener("click", addVendor);
    const cp = $("#opsCopy"); if (cp) cp.addEventListener("click", () => {
      navigator.clipboard?.writeText(dayOfText())
        .then(() => { $("#opsMsg").textContent = "Copied. Paste it to the coordinator."; })
        .catch(() => { $("#opsMsg").textContent = "Couldn't copy on this device."; });
    });
    s.querySelectorAll("[data-opdel]").forEach((b) => b.addEventListener("click", async () => {
      state.ops = state.ops.filter((o) => String(o.id) !== String(b.dataset.opdel));
      renderDayOf();
      await Backend.remove("wedding_ops", b.dataset.opdel);
    }));
  }
  async function seedRunOfShow() {
    const btn = $("#runSeed"); if (btn) { btn.disabled = true; btn.textContent = "Building…"; }
    for (let i = 0; i < RUN_TEMPLATE.length; i++) {
      const t = RUN_TEMPLATE[i];
      const row = await Backend.insert("wedding_ops", { trip: TRIP_CODE, kind: "run", time: t.time, label: t.label, who: t.who, phone: "", note: "", sort: i });
      if (row) state.ops.push(row);
      else { const m = $("#runMsg"); if (m) m.textContent = "Couldn't save. Has the wedding_ops table been added in Supabase?"; break; }
    }
    renderDayOf();
  }
  async function addRunItem() {
    const label = $("#runLabel").value.trim();
    if (!label) { $("#runMsg").textContent = "Say what happens."; return; }
    const row = await Backend.insert("wedding_ops", { trip: TRIP_CODE, kind: "run",
      time: $("#runTime").value, label: label.slice(0, 140), who: $("#runWho").value.trim().slice(0, 120),
      phone: "", note: $("#runNote").value.trim().slice(0, 200), sort: state.ops.length });
    if (!row) { $("#runMsg").textContent = "Couldn't save it. Has the wedding_ops table been added in Supabase?"; return; }
    state.ops.push(row);
    renderDayOf();
  }
  async function addVendor() {
    const name = $("#venName").value.trim();
    if (!name) { $("#venMsg").textContent = "Add a name."; return; }
    const row = await Backend.insert("wedding_ops", { trip: TRIP_CODE, kind: "vendor", time: "",
      label: $("#venRole").value, who: name.slice(0, 120), phone: $("#venPhone").value.trim().slice(0, 40),
      note: $("#venNote").value.trim().slice(0, 200), sort: state.ops.length });
    if (!row) { $("#venMsg").textContent = "Couldn't save it. Has the wedding_ops table been added in Supabase?"; return; }
    state.ops.push(row);
    renderDayOf();
  }
  function dayOfText() {
    const lines = [`${TRIP.name} - day of`, ""];
    const run = opsOf("run"), vendors = opsOf("vendor");
    if (run.length) {
      lines.push("RUN OF SHOW");
      run.forEach((r) => lines.push(`${r.time || "TBD"}  ${r.label}${r.who ? " (" + r.who + ")" : ""}${r.note ? " - " + r.note : ""}`));
      lines.push("");
    }
    if (vendors.length) {
      lines.push("VENDORS");
      vendors.forEach((v) => lines.push(`${v.label}: ${v.who}${v.phone ? " - " + v.phone : ""}${v.note ? " - " + v.note : ""}`));
    }
    return lines.join("\n");
  }

  /* =========================================================================
     FARES - watch prices, log what people find, book when it hits target
     Routes live on trips.links so adding one never needs a migration.
     ====================================================================== */
  const fareRoutes = () => ((TRIP.links || {}).fare_routes) || [];
  const fareTarget = () => Number((TRIP.links || {}).fare_target) || 0;
  const routeId = (from, to) => `${from}-${to}`;
  /* Google Flights and Kayak both take the route and dates in the URL, so one
     tap lands on the right search with price tracking one more tap away. */
  function fareLinks(r) {
    const dep = TRIP.start_date || "", ret = TRIP.end_date || "";
    const g = "https://www.google.com/travel/flights?q=" +
      encodeURIComponent(`Flights from ${r.from} to ${r.to} on ${dep} through ${ret}`);
    const k = `https://www.kayak.com/flights/${encodeURIComponent(r.from)}-${encodeURIComponent(r.to)}/${dep}/${ret}`;
    return { g, k };
  }
  /* A tiny inline chart. Enough to see the shape of the price without a library. */
  function sparkline(values, target) {
    if (values.length < 2) return "";
    const w = 260, h = 44, pad = 3;
    const all = target > 0 ? values.concat([target]) : values;
    const lo = Math.min(...all), hi = Math.max(...all);
    const span = hi - lo || 1;
    const x = (i) => pad + (i * (w - pad * 2)) / (values.length - 1);
    const y = (v) => pad + (h - pad * 2) * (1 - (v - lo) / span);
    const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
    const tY = target > 0 ? y(target).toFixed(1) : null;
    return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" preserveAspectRatio="none" aria-hidden="true">
      ${tY ? `<line x1="0" y1="${tY}" x2="${w}" y2="${tY}" stroke="var(--matcha)" stroke-width="1" stroke-dasharray="4 3" opacity=".7"/>` : ""}
      <polyline points="${pts}" fill="none" stroke="var(--ai-2)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      <circle cx="${x(values.length - 1).toFixed(1)}" cy="${y(values[values.length - 1]).toFixed(1)}" r="3.2" fill="var(--vermilion)"/>
    </svg>`;
  }
  function renderFares() {
    const s = $("#screen-fares");
    const routes = fareRoutes(), target = fareTarget();
    const money = (n) => "$" + Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 });
    const dates = TRIP.start_date && TRIP.end_date
      ? `${fmtDate(TRIP.start_date).mon} ${fmtDate(TRIP.start_date).day} → ${fmtDate(TRIP.end_date).mon} ${fmtDate(TRIP.end_date).day}` : "your dates";
    s.innerHTML = `
      <div class="section-title">Fares</div>
      <div class="section-sub">Set a free price alert per route, then log what you spot. ${target ? `Target: <b>${money(target)}</b> a person. Book when it hits.` : "Set a target and everyone knows when to pull the trigger."}</div>

      ${routes.length ? `<div class="card">
        <h3>📉 Set price alerts (free)</h3>
        <p class="section-sub" style="margin:4px 0 12px">Open a route and tap <b>Track prices</b> on Google Flights. It emails you when the fare moves. Once per route is enough.</p>
        ${routes.map((r) => {
          const L = fareLinks(r);
          return `<div class="row" style="padding-bottom:6px">
            <div class="r-main"><div class="r-title">${esc(r.label || routeId(r.from, r.to))}</div>
              <div class="r-sub">${r.who ? esc(r.who) : "Round trip"}</div></div>
            <button class="btn danger" data-farerte="${esc(r.id)}">✕</button>
          </div>
          <div class="btn-row" style="margin:0 0 12px">
            <a class="btn primary" href="${L.g}" target="_blank" rel="noopener" style="flex:1;text-align:center;text-decoration:none">Google Flights</a>
            <a class="btn ghost" href="${L.k}" target="_blank" rel="noopener" style="flex:1;text-align:center;text-decoration:none">Kayak</a>
          </div>`;
        }).join("")}
        <p class="section-sub" style="margin:2px 0 0">${dates} · round trip.</p>
      </div>` : emptyState("📉", "No routes yet", "Add where people are flying from and SquadTrip will build the search links, so everyone can set a free price alert and log what they find.")}

      ${routes.map((r) => {
        const rows = state.fares.filter((f) => f.route === r.id)
          .slice().sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")));
        const prices = rows.map((x) => Number(x.price)).filter((n) => n > 0);
        const low = prices.length ? Math.min(...prices) : null;
        const latest = prices.length ? prices[prices.length - 1] : null;
        const hit = target > 0 && low != null && low <= target;
        return `<div class="card">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
            <h3 style="margin:0">${esc(r.label || routeId(r.from, r.to))}</h3>
            ${low != null ? `<span class="pill ${hit ? "s3" : "s1"}">low ${money(low)}</span>` : `<span class="pill any">no data</span>`}
          </div>
          ${prices.length >= 2 ? `<div style="margin:12px 0 4px">${sparkline(prices, target)}</div>` : ""}
          <div class="r-sub" style="margin-top:6px">${latest != null
            ? `Latest ${money(latest)} · ${prices.length} log${prices.length === 1 ? "" : "s"}${target ? ` · target ${money(target)}` : ""}${hit ? " · <b style=\"color:var(--matcha)\">at or under target, book it</b>" : ""}`
            : "Nothing logged yet. Add the first price you see."}</div>
          ${rows.slice().reverse().slice(0, 5).map((x) => {
            const t = byId(x.author) || { name: "Someone", color: "#999" };
            return `<div class="row">${avatarHTML(t, 26, 9)}
              <div class="r-main"><div class="r-title">${money(x.price)}</div>
                <div class="r-sub">${x.created_at ? esc(new Date(x.created_at).toLocaleDateString()) : ""}${x.note ? " · " + esc(x.note) : ""}</div></div>
              ${x.author === state.me ? `<button class="btn danger" data-faredel="${esc(x.id)}">✕</button>` : ""}</div>`;
          }).join("")}
        </div>`;
      }).join("")}

      ${routes.length ? `<div class="card">
        <h3>Log a price you found</h3>
        <div class="expense-add">
          <select id="fareRoute">${routes.map((r) => `<option value="${esc(r.id)}">${esc(r.label || routeId(r.from, r.to))}</option>`).join("")}</select>
          <input id="farePrice" type="number" inputmode="decimal" placeholder="Price per person" />
          <input id="fareNote" placeholder="Airline, site, anything worth remembering" />
          <button class="btn primary" id="fareAdd">Log this price</button>
        </div>
        <div id="fareMsg" class="r-sub" style="margin-top:8px"></div>
      </div>` : ""}

      <div class="card">
        <h3>➕ Add a route</h3>
        <p class="section-sub" style="margin:4px 0 10px">Airport codes. One per group of people flying from the same place.</p>
        <div class="expense-add">
          <div style="display:flex;gap:8px">
            <input id="frFrom" placeholder="From (DCA)" maxlength="4" style="flex:1;text-transform:uppercase" />
            <input id="frTo" placeholder="To (TPA)" maxlength="4" style="flex:1;text-transform:uppercase" />
          </div>
          <input id="frWho" placeholder="Who's on it (optional)" />
          <button class="btn primary" id="frAdd">Add route</button>
        </div>
        <div class="check-cat" style="margin:16px 0 8px">Target price a person</div>
        <div style="display:flex;gap:8px">
          <input id="frTarget" type="number" inputmode="decimal" placeholder="e.g. 350" value="${target || ""}" style="flex:2" />
          <button class="btn ghost" id="frTargetSave" style="flex:1">Save</button>
        </div>
        <div id="frMsg" class="r-sub" style="margin-top:8px"></div>
      </div>`;
    const fa = $("#fareAdd"); if (fa) fa.addEventListener("click", addFare);
    $("#frAdd").addEventListener("click", addFareRoute);
    $("#frTargetSave").addEventListener("click", saveFareTarget);
    s.querySelectorAll("[data-faredel]").forEach((b) => b.addEventListener("click", async () => {
      state.fares = state.fares.filter((f) => f.id !== b.dataset.faredel);
      renderFares();
      await Backend.remove("fares", b.dataset.faredel);
    }));
    s.querySelectorAll("[data-farerte]").forEach((b) => b.addEventListener("click", () => removeFareRoute(b.dataset.farerte)));
  }
  /* trips.links is one JSON blob several screens write to, so writing your own
     idea of it deletes whatever you did not know about. Always merge onto a
     fresh copy from the server, and only drop the keys this form owns. */
  const blank = (v) => v == null || v === "" || (Array.isArray(v) && !v.length);
  async function saveLinks(patch, owned) {
    let base = TRIP.links || {};
    try { const fresh = await Backend.getTrip(TRIP_CODE); if (fresh && fresh.links) base = fresh.links; }
    catch (e) { /* offline: merging onto what we have still beats overwriting */ }
    const links = { ...base, ...patch };
    (owned || []).forEach((k) => { if (blank(links[k])) delete links[k]; });
    const ok = await Backend.updateTrip(TRIP_CODE, { links });
    if (ok) TRIP.links = links;
    return ok;
  }
  async function saveFareLinks(next) {
    TRIP.links = { ...(TRIP.links || {}), ...next };
    renderFares();
    const ok = await saveLinks(next, []);
    const msg = $("#frMsg");
    if (!ok && msg) msg.textContent = "Saved on this phone but the group didn't get it. Check your connection.";
    else renderFares();
  }
  async function addFareRoute() {
    const from = $("#frFrom").value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    const to = $("#frTo").value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    const who = $("#frWho").value.trim();
    if (from.length < 3 || to.length < 3) { $("#frMsg").textContent = "Both airport codes are needed, like DCA and TPA."; return; }
    if (from === to) { $("#frMsg").textContent = "Those are the same airport."; return; }
    const id = routeId(from, to);
    if (fareRoutes().some((r) => r.id === id)) { $("#frMsg").textContent = "That route is already on the list."; return; }
    await saveFareLinks({ fare_routes: fareRoutes().concat([{ id, from, to, who, label: `${from} → ${to}` }]) });
  }
  async function removeFareRoute(id) {
    await saveFareLinks({ fare_routes: fareRoutes().filter((r) => r.id !== id) });
  }
  async function saveFareTarget() {
    const v = parseFloat($("#frTarget").value);
    if (!(v > 0)) { $("#frMsg").textContent = "Enter a number, or leave it blank for no target."; return; }
    await saveFareLinks({ fare_target: v });
  }
  async function addFare() {
    if (!state.me) { openWho(); return; }
    const price = parseFloat($("#farePrice").value);
    if (!(price > 0)) { $("#fareMsg").textContent = "Enter the price you saw."; return; }
    const row = { trip: TRIP_CODE, route: $("#fareRoute").value, price,
      note: $("#fareNote").value.trim().slice(0, 200), author: state.me };
    const saved = await Backend.insert("fares", row);
    if (!saved) { $("#fareMsg").textContent = "Couldn't save it. Has the fares table been added in Supabase?"; return; }
    state.fares.push(saved);
    renderFares();
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
      <div>${state.expenses.filter((x) => x.label !== SETTLE_TAG).length ? state.expenses.filter((x) => x.label !== SETTLE_TAG).slice().reverse().map((e) => `<div class="row">
        <div class="r-main"><div class="r-title">${esc(e.label)}</div>
          <div class="r-sub">${esc(e.currency)} ${Number(e.amount).toLocaleString()} · paid by ${esc((byId(e.paid_by) || { name: "?" }).name.split(" ")[0])} · split ${(e.split_among || []).length}</div></div>
        <button class="btn danger" data-del="${e.id}">Delete</button>
      </div>`).join("") : emptyState("💰", "No expenses yet", "Add the first one above. Anything anyone covers goes in here, and SquadTrip works out who owes who at the end so nobody has to do the math.")}</div>`;
    $("#exAdd").addEventListener("click", addExpense);
    const plan = settlePlan(nets);
    s.querySelectorAll("[data-settle]").forEach((b) => b.addEventListener("click", async () => {
      const p = plan[+b.dataset.settle]; if (!p) return;
      b.disabled = true; b.textContent = "Saving…";
      await recordSettlement(p);
    }));
    s.querySelectorAll("[data-unsettle]").forEach((b) => b.addEventListener("click", async () => {
      state.expenses = state.expenses.filter((e) => e.id !== b.dataset.unsettle);
      renderBudget();
      await Backend.remove("expenses", b.dataset.unsettle);
    }));
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
  function settlePlan(nets) {
    const cred = Object.entries(nets).filter(([, v]) => v > 0.5).map(([id, v]) => ({ id, v }));
    const debt = Object.entries(nets).filter(([, v]) => v < -0.5).map(([id, v]) => ({ id, v: -v }));
    if (!cred.length || !debt.length) return [];
    cred.sort((a, b) => b.v - a.v); debt.sort((a, b) => b.v - a.v);
    const out = []; let i = 0, j = 0;
    while (i < debt.length && j < cred.length) {
      const pay = Math.min(debt[i].v, cred[j].v);
      out.push({ from: debt[i].id, to: cred[j].id, amount: pay });
      debt[i].v -= pay; cred[j].v -= pay;
      if (debt[i].v < 0.5) i++; if (cred[j].v < 0.5) j++;
    }
    return out;
  }
  function settleText(nets, S) {
    const plan = settlePlan(nets);
    const paid = state.expenses.filter((e) => e.label === SETTLE_TAG);
    if (!plan.length) {
      return paid.length
        ? `<div class="card" style="border-color:var(--matcha)"><h3>✓ All square</h3>
            <p class="section-sub" style="margin:6px 0 0">Everyone is paid up. ${paid.length} payment${paid.length === 1 ? "" : "s"} recorded.</p></div>`
        : "";
    }
    const first = (id) => esc((byId(id) || { name: "?" }).name.split(" ")[0]);
    return `<div class="card">
      <h3>Suggested settle-up</h3>
      <p class="section-sub" style="margin:4px 0 10px">The fewest payments that square everyone up. Tap one once the money has actually moved.</p>
      ${plan.map((p, i) => `<div class="row" style="align-items:center">
        <div class="r-main">
          <div class="r-title">${first(p.from)} → ${first(p.to)}</div>
          <div class="r-sub">${S}${p.amount.toFixed(2)}</div>
        </div>
        <button class="btn ghost" data-settle="${i}" style="padding:8px 12px;font-size:12.5px">Mark paid</button>
      </div>`).join("")}
      <div id="settleMsg" class="r-sub" style="margin-top:8px"></div>
    </div>
    ${paid.length ? `<div class="card">
      <h3>Payments made</h3>
      ${paid.slice().reverse().map((e) => `<div class="row">
        <div class="r-main"><div class="r-title">${first(e.paid_by)} paid ${first((e.split_among || [])[0])}</div>
          <div class="r-sub">${S}${toHome(Number(e.amount), e.currency).toFixed(2)}${e.paid_by === state.me || (e.split_among || [])[0] === state.me ? "" : ""}</div></div>
        <span class="tl-map" style="color:var(--vermilion);cursor:pointer" data-unsettle="${e.id}">Undo</span>
      </div>`).join("")}
    </div>` : ""}`;
  }
  const SETTLE_TAG = "· settle up ·";
  async function recordSettlement(p) {
    // A payment is an expense the payer covers and the receiver alone "owes",
    // which cancels the debt without touching any real expense.
    const row = await Backend.insert("expenses", {
      trip: TRIP_CODE, label: SETTLE_TAG, amount: Number(p.amount.toFixed(2)),
      currency: TRIP.home_currency || TRIP.currency, paid_by: p.from, split_among: [p.to],
    });
    if (row) { state.expenses.push(row); renderBudget(); }
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
        <h3>📷 Just add a photo</h3>
        <p class="section-sub" style="margin:4px 0 10px">A screenshot of a confirmation, a boarding pass, a receipt. It saves straight away and names itself.</p>
        <button class="btn primary" id="vaultShot" style="width:100%">Add a photo</button>
        <div id="vaultShotMsg" class="r-sub" style="margin-top:8px"></div>
      </div>
      <div class="card">
        <h3>Add a confirmation</h3>
        <p class="section-sub" style="margin:4px 0 10px">When you want the number and a label alongside it.</p>
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
      </div>`).join("") : emptyState("🔐", "The vault is empty", "Stash confirmation numbers, booking PDFs, and reservation links here so nobody is digging through email at the airport.")}`;
    const fi = $("#confFile"), fl = $("#confFileLabel");
    fi.addEventListener("change", () => { fl.textContent = fi.files[0] ? "📎 " + fi.files[0].name : "📎 Attach file (optional)"; });
    // One tap, no form. The filename or today's date is a good enough label.
    $("#vaultShot").addEventListener("click", () => openPicker("image/*", async (f) => {
      const msg = $("#vaultShotMsg"); if (msg) msg.textContent = "Uploading…";
      const up = await Backend.uploadFile(TRIP_CODE, f);
      if (!up) { if (msg) msg.textContent = "Upload failed. Try again."; return; }
      const stem = String(f.name || "").replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
      const label = stem && !/^(img|image|photo|screenshot|pxl|dsc)[\s\d]*$/i.test(stem)
        ? stem.slice(0, 80)
        : "Photo, " + new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" });
      const row = await Backend.insert("confirmations", { trip: TRIP_CODE, category: "Other", label, confirmation_no: "", ...up, author: state.me || "" });
      if (row) { state.confirmations.unshift(row); renderVault(); }
      else if (msg) msg.textContent = "Couldn't save it. Try again.";
    }));
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
        </div>`).join("") : `<div style="grid-column:1/-1">${emptyState("📸", "No photos yet", "This is the shared album. Everything anyone adds shows up for the whole group, live.")}</div>`}
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
            </div>`).join("") : emptyState("📝", "Nothing on this list yet", "Add the first item above. Everyone sees the same list, so it's a good spot for shared to-dos.")}
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
      const row = state.notes.find((x) => String(x.id) === String(b.dataset.notedel));
      if (!row) return;
      await deleteWithUndo("notes", row, row.text || "Note",
        () => { state.notes = state.notes.filter((x) => String(x.id) !== String(row.id)); },
        (back) => state.notes.push(back));
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
            ${commentBlock("idea:" + i.id)}
          </div>
          <div class="vote"><button class="${on ? "voted" : ""}" data-idea="${i.id}">👍</button><span class="vcount">${voters.length || ""}</span></div>
        </div>`;
      }).join("") : emptyState("💡", "No ideas yet", "Drop anything the group might want to do, even half-formed. Others thumbs-up what they like, so the good ones rise to the top.")}
      <div class="card">
        <h3>Add an idea</h3>
        <div class="expense-add">
          <input id="ideaTitle" placeholder="Your idea" />
          <input id="ideaTag" placeholder="Where / when (optional)" />
          <input id="ideaNote" placeholder="One line about it (optional)" />
          <button class="btn primary" id="ideaAdd">Post idea</button>
        </div>
      </div>`;
    bindComments(s);
    s.querySelectorAll("[data-idea]").forEach((b) => b.addEventListener("click", () => setVote("idea", b.dataset.idea, "up")));
    s.querySelectorAll("[data-iddel]").forEach((b) => b.addEventListener("click", async () => {
      const row = state.ideas.find((x) => String(x.id) === String(b.dataset.iddel));
      if (!row) return;
      await deleteWithUndo("ideas", row, row.title || "Idea",
        () => { state.ideas = state.ideas.filter((x) => String(x.id) !== String(row.id)); },
        (back) => state.ideas.push(back));
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
      s.innerHTML = `<div class="section-title">${esc(TRIP.destination || "Destination")} guide</div>
        <div class="section-sub">Local knowledge for this trip, written for your exact dates.</div>
        ${emptyState("📖", "No guide yet", isHost()
          ? "Run <b>✨ Set up my trip</b> on the Plan tab and you'll get practical local knowledge here: money, transit, etiquette, what to pack for the season, plus a neighborhood breakdown for every stop."
          : "Once someone runs the ✨ AI setup, this fills with local know-how for your dates: money, getting around, what to pack, and the lay of each neighborhood.",
          isHost() ? "Go to the Plan tab" : "", "itinerary")}`;
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
      ${outfitsOn() && (state.days || []).length ? `<div class="outfit-line" data-go="outfits" style="margin:12px 0 16px">👗 <span>${
        outfitCount() ? `You have <b>${outfitCount()}</b> day${outfitCount() === 1 ? "" : "s"} of outfits planned. Check the pieces are on this list.`
                      : "Work out what you're wearing each day first, with the dress codes and the weather."
      }</span><span class="of-go">›</span></div>` : ""}
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
  let chatLog = null;      // [{role, content, photo}]
  let pendingDays = null;  // days block awaiting Apply
  let pendingImage = null; // {media_type, data, preview} attached to the next send
  /* A photo straight off a phone is many times bigger than the AI needs, and an
     iPhone hands over HEIC that nothing else reads. Drawing it to a canvas and
     re-encoding as JPEG fixes both at once. */
  function shrinkForAI(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onerror = () => reject(new Error("Couldn't read that file"));
      fr.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error("Couldn't open that image"));
        img.onload = () => {
          const max = 1400;
          const scale = Math.min(1, max / Math.max(img.width, img.height));
          const w = Math.max(1, Math.round(img.width * scale)), h = Math.max(1, Math.round(img.height * scale));
          const c = document.createElement("canvas");
          c.width = w; c.height = h;
          c.getContext("2d").drawImage(img, 0, 0, w, h);
          const url = c.toDataURL("image/jpeg", 0.82);
          const data = url.split(",")[1] || "";
          if (!data) return reject(new Error("Couldn't convert that image"));
          resolve({ media_type: "image/jpeg", data, preview: url });
        };
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }
  /* Safari only opens a file picker from inside a real tap, and only for an
     input that is actually in the document. Call this straight from the click
     handler: any timer in between loses the gesture and iOS ignores it. */
  function openPicker(accept, onFile) {
    const inp = document.createElement("input");
    inp.type = "file";
    inp.accept = accept;
    inp.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0;width:1px;height:1px";
    document.body.appendChild(inp);
    const done = () => { if (inp.parentNode) inp.parentNode.removeChild(inp); };
    inp.addEventListener("change", async () => {
      const f = inp.files && inp.files[0];
      if (f) { try { await onFile(f); } catch (e) { console.warn("picker", e); } }
      done();
    });
    inp.addEventListener("cancel", done);
    inp.click();
  }
  function pickChatPhoto(autoSend) {
    const say = (msg) => { const st = $("#chatStatus"); if (st) st.textContent = msg; };
    openPicker("image/*", async (f) => {
      say("Reading the photo…");
      try {
        pendingImage = await shrinkForAI(f);
        renderAssistant();
        // A screenshot of a tee sheet is already the whole request. Read it now
        // rather than making them hit Send to say what they clearly meant.
        if (autoSend) sendChat();
        else say("Photo attached. Add a note if you want, then hit Send.");
      } catch (e) {
        pendingImage = null;
        renderAssistant();
        say((e && e.message ? e.message : "Couldn't read that image") + ". A screenshot usually works.");
      }
    });
  }

  /* ---- Reading an assistant reply ------------------------------------------
     The model is told to skip markdown and never to use an em dash. It mostly
     listens, and "mostly" is not a standard. So the answer is cleaned on the
     way in rather than hoped for: dashes become the punctuation they were
     standing in for, and the bold markers that do slip through get rendered
     instead of shown as asterisks.
     ------------------------------------------------------------------------ */
  function deDash(t) {
    return String(t == null ? "" : t)
      // " word - word " reads fine; the em dash is the thing to lose
      .replace(/\s*\u2014\s*/g, ", ")
      .replace(/\s*\u2013\s*/g, " to ")
      .replace(/,\s*,/g, ",")
      .replace(/,\s*([.!?;:])/g, "$1");
  }
  /* Escape first, then promote the few markers worth showing. Order matters:
     the other way round would let a reply inject markup. */
  function richText(t) {
    let h = esc(deDash(t));
    h = h.replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>");
    h = h.replace(/^\s*#{1,6}\s*(.+)$/gm, "<b>$1</b>");
    h = h.replace(/^\s*[-*\u2022]\s+(.+)$/gm, "\u00b7 $1");
    return h;
  }
  function renderAssistant() {
    const s = $("#screen-assistant");
    if (chatLog == null) chatLog = LS.get("chat", []);
    s.innerHTML = `
      <div class="section-title">Assistant</div>
      <div class="section-sub">Knows this trip: the plan, the votes, the dates. Ask anything, or tell it to change the itinerary.</div>
      <div id="chatFeed">
        ${chatLog.length ? chatLog.map((m) => `<div class="chat-msg ${m.role}">${m.photo ? "📷 " : ""}${m.role === "assistant" ? richText(m.content) : esc(m.content)}</div>`).join("")
          : `<div class="card ai-card">
              <h3>📋 Paste your schedule and I'll build it</h3>
              <p class="section-sub" style="margin:4px 0 10px">However you have it: a text from the group, a list of tee times, an email, or a photo of the confirmation. I'll turn it into days on the Plan tab for you to approve.</p>
              <button class="btn primary" id="chatPaste" style="width:100%;margin-bottom:8px">Paste a schedule</button>
              <button class="btn ghost" id="chatPhoto" style="width:100%">📷 Upload a photo of it</button>
            </div>
            <div class="card"><h3>✨ Or just ask</h3><p class="section-sub" style="margin:4px 0 10px">I know your dates, stops, itinerary, votes and who's coming.</p><div class="r-sub" style="line-height:2">
              “What's our most packed day, and how would you lighten it?”<br>
              “Where should we eat near our first stop the night we land?”<br>
              “Rework day 3 to be more chill”<br>
              “Move the Saturday tee time an hour earlier”</div></div>`}
      </div>
      ${pendingDays ? `<div class="card" style="border-color:var(--matcha)">
        <h3>🪄 Proposed itinerary change</h3>
        <div class="r-sub" style="margin:6px 0 10px;line-height:1.7">${pendingDays.map((d) => {
          const f = fmtDate(d.date);
          const bits = (d.items || []).map((i) => `${i.time ? i.time + " " : ""}${esc(i.title)}${i.where ? " @ " + esc(i.where) : ""}`);
          return `<b>${f.wd} ${f.mon} ${f.day}</b> · ${esc(d.title)}${bits.length ? `<br><span style="opacity:.8">${bits.join("<br>")}</span>` : ""}`;
        }).join("<br><br>")}</div>
        <p class="section-sub" style="margin:0 0 10px;font-size:11.5px">Applying replaces those dates in the plan. Everything else stays put.</p>
        <div class="btn-row">
          <button class="btn primary" id="chatApply" style="flex:2">Apply to the plan</button>
          <button class="btn ghost" id="chatDismiss" style="flex:1">Dismiss</button>
        </div>
      </div>` : ""}
      <div class="card" style="position:sticky;bottom:calc(var(--nav-h) + 10px)">
        ${pendingImage ? `<div class="chat-attach">
          <img src="${pendingImage.preview}" alt="Attached photo" />
          <div class="r-sub" style="flex:1">Photo ready to send. I'll read the times and places off it.</div>
          <button class="btn danger" id="chatDrop">✕</button>
        </div>` : ""}
        <div style="display:flex;gap:8px">
          <button class="btn ghost" id="chatCam" aria-label="Attach a photo" style="padding:12px 13px;font-size:17px">📷</button>
          <textarea id="chatInput" rows="1" placeholder="Ask, paste a schedule, or attach a photo…" style="flex:1;padding:12px;border:1px solid var(--line);border-radius:var(--r-sm);font-size:15px;background:#fffdfa;color:var(--ink);font-family:inherit;resize:none;max-height:40vh"></textarea>
          <button class="btn primary" id="chatSend">Send</button>
        </div>
        <div id="chatStatus" class="r-sub" style="margin-top:6px"></div>
      </div>`;
    const send = () => sendChat();
    $("#chatSend").addEventListener("click", send);
    $("#chatCam").addEventListener("click", () => pickChatPhoto(false));
    const cph = $("#chatPhoto"); if (cph) cph.addEventListener("click", () => pickChatPhoto(true));
    const cd = $("#chatDrop"); if (cd) cd.addEventListener("click", () => { pendingImage = null; renderAssistant(); });
    const cp = $("#chatPaste"); if (cp) cp.addEventListener("click", () => {
      const inp = $("#chatInput");
      inp.value = "Here is our schedule, please add it to the plan:\n\n";
      inp.focus();
      try { inp.setSelectionRange(inp.value.length, inp.value.length); } catch (e) { /* noop */ }
    });
    const ci = $("#chatInput");
    ci.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey && !e.metaKey) { e.preventDefault(); send(); } });
    ci.addEventListener("input", () => { ci.style.height = "auto"; ci.style.height = Math.min(ci.scrollHeight, window.innerHeight * 0.4) + "px"; });
    const ap = $("#chatApply"); if (ap) ap.addEventListener("click", applyChatDays);
    const dm = $("#chatDismiss"); if (dm) dm.addEventListener("click", () => { pendingDays = null; renderAssistant(); });
    const feed = $("#chatFeed"); if (feed && chatLog.length) window.scrollTo(0, document.body.scrollHeight);
  }
  /* ---- What guests are asking ------------------------------------------------
     Answering a guest is table stakes. The valuable part is that the hosts see
     what keeps being asked and can answer it once, for everyone, instead of
     guessing in advance what people will want to know. Rides on the comments
     table under a reserved topic, so no migration.
     -------------------------------------------------------------------------- */
  const ASK_TOPIC = "askedq";
  const askedQuestions = () => (state.comments || []).filter((c) => c.topic === ASK_TOPIC);
  async function logQuestion(text) {
    const body = String(text || "").trim();
    if (!body || body.length > 300) return;
    // only real questions, not "add this to the plan"
    if (!/\?\s*$/.test(body) && !/^(what|when|where|who|how|can|is|are|do|does|should|will)\b/i.test(body)) return;
    const row = await Backend.insert("comments", { trip: TRIP_CODE, topic: ASK_TOPIC, body: body.slice(0, 300), author: state.me || "" });
    if (row) state.comments.push(row);
  }
  function askedCard() {
    if (!isHost()) return "";
    const qs = askedQuestions();
    if (!qs.length) return "";
    const L = TRIP.links || {};
    const inFaq = new Set((L.faq || []).map((f) => String(f.q).toLowerCase()));
    const open = qs.filter((q) => !inFaq.has(String(q.body).toLowerCase()));
    if (!open.length) return "";
    return `<div class="card" style="border-color:var(--gold-soft)">
      <h3>💬 What people are asking</h3>
      <p class="section-sub" style="margin:4px 0 12px">Questions guests put to the assistant. Answer one here and every guest gets it from then on, without you being asked again.</p>
      ${open.slice(0, 6).map((q) => {
        const who = byId(q.author);
        return `<div style="padding:10px 0;border-top:1px solid var(--line-2)">
          <div class="r-title" style="font-size:14px">${esc(q.body)}</div>
          <div class="r-sub" style="margin:2px 0 8px">${who ? esc(who.name.split(" ")[0]) : "A guest"}${q.created_at ? " · " + fmtWhen(q.created_at) : ""}</div>
          <div style="display:flex;gap:8px">
            <input data-ansq="${esc(q.id)}" placeholder="Your answer, once, for everyone" style="flex:1;padding:10px 11px;border:1px solid var(--line);border-radius:var(--r-sm);font-size:14px" />
            <button class="btn primary" data-ansgo="${esc(q.id)}" style="flex:none">Answer</button>
          </div>
        </div>`;
      }).join("")}
      <div id="askMsg" class="r-sub" style="margin-top:10px"></div>
    </div>`;
  }
  function bindAsked(root) {
    (root || document).querySelectorAll("[data-ansgo]").forEach((b) => b.addEventListener("click", async () => {
      const id = b.dataset.ansgo;
      const inp = (root || document).querySelector(`[data-ansq="${id}"]`);
      const a = inp && inp.value.trim();
      if (!a) { const m = $("#askMsg"); if (m) m.textContent = "Type the answer first."; return; }
      const q = askedQuestions().find((x) => String(x.id) === String(id));
      if (!q) return;
      const faq = [...((TRIP.links || {}).faq || []), { q: q.body, a }].slice(-20);
      const ok = await saveLinks({ faq }, []);
      const m = $("#askMsg");
      if (m) m.textContent = ok ? "Added to the FAQ. Guests see it now, and so does the assistant." : "Saved here, will sync when you're back online.";
      renderCurrent();
    }));
  }
  async function sendChat() {
    const inp = $("#chatInput"), st = $("#chatStatus");
    const text = inp.value.trim();
    const img = pendingImage;
    if (!text && !img) return;
    chatLog.push({ role: "user", content: text || "Here is our schedule. Please read it and add it to the plan.", photo: !!img });
    if (isWedding() && !isHost() && text) logQuestion(text);
    // The base64 never goes into storage; it would fill the quota in a few sends.
    LS.set("chat", chatLog.slice(-30));
    inp.value = "";
    pendingImage = null;
    renderAssistant();
    $("#chatStatus").textContent = img ? "✨ Reading the photo…" : "✨ Thinking…";
    try {
      const cfg = window.CARAVAN_CONFIG;
      const history = chatLog.slice(-12).map((m) => ({ role: m.role, content: m.content }));
      if (img) {
        const last = history[history.length - 1];
        last.content = [
          { type: "image", source: { type: "base64", media_type: img.media_type, data: img.data } },
          { type: "text", text: last.content },
        ];
      }
      const res = await fetch(`${cfg.url}/functions/v1/generate-plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + cfg.anonKey, "apikey": cfg.anonKey },
        body: JSON.stringify({ code: TRIP_CODE, mode: "chat", messages: history }),
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
     WEATHER - Open-Meteo. No key, no account, no signup.

     A trip booked in August for the following April has no forecast, and
     pretending otherwise would be worse than saying nothing. So there are two
     honest answers and the app always says which one you are looking at:
       inside 16 days  → the real forecast
       further out     → the same calendar week averaged over the last three
                         years, labelled "typical"
     Everything is cached per device, because the answer for a day six months
     out does not change hour to hour.
     ====================================================================== */
  const WMO = {
    0: ["☀️", "Clear"], 1: ["🌤️", "Mostly clear"], 2: ["⛅️", "Partly cloudy"], 3: ["☁️", "Cloudy"],
    45: ["🌫️", "Fog"], 48: ["🌫️", "Freezing fog"],
    51: ["🌦️", "Light drizzle"], 53: ["🌦️", "Drizzle"], 55: ["🌦️", "Heavy drizzle"],
    56: ["🌧️", "Freezing drizzle"], 57: ["🌧️", "Freezing drizzle"],
    61: ["🌧️", "Light rain"], 63: ["🌧️", "Rain"], 65: ["🌧️", "Heavy rain"],
    66: ["🌧️", "Freezing rain"], 67: ["🌧️", "Freezing rain"],
    71: ["🌨️", "Light snow"], 73: ["🌨️", "Snow"], 75: ["❄️", "Heavy snow"], 77: ["🌨️", "Snow grains"],
    80: ["🌦️", "Showers"], 81: ["🌦️", "Showers"], 82: ["⛈️", "Heavy showers"],
    85: ["🌨️", "Snow showers"], 86: ["🌨️", "Snow showers"],
    95: ["⛈️", "Thunderstorms"], 96: ["⛈️", "Thunderstorms"], 99: ["⛈️", "Thunderstorms"],
  };
  const isoDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const cToF = (c) => Math.round(c * 9 / 5 + 32);

  /* A weather line is never worth a spinner that lasts forever. If the network
     is slow or captive-portal'd, give up quietly and say so. */
  async function wxGet(url) {
    const ac = typeof AbortController === "function" ? new AbortController() : null;
    const t = setTimeout(() => { try { ac && ac.abort(); } catch (e) {} }, 8000);
    try {
      const r = await fetch(url, ac ? { signal: ac.signal } : undefined);
      return r.ok ? await r.json() : null;
    } catch (e) { return null; }
    finally { clearTimeout(t); }
  }

  /* Open-Meteo's own geocoder, so there is still exactly one weather service
     to trust and nothing else to sign up for. */
  async function geoOf(place) {
    const key = String(place || "").trim().toLowerCase();
    if (!key) return null;
    const cache = LSG.get("geo", {});
    if (cache[key]) return cache[key].lat == null ? null : cache[key];
    try {
      const d = await wxGet(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(place)}&count=1&language=en&format=json`);
      if (!d) return null;
      const hit = d.results && d.results[0];
      // remember the misses too, so a made-up stop name is not looked up forever
      const out = hit ? { lat: hit.latitude, lon: hit.longitude, label: [hit.name, hit.country].filter(Boolean).join(", ") } : { lat: null };
      cache[key] = out; LSG.set("geo", cache);
      return out.lat == null ? null : out;
    } catch (e) { return null; }
  }

  async function wxForecast(g, date) {
    const u = `https://api.open-meteo.com/v1/forecast?latitude=${g.lat}&longitude=${g.lon}` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&start_date=${date}&end_date=${date}`;
    const d = await wxGet(u);
    const dl = d && d.daily;
    if (!dl || !dl.time || !dl.time.length || dl.temperature_2m_max[0] == null) return null;
    return { kind: "forecast", hi: dl.temperature_2m_max[0], lo: dl.temperature_2m_min[0],
             rain: dl.precipitation_probability_max[0], code: dl.weather_code[0] };
  }

  /* The same week, three years running. A single year is weather; three is
     closer to what you should actually pack for. */
  async function wxTypical(g, date) {
    const y = +date.slice(0, 4), md = date.slice(5);
    const reqs = [];
    for (let n = 1; n <= 3; n++) {
      const c = new Date(`${y - n}-${md}T12:00:00`);
      if (isNaN(c.getTime())) continue; // Feb 29 in a year that had no Feb 29
      const s = isoDay(new Date(c.getTime() - 3 * 864e5)), e = isoDay(new Date(c.getTime() + 3 * 864e5));
      reqs.push(wxGet(`https://archive-api.open-meteo.com/v1/archive?latitude=${g.lat}&longitude=${g.lon}` +
        `&start_date=${s}&end_date=${e}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=auto`));
    }
    if (!reqs.length) return null;
    const his = [], los = [];
    let wet = 0, tot = 0;
    (await Promise.all(reqs)).forEach((d) => {
      const dl = d && d.daily;
      if (!dl || !dl.time) return;
      dl.time.forEach((_, i) => {
        const hi = dl.temperature_2m_max[i], lo = dl.temperature_2m_min[i];
        if (hi == null || lo == null) return;
        his.push(hi); los.push(lo); tot++;
        if ((dl.precipitation_sum[i] || 0) >= 1) wet++;
      });
    });
    if (!his.length) return null;
    const avg = (a) => a.reduce((s, x) => s + x, 0) / a.length;
    return { kind: "typical", hi: avg(his), lo: avg(los), rain: tot ? Math.round(wet / tot * 100) : null };
  }

  const wxInFlight = {};
  async function wxFor(place, date) {
    if (!place || !/^\d{4}-\d{2}-\d{2}$/.test(date || "")) return null;
    const g = await geoOf(place);
    if (!g) return null;
    const key = `${g.lat.toFixed(2)},${g.lon.toFixed(2)}|${date}`;
    const cache = LSG.get("wx", {});
    const hit = cache[key];
    if (hit && hit.exp > Date.now()) return hit.v;
    if (wxInFlight[key]) return wxInFlight[key];
    const out = (async () => {
      const away = Math.round((new Date(date + "T12:00:00") - new Date(isoDay(new Date()) + "T12:00:00")) / 864e5);
      let v = null;
      try { v = away >= 0 && away <= 15 ? await wxForecast(g, date) : await wxTypical(g, date); }
      catch (e) { v = null; }
      if (v) {
        const c = LSG.get("wx", {});
        const keys = Object.keys(c);
        // a long trip touches a lot of keys; keep the store from growing forever
        if (keys.length > 300) keys.forEach((k) => { if (c[k].exp < Date.now()) delete c[k]; });
        c[key] = { v, exp: Date.now() + (v.kind === "forecast" ? 6 * 36e5 : 60 * 864e5) };
        LSG.set("wx", c);
      }
      delete wxInFlight[key];
      return v;
    })();
    wxInFlight[key] = out;
    return out;
  }

  function wxEmoji(w) {
    if (!w) return "🌡️";
    if (w.kind === "forecast") return (WMO[w.code] || ["🌡️"])[0];
    return w.rain >= 40 ? "🌧️" : w.rain >= 20 ? "🌤️" : "☀️";
  }
  function wxLine(w, place) {
    if (!w) return "";
    const word = w.kind === "forecast" ? (WMO[w.code] || ["", ""])[1] : "";
    const t = (c) => `${cToF(c)}°F / ${Math.round(c)}°C`;
    const rain = w.rain == null ? "" :
      w.kind === "forecast" ? `${Math.round(w.rain)}% chance of rain` : `Rain on ${w.rain}% of those days`;
    const head = `${wxEmoji(w)} ${w.kind === "forecast" ? "Forecast" : "Typical for this week"}${place ? ` in ${esc(place)}` : ""}${word ? `, ${word.toLowerCase()}` : ""}`;
    return `<div class="of-wx-head">${head}</div>
      <div class="of-wx-row"><span>High <b>${t(w.hi)}</b></span><span>Low <b>${t(w.lo)}</b></span>${rain ? `<span>${rain}</span>` : ""}</div>`;
  }
  const wxShort = (w) => (w ? `${wxEmoji(w)} ${cToF(w.hi)}° / ${cToF(w.lo)}°` : "");
  /* Which animated texture the strip wears. Driven by the data, not decoration
     for its own sake: a week of cards becomes readable at a glance. */
  function wxCond(w) {
    if (!w) return "";
    if (w.kind === "forecast") {
      const c = w.code;
      if (c >= 71 && c <= 77 || c === 85 || c === 86) return "snow";
      if (c >= 51 && c <= 67 || c >= 80 && c <= 82 || c >= 95) return "rain";
      if (c <= 1) return "sun";
      return "cloud";
    }
    if (w.rain >= 45) return "rain";
    if (w.rain <= 20) return "sun";
    return "cloud";
  }
  /* Weather is per stop where the trip has stops, so Tokyo and Kyoto do not
     share a forecast just because they share a trip. */
  const wxPlace = (d) => (d.stop && stopById(d.stop).label) || TRIP.destination || "";

  /* =========================================================================
     OUTFITS - what each person is wearing, day by day.

     Rides on the votes table (kind "outfit", topic = day id, choice = the
     text), so it inherits the unique-per-person constraint, the offline queue
     and the trip's row policy without a migration.

     It is deliberately visible to the group. There is no private space in a
     trip whose join code is the only key, and pretending otherwise would be a
     lie. Visible is also the more useful answer: the point of a group knowing
     the dress code is that nobody turns up in the wrong thing.
     ====================================================================== */
  const OUTFIT = "outfit";
  /* Trips only. A wedding guest list turns "what is everyone wearing" into a
     wall of eighty strangers, and what a guest actually wants there is the
     host's dress code, which the Plan tab already carries. */
  const outfitsOn = () => !isWedding();
  const outfitsFor = (dayId) => state.allVotes.filter((v) => v.kind === OUTFIT && v.topic === dayId);
  const outfitCount = () => (state.days || []).filter((d) => myOutfit(d.id)).length;
  function myOutfit(dayId) {
    const r = outfitsFor(dayId).find((v) => v.voter === state.me);
    return r ? r.choice : "";
  }
  async function setOutfit(dayId, text) {
    if (!state.me) { openWho(); return false; }
    const t = String(text || "").trim().slice(0, 240);
    state.allVotes = state.allVotes.filter((v) => !(v.kind === OUTFIT && v.topic === dayId && v.voter === state.me));
    if (t) state.allVotes.push({ kind: OUTFIT, topic: dayId, choice: t, voter: state.me });
    await Backend.castVote(TRIP_CODE, OUTFIT, dayId, t || null, state.me);
    return true;
  }
  /* Every dress code on the day, deduped, in the order they happen. */
  function dressOf(d) {
    const seen = new Set(), out = [];
    (d.items || []).forEach((i) => {
      const v = (i.dress || "").trim();
      if (!v || seen.has(v.toLowerCase())) return;
      seen.add(v.toLowerCase()); out.push(v);
    });
    return out;
  }
  const dayLineup = (d) => (d.items || [])
    .map((i) => `${i.time ? i.time + " " : ""}${i.title}${i.where ? " @ " + i.where : ""}${i.dress ? ` (dress: ${i.dress})` : ""}`);

  let outfitOpen = {};   // day id -> the full list of others is showing
  let lastOutfitCount = null;
  function renderOutfits() {
    const s = $("#screen-outfits");
    const days = state.days || [];
    if (!outfitsOn()) {
      s.innerHTML = `<div class="section-title">Outfits</div>${emptyState("👗", "Not for weddings",
        "Every event already carries its dress code on the Plan tab, which is what a guest actually needs. Comparing outfits across a whole guest list would be noise.", "Go to the Plan tab", "itinerary")}`;
      return;
    }
    if (!days.length) {
      s.innerHTML = `<div class="section-title">Outfits</div>${emptyState("👗", "No days yet",
        "Once the plan has days on it, this is where you work out what you are wearing to each one. Weather and dress codes included.", "Go to the Plan tab", "itinerary")}`;
      return;
    }
    const today = isoDay(new Date());
    const mineCount = outfitCount();
    const myDays = days.filter((d) => myOutfit(d.id));
    s.innerHTML = `
      <div class="section-title">Outfits</div>
      <div class="section-sub">What you are wearing each day, with the dress code and the weather next to it. Everyone on the trip can see these, which is the point: nobody turns up in the wrong thing.</div>
      <div class="card" style="padding:12px 14px">
        <div class="r-sub">${mineCount ? `You have planned <b id="ofCount">${mineCount}</b> of ${days.length} day${days.length === 1 ? "" : "s"}.` : "Nothing planned yet. Start with the day that has a dress code."}</div>
      </div>
      ${days.map((d) => {
        const f = fmtDate(d.date);
        const mine = myOutfit(d.id);
        const others = outfitsFor(d.id).filter((v) => v.voter !== state.me && byId(v.voter));
        const codes = dressOf(d);
        const past = d.date < today;
        const sug = LS.get("outfitsug", {})[d.id];
        const sameAs = myDays.filter((x) => x.id !== d.id);
        return `<div class="card outfit-card${past ? " past" : ""}${mine ? " planned" : ""}" data-outfit="${d.id}">
          <div class="of-head">
            <div class="day-date" style="flex:0 0 auto"><div class="d">${f.day}</div><div class="m">${f.wd} ${f.mon}</div></div>
            <div style="flex:1;min-width:0">
              <h3 style="margin:0">${esc(d.title)}</h3>
              ${codes.length ? `<div class="of-codes">${codes.map((c) => `<span class="of-code">👔 ${esc(c)}</span>`).join("")}</div>`
                : isWedding() ? `<div class="r-sub">No dress code on this one</div>` : ""}
            </div>
          </div>
          <div class="of-wx" data-wx="${d.id}">Checking the weather…</div>
          ${(d.items || []).length ? `<div class="r-sub of-lineup">${(d.items || []).slice(0, 6).map((i) =>
            `${i.time ? `<b>${esc(i.time)}</b> ` : ""}${esc(i.title)}`).join("<br>")}</div>` : ""}
          <textarea data-ofin="${d.id}" rows="2" placeholder="Navy linen suit, no tie, brown loafers…" style="width:100%;padding:11px;margin-top:10px;border:1px solid var(--line);border-radius:var(--r-sm);font-size:14.5px;background:#fffdfa;color:var(--ink);font-family:inherit;resize:vertical">${esc(mine)}</textarea>
          <div class="btn-row" style="margin-top:8px">
            <button class="btn primary" data-ofsave="${d.id}" style="flex:1.4">${mine ? "Update" : "Save"}</button>
            <button class="btn ghost" data-ofai="${d.id}" style="flex:1.6">✨ What should I wear?</button>
            ${mine ? `<button class="btn danger" data-ofclear="${d.id}" style="flex:0 0 auto">✕</button>` : ""}
          </div>
          ${sameAs.length ? `<div class="r-sub" style="margin-top:8px">Same as
            ${sameAs.slice(0, 4).map((x) => {
              const g = fmtDate(x.date);
              return `<button class="tl-map" data-ofday="${d.id}#${x.id}" style="margin-right:6px">${g.wd} ${g.day}</button>`;
            }).join("")}</div>` : ""}
          <div class="r-sub" data-ofmsg="${d.id}" style="margin-top:6px"></div>
          ${sug ? `<div class="of-sug">
            <div class="r-sub" style="margin-bottom:8px"><b>✨ Suggested for this day</b></div>
            ${sug.options.map((o, i) => `<button class="of-pick" data-ofuse="${d.id}#${i}">${esc(o)}</button>`).join("")}
            ${sug.bring ? `<div class="r-sub" style="margin-top:8px">🧳 <b>Bring:</b> ${esc(sug.bring)}</div>` : ""}
            <div class="tl-map" data-ofdrop="${d.id}" style="margin-top:8px;cursor:pointer">Dismiss</div>
          </div>` : ""}
          ${others.length ? `<div class="of-others">
            ${(outfitOpen[d.id] ? others : others.slice(0, 3)).map((v) => {
              const t = byId(v.voter);
              return `<div class="of-other"><span class="avatar vchip" style="background:${t.color}">${initials(t.name)}</span>
                <div style="flex:1;min-width:0"><b>${esc(t.name.split(" ")[0])}</b> ${esc(v.choice)}</div>
                <button class="tl-map" data-ofcopy="${d.id}#${v.voter}">Same</button></div>`;
            }).join("")}
            ${others.length > 3 ? `<button class="of-more" data-ofmore="${d.id}">${outfitOpen[d.id]
              ? "Show fewer" : `and ${others.length - 3} more ›`}</button>` : ""}
          </div>` : `<div class="r-sub of-others" style="opacity:.7">Nobody else has planned this day yet.</div>`}
        </div>`;
      }).join("")}
      <div class="card" style="margin-top:4px">
        <h3>🧳 Packing</h3>
        <p class="section-sub" style="margin:4px 0 10px">Once these are settled, the packing list is the place to make sure the pieces actually come with you.</p>
        <button class="btn ghost" data-go="packing" style="width:100%">Open the packing list</button>
      </div>`;
    bindOutfits();
    fillOutfitWeather();
    countUp($("#ofCount"), lastOutfitCount, mineCount);
    lastOutfitCount = mineCount;
    typeInSuggestion();
  }
  const calm = () => window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  /* A number that ticks reads as something that happened. A number that jumps
     reads as a redraw. */
  function countUp(el, from, to) {
    if (!el || from == null || from === to || calm()) return;
    const steps = Math.min(Math.abs(to - from), 6), dir = to > from ? 1 : -1;
    let cur = to - dir * steps, i = 0;
    el.textContent = cur;
    const tick = setInterval(() => {
      cur += dir; i++;
      el.textContent = cur;
      if (i >= steps) { clearInterval(tick); el.textContent = to; }
    }, 70);
  }
  /* The options write themselves in, so the assistant reads as thinking rather
     than fetching. Only ever on the suggestion that just arrived. */
  let freshSuggestion = null;
  function typeInSuggestion() {
    const id = freshSuggestion; freshSuggestion = null;
    if (!id || calm()) return;
    const card = $(`[data-outfit="${id}"]`);
    if (!card) return;
    card.querySelectorAll(".of-pick").forEach((btn, n) => {
      const full = btn.textContent;
      btn.textContent = "";
      btn.style.minHeight = btn.offsetHeight + "px";
      let i = 0;
      setTimeout(() => {
        const t = setInterval(() => {
          btn.textContent = full.slice(0, ++i);
          if (i >= full.length) { clearInterval(t); btn.style.minHeight = ""; }
        }, 14);
      }, n * 260);
    });
  }

  function settle(id) {
    const card = $(`[data-outfit="${id}"]`);
    if (!card || calm()) return;
    card.classList.add("just-saved");
    setTimeout(() => card.classList.remove("just-saved"), 600);
  }

  /* The weather is a network call per day, so the screen draws first and the
     lines fill themselves in. A day that cannot be located just says so. */
  async function fillOutfitWeather() {
    for (const d of state.days || []) {
      const el = $(`[data-wx="${d.id}"]`);
      if (!el) continue;
      const place = wxPlace(d);
      if (!place) { el.textContent = "Add a destination in Settings to see the weather."; continue; }
      const w = await wxFor(place, d.date);
      const still = $(`[data-wx="${d.id}"]`);
      if (!still) return; // screen moved on
      still.innerHTML = w ? wxLine(w, place) : `<span style="opacity:.7">No weather for ${esc(place)} right now.</span>`;
      if (w) still.dataset.cond = wxCond(w); else delete still.dataset.cond;
    }
  }

  function bindOutfits() {
    const s = $("#screen-outfits");
    if (!s || s.dataset.ofBound) return;
    s.dataset.ofBound = "1";
    s.addEventListener("click", async (e) => {
      const t = e.target;
      const msg = (id, m) => { const el = $(`[data-ofmsg="${id}"]`); if (el) el.textContent = m; };

      const save = t.closest("[data-ofsave]");
      if (save) {
        const id = save.dataset.ofsave;
        const box = $(`[data-ofin="${id}"]`);
        msg(id, "Saving…");
        const ok = await setOutfit(id, box ? box.value : "");
        if (ok) { renderOutfits(); settle(id); msg(id, "Saved ✓"); }
        return;
      }
      const more = t.closest("[data-ofmore]");
      if (more) {
        const id = more.dataset.ofmore;
        outfitOpen[id] = !outfitOpen[id];
        renderOutfits();
        return;
      }
      const same = t.closest("[data-ofday]");
      if (same) {
        const [id, from] = same.dataset.ofday.split("#");
        const box = $(`[data-ofin="${id}"]`);
        if (box) { box.value = myOutfit(from); box.focus(); msg(id, "Copied from that day. Tap Save to keep it."); }
        return;
      }
      const clr = t.closest("[data-ofclear]");
      if (clr) { await setOutfit(clr.dataset.ofclear, ""); renderOutfits(); return; }

      const copy = t.closest("[data-ofcopy]");
      if (copy) {
        const [id, voter] = copy.dataset.ofcopy.split("#");
        const row = outfitsFor(id).find((v) => v.voter === voter);
        const box = $(`[data-ofin="${id}"]`);
        if (row && box) { box.value = row.choice; box.focus(); msg(id, "Copied into your box. Tap Save to keep it."); }
        return;
      }
      const use = t.closest("[data-ofuse]");
      if (use) {
        const [id, i] = use.dataset.ofuse.split("#");
        const sug = LS.get("outfitsug", {})[id];
        const box = $(`[data-ofin="${id}"]`);
        if (sug && box) { box.value = sug.options[+i] || ""; box.focus(); msg(id, "Dropped in. Edit it however you like, then Save."); }
        return;
      }
      const drop = t.closest("[data-ofdrop]");
      if (drop) {
        const all = LS.get("outfitsug", {});
        delete all[drop.dataset.ofdrop];
        LS.set("outfitsug", all);
        renderOutfits();
        return;
      }
      const ai = t.closest("[data-ofai]");
      if (ai) { await suggestOutfit(ai.dataset.ofai); return; }
    });
  }

  /* Ask the assistant what to wear. It already has the trip in its system
     prompt, so all this has to add is the one thing it cannot know: the
     weather. Uses the existing chat endpoint, so there is nothing new to
     deploy. */
  async function suggestOutfit(dayId) {
    const d = (state.days || []).find((x) => x.id === dayId);
    if (!d) return;
    const msg = (m) => { const el = $(`[data-ofmsg="${dayId}"]`); if (el) el.textContent = m; };
    const btn = $(`[data-ofai="${dayId}"]`);
    if (btn) { btn.disabled = true; btn.style.opacity = ".6"; }
    msg("✨ Checking the weather and thinking…");
    try {
      const place = wxPlace(d);
      const w = place ? await wxFor(place, d.date) : null;
      const f = fmtDate(d.date);
      const weather = w
        ? `${w.kind === "forecast" ? "Forecast" : "Typical weather for that week (three year average, there is no forecast this far out)"} for ${place}: high ${cToF(w.hi)}F, low ${cToF(w.lo)}F${w.rain == null ? "" : `, ${w.rain}% ${w.kind === "forecast" ? "chance of rain" : "of days see rain"}`}.`
        : "No weather data available for that day, so keep the suggestions adaptable.";
      const lineup = dayLineup(d);
      const prompt = [
        `What should I wear on ${f.wd} ${f.mon} ${f.day}${place ? ` in ${place}` : ""}? The day is "${d.title}".`,
        lineup.length ? `Here is everything on that day:\n${lineup.map((l) => "- " + l).join("\n")}` : "There is nothing scheduled that day yet.",
        weather,
        `Give me two options. Reply in exactly this shape and nothing else:`,
        `Option 1: <one sentence naming real garments, layers and shoes>`,
        `Option 2: <a different one sentence>`,
        `Bring: <at most three extra things, comma separated>`,
        `Each option has to work for every event listed and for that weather, and has to respect any dress code above. Keep each option under 25 words. Do not assume my gender. Never use an em dash. Do not add any other text and do not change the itinerary.`,
      ].join("\n\n");
      const cfg = window.CARAVAN_CONFIG;
      const res = await fetch(`${cfg.url}/functions/v1/generate-plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + cfg.anonKey, "apikey": cfg.anonKey },
        body: JSON.stringify({ code: TRIP_CODE, mode: "chat", messages: [{ role: "user", content: prompt }] }),
      });
      const data = await res.json().catch(() => ({}));
      if (!data.ok) { msg("⚠️ " + fnError(res, data, "generate-plan")); return; }
      const parsed = parseOutfitReply(data.reply || "");
      if (!parsed.options.length) { msg("⚠️ Got an answer it couldn't read. Try once more."); return; }
      const all = LS.get("outfitsug", {});
      all[dayId] = parsed;
      LS.set("outfitsug", all);
      freshSuggestion = dayId;
      renderOutfits();
    } catch (e) {
      msg("⚠️ Couldn't reach the assistant. Check you're online.");
    } finally {
      const b = $(`[data-ofai="${dayId}"]`);
      if (b) { b.disabled = false; b.style.opacity = 1; }
    }
  }
  /* "Something went wrong" is not a fix. Say which wall you hit, because the
     three real ones each need a different thing done about them. */
  function fnError(res, data, name) {
    if (res.status === 404) return `The ${name} function isn't deployed on this Supabase project yet.`;
    if (res.status === 401 || res.status === 403) return `${name} is rejecting the key. Turn OFF "Verify JWT" on the function.`;
    if (data && data.error) return String(data.error);
    if (res.status >= 500) return `${name} errored (${res.status}). Check its logs in Supabase.`;
    return "Couldn't get a suggestion. Try again.";
  }

  /* The model is asked for a fixed shape, but a reply is still a reply, so
     read it loosely and fall back to whatever sentences came back. */
  function parseOutfitReply(text) {
    const lines = deDash(text).split(/\n+/).map((l) => l.trim()).filter(Boolean);
    const options = [], out = { options, bring: "" };
    lines.forEach((l) => {
      const o = l.match(/^\**\s*option\s*\d*\s*[:.)-]\s*(.+)$/i);
      if (o) { options.push(o[1].replace(/\*\*/g, "").trim().slice(0, 240)); return; }
      const b = l.match(/^\**\s*bring\s*[:.]\s*(.+)$/i);
      if (b) out.bring = b[1].replace(/\*\*/g, "").trim().slice(0, 200);
    });
    if (!options.length) {
      lines.filter((l) => l.length > 15 && !/^[#*]/.test(l)).slice(0, 2)
        .forEach((l) => options.push(l.replace(/^[-•]\s*/, "").slice(0, 240)));
    }
    return out;
  }

  /* One line on the day in the Plan tab, so the feature is where the dress
     codes already are instead of only behind the More menu. */
  function outfitLine(d) {
    if (!outfitsOn()) return "";
    const mine = myOutfit(d.id);
    const others = outfitsFor(d.id).filter((v) => v.voter !== state.me && byId(v.voter)).length;
    return `<div class="outfit-line" data-go="outfits">👗 <span>${mine ? `<b>You:</b> ${esc(mine)}` : "Plan what you're wearing"}${
      others ? ` <span style="opacity:.65">· ${others} other${others === 1 ? "" : "s"} planned</span>` : ""}</span><span class="of-go">›</span></div>`;
  }

  /* =========================================================================
     SETTINGS - edit the trip after creation
     ====================================================================== */
  /* Accepts a pasted list or CSV text. Takes the first column, skips a header
     row, strips quotes and stray numbering, and ignores blanks. */
  function parseGuestList(text) {
    const lines = String(text || "").split(/\r?\n/);
    const out = [];
    lines.forEach((line, i) => {
      let v = line.trim();
      if (!v) return;
      // first CSV column, respecting simple quoting
      const m = v.match(/^\s*"([^"]*)"\s*(?:,|$)/);
      v = m ? m[1] : v.split(",")[0];
      v = v.replace(/^\s*\d+[.)]\s*/, "").replace(/\s+/g, " ").trim();
      if (!v) return;
      if (i === 0 && /^(name|guest|guests?|full name|first|attendee)$/i.test(v)) return; // header
      if (v.length > 80) v = v.slice(0, 80);
      out.push(v);
    });
    return out;
  }
  /* A trip created in the wrong mode used to be stuck that way, which meant
     living with a seating chart and a run of show on a golf weekend. Nothing
     is destroyed either way: wedding data sits dormant in trip mode and comes
     straight back if they switch back. */
  async function switchMode() {
    const toWedding = !isWedding();
    const msg = $("#stModeMsg");
    const say = (t) => { if (msg) msg.textContent = t; };
    const warn = toWedding
      ? "Turn this into a wedding? Guests will be asked to RSVP, and only the hosts will be able to edit."
      : "Turn this into a group trip? The RSVPs, seating chart and Day of run sheet all disappear from the menu, and everyone can edit again. Nothing is deleted.";
    if (!confirm(warn)) return;
    say("Switching…");
    const patch = { mode: toWedding ? "wedding" : "trip" };
    // a wedding with no hosts is a wedding nobody can administer
    if (toWedding && !((TRIP.hosts || []).length)) patch.hosts = state.me ? [state.me] : (TRIP.travelers || []).map((t) => t.id);
    const ok = await Backend.updateTrip(TRIP_CODE, patch);
    if (!ok) { say("Couldn't switch it. Check you're online."); return; }
    Object.assign(TRIP, patch);
    document.body.classList.toggle("theme-wedding", isWedding());
    renderAll();
    renderCurrent();
    show("home");
  }

  /* Ask the worker that is actually serving the page, rather than trusting a
     constant in a file that might itself be the stale one. */
  function showBuild() {
    const el = $("#stBuild"); if (!el) return;
    if (!navigator.serviceWorker || !navigator.serviceWorker.controller) {
      el.textContent = "Running straight from the network, so this is the latest.";
      return;
    }
    const ch = new MessageChannel();
    const t = setTimeout(() => { el.textContent = "Couldn't ask the app which build it is."; }, 2000);
    ch.port1.onmessage = (e) => { clearTimeout(t); el.textContent = `Build ${e.data}`; };
    navigator.serviceWorker.controller.postMessage("which-build", [ch.port2]);
  }
  async function forceUpdate() {
    const msg = $("#stBuildMsg");
    const say = (t) => { if (msg) msg.textContent = t; };
    say("Fetching the latest…");
    try {
      if ("caches" in window) { const ks = await caches.keys(); await Promise.all(ks.map((k) => caches.delete(k))); }
      if (navigator.serviceWorker) {
        const rs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(rs.map((r) => r.unregister()));
      }
    } catch (e) { console.warn("forceUpdate", e); }
    say("Reloading…");
    setTimeout(() => location.reload(true), 400);
  }

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
        <label class="wiz-label">Venue name</label>${inp("wlVenue", (TRIP.links || {}).venue_name, "e.g. Hacienda del Mar")}
        <label class="wiz-label">Venue address</label>${inp("wlVenueAddr", (TRIP.links || {}).venue_address, "Street, city")}
        <label class="wiz-label">Venue website</label>${inp("wlVenueLink", (TRIP.links || {}).venue_link, "https://…")}
        <div class="r-sub" style="margin:10px 2px 0;font-size:11.5px">Room blocks are added on the <b>Stays</b> screen, one per hotel, so guests can pick.</div>
        <label class="wiz-label">Fallback room block link (if you only have one)</label>${inp("wlRoom", (TRIP.links || {}).roomblock, "https://…")}
        <label class="wiz-label">Room block deadline</label>${inp("wlDeadline", (TRIP.links || {}).deadline, "e.g. March 1")}
        <label class="wiz-label">Registry link</label>${inp("wlReg", (TRIP.links || {}).registry, "https://…")}
        <label class="wiz-label">Wedding website</label>${inp("wlSite", (TRIP.links || {}).site, "https://…")}
        <label class="wiz-label">RSVP deadline (shown on the RSVP card)</label>${inp("wlRsvpBy", (TRIP.links || {}).rsvp_deadline, "e.g. March 1")}
        <label class="wiz-label">Meal choices, comma separated (leave blank for none)</label>${inp("wlMeals", ((TRIP.links || {}).meals || []).join(", "), "Beef, Fish, Vegetarian")}
        <label class="wiz-label">Default seats per invitation</label>
        <select id="wlAllow" style="width:100%;padding:12px;border:1px solid var(--line);border-radius:var(--r-sm);font-size:14px;background:#fffdfa;color:var(--ink)">
          ${[1, 2, 3, 4, 5, 6].map((n) => `<option value="${n}" ${defaultAllowance() === n ? "selected" : ""}>${n} ${n === 1 ? "seat (no plus ones)" : "seats"}</option>`).join("")}
        </select>
        <div class="r-sub" style="margin:4px 2px 0;font-size:11.5px">Guests cannot RSVP for more than this. Override it per guest on the Crew tab.</div>
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
        ${isWedding() ? "" : `<label class="wiz-label">Kind of trip</label>
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px" id="stTypes">
          ${TRIP_TYPES.map((t) => `<button class="chip ${tripType() === t.id ? "active" : ""}" data-sttype="${t.id}">${t.emoji} ${t.label}</button>`).join("")}
        </div>`}
        <label class="wiz-label">Destination</label>
        <input id="stDest" data-suggest="city" autocomplete="off" value="${esc(TRIP.destination || "")}" placeholder="Start typing a city" style="width:100%;padding:12px;border:1px solid var(--line);border-radius:var(--r-sm);font-size:14px;background:#fffdfa;color:var(--ink)" />
        ${cityListHTML()}
        <div style="display:flex;gap:10px">
          <div style="flex:1"><label class="wiz-label">First day</label>${inp("stStart", TRIP.start_date, "", "date")}</div>
          <div style="flex:1"><label class="wiz-label">Last day</label>${inp("stEnd", TRIP.end_date, "", "date")}</div>
        </div>
        <div style="display:flex;gap:10px">
          <div style="flex:1"><label class="wiz-label">Their money</label>${inp("stCur", TRIP.currency, "JPY")}</div>
          <div style="flex:1"><label class="wiz-label">Your money</label>${inp("stHomeCur", TRIP.home_currency, "USD")}</div>
        </div>
        <div style="display:flex;gap:10px">
          <div style="flex:2"><label class="wiz-label">Where's home?</label>
            <input id="stHome" data-suggest="city" autocomplete="off" value="${esc(TRIP.home_city || "")}" placeholder="e.g. Chicago, USA" style="width:100%;padding:12px;border:1px solid var(--line);border-radius:var(--r-sm);font-size:14px;background:#fffdfa;color:var(--ink)" /></div>
          <div style="flex:1"><label class="wiz-label">Home airport</label>
            <input id="stHomeAir" maxlength="3" autocomplete="off" value="${esc(TRIP.home_airport || "")}" placeholder="ORD" style="width:100%;padding:12px;border:1px solid var(--line);border-radius:var(--r-sm);font-size:14px;text-transform:uppercase;background:#fffdfa;color:var(--ink)" /></div>
        </div>
        <label class="wiz-label">Home timezone</label>
        <input id="stHomeTz" list="tzlist2" value="${esc(TRIP.home_tz || Intl.DateTimeFormat().resolvedOptions().timeZone)}" style="width:100%;padding:12px;border:1px solid var(--line);border-radius:var(--r-sm);font-size:14px;background:#fffdfa;color:var(--ink)" />
        <div class="r-sub" style="margin-top:4px;font-size:11.5px">Clock at home reads <b>${esc(nowIn(TRIP.home_tz || Intl.DateTimeFormat().resolvedOptions().timeZone))}</b>.</div>
        <label class="wiz-label">Destination timezone</label>
        <input id="stTz" list="tzlist2" value="${esc(TRIP.tz)}" style="width:100%;padding:12px;border:1px solid var(--line);border-radius:var(--r-sm);font-size:14px;background:#fffdfa;color:var(--ink)" />
        <div class="r-sub" style="margin-top:4px;font-size:11.5px">Clock there reads <b>${esc(nowIn(TRIP.tz))}</b>. ${tzForCity(TRIP.destination) && tzForCity(TRIP.destination) !== TRIP.tz ? `<span style="color:var(--vermilion)">That looks wrong for ${esc(TRIP.destination)}.</span> <span id="stTzFix" style="color:var(--ai-2);font-weight:800;cursor:pointer">Use ${esc(tzForCity(TRIP.destination))}</span>` : ""}</div>
        <datalist id="tzlist2">${(Intl.supportedValuesOf ? Intl.supportedValuesOf("timeZone") : ["UTC"]).map((z) => `<option value="${z}">`).join("")}</datalist>
        <button class="btn primary" id="stSaveBasics" style="width:100%;margin-top:14px">Save basics</button>
        <div id="stBasicsMsg" class="r-sub" style="margin-top:6px"></div>
      </div>

      <div class="card">
        <h3>🔄 App version</h3>
        <p class="section-sub" style="margin:4px 0 10px">Phones hold on to the old app harder than you would think. This is the build actually running right now.</p>
        <div class="r-sub" id="stBuild" style="font-weight:800">Checking…</div>
        <button class="btn ghost" id="stForceUpdate" style="width:100%;margin-top:10px">Force the latest version</button>
        <div id="stBuildMsg" class="r-sub" style="margin-top:8px"></div>
      </div>

      <div class="card">
        <h3>${isWedding() ? "💍 This is set up as a wedding" : "🌍 This is set up as a group trip"}</h3>
        <p class="section-sub" style="margin:4px 0 12px">${isWedding()
          ? "Which is why it has RSVPs, a seating chart and a Day of run sheet. A group trip has none of that, and gets shared budgets, stay votes and an open plan instead."
          : "Which is why anyone can edit and there are no RSVPs. A wedding gets guest RSVPs, a room block, a seating chart and a Day of run sheet, and only the hosts can edit."}</p>
        <button class="btn ghost" id="stSwitchMode" style="width:100%">Switch to ${isWedding() ? "a group trip" : "a wedding"}</button>
        <div id="stModeMsg" class="r-sub" style="margin-top:8px">Nothing is deleted. Switching back brings it all straight back.</div>
      </div>

      ${isWedding() ? `<div class="card">
        <h3>👥 Guest list</h3>
        <p class="section-sub" style="margin:2px 0 10px">Paste your list or upload the spreadsheet. One guest per line, or a CSV where the first column is the name. Guests then pick themselves from this list instead of typing their own name.</p>
        <div class="expense-add">
          <textarea id="glPaste" rows="5" placeholder="Maya Chen&#10;Jordan Blake&#10;Sam Ortiz&#10;..." style="width:100%;padding:12px;border:1px solid var(--line);border-radius:var(--r-sm);font-size:14px;font-family:inherit;background:#fffdfa;color:var(--ink)"></textarea>
          <div class="btn-row">
            <label class="btn ghost" style="flex:1;text-align:center;cursor:pointer">Upload .csv
              <input id="glFile" type="file" accept=".csv,.txt,text/csv,text/plain" style="display:none" /></label>
            <button class="btn primary" id="glAdd" style="flex:2">Add to the guest list</button>
          </div>
        </div>
        <div id="glMsg" class="r-sub" style="margin-top:8px"></div>
        <p class="section-sub" style="margin:10px 0 0;font-size:11.5px">${(TRIP.travelers || []).length} on the list now. Adding again only brings in names that are not already there.</p>
      </div>` : ""}

      <div class="card">
        <h3>${isWedding() ? "Everyone on the list" : "Travelers"}</h3>
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
            <input data-ststop="${i}" data-suggest="city" autocomplete="off" value="${esc(st.label)}" style="padding:11px;border:1px solid var(--line);border-radius:var(--r-sm);font-size:14px" />
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

    let pendingType = null;
    $$("#stTypes [data-sttype]").forEach((b) => b.addEventListener("click", () => {
      pendingType = b.dataset.sttype;
      $$("#stTypes [data-sttype]").forEach((x) => x.classList.toggle("active", x === b));
    }));
    const sti = $("#stInstall"); if (sti) sti.addEventListener("click", () => maybeOfferInstall(true));

    /* ---- guest list import ------------------------------------------------ */
    const glFile = $("#glFile"); if (glFile) glFile.addEventListener("change", () => {
      const f = glFile.files && glFile.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        const cur = $("#glPaste").value.trim();
        $("#glPaste").value = (cur ? cur + "\n" : "") + String(r.result || "");
        $("#glMsg").textContent = `Loaded ${esc(f.name)}. Review the names, then add them.`;
      };
      r.readAsText(f);
    });
    const glAdd = $("#glAdd"); if (glAdd) glAdd.addEventListener("click", async () => {
      const names = parseGuestList($("#glPaste").value);
      if (!names.length) { $("#glMsg").textContent = "No names found. One per line, or a CSV with names in the first column."; return; }
      $("#glMsg").textContent = "Adding…";
      const fresh = await Backend.getTrip(TRIP_CODE); // don't clobber guests who added themselves
      if (fresh) TRIP = fresh;
      const existing = (TRIP.travelers || []);
      const seen = new Set(existing.map((t) => t.name.trim().toLowerCase()));
      const added = [];
      names.forEach((n) => {
        const key = n.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        added.push({ id: slug(n) + "-" + (existing.length + added.length), name: n, color: PALETTE[(existing.length + added.length) % PALETTE.length] });
      });
      if (!added.length) { $("#glMsg").textContent = "Everyone on that list is already here."; return; }
      const ok = await Backend.updateTrip(TRIP_CODE, { travelers: [...existing, ...added] });
      if (!ok) { $("#glMsg").textContent = "Couldn't save. Try again."; return; }
      TRIP.travelers = [...existing, ...added];
      $("#glPaste").value = "";
      $("#glMsg").textContent = `Added ${added.length} guest${added.length === 1 ? "" : "s"}. ${names.length - added.length ? (names.length - added.length) + " were already on the list." : ""}`;
      renderSettings();
    });
    const stDest = $("#stDest"); if (stDest) stDest.addEventListener("change", () => {
      const tz = tzForCity(stDest.value); if (tz) $("#stTz").value = tz;
    });
    const stHome = $("#stHome"); if (stHome) stHome.addEventListener("change", () => {
      const tz = tzForCity(stHome.value); if (tz) $("#stHomeTz").value = tz;
    });
    const stFix = $("#stTzFix"); if (stFix) stFix.addEventListener("click", () => {
      $("#stTz").value = tzForCity(TRIP.destination);
      $("#stBasicsMsg").textContent = "Set. Tap Save basics to apply it for everyone.";
    });
    const wls = $("#wlSave"); if (wls) wls.addEventListener("click", async () => {
      const links = {
        roomblock: $("#wlRoom").value.trim(), deadline: $("#wlDeadline").value.trim(),
        registry: $("#wlReg").value.trim(), site: $("#wlSite").value.trim(),
        rsvp_deadline: $("#wlRsvpBy").value.trim(), cost: $("#wlCost").value.trim(),
        venue_name: $("#wlVenue").value.trim(), venue_address: $("#wlVenueAddr").value.trim(),
        venue_link: $("#wlVenueLink").value.trim(),
        allowance: parseInt($("#wlAllow").value, 10) || 2,
      };
      links.meals = $("#wlMeals").value.split(",").map((x) => x.trim()).filter(Boolean).slice(0, 6);
      links.faq = $("#wlFaq").value.split("\n").map((l) => {
        const i = l.indexOf("=");
        return i > 0 ? { q: l.slice(0, i).trim(), a: l.slice(i + 1).trim() } : null;
      }).filter((f) => f && f.q && f.a).slice(0, 20);
      // This form owns exactly these keys. Everything else in links is someone
      // else's and must survive, which a wholesale write would not allow.
      const ok = await saveLinks(links, Object.keys(links));
      $("#wlMsg").textContent = ok ? "Saved ✓" : "Couldn't save. Try again.";
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
        home_city: $("#stHome").value.trim(),
        home_airport: $("#stHomeAir").value.trim().toUpperCase(),
        home_tz: $("#stHomeTz").value.trim() || tzForCity($("#stHome").value) || TRIP.home_tz || "UTC",
        trip_type: pendingType || tripType(),
      };
      if (patch.end_date < patch.start_date) { $("#stBasicsMsg").textContent = "Last day can't be before the first day."; return; }
      Object.assign(TRIP, patch);
      $("#stBasicsMsg").textContent = "Saved ✓";
      $("#brandName").textContent = TRIP.name;
      $("#brandSub").textContent = fmtRange(TRIP.start_date, TRIP.end_date);
      await Backend.updateTrip(TRIP.code, patch);
      const made = await fillDays(patch.start_date, patch.end_date);
      if (made) {
        renderAll();   // redraws this screen, so the message has to land after
        const msg = $("#stBasicsMsg");
        if (msg) msg.textContent = `Saved ✓ and ${made} day${made === 1 ? "" : "s"} added to the Plan.`;
      }
      loadRate();
    });

    showBuild();
    const fu = $("#stForceUpdate"); if (fu) fu.addEventListener("click", forceUpdate);
    const sm = $("#stSwitchMode"); if (sm) sm.addEventListener("click", switchMode);

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
    settings: renderSettings, assistant: renderAssistant, announce: renderAnnounce, booking: renderBooking, groups: renderGroups, map: renderMap,
    fares: renderFares, dayof: renderDayOf, seating: renderSeating, outfits: renderOutfits,
  };
  function renderCurrent() {
    if (!TRIP) return;
    // Day of is the couple's working document, so it only appears for them.
    const hostOnly = isWedding() && isHost();
    const dayofTab = $("#sheetDayof");
    if (dayofTab) dayofTab.hidden = !hostOnly;
    const seatTab = $("#sheetSeating");
    if (seatTab) seatTab.hidden = !hostOnly;
    // Outfits is a group-trip thing. See the note on outfitsOn().
    const fitTab = $("#sheetOutfits");
    if (fitTab) fitTab.hidden = !outfitsOn();
    paintTimeOfDay();
    const active = $("#tripApp .screen.active");
    const id = active ? active.id.replace("screen-", "") : "home";
    if (!RENDERERS[id]) return;
    try { RENDERERS[id](); }
    catch (e) {
      console.error("render " + id, e);
      const el = $("#screen-" + id);
      if (el) el.innerHTML = `<div class="card" style="margin-top:16px"><h3>😕 This screen hit a snag</h3>
        <p class="r-sub" style="margin:6px 0 0">${esc(String(e && e.message ? e.message : e))}</p></div>`;
    }
  }
  /* The header tints toward dawn, day, dusk or night in the destination's own
     clock. Quiet and constant, and it does the "you are going somewhere" work
     better than any animation. */
  function paintTimeOfDay() {
    let h = new Date().getHours();
    const tz = TRIP && TRIP.tz;
    if (tz) {
      try {
        h = +new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hour12: false }).format(new Date());
        if (h === 24) h = 0;
      } catch (e) { /* a bad tz string is not worth a broken header */ }
    }
    const tod = h < 5 ? "night" : h < 9 ? "dawn" : h < 17 ? "day" : h < 21 ? "dusk" : "night";
    if (document.body.dataset.tod !== tod) document.body.dataset.tod = tod;
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
        // The landing lives at /weddings/ and /golf/ too, so the worker has to
        // be registered from the root or those pages ask for a file that is
        // not there and get a 404.
        const dir = location.pathname.replace(/[^/]*$/, "");        // drop the filename
        const root = dir.replace(/(weddings|golf)\/$/, "");          // then climb out
        const reg = await navigator.serviceWorker.register(root + "sw.js", { scope: root });
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

  /* ---- start ------------------------------------------------------------- */
  if (!TRIP_CODE) { bootLanding(); } else {
    // Never leave a blank screen: if boot fails, say so and offer a clean reload.
    bootTrip().catch((e) => {
      console.error("boot failed", e);
      const h = document.getElementById("screen-home");
      if (h) h.innerHTML = `<div class="card" style="margin-top:20px"><h3>😕 Something went wrong loading this trip</h3>
        <p class="r-sub" style="margin:6px 0 12px">${String(e && e.message ? e.message : e)}</p>
        <button class="btn primary" id="bootRetry" style="width:100%">Reload the app</button></div>`;
      const b = document.getElementById("bootRetry");
      if (b) b.addEventListener("click", async () => {
        try {
          if ("caches" in window) { const ks = await caches.keys(); await Promise.all(ks.map((k) => caches.delete(k))); }
          if (navigator.serviceWorker) { const rs = await navigator.serviceWorker.getRegistrations(); await Promise.all(rs.map((r) => r.unregister())); }
        } catch (err) { console.warn(err); }
        location.reload(true);
      });
    });
  }
})();
