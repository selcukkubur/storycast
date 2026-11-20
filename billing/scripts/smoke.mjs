const BASE = process.env.BILLING_URL ?? "http://127.0.0.1:8787";
const ok = (cond, msg) => {
  if (!cond) {
    console.error("FAIL", msg);
    process.exit(1);
  }
  console.log("ok  ", msg);
};
const j = async (r) => ({ status: r.status, body: await r.json() });
const device = `smoke-${Date.now()}`;

ok((await j(await fetch(`${BASE}/health`))).body.ok === true, "health");

const reg = await j(
  await fetch(`${BASE}/accounts`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ device, idfv: device }),
  }),
);
ok(reg.status === 200 && reg.body.token, "accounts register");

const auth = { authorization: `Bearer ${reg.body.token}`, "content-type": "application/json" };

const w1 = await j(await fetch(`${BASE}/wallet`, { headers: auth }));
ok(w1.body.plan === "trial" && w1.body.credits === 1, "trial wallet has 1 credit");

const job = await j(
  await fetch(`${BASE}/jobs`, { method: "POST", headers: auth, body: JSON.stringify({ minutes: 1, resolution: "480P" }) }),
);
ok(job.status === 200 && job.body.cost === 1 && job.body.creditsLeft === 0, "trial film starts and debits 1 credit");

const second = await j(
  await fetch(`${BASE}/jobs`, { method: "POST", headers: auth, body: JSON.stringify({ minutes: 1, resolution: "480P" }) }),
);
ok(second.status === 402, "second film refused without credits");

const settle = await j(
  await fetch(`${BASE}/jobs/${job.body.jobId}/settle`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ outcome: "error" }),
  }),
);
ok(settle.status === 200 && settle.body.refund === 1, "failed job refunds its credit");

const w2 = await j(await fetch(`${BASE}/wallet`, { headers: auth }));
ok(w2.body.credits === 1, "wallet restored after refund");

console.log("smoke passed");
