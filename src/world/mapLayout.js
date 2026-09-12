// Original, compact cartoon-MOBA layout. Nothing here copies a real game's map.
export const MAP_SIZE = 86;
export const HALF_MAP = MAP_SIZE / 2;

export const BASES = Object.freeze({
  light: { x: -32, z: -29, title: 'Солнечный сад', color: 0x67dcf0, glow: 0xa6f5ff },
  dark: { x: 32, z: 29, title: 'Терновая цитадель', color: 0xf06c74, glow: 0xffaf8e },
});

export const RIVER = [
  { x: -43, z: 18 }, { x: -31, z: 14 }, { x: -18, z: 10 }, { x: -5, z: 6 },
  { x: 8, z: 1 }, { x: 22, z: -7 }, { x: 33, z: -11 }, { x: 43, z: -16 },
];

export const LANES = [
  [ // Crown path
    { x: -32, z: -29 }, { x: -37, z: -10 }, { x: -29, z: 7 }, { x: -13, z: 19 }, { x: 7, z: 25 }, { x: 22, z: 30 }, { x: 32, z: 29 },
  ],
  [ // Sunstone path, meets the river at one shallow ford
    { x: -32, z: -29 }, { x: -19, z: -17 }, { x: -8, z: -6 }, { x: 3, z: 3 }, { x: 16, z: 15 }, { x: 32, z: 29 },
  ],
  [ // Orchard path
    { x: -32, z: -29 }, { x: -13, z: -32 }, { x: 4, z: -24 }, { x: 16, z: -10 }, { x: 25, z: 8 }, { x: 32, z: 29 },
  ],
];

export const FORD = { x: 1, z: 2.2, angle: -0.72 };

// Planned forest rooms; trees are generated on an intentional grid, not scattered globally.
export const GROVES = [
  { x: -30, z: 27, radiusX: 8, radiusZ: 8, kind: 'light' },
  { x: -30, z: 1, radiusX: 7, radiusZ: 9, kind: 'light' },
  { x: -6, z: 31, radiusX: 8, radiusZ: 7, kind: 'light' },
  { x: -8, z: -24, radiusX: 7, radiusZ: 5, kind: 'light' },
  { x: 30, z: -2, radiusX: 8, radiusZ: 8, kind: 'dark' },
  { x: 27, z: 20, radiusX: 7, radiusZ: 6, kind: 'dark' },
  { x: 11, z: -31, radiusX: 9, radiusZ: 6, kind: 'dark' },
  { x: 10, z: 28, radiusX: 6, radiusZ: 6, kind: 'dark' },
];

export const TOWERS = [
  { x: -34, z: -8, team: 'light' }, { x: -19, z: 20, team: 'light' }, { x: 12, z: 27, team: 'dark' },
  { x: -18, z: -12, team: 'light' }, { x: 19, z: 18, team: 'dark' },
  { x: -15, z: -31, team: 'light' }, { x: 21, z: -6, team: 'dark' },
];

export function distanceToSegment(x, z, a, b) {
  const dx = b.x - a.x; const dz = b.z - a.z; const lengthSq = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / lengthSq));
  return Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t));
}

export function distanceToPath(x, z, points) {
  let distance = Infinity;
  for (let i = 1; i < points.length; i++) distance = Math.min(distance, distanceToSegment(x, z, points[i - 1], points[i]));
  return distance;
}
