// =====================================================================
// Eta (UC-06): haversine distance ÷ recent speed, plus any reported delay.
// If the speed is unknown or the bus is stopped, the scheduled
// minutes_from_start difference is used instead.
// =====================================================================
export class Eta {
  static EARTH_RADIUS_KM = 6371;
  static ROAD_FACTOR = 1.3;     // roads are not straight
  static MIN_SPEED_KMH = 5;     // slower than this = treated as stopped
  static AT_STOP_KM = 0.3;      // closer than this = the bus is at that stop

  static distanceKm(lat1, lng1, lat2, lng2) {
    const R = Eta.EARTH_RADIUS_KM, rad = Math.PI / 180;
    const dLat = (lat2 - lat1) * rad, dLng = (lng2 - lng1) * rad;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  // Direction from point 1 to point 2 in degrees (0 = north, 90 = east)
  static bearing(lat1, lng1, lat2, lng2) {
    const rad = Math.PI / 180;
    const y = Math.sin((lng2 - lng1) * rad) * Math.cos(lat2 * rad);
    const x = Math.cos(lat1 * rad) * Math.sin(lat2 * rad) - Math.sin(lat1 * rad) * Math.cos(lat2 * rad) * Math.cos((lng2 - lng1) * rad);
    return (Math.atan2(y, x) / rad + 360) % 360;
  }

  // bus = a row from get_live_buses(); stops = that route's stops (sorted)
  // returns [{ stop, minutes }] for the stops still ahead of the bus
  static compute(bus, stops) {
    if (!bus || bus.latitude == null || !stops || !stops.length) return [];
    // nearest stop = where the bus is now; the ones after it are still ahead
    let nearest = 0, best = Infinity;
    stops.forEach((s, i) => {
      const d = Eta.distanceKm(bus.latitude, bus.longitude, s.latitude, s.longitude);
      if (d < best) { best = d; nearest = i; }
    });
    const ahead = stops.slice(best < Eta.AT_STOP_KM ? nearest + 1 : nearest);
    const delay = bus.delay_minutes || 0;
    const speed = bus.speed && bus.speed > Eta.MIN_SPEED_KMH ? bus.speed : null;     // km/h
    let travelled = 0, prev = { latitude: bus.latitude, longitude: bus.longitude };
    const baseSched = stops[nearest].minutes_from_start;
    return ahead.map((s) => {
      let minutes;
      if (speed) {
        travelled += Eta.distanceKm(prev.latitude, prev.longitude, s.latitude, s.longitude) * Eta.ROAD_FACTOR;
        prev = s;
        minutes = (travelled / speed) * 60;
      } else {
        minutes = Math.max(0, s.minutes_from_start - baseSched);
      }
      return { stop: s, minutes: Math.max(1, Math.round(minutes + delay)) };
    });
  }
}
