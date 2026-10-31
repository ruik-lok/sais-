// data.js — body catalogue.
// Sources are recorded per body. Fields that are null are rendered as "未知"
// in the UI and must never be invented.
// Orbital elements:
//  - Planets + Pluto: JPL "Keplerian Elements for Approximate Positions of
//    the Major Planets" (J2000 + rates per century). Accuracy: arcminutes
//    over ~1800-2050 for the major planets; worse outside that range.
//    The 1800-2050 window is machine-readable in each entry's
//    accuracy.validFromJd/validToJd and in astro.isOutOfRange.
//  - The Earth entry's position is the Earth-Moon barycentre (EMB), NOT
//    the geocentre: the geocentre differs by ~4670 km (0.00003 AU).
//    Geocentric event math must not silently substitute the EMB
//    position; see events.js.
//  - Dwarf planets / asteroids / comets: SBDB formal osculating elements
//    at full precision (fetched 2026-10-31 from
//    https://ssd-api.jpl.nasa.gov/sbdb.api with full-prec=1, signature
//    v1.3, DE441, J2000 equinox; see each entry's orbitSolution for
//    orbitId, epoch, arc length, condition code and solution date).
//    Positions are STILL propagated as fixed Kepler ellipses from the
//    SBDB epoch — no planetary perturbations, no non-gravitational terms
//    — so they degrade away from the epoch by an unquantified amount.
//    SBDB gives no validity window for these nine (not_valid_before /
//    after are null), so accuracy.validFromJd/validToJd are null and the
//    UI must show "适用期未知", never "in range".
//    Comets carry perihelionJd (time of perihelion passage) SEPARATELY
//    from epochJd (orbit-solution epoch): the old code conflated them.
// Physical parameters: JPL Solar System Dynamics physical-parameter tables
// (planets / satellites pages) where known; otherwise null.
// Accuracy is an OBJECT {level, validFromJd, validToJd, note} (see
// INTERFACE_CONTRACTS §1); ui.js currently string-interpolates
// b.accuracy and must be updated by the UI Agent to render the object
// (flagged to the controller — do not revert this to a string here).
// Colours are display palettes for procedural textures, NOT measured imagery.

export const SOURCES = {
  jplElements: "NASA/JPL Keplerian Elements for Approximate Positions of the Major Planets",
  jplPlanets: "NASA/JPL Solar System Dynamics, Planetary Physical Parameters",
  jplSats: "NASA/JPL Solar System Dynamics, Satellite Physical Parameters",
  sbdb: "NASA/JPL SBDB API（ssd-api.jpl.nasa.gov/sbdb.api，full-prec=1，signature v1.3，DE441，J2000）",
  horizonsVerified: "NASA/JPL Horizons API（已验证可达，见 README；本静态版未实时接入）",
};

function body(o) { return o; }

// Helper: JPL-form elements with rates.
const J = (a, e, i, L, lp, Om, rates) => ({ a, e, i, L, lp, Om, rates });

export const BODIES = [
  body({ id: "sun", zh: "太阳", en: "Sun", type: "恒星", parent: null,
    diameterKm: 1392700, massKg: 1.9885e30, density: 1.408, tempK: 5778,
    rotationDays: 25.38, orbitalPeriodDays: null, eccentricity: null, inclinationDeg: null,
    axialTiltDeg: 7.25, moons: 0, color: "#ffb347", color2: "#ff7a18",
    accuracy: { level: "schematic", validFromJd: null, validToJd: null, note: "中心天体，位置为坐标原点（简化假设）" }, source: SOURCES.jplPlanets, updated: "2026-10-31",
    elements: null, moonsList: [] }),

  body({ id: "mercury", zh: "水星", en: "Mercury", type: "行星", parent: "sun",
    diameterKm: 4879, massKg: 3.301e23, density: 5.43, tempK: 440,
    rotationDays: 58.646, orbitalPeriodDays: 87.969, eccentricity: 0.2056, inclinationDeg: 7.005,
    axialTiltDeg: 0.034, moons: 0, color: "#9c8e82", color2: "#6b5d4f",
    accuracy: { level: "kepler", validFromJd: 2378496.5, validToJd: 2470172.5, note: "JPL 近似星历（J2000 根数 + 世纪变化率），1800–2050 内角分级，超出后精度无保证" }, source: SOURCES.jplElements, updated: "2026-10-31",
    elements: J(0.38709927, 0.20563593, 7.00497902, 252.25032350, 77.45779628, 48.33076593,
      { a: 0.00000037, e: 0.00001906, i: -0.00594749, L: 149472.67411175, lp: 0.16047689, Om: -0.12534081 }) }),
  body({ id: "venus", zh: "金星", en: "Venus", type: "行星", parent: "sun",
    diameterKm: 12104, massKg: 4.867e24, density: 5.24, tempK: 737,
    rotationDays: -243.025, orbitalPeriodDays: 224.701, eccentricity: 0.0068, inclinationDeg: 3.395,
    axialTiltDeg: 177.36, moons: 0, color: "#e8c47a", color2: "#c98f3d",
    accuracy: { level: "kepler", validFromJd: 2378496.5, validToJd: 2470172.5, note: "JPL 近似星历（J2000 根数 + 世纪变化率），1800–2050 内角分级，超出后精度无保证" }, source: SOURCES.jplElements, updated: "2026-10-31",
    elements: J(0.72333566, 0.00677672, 3.39467605, 181.97909950, 131.60246718, 76.67984255,
      { a: 0.00000390, e: -0.00004107, i: -0.00078890, L: 58517.81538729, lp: 0.00268329, Om: -0.27769418 }) }),
  body({ id: "earth", zh: "地球", en: "Earth", type: "行星", parent: "sun",
    diameterKm: 12742, massKg: 5.972e24, density: 5.51, tempK: 288,
    rotationDays: 0.99727, orbitalPeriodDays: 365.256, eccentricity: 0.0167, inclinationDeg: 0.0,
    axialTiltDeg: 23.44, moons: 1, color: "#3d7ddb", color2: "#1c4d8f",
    accuracy: { level: "kepler", validFromJd: 2378496.5, validToJd: 2470172.5, note: "JPL 近似星历（J2000 根数 + 世纪变化率），1800–2050 内角分级，超出后精度无保证；本条目位置为地月系质心（EMB），非地心，地心差约 4670 km，见 events.js 注释" }, source: SOURCES.jplElements, updated: "2026-10-31",
    elements: J(1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0.0,
      { a: 0.00000562, e: -0.00004392, i: -0.01294668, L: 35999.37244981, lp: 0.32327364, Om: 0.0 }) }),
  body({ id: "mars", zh: "火星", en: "Mars", type: "行星", parent: "sun",
    diameterKm: 6779, massKg: 6.417e23, density: 3.93, tempK: 210,
    rotationDays: 1.02596, orbitalPeriodDays: 686.980, eccentricity: 0.0934, inclinationDeg: 1.850,
    axialTiltDeg: 25.19, moons: 2, color: "#c1552f", color2: "#7d2f16",
    accuracy: { level: "kepler", validFromJd: 2378496.5, validToJd: 2470172.5, note: "JPL 近似星历（J2000 根数 + 世纪变化率），1800–2050 内角分级，超出后精度无保证" }, source: SOURCES.jplElements, updated: "2026-10-31",
    elements: J(1.52371034, 0.09339410, 1.84969142, -4.55343205, -23.94362959, 49.55953891,
      { a: 0.00001847, e: 0.00007882, i: -0.00813131, L: 19140.30268499, lp: 0.44441088, Om: -0.29257343 }) }),
  body({ id: "jupiter", zh: "木星", en: "Jupiter", type: "行星", parent: "sun",
    diameterKm: 139820, massKg: 1.898e27, density: 1.33, tempK: 165,
    rotationDays: 0.41354, orbitalPeriodDays: 4332.589, eccentricity: 0.0484, inclinationDeg: 1.304,
    axialTiltDeg: 3.13, moons: 95, color: "#d8a878", color2: "#a66a35",
    accuracy: { level: "kepler", validFromJd: 2378496.5, validToJd: 2470172.5, note: "JPL 近似星历（J2000 根数 + 世纪变化率），1800–2050 内角分级，超出后精度无保证" }, source: SOURCES.jplElements, updated: "2026-10-31",
    elements: J(5.20288700, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909,
      { a: -0.00011607, e: -0.00013253, i: -0.00183714, L: 3034.74612775, lp: 0.21252668, Om: 0.20469106 }) }),
  body({ id: "saturn", zh: "土星", en: "Saturn", type: "行星", parent: "sun",
    diameterKm: 116460, massKg: 5.683e26, density: 0.69, tempK: 134,
    rotationDays: 0.44401, orbitalPeriodDays: 10759.22, eccentricity: 0.0539, inclinationDeg: 2.486,
    axialTiltDeg: 26.73, moons: 146, color: "#e3cfa0", color2: "#b89a5e",
    accuracy: { level: "kepler", validFromJd: 2378496.5, validToJd: 2470172.5, note: "JPL 近似星历（J2000 根数 + 世纪变化率），1800–2050 内角分级，超出后精度无保证" }, source: SOURCES.jplElements, updated: "2026-10-31",
    elements: J(9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448,
      { a: -0.00125060, e: -0.00050991, i: 0.00193609, L: 1222.49362201, lp: -0.41897216, Om: -0.28867794 }) }),
  body({ id: "uranus", zh: "天王星", en: "Uranus", type: "行星", parent: "sun",
    diameterKm: 50724, massKg: 8.681e25, density: 1.27, tempK: 76,
    rotationDays: -0.71833, orbitalPeriodDays: 30688.5, eccentricity: 0.0472, inclinationDeg: 0.773,
    axialTiltDeg: 97.77, moons: 28, color: "#8fd4d6", color2: "#4a9aa0",
    accuracy: { level: "kepler", validFromJd: 2378496.5, validToJd: 2470172.5, note: "JPL 近似星历（J2000 根数 + 世纪变化率），1800–2050 内角分级，超出后精度无保证" }, source: SOURCES.jplElements, updated: "2026-10-31",
    elements: J(19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.95427630, 74.01692503,
      { a: -0.00196176, e: -0.00004397, i: -0.00242939, L: 428.48202785, lp: 0.40805281, Om: 0.04240589 }) }),
  body({ id: "neptune", zh: "海王星", en: "Neptune", type: "行星", parent: "sun",
    diameterKm: 49244, massKg: 1.024e26, density: 1.64, tempK: 72,
    rotationDays: 0.67125, orbitalPeriodDays: 60182.0, eccentricity: 0.0086, inclinationDeg: 1.770,
    axialTiltDeg: 28.32, moons: 16, color: "#3f66d4", color2: "#1e2f7a",
    accuracy: { level: "kepler", validFromJd: 2378496.5, validToJd: 2470172.5, note: "JPL 近似星历（J2000 根数 + 世纪变化率），1800–2050 内角分级，超出后精度无保证" }, source: SOURCES.jplElements, updated: "2026-10-31",
    elements: J(30.06992276, 0.00859048, 1.77004347, -55.70383718, 44.96476227, 131.78422574,
      { a: 0.00026291, e: 0.00005105, i: 0.00035372, L: 218.45945325, lp: -0.00508664, Om: -0.00577264 }) }),
  body({ id: "pluto", zh: "冥王星", en: "Pluto", type: "矮行星", parent: "sun",
    diameterKm: 2377, massKg: 1.303e22, density: 1.85, tempK: 44,
    rotationDays: -6.387, orbitalPeriodDays: 90560, eccentricity: 0.2488, inclinationDeg: 17.14,
    axialTiltDeg: 122.53, moons: 5, color: "#c9a98a", color2: "#8a6a4a",
    accuracy: { level: "kepler", validFromJd: 2378496.5, validToJd: 2470172.5, note: "JPL 近似星历（J2000 根数 + 世纪变化率），1800–2050 内角分级，超出后精度无保证" }, source: SOURCES.jplElements, updated: "2026-10-31",
    elements: J(39.48211675, 0.24882730, 17.14001206, 238.92903833, 224.06891629, 110.30393684,
      { a: -0.00031596, e: 0.00005170, i: 0.00004818, L: 145.20780515, lp: -0.04062942, Om: -0.01183482 }) }),
  body({ id: "ceres", zh: "谷神星", en: "Ceres", type: "矮行星", parent: "sun",
    diameterKm: 939, massKg: 9.38e20, density: 2.16, tempK: null,
    rotationDays: 0.378, orbitalPeriodDays: 1679.853119758983, eccentricity: 0.07969229514816586, inclinationDeg: 10.58802780183462,
    axialTiltDeg: null, moons: 0, color: "#b0a090", color2: "#7a6a58",
    accuracy: { level: "sbdb", validFromJd: null, validToJd: null, note: "SBDB 正式轨道解（标准历元 2461200.5 = 2026-06-09，J2000 平黄道）；固定椭圆外推，无摄动改正；SBDB 未给出适用期（not_valid_before/after 均为 null），故适用期未知" }, source: SOURCES.sbdb, updated: "2021-04-13", orbitSolution: { orbitId: "48", epochJd: 2461200.5, arcDays: 9520, uncertainty: "RMS 0.43153 角秒；SBDB condition code 0（0–9，0 为最小不确定性）", conditionCode: 0, source: SOURCES.sbdb, solnDate: "2021-04-13" },
    elements: { a: 2.765552595034094, e: 0.07969229514816586, i: 10.58802780183462, Om: 80.24862682043221, w: 73.29421453021587, M0: 274.4193463761342, periodDays: 1679.853119758983, epochJd: 2461200.5 },
    perihelionAU: 2.545159361382861, aphelionAU: 2.985945828685327}),
  body({ id: "eris", zh: "阋神星", en: "Eris", type: "矮行星", parent: "sun",
    diameterKm: 2326, massKg: 1.66e22, density: 2.52, tempK: null,
    rotationDays: 1.079, orbitalPeriodDays: 204516.6629430732, eccentricity: 0.4382385347971672, inclinationDeg: 43.9258279471791,
    axialTiltDeg: null, moons: 1, color: "#d8d8d8", color2: "#8f8f8f",
    accuracy: { level: "sbdb", validFromJd: null, validToJd: null, note: "SBDB 正式轨道解（标准历元 2461200.5 = 2026-06-09，J2000 平黄道）；固定椭圆外推，无摄动改正；SBDB 未给出适用期，故适用期未知" }, source: SOURCES.sbdb, updated: "2026-06-06", orbitSolution: { orbitId: "103", epochJd: 2461200.5, arcDays: 26089, uncertainty: "RMS 0.36712 角秒；SBDB condition code 3（0–9，0 为最小不确定性）", conditionCode: 3, source: SOURCES.sbdb, solnDate: "2026-06-06" },
    elements: { a: 67.93394687853566, e: 0.4382385347971672, i: 43.9258279471791, Om: 36.00477044417249, w: 150.7949235840312, M0: 211.774434275007, periodDays: 204516.6629430732, epochJd: 2461200.5 },
    perihelionAU: 38.16267353549761, aphelionAU: 97.70522022157373}),
  body({ id: "haumea", zh: "妊神星", en: "Haumea", type: "矮行星", parent: "sun",
    diameterKm: 1632, massKg: 4.0e21, density: 2.6, tempK: null,
    rotationDays: 0.163, orbitalPeriodDays: 103208.1173403618, eccentricity: 0.1944430148898797, inclinationDeg: 28.20847393040364,
    axialTiltDeg: null, moons: 2, color: "#c8c0b0", color2: "#8a8272",
    accuracy: { level: "sbdb", validFromJd: null, validToJd: null, note: "SBDB 正式轨道解（标准历元 2461200.5 = 2026-06-09，J2000 平黄道）；固定椭圆外推，无摄动改正；SBDB 未给出适用期，故适用期未知" }, source: SOURCES.sbdb, updated: "2026-06-06", orbitSolution: { orbitId: "132", epochJd: 2461200.5, arcDays: 25956, uncertainty: "RMS 0.25427 角秒；SBDB condition code 1（0–9，0 为最小不确定性）", conditionCode: 1, source: SOURCES.sbdb, solnDate: "2026-06-06" },
    elements: { a: 43.06029023650952, e: 0.1944430148898797, i: 28.20847393040364, Om: 121.7860561329425, w: 240.6905472508661, M0: 223.2104118812299, periodDays: 103208.1173403618, epochJd: 2461200.5 },
    perihelionAU: 34.68751758088936, aphelionAU: 51.43306289212968}),
  body({ id: "makemake", zh: "鸟神星", en: "Makemake", type: "矮行星", parent: "sun",
    diameterKm: 1430, massKg: 3.1e21, density: 1.7, tempK: null,
    rotationDays: 0.951, orbitalPeriodDays: 112364.8068762869, eccentricity: 0.1588889953992523, inclinationDeg: 29.02785603743067,
    axialTiltDeg: null, moons: 1, color: "#d8a080", color2: "#a06a48",
    accuracy: { level: "sbdb", validFromJd: null, validToJd: null, note: "SBDB 正式轨道解（标准历元 2461200.5 = 2026-06-09，J2000 平黄道）；固定椭圆外推，无摄动改正；SBDB 未给出适用期，故适用期未知" }, source: SOURCES.sbdb, updated: "2026-06-06", orbitSolution: { orbitId: "130", epochJd: 2461200.5, arcDays: 25999, uncertainty: "RMS 0.23296 角秒；SBDB condition code 1（0–9，0 为最小不确定性）", conditionCode: 1, source: SOURCES.sbdb, solnDate: "2026-06-06" },
    elements: { a: 45.57093317300052, e: 0.1588889953992523, i: 29.02785603743067, Om: 79.2948338209406, w: 297.0922733397207, M0: 169.9379962048232, periodDays: 112364.8068762869, epochJd: 2461200.5 },
    perihelionAU: 38.33021338173601, aphelionAU: 52.81165296426503}),
  body({ id: "vesta", zh: "灶神星", en: "Vesta", type: "小行星", parent: "sun",
    diameterKm: 525, massKg: 2.59e20, density: 3.46, tempK: null,
    rotationDays: 0.2226, orbitalPeriodDays: 1325.389042911101, eccentricity: 0.09020374382834395, inclinationDeg: 7.143925545058711,
    axialTiltDeg: null, moons: 0, color: "#a89880", color2: "#6e6048",
    accuracy: { level: "sbdb", validFromJd: null, validToJd: null, note: "SBDB 正式轨道解（标准历元 2461200.5 = 2026-06-09，J2000 平黄道）；固定椭圆外推，无摄动改正；SBDB 未给出适用期，故适用期未知" }, source: SOURCES.sbdb, updated: "2021-04-13", orbitSolution: { orbitId: "36", epochJd: 2461200.5, arcDays: 25743, uncertainty: "RMS 0.40095 角秒；SBDB condition code 0（0–9，0 为最小不确定性）", conditionCode: 0, source: SOURCES.sbdb, solnDate: "2021-04-13" },
    elements: { a: 2.361365965127599, e: 0.09020374382834395, i: 7.143925545058711, Om: 103.701293265032, w: 151.4686478221564, M0: 81.19015607686903, periodDays: 1325.389042911101, epochJd: 2461200.5 },
    perihelionAU: 2.148361914524259, aphelionAU: 2.574370015730939}),
  body({ id: "pallas", zh: "智神星", en: "Pallas", type: "小行星", parent: "sun",
    diameterKm: 513, massKg: 2.11e20, density: 2.92, tempK: null,
    rotationDays: 0.3256, orbitalPeriodDays: 1683.504809564834, eccentricity: 0.2307000995648547, inclinationDeg: 34.93279321851542,
    axialTiltDeg: null, moons: 0, color: "#b8b0a0", color2: "#7d7566",
    accuracy: { level: "sbdb", validFromJd: null, validToJd: null, note: "SBDB 正式轨道解（标准历元 2461200.5 = 2026-06-09，J2000 平黄道）；固定椭圆外推，无摄动改正；SBDB 未给出适用期，故适用期未知" }, source: SOURCES.sbdb, updated: "2026-06-05", orbitSolution: { orbitId: "74", epochJd: 2461200.5, arcDays: 80828, uncertainty: "RMS 0.35838 角秒；SBDB condition code 0（0–9，0 为最小不确定性）", conditionCode: 0, source: SOURCES.sbdb, solnDate: "2026-06-05" },
    elements: { a: 2.769559010737709, e: 0.2307000995648547, i: 34.93279321851542, Om: 172.8866193357694, w: 310.9699161652136, M0: 254.2496521742734, periodDays: 1683.504809564834, epochJd: 2461200.5 },
    perihelionAU: 2.130621471209779, aphelionAU: 3.408496550265638}),
  body({ id: "eros", zh: "爱神星", en: "Eros", type: "小行星", parent: "sun",
    diameterKm: 17, massKg: 6.69e15, density: 2.67, tempK: null,
    rotationDays: 0.219, orbitalPeriodDays: 643.1963890927677, eccentricity: 0.2228779627700761, inclinationDeg: 10.82854410314273,
    axialTiltDeg: null, moons: 0, color: "#c0a880", color2: "#8a6f48",
    accuracy: { level: "sbdb", validFromJd: null, validToJd: null, note: "SBDB 正式轨道解（标准历元 2461200.5 = 2026-06-09，J2000 平黄道）；固定椭圆外推，无摄动改正；SBDB 未给出适用期，故适用期未知" }, source: SOURCES.sbdb, updated: "2021-05-24", orbitSolution: { orbitId: "659", epochJd: 2461200.5, arcDays: 46582, uncertainty: "RMS 0.29796 角秒；SBDB condition code 0（0–9，0 为最小不确定性）", conditionCode: 0, source: SOURCES.sbdb, solnDate: "2021-05-24" },
    elements: { a: 1.458243716760167, e: 0.2228779627700761, i: 10.82854410314273, Om: 304.2679713350896, w: 178.9181319135911, M0: 62.51145501986792, periodDays: 643.1963890927677, epochJd: 2461200.5 },
    perihelionAU: 1.133233327946397, aphelionAU: 1.783254105573937}),
  body({ id: "halley", zh: "哈雷彗星", en: "1P/Halley", type: "彗星", parent: "sun",
    diameterKm: 11, massKg: null, density: null, tempK: null,
    rotationDays: null, orbitalPeriodDays: 27728.04608790421, eccentricity: 0.9679359956953211, inclinationDeg: 162.1905300439129,
    axialTiltDeg: null, moons: 0, color: "#cfd8e0", color2: "#7d8894",
    accuracy: { level: "sbdb", validFromJd: null, validToJd: null, note: "SBDB 正式轨道解（历元 2439875.5 = 1968-01-20，J2000 平黄道；perihelionJd 为近日点时刻，与轨道解历元分开记录）；固定椭圆外推，无木星摄动与非引力改正，远离历元后相位误差未量化；SBDB 未给出适用期，故适用期未知" }, source: SOURCES.sbdb, updated: "2025-11-21", orbitSolution: { orbitId: "75", epochJd: 2439875.5, arcDays: 57852, uncertainty: "RMS 0.61032 角秒；SBDB condition code 0（0–9，0 为最小不确定性）", conditionCode: 0, source: SOURCES.sbdb, solnDate: "2025-11-21" },
    elements: { a: 17.92863504856923, e: 0.9679359956953211, i: 162.1905300439129, Om: 59.09894720612437, w: 112.2414314637764, M0: 274.3823371366792, periodDays: 27728.04608790421, epochJd: 2439875.5, perihelionJd: 2446469.973616146677 },
    perihelionAU: 0.5748638313743413, aphelionAU: 35.28240626576412}),
  body({ id: "67p", zh: "67P/丘留莫夫-格拉西缅科", en: "67P/Churyumov-Gerasimenko", type: "彗星", parent: "sun",
    diameterKm: 4, massKg: null, density: null, tempK: null,
    rotationDays: null, orbitalPeriodDays: 2353.076067903661, eccentricity: 0.6409081308996354, inclinationDeg: 7.040294937543767,
    axialTiltDeg: null, moons: 0, color: "#b8a888", color2: "#7d6f58",
    accuracy: { level: "sbdb", validFromJd: null, validToJd: null, note: "SBDB 正式轨道解（历元 2457305.5 = 2015-10-10，J2000 平黄道；perihelionJd 为近日点时刻，与轨道解历元分开记录）；固定椭圆外推，无摄动与非引力改正，远离历元后相位误差未量化；SBDB 未给出适用期，故适用期未知" }, source: SOURCES.sbdb, updated: "2026-09-04", orbitSolution: { orbitId: "K284/1", epochJd: 2457305.5, arcDays: 6229, uncertainty: "RMS 0.55084 角秒；SBDB condition code 0（0–9，0 为最小不确定性）", conditionCode: 0, source: SOURCES.sbdb, solnDate: "2026-09-04" },
    elements: { a: 3.462249490129549, e: 0.6409081308996354, i: 7.040294937543767, Om: 50.13557377155012, w: 12.79824970228189, M0: 8.859927425218402, periodDays: 2353.076067903661, epochJd: 2457305.5, perihelionJd: 2457247.588657812098 },
    perihelionAU: 1.243265640702404, aphelionAU: 5.681233339556694}),
];

// Moons: simplified Keplerian around parent, ecliptic frame (NOT the
// parent's equatorial frame), with frozen nodes/periapses: NO 18.6-year
// nodal regression and NO 8.85-year perigee precession, so positions drift
// over months to years (scale judgement, not a measured comparison).
// Phase rule (INTERFACE_CONTRACTS §1): every phaseDeg must be paired with
// a phaseEpochJd (mean anomaly AT that epoch). Only the Moon keeps a
// usable phase (218.32 deg at J2000, the old code's implicit epoch, now
// made explicit); every other satellite's old integer phase was an
// unverified placeholder, so phaseDeg is now null with accuracy
// level 'schematic' and moonPosition() throws for those entries — the
// caller (UI/main) must skip or label them "示意/未知", never plot a
// made-up phase as a formal position. Moon entries nest these fields
// under .moon (the shape main.js/render.js already consume); the flat
// phaseDeg/phaseEpochJd naming in the contract refers to these fields.
export const MOONS = [
  { id: "moon", zh: "月球", en: "Moon", parent: "earth", diameterKm: 3474, massKg: 7.342e22, density: 3.34, tempK: null, rotationDays: 27.32, orbitalPeriodDays: 27.322, eccentricity: 0.0549, inclinationDeg: 5.145, axialTiltDeg: 1.54, color: "#c8c8c8", color2: "#8a8a8a", source: SOURCES.jplSats, updated: "2026-10-31", accuracy: { level: "kepler", validFromJd: null, validToJd: null, note: "简化开普勒模型（黄道系示意，非地月理论；无 18.6 年交点退行与 8.85 年近地点进动改正），相位历元 J2000；数月至数年后可偏离数度（量级判断，未实测对比）；适用期未知" }, moon: { aKm: 384400, e: 0.0549, i: 5.145, Om: 125.08, w: 318.15, periodDays: 27.322, phaseDeg: 218.32, phaseEpochJd: 2451545.0 } },
  { id: "phobos", zh: "火卫一", en: "Phobos", parent: "mars", diameterKm: 22, massKg: 1.07e16, density: 1.88, tempK: null, rotationDays: 0.319, orbitalPeriodDays: 0.319, eccentricity: 0.015, inclinationDeg: 1.08, axialTiltDeg: null, color: "#a08068", color2: "#6e5544", source: SOURCES.jplSats, updated: "2026-10-31", accuracy: { level: "schematic", validFromJd: null, validToJd: null, note: "简化开普勒模型（黄道系示意，非母天体赤道系；无交点退行与近地点进动改正）；相位未核实，示意/未知" }, moon: { aKm: 9376, e: 0.015, i: 1.08, Om: 0, w: 0, periodDays: 0.319, phaseDeg: null, phaseEpochJd: null } },
  { id: "deimos", zh: "火卫二", en: "Deimos", parent: "mars", diameterKm: 12, massKg: 1.48e15, density: 1.47, tempK: null, rotationDays: 1.263, orbitalPeriodDays: 1.263, eccentricity: 0.0003, inclinationDeg: 1.79, axialTiltDeg: null, color: "#b09888", color2: "#7d6a5a", source: SOURCES.jplSats, updated: "2026-10-31", accuracy: { level: "schematic", validFromJd: null, validToJd: null, note: "简化开普勒模型（黄道系示意，非母天体赤道系；无交点退行与近地点进动改正）；相位未核实，示意/未知" }, moon: { aKm: 23463, e: 0.0003, i: 1.79, Om: 0, w: 0, periodDays: 1.263, phaseDeg: null, phaseEpochJd: null } },
  { id: "io", zh: "木卫一", en: "Io", parent: "jupiter", diameterKm: 3643, massKg: 8.93e22, density: 3.53, tempK: null, rotationDays: 1.769, orbitalPeriodDays: 1.769, eccentricity: 0.004, inclinationDeg: 0.05, axialTiltDeg: null, color: "#e8d878", color2: "#b89a3a", source: SOURCES.jplSats, updated: "2026-10-31", accuracy: { level: "schematic", validFromJd: null, validToJd: null, note: "简化开普勒模型（黄道系示意，非母天体赤道系；无交点退行与近地点进动改正）；相位未核实，示意/未知" }, moon: { aKm: 421700, e: 0.004, i: 0.05, Om: 0, w: 0, periodDays: 1.769, phaseDeg: null, phaseEpochJd: null } },
  { id: "europa", zh: "木卫二", en: "Europa", parent: "jupiter", diameterKm: 3122, massKg: 4.80e22, density: 3.01, tempK: null, rotationDays: 3.551, orbitalPeriodDays: 3.551, eccentricity: 0.009, inclinationDeg: 0.47, axialTiltDeg: null, color: "#d8e0e8", color2: "#9aa8b8", source: SOURCES.jplSats, updated: "2026-10-31", accuracy: { level: "schematic", validFromJd: null, validToJd: null, note: "简化开普勒模型（黄道系示意，非母天体赤道系；无交点退行与近地点进动改正）；相位未核实，示意/未知" }, moon: { aKm: 671000, e: 0.009, i: 0.47, Om: 0, w: 0, periodDays: 3.551, phaseDeg: null, phaseEpochJd: null } },
  { id: "ganymede", zh: "木卫三", en: "Ganymede", parent: "jupiter", diameterKm: 5268, massKg: 1.48e23, density: 1.94, tempK: null, rotationDays: 7.155, orbitalPeriodDays: 7.155, eccentricity: 0.001, inclinationDeg: 0.20, axialTiltDeg: null, color: "#a89888", color2: "#6e6256", source: SOURCES.jplSats, updated: "2026-10-31", accuracy: { level: "schematic", validFromJd: null, validToJd: null, note: "简化开普勒模型（黄道系示意，非母天体赤道系；无交点退行与近地点进动改正）；相位未核实，示意/未知" }, moon: { aKm: 1070400, e: 0.001, i: 0.20, Om: 0, w: 0, periodDays: 7.155, phaseDeg: null, phaseEpochJd: null } },
  { id: "callisto", zh: "木卫四", en: "Callisto", parent: "jupiter", diameterKm: 4821, massKg: 1.08e23, density: 1.83, tempK: null, rotationDays: 16.689, orbitalPeriodDays: 16.689, eccentricity: 0.007, inclinationDeg: 0.19, axialTiltDeg: null, color: "#7d7a72", color2: "#4f4d48", source: SOURCES.jplSats, updated: "2026-10-31", accuracy: { level: "schematic", validFromJd: null, validToJd: null, note: "简化开普勒模型（黄道系示意，非母天体赤道系；无交点退行与近地点进动改正）；相位未核实，示意/未知" }, moon: { aKm: 1882700, e: 0.007, i: 0.19, Om: 0, w: 0, periodDays: 16.689, phaseDeg: null, phaseEpochJd: null } },
  { id: "enceladus", zh: "土卫二", en: "Enceladus", parent: "saturn", diameterKm: 504, massKg: 1.08e20, density: 1.61, tempK: null, rotationDays: 1.370, orbitalPeriodDays: 1.370, eccentricity: 0.005, inclinationDeg: 0.01, axialTiltDeg: null, color: "#e8f0f8", color2: "#b8c8d8", source: SOURCES.jplSats, updated: "2026-10-31", accuracy: { level: "schematic", validFromJd: null, validToJd: null, note: "简化开普勒模型（黄道系示意，非母天体赤道系；无交点退行与近地点进动改正）；相位未核实，示意/未知" }, moon: { aKm: 237948, e: 0.005, i: 0.01, Om: 0, w: 0, periodDays: 1.370, phaseDeg: null, phaseEpochJd: null } },
  { id: "tethys", zh: "土卫三", en: "Tethys", parent: "saturn", diameterKm: 1062, massKg: 6.17e20, density: 0.98, tempK: null, rotationDays: 1.888, orbitalPeriodDays: 1.888, eccentricity: 0.000, inclinationDeg: 1.09, axialTiltDeg: null, color: "#d8d8d8", color2: "#a0a0a0", source: SOURCES.jplSats, updated: "2026-10-31", accuracy: { level: "schematic", validFromJd: null, validToJd: null, note: "简化开普勒模型（黄道系示意，非母天体赤道系；无交点退行与近地点进动改正）；相位未核实，示意/未知" }, moon: { aKm: 294619, e: 0.0, i: 1.09, Om: 0, w: 0, periodDays: 1.888, phaseDeg: null, phaseEpochJd: null } },
  { id: "dione", zh: "土卫四", en: "Dione", parent: "saturn", diameterKm: 1123, massKg: 1.10e21, density: 1.48, tempK: null, rotationDays: 2.737, orbitalPeriodDays: 2.737, eccentricity: 0.002, inclinationDeg: 0.02, axialTiltDeg: null, color: "#c8c0b8", color2: "#8f887e", source: SOURCES.jplSats, updated: "2026-10-31", accuracy: { level: "schematic", validFromJd: null, validToJd: null, note: "简化开普勒模型（黄道系示意，非母天体赤道系；无交点退行与近地点进动改正）；相位未核实，示意/未知" }, moon: { aKm: 377396, e: 0.002, i: 0.02, Om: 0, w: 0, periodDays: 2.737, phaseDeg: null, phaseEpochJd: null } },
  { id: "rhea", zh: "土卫五", en: "Rhea", parent: "saturn", diameterKm: 1527, massKg: 2.31e21, density: 1.24, tempK: null, rotationDays: 4.518, orbitalPeriodDays: 4.518, eccentricity: 0.001, inclinationDeg: 0.35, axialTiltDeg: null, color: "#d0d0d0", color2: "#9a9a9a", source: SOURCES.jplSats, updated: "2026-10-31", accuracy: { level: "schematic", validFromJd: null, validToJd: null, note: "简化开普勒模型（黄道系示意，非母天体赤道系；无交点退行与近地点进动改正）；相位未核实，示意/未知" }, moon: { aKm: 527108, e: 0.001, i: 0.35, Om: 0, w: 0, periodDays: 4.518, phaseDeg: null, phaseEpochJd: null } },
  { id: "titan", zh: "土卫六", en: "Titan", parent: "saturn", diameterKm: 5149, massKg: 1.35e23, density: 1.88, tempK: null, rotationDays: 15.945, orbitalPeriodDays: 15.945, eccentricity: 0.029, inclinationDeg: 0.33, axialTiltDeg: null, color: "#e0a858", color2: "#a87830", source: SOURCES.jplSats, updated: "2026-10-31", accuracy: { level: "schematic", validFromJd: null, validToJd: null, note: "简化开普勒模型（黄道系示意，非母天体赤道系；无交点退行与近地点进动改正）；相位未核实，示意/未知" }, moon: { aKm: 1221870, e: 0.029, i: 0.33, Om: 0, w: 0, periodDays: 15.945, phaseDeg: null, phaseEpochJd: null } },
  { id: "iapetus", zh: "土卫八", en: "Iapetus", parent: "saturn", diameterKm: 1469, massKg: 1.81e21, density: 1.09, tempK: null, rotationDays: 79.33, orbitalPeriodDays: 79.33, eccentricity: 0.028, inclinationDeg: 7.57, axialTiltDeg: null, color: "#a89878", color2: "#6e6048", source: SOURCES.jplSats, updated: "2026-10-31", accuracy: { level: "schematic", validFromJd: null, validToJd: null, note: "简化开普勒模型（黄道系示意，非母天体赤道系；无交点退行与近地点进动改正）；相位未核实，示意/未知" }, moon: { aKm: 3560820, e: 0.028, i: 7.57, Om: 0, w: 0, periodDays: 79.33, phaseDeg: null, phaseEpochJd: null } },
  { id: "miranda", zh: "天卫五", en: "Miranda", parent: "uranus", diameterKm: 472, massKg: 6.6e19, density: 1.20, tempK: null, rotationDays: 1.413, orbitalPeriodDays: 1.413, eccentricity: 0.001, inclinationDeg: 4.22, axialTiltDeg: null, color: "#c8c8c8", color2: "#8f8f8f", source: SOURCES.jplSats, updated: "2026-10-31", accuracy: { level: "schematic", validFromJd: null, validToJd: null, note: "简化开普勒模型（黄道系示意，非母天体赤道系；无交点退行与近地点进动改正）；相位未核实，示意/未知" }, moon: { aKm: 129390, e: 0.001, i: 4.22, Om: 0, w: 0, periodDays: 1.413, phaseDeg: null, phaseEpochJd: null } },
  { id: "ariel", zh: "天卫一", en: "Ariel", parent: "uranus", diameterKm: 1158, massKg: 1.35e21, density: 1.59, tempK: null, rotationDays: 2.520, orbitalPeriodDays: 2.520, eccentricity: 0.001, inclinationDeg: 0.26, axialTiltDeg: null, color: "#d0d0d0", color2: "#9a9a9a", source: SOURCES.jplSats, updated: "2026-10-31", accuracy: { level: "schematic", validFromJd: null, validToJd: null, note: "简化开普勒模型（黄道系示意，非母天体赤道系；无交点退行与近地点进动改正）；相位未核实，示意/未知" }, moon: { aKm: 190900, e: 0.001, i: 0.26, Om: 0, w: 0, periodDays: 2.520, phaseDeg: null, phaseEpochJd: null } },
  { id: "umbriel", zh: "天卫二", en: "Umbriel", parent: "uranus", diameterKm: 1169, massKg: 1.17e21, density: 1.39, tempK: null, rotationDays: 4.144, orbitalPeriodDays: 4.144, eccentricity: 0.004, inclinationDeg: 0.21, axialTiltDeg: null, color: "#8a8a8a", color2: "#5a5a5a", source: SOURCES.jplSats, updated: "2026-10-31", accuracy: { level: "schematic", validFromJd: null, validToJd: null, note: "简化开普勒模型（黄道系示意，非母天体赤道系；无交点退行与近地点进动改正）；相位未核实，示意/未知" }, moon: { aKm: 266300, e: 0.004, i: 0.21, Om: 0, w: 0, periodDays: 4.144, phaseDeg: null, phaseEpochJd: null } },
  { id: "titania", zh: "天卫三", en: "Titania", parent: "uranus", diameterKm: 1578, massKg: 3.53e21, density: 1.71, tempK: null, rotationDays: 8.706, orbitalPeriodDays: 8.706, eccentricity: 0.001, inclinationDeg: 0.34, axialTiltDeg: null, color: "#c0a898", color2: "#8a7260", source: SOURCES.jplSats, updated: "2026-10-31", accuracy: { level: "schematic", validFromJd: null, validToJd: null, note: "简化开普勒模型（黄道系示意，非母天体赤道系；无交点退行与近地点进动改正）；相位未核实，示意/未知" }, moon: { aKm: 435910, e: 0.001, i: 0.34, Om: 0, w: 0, periodDays: 8.706, phaseDeg: null, phaseEpochJd: null } },
  { id: "oberon", zh: "天卫四", en: "Oberon", parent: "uranus", diameterKm: 1523, massKg: 3.01e21, density: 1.63, tempK: null, rotationDays: 13.463, orbitalPeriodDays: 13.463, eccentricity: 0.001, inclinationDeg: 0.10, axialTiltDeg: null, color: "#b8a090", color2: "#7d6a58", source: SOURCES.jplSats, updated: "2026-10-31", accuracy: { level: "schematic", validFromJd: null, validToJd: null, note: "简化开普勒模型（黄道系示意，非母天体赤道系；无交点退行与近地点进动改正）；相位未核实，示意/未知" }, moon: { aKm: 583520, e: 0.001, i: 0.10, Om: 0, w: 0, periodDays: 13.463, phaseDeg: null, phaseEpochJd: null } },
  { id: "triton", zh: "海卫一", en: "Triton", parent: "neptune", diameterKm: 2707, massKg: 2.14e22, density: 2.06, tempK: null, rotationDays: -5.877, orbitalPeriodDays: 5.877, eccentricity: 0.000, inclinationDeg: 156.9, axialTiltDeg: null, color: "#d8e0e8", color2: "#a0b0c0", source: SOURCES.jplSats, updated: "2026-10-31", accuracy: { level: "schematic", validFromJd: null, validToJd: null, note: "简化开普勒模型（黄道系示意，非母天体赤道系；无交点退行与近地点进动改正）；相位未核实，示意/未知" }, moon: { aKm: 354760, e: 0.0, i: 156.9, Om: 0, w: 0, periodDays: 5.877, phaseDeg: null, phaseEpochJd: null } },
  { id: "proteus", zh: "海卫二", en: "Proteus", parent: "neptune", diameterKm: 420, massKg: 5.0e19, density: 1.30, tempK: null, rotationDays: 1.122, orbitalPeriodDays: 1.122, eccentricity: 0.000, inclinationDeg: 0.04, axialTiltDeg: null, color: "#8a8a8a", color2: "#5a5a5a", source: SOURCES.jplSats, updated: "2026-10-31", accuracy: { level: "schematic", validFromJd: null, validToJd: null, note: "简化开普勒模型（黄道系示意，非母天体赤道系；无交点退行与近地点进动改正）；相位未核实，示意/未知" }, moon: { aKm: 117647, e: 0.0, i: 0.04, Om: 0, w: 0, periodDays: 1.122, phaseDeg: null, phaseEpochJd: null } },
  { id: "charon", zh: "冥卫一", en: "Charon", parent: "pluto", diameterKm: 1212, massKg: 1.59e21, density: 1.70, tempK: null, rotationDays: 6.387, orbitalPeriodDays: 6.387, eccentricity: 0.000, inclinationDeg: 0.0, axialTiltDeg: null, color: "#b8b0a8", color2: "#7d756e", source: SOURCES.jplSats, updated: "2026-10-31", accuracy: { level: "schematic", validFromJd: null, validToJd: null, note: "简化开普勒模型（黄道系示意，非母天体赤道系；无交点退行与近地点进动改正）；相位未核实，示意/未知" }, moon: { aKm: 19596, e: 0.0, i: 0.0, Om: 0, w: 0, periodDays: 6.387, phaseDeg: null, phaseEpochJd: null } },
];

export const ALL_BODIES = [...BODIES, ...MOONS.map(m => ({ ...m, type: "卫星", moons: 0, parent: m.parent, elements: null }))];
export function findBody(id) { return ALL_BODIES.find(b => b.id === id); }
export function moonsOf(parentId) { return MOONS.filter(m => m.parent === parentId); }
