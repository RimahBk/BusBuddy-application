// =====================================================================
// BusBuddy – build the GeoJSON routes for js/demo/demo-fixtures.js
//
// Reads data/BusRoutes_edited.geojson and prints the JavaScript for:
//   route 4  "Saida – Cola"  (from the "Cola - Saida" Bus (24 Seats) line)
//   route 5  "Aley – Cola"   (the Cola end of the "Cola - Bhamdoun" line, cut at Aley Roundabout)
//   route 1  "Chouf – LIU Cola" (corrected Damour / Khaldeh stops and a path)
// plus the updated_locations rows for the running trips 9 and 11,
// and a summary table to check the result.
//
// Usage (from the project folder):   node tools/build-routes.js [path/to/file.geojson]
// All distances use the haversine formula with an Earth radius of 6371 km.
// =====================================================================
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const GEOJSON = process.argv[2] || path.join(ROOT, "data", "BusRoutes_edited.geojson");
const DEMO_DATA = path.join(ROOT, "js", "demo", "demo-fixtures.js");

const R = 6371000;                 // Earth radius in metres
const COLA = [33.877, 35.495];     // [lat, lng] used to decide which end of a line is Cola
const NEAR_PATH = 200;             // a named stop must be closer than this to the path (metres)
const MIN_GAP = 400;               // drop a stop closer than this (along the road) to the previous one
const FIRST_STOP_ID = 21;          // stop ids 1–20 are already used in demo-fixtures.js

// ---------- small geometry helpers (points are [lat, lng]) ----------
const rad = (d) => (d * Math.PI) / 180;
function haversine(a, b) {
  const dLat = rad(b[0] - a[0]), dLng = rad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const round5 = (x) => Math.round(x * 1e5) / 1e5;
const roundPt = (p) => [round5(p[0]), round5(p[1])];

// Distance from point p to the segment a–b: find the closest point on the segment
// (on a small flat map around p, fine for distances of a few km), then measure it with haversine.
function distToSegment(p, a, b) {
  const k = Math.cos(rad(p[0]));
  const ax = (a[1] - p[1]) * k, ay = a[0] - p[0], bx = (b[1] - p[1]) * k, by = b[0] - p[0];
  const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
  let t = len2 ? -(ax * dx + ay * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return haversine(p, [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
}
function distToPath(p, line) {
  let best = Infinity;
  for (let i = 0; i < line.length - 1; i++) best = Math.min(best, distToSegment(p, line[i], line[i + 1]));
  return line.length === 1 ? haversine(p, line[0]) : best;
}
function nearestVertex(p, line) {
  let best = 0, bestD = Infinity;
  line.forEach((v, i) => { const d = haversine(p, v); if (d < bestD) { bestD = d; best = i; } });
  return best;
}
// cum[i] = distance along the line from its first point to vertex i (metres)
function cumulative(line) {
  const cum = [0];
  for (let i = 1; i < line.length; i++) cum.push(cum[i - 1] + haversine(line[i - 1], line[i]));
  return cum;
}
// The point found at a given fraction (0–1) of the line's length
function pointAtFraction(line, f) {
  const cum = cumulative(line), target = f * cum[cum.length - 1];
  for (let i = 1; i < line.length; i++) {
    if (cum[i] >= target) {
      const seg = cum[i] - cum[i - 1], t = seg ? (target - cum[i - 1]) / seg : 0;
      return [line[i - 1][0] + t * (line[i][0] - line[i - 1][0]), line[i - 1][1] + t * (line[i][1] - line[i - 1][1])];
    }
  }
  return line[line.length - 1];
}
const minutesOf = (hms) => { const [h, m, s] = hms.split(":").map(Number); return h * 60 + m + s / 60; };

// ---------- read the GeoJSON ----------
const geo = JSON.parse(fs.readFileSync(GEOJSON, "utf8"));
const lines = geo.features.filter((f) => f.geometry && f.geometry.type === "LineString");

// English stop name = first line of Description / Descritpion / description (after "Description:")
function englishName(props) {
  let d = props.Description || props.Descritpion || props.description || "";
  d = d.replace(/^\s*Descr?it?pt?ion\s*:\s*/i, "");
  return d.split(/<br\s*\/?>|\n/i)[0].trim();
}
const points = geo.features
  .filter((f) => f.geometry && f.geometry.type === "Point")
  .map((f) => ({ id: f.properties.name, name: englishName(f.properties), at: [f.geometry.coordinates[1], f.geometry.coordinates[0]] }))
  .filter((p) => p.name);

function findLine(busname, vehicle) {
  const found = lines.filter((f) => f.properties.busname === busname && (!vehicle || f.properties.vehicule_type === vehicle));
  if (found.length !== 1) throw new Error(`Expected one line "${busname}" (${vehicle}), found ${found.length}`);
  return found[0];
}
// GeoJSON is [lng, lat]; turn it into [lat, lng] and put the Cola end last
function colaLast(feature) {
  const line = feature.geometry.coordinates.map((c) => [c[1], c[0]]);
  return haversine(line[0], COLA) < haversine(line[line.length - 1], COLA) ? line.reverse() : line;
}

// ---------- build one route: path + stops + minutes ----------
// first / last = { name, index } – the end stops; totalMin = whole-trip minutes
function buildStops(line, firstName, lastName, totalMin) {
  const cum = cumulative(line), total = cum[cum.length - 1];

  // 1) named points near the path; keep the closest one of each name (A and B directions)
  const byName = {};
  points.forEach((p) => {
    const d = distToPath(p.at, line);
    if (d >= NEAR_PATH) return;
    if (!byName[p.name] || d < byName[p.name].d) byName[p.name] = { ...p, d };
  });
  // 2) snap each one to its nearest path vertex and order them along the path
  let middle = Object.values(byName)
    .map((p) => ({ name: p.name, source: p.id, index: nearestVertex(p.at, line) }))
    .sort((a, b) => a.index - b.index || cum[a.index] - cum[b.index]);

  // 3) drop stops less than MIN_GAP along the road from the previous kept stop
  const kept = [{ name: firstName, index: 0, source: "path start" }];
  middle.forEach((s) => { if (cum[s.index] - cum[kept[kept.length - 1].index] >= MIN_GAP) kept.push(s); });
  // the last stop always stays, so drop middle stops that are too close to it
  const end = line.length - 1;
  while (kept.length > 1 && cum[end] - cum[kept[kept.length - 1].index] < MIN_GAP) kept.pop();
  kept.push({ name: lastName, index: end, source: "path end" });

  return kept.map((s) => ({ ...s, at: line[s.index], km: cum[s.index] / 1000, minutes: Math.round((totalMin * cum[s.index]) / total) }));
}

const routes = [];

// ----- Route 4: Saida – Cola -----
{
  const f = findLine("Cola - Saida", "Bus (24 Seats)");
  const line = colaLast(f).map(roundPt);
  const totalMin = Math.round(minutesOf(f.properties.estimation_time));
  routes.push({ route_id: 4, name: "Saida – Cola", origin: "Saida", destination: "Cola", line, totalMin,
    stops: buildStops(line, "Saida", "Cola", totalMin),
    note: `"Cola - Saida" Bus (24 Seats), ${f.properties.estimation_time}, ${f.properties.service_type}` });
}

// ----- Route 5: Aley – Cola (Cola end of Cola - Bhamdoun) -----
{
  const f = findLine("Cola - Bhamdoun", "Bus (24 Seats)");
  const full = colaLast(f);
  const aley = points.find((p) => p.id === "ML1-A5");          // "Aley Roundabout"
  const cut = nearestVertex(aley.at, full);
  const line = full.slice(cut).map(roundPt);                      // from Aley to Cola
  const fullKm = cumulative(full).slice(-1)[0], cutKm = cumulative(line).slice(-1)[0];
  const totalMin = Math.round(minutesOf(f.properties.estimation_time) * cutKm / fullKm);
  routes.push({ route_id: 5, name: "Aley – Cola", origin: "Aley", destination: "Cola", line, totalMin,
    stops: buildStops(line, "Aley Roundabout", "Cola", totalMin),
    note: `"Cola - Bhamdoun" cut at vertex ${cut}/${full.length - 1}, ${haversine(aley.at, full[cut]).toFixed(0)} m from Aley Roundabout; full ${(fullKm / 1000).toFixed(1)} km` });
}

// ----- Route 1: Chouf – LIU Cola (fix Damour / Khaldeh, add a path) -----
// Route 2's path is read from js/demo/demo-fixtures.js so both routes share the same road.
const demoSrc = fs.readFileSync(DEMO_DATA, "utf8");
const geoBlock = demoSrc.replace(/\r\n/g, "\n").match(/const GEO_ROUTES = (\[[\s\S]*?\n\]);/);
const GEO_ROUTES = Function('"use strict"; return ' + geoBlock[1])();
const r2path = GEO_ROUTES.find((g) => g.route.route_id === 2).route.path;
function closestNamed(name) {
  return points.filter((p) => p.name === name)
    .map((p) => ({ ...p, d: distToPath(p.at, r2path) }))
    .sort((a, b) => a.d - b.d)[0];
}
const damour = closestNamed("Damour"), khalde = closestNamed("Khalde");
const BEITEDDINE = [33.6953, 35.5786], DEIR = [33.6967, 35.5617], LIU_COLA = [33.877, 35.493];
const damourAt = roundPt(damour.at), khaldeAt = roundPt(khalde.at);
// Beiteddine → Deir el Qamar → Damour: the GeoJSON has no line there, so the real mountain road
// comes from data/route1-chouf-road.json (OpenStreetMap road network, see "source" in that file).
// It used to be two straight lines, the second one cutting 10.5 km straight over the mountains.
const CHOUF_ROAD = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "route1-chouf-road.json"), "utf8")).path;
if (haversine(CHOUF_ROAD[CHOUF_ROAD.length - 1], damourAt) > 50) throw new Error("route1-chouf-road.json must end at the Damour stop " + damourAt);
// Then the official line from Damour to Cola; LIU Cola is added as the last point, so the line reaches the LIU Cola stop
const r1path = [...CHOUF_ROAD.slice(0, -1), damourAt, ...r2path.slice(nearestVertex(damourAt, r2path) + 1), LIU_COLA];
const r1 = { route_id: 1, name: "Chouf – LIU Cola", line: r1path, totalMin: 60,
  stops: [["Beiteddine", BEITEDDINE, 0], ["Deir el Qamar", DEIR, 8], ["Damour", damourAt, 30], ["Khaldeh", khaldeAt, 42], ["LIU Cola", LIU_COLA, 60]]
    .map(([name, at, minutes]) => ({ name, at, minutes })),
  note: `Damour from ${damour.id} (${damour.d.toFixed(0)} m from route 2), Khaldeh from ${khalde.id} (${khalde.d.toFixed(0)} m from route 2)` };

// ---------- print the JavaScript ----------
const js = (p) => JSON.stringify(p);
let nextStop = FIRST_STOP_ID;
const out = [];
out.push("// ===== GEO_ROUTES entries (paste after route 3, with a comma after route 3) =====");
out.push(routes.map((r) => {
  const stops = r.stops.map((s, i) =>
    `        { stop_id: ${nextStop++}, route_id: ${r.route_id}, address: ${js(s.name)}, latitude: ${s.at[0]}, longitude: ${s.at[1]}, stop_order: ${i + 1}, minutes_from_start: ${s.minutes} }`);
  return `    { route: { route_id: ${r.route_id}, name: ${js(r.name)}, origin: ${js(r.origin)}, destination: ${js(r.destination)},\n        path: ${js(r.line)} },\n      stops: [\n${stops.join(",\n")} ] }`;
}).join(",\n"));
out.push("\n// ===== route 1 path =====");
out.push(`path: ${js(r1.line)}`);
out.push("\n// ===== route 1 stops 3 and 4 =====");
out.push(`Damour  latitude: ${damourAt[0]}, longitude: ${damourAt[1]}`);
out.push(`Khaldeh latitude: ${khaldeAt[0]}, longitude: ${khaldeAt[1]}`);
out.push("\n// ===== updated_locations for trips 1 and 2 (route 1) =====");
// Route 1's minutes are not shared out by distance, so its buses are placed by the timetable:
// between the two stops around that minute, at the matching share of the road between them.
function pointAtMinutes(r, mins) {
  const cum = cumulative(r.line), total = cum[cum.length - 1];
  const at = r.stops.map((s) => cum[nearestVertex(s.at, r.line)]);
  const i = r.stops.findIndex((s) => s.minutes >= mins);
  const a = r.stops[i - 1], b = r.stops[i];
  const d = at[i - 1] + (at[i] - at[i - 1]) * (mins - a.minutes) / (b.minutes - a.minutes);
  return pointAtFraction(r.line, d / total);
}
// The point of a line closest to p (used to put a bus back on the road)
function snapToLine(p, line) {
  let best = line[0], bestD = Infinity;
  for (let i = 0; i < line.length - 1; i++) {
    for (let t = 0; t <= 1; t += 0.01) {
      const q = [line[i][0] + t * (line[i + 1][0] - line[i][0]), line[i][1] + t * (line[i + 1][1] - line[i][1])];
      const d = haversine(p, q); if (d < bestD) { bestD = d; best = q; }
    }
  }
  return best;
}
{
  const p1 = roundPt(pointAtMinutes(r1, 25));
  out.push(`      { location_id: 1, trip_id: 1, latitude: ${p1[0]}, longitude: ${p1[1]}, ... },   // 25 min after leaving, by the timetable`);
  const p2 = roundPt(snapToLine([33.79, 35.484], r1.line));
  out.push(`      { location_id: 2, trip_id: 2, latitude: ${p2[0]}, longitude: ${p2[1]}, ... },   // old point 33.790, 35.484 moved onto the road`);
}
out.push("\n// ===== updated_locations for trips 9 and 11 =====");
[[9, routes[0], 20, 5], [11, routes[1], 15, 6]].forEach(([trip, r, mins, locId]) => {
  const p = roundPt(pointAtFraction(r.line, mins / r.totalMin));
  out.push(`      { location_id: ${locId}, trip_id: ${trip}, latitude: ${p[0]}, longitude: ${p[1]}, time: iso(now - 20000), speed: 40 },   // ${r.name}, ${mins} of ${r.totalMin} min`);
});
console.log(out.join("\n"));

// ---------- summary table ----------
console.log("\n// ===== SUMMARY =====");
[r1, ...routes].forEach((r) => {
  const km = cumulative(r.line).slice(-1)[0] / 1000;
  console.log(`\nRoute ${r.route_id} "${r.name}" – ${r.line.length} path points, ${km.toFixed(1)} km, ${r.totalMin} min`);
  console.log(`  (${r.note})`);
  let ok = true;
  r.stops.forEach((s, i) => {
    if (i && s.minutes <= r.stops[i - 1].minutes) ok = false;
    console.log(`  ${String(i + 1).padStart(2)}. +${String(s.minutes).padStart(3)} min  ${s.name}` + (s.km != null ? `  (${s.km.toFixed(1)} km, from ${s.source})` : ""));
  });
  console.log(`  minutes increase: ${ok ? "yes" : "NO"};  last stop: ${r.stops[r.stops.length - 1].name}`);
});
