const RECIPIENT = "info@nuvalab.ai";
const SENDER = "website@notify.nuvalab.ai";
const ORIGINS = new Set(["https://nuvalab.ai", "https://www.nuvalab.ai"]);
const HOSTS = new Set(["nuvalab.ai", "www.nuvalab.ai"]);
export const VOLUMES = new Set(["Under 100/day (<3K/month)", "100-1K/day (3K-30K/month)", "1K-10K/day (30K-300K/month)", "10K+/day (300K+/month)", "Not sure yet"]);
export const NEEDS = new Set(["Dedicated deployment", "Custom data", "Custom model", "Creative agent", "Business agent", "Standard access"]);
export const BUSINESS_TYPES = new Set(["Agency / marketing", "Brand / e-commerce", "Games / interactive entertainment", "Studio / short drama / content", "AI product / platform", "Other / exploring"]);
const ALLOWED = new Set(["name", "email", "company", "role", "video_volume", "needs", "business_type", "business_goal", "page", "utm", "_gotcha", "token"]);

function reply(status, message, origin, requestId) {
  const headers = { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", Vary: "Origin" };
  if (ORIGINS.has(origin)) Object.assign(headers, { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" });
  return new Response(JSON.stringify({ ok: status === 200, message, ...(requestId ? { requestId } : {}) }), { status, headers });
}

function clean(value, limit) {
  if (typeof value !== "string" || !value.trim() || value.length > limit || /[\x00-\x1f\x7f]/.test(value)) throw new Error("Invalid field");
  return value.trim();
}

export function validate(data) {
  if (!data || typeof data !== "object" || Array.isArray(data) || Object.keys(data).some(k => !ALLOWED.has(k))) throw new Error("Invalid body");
  const lead = Object.fromEntries(Object.entries({ name: 100, email: 254, company: 150, role: 150, video_volume: 80 }).map(([key, size]) => [key, clean(data[key], size)]));
  if (!/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,63}$/.test(lead.email)) throw new Error("Invalid email");
  if (!VOLUMES.has(lead.video_volume)) throw new Error("Invalid volume");
  if (!Array.isArray(data.needs) || !data.needs.length || data.needs.length > NEEDS.size || data.needs.some(n => !NEEDS.has(n)) || new Set(data.needs).size !== data.needs.length || (data.needs.includes("Standard access") && data.needs.length !== 1)) throw new Error("Invalid needs");
  lead.needs = data.needs.join(", ");
  // Optional for cached older frontends during a rolling deployment.
  // A new frontend sends both fields; partial or empty business context is invalid.
  if (data.business_type !== undefined || data.business_goal !== undefined) {
    if (!BUSINESS_TYPES.has(data.business_type)) throw new Error("Invalid business type");
    const goal = data.business_goal;
    if (typeof goal !== "string" || !goal.trim() || goal.length > 1000 || /[\x00-\x09\x0b-\x1f\x7f]/.test(goal)) throw new Error("Invalid business goal");
    lead.business_type = data.business_type;
    lead.business_goal = goal.trim();
  }
  for (const key of ["page", "utm"]) {
    const value = data[key] ?? "";
    if (typeof value !== "string" || value.length > 500 || /[\x00-\x1f\x7f]/.test(value)) throw new Error("Invalid attribution");
    lead[key] = value;
  }
  return lead;
}

async function readBody(request) {
  if (Number(request.headers.get("content-length")) > 8192) throw new RangeError("Too large");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Missing body");
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 8192) { await reader.cancel(); throw new RangeError("Too large"); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}

async function digest(value) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))].map(x => x.toString(16).padStart(2, "0")).join("");
}

async function allow(env, key, limit, seconds) {
  const id = env.LIMITS.idFromName(key);
  const result = await env.LIMITS.get(id).fetch("https://limit/check", { method: "POST", body: JSON.stringify({ limit, seconds }) });
  if (result.status !== 200 && result.status !== 429) throw new Error("Rate limit unavailable");
  return result.status === 200;
}

export class LeadLimit {
  constructor(ctx) { this.ctx = ctx; }
  async fetch(request) {
    const { limit, seconds } = await request.json();
    const now = Date.now();
    const allowed = await this.ctx.storage.transaction(async txn => {
      const stored = await txn.get("window");
      const state = stored && stored.expires > now ? stored : { hits: 0, expires: now + seconds * 1000 };
      if (state.hits >= limit) return false;
      state.hits++;
      await txn.put("window", state);
      await txn.setAlarm(state.expires);
      return true;
    });
    return new Response(null, { status: allowed ? 200 : 429 });
  }
  async alarm() { await this.ctx.storage.deleteAll(); }
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("origin");
    if (new URL(request.url).pathname !== "/api/leads") return reply(404, "Not found", origin);
    if (!ORIGINS.has(origin)) return reply(403, "Origin not allowed");
    if (request.method === "OPTIONS") return reply(200, "Ready", origin);
    if (request.method !== "POST") return reply(405, "POST required", origin);
    if (request.headers.get("content-type")?.split(";")[0] !== "application/json") return reply(415, "JSON required", origin);
    let data, lead;
    try {
      data = await readBody(request);
      if (data?._gotcha) return reply(200, "Received", origin);
      lead = validate(data);
    } catch (error) { return reply(error instanceof RangeError ? 413 : 400, "Please check your details", origin); }
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    try {
      if (!await allow(env, "ip:" + await digest(ip), 10, 600)) return reply(429, "Too many attempts. Please try again later", origin);
      if (typeof data.token !== "string" || !data.token || data.token.length > 2048) return reply(403, "Please complete the security check", origin);
      const verification = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: data.token, remoteip: ip }), signal: AbortSignal.timeout(8000) });
      if (!verification.ok) throw new Error("Challenge unavailable");
      const result = await verification.json();
      if (result.success !== true || !HOSTS.has(result.hostname) || result.action !== "website_lead") return reply(403, "Please complete the security check", origin);
      if (!await allow(env, "email:" + await digest(lead.email.toLowerCase()), 3, 3600) || !await allow(env, "all", 100, 86400)) return reply(429, "Please try again later or email info@nuvalab.ai", origin);
      const requestId = crypto.randomUUID();
      const text = "Nuva website contact request\n\n" + Object.entries(lead).map(([key, value]) => `${key}: ${String(value).replace(/\n/g, "\n  ")}`).join("\n") + `\n\nReference: ${requestId}\n`;
      // Fixed envelope + plain text; visitor fields cannot become recipients, headers, HTML or code.
      const sent = await env.EMAIL.send({ to: RECIPIENT, from: SENDER, replyTo: lead.email, subject: "Nuva website: new business inquiry", text });
      if (!sent?.messageId) throw new Error("Missing delivery receipt");
      console.log(JSON.stringify({ event: "lead_sent", requestId, messageId: sent.messageId }));
      return reply(200, "Received. We'll be in touch", origin, requestId);
    } catch (error) {
      console.error(JSON.stringify({ event: "lead_failed", type: error.name, code: typeof error.code === "string" ? error.code : undefined }));
      return reply(503, "Please try again or email info@nuvalab.ai", origin);
    }
  }
};
