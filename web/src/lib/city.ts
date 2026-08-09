import type { K } from "../game";

export interface Building {
  x: number;
  y: number;
  w: number;
  h: number;
  floors: number;
  color: [number, number, number];
  roofColor: [number, number, number];
}

export interface CityMap {
  buildings: Building[];
  roads: { x: number; y: number; w: number; h: number }[];
  spawnPoints: { x: number; y: number }[];
  supplyPoints: { x: number; y: number; type: string }[];
  width: number;
  height: number;
}

const CITY_W = 2400;
const CITY_H = 2400;

function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export function generateCity(seed: number = 42): CityMap {
  const rand = rng(seed);
  const buildings: Building[] = [];
  const roads: { x: number; y: number; w: number; h: number }[] = [];
  const spawnPoints: { x: number; y: number }[] = [];
  const supplyPoints: { x: number; y: number; type: string }[] = [];

  const BLOCK = 280;
  const ROAD_W = 60;
  const cols = 7;
  const rows = 7;

  // Generate road grid
  for (let c = 0; c <= cols; c++) {
    roads.push({ x: c * (BLOCK + ROAD_W), y: 0, w: ROAD_W, h: CITY_H });
  }
  for (let r = 0; r <= rows; r++) {
    roads.push({ x: 0, y: r * (BLOCK + ROAD_W), w: CITY_W, h: ROAD_W });
  }

  const BCOLORS: [number, number, number][] = [
    [60, 65, 70],
    [70, 60, 55],
    [55, 65, 60],
    [65, 55, 70],
    [75, 70, 60],
    [50, 60, 75],
  ];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const bx = c * (BLOCK + ROAD_W) + ROAD_W;
      const by = r * (BLOCK + ROAD_W) + ROAD_W;
      const numB = Math.floor(rand() * 3) + 1;

      if (numB === 1) {
        const margin = 10;
        const bw = BLOCK - margin * 2;
        const bh = BLOCK - margin * 2;
        const floors = Math.floor(rand() * 6) + 2;
        const ci = Math.floor(rand() * BCOLORS.length);
        const bc = BCOLORS[ci] ?? [60, 65, 70];
        buildings.push({
          x: bx + margin,
          y: by + margin,
          w: bw,
          h: bh,
          floors,
          color: bc,
          roofColor: [bc[0] + 20, bc[1] + 20, bc[2] + 20],
        });
      } else {
        const subW = BLOCK / 2 - 15;
        const subH = BLOCK / 2 - 15;
        const positions = [
          { sx: bx + 5, sy: by + 5 },
          { sx: bx + BLOCK / 2 + 10, sy: by + 5 },
          { sx: bx + 5, sy: by + BLOCK / 2 + 10 },
          { sx: bx + BLOCK / 2 + 10, sy: by + BLOCK / 2 + 10 },
        ];
        const count = Math.min(numB + 1, 4);
        for (let i = 0; i < count; i++) {
          const p = positions[i];
          if (!p) continue;
          const floors = Math.floor(rand() * 4) + 1;
          const ci = Math.floor(rand() * BCOLORS.length);
          const bc = BCOLORS[ci] ?? [60, 65, 70];
          buildings.push({
            x: p.sx,
            y: p.sy,
            w: subW,
            h: subH,
            floors,
            color: bc,
            roofColor: [bc[0] + 20, bc[1] + 20, bc[2] + 20],
          });
        }
      }

      // Spawn points at road intersections
      if (c % 2 === 0 && r % 2 === 0) {
        spawnPoints.push({
          x: c * (BLOCK + ROAD_W) + ROAD_W / 2,
          y: r * (BLOCK + ROAD_W) + ROAD_W / 2,
        });
      }

      // Supply drops in some blocks
      if (rand() < 0.35) {
        const types = ["ammo", "health", "weapon", "upgrade"];
        const ti = Math.floor(rand() * types.length);
        supplyPoints.push({
          x: bx + BLOCK / 2,
          y: by + BLOCK / 2,
          type: types[ti] ?? "ammo",
        });
      }
    }
  }

  return { buildings, roads, spawnPoints, supplyPoints, width: CITY_W, height: CITY_H };
}

export function drawCity(k: K, city: CityMap, camX: number, camY: number, nightFactor: number) {
  const VW = 800;
  const VH = 600;
  const pad = 100;

  // Draw roads
  const roadColor = nightFactor > 0.5
    ? k.rgb(20, 20, 22)
    : k.rgb(35, 35, 40);
  const markColor = nightFactor > 0.5
    ? k.rgb(30, 30, 35)
    : k.rgb(55, 55, 60);

  for (const road of city.roads) {
    const sx = road.x - camX;
    const sy = road.y - camY;
    if (sx + road.w < -pad || sx > VW + pad) continue;
    if (sy + road.h < -pad || sy > VH + pad) continue;
    k.drawRect({ pos: k.vec2(sx, sy), width: road.w, height: road.h, color: roadColor });
    // Road markings
    if (road.w > road.h) {
      for (let mx = road.x; mx < road.x + road.w; mx += 80) {
        const msx = mx - camX;
        if (msx < -pad || msx > VW + pad) continue;
        k.drawRect({ pos: k.vec2(msx, sy + road.h / 2 - 2), width: 40, height: 4, color: markColor });
      }
    } else {
      for (let my = road.y; my < road.y + road.h; my += 80) {
        const msy = my - camY;
        if (msy < -pad || msy > VH + pad) continue;
        k.drawRect({ pos: k.vec2(sx + road.w / 2 - 2, msy), width: 4, height: 40, color: markColor });
      }
    }
  }

  // Draw buildings
  for (const b of city.buildings) {
    const sx = b.x - camX;
    const sy = b.y - camY;
    if (sx + b.w < -pad || sx > VW + pad) continue;
    if (sy + b.h < -pad || sy > VH + pad) continue;

    const dim = nightFactor > 0.5 ? 0.4 : 1.0;
    const bc = b.color;
    const wallColor = k.rgb(bc[0] * dim, bc[1] * dim, bc[2] * dim);
    k.drawRect({ pos: k.vec2(sx, sy), width: b.w, height: b.h, color: wallColor });

    // Windows
    const winRows = b.floors;
    const winCols = Math.floor(b.w / 28);
    for (let wr = 0; wr < winRows; wr++) {
      for (let wc = 0; wc < winCols; wc++) {
        const wx = sx + 8 + wc * 28;
        const wy = sy + 8 + wr * (b.h / winRows);
        const lit = nightFactor > 0.5 && Math.sin(b.x * 0.1 + wr * 3.7 + wc * 1.3) > 0.3;
        const winCol = lit
          ? k.rgb(255, 220, 120)
          : k.rgb(bc[0] * dim * 0.6, bc[1] * dim * 0.6, bc[2] * dim * 0.6);
        k.drawRect({ pos: k.vec2(wx, wy), width: 14, height: 10, color: winCol });
      }
    }

    // Roof
    const rc = b.roofColor;
    k.drawRect({
      pos: k.vec2(sx, sy - 6),
      width: b.w,
      height: 8,
      color: k.rgb(rc[0] * dim, rc[1] * dim, rc[2] * dim),
    });

    // Shadow
    k.drawRect({
      pos: k.vec2(sx + b.w, sy + 6),
      width: 8,
      height: b.h,
      color: k.rgb(0, 0, 0),
      opacity: 0.35,
    });
  }
}

export function isBuildingAt(city: CityMap, wx: number, wy: number, radius: number = 10): boolean {
  for (const b of city.buildings) {
    if (
      wx + radius > b.x &&
      wx - radius < b.x + b.w &&
      wy + radius > b.y &&
      wy - radius < b.y + b.h
    ) {
      return true;
    }
  }
  return false;
}

export function clampToCity(city: CityMap, x: number, y: number): { x: number; y: number } {
  return {
    x: Math.max(30, Math.min(city.width - 30, x)),
    y: Math.max(30, Math.min(city.height - 30, y)),
  };
}
