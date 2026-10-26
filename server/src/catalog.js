// Activity catalog: which activity types exist, their base unit (the unit the
// emission factor is expressed in), which input units users may pick, and the
// conversion multiplier from input unit -> base unit.
// `max` is a sanity limit (in base units) for ONE entry.

const REGIONS = { IN: "India", GLOBAL: "Global average" };

const CATALOG = {
  commute: {
    car_petrol:   { label: "Car (petrol)",      base: "km", units: { km: 1, mi: 1.609344 }, max: 5000 },
    car_diesel:   { label: "Car (diesel)",      base: "km", units: { km: 1, mi: 1.609344 }, max: 5000 },
    ev_car:       { label: "Electric car",      base: "km", units: { km: 1, mi: 1.609344 }, max: 5000,
                    note: "Charging is already included in this factor. Do NOT also log that charging as home electricity." },
    motorbike:    { label: "Motorbike / scooter", base: "km", units: { km: 1, mi: 1.609344 }, max: 3000 },
    bus:          { label: "Bus",               base: "km", units: { km: 1, mi: 1.609344 }, max: 3000 },
    metro:        { label: "Metro",             base: "km", units: { km: 1, mi: 1.609344 }, max: 1000 },
    train:        { label: "Train",             base: "km", units: { km: 1, mi: 1.609344 }, max: 5000 },
    flight_domestic: { label: "Flight (domestic)", base: "km", units: { km: 1, mi: 1.609344 }, max: 5000 },
    bicycle:      { label: "Bicycle",           base: "km", units: { km: 1, mi: 1.609344 }, max: 500 },
    walk:         { label: "Walking",           base: "km", units: { km: 1, mi: 1.609344 }, max: 100 },
  },
  energy: {
    electricity:  { label: "Electricity",       base: "kWh", units: { kWh: 1 }, max: 20000,
                    note: "Log each bill once. Pick the date you want it counted on." },
    lpg:          { label: "LPG (cooking gas)", base: "kg", units: { kg: 1, cylinder_14_2kg: 14.2 }, max: 500 },
    piped_gas:    { label: "Piped natural gas", base: "m3", units: { m3: 1 }, max: 2000 },
  },
  consumption: {
    beef_meal:       { label: "Beef / buffalo meal", base: "meal", units: { meal: 1 }, max: 20 },
    chicken_meal:    { label: "Chicken / fish / egg meal", base: "meal", units: { meal: 1 }, max: 20 },
    vegetarian_meal: { label: "Vegetarian meal",   base: "meal", units: { meal: 1 }, max: 20 },
    vegan_meal:      { label: "Vegan meal",        base: "meal", units: { meal: 1 }, max: 20 },
    clothing_item:   { label: "New clothing item", base: "item", units: { item: 1 }, max: 200 },
    waste_kg:        { label: "Household waste (landfilled)", base: "kg", units: { kg: 1 }, max: 500 },
  },
};

const CATEGORIES = Object.keys(CATALOG);

function getType(activityType) {
  for (const [category, types] of Object.entries(CATALOG)) {
    if (types[activityType]) return { category, activity_type: activityType, ...types[activityType] };
  }
  return null;
}

function allTypes() {
  const out = [];
  for (const [category, types] of Object.entries(CATALOG)) {
    for (const [activity_type, def] of Object.entries(types)) out.push({ category, activity_type, ...def });
  }
  return out;
}

// Public shape for the frontend forms.
function publicCatalog() {
  return CATEGORIES.map((category) => ({
    category,
    types: Object.entries(CATALOG[category]).map(([activity_type, d]) => ({
      activity_type,
      label: d.label,
      base_unit: d.base,
      units: Object.keys(d.units),
      max: d.max,
      note: d.note || null,
    })),
  }));
}

module.exports = { CATALOG, CATEGORIES, REGIONS, getType, allTypes, publicCatalog };
