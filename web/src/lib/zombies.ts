import type { K } from "../game";
import type { ZombieType } from "./types";
import { sfx } from "./audio";

export interface ZombieEntity {
  obj: ReturnType<K["add"]>;
  type: ZombieType;
  health: number;
  maxHealth: number;
  speed: number;
  damage: number;
  attackRate: number;
  lastAttack: number;
  lastGroan: number;
  groanInterval: number;
  isAlive: boolean;
  flashTimer: number;
}

export function spawnZombie(
  k: K,
  type: ZombieType,
  x: number,
  y: number,
  waveLevel: number
): ZombieEntity {
  const lvlScale = 1 + (waveLevel - 1) * 0.15;

  let color: Parameters<K["rgb"]>;
  let w: number, h: number, hp: number, spd: number, dmg: number, atkRate: number;

  switch (type) {
    case "walker":
      color = [60, 120, 60]; w = 18; h = 18;
      hp = Math.round(60 * lvlScale); spd = 55 + waveLevel * 3;
      dmg = Math.round(8 * lvlScale); atkRate = 1.2;
      break;
    case "runner":
      color = [180, 80, 80]; w = 14; h = 14;
      hp = Math.round(35 * lvlScale); spd = 110 + waveLevel * 5;
      dmg = Math.round(12 * lvlScale); atkRate = 0.8;
      break;
    case "brute":
      color = [80, 40, 120]; w = 28; h = 28;
      hp = Math.round(200 * lvlScale); spd = 35 + waveLevel * 2;
      dmg = Math.round(25 * lvlScale); atkRate = 2.0;
      break;
    case "spitter":
      color = [40, 140, 80]; w = 16; h = 16;
      hp = Math.round(45 * lvlScale); spd = 45 + waveLevel * 2;
      dmg = Math.round(6 * lvlScale); atkRate = 2.5;
      break;
    default:
      color = [60, 120, 60]; w = 18; h = 18;
      hp = 60; spd = 55; dmg = 8; atkRate = 1.2;
  }

  const obj = k.add([
    k.rect(w, h, { radius: type === "brute" ? 0 : 3 }),
    k.pos(x, y),
    k.color(color[0], color[1], color[2]),
    k.area({ shape: new k.Rect(k.vec2(0, 0), w, h) }),
    k.anchor("center"),
    k.z(5),
    "zombie",
    `zombie_${type}`,
  ]);

  return {
    obj, type,
    health: hp, maxHealth: hp,
    speed: spd, damage: dmg,
    attackRate: atkRate, lastAttack: 0,
    lastGroan: Math.random() * 3,
    groanInterval: 3 + Math.random() * 4,
    isAlive: true,
    flashTimer: 0,
  };
}

export function updateZombie(
  k: K,
  zombie: ZombieEntity,
  playerPos: { x: number; y: number },
  now: number,
  dt: number,
  onAttackPlayer: (dmg: number) => void,
  onDie: () => void
) {
  if (!zombie.isAlive) return;

  // Groan occasionally
  zombie.lastGroan += dt;
  if (zombie.lastGroan >= zombie.groanInterval) {
    zombie.lastGroan = 0;
    zombie.groanInterval = 3 + Math.random() * 4;
    const dx = playerPos.x - zombie.obj.pos.x;
    const dy = playerPos.y - zombie.obj.pos.y;
    if (Math.sqrt(dx * dx + dy * dy) < 300) sfx.zombieGroan();
  }

  // Flash on hit
  if (zombie.flashTimer > 0) {
    zombie.flashTimer -= dt;
    zombie.obj.color = k.rgb(255, 80, 80);
  } else {
    switch (zombie.type) {
      case "walker": zombie.obj.color = k.rgb(60, 120, 60); break;
      case "runner": zombie.obj.color = k.rgb(180, 80, 80); break;
      case "brute":  zombie.obj.color = k.rgb(80, 40, 120); break;
      case "spitter":zombie.obj.color = k.rgb(40, 140, 80); break;
    }
  }

  // Move toward player
  const dx = playerPos.x - zombie.obj.pos.x;
  const dy = playerPos.y - zombie.obj.pos.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist > 2) {
    const nx = dx / dist;
    const ny = dy / dist;
    zombie.obj.pos.x += nx * zombie.speed * dt;
    zombie.obj.pos.y += ny * zombie.speed * dt;
  }

  // Attack
  const attackRange = zombie.type === "brute" ? 28 : zombie.type === "spitter" ? 180 : 22;
  if (dist < attackRange && now - zombie.lastAttack > zombie.attackRate) {
    zombie.lastAttack = now;
    onAttackPlayer(zombie.damage);
  }
}

export function hitZombie(
  zombie: ZombieEntity,
  damage: number,
  onDie: () => void
) {
  if (!zombie.isAlive) return;
  zombie.health -= damage;
  zombie.flashTimer = 0.1;
  if (zombie.health <= 0) {
    zombie.isAlive = false;
    sfx.zombieDeath();
    k_destroy(zombie);
    onDie();
  }
}

// We keep a reference to k.destroy via a closure set at runtime
let k_destroy: (z: ZombieEntity) => void = () => {};
export function setDestroyFn(fn: (z: ZombieEntity) => void) {
  k_destroy = fn;
}
