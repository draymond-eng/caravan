// =============================================================================
// SquadTrip - "send-push" Edge Function.
// Posts an announcement to a trip and pushes it to every subscribed phone.
//
// Deploy (Supabase Dashboard -> Edge Functions -> Deploy new function):
//   name: send-push  ·  paste this file  ·  turn OFF "Verify JWT"
// Secrets (Edge Functions -> Secrets):
//   VAPID_PUBLIC   = the public key (also in js/config.js)
//   VAPID_PRIVATE  = the private key (SECRET, server only)
//   VAPID_SUBJECT  = mailto:you@example.com
//
// Implements RFC 8291 (aes128gcm web push) + VAPID with WebCrypto only, so
// there are no npm dependencies to break in the edge runtime.
// =============================================================================
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...CORS, "Content-Type": "application/json" } });

/* ---- small helpers -------------------------------------------------------- */
const enc = new TextEncoder();
function b64uToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function bytesToB64u(b: Uint8Array): string {
  let s = "";
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function cat(...arrs: Uint8Array[]): Uint8Array {
  const len = arrs.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const a of arrs) { out.set(a, o); o += a.length; }
  return out;
}

/* ---- VAPID: signed JWT proving who is sending ----------------------------- */
async function vapidHeader(endpoint: string): Promise<string> {
  const pub = Deno.env.get("VAPID_PUBLIC")!;
  const priv = Deno.env.get("VAPID_PRIVATE")!;
  const subject = Deno.env.get("VAPID_SUBJECT") || "mailto:hello@joinsquadtrip.com";
  const pubBytes = b64uToBytes(pub); // 65 bytes: 0x04 || x(32) || y(32)

  const jwk: JsonWebKey = {
    kty: "EC", crv: "P-256",
    x: bytesToB64u(pubBytes.slice(1, 33)),
    y: bytesToB64u(pubBytes.slice(33, 65)),
    d: priv,
    ext: true,
  };
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);

  const aud = new URL(endpoint).origin;
  const header = bytesToB64u(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const payload = bytesToB64u(enc.encode(JSON.stringify({
    aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject,
  })));
  const signing = `${header}.${payload}`;
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(signing)));
  return `vapid t=${signing}.${bytesToB64u(sig)}, k=${pub}`;
}

/* ---- Payload encryption (RFC 8291, aes128gcm) ----------------------------- */
async function encryptPayload(p256dh: string, auth: string, plaintext: string): Promise<Uint8Array> {
  const uaPublic = b64uToBytes(p256dh);   // 65 bytes
  const authSecret = b64uToBytes(auth);   // 16 bytes

  // Ephemeral sender keypair
  const eph = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", eph.publicKey)); // 65 bytes

  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, eph.privateKey, 256));

  const hkdf = async (salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, len: number) => {
    const k = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
    return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, k, len * 8));
  };

  // IKM from the shared secret and the two public keys
  const keyInfo = cat(enc.encode("WebPush: info\0"), uaPublic, asPublic);
  const ikm = await hkdf(authSecret, shared, keyInfo, 32);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);

  const aesKey = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const body = cat(enc.encode(plaintext), new Uint8Array([2])); // 0x02 = last record delimiter
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, body));

  // header: salt(16) || record size(4) || key id length(1) || sender public key(65)
  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096);
  return cat(salt, rs, new Uint8Array([asPublic.length]), asPublic, ct);
}

async function pushOne(sub: { endpoint: string; p256dh: string; auth: string }, payload: string) {
  const body = await encryptPayload(sub.p256dh, sub.auth, payload);
  const res = await fetch(sub.endpoint, {
    method: "POST",
    headers: {
      "Authorization": await vapidHeader(sub.endpoint),
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      "TTL": "86400",
      "Urgency": "high",
    },
    body,
  });
  return res.status;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  try {
    if (!Deno.env.get("VAPID_PUBLIC") || !Deno.env.get("VAPID_PRIVATE"))
      return json({ error: "VAPID keys are not set in Edge Function secrets." }, 500);

    const { code, title = "", body = "", author = "" } = await req.json();
    if (!code || typeof code !== "string") return json({ error: "Missing trip code" }, 400);
    if (!body.trim()) return json({ error: "Nothing to send" }, 400);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const trip = (await supabase.from("trips").select("code,name").eq("code", code.toUpperCase()).maybeSingle()).data;
    if (!trip) return json({ error: "Trip not found" }, 404);

    // Record it so people who miss the notification still see it in the app
    const saved = (await supabase.from("announcements").insert({
      trip: trip.code, title: String(title).slice(0, 120), body: String(body).slice(0, 600), author: String(author).slice(0, 60),
    }).select().single()).data;

    const { data: subs } = await supabase.from("push_subs").select("*").eq("trip", trip.code);
    const payload = JSON.stringify({
      title: title ? `${trip.name}: ${title}`.slice(0, 90) : trip.name,
      body: String(body).slice(0, 300),
      url: `/?t=${trip.code}`,
      tag: "trip-" + trip.code,
    });

    let sent = 0, dropped = 0;
    for (const s of subs || []) {
      try {
        const status = await pushOne(s, payload);
        if (status === 404 || status === 410) { // subscription is dead, clean it up
          await supabase.from("push_subs").delete().eq("endpoint", s.endpoint);
          dropped++;
        } else if (status >= 200 && status < 300) sent++;
      } catch (e) { console.error("push failed", e); }
    }
    return json({ ok: true, sent, dropped, announcement: saved });
  } catch (e) {
    console.error(e);
    return json({ error: "Unexpected error." }, 500);
  }
});
