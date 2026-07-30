// =============================================================================
// Caravan — "generate-plan" Edge Function.
// Two modes, both scoped to a trip's join code:
//   mode "plan"  → drafts the full day-by-day itinerary into `days`
//   mode "intel" → destination guide cards + neighborhood cards per stop
//                  (into `guides`), plus suggested decisions and ideas
//
// Deploy (Supabase Dashboard → Edge Functions → Deploy new function):
//   name: generate-plan  ·  paste this file  ·  turn OFF "Verify JWT"
// Secrets (Edge Functions → Secrets):
//   ANTHROPIC_API_KEY = your key from console.anthropic.com
//
// Guards: trip must exist; max 6 AI generations per trip (gen_count).
// =============================================================================
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...CORS, "Content-Type": "application/json" } });

let LAST_AI_ERROR = "";
async function callAnthropic(body: Record<string, unknown>): Promise<string | null> {
  LAST_AI_ERROR = "";
  if (!Deno.env.get("ANTHROPIC_API_KEY")) { LAST_AI_ERROR = "ANTHROPIC_API_KEY secret is not set"; return null; }
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({ model: "claude-sonnet-5", ...body }),
  });
  if (!resp.ok) {
    const detail = await resp.text();
    console.error("Anthropic", resp.status, detail);
    let msg = detail;
    try { msg = JSON.parse(detail)?.error?.message ?? detail; } catch { /* raw */ }
    LAST_AI_ERROR = `Anthropic ${resp.status}: ${String(msg).slice(0, 220)}`;
    return null;
  }
  const ai = await resp.json();
  return ai?.content?.[0]?.text ?? "";
}
async function askClaude(prompt: string): Promise<Record<string, unknown> | null> {
  let text = await callAnthropic({ max_tokens: 8000, messages: [{ role: "user", content: prompt }] });
  if (text == null) return null;
  text = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const a = text.indexOf("{"), b = text.lastIndexOf("}");
  if (a === -1 || b === -1) return null;
  try { return JSON.parse(text.slice(a, b + 1)); } catch { return null; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  try {
    const { code, mode = "plan", messages = [] } = await req.json();
    if (!code || typeof code !== "string") return json({ error: "Missing trip code" }, 400);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: trip } = await supabase.from("trips").select("*").eq("code", code.toUpperCase()).maybeSingle();
    if (!trip) return json({ error: "Trip not found" }, 404);
    if ((mode === "plan" || mode === "intel") && (trip.gen_count ?? 0) >= 6)
      return json({ error: "This trip has used all its AI generations." }, 429);

    const stopsTxt = (trip.stops || []).map((s: { id: string; label: string }) => `${s.label} (id: ${s.id})`).join(", ") || trip.destination || "the destination";
    const travelers = (trip.travelers || []).length || 2;
    const bump = () => supabase.from("trips").update({ gen_count: (trip.gen_count ?? 0) + 1 }).eq("code", trip.code);

    /* ---------------- mode: plan — the day-by-day itinerary ---------------- */
    if (mode === "plan") {
      const { count } = await supabase.from("days").select("id", { count: "exact", head: true }).eq("trip", trip.code);
      if ((count ?? 0) >= 2) return json({ error: "This trip already has a plan — delete the existing days first for a fresh AI draft." }, 409);

      const plan = await askClaude(
`You are an expert travel planner. Build a realistic, well-paced draft itinerary for a group trip. It is a STARTING POINT the group will edit and vote on — favor famous-for-a-reason highlights, sensible geography (no backtracking), and realistic transit days.

Trip: "${trip.name}" to ${trip.destination || "?"}
Dates: ${trip.start_date} through ${trip.end_date} (inclusive; one entry for EVERY date)
Group: ${travelers} travelers
Stops in order (allocate dates sensibly; travel between stops on changeover days): ${stopsTxt}

Respond with ONLY valid JSON, no markdown fences:
{"days":[{"date":"YYYY-MM-DD","stop":"<stop id or empty>","title":"...","summary":"one line","meetup":"suggested meetup spot + time or empty","items":[{"time":"HH:MM or empty","type":"travel|sight|food|activity|rest|meet","title":"...","note":"one practical sentence (booking tips, timing tricks)"}]}]}
Rules: 3-5 items/day; arrival + departure days paced lightly; use the given stop ids, not labels.`);
      if (!plan || !Array.isArray(plan.days) || !(plan.days as unknown[]).length) return json({ error: LAST_AI_ERROR || "AI returned an unreadable plan — try again." }, 502);

      const rows = (plan.days as Array<Record<string, unknown>>)
        .filter((d) => typeof d.date === "string" && typeof d.title === "string")
        .map((d) => ({
          trip: trip.code,
          date: String(d.date), stop: typeof d.stop === "string" ? d.stop : "",
          title: String(d.title).slice(0, 120),
          summary: String(d.summary ?? "").slice(0, 300),
          meetup: String(d.meetup ?? "").slice(0, 200),
          items: Array.isArray(d.items) ? (d.items as Array<Record<string, unknown>>).slice(0, 6).map((it) => ({
            time: String(it.time ?? "").slice(0, 5),
            type: ["travel", "sight", "food", "activity", "rest", "meet"].includes(String(it.type)) ? String(it.type) : "activity",
            title: String(it.title ?? "").slice(0, 140),
            note: String(it.note ?? "").slice(0, 300),
          })) : [],
        }));
      const { error } = await supabase.from("days").insert(rows);
      if (error) { console.error(error); return json({ error: "Couldn't save the plan." }, 500); }
      await bump();
      return json({ ok: true, days: rows.length });
    }

    /* ---------------- mode: intel — guides, hoods, votes, ideas ------------- */
    if (mode === "intel") {
      const { count } = await supabase.from("guides").select("id", { count: "exact", head: true }).eq("trip", trip.code);
      if ((count ?? 0) > 0) return json({ error: "Destination intel already exists for this trip." }, 409);

      const intel = await askClaude(
`You are an expert travel guide writer helping a group plan a trip. Produce compact, opinionated destination intel — the stuff a well-traveled friend would tell them.

Trip: "${trip.name}" to ${trip.destination || "?"}, ${trip.start_date}–${trip.end_date}, ${travelers} travelers.
Stops: ${stopsTxt}

Respond with ONLY valid JSON, no markdown fences:
{
 "guide":[{"emoji":"one emoji","title":"short","body":"2-3 sentences of genuinely practical local knowledge (money, transit, etiquette, connectivity, safety, seasonal notes for these dates)"}],
 "hoods":[{"stop":"<stop id>","emoji":"one emoji","name":"neighborhood name","tags":["2-4 short vibe tags"],"blurb":"1-2 sentences on what it's known for","base":"one honest sentence on staying there"}],
 "decisions":[{"title":"a real either/or choice this group will face on this trip","note":"one line of context","options":["option 1","option 2","option 3 (optional)"]}],
 "ideas":[{"title":"a fun optional add-on","tag":"where/when","note":"one line"}]
}
Rules: 8-10 guide cards; 4-6 hoods per stop (use the given stop ids); 4-6 decisions; 5-8 ideas. Be specific to the destination and season, never generic.`);
      if (!intel) return json({ error: LAST_AI_ERROR || "AI returned unreadable intel — try again." }, 502);

      const gRows: Array<Record<string, unknown>> = [];
      (Array.isArray(intel.guide) ? intel.guide as Array<Record<string, unknown>> : []).slice(0, 12).forEach((g) =>
        gRows.push({ trip: trip.code, kind: "guide", stop: "", emoji: String(g.emoji ?? "📌").slice(0, 8), title: String(g.title ?? "").slice(0, 120), tags: [], body: String(g.body ?? "").slice(0, 600), base: "" }));
      (Array.isArray(intel.hoods) ? intel.hoods as Array<Record<string, unknown>> : []).slice(0, 40).forEach((h) =>
        gRows.push({ trip: trip.code, kind: "hood", stop: String(h.stop ?? ""), emoji: String(h.emoji ?? "📍").slice(0, 8), title: String(h.name ?? "").slice(0, 120), tags: Array.isArray(h.tags) ? (h.tags as unknown[]).slice(0, 5).map(String) : [], body: String(h.blurb ?? "").slice(0, 400), base: String(h.base ?? "").slice(0, 300) }));
      if (gRows.length) await supabase.from("guides").insert(gRows);

      const dRows = (Array.isArray(intel.decisions) ? intel.decisions as Array<Record<string, unknown>> : []).slice(0, 8)
        .filter((d) => d.title && Array.isArray(d.options) && (d.options as unknown[]).length >= 2)
        .map((d) => ({ trip: trip.code, title: String(d.title).slice(0, 160), note: String(d.note ?? "").slice(0, 300),
          options: (d.options as unknown[]).slice(0, 4).map((o, i) => ({ id: "opt" + i, label: String(o).slice(0, 120) })), status: "open", author: "" }));
      if (dRows.length) await supabase.from("decisions").insert(dRows);

      const iRows = (Array.isArray(intel.ideas) ? intel.ideas as Array<Record<string, unknown>> : []).slice(0, 10)
        .filter((i) => i.title)
        .map((i) => ({ trip: trip.code, title: String(i.title).slice(0, 140), tag: String(i.tag ?? "").slice(0, 60), note: String(i.note ?? "").slice(0, 300), author: "" }));
      if (iRows.length) await supabase.from("ideas").insert(iRows);

      await bump();
      return json({ ok: true, guides: gRows.length, decisions: dRows.length, ideas: iRows.length });
    }

    /* ---------------- mode: chat — the trip assistant ----------------------- */
    if (mode === "chat") {
      if ((trip.chat_count ?? 0) >= 150) return json({ error: "This trip has used all its assistant messages." }, 429);
      const history = (Array.isArray(messages) ? messages : [])
        .filter((m: Record<string, unknown>) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content)
        .slice(-12)
        .map((m: Record<string, unknown>) => ({ role: m.role, content: String(m.content).slice(0, 4000) }));
      if (!history.length || history[history.length - 1].role !== "user") return json({ error: "No message to answer." }, 400);

      // Compact trip context for grounding
      const [{ data: days }, { data: decisions }, { data: stayOpts }, { data: ideas }] = await Promise.all([
        supabase.from("days").select("date,stop,title,summary,items").eq("trip", trip.code).order("date"),
        supabase.from("decisions").select("title,options,status").eq("trip", trip.code),
        supabase.from("stay_options").select("stop,name,tag").eq("trip", trip.code),
        supabase.from("ideas").select("title,tag").eq("trip", trip.code),
      ]);
      const ctx = {
        trip: { name: trip.name, destination: trip.destination, dates: `${trip.start_date} to ${trip.end_date}`, travelers, stops: trip.stops, currency: trip.currency, home_currency: trip.home_currency },
        itinerary: (days || []).map((d: Record<string, unknown>) => ({ date: d.date, stop: d.stop, title: d.title, summary: d.summary, items: (d.items as Array<Record<string, unknown>> || []).map((i) => `${i.time || ""} ${i.title}`.trim()) })),
        open_votes: (decisions || []).map((d: Record<string, unknown>) => d.title),
        stay_submissions: stayOpts || [],
        ideas: (ideas || []).map((i: Record<string, unknown>) => i.title),
      };

      const system = `You are Caravan's trip assistant — a sharp, warm, well-traveled friend helping a group plan and run their trip. Be concise and concrete; give opinions, not lists of hedges. Ground every answer in the trip context below (their real dates, stops, itinerary, votes). Plain text only, no markdown headers.

If — and ONLY if — the user asks you to change or add itinerary days, end your reply with a machine-readable block in EXACTLY this format (one line, valid JSON):
<<<DAYS>>>{"days":[{"date":"YYYY-MM-DD","stop":"<stop id or empty>","title":"...","summary":"one line","meetup":"","items":[{"time":"HH:MM or empty","type":"travel|sight|food|activity|rest|meet","title":"...","note":"one sentence"}]}]}<<<END>>>
Each day in the block fully REPLACES that date. Never include the block for questions, advice, or suggestions the user hasn't asked you to apply.

TRIP CONTEXT:
${JSON.stringify(ctx)}`;

      const text = await callAnthropic({ max_tokens: 3000, system, messages: history });
      if (text == null) return json({ error: LAST_AI_ERROR || "Assistant call failed." }, 502);

      // Split out a DAYS block if present
      let reply = text, daysBlock = null;
      const m = text.match(/<<<DAYS>>>([\s\S]*?)<<<END>>>/);
      if (m) {
        reply = text.replace(m[0], "").trim();
        try {
          const parsed = JSON.parse(m[1].trim());
          if (Array.isArray(parsed.days) && parsed.days.length) {
            daysBlock = parsed.days.slice(0, 20).map((d: Record<string, unknown>) => ({
              date: String(d.date ?? ""), stop: typeof d.stop === "string" ? d.stop : "",
              title: String(d.title ?? "").slice(0, 120),
              summary: String(d.summary ?? "").slice(0, 300),
              meetup: String(d.meetup ?? "").slice(0, 200),
              items: Array.isArray(d.items) ? (d.items as Array<Record<string, unknown>>).slice(0, 6).map((it) => ({
                time: String(it.time ?? "").slice(0, 5),
                type: ["travel", "sight", "food", "activity", "rest", "meet"].includes(String(it.type)) ? String(it.type) : "activity",
                title: String(it.title ?? "").slice(0, 140),
                note: String(it.note ?? "").slice(0, 300),
              })) : [],
            })).filter((d: Record<string, unknown>) => /^\d{4}-\d{2}-\d{2}$/.test(String(d.date)));
          }
        } catch { /* ignore malformed block */ }
      }
      await supabase.from("trips").update({ chat_count: (trip.chat_count ?? 0) + 1 }).eq("code", trip.code);
      return json({ ok: true, reply, days: daysBlock });
    }

    return json({ error: "Unknown mode" }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: "Unexpected error." }, 500);
  }
});
