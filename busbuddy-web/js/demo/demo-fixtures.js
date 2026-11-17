// =====================================================================
// Demo sample data: five routes, six running buses, upcoming trips,
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
  passenger2: { user_id: "p-2", full_name: "Lea Saab", email: "lea@busbuddy.test", phone_no: "+96171000002", type: "passenger" },
  driver3: { user_id: "d-3", full_name: "Karim Ghosn", email: "driver3@busbuddy.test", phone_no: "+96170555666", type: "driver" },
  driver4: { user_id: "d-4", full_name: "Fadi Mansour", email: "driver4@busbuddy.test", phone_no: "+96170777888", type: "driver" },
  driver5: { user_id: "d-5", full_name: "Ziad Hamdan", email: "driver5@busbuddy.test", phone_no: "+96170121314", type: "driver" },
  driver6: { user_id: "d-6", full_name: "Rabih Saleh", email: "driver6@busbuddy.test", phone_no: "+96170151617", type: "driver" }
};

// Primary key column of each table (used when inserting rows)
export const PRIMARY_KEYS = {
  users: "user_id", drivers: "user_id", buses: "bus_id", routes: "route_id", stops: "stop_id", trips: "trip_id",
  bookings: "booking_id", messages: "message_id", delay_reports: "report_id", updated_locations: "location_id"
};

// Four routes taken from data/BusRoutes_edited.geojson:
//   2 "Baakline – Cola" from "Cola - Kafarhim el Chouf (Baakline)" (90 min)
//   3 "Niha – Cola"     from "Beirut - Niha chouf" (120 min)
//   4 "Saida – Cola"    from "Cola - Saida", Bus (24 Seats) (60 min)
//   5 "Aley – Cola"     from "Cola - Bhamdoun", cut at Aley Roundabout (39 of its 60 min, by distance)
// path = the real road shape from the file; stops = the file's named stops along it;
// minutes_from_start = the file's travel time shared out by distance along the road.
// Routes 4 and 5 (and route 1's path) are made by tools/build-routes.js.
export const GEO_ROUTES = [
  { route: { route_id: 2, name: "Baakline – Cola", origin: "Baakline (Chouf)", destination: "Cola",
      path: [[33.67996,35.55706],[33.68015,35.55656],[33.68144,35.55445],[33.68113,35.55261],[33.68242,35.54967],[33.6821,35.5472],[33.68038,35.54288],[33.68152,35.54278],[33.68295,35.54496],[33.68371,35.54676],[33.68481,35.54956],[33.68517,35.55257],[33.6854,35.55328],[33.68554,35.55207],[33.68569,35.55132],[33.68611,35.55254],[33.68668,35.55329],[33.68426,35.54333],[33.6839,35.54044],[33.68421,35.53929],[33.68185,35.53449],[33.68345,35.53644],[33.68583,35.53878],[33.68769,35.54394],[33.68771,35.54571],[33.68807,35.54661],[33.68912,35.54377],[33.69012,35.5413],[33.69057,35.53585],[33.6902,35.53145],[33.68856,35.52687],[33.68744,35.52469],[33.68763,35.51928],[33.68811,35.51834],[33.68831,35.51705],[33.69033,35.5103],[33.68918,35.50629],[33.6877,35.50318],[33.6865,35.49977],[33.6864,35.49798],[33.68877,35.49497],[33.68897,35.49114],[33.69154,35.48748],[33.69298,35.48423],[33.69708,35.48],[33.69544,35.48422],[33.6972,35.48506],[33.69933,35.48671],[33.69772,35.48323],[33.69883,35.47818],[33.69843,35.47343],[33.70089,35.46925],[33.7028,35.46835],[33.70347,35.469],[33.70478,35.46788],[33.70493,35.46508],[33.70677,35.45952],[33.70889,35.45566],[33.70756,35.45274],[33.70528,35.45052],[33.7083,35.44956],[33.70924,35.44914],[33.713,35.45074],[33.71806,35.45198],[33.72485,35.45276],[33.73148,35.45353],[33.73715,35.45395],[33.74814,35.45246],[33.75002,35.45259],[33.75319,35.45446],[33.76227,35.46034],[33.76803,35.46644],[33.77149,35.46894],[33.7771,35.47259],[33.78547,35.47792],[33.79161,35.4819],[33.79385,35.48281],[33.7961,35.48255],[33.79764,35.48278],[33.80672,35.48991],[33.81935,35.4996],[33.82688,35.50528],[33.8273,35.50543],[33.82972,35.50389],[33.83256,35.49989],[33.83394,35.49671],[33.83534,35.4947],[33.83824,35.49459],[33.84261,35.49401],[33.85628,35.49354],[33.86146,35.49399],[33.86721,35.49447],[33.87515,35.49514]] },
    stops: [
      { stop_id: 6, route_id: 2, address: "Kafarhim el Chouf (Baakline)", latitude: 33.67996, longitude: 35.55706, stop_order: 1, minutes_from_start: 0 },
      { stop_id: 7, route_id: 2, address: "Modern University for Business and Science - Damour", latitude: 33.71806, longitude: 35.45198, stop_order: 2, minutes_from_start: 45 },
      { stop_id: 8, route_id: 2, address: "Damour", latitude: 33.72485, longitude: 35.45276, stop_order: 3, minutes_from_start: 47 },
      { stop_id: 9, route_id: 2, address: "Naameh Pedestrian Bridge", latitude: 33.73715, longitude: 35.45395, stop_order: 4, minutes_from_start: 50 },
      { stop_id: 10, route_id: 2, address: "Naameh Intersection", latitude: 33.75319, longitude: 35.45446, stop_order: 5, minutes_from_start: 55 },
      { stop_id: 11, route_id: 2, address: "Douha", latitude: 33.76227, longitude: 35.46034, stop_order: 6, minutes_from_start: 57 },
      { stop_id: 12, route_id: 2, address: "Chamsine Bakery", latitude: 33.7771, longitude: 35.47259, stop_order: 7, minutes_from_start: 62 },
      { stop_id: 13, route_id: 2, address: "Embassy of Kuwait Roundabout", latitude: 33.85628, longitude: 35.49354, stop_order: 8, minutes_from_start: 85 },
      { stop_id: 14, route_id: 2, address: "Cola", latitude: 33.87515, longitude: 35.49514, stop_order: 9, minutes_from_start: 90 } ] },
  { route: { route_id: 3, name: "Niha – Cola", origin: "Niha (Chouf)", destination: "Cola",
      path: [[33.59377,35.62546],[33.59377,35.62547],[33.59843,35.62703],[33.60344,35.62661],[33.60879,35.61931],[33.6097,35.60962],[33.60735,35.61386],[33.60546,35.61869],[33.60524,35.61561],[33.60774,35.60886],[33.61306,35.6071],[33.61425,35.61613],[33.61864,35.61393],[33.626,35.61128],[33.63144,35.60746],[33.63804,35.60936],[33.64357,35.60801],[33.64895,35.61076],[33.65158,35.61749],[33.65327,35.62364],[33.65537,35.61897],[33.6577,35.61398],[33.66208,35.61589],[33.66247,35.61377],[33.6645,35.61193],[33.66271,35.60566],[33.66463,35.59724],[33.66623,35.60216],[33.66854,35.60086],[33.67051,35.59915],[33.67175,35.59647],[33.67524,35.59183],[33.67944,35.58885],[33.68414,35.5853],[33.68586,35.57961],[33.68377,35.57476],[33.68047,35.57301],[33.67759,35.56774],[33.67661,35.564],[33.67739,35.55933],[33.6803,35.55601],[33.68173,35.55124],[33.68055,35.5449],[33.68358,35.54655],[33.68542,35.55218],[33.6859,35.5485],[33.68322,35.5382],[33.68512,35.5373],[33.68855,35.54527],[33.69078,35.53398],[33.68745,35.52415],[33.68825,35.51733],[33.68866,35.5163],[33.69051,35.51011],[33.68766,35.5033],[33.6868,35.49713],[33.68863,35.48964],[33.69368,35.48352],[33.69581,35.4825],[33.6994,35.48674],[33.69895,35.47964],[33.70033,35.47104],[33.70509,35.46665],[33.70859,35.45402],[33.70684,35.44994],[33.71359,35.45091],[33.72673,35.45289],[33.74148,35.45328],[33.75713,35.4568],[33.76977,35.46767],[33.78049,35.47462],[33.78825,35.47952],[33.79435,35.4826],[33.79673,35.4822],[33.80478,35.48831],[33.81197,35.49385],[33.82189,35.50147],[33.83268,35.49947],[33.83563,35.49433],[33.84325,35.49379],[33.85119,35.49342],[33.8559,35.49316],[33.85834,35.49356],[33.86183,35.49364],[33.86593,35.49411],[33.86963,35.49443],[33.87109,35.4945],[33.87417,35.49488],[33.87584,35.49485],[33.87639,35.49491],[33.87761,35.49505],[33.87864,35.49502],[33.87867,35.49505],[33.87869,35.49502],[33.87864,35.49513],[33.87874,35.495],[33.87868,35.49499],[33.87866,35.49511],[33.87868,35.49505],[33.87875,35.49508],[33.87869,35.49496]] },
    stops: [
      { stop_id: 15, route_id: 3, address: "Niha (Chouf)", latitude: 33.59377, longitude: 35.62546, stop_order: 1, minutes_from_start: 0 },
      { stop_id: 16, route_id: 3, address: "Baakline", latitude: 33.6803, longitude: 35.55601, stop_order: 2, minutes_from_start: 45 },
      { stop_id: 17, route_id: 3, address: "Islamic University of Lebanon", latitude: 33.78049, longitude: 35.47462, stop_order: 3, minutes_from_start: 95 },
      { stop_id: 18, route_id: 3, address: "Khalde", latitude: 33.78825, longitude: 35.47952, stop_order: 4, minutes_from_start: 97 },
      { stop_id: 19, route_id: 3, address: "Embassy of Kuwait Roundabout", latitude: 33.8559, longitude: 35.49316, stop_order: 5, minutes_from_start: 115 },
      { stop_id: 20, route_id: 3, address: "Cola", latitude: 33.87869, longitude: 35.49496, stop_order: 6, minutes_from_start: 120 } ] },
  { route: { route_id: 4, name: "Saida – Cola", origin: "Saida", destination: "Cola",
      path: [[33.56648,35.37446],[33.56774,35.37604],[33.57283,35.37907],[33.57972,35.38412],[33.58353,35.38542],[33.58643,35.38623],[33.58926,35.38701],[33.59087,35.38754],[33.59267,35.38803],[33.59619,35.38901],[33.5982,35.38924],[33.60012,35.38909],[33.60242,35.38869],[33.60306,35.38832],[33.60513,35.38909],[33.60635,35.392],[33.60709,35.39426],[33.60732,35.39607],[33.6082,35.39772],[33.61043,35.39939],[33.61121,35.40061],[33.61178,35.40192],[33.61386,35.40159],[33.61588,35.40113],[33.61882,35.40065],[33.62157,35.39941],[33.62357,35.39908],[33.62548,35.39951],[33.62665,35.39978],[33.62917,35.40026],[33.63109,35.40048],[33.63345,35.40024],[33.63738,35.40063],[33.64026,35.40047],[33.64244,35.40058],[33.64316,35.40048],[33.64547,35.40002],[33.64708,35.40106],[33.64849,35.40275],[33.64886,35.40536],[33.64921,35.4079],[33.64983,35.40998],[33.65023,35.41171],[33.65112,35.41346],[33.65189,35.41484],[33.65258,35.41647],[33.65411,35.41806],[33.65699,35.4189],[33.65781,35.41934],[33.65856,35.41989],[33.66011,35.42133],[33.661,35.42139],[33.66187,35.42115],[33.66266,35.4215],[33.66351,35.42218],[33.66485,35.42278],[33.6666,35.42297],[33.66819,35.42285],[33.67126,35.42349],[33.67355,35.42351],[33.67565,35.42288],[33.67687,35.42268],[33.67896,35.42248],[33.68178,35.42394],[33.68383,35.42471],[33.68615,35.42422],[33.68844,35.42323],[33.69084,35.42341],[33.69336,35.42581],[33.6952,35.42948],[33.69638,35.43342],[33.69769,35.43686],[33.69937,35.43931],[33.70229,35.44137],[33.70304,35.442],[33.70446,35.44348],[33.70683,35.44621],[33.70904,35.4484],[33.71188,35.45018],[33.71487,35.45119],[33.718,35.45184],[33.72169,35.45226],[33.72422,35.45269],[33.72612,35.45277],[33.72932,35.45305],[33.73246,35.45344],[33.73459,35.45378],[33.73745,35.45372],[33.73983,35.45338],[33.74147,35.45317],[33.74337,35.45289],[33.74525,35.45249],[33.74717,35.45234],[33.74985,35.45228],[33.75159,35.4532],[33.75486,35.45527],[33.75814,35.45731],[33.7608,35.45888],[33.76313,35.461],[33.76612,35.4641],[33.76839,35.46654],[33.77038,35.46801],[33.77284,35.4696],[33.77401,35.47053],[33.77564,35.47136],[33.77751,35.47263],[33.77973,35.47398],[33.78119,35.47501],[33.78413,35.47689],[33.78955,35.48],[33.79115,35.47948],[33.79346,35.47867],[33.79562,35.47804],[33.79889,35.47847],[33.80497,35.48101],[33.80766,35.48162],[33.80949,35.48191],[33.81243,35.48234],[33.81468,35.48267],[33.81693,35.4832],[33.82349,35.4856],[33.8254,35.48508],[33.82682,35.48475],[33.82768,35.48448],[33.82994,35.4842],[33.83113,35.48417],[33.83278,35.48431],[33.83389,35.48436],[33.83509,35.48439],[33.83638,35.48445],[33.83726,35.48455],[33.83814,35.4845],[33.83918,35.48459],[33.84065,35.4846],[33.84205,35.48476],[33.84338,35.48478],[33.84515,35.48487],[33.84692,35.48495],[33.84744,35.48493],[33.85177,35.48523],[33.85554,35.49113],[33.85708,35.49315],[33.85776,35.49352],[33.85889,35.49361],[33.85966,35.4936],[33.86035,35.4935],[33.86254,35.49375],[33.86436,35.49395],[33.86657,35.49415],[33.86953,35.49448],[33.87068,35.49455],[33.87269,35.49499],[33.874,35.4951],[33.87525,35.49484],[33.87628,35.49482],[33.87661,35.49424],[33.87679,35.49435]] },
    stops: [
      { stop_id: 21, route_id: 4, address: "Saida", latitude: 33.56648, longitude: 35.37446, stop_order: 1, minutes_from_start: 0 },
      { stop_id: 22, route_id: 4, address: "Jadra Bridge", latitude: 33.63345, longitude: 35.40024, stop_order: 2, minutes_from_start: 13 },
      { stop_id: 23, route_id: 4, address: "Jiyeh Electricity", latitude: 33.64983, longitude: 35.40998, stop_order: 3, minutes_from_start: 17 },
      { stop_id: 24, route_id: 4, address: "Jiyeh Entrance", latitude: 33.68178, longitude: 35.42394, stop_order: 4, minutes_from_start: 23 },
      { stop_id: 25, route_id: 4, address: "Damour - Saadiyat Intersection", latitude: 33.69336, longitude: 35.42581, stop_order: 5, minutes_from_start: 25 },
      { stop_id: 26, route_id: 4, address: "Modern University for Business and Science - Damour", latitude: 33.718, longitude: 35.45184, stop_order: 6, minutes_from_start: 31 },
      { stop_id: 27, route_id: 4, address: "Damour", latitude: 33.72422, longitude: 35.45269, stop_order: 7, minutes_from_start: 32 },
      { stop_id: 28, route_id: 4, address: "Naameh Pedestrian Bridge", latitude: 33.73745, longitude: 35.45372, stop_order: 8, minutes_from_start: 34 },
      { stop_id: 29, route_id: 4, address: "Naameh", latitude: 33.74525, longitude: 35.45249, stop_order: 9, minutes_from_start: 36 },
      { stop_id: 30, route_id: 4, address: "Naameh Intersection", latitude: 33.75159, longitude: 35.4532, stop_order: 10, minutes_from_start: 37 },
      { stop_id: 31, route_id: 4, address: "Douha", latitude: 33.7608, longitude: 35.45888, stop_order: 11, minutes_from_start: 39 },
      { stop_id: 32, route_id: 4, address: "Chamsine Bakery", latitude: 33.77564, longitude: 35.47136, stop_order: 12, minutes_from_start: 42 },
      { stop_id: 33, route_id: 4, address: "Islamic University of Lebanon", latitude: 33.78119, longitude: 35.47501, stop_order: 13, minutes_from_start: 43 },
      { stop_id: 34, route_id: 4, address: "Khalde", latitude: 33.78955, longitude: 35.48, stop_order: 14, minutes_from_start: 44 },
      { stop_id: 35, route_id: 4, address: "Beirut - Saida Highway", latitude: 33.84515, longitude: 35.48487, stop_order: 15, minutes_from_start: 54 },
      { stop_id: 36, route_id: 4, address: "Embassy of Kuwait Roundabout", latitude: 33.85708, longitude: 35.49315, stop_order: 16, minutes_from_start: 57 },
      { stop_id: 37, route_id: 4, address: "Cola", latitude: 33.87679, longitude: 35.49435, stop_order: 17, minutes_from_start: 60 } ] },
  { route: { route_id: 5, name: "Aley – Cola", origin: "Aley", destination: "Cola",
      path: [[33.81365,35.6091],[33.81535,35.60821],[33.81672,35.60747],[33.81752,35.60697],[33.81911,35.60502],[33.82078,35.60273],[33.82268,35.60037],[33.82394,35.59863],[33.82515,35.59715],[33.82677,35.59584],[33.82808,35.59383],[33.82913,35.59221],[33.82731,35.59029],[33.82559,35.59026],[33.82399,35.58971],[33.82509,35.58858],[33.82644,35.58774],[33.82792,35.58736],[33.82903,35.58783],[33.82943,35.58693],[33.83016,35.58612],[33.83041,35.58447],[33.83061,35.58333],[33.83131,35.58337],[33.83111,35.58236],[33.82977,35.58297],[33.82867,35.58245],[33.82819,35.5799],[33.82861,35.57595],[33.82894,35.57349],[33.83009,35.57017],[33.83145,35.56857],[33.83271,35.56814],[33.83414,35.56752],[33.83485,35.566],[33.83567,35.56468],[33.83712,35.56292],[33.83864,35.56102],[33.83993,35.55931],[33.8409,35.5582],[33.8435,35.55692],[33.84612,35.55544],[33.84838,35.55473],[33.84929,35.55177],[33.84895,35.54887],[33.84943,35.54648],[33.84969,35.54496],[33.85105,35.5392],[33.8525,35.53683],[33.85413,35.53569],[33.85458,35.53548],[33.85555,35.53456],[33.85597,35.53116],[33.85653,35.52747],[33.85711,35.52693],[33.85922,35.5267],[33.86078,35.52651],[33.86355,35.52632],[33.86589,35.52753],[33.86749,35.52665],[33.86974,35.52479],[33.87261,35.52222],[33.87424,35.52065],[33.87591,35.51895],[33.87875,35.52024],[33.87915,35.51947],[33.87896,35.51891],[33.87873,35.51753],[33.87879,35.51653],[33.87884,35.51423],[33.87861,35.51283],[33.87851,35.51185],[33.87826,35.50763],[33.87797,35.50596],[33.87783,35.50306],[33.87809,35.50175],[33.87825,35.50047],[33.87857,35.49899],[33.87874,35.49773],[33.879,35.49658],[33.87909,35.4957],[33.87885,35.49535],[33.8788,35.49539]] },
    stops: [
      { stop_id: 38, route_id: 5, address: "Aley Roundabout", latitude: 33.81365, longitude: 35.6091, stop_order: 1, minutes_from_start: 0 },
      { stop_id: 39, route_id: 5, address: "Aabadiyeh Intersection", latitude: 33.81752, longitude: 35.60697, stop_order: 2, minutes_from_start: 1 },
      { stop_id: 40, route_id: 5, address: "Dahr El Wahech", latitude: 33.82515, longitude: 35.59715, stop_order: 3, minutes_from_start: 4 },
      { stop_id: 41, route_id: 5, address: "Kahaleh", latitude: 33.82943, longitude: 35.58693, stop_order: 4, minutes_from_start: 9 },
      { stop_id: 42, route_id: 5, address: "Bsous Intersection", latitude: 33.82894, longitude: 35.57349, stop_order: 5, minutes_from_start: 13 },
      { stop_id: 43, route_id: 5, address: "Ministry of Defense Intersection", latitude: 33.83993, longitude: 35.55931, stop_order: 6, minutes_from_start: 17 },
      { stop_id: 44, route_id: 5, address: "Military Academy Intersection", latitude: 33.84895, longitude: 35.54887, stop_order: 7, minutes_from_start: 21 },
      { stop_id: 45, route_id: 5, address: "Al Sayad", latitude: 33.85413, longitude: 35.53569, stop_order: 8, minutes_from_start: 25 },
      { stop_id: 46, route_id: 5, address: "Chevrolet - Alfa Intersection", latitude: 33.86589, longitude: 35.52753, stop_order: 9, minutes_from_start: 29 },
      { stop_id: 47, route_id: 5, address: "Damascus Road", latitude: 33.87424, longitude: 35.52065, stop_order: 10, minutes_from_start: 32 },
      { stop_id: 48, route_id: 5, address: "Adliyeh Roundabout", latitude: 33.87875, longitude: 35.52024, stop_order: 11, minutes_from_start: 33 },
      { stop_id: 49, route_id: 5, address: "National Museum", latitude: 33.87884, longitude: 35.51423, stop_order: 12, minutes_from_start: 35 },
      { stop_id: 50, route_id: 5, address: "Barbir", latitude: 33.87826, longitude: 35.50763, stop_order: 13, minutes_from_start: 36 },
      { stop_id: 51, route_id: 5, address: "Cola", latitude: 33.8788, longitude: 35.49539, stop_order: 14, minutes_from_start: 39 } ] }
];

const copy = (x) => JSON.parse(JSON.stringify(x));   // fresh copies, so "Reset demo" really starts again

export function createFixtures(now) {
  const min = 60000;
  const iso = (ms) => new Date(ms).toISOString();
  const U = DEMO_USERS;
  return {
    users: copy(Object.values(U)),
    drivers: [{ user_id: "d-1", license_number: "LB-55821" }, { user_id: "d-2", license_number: "LB-60277" },
              { user_id: "d-3", license_number: "LB-61540" }, { user_id: "d-4", license_number: "LB-62318" },
              { user_id: "d-5", license_number: "LB-63101" }, { user_id: "d-6", license_number: "LB-63250" }],
    buses: [{ bus_id: 1, plate_number: "G 123456", capacity: 24, owner_id: "d-1" }, { bus_id: 2, plate_number: "M 654321", capacity: 14, owner_id: "d-2" },
            { bus_id: 3, plate_number: "B 234567", capacity: 24, owner_id: "d-3" }, { bus_id: 4, plate_number: "B 345678", capacity: 24, owner_id: "d-4" },  // file: "Bus (24 Seats)"
            { bus_id: 5, plate_number: "S 456789", capacity: 24, owner_id: "d-5" }, { bus_id: 6, plate_number: "A 567890", capacity: 24, owner_id: "d-6" }],
    routes: [{ route_id: 1, name: "Chouf – LIU Cola", origin: "Beiteddine", destination: "LIU Cola",
               // Beiteddine → Deir el Qamar → Damour: straight lines (approximate, no road data in the GeoJSON);
               // Damour → Cola: route 2's road from the GeoJSON, then the LIU Cola stop as the last point
               path: [[33.6953,35.5786],[33.6967,35.5617],[33.72496,35.45335],[33.72485,35.45276],[33.73148,35.45353],[33.73715,35.45395],[33.74814,35.45246],[33.75002,35.45259],[33.75319,35.45446],[33.76227,35.46034],[33.76803,35.46644],[33.77149,35.46894],[33.7771,35.47259],[33.78547,35.47792],[33.79161,35.4819],[33.79385,35.48281],[33.7961,35.48255],[33.79764,35.48278],[33.80672,35.48991],[33.81935,35.4996],[33.82688,35.50528],[33.8273,35.50543],[33.82972,35.50389],[33.83256,35.49989],[33.83394,35.49671],[33.83534,35.4947],[33.83824,35.49459],[33.84261,35.49401],[33.85628,35.49354],[33.86146,35.49399],[33.86721,35.49447],[33.87515,35.49514],[33.877,35.493]] },
             ...copy(GEO_ROUTES.map((g) => g.route))],
    stops: [
      { stop_id: 1, route_id: 1, address: "Beiteddine", latitude: 33.6953, longitude: 35.5786, stop_order: 1, minutes_from_start: 0 },
      { stop_id: 2, route_id: 1, address: "Deir el Qamar", latitude: 33.6967, longitude: 35.5617, stop_order: 2, minutes_from_start: 8 },
      // Beiteddine and Deir el Qamar are not in the GeoJSON, so their coordinates are approximate.
      // Damour and Khaldeh: the file's "Damour" (B6-B1) and "Khalde" (B6-A7) points nearest route 2.
      { stop_id: 3, route_id: 1, address: "Damour", latitude: 33.72496, longitude: 35.45335, stop_order: 3, minutes_from_start: 30 },
      { stop_id: 4, route_id: 1, address: "Khaldeh", latitude: 33.78757, longitude: 35.47908, stop_order: 4, minutes_from_start: 42 },
      { stop_id: 5, route_id: 1, address: "LIU Cola", latitude: 33.8770, longitude: 35.4930, stop_order: 5, minutes_from_start: 60 },
      ...copy(GEO_ROUTES.flatMap((g) => g.stops))
    ],
    trips: [
      { trip_id: 1, route_id: 1, bus_id: 1, driver_id: "d-1", departure_time: iso(now - 25 * min), status: "active" },
      { trip_id: 2, route_id: 1, bus_id: 2, driver_id: "d-2", departure_time: iso(now - 40 * min), status: "delayed" },
      { trip_id: 3, route_id: 1, bus_id: 1, driver_id: "d-1", departure_time: iso(now + 180 * min), status: "scheduled" },
      { trip_id: 4, route_id: 1, bus_id: 2, driver_id: "d-2", departure_time: iso(now + 300 * min), status: "scheduled" },
      { trip_id: 5, route_id: 2, bus_id: 3, driver_id: "d-3", departure_time: iso(now - 30 * min), status: "active" },     // Baakline – Cola
      { trip_id: 6, route_id: 2, bus_id: 3, driver_id: "d-3", departure_time: iso(now + 150 * min), status: "scheduled" },
      { trip_id: 7, route_id: 3, bus_id: 4, driver_id: "d-4", departure_time: iso(now - 50 * min), status: "active" },     // Niha – Cola
      { trip_id: 8, route_id: 3, bus_id: 4, driver_id: "d-4", departure_time: iso(now + 240 * min), status: "scheduled" },
      { trip_id: 9, route_id: 4, bus_id: 5, driver_id: "d-5", departure_time: iso(now - 20 * min), status: "active" },     // Saida – Cola
      { trip_id: 10, route_id: 4, bus_id: 5, driver_id: "d-5", departure_time: iso(now + 200 * min), status: "scheduled" },
      { trip_id: 11, route_id: 5, bus_id: 6, driver_id: "d-6", departure_time: iso(now - 15 * min), status: "active" },    // Aley – Cola
      { trip_id: 12, route_id: 5, bus_id: 6, driver_id: "d-6", departure_time: iso(now + 260 * min), status: "scheduled" },
      { trip_id: 13, route_id: 4, bus_id: 5, driver_id: "d-5", departure_time: iso(now + 330 * min), status: "scheduled" },  // Saida – Cola, later trip
      { trip_id: 14, route_id: 5, bus_id: 6, driver_id: "d-6", departure_time: iso(now + 380 * min), status: "scheduled" }   // Aley – Cola, later trip
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
      { location_id: 1, trip_id: 1, latitude: 33.71854, longitude: 35.47798, time: iso(now - 20000), speed: 42 }, // on the road, 25 min after leaving (by the timetable)
      { location_id: 2, trip_id: 2, latitude: 33.79112, longitude: 35.48158, time: iso(now - 5 * min), speed: 0 },     // stopped (delayed) near Khaldeh, on the road
      { location_id: 3, trip_id: 5, latitude: 33.69708, longitude: 35.48, time: iso(now - 15000), speed: 38 },    // on the Baakline road, 1/3 of the way
      { location_id: 4, trip_id: 7, latitude: 33.68322, longitude: 35.5382, time: iso(now - 25000), speed: 35 },  // on the Niha road, near Baakline
      { location_id: 5, trip_id: 9, latitude: 33.66395, longitude: 35.42238, time: iso(now - 20000), speed: 40 },  // Saida road, 20 of 60 min along
      { location_id: 6, trip_id: 11, latitude: 33.83412, longitude: 35.56753, time: iso(now - 20000), speed: 40 }  // Aley road, 15 of 39 min along
    ]
  };
}
