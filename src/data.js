// data.js — body catalogue.
// Sources are recorded per body. Fields that are null are rendered as "未知"
// in the UI and must never be invented.
// Orbital elements:
//  - Planets + Pluto: JPL "Keplerian Elements for Approximate Positions of
//    the Major Planets" (J2000 + rates per century). Accuracy: arcminutes
//    over ~1800-2050 for the major planets; worse outside that range.
//  - Dwarf planets / asteroids / comets: approximate osculating elements
//    (J2000 unless noted). Phase (mean anomaly) for these is approximate;
//    the UI marks them "近似轨道（相位仅供参考）" and SBDB integration is
//    listed as not yet done in README.md.
// Physical parameters: JPL Solar System Dynamics physical-parameter tables
// (planets / satellites pages) where known; otherwise null.
// Colours are display palettes for procedural textures, NOT measured imagery.
// [MODEL] Shape / ring / texture metadata (INTERFACE_CONTRACTS.md section 5):
//  - flattening: polar flattening f (number) for oblate bodies, else null.
//    Jupiter 0.06487 / Saturn 0.09796 (NASA planetary fact sheets, equatorial
//    vs polar radii); no other body gets a flattening value in this change.
//  - axesKm: [x, y, z] full-axis lengths in km for triaxial bodies, else null.
//    Haumea [1960, 1518, 996] is the published Keck light-curve model; the
//    renderer uses these for axis RATIOS only, keeping the existing
//    diameterKm-based overall size, so the two estimates are not conflated.
//  - ring: {inner, outer, color, profile, cassiniGap} in body-radius units,
//    or null. All four giant-planet rings are profile:'schematic' — a single
//    schematic disc per planet, NOT a measured brightness profile; Saturn's
//    Cassini gap is a schematic gap. Uranus' narrow rings and Neptune's arcs
//    are not individually modelled. Inner/outer values are schematic system
//    extents (Jupiter halo+main, Saturn C..A, Uranus ring 6..epsilon,
//    Neptune Galle..Adams), not measured profiles.
//  - textureKind: always "procedural" in this build. No body is labelled
//    "measured": no verifiable public measured-imagery source is bundled, and
//    none is invented. textureGenerator is "gasBands" (gas giants) or
//    "rockNoise" (all other bodies); textureSeed is independent per body
//    (FNV-1a of the id), never a shared seed 42.
//  - moonsTotal / moonsModelled (BODIES only): the panel must show BOTH, so
//    e.g. Jupiter reads "95 total, 4 modelled". Eris (1), Haumea (2) and
//    Makemake (1) have moonsTotal > 0 with moonsModelled 0: their satellites
//    are NOT modelled because no verifiable orbit data is available in this
//    repo, and inventing orbits to close the gap would violate the honesty
//    rule. The legacy `moons` field is kept for compatibility and equals
//    moonsTotal; the panel should prefer moonsTotal/moonsModelled.
//  - MOONS accuracy is explicitly null (field present, value unknown), not
//    missing: no verifiable accuracy metadata exists for the simplified
//    satellite models. Do not fill it with an invented precision level.
//  - axialTiltDeg null means UNKNOWN, never 0 degrees. The renderer falls
//    back to 0 degrees for display only and records axialTiltKnown=false;
//    the panel must label such bodies "轴倾未知", not "0°".

export const SOURCES = {
  jplElements: "NASA/JPL Keplerian Elements for Approximate Positions of the Major Planets",
  jplPlanets: "NASA/JPL Solar System Dynamics, Planetary Physical Parameters",
  jplSats: "NASA/JPL Solar System Dynamics, Satellite Physical Parameters",
  jplSbdbPending: "NASA/JPL SBDB（尚未接入，见 README）",
  horizonsVerified: "NASA/JPL Horizons API（已验证可达，见 README；本静态版未实时接入）",
};

function body(o) { return o; }

// Helper: JPL-form elements with rates.
const J = (a, e, i, L, lp, Om, rates) => ({ a, e, i, L, lp, Om, rates });

export const BODIES = [
  body({ id: "sun", zh: "太阳", en: "Sun", type: "恒星", parent: null,
    diameterKm: 1392700, massKg: 1.9885e30, density: 1.408, tempK: 5778,
    rotationDays: 25.38, orbitalPeriodDays: null, eccentricity: null, inclinationDeg: null,
    axialTiltDeg: 7.25, moons: 0, moonsTotal: 0, moonsModelled: 0, color: "#ffb347", color2: "#ff7a18",
    flattening: null, axesKm: null, ring: null, textureKind: "procedural", textureGenerator: "rockNoise", textureSeed: 3763224417, accuracy: "中心天体，位置为坐标原点", source: SOURCES.jplPlanets, updated: "2026-10-31",
    elements: null }),

  body({ id: "mercury", zh: "水星", en: "Mercury", type: "行星", parent: "sun",
    diameterKm: 4879, massKg: 3.301e23, density: 5.43, tempK: 440,
    rotationDays: 58.646, orbitalPeriodDays: 87.969, eccentricity: 0.2056, inclinationDeg: 7.005,
    axialTiltDeg: 0.034, moons: 0, moonsTotal: 0, moonsModelled: 0, color: "#9c8e82", color2: "#6b5d4f",
    flattening: null, axesKm: null, ring: null, textureKind: "procedural", textureGenerator: "rockNoise", textureSeed: 38109070, accuracy: "JPL 近似星历", source: SOURCES.jplElements, updated: "2026-10-31",
    elements: J(0.38709927, 0.20563593, 7.00497902, 252.25032350, 77.45779628, 48.33076593,
      { a: 0.00000037, e: 0.00001906, i: -0.00594749, L: 149472.67411175, lp: 0.16047689, Om: -0.12534081 }) }),
  body({ id: "venus", zh: "金星", en: "Venus", type: "行星", parent: "sun",
    diameterKm: 12104, massKg: 4.867e24, density: 5.24, tempK: 737,
    rotationDays: -243.025, orbitalPeriodDays: 224.701, eccentricity: 0.0068, inclinationDeg: 3.395,
    axialTiltDeg: 177.36, moons: 0, moonsTotal: 0, moonsModelled: 0, color: "#e8c47a", color2: "#c98f3d",
    flattening: null, axesKm: null, ring: null, textureKind: "procedural", textureGenerator: "rockNoise", textureSeed: 2711260326, accuracy: "JPL 近似星历", source: SOURCES.jplElements, updated: "2026-10-31",
    elements: J(0.72333566, 0.00677672, 3.39467605, 181.97909950, 131.60246718, 76.67984255,
      { a: 0.00000390, e: -0.00004107, i: -0.00078890, L: 58517.81538729, lp: 0.00268329, Om: -0.27769418 }) }),
  body({ id: "earth", zh: "地球", en: "Earth", type: "行星", parent: "sun",
    diameterKm: 12742, massKg: 5.972e24, density: 5.51, tempK: 288,
    rotationDays: 0.99727, orbitalPeriodDays: 365.256, eccentricity: 0.0167, inclinationDeg: 0.0,
    axialTiltDeg: 23.44, moons: 1, moonsTotal: 1, moonsModelled: 1, color: "#3d7ddb", color2: "#1c4d8f",
    flattening: null, axesKm: null, ring: null, textureKind: "procedural", textureGenerator: "rockNoise", textureSeed: 636753111, accuracy: "JPL 近似星历（地月系质心）", source: SOURCES.jplElements, updated: "2026-10-31",
    elements: J(1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0.0,
      { a: 0.00000562, e: -0.00004392, i: -0.01294668, L: 35999.37244981, lp: 0.32327364, Om: 0.0 }) }),
  body({ id: "mars", zh: "火星", en: "Mars", type: "行星", parent: "sun",
    diameterKm: 6779, massKg: 6.417e23, density: 3.93, tempK: 210,
    rotationDays: 1.02596, orbitalPeriodDays: 686.980, eccentricity: 0.0934, inclinationDeg: 1.850,
    axialTiltDeg: 25.19, moons: 2, moonsTotal: 2, moonsModelled: 2, color: "#c1552f", color2: "#7d2f16",
    flattening: null, axesKm: null, ring: null, textureKind: "procedural", textureGenerator: "rockNoise", textureSeed: 3749382760, accuracy: "JPL 近似星历", source: SOURCES.jplElements, updated: "2026-10-31",
    elements: J(1.52371034, 0.09339410, 1.84969142, -4.55343205, -23.94362959, 49.55953891,
      { a: 0.00001847, e: 0.00007882, i: -0.00813131, L: 19140.30268499, lp: 0.44441088, Om: -0.29257343 }) }),
  body({ id: "jupiter", zh: "木星", en: "Jupiter", type: "行星", parent: "sun",
    diameterKm: 139820, massKg: 1.898e27, density: 1.33, tempK: 165,
    rotationDays: 0.41354, orbitalPeriodDays: 4332.589, eccentricity: 0.0484, inclinationDeg: 1.304,
    axialTiltDeg: 3.13, moons: 95, moonsTotal: 95, moonsModelled: 4, color: "#d8a878", color2: "#a66a35",
    flattening: 0.06487, axesKm: null, ring: { inner: 1.40, outer: 1.81, color: "#8a7a68", profile: "schematic", cassiniGap: false }, textureKind: "procedural", textureGenerator: "gasBands", textureSeed: 2958085446, accuracy: "JPL 近似星历", source: SOURCES.jplElements, updated: "2026-10-31",
    elements: J(5.20288700, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909,
      { a: -0.00011607, e: -0.00013253, i: -0.00183714, L: 3034.74612775, lp: 0.21252668, Om: 0.20469106 }) }),
  body({ id: "saturn", zh: "土星", en: "Saturn", type: "行星", parent: "sun",
    diameterKm: 116460, massKg: 5.683e26, density: 0.69, tempK: 134,
    rotationDays: 0.44401, orbitalPeriodDays: 10759.22, eccentricity: 0.0539, inclinationDeg: 2.486,
    axialTiltDeg: 26.73, moons: 146, moonsTotal: 146, moonsModelled: 6, color: "#e3cfa0", color2: "#b89a5e",
    flattening: 0.09796, axesKm: null, ring: { inner: 1.24, outer: 2.27, color: "#dcc8a0", profile: "schematic", cassiniGap: true }, textureKind: "procedural", textureGenerator: "gasBands", textureSeed: 1501780982, accuracy: "JPL 近似星历", source: SOURCES.jplElements, updated: "2026-10-31",
    elements: J(9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448,
      { a: -0.00125060, e: -0.00050991, i: 0.00193609, L: 1222.49362201, lp: -0.41897216, Om: -0.28867794 }) }),
  body({ id: "uranus", zh: "天王星", en: "Uranus", type: "行星", parent: "sun",
    diameterKm: 50724, massKg: 8.681e25, density: 1.27, tempK: 76,
    rotationDays: -0.71833, orbitalPeriodDays: 30688.5, eccentricity: 0.0472, inclinationDeg: 0.773,
    axialTiltDeg: 97.77, moons: 28, moonsTotal: 28, moonsModelled: 5, color: "#8fd4d6", color2: "#4a9aa0",
    flattening: null, axesKm: null, ring: { inner: 1.64, outer: 2.00, color: "#5a6a72", profile: "schematic", cassiniGap: false }, textureKind: "procedural", textureGenerator: "gasBands", textureSeed: 538529037, accuracy: "JPL 近似星历", source: SOURCES.jplElements, updated: "2026-10-31",
    elements: J(19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.95427630, 74.01692503,
      { a: -0.00196176, e: -0.00004397, i: -0.00242939, L: 428.48202785, lp: 0.40805281, Om: 0.04240589 }) }),
  body({ id: "neptune", zh: "海王星", en: "Neptune", type: "行星", parent: "sun",
    diameterKm: 49244, massKg: 1.024e26, density: 1.64, tempK: 72,
    rotationDays: 0.67125, orbitalPeriodDays: 60182.0, eccentricity: 0.0086, inclinationDeg: 1.770,
    axialTiltDeg: 28.32, moons: 16, moonsTotal: 16, moonsModelled: 2, color: "#3f66d4", color2: "#1e2f7a",
    flattening: null, axesKm: null, ring: { inner: 1.69, outer: 2.54, color: "#4a5a80", profile: "schematic", cassiniGap: false }, textureKind: "procedural", textureGenerator: "gasBands", textureSeed: 2876279986, accuracy: "JPL 近似星历", source: SOURCES.jplElements, updated: "2026-10-31",
    elements: J(30.06992276, 0.00859048, 1.77004347, -55.70383718, 44.96476227, 131.78422574,
      { a: 0.00026291, e: 0.00005105, i: 0.00035372, L: 218.45945325, lp: -0.00508664, Om: -0.00577264 }) }),
  body({ id: "pluto", zh: "冥王星", en: "Pluto", type: "矮行星", parent: "sun",
    diameterKm: 2377, massKg: 1.303e22, density: 1.85, tempK: 44,
    rotationDays: -6.387, orbitalPeriodDays: 90560, eccentricity: 0.2488, inclinationDeg: 17.14,
    axialTiltDeg: 122.53, moons: 5, moonsTotal: 5, moonsModelled: 1, color: "#c9a98a", color2: "#8a6a4a",
    flattening: null, axesKm: null, ring: null, textureKind: "procedural", textureGenerator: "rockNoise", textureSeed: 3078459853, accuracy: "JPL 近似星历", source: SOURCES.jplElements, updated: "2026-10-31",
    elements: J(39.48211675, 0.24882730, 17.14001206, 238.92903833, 224.06891629, 110.30393684,
      { a: -0.00031596, e: 0.00005170, i: 0.00004818, L: 145.20780515, lp: -0.04062942, Om: -0.01183482 }) }),
  body({ id: "ceres", zh: "谷神星", en: "Ceres", type: "矮行星", parent: "sun",
    diameterKm: 939, massKg: 9.38e20, density: 2.16, tempK: null,
    rotationDays: 0.378, orbitalPeriodDays: 1681.6, eccentricity: 0.0758, inclinationDeg: 10.59,
    axialTiltDeg: null, moons: 0, moonsTotal: 0, moonsModelled: 0, color: "#b0a090", color2: "#7a6a58",
    flattening: null, axesKm: null, ring: null, textureKind: "procedural", textureGenerator: "rockNoise", textureSeed: 709671753, accuracy: "近似轨道（相位仅供参考）", source: SOURCES.jplSbdbPending, updated: "2026-10-31",
    elements: { a: 2.7675, e: 0.0758, i: 10.593, Om: 80.329, w: 72.589, M0: 95.0, periodDays: 1681.6, epochJd: 2451545.0 },
    perihelionAU: 2.558, aphelionAU: 2.977, uncertainty: "轨道根数为近似值，未接入 SBDB 轨道解；不确定性未量化，显示为未知" }),
  body({ id: "eris", zh: "阋神星", en: "Eris", type: "矮行星", parent: "sun",
    diameterKm: 2326, massKg: 1.66e22, density: 2.52, tempK: null,
    rotationDays: 1.079, orbitalPeriodDays: 203830, eccentricity: 0.436, inclinationDeg: 44.19,
    axialTiltDeg: null, moons: 1, moonsTotal: 1, moonsModelled: 0, color: "#d8d8d8", color2: "#8f8f8f",
    flattening: null, axesKm: null, ring: null, textureKind: "procedural", textureGenerator: "rockNoise", textureSeed: 1370326138, accuracy: "近似轨道（相位仅供参考）", source: SOURCES.jplSbdbPending, updated: "2026-10-31",
    elements: { a: 67.78, e: 0.436, i: 44.19, Om: 35.87, w: 151.3, M0: 180.0, periodDays: 203830, epochJd: 2451545.0 },
    perihelionAU: 38.2, aphelionAU: 97.5, uncertainty: "轨道根数为近似值，未接入 SBDB 轨道解；不确定性未量化，显示为未知" }),
  body({ id: "haumea", zh: "妊神星", en: "Haumea", type: "矮行星", parent: "sun",
    diameterKm: 1632, massKg: 4.0e21, density: 2.6, tempK: null,
    rotationDays: 0.163, orbitalPeriodDays: 103774, eccentricity: 0.196, inclinationDeg: 28.21,
    axialTiltDeg: null, moons: 2, moonsTotal: 2, moonsModelled: 0, color: "#c8c0b0", color2: "#8a8272",
    flattening: null, axesKm: [1960, 1518, 996], ring: null, textureKind: "procedural", textureGenerator: "rockNoise", textureSeed: 3712642402, accuracy: "近似轨道（相位仅供参考）", source: SOURCES.jplSbdbPending, updated: "2026-10-31",
    elements: { a: 43.1, e: 0.196, i: 28.21, Om: 121.8, w: 239.0, M0: 210.0, periodDays: 103774, epochJd: 2451545.0 },
    perihelionAU: 34.7, aphelionAU: 51.5, uncertainty: "轨道根数为近似值，未接入 SBDB 轨道解；不确定性未量化，显示为未知" }),
  body({ id: "makemake", zh: "鸟神星", en: "Makemake", type: "矮行星", parent: "sun",
    diameterKm: 1430, massKg: 3.1e21, density: 1.7, tempK: null,
    rotationDays: 0.951, orbitalPeriodDays: 112897, eccentricity: 0.155, inclinationDeg: 29.0,
    axialTiltDeg: null, moons: 1, moonsTotal: 1, moonsModelled: 0, color: "#d8a080", color2: "#a06a48",
    flattening: null, axesKm: null, ring: null, textureKind: "procedural", textureGenerator: "rockNoise", textureSeed: 1902864221, accuracy: "近似轨道（相位仅供参考）", source: SOURCES.jplSbdbPending, updated: "2026-10-31",
    elements: { a: 45.66, e: 0.155, i: 29.0, Om: 79.3, w: 294.9, M0: 150.0, periodDays: 112897, epochJd: 2451545.0 },
    perihelionAU: 38.6, aphelionAU: 52.8, uncertainty: "轨道根数为近似值，未接入 SBDB 轨道解；不确定性未量化，显示为未知" }),
  body({ id: "vesta", zh: "灶神星", en: "Vesta", type: "小行星", parent: "sun",
    diameterKm: 525, massKg: 2.59e20, density: 3.46, tempK: null,
    rotationDays: 0.2226, orbitalPeriodDays: 1325.7, eccentricity: 0.089, inclinationDeg: 7.14,
    axialTiltDeg: null, moons: 0, moonsTotal: 0, moonsModelled: 0, color: "#a89880", color2: "#6e6048",
    flattening: null, axesKm: null, ring: null, textureKind: "procedural", textureGenerator: "rockNoise", textureSeed: 995101846, accuracy: "近似轨道（相位仅供参考）", source: SOURCES.jplSbdbPending, updated: "2026-10-31",
    elements: { a: 2.362, e: 0.089, i: 7.14, Om: 103.8, w: 151.0, M0: 120.0, periodDays: 1325.7, epochJd: 2451545.0 },
    perihelionAU: 2.152, aphelionAU: 2.572, uncertainty: "轨道根数为近似值，未接入 SBDB 轨道解；观测弧长与不确定性未知" }),
  body({ id: "pallas", zh: "智神星", en: "Pallas", type: "小行星", parent: "sun",
    diameterKm: 513, massKg: 2.11e20, density: 2.92, tempK: null,
    rotationDays: 0.3256, orbitalPeriodDays: 1686.0, eccentricity: 0.231, inclinationDeg: 34.84,
    axialTiltDeg: null, moons: 0, moonsTotal: 0, moonsModelled: 0, color: "#b8b0a0", color2: "#7d7566",
    flattening: null, axesKm: null, ring: null, textureKind: "procedural", textureGenerator: "rockNoise", textureSeed: 1688393174, accuracy: "近似轨道（相位仅供参考）", source: SOURCES.jplSbdbPending, updated: "2026-10-31",
    elements: { a: 2.773, e: 0.231, i: 34.84, Om: 173.1, w: 310.0, M0: 200.0, periodDays: 1686.0, epochJd: 2451545.0 },
    perihelionAU: 2.132, aphelionAU: 3.414, uncertainty: "轨道根数为近似值，未接入 SBDB 轨道解；观测弧长与不确定性未知" }),
  body({ id: "eros", zh: "爱神星", en: "Eros", type: "小行星", parent: "sun",
    diameterKm: 17, massKg: 6.69e15, density: 2.67, tempK: null,
    rotationDays: 0.219, orbitalPeriodDays: 643.1, eccentricity: 0.223, inclinationDeg: 10.83,
    axialTiltDeg: null, moons: 0, moonsTotal: 0, moonsModelled: 0, color: "#c0a880", color2: "#8a6f48",
    flattening: null, axesKm: null, ring: null, textureKind: "procedural", textureGenerator: "rockNoise", textureSeed: 1235119448, accuracy: "近似轨道（相位仅供参考）", source: SOURCES.jplSbdbPending, updated: "2026-10-31",
    elements: { a: 1.458, e: 0.223, i: 10.83, Om: 304.3, w: 178.8, M0: 60.0, periodDays: 643.1, epochJd: 2451545.0 },
    perihelionAU: 1.133, aphelionAU: 1.783, uncertainty: "轨道根数为近似值，未接入 SBDB 轨道解；观测弧长与不确定性未知" }),
  body({ id: "halley", zh: "哈雷彗星", en: "1P/Halley", type: "彗星", parent: "sun",
    diameterKm: 11, massKg: null, density: null, tempK: null,
    rotationDays: null, orbitalPeriodDays: 27540, eccentricity: 0.967, inclinationDeg: 162.3,
    axialTiltDeg: null, moons: 0, moonsTotal: 0, moonsModelled: 0, color: "#cfd8e0", color2: "#7d8894",
    flattening: null, axesKm: null, ring: null, textureKind: "procedural", textureGenerator: "rockNoise", textureSeed: 2233027428, accuracy: "近似轨道（由近日点时刻推算相位）", source: SOURCES.jplSbdbPending, updated: "2026-10-31",
    elements: { a: 17.834, e: 0.967, i: 162.3, Om: 58.42, w: 111.33, M0: 0, periodDays: 27540, epochJd: 2446469.5 },
    perihelionAU: 0.586, aphelionAU: 35.08, uncertainty: "近日点：1986-02-09（上一次），下一次约 2061 年；轨道解日期与不确定性未接入 SBDB，显示为未知" }),
  body({ id: "67p", zh: "67P/丘留莫夫-格拉西缅科", en: "67P/Churyumov-Gerasimenko", type: "彗星", parent: "sun",
    diameterKm: 4, massKg: null, density: null, tempK: null,
    rotationDays: null, orbitalPeriodDays: 2352, eccentricity: 0.641, inclinationDeg: 7.04,
    axialTiltDeg: null, moons: 0, moonsTotal: 0, moonsModelled: 0, color: "#b8a888", color2: "#7d6f58",
    flattening: null, axesKm: null, ring: null, textureKind: "procedural", textureGenerator: "rockNoise", textureSeed: 3332965598, accuracy: "近似轨道（由近日点时刻推算相位）", source: SOURCES.jplSbdbPending, updated: "2026-10-31",
    elements: { a: 3.463, e: 0.641, i: 7.04, Om: 50.14, w: 12.7, M0: 0, periodDays: 2352, epochJd: 2459521.5 },
    perihelionAU: 1.243, aphelionAU: 5.683, uncertainty: "近日点：2021-11-02（参考）；轨道解日期与不确定性未接入 SBDB，显示为未知" }),
];

// Moons: simplified Keplerian around parent. phaseDeg is an arbitrary epoch
// phase (J2000) — positions are illustrative, not a lunar/planetary theory.
// The UI labels satellite positions as simplified.
export const MOONS = [
  { id: "moon", zh: "月球", en: "Moon", parent: "earth", diameterKm: 3474, massKg: 7.342e22, density: 3.34, tempK: null, rotationDays: 27.32, orbitalPeriodDays: 27.322, eccentricity: 0.0549, inclinationDeg: 5.145, axialTiltDeg: 1.54, color: "#c8c8c8", color2: "#8a8a8a", source: SOURCES.jplSats, updated: "2026-10-31", accuracy: null, textureKind: "procedural", textureGenerator: "rockNoise", textureSeed: 4052004416, moon: { aKm: 384400, e: 0.0549, i: 5.145, Om: 125.08, w: 318.15, periodDays: 27.322, phaseDeg: 218.32 } },
  { id: "phobos", zh: "火卫一", en: "Phobos", parent: "mars", diameterKm: 22, massKg: 1.07e16, density: 1.88, tempK: null, rotationDays: 0.319, orbitalPeriodDays: 0.319, eccentricity: 0.015, inclinationDeg: 1.08, axialTiltDeg: null, color: "#a08068", color2: "#6e5544", source: SOURCES.jplSats, updated: "2026-10-31", accuracy: null, textureKind: "procedural", textureGenerator: "rockNoise", textureSeed: 2266502646, moon: { aKm: 9376, e: 0.015, i: 1.08, Om: 0, w: 0, periodDays: 0.319, phaseDeg: 10 } },
  { id: "deimos", zh: "火卫二", en: "Deimos", parent: "mars", diameterKm: 12, massKg: 1.48e15, density: 1.47, tempK: null, rotationDays: 1.263, orbitalPeriodDays: 1.263, eccentricity: 0.0003, inclinationDeg: 1.79, axialTiltDeg: null, color: "#b09888", color2: "#7d6a5a", source: SOURCES.jplSats, updated: "2026-10-31", accuracy: null, textureKind: "procedural", textureGenerator: "rockNoise", textureSeed: 897527606, moon: { aKm: 23463, e: 0.0003, i: 1.79, Om: 0, w: 0, periodDays: 1.263, phaseDeg: 200 } },
  { id: "io", zh: "木卫一", en: "Io", parent: "jupiter", diameterKm: 3643, massKg: 8.93e22, density: 3.53, tempK: null, rotationDays: 1.769, orbitalPeriodDays: 1.769, eccentricity: 0.004, inclinationDeg: 0.05, axialTiltDeg: null, color: "#e8d878", color2: "#b89a3a", source: SOURCES.jplSats, updated: "2026-10-31", accuracy: null, textureKind: "procedural", textureGenerator: "rockNoise", textureSeed: 1110998065, moon: { aKm: 421700, e: 0.004, i: 0.05, Om: 0, w: 0, periodDays: 1.769, phaseDeg: 40 } },
  { id: "europa", zh: "木卫二", en: "Europa", parent: "jupiter", diameterKm: 3122, massKg: 4.80e22, density: 3.01, tempK: null, rotationDays: 3.551, orbitalPeriodDays: 3.551, eccentricity: 0.009, inclinationDeg: 0.47, axialTiltDeg: null, color: "#d8e0e8", color2: "#9aa8b8", source: SOURCES.jplSats, updated: "2026-10-31", accuracy: null, textureKind: "procedural", textureGenerator: "rockNoise", textureSeed: 3909556347, moon: { aKm: 671000, e: 0.009, i: 0.47, Om: 0, w: 0, periodDays: 3.551, phaseDeg: 130 } },
  { id: "ganymede", zh: "木卫三", en: "Ganymede", parent: "jupiter", diameterKm: 5268, massKg: 1.48e23, density: 1.94, tempK: null, rotationDays: 7.155, orbitalPeriodDays: 7.155, eccentricity: 0.001, inclinationDeg: 0.20, axialTiltDeg: null, color: "#a89888", color2: "#6e6256", source: SOURCES.jplSats, updated: "2026-10-31", accuracy: null, textureKind: "procedural", textureGenerator: "rockNoise", textureSeed: 655730801, moon: { aKm: 1070400, e: 0.001, i: 0.20, Om: 0, w: 0, periodDays: 7.155, phaseDeg: 220 } },
  { id: "callisto", zh: "木卫四", en: "Callisto", parent: "jupiter", diameterKm: 4821, massKg: 1.08e23, density: 1.83, tempK: null, rotationDays: 16.689, orbitalPeriodDays: 16.689, eccentricity: 0.007, inclinationDeg: 0.19, axialTiltDeg: null, color: "#7d7a72", color2: "#4f4d48", source: SOURCES.jplSats, updated: "2026-10-31", accuracy: null, textureKind: "procedural", textureGenerator: "rockNoise", textureSeed: 2598425016, moon: { aKm: 1882700, e: 0.007, i: 0.19, Om: 0, w: 0, periodDays: 16.689, phaseDeg: 310 } },
  { id: "enceladus", zh: "土卫二", en: "Enceladus", parent: "saturn", diameterKm: 504, massKg: 1.08e20, density: 1.61, tempK: null, rotationDays: 1.370, orbitalPeriodDays: 1.370, eccentricity: 0.005, inclinationDeg: 0.01, axialTiltDeg: null, color: "#e8f0f8", color2: "#b8c8d8", source: SOURCES.jplSats, updated: "2026-10-31", accuracy: null, textureKind: "procedural", textureGenerator: "rockNoise", textureSeed: 3243510223, moon: { aKm: 237948, e: 0.005, i: 0.01, Om: 0, w: 0, periodDays: 1.370, phaseDeg: 80 } },
  { id: "tethys", zh: "土卫三", en: "Tethys", parent: "saturn", diameterKm: 1062, massKg: 6.17e20, density: 0.98, tempK: null, rotationDays: 1.888, orbitalPeriodDays: 1.888, eccentricity: 0.000, inclinationDeg: 1.09, axialTiltDeg: null, color: "#d8d8d8", color2: "#a0a0a0", source: SOURCES.jplSats, updated: "2026-10-31", accuracy: null, textureKind: "procedural", textureGenerator: "rockNoise", textureSeed: 814011634, moon: { aKm: 294619, e: 0.0, i: 1.09, Om: 0, w: 0, periodDays: 1.888, phaseDeg: 160 } },
  { id: "dione", zh: "土卫四", en: "Dione", parent: "saturn", diameterKm: 1123, massKg: 1.10e21, density: 1.48, tempK: null, rotationDays: 2.737, orbitalPeriodDays: 2.737, eccentricity: 0.002, inclinationDeg: 0.02, axialTiltDeg: null, color: "#c8c0b8", color2: "#8f887e", source: SOURCES.jplSats, updated: "2026-10-31", accuracy: null, textureKind: "procedural", textureGenerator: "rockNoise", textureSeed: 318040582, moon: { aKm: 377396, e: 0.002, i: 0.02, Om: 0, w: 0, periodDays: 2.737, phaseDeg: 250 } },
  { id: "rhea", zh: "土卫五", en: "Rhea", parent: "saturn", diameterKm: 1527, massKg: 2.31e21, density: 1.24, tempK: null, rotationDays: 4.518, orbitalPeriodDays: 4.518, eccentricity: 0.001, inclinationDeg: 0.35, axialTiltDeg: null, color: "#d0d0d0", color2: "#9a9a9a", source: SOURCES.jplSats, updated: "2026-10-31", accuracy: null, textureKind: "procedural", textureGenerator: "rockNoise", textureSeed: 1502101541, moon: { aKm: 527108, e: 0.001, i: 0.35, Om: 0, w: 0, periodDays: 4.518, phaseDeg: 20 } },
  { id: "titan", zh: "土卫六", en: "Titan", parent: "saturn", diameterKm: 5149, massKg: 1.35e23, density: 1.88, tempK: null, rotationDays: 15.945, orbitalPeriodDays: 15.945, eccentricity: 0.029, inclinationDeg: 0.33, axialTiltDeg: null, color: "#e0a858", color2: "#a87830", source: SOURCES.jplSats, updated: "2026-10-31", accuracy: null, textureKind: "procedural", textureGenerator: "rockNoise", textureSeed: 2139480409, moon: { aKm: 1221870, e: 0.029, i: 0.33, Om: 0, w: 0, periodDays: 15.945, phaseDeg: 300 } },
  { id: "iapetus", zh: "土卫八", en: "Iapetus", parent: "saturn", diameterKm: 1469, massKg: 1.81e21, density: 1.09, tempK: null, rotationDays: 79.33, orbitalPeriodDays: 79.33, eccentricity: 0.028, inclinationDeg: 7.57, axialTiltDeg: null, color: "#a89878", color2: "#6e6048", source: SOURCES.jplSats, updated: "2026-10-31", accuracy: null, textureKind: "procedural", textureGenerator: "rockNoise", textureSeed: 819466880, moon: { aKm: 3560820, e: 0.028, i: 7.57, Om: 0, w: 0, periodDays: 79.33, phaseDeg: 120 } },
  { id: "miranda", zh: "天卫五", en: "Miranda", parent: "uranus", diameterKm: 472, massKg: 6.6e19, density: 1.20, tempK: null, rotationDays: 1.413, orbitalPeriodDays: 1.413, eccentricity: 0.001, inclinationDeg: 4.22, axialTiltDeg: null, color: "#c8c8c8", color2: "#8f8f8f", source: SOURCES.jplSats, updated: "2026-10-31", accuracy: null, textureKind: "procedural", textureGenerator: "rockNoise", textureSeed: 1891824975, moon: { aKm: 129390, e: 0.001, i: 4.22, Om: 0, w: 0, periodDays: 1.413, phaseDeg: 60 } },
  { id: "ariel", zh: "天卫一", en: "Ariel", parent: "uranus", diameterKm: 1158, massKg: 1.35e21, density: 1.59, tempK: null, rotationDays: 2.520, orbitalPeriodDays: 2.520, eccentricity: 0.001, inclinationDeg: 0.26, axialTiltDeg: null, color: "#d0d0d0", color2: "#9a9a9a", source: SOURCES.jplSats, updated: "2026-10-31", accuracy: null, textureKind: "procedural", textureGenerator: "rockNoise", textureSeed: 627815704, moon: { aKm: 190900, e: 0.001, i: 0.26, Om: 0, w: 0, periodDays: 2.520, phaseDeg: 180 } },
  { id: "umbriel", zh: "天卫二", en: "Umbriel", parent: "uranus", diameterKm: 1169, massKg: 1.17e21, density: 1.39, tempK: null, rotationDays: 4.144, orbitalPeriodDays: 4.144, eccentricity: 0.004, inclinationDeg: 0.21, axialTiltDeg: null, color: "#8a8a8a", color2: "#5a5a5a", source: SOURCES.jplSats, updated: "2026-10-31", accuracy: null, textureKind: "procedural", textureGenerator: "rockNoise", textureSeed: 1379656563, moon: { aKm: 266300, e: 0.004, i: 0.21, Om: 0, w: 0, periodDays: 4.144, phaseDeg: 270 } },
  { id: "titania", zh: "天卫三", en: "Titania", parent: "uranus", diameterKm: 1578, massKg: 3.53e21, density: 1.71, tempK: null, rotationDays: 8.706, orbitalPeriodDays: 8.706, eccentricity: 0.001, inclinationDeg: 0.34, axialTiltDeg: null, color: "#c0a898", color2: "#8a7260", source: SOURCES.jplSats, updated: "2026-10-31", accuracy: null, textureKind: "procedural", textureGenerator: "rockNoise", textureSeed: 1587205475, moon: { aKm: 435910, e: 0.001, i: 0.34, Om: 0, w: 0, periodDays: 8.706, phaseDeg: 30 } },
  { id: "oberon", zh: "天卫四", en: "Oberon", parent: "uranus", diameterKm: 1523, massKg: 3.01e21, density: 1.63, tempK: null, rotationDays: 13.463, orbitalPeriodDays: 13.463, eccentricity: 0.001, inclinationDeg: 0.10, axialTiltDeg: null, color: "#b8a090", color2: "#7d6a58", source: SOURCES.jplSats, updated: "2026-10-31", accuracy: null, textureKind: "procedural", textureGenerator: "rockNoise", textureSeed: 2870919614, moon: { aKm: 583520, e: 0.001, i: 0.10, Om: 0, w: 0, periodDays: 13.463, phaseDeg: 210 } },
  { id: "triton", zh: "海卫一", en: "Triton", parent: "neptune", diameterKm: 2707, massKg: 2.14e22, density: 2.06, tempK: null, rotationDays: -5.877, orbitalPeriodDays: 5.877, eccentricity: 0.000, inclinationDeg: 156.9, axialTiltDeg: null, color: "#d8e0e8", color2: "#a0b0c0", source: SOURCES.jplSats, updated: "2026-10-31", accuracy: null, textureKind: "procedural", textureGenerator: "rockNoise", textureSeed: 4069337719, moon: { aKm: 354760, e: 0.0, i: 156.9, Om: 0, w: 0, periodDays: 5.877, phaseDeg: 90 } },
  { id: "proteus", zh: "海卫二", en: "Proteus", parent: "neptune", diameterKm: 420, massKg: 5.0e19, density: 1.30, tempK: null, rotationDays: 1.122, orbitalPeriodDays: 1.122, eccentricity: 0.000, inclinationDeg: 0.04, axialTiltDeg: null, color: "#8a8a8a", color2: "#5a5a5a", source: SOURCES.jplSats, updated: "2026-10-31", accuracy: null, textureKind: "procedural", textureGenerator: "rockNoise", textureSeed: 1202148371, moon: { aKm: 117647, e: 0.0, i: 0.04, Om: 0, w: 0, periodDays: 1.122, phaseDeg: 150 } },
  { id: "charon", zh: "冥卫一", en: "Charon", parent: "pluto", diameterKm: 1212, massKg: 1.59e21, density: 1.70, tempK: null, rotationDays: 6.387, orbitalPeriodDays: 6.387, eccentricity: 0.000, inclinationDeg: 0.0, axialTiltDeg: null, color: "#b8b0a8", color2: "#7d756e", source: SOURCES.jplSats, updated: "2026-10-31", accuracy: null, textureKind: "procedural", textureGenerator: "rockNoise", textureSeed: 3585419720, moon: { aKm: 19596, e: 0.0, i: 0.0, Om: 0, w: 0, periodDays: 6.387, phaseDeg: 45 } },
];

// [MODEL] Shape-tier helpers (render.js + UI panel share these).
// Kinds (contract section 5): sphere | oblate (flattening) | triaxial
// (axesKm) | irregular (low-poly nucleus/asteroid, exact shape schematic).
// Comets and asteroids are irregular by category; every other body uses
// flattening/axesKm when present and falls back to a sphere otherwise.
export function shapeKindFor(b) {
  if (b.type === "彗星" || b.type === "小行星") return "irregular";
  if (Array.isArray(b.axesKm) && b.axesKm.length === 3) return "triaxial";
  if (typeof b.flattening === "number") return "oblate";
  return "sphere";
}
// True when the body is drawn as a sphere ONLY because no shape parameters
// exist. The panel must then show "形状未知，按球体示意" (contract section 5).
// The Sun is a genuine sphere, not a fallback; irregular bodies are a
// deliberate tier, not a fallback either.
export function shapeFallbackFor(b) {
  if (b.id === "sun") return false;
  return shapeKindFor(b) === "sphere" && b.flattening == null && b.axesKm == null;
}

export const ALL_BODIES = [...BODIES, ...MOONS.map(m => ({ ...m, type: "卫星" }))];
export function findBody(id) { return ALL_BODIES.find(b => b.id === id); }
export function moonsOf(parentId) { return MOONS.filter(m => m.parent === parentId); }
