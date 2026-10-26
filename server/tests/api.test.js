const request = require("supertest");
const app = require("../src/app");
const db = require("../src/db");
const { seedAll } = require("../src/seed");
const { today, addDays } = require("../src/utils/dates");

const T = today();
const PW = "Passw0rdTest";
let alice, bob, admin;

async function signup(name) {
  const a = request.agent(app);
  const r = await a.post("/api/auth/register").send({ name, email: `${name}@test.dev`, password: PW });
  expect(r.status).toBe(201);
  return a;
}
const act = (o = {}) => ({ category: "commute", activity_type: "car_petrol", quantity: 100, unit: "km", activity_date: T, ...o });

beforeAll(async () => {
  await seedAll();
  alice = await signup("alice");
  bob = await signup("bob");
  admin = request.agent(app);
  const r = await admin.post("/api/auth/login").send({ email: "admin@carbonwise.app", password: "Admin@12345" });
  expect(r.status).toBe(200);
});
afterAll(() => db.close());

describe("auth (FR-01)", () => {
  test("protected routes reject unauthenticated requests", async () => {
    for (const p of ["/api/activities", "/api/dashboard/summary", "/api/recommendations", "/api/progress", "/api/auth/me"]) {
      expect((await request(app).get(p)).status).toBe(401);
    }
    expect((await request(app).post("/api/simulations").send({})).status).toBe(401);
  });
  test("register validates input and rejects duplicates", async () => {
    const bad = await request(app).post("/api/auth/register").send({ name: "", email: "nope", password: "short" });
    expect(bad.status).toBe(400);
    expect(bad.body.details.map((d) => d.field).sort()).toEqual(["email", "name", "password"]);
    const dup = await request(app).post("/api/auth/register").send({ name: "A", email: "alice@test.dev", password: PW });
    expect(dup.status).toBe(409);
  });
  test("login gives the same error for wrong password and unknown email", async () => {
    const a = await request(app).post("/api/auth/login").send({ email: "alice@test.dev", password: "wrongpass1" });
    const b = await request(app).post("/api/auth/login").send({ email: "ghost@test.dev", password: "wrongpass1" });
    expect(a.status).toBe(401);
    expect(a.body.error).toBe(b.body.error);
  });
  test("logout clears the session", async () => {
    const a = request.agent(app);
    await a.post("/api/auth/login").send({ email: "bob@test.dev", password: PW });
    expect((await a.get("/api/auth/me")).status).toBe(200);
    await a.post("/api/auth/logout");
    expect((await a.get("/api/auth/me")).status).toBe(401);
  });
  test("password hash is never returned", async () => {
    const r = await alice.get("/api/auth/me");
    expect(JSON.stringify(r.body)).not.toMatch(/password/i);
  });
});

describe("activity CRUD + validation (FR-03, FR-04)", () => {
  test.each([
    ["negative quantity", { quantity: -5 }, "quantity"],
    ["zero quantity", { quantity: 0 }, "quantity"],
    ["string quantity", { quantity: "abc" }, "quantity"],
    ["malformed date", { activity_date: "2026-13-45" }, "activity_date"],
    ["wrong date format", { activity_date: "20/10/2026" }, "activity_date"],
    ["future date", { activity_date: addDays(T, 30) }, "activity_date"],
    ["missing unit", { unit: undefined }, "unit"],
    ["unit not allowed for type", { unit: "kWh" }, "unit"],
    ["unsupported activity type", { activity_type: "jetpack" }, "activity_type"],
    ["type in wrong category", { category: "energy" }, "activity_type"],
    ["absurd quantity", { quantity: 999999 }, "quantity"],
  ])("rejects %s", async (_n, patch, field) => {
    const r = await alice.post("/api/activities").send(act(patch));
    expect(r.status).toBe(400);
    expect(r.body.details.some((d) => d.field === field)).toBe(true);
  });

  test("create, read, edit, delete in each category", async () => {
    const samples = [
      act(),
      { category: "energy", activity_type: "electricity", quantity: 200, unit: "kWh", activity_date: T },
      { category: "consumption", activity_type: "vegetarian_meal", quantity: 3, unit: "meal", activity_date: T },
    ];
    for (const s of samples) {
      const c = await alice.post("/api/activities").send(s);
      expect(c.status).toBe(201);
      const id = c.body.activity.id;
      expect((await alice.get(`/api/activities/${id}`)).body.activity.activity_type).toBe(s.activity_type);
      const u = await alice.patch(`/api/activities/${id}`).send({ quantity: s.quantity + 1 });
      expect(u.status).toBe(200);
      expect(u.body.activity.quantity).toBe(s.quantity + 1);
      expect((await alice.delete(`/api/activities/${id}`)).status).toBe(200);
      expect((await alice.get(`/api/activities/${id}`)).status).toBe(404);
    }
  });

  test("edit that makes the record invalid is rejected and nothing changes", async () => {
    const id = (await alice.post("/api/activities").send(act({ quantity: 10 }))).body.activity.id;
    const r = await alice.patch(`/api/activities/${id}`).send({ quantity: -1 });
    expect(r.status).toBe(400);
    expect((await alice.get(`/api/activities/${id}`)).body.activity.quantity).toBe(10);
    await alice.delete(`/api/activities/${id}`);
  });
});

describe("calculation (FR-06, section 9)", () => {
  test("quantity x factor, with unit conversion and full precision", async () => {
    const km = await alice.post("/api/activities").send(act({ quantity: 100, unit: "km" }));
    expect(km.body.activity.co2e_kg).toBeCloseTo(17, 3); // 100 km x 0.17
    expect(km.body.activity.factor.version).toBe(1);
    const mi = await alice.post("/api/activities").send(act({ quantity: 10, unit: "mi" }));
    expect(mi.body.activity.co2e_kg).toBeCloseTo(10 * 1.609344 * 0.17, 3);
    const cyl = await alice.post("/api/activities").send({ category: "energy", activity_type: "lpg", quantity: 1, unit: "cylinder_14_2kg", activity_date: T });
    expect(cyl.body.activity.co2e_kg).toBeCloseTo(14.2 * 2.98, 3);
    for (const r of [km, mi, cyl]) await alice.delete(`/api/activities/${r.body.activity.id}`);
  });
});

describe("dashboard (FR-07, FR-08)", () => {
  let carol;
  beforeAll(async () => {
    carol = await signup("carol");
    const d = (n) => addDays(T, -n);
    const rows = [
      act({ quantity: 50, activity_date: d(2) }),                                                   // 8.5
      { category: "energy", activity_type: "electricity", quantity: 100, unit: "kWh", activity_date: d(2) }, // 71
      { category: "consumption", activity_type: "beef_meal", quantity: 2, unit: "meal", activity_date: d(5) }, // 12
      act({ activity_type: "bus", quantity: 10, activity_date: d(5) }),                             // 0.89
    ];
    for (const r of rows) expect((await carol.post("/api/activities").send(r)).status).toBe(201);
  });
  test("total equals sum of categories and matches hand calculation", async () => {
    const r = await carol.get(`/api/dashboard/summary?from=${addDays(T, -10)}&to=${T}`);
    expect(r.status).toBe(200);
    const b = r.body;
    expect(b.total_kg).toBeCloseTo(8.5 + 71 + 12 + 0.89, 2);
    const sum = Object.values(b.by_category).reduce((a, c) => a + c, 0);
    expect(Math.abs(sum - b.total_kg)).toBeLessThan(0.005);
    expect(b.by_category.energy).toBeCloseTo(71, 2);
    const trendSum = b.trend.buckets.reduce((a, x) => a + x.total_kg, 0);
    expect(Math.abs(trendSum - b.total_kg)).toBeLessThan(0.01);
    expect(b.trend.buckets).toHaveLength(11);
  });
  test("date boundaries are inclusive", async () => {
    const day = addDays(T, -2);
    const r = await carol.get(`/api/dashboard/summary?from=${day}&to=${day}`);
    expect(r.body.activity_count).toBe(2);
    expect(r.body.total_kg).toBeCloseTo(79.5, 2);
  });
  test("empty period gives zeros and a clear note", async () => {
    const r = await carol.get(`/api/dashboard/summary?from=2020-01-01&to=2020-01-31`);
    expect(r.body.total_kg).toBe(0);
    expect(r.body.coverage.note).toMatch(/No activities/);
    expect(r.body.trend.buckets.every((b) => !b.has_data)).toBe(true);
  });
  test("missing categories are called out", async () => {
    const r = await carol.get(`/api/dashboard/summary?from=${addDays(T, -2)}&to=${addDays(T, -2)}`);
    expect(r.body.coverage.categories_missing).toEqual(["consumption"]);
    expect(r.body.coverage.note).toMatch(/understated/);
  });
  test("bad ranges are rejected", async () => {
    expect((await carol.get("/api/dashboard/summary?from=2026-02-30&to=2026-03-01")).status).toBe(400);
    expect((await carol.get("/api/dashboard/summary?from=2026-03-02&to=2026-03-01")).status).toBe(400);
  });

  describe("recommendations (FR-09, FR-10)", () => {
    test("matches activity, ranks by estimated impact, explains why", async () => {
      const r = await carol.get("/api/recommendations?days=30");
      expect(r.status).toBe(200);
      const keys = r.body.items.map((i) => i.rule_key);
      expect(keys).toContain("electricity_cut_10");
      expect(keys).toContain("beef_to_chicken");
      expect(keys).not.toContain("flight_to_train"); // no flights logged
      // 100 kWh x 0.71 x 10% = 7.1 ; beef 2 meals: 12*0.5 - 2*0.5*1.8 = 4.2
      const elec = r.body.items.find((i) => i.rule_key === "electricity_cut_10");
      expect(elec.estimated_reduction_kg).toBeCloseTo(7.1, 2);
      const beef = r.body.items.find((i) => i.rule_key === "beef_to_chicken");
      expect(beef.estimated_reduction_kg).toBeCloseTo(4.2, 2);
      expect(elec.rank).toBeLessThan(beef.rank);
      expect(elec.why).toMatch(/100 kWh/);
      expect(elec.impact_label).toMatch(/Estimated/);
      const reds = r.body.items.map((i) => i.estimated_reduction_kg);
      expect([...reds].sort((a, b) => b - a)).toEqual(reds);
    });
    test("is reproducible for the same inputs", async () => {
      const a = await carol.get("/api/recommendations?days=30");
      const b = await carol.get("/api/recommendations?days=30");
      expect(a.body.items).toEqual(b.body.items);
    });
    test("new user gets an empty state, not an error", async () => {
      const r = await signup("newbie").then((a) => a.get("/api/recommendations"));
      expect(r.status).toBe(200);
      expect(r.body.items).toEqual([]);
      expect(r.body.empty_reason).toBe("no_data");
    });
    test("disabled rules are skipped", async () => {
      const rules = (await admin.get("/api/admin/recommendation-rules")).body.items;
      const rule = rules.find((x) => x.rule_key === "electricity_cut_10");
      expect((await admin.patch(`/api/admin/recommendation-rules/${rule.id}`).send({ enabled: false })).status).toBe(200);
      const r = await carol.get("/api/recommendations?days=30");
      expect(r.body.items.map((i) => i.rule_key)).not.toContain("electricity_cut_10");
      await admin.patch(`/api/admin/recommendation-rules/${rule.id}`).send({ enabled: true });
    });
  });

  describe("what-if simulator (FR-11, FR-12)", () => {
    const body = (adjustments, extra = {}) => ({ from: addDays(T, -10), to: T, adjustments, ...extra });
    test("scale: baseline vs projected with absolute and % change, saved data untouched", async () => {
      const before = (await carol.get("/api/activities")).body;
      const r = await carol.post("/api/simulations").send(body([{ type: "scale", activity_type: "electricity", percent: -50 }]));
      expect(r.status).toBe(200);
      expect(r.body.baseline_kg).toBeCloseTo(92.39, 2);
      expect(r.body.projected_kg).toBeCloseTo(92.39 - 35.5, 2);
      expect(r.body.delta_kg).toBeCloseTo(-35.5, 2);
      expect(r.body.delta_pct).toBeCloseTo((-35.5 / 92.39) * 100, 1);
      expect(r.body.hypothetical).toBe(true);
      const after = (await carol.get("/api/activities")).body;
      expect(after).toEqual(before);
    });
    test("shift and add", async () => {
      const r = await carol.post("/api/simulations").send(body([
        { type: "shift", from: "beef_meal", to: "vegetarian_meal", fraction: 1 },
        { type: "add", activity_type: "metro", quantity: 100, unit: "km" },
      ]));
      expect(r.body.delta_kg).toBeCloseTo(-(12 - 2 * 1.3) + 100 * 0.028, 2);
      expect(r.body.adjustments).toHaveLength(2);
    });
    test("zero baseline: % is null with an explanation, no NaN", async () => {
      const r = await signup("zero").then((a) => a.post("/api/simulations").send(body([{ type: "add", activity_type: "bus", quantity: 10, unit: "km" }])));
      expect(r.status).toBe(200);
      expect(r.body.baseline_kg).toBe(0);
      expect(r.body.delta_pct).toBeNull();
      expect(r.body.delta_pct_note).toBeTruthy();
      expect(r.body.projected_kg).toBeCloseTo(0.89, 2);
    });
    test("rejects incompatible shifts and invalid input", async () => {
      expect((await carol.post("/api/simulations").send(body([{ type: "shift", from: "car_petrol", to: "beef_meal", fraction: 0.5 }]))).status).toBe(400);
      expect((await carol.post("/api/simulations").send(body([{ type: "scale", activity_type: "bus", percent: -150 }]))).status).toBe(400);
      expect((await carol.post("/api/simulations").send(body([]))).status).toBe(400);
    });
    test("saving a scenario stores only the scenario", async () => {
      const before = (await carol.get("/api/activities")).body.total;
      const r = await carol.post("/api/simulations").send(body([{ type: "scale", activity_type: "bus", percent: 10 }], { save: true, name: "More bus" }));
      expect(r.body.saved_id).toBeGreaterThan(0);
      expect((await carol.get("/api/simulations")).body.items[0].name).toBe("More bus");
      expect((await carol.get("/api/activities")).body.total).toBe(before);
    });
  });

  describe("progress (FR-13)", () => {
    test("compares two periods, flags incomplete data", async () => {
      const r = await carol.get("/api/progress");
      expect(r.status).toBe(200);
      expect(r.body.current.total_kg).toBeGreaterThan(0);
      expect(r.body.previous.total_kg).toBe(0);
      expect(r.body.comparison.comparable).toBe(false);
      expect(r.body.caveats.join(" ")).toMatch(/no logged activities/);
      expect(r.body.milestones.find((m) => m.key === "first_log").achieved).toBe(true);
    });
    test("custom comparison when both periods have data", async () => {
      const a = await signup("dave");
      await a.post("/api/activities").send(act({ quantity: 100, activity_date: addDays(T, -40) }));
      await a.post("/api/activities").send(act({ quantity: 50, activity_date: addDays(T, -2) }));
      const r = await a.get("/api/progress");
      expect(r.body.comparison.comparable).toBe(true);
      expect(r.body.comparison.delta_pct).toBeCloseTo(-50, 1);
      expect(r.body.milestones.find((m) => m.key === "reduction_5").achieved).toBe(true);
    });
  });
});

describe("privacy & authorization (FR-16, NFR-01)", () => {
  test("users cannot read, edit or delete each other's activities", async () => {
    const id = (await alice.post("/api/activities").send(act())).body.activity.id;
    expect((await bob.get(`/api/activities/${id}`)).status).toBe(404);
    expect((await bob.patch(`/api/activities/${id}`).send({ quantity: 1 })).status).toBe(404);
    expect((await bob.delete(`/api/activities/${id}`)).status).toBe(404);
    expect((await alice.get(`/api/activities/${id}`)).body.activity.quantity).toBe(100);
    const list = await bob.get("/api/activities");
    expect(list.body.items.find((x) => x.id === id)).toBeUndefined();
  });
  test("non-admins cannot touch factors or rules", async () => {
    expect((await alice.get("/api/admin/emission-factors")).status).toBe(403);
    expect((await alice.patch("/api/admin/emission-factors/1").send({ value: 0, source: "hack" })).status).toBe(403);
    expect((await alice.post("/api/admin/recommendation-rules").send({})).status).toBe(403);
    expect((await request(app).get("/api/admin/emission-factors")).status).toBe(401);
  });
  test("admin does not get access to other users' activity data via the activity API", async () => {
    const id = (await alice.post("/api/activities").send(act())).body.activity.id;
    expect((await admin.get(`/api/activities/${id}`)).status).toBe(404);
  });
  test("a forged token for a user id is rejected", async () => {
    const jwt = require("jsonwebtoken");
    const bad = jwt.sign({ sub: 1, role: "admin" }, "wrong-secret");
    expect((await request(app).get("/api/admin/emission-factors").set("Cookie", `cw_token=${bad}`)).status).toBe(401);
  });
  test("export and account deletion", async () => {
    const e = await signup("eve");
    await e.post("/api/activities").send(act());
    const ex = await e.get("/api/auth/export");
    expect(ex.body.activities).toHaveLength(1);
    expect((await e.delete("/api/auth/me").send({ password: "nope12345" })).status).toBe(401);
    expect((await e.delete("/api/auth/me").send({ password: PW })).status).toBe(200);
    expect((await e.get("/api/auth/me")).status).toBe(401);
    const left = await db.query("SELECT count(*)::int n FROM activities a JOIN users u ON u.id=a.user_id WHERE u.email='eve@test.dev'");
    expect(left.rows[0].n).toBe(0);
  });
});

describe("admin: factor versioning & missing factors (FR-05, FR-15, section 9)", () => {
  test("updating a factor creates a new version; old activities keep the old version", async () => {
    const f = await admin.get("/api/admin/emission-factors?activity_type=bus&region=IN&current=true");
    const cur = f.body.items[0];
    const old = await alice.post("/api/activities").send(act({ activity_type: "bus", quantity: 10, activity_date: addDays(T, -20) }));
    expect(old.body.activity.co2e_kg).toBeCloseTo(0.89, 3);

    expect((await admin.patch(`/api/admin/emission-factors/${cur.id}`).send({ value: -1, source: "DEFRA 2025" })).status).toBe(400);
    expect((await admin.patch(`/api/admin/emission-factors/${cur.id}`).send({ value: 0.2, source: "" })).status).toBe(400);
    expect((await admin.patch(`/api/admin/emission-factors/${cur.id}`).send({ value: 0.2, source: "DEFRA 2025", valid_from: "2023-01-01" })).status).toBe(400);

    const upd = await admin.patch(`/api/admin/emission-factors/${cur.id}`).send({ value: 0.2, source: "DEFRA 2025 (test)", valid_from: addDays(T, -10) });
    expect(upd.status).toBe(200);
    expect(upd.body.factor.version).toBe(2);

    const oldAfter = (await alice.get(`/api/activities/${old.body.activity.id}`)).body.activity;
    expect(oldAfter.factor.version).toBe(1);
    expect(oldAfter.co2e_kg).toBeCloseTo(0.89, 3);
    const fresh = await alice.post("/api/activities").send(act({ activity_type: "bus", quantity: 10, activity_date: T }));
    expect(fresh.body.activity.factor.version).toBe(2);
    expect(fresh.body.activity.co2e_kg).toBeCloseTo(2.0, 3);

    expect((await admin.patch(`/api/admin/emission-factors/${cur.id}`).send({ value: 0.3, source: "x y z", valid_from: T })).status).toBe(409); // old version is closed
    const log = await admin.get("/api/admin/change-log");
    expect(log.body.items[0].user_email).toBe("admin@carbonwise.app");
  });
  test("missing factor => calculation unavailable, not silently substituted", async () => {
    await db.query("DELETE FROM emission_factors WHERE activity_type='walk' AND region='IN'");
    const r = await alice.post("/api/activities").send(act({ activity_type: "walk", quantity: 3 }));
    expect(r.status).toBe(201);
    expect(r.body.activity.co2e_kg).toBeNull();
    expect(r.body.activity.unavailable).toMatch(/No emission factor/);
    const s = await alice.get(`/api/dashboard/summary?from=${T}&to=${T}`);
    expect(s.body.unavailable_count).toBeGreaterThan(0);
    expect(s.body.unavailable_note).toBeTruthy();
  });
  test("admin can create rules with validation", async () => {
    const good = { rule_key: "test_rule", title: "Test rule here", params: { activity_type: "bus", min_quantity: 1, action: { type: "reduce", fraction: 0.1 } }, action_text: "Do less of it", rationale: "You logged {qty} {unit}", priority: 1, enabled: true };
    expect((await admin.post("/api/admin/recommendation-rules").send(good)).status).toBe(201);
    expect((await admin.post("/api/admin/recommendation-rules").send(good)).status).toBe(409);
    const bad = { ...good, rule_key: "bad_rule", params: { activity_type: "bus", min_quantity: 1, action: { type: "shift", to: "beef_meal", fraction: 0.5 } } };
    expect((await admin.post("/api/admin/recommendation-rules").send(bad)).status).toBe(400);
  });
});

describe("misc", () => {
  test("malformed JSON gives a clean 400", async () => {
    const r = await alice.post("/api/activities").set("Content-Type", "application/json").send("{bad");
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/JSON/);
  });
  test("unknown API route is a JSON 404", async () => {
    const r = await request(app).get("/api/nope");
    expect(r.status).toBe(404);
    expect(r.body.error).toBeTruthy();
  });
  test("activity list filters", async () => {
    const r = await alice.get(`/api/activities?category=energy&from=${T}&to=${T}`);
    expect(r.status).toBe(200);
    expect(r.body.items.every((i) => i.category === "energy")).toBe(true);
  });
});
