export interface WeaponDef {
  id: string;
  name: string;
  damage: number;
  fireRate: number; // shots per second
  range: number;
  ammo: number;
  maxAmmo: number;
  clipSize: number;
  reloadTime: number;
  spread: number;
  projectiles: number; // for shotgun
  color: [number, number, number];
  upgrades: number; // 0-3
}

export interface InventoryItem {
  id: string;
  name: string;
  count: number;
  icon: string;
}

export interface Mission {
  id: string;
  title: string;
  description: string;
  type: "kill" | "collect" | "survive" | "reach";
  target: number;
  progress: number;
  completed: boolean;
  reward: { score: number; ammo?: string; health?: number };
}

export interface GameState {
  health: number;
  maxHealth: number;
  stamina: number;
  maxStamina: number;
  score: number;
  day: number;
  kills: number;
  weapons: WeaponDef[];
  activeWeaponIdx: number;
  inventory: InventoryItem[];
  missions: Mission[];
  dayTime: number; // 0-1, 0=dawn, 0.5=noon, 1=dusk→night
  isNight: boolean;
  wave: number;
  zombiesLeft: number;
  paused: boolean;
}

export type ZombieType = "walker" | "runner" | "tank" | "spitter" | "exploder";

export interface ZombieDef {
  type: ZombieType;
  hp: number;
  speed: number;
  damage: number;
  size: number;
  color: [number, number, number];
  score: number;
  special?: string;
}

export const ZOMBIE_DEFS: Record<ZombieType, ZombieDef> = {
  walker: {
    type: "walker",
    hp: 60,
    speed: 55,
    damage: 10,
    size: 14,
    color: [100, 160, 80],
    score: 10,
  },
  runner: {
    type: "runner",
    hp: 35,
    speed: 130,
    damage: 8,
    size: 11,
    color: [180, 100, 60],
    score: 20,
  },
  tank: {
    type: "tank",
    hp: 300,
    speed: 32,
    damage: 25,
    size: 22,
    color: [80, 80, 140],
    score: 50,
  },
  spitter: {
    type: "spitter",
    hp: 50,
    speed: 48,
    damage: 6,
    size: 13,
    color: [140, 200, 60],
    score: 30,
    special: "ranged",
  },
  exploder: {
    type: "exploder",
    hp: 45,
    speed: 90,
    damage: 60,
    size: 15,
    color: [220, 120, 40],
    score: 40,
    special: "explode",
  },
};

export const WEAPONS: WeaponDef[] = [
  {
    id: "pistol",
    name: "Pistol",
    damage: 25,
    fireRate: 2.5,
    range: 220,
    ammo: 30,
    maxAmmo: 120,
    clipSize: 15,
    reloadTime: 1.2,
    spread: 0.05,
    projectiles: 1,
    color: [200, 200, 200],
    upgrades: 0,
  },
  {
    id: "shotgun",
    name: "Shotgun",
    damage: 18,
    fireRate: 0.9,
    range: 160,
    ammo: 24,
    maxAmmo: 60,
    clipSize: 8,
    reloadTime: 2.0,
    spread: 0.25,
    projectiles: 5,
    color: [180, 140, 80],
    upgrades: 0,
  },
  {
    id: "rifle",
    name: "Rifle",
    damage: 45,
    fireRate: 4,
    range: 340,
    ammo: 90,
    maxAmmo: 240,
    clipSize: 30,
    reloadTime: 2.2,
    spread: 0.02,
    projectiles: 1,
    color: [100, 160, 220],
    upgrades: 0,
  },
  {
    id: "smg",
    name: "SMG",
    damage: 15,
    fireRate: 8,
    range: 180,
    ammo: 120,
    maxAmmo: 300,
    clipSize: 40,
    reloadTime: 1.5,
    spread: 0.12,
    projectiles: 1,
    color: [220, 180, 60],
    upgrades: 0,
  },
];
