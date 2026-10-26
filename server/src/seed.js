// Seed data. IMPORTANT: factor values below are rounded, illustrative figures
// from commonly used public sources (UK DEFRA/DESNZ conversion factors, India CEA
// grid baseline, Our World in Data / Poore & Nemecek for food). They are NOT audited.
// The team must verify each value against the cited source before any real use -
// the Admin area exists so factors can be corrected with a full version trail.
const bcrypt = require("bcryptjs");
const db = require("./db");
const config = require("./config");
const { allTypes } = require("./catalog");

const VALID_FROM = "2024-01-01";

// [activity_type, kg CO2e per base unit, source]
const IN_FACTORS = {
  car_petrol: [0.17, "DEFRA/DESNZ 2024 - average petrol car (approx.)"],
  car_diesel: [0.17, "DEFRA/DESNZ 2024 - average diesel car (approx.)"],
  ev_car: [0.107, "Derived: ~0.15 kWh/km x India grid factor"],
  motorbike: [0.114, "DEFRA/DESNZ 2024 - average motorbike (approx.)"],
  bus: [0.089, "DEFRA/DESNZ 2024 - local bus, per passenger-km (approx.)"],
  metro: [0.028, "DEFRA/DESNZ 2024 - London Underground, per passenger-km (approx.)"],
  train: [0.035, "DEFRA/DESNZ 2024 - national rail, per passenger-km (approx.)"],
  flight_domestic: [0.246, "DEFRA/DESNZ 2024 - domestic flight incl. uplift (approx.)"],
  bicycle: [0, "Zero direct emissions (operational)"],
  walk: [0, "Zero direct emissions (operational)"],
  electricity: [0.71, "CEA CO2 Baseline Database - India grid average (approx.)"],
  lpg: [2.98, "DEFRA/DESNZ 2024 - LPG per kg (approx.)"],
  piped_gas: [2.03, "DEFRA/DESNZ 2024 - natural gas per m3 (approx.)"],
  beef_meal: [6.0, "Derived from Poore & Nemecek (2018) per-meal estimate (approx.)"],
  chicken_meal: [1.8, "Derived from Poore & Nemecek (2018) per-meal estimate (approx.)"],
  vegetarian_meal: [1.3, "Derived from Scarborough et al. (2014) diet averages (approx.)"],
  vegan_meal: [1.0, "Derived from Scarborough et al. (2014) diet averages (approx.)"],
  clothing_item: [10, "Average garment lifecycle estimate (approx.)"],
  waste_kg: [0.46, "DEFRA/DESNZ 2024 - municipal waste to landfill per kg (approx.)"],
};
const GLOBAL_OVERRIDES = {
  electricity: [0.46, "IEA - world average grid intensity (approx.)"],
  ev_car: [0.07, "Derived: ~0.15 kWh/km x world grid factor"],
};

async function seedFactors() {
  const { rows } = await db.query("SELECT count(*)::int AS n FROM emission_factors");
  if (rows[0].n > 0) return;
  for (const t of allTypes()) {
    const inF = IN_FACTORS[t.activity_type];
    if (!inF) throw new Error("Missing seed factor for " + t.activity_type);
    const gl = GLOBAL_OVERRIDES[t.activity_type] || inF;
    for (const [region, [value, source]] of [["IN", inF], ["GLOBAL", gl]]) {
      await db.query(
        `INSERT INTO emission_factors (category, activity_type, region, value, unit_basis, source, version, valid_from)
         VALUES ($1,$2,$3,$4,$5,$6,1,$7)`,
        [t.category, t.activity_type, region, value, t.base, source, VALID_FROM]
      );
    }
  }
}

// params.action: {type:"shift", to, fraction} | {type:"reduce", fraction}
// rationale placeholders: {qty} {unit} {co2e} {days}
const RULES = [
  ["car_to_metro", "Take the metro instead of your petrol car", "commute", "car_petrol", 20,
    { type: "shift", to: "metro", fraction: 0.5 }, 10,
    "Switch half of your petrol-car trips to the metro, where a route exists.",
    "You logged {qty} {unit} in a petrol car over the last {days} days ({co2e} kg CO2e)."],
  ["car_to_bus", "Take the bus instead of your diesel car", "commute", "car_diesel", 20,
    { type: "shift", to: "bus", fraction: 0.5 }, 8,
    "Replace half of your diesel-car trips with the bus.",
    "You logged {qty} {unit} in a diesel car over the last {days} days ({co2e} kg CO2e)."],
  ["petrol_to_ev", "Move some petrol-car travel to an electric car", "commute", "car_petrol", 100,
    { type: "shift", to: "ev_car", fraction: 0.5 }, 5,
    "If you have access to an EV (own, shared or rented), use it for half of this driving.",
    "You logged {qty} {unit} in a petrol car over the last {days} days ({co2e} kg CO2e)."],
  ["bike_short_trips", "Cycle your short motorbike trips", "commute", "motorbike", 30,
    { type: "shift", to: "bicycle", fraction: 0.2 }, 6,
    "Swap the shortest 20% of your motorbike trips (under ~3 km) for a bicycle or walking.",
    "You logged {qty} {unit} on a motorbike/scooter over the last {days} days ({co2e} kg CO2e)."],
  ["flight_to_train", "Take the train instead of a domestic flight", "commute", "flight_domestic", 300,
    { type: "shift", to: "train", fraction: 0.5 }, 9,
    "For routes with a decent train service, replace half of your domestic flying with rail.",
    "You logged {qty} {unit} of domestic flying over the last {days} days ({co2e} kg CO2e)."],
  ["electricity_cut_10", "Cut electricity use by 10%", "energy", "electricity", 50,
    { type: "reduce", fraction: 0.1 }, 7,
    "Switch to LED lighting, set the AC to 24-26 C, and switch off standby devices to cut about 10%.",
    "You used {qty} {unit} of electricity over the last {days} days ({co2e} kg CO2e)."],
  ["lpg_cut_10", "Use 10% less cooking gas", "energy", "lpg", 5,
    { type: "reduce", fraction: 0.1 }, 4,
    "Use a pressure cooker, cover pots and keep burners matched to pot size to save about 10%.",
    "You used {qty} {unit} of LPG over the last {days} days ({co2e} kg CO2e)."],
  ["beef_to_chicken", "Swap some beef meals for chicken, fish or eggs", "consumption", "beef_meal", 2,
    { type: "shift", to: "chicken_meal", fraction: 0.5 }, 9,
    "Replace half of your beef/buffalo meals with chicken, fish or egg dishes.",
    "You logged {qty} {unit} of beef/buffalo meals over the last {days} days ({co2e} kg CO2e)."],
  ["meat_to_veg", "Make some chicken meals vegetarian", "consumption", "chicken_meal", 4,
    { type: "shift", to: "vegetarian_meal", fraction: 0.3 }, 5,
    "Try vegetarian options for about 3 in every 10 meat meals.",
    "You logged {qty} {unit} of chicken/fish/egg meals over the last {days} days ({co2e} kg CO2e)."],
  ["waste_cut_20", "Reduce landfilled waste by 20%", "consumption", "waste_kg", 5,
    { type: "reduce", fraction: 0.2 }, 3,
    "Compost kitchen waste and separate recyclables to send about 20% less to landfill.",
    "You logged {qty} {unit} of landfilled waste over the last {days} days ({co2e} kg CO2e)."],
  ["clothing_cut_30", "Buy 30% fewer new clothes", "consumption", "clothing_item", 2,
    { type: "reduce", fraction: 0.3 }, 3,
    "Buy second-hand, repair, or hold off on about 3 in every 10 purchases.",
    "You bought {qty} {unit} of new clothing over the last {days} days ({co2e} kg CO2e)."],
];

async function seedRules() {
  const { rows } = await db.query("SELECT count(*)::int AS n FROM recommendation_rules");
  if (rows[0].n > 0) return;
  for (const [key, title, category, activity_type, min_quantity, action, priority, action_text, rationale] of RULES) {
    const params = { activity_type, min_quantity, window_days: 30, action };
    await db.query(
      `INSERT INTO recommendation_rules (rule_key, title, category, params, action_text, rationale, priority)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [key, title, category, JSON.stringify(params), action_text, rationale, priority]
    );
  }
}

async function seedAdmin() {
  const { rows } = await db.query("SELECT id FROM users WHERE email=$1", [config.adminEmail]);
  if (rows.length) return;
  const hash = await bcrypt.hash(config.adminPassword, config.bcryptCost);
  await db.query(
    "INSERT INTO users (name,email,password_hash,role) VALUES ($1,$2,$3,'admin')",
    ["Administrator", config.adminEmail, hash]
  );
}

async function seedAll() {
  await db.init();
  await seedFactors();
  await seedRules();
  await seedAdmin();
}

module.exports = { seedAll };
