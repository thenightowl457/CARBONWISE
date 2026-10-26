// Creates a demo STUDENT user with ~120 days of realistic, deterministic activity data.
//   npm run seed:demo      -> login: demo@carbonwise.app / Demo@1234
// Persona: Aarav Sharma, B.Tech student living in a hostel in Bengaluru. Cycles on campus,
// takes the metro/bus to the city, eats mostly mess food, travels home by train/flight in breaks.
const bcrypt = require("bcryptjs");
const config = require("../src/config");
const db = require("../src/db");
const { seedAll } = require("../src/seed");
const { today, addDays } = require("../src/utils/dates");

const EMAIL = "demo@carbonwise.app";
const DAYS = 120;
let seed = 7;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const between = (a, b) => Math.round((a + rnd() * (b - a)) * 10) / 10;
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

(async () => {
  await seedAll();
  await db.query("DELETE FROM users WHERE email=$1", [EMAIL]);
  const hash = await bcrypt.hash("Demo@1234", config.bcryptCost);
  const u = (await db.query("INSERT INTO users (name,email,password_hash) VALUES ('Aarav Sharma',$1,$2) RETURNING id", [EMAIL, hash])).rows[0];
  const T = today();
  let n = 0;
  const add = async (category, activity_type, quantity, unit, date) => {
    n++;
    await db.query(
      "INSERT INTO activities (user_id,category,activity_type,quantity,unit,activity_date) VALUES ($1,$2,$3,$4,$5,$6)",
      [u.id, category, activity_type, quantity, unit, date]
    );
  };
  for (let i = DAYS - 1; i >= 0; i--) {
    const d = addDays(T, -i);
    const dow = new Date(d + "T00:00:00Z").getUTCDay();
    const classDay = dow >= 1 && dow <= 5;
    const greener = i < 50; // recent weeks: more cycling/metro, fewer bike rides, more veg meals
    const exams = i >= 20 && i <= 34; // exam fortnight: stays in hostel, library late nights

    if (classDay && !exams) {
      await add("commute", "bicycle", between(2, 5), "km", d);                       // hostel <-> lecture halls
      if (rnd() < (greener ? 0.55 : 0.3)) await add("commute", "metro", between(8, 16), "km", d);   // internships / city
      else if (rnd() < 0.25) await add("commute", "bus", between(6, 14), "km", d);
      if (!greener && rnd() < 0.3) await add("commute", "motorbike", between(5, 12), "km", d);       // friend's bike
    } else if (!classDay && rnd() < 0.5) {
      await add("commute", pick(["metro", "bus", "walk"]), between(4, 18), "km", d); // weekend outings
    }
    if (classDay && rnd() < 0.6) await add("commute", "walk", between(1, 3), "km", d);

    // Meals: hostel mess is mostly vegetarian; non-veg on weekends / eating out
    const mealPool = greener
      ? ["vegetarian_meal", "vegetarian_meal", "vegetarian_meal", "vegan_meal", "chicken_meal"]
      : ["vegetarian_meal", "vegetarian_meal", "chicken_meal", "chicken_meal", "beef_meal"];
    await add("consumption", pick(mealPool), 2, "meal", d);
    if (!classDay || rnd() < 0.3) await add("consumption", pick(mealPool), 1, "meal", d);
    if (rnd() < 0.35) await add("consumption", "waste_kg", between(0.2, 0.7), "kg", d);

    // Energy: hostel electricity share (monthly) + occasional piped-gas free; no LPG in hostel
    if (i % 30 === 6) await add("energy", "electricity", between(55, 85) * (greener ? 0.9 : 1), "kWh", d);

    // Shopping: a few clothing items per semester
    if (i === 95 || i === 58 || i === 12) await add("consumption", "clothing_item", between(1, 3) | 0 || 1, "item", d);
    // Trips home
    if (i === 100 || i === 45) await add("commute", "train", between(320, 380), "km", d);   // weekend home trip (train)
    if (i === 75) await add("commute", "flight_domestic", 1750, "km", d);                    // semester break flight
    if (i === 62) await add("commute", "flight_domestic", 1750, "km", d);                    // return flight
  }
  console.log(`Demo student ready (${n} activities over ${DAYS} days): ${EMAIL} / Demo@1234`);
  await db.close();
})().catch((e) => { console.error(e); process.exit(1); });
