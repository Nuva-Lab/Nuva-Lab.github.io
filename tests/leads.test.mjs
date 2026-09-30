import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import worker, { validate, VOLUMES, LeadLimit } from "../backend/worker.mjs";

const valid = () => ({ name: "Test User", email: "test@example.com", company: "Test", role: "CTO", video_volume: "Not sure yet", needs: ["Dedicated deployment"], token: "token" });
const request = (data, origin = "https://nuvalab.ai", type = "application/json") => new Request("https://nuvalab.ai/api/leads", { method: "POST", headers: { Origin: origin, "Content-Type": type }, body: JSON.stringify(data) });
function environment({ limited = false, mailFails = false } = {}) {
  const calls = [];
  return { calls, TURNSTILE_SECRET: "test", LIMITS: { idFromName: name => name, get: () => ({ fetch: async () => new Response(null, { status: limited ? 429 : 200 }) }) }, EMAIL: { send: async message => { calls.push(message); if (mailFails) throw new Error("failed"); return { messageId: "test-id" }; } } };
}
test("rejects header injection and visitor-selected recipient", () => {
  for (const extra of [{ to: "attacker@example.com" }, { email: "a@example.com\r\nBcc: attacker@example.com" }, { name: "Test\nBcc: attacker@example.com" }, { needs: ["Standard access", "Custom data"] }]) assert.throws(() => validate({ ...valid(), ...extra }));
});
test("frontend volume values match backend", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.deepEqual(new Set([...html.matchAll(/name="video_volume" value="([^"]+)"/g)].map(m => m[1])), VOLUMES);
});
test("enforces origin, media type and actual streamed body size", async () => {
  const env = environment();
  assert.equal((await worker.fetch(request(valid(), "https://attacker.example"), env)).status, 403);
  assert.equal((await worker.fetch(request(valid(), undefined, "text/plain"), env)).status, 415);
  assert.equal((await worker.fetch(request({ ...valid(), name: "x".repeat(9000) }), env)).status, 413);
  assert.equal(env.calls.length, 0);
});
test("challenge must pass with production hostname and action", async t => {
  for (const result of [{ success: false }, { success: true, hostname: "localhost", action: "website_lead" }, { success: true, hostname: "nuvalab.ai", action: "other" }]) {
    t.mock.method(globalThis, "fetch", async () => Response.json(result));
    const env = environment();
    assert.equal((await worker.fetch(request(valid()), env)).status, 403);
    assert.equal(env.calls.length, 0);
    t.mock.restoreAll();
  }
});
test("rate limit prevents mail", async () => {
  const env = environment({ limited: true });
  assert.equal((await worker.fetch(request(valid()), env)).status, 429);
  assert.equal(env.calls.length, 0);
});
test("valid lead uses only fixed recipient, fixed sender and plain text", async t => {
  t.mock.method(globalThis, "fetch", async () => Response.json({ success: true, hostname: "nuvalab.ai", action: "website_lead" }));
  const env = environment();
  assert.equal((await worker.fetch(request({ ...valid(), name: "<script>alert(1)</script>" }), env)).status, 200);
  assert.equal(env.calls[0].to, "info@nuvalab.ai");
  assert.equal(env.calls[0].from, "website@notify.nuvalab.ai");
  assert.equal(env.calls[0].replyTo, "test@example.com");
  assert.equal(env.calls[0].html, undefined);
  assert.match(env.calls[0].text, /<script>/);
});
test("mail failure never reports success", async t => {
  t.mock.method(globalThis, "fetch", async () => Response.json({ success: true, hostname: "nuvalab.ai", action: "website_lead" }));
  assert.equal((await worker.fetch(request(valid()), environment({ mailFails: true }))).status, 503);
});
test("durable rate window caps requests and schedules deletion", async () => {
  const map = new Map(); let alarm;
  const storage = { get: async k => map.get(k), put: async (k, v) => map.set(k, v), setAlarm: async x => { alarm = x; }, deleteAll: async () => map.clear(), transaction: async fn => fn(storage) };
  const limiter = new LeadLimit({ storage });
  const make = () => new Request("https://limit/check", { method: "POST", body: JSON.stringify({ limit: 2, seconds: 60 }) });
  assert.equal((await limiter.fetch(make())).status, 200);
  assert.equal((await limiter.fetch(make())).status, 200);
  assert.equal((await limiter.fetch(make())).status, 429);
  assert.ok(alarm > Date.now());
  await limiter.alarm();
  assert.equal(map.size, 0);
});
