// =====================================================================
// Demo sample data: one route, two running buses, two upcoming trips,
// bookings and messages. Times are relative to `now`, so the demo always
// looks "live".
// Demo accounts (any password works):
//   rami@busbuddy.test   – passenger      driver@busbuddy.test – driver
//   admin@busbuddy.test  – administrator
// =====================================================================
export const DEMO_USERS = {
  admin: { user_id: "a-1", full_name: "Maya Admin", email: "admin@busbuddy.test", phone_no: "+96170000001", type: "admin" },
  driver: { user_id: "d-1", full_name: "Hadi Khoury", email: "driver@busbuddy.test", phone_no: "+96170111222", type: "driver" },
  driver2: { user_id: "d-2", full_name: "Sami Haddad", email: "driver2@busbuddy.test", phone_no: "+96170333444", type: "driver" },
  passenger: { user_id: "p-1", full_name: "Rami Nassar", email: "rami@busbuddy.test", phone_no: "+96171000001", type: "passenger" },
  passenger2: { user_id: "p-2", full_name: "Lea Saab", email: "lea@busbuddy.test", phone_no: "+96171000002", type: "passenger" }
};

// Primary key column of each table (used when inserting rows)
export const PRIMARY_KEYS = {
  users: "user_id", drivers: "user_id", buses: "bus_id", routes: "route_id", stops: "stop_id", trips: "trip_id",
  bookings: "booking_id", messages: "message_id", delay_reports: "report_id", updated_locations: "location_id"
};

export function createFixtures(now) {
  const min = 60000;
  const iso = (ms) => new Date(ms).toISOString();
  const U = DEMO_USERS;
  return {
    users: Object.values(U),
    drivers: [{ user_id: "d-1", license_number: "LB-55821" }, { user_id: "d-2", license_number: "LB-60277" }],
    buses: [{ bus_id: 1, plate_number: "G 123456", capacity: 24, owner_id: "d-1" }, { bus_id: 2, plate_number: "M 654321", capacity: 14, owner_id: "d-2" }],
    routes: [{ route_id: 1, name: "Chouf – LIU Cola", origin: "Beiteddine", destination: "LIU Cola" }],
    stops: [
      { stop_id: 1, route_id: 1, address: "Beiteddine", latitude: 33.6953, longitude: 35.5786, stop_order: 1, minutes_from_start: 0 },
      { stop_id: 2, route_id: 1, address: "Deir el Qamar", latitude: 33.6967, longitude: 35.5617, stop_order: 2, minutes_from_start: 8 },
      { stop_id: 3, route_id: 1, address: "Damour", latitude: 33.7303, longitude: 35.4553, stop_order: 3, minutes_from_start: 30 },
      { stop_id: 4, route_id: 1, address: "Khaldeh", latitude: 33.7795, longitude: 35.4810, stop_order: 4, minutes_from_start: 42 },
      { stop_id: 5, route_id: 1, address: "LIU Cola", latitude: 33.8770, longitude: 35.4930, stop_order: 5, minutes_from_start: 60 }
    ],
    trips: [
      { trip_id: 1, route_id: 1, bus_id: 1, driver_id: "d-1", departure_time: iso(now - 25 * min), status: "active" },
      { trip_id: 2, route_id: 1, bus_id: 2, driver_id: "d-2", departure_time: iso(now - 40 * min), status: "delayed" },
      { trip_id: 3, route_id: 1, bus_id: 1, driver_id: "d-1", departure_time: iso(now + 180 * min), status: "scheduled" },
      { trip_id: 4, route_id: 1, bus_id: 2, driver_id: "d-2", departure_time: iso(now + 300 * min), status: "scheduled" }
    ],
    bookings: [
      { booking_id: 1, passenger_id: "p-1", trip_id: 3, nb_of_seats: 2, status: "booked", booking_time: iso(now - 600 * min) },
      { booking_id: 2, passenger_id: "p-2", trip_id: 3, nb_of_seats: 1, status: "booked", booking_time: iso(now - 500 * min) },
      { booking_id: 3, passenger_id: "p-1", trip_id: 1, nb_of_seats: 1, status: "booked", booking_time: iso(now - 900 * min) },
      { booking_id: 4, passenger_id: null, trip_id: 1, nb_of_seats: 2, status: "walk_on", booking_time: iso(now - 10 * min) }
    ],
    messages: [
      { message_id: 1, trip_id: 1, passenger_id: "p-1", driver_id: "d-1", content: "Hi, I'm waiting at Damour by the pharmacy.", status: "read", date_time: iso(now - 12 * min), sent_by: "passenger" },
      { message_id: 2, trip_id: 1, passenger_id: "p-1", driver_id: "d-1", content: "OK, I'll be there in about 5 minutes.", status: "sent", date_time: iso(now - 10 * min), sent_by: "driver" }
    ],
    delay_reports: [{ report_id: 1, trip_id: 2, reason: "Traffic", delay_time: 15, status: "open", time_of_report: iso(now - 8 * min) }],
    updated_locations: [
      { location_id: 1, trip_id: 1, latitude: 33.722, longitude: 35.470, time: iso(now - 20000), speed: 42 },
      { location_id: 2, trip_id: 2, latitude: 33.790, longitude: 35.484, time: iso(now - 5 * min), speed: 0 }
    ]
  };
}
