import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import worker, { validate, VOLUMES, NEEDS, BUSINESS_TYPES, LeadLimit } from "../backend/worker.mjs";

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

const business = () => ({ ...valid(), business_type: "Brand / e-commerce", business_goal: "Generate skincare ad variations.\nUse performance feedback to improve the next batch.", needs: ["Dedicated deployment", "Creative agent", "Business agent"] });

test("business context and every new service choice match the frontend", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  for (const [field, allowed] of [["business_type", BUSINESS_TYPES], ["needs", NEEDS]]) {
    const values = [...html.matchAll(new RegExp(`name="${field}" value="([^"]+)"`, "g"))].map(m => m[1]);
    assert.deepEqual(new Set(values), allowed);
  }
  assert.equal(validate(valid()).business_type, undefined);
  assert.equal(validate(business()).business_goal, business().business_goal);
  assert.equal(validate({ ...business(), needs: [...NEEDS].filter(n => n !== "Standard access") }).needs.split(", ").length, 5);
});

test("rejects incomplete, unknown, oversized and control-character business context", () => {
  for (const fields of [
    { business_type: "unknown" }, { business_goal: " " }, { business_goal: "x".repeat(1001) },
    { business_goal: "line\r\nBcc: attacker@example.com" }, { business_goal: "bad\u0000text" },
    { business_goal: undefined }, { business_type: undefined },
    { needs: ["Creative agent", "Creative agent"] }, { needs: ["Standard access", "Business agent"] }
  ]) assert.throws(() => validate({ ...business(), ...fields }));
});

test("business goal and selected agents reach the fixed-recipient email intact", async t => {
  t.mock.method(globalThis, "fetch", async () => Response.json({ success: true, hostname: "nuvalab.ai", action: "website_lead" }));
  const env = environment();
  assert.equal((await worker.fetch(request(business()), env)).status, 200);
  const message = env.calls[0];
  assert.equal(message.to, "info@nuvalab.ai");
  assert.match(message.text, /business_type: Brand \/ e-commerce/);
  assert.match(message.text, /business_goal: Generate skincare ad variations\.\n  Use performance feedback/);
  assert.match(message.text, /needs: Dedicated deployment, Creative agent, Business agent/);
  assert.equal(message.html, undefined);
});
