import type { K } from "../game";
import { VW, VH } from "../game";
import { generateCity, drawCity, isBuildingAt, clampToCity } from "../lib/city";
import type { CityMap } from "../lib/city";
import type { GameState, WeaponDef, Mission, ZombieType } from "../lib/types";
import { WEAPONS, ZOMBIE_DEFS } from "../lib/types";
import {
  sfxShoot, sfxReload, sfxHit, sfxZombieDie, sfxZombieGroan,
  sfxPlayerHurt, sfxPickup, sfxMissionComplete, sfxExplosion, sfxDayChange,
} from "../lib/audio";

// ─── constants ────────────────────────────────────────────────────────────────
const PLAYER_SPEED = 160;
const PLAYER_SPRINT = 260;
const STAMINA_DRAIN = 40;
const STAMINA_REGEN = 18;
const DAY_DURATION = 90; // seconds per day cycle
const NIGHT_START = 0.62;
const PLAYER_R = 12;
const BULLET_SPEED = 520;
const BULLET_LIFE = 0.9;
const PICKUP_RADIUS = 38;
const ZOMBIE_ATTACK_RANGE = 18;
const ZOMBIE_GROAN_INTERVAL = 3.5;

// ─── types ────────────────────────────────────────────────────────────────────
interface Bullet {
  x: number; y: number;
  vx: number; vy: number;
  life: number;
  damage: number;
  fromPlayer: boolean;
}

interface ZombieInst {
  id: number;
  type: ZombieType;
  x: number; y: number;
  hp: number;
  maxHp: number;
  speed: number;
  damage: number;
  size: number;
  color: [number, number, number];
  score: number;
  special: string;
  hitFlash: number;
  groanTimer: number;
  attackCooldown: number;
  spitCooldown: number;
  explodeArmed: boolean;
}

interface Supply {
  id: number;
  x: number; y: number;
  type: string;
  label: string;
  pulse: number;
}

interface FloatText {
  x: number; y: number;
  text: string;
  life: number;
  color: [number, number, number];
}

interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  life: number;
  maxLife: number;
  color: [number, number, number];
  size: number;
}

// ─── helpers ──────────────────────────────────────────────────────────────────
let _nextId = 1;
function nextId() { return _nextId++; }

function dist(ax: number, ay: number, bx: number, by: number) {
  return Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2);
}

function angle(ax: number, ay: number, bx: number, by: number) {
  return Math.atan2(by - ay, bx - ax);
}

function makeMissions(day: number): Mission[] {
  const base: Mission[] = [
    {
      id: "kill10", title: "First Blood",
      description: `Kill ${10 + day * 5} zombies`,
      type: "kill", target: 10 + day * 5, progress: 0, completed: false,
      reward: { score: 500 + day * 200 },
    },
    {
      id: "survive", title: "Nightwatch",
      description: "Survive until dawn",
      type: "survive", target: 1, progress: 0, completed: false,
      reward: { score: 800 + day * 300, health: 30 },
    },
    {
      id: "collect3", title: "Scavenger",
      description: "Collect 3 supply crates",
      type: "collect", target: 3, progress: 0, completed: false,
      reward: { score: 300, ammo: "pistol" },
    },
  ];
  if (day >= 2) {
    base.push({
      id: "killtank", title: "Tank Buster",
      description: "Kill a Tank zombie",
      type: "kill", target: 1, progress: 0, completed: false,
      reward: { score: 1000 },
    });
  }
  return base;
}

function spawnParticles(
  particles: Particle[], x: number, y: number, count: number,
  color: [number, number, number], speed = 80, life = 0.5
) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = speed * (0.4 + Math.random() * 0.6);
    particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life, maxLife: life, color, size: 2 + Math.random() * 3 });
  }
}

// ─── main scene ───────────────────────────────────────────────────────────────
export function runPlay(k: K, onScore: (n: number) => void, startDay: number, startScore: number) {
  const city = generateCity(42);

  // ── state ──
  const state: GameState = {
    health: 100, maxHealth: 100,
    stamina: 100, maxStamina: 100,
    score: startScore,
    day: startDay,
    kills: 0,
    weapons: [{ ...WEAPONS[0]! }],
    activeWeaponIdx: 0,
    inventory: [],
    missions: makeMissions(startDay),
    dayTime: 0.1,
    isNight: false,
    wave: 0,
    zombiesLeft: 0,
    paused: false,
  };

  // Player position (world coords)
  let px = city.width / 2;
  let py = city.height / 2;
  // Camera
  let camX = px - VW / 2;
  let camY = py - VH / 2;

  let bullets: Bullet[] = [];
  let zombies: ZombieInst[] = [];
  let supplies: Supply[] = [];
  let floatTexts: FloatText[] = [];
  let particles: Particle[] = [];

  let fireCooldown = 0;
  let reloading = false;
  let reloadTimer = 0;
  let waveTimer = 0;
  let waveActive = false;
  let waveAnnounce = 0;
  let dayTimer = 0;
  let nightTransitionMsg = 0;
  let dayTransitionMsg = 0;
  let lastNight = false;
  let totalTime = 0;
  let zombieSpawnTimer = 0;
  let zombiesToSpawn = 0;
  let spawnQueue: ZombieType[] = [];
  let survivalMissionDone = false;
  let collectCount = 0;
  let tankKilled = false;
  let notifMsg = "";
  let notifTimer = 0;
  let upgradeMenuOpen = false;
  let upgradeWeaponIdx = 0;
  let pauseFrame = 0;

  // Seed initial supplies
  for (const sp of city.supplyPoints) {
    const types = ["ammo", "health", "weapon", "upgrade"];
    supplies.push({
      id: nextId(), x: sp.x, y: sp.y,
      type: sp.type, label: sp.type.toUpperCase(),
      pulse: Math.random() * Math.PI * 2,
    });
  }

  function getWeapon(): WeaponDef {
    return state.weapons[state.activeWeaponIdx] ?? state.weapons[0]!;
  }

  function addScore(n: number) {
    state.score += n;
    onScore(state.score);
  }

  function showNotif(msg: string, duration = 2.5) {
    notifMsg = msg;
    notifTimer = duration;
  }

  function addFloat(x: number, y: number, text: string, color: [number, number, number] = [255, 255, 255]) {
    floatTexts.push({ x, y, text, life: 1.2, color });
  }

  function checkMissions() {
    for (const m of state.missions) {
      if (m.completed) continue;
      if (m.progress >= m.target) {
        m.completed = true;
        addScore(m.reward.score);
        if (m.reward.health) state.health = Math.min(state.maxHealth, state.health + m.reward.health);
        sfxMissionComplete();
        showNotif(`✓ Mission: ${m.title} (+${m.reward.score} pts)`, 3);
      }
    }
  }

  function startWave(waveNum: number) {
    waveActive = true;
    waveAnnounce = 3;
    state.wave = waveNum;

    const difficulty = waveNum + (state.day - 1) * 3;
    const count = 8 + difficulty * 3;
    state.zombiesLeft = count;
    zombiesToSpawn = count;
    spawnQueue = [];

    for (let i = 0; i < count; i++) {
      let type: ZombieType = "walker";
      const r = Math.random();
      if (difficulty >= 2 && r < 0.15) type = "runner";
      else if (difficulty >= 3 && r < 0.25) type = "runner";
      else if (difficulty >= 4 && r < 0.08) type = "tank";
      else if (difficulty >= 5 && r < 0.12) type = "spitter";
      else if (difficulty >= 6 && r < 0.10) type = "exploder";
      spawnQueue.push(type);
    }
    zombieSpawnTimer = 0;
    waveTimer = 0;
  }

  function spawnZombie(type: ZombieType) {
    const def = ZOMBIE_DEFS[type];
    const sp = city.spawnPoints[Math.floor(Math.random() * city.spawnPoints.length)];
    if (!sp) return;
    // Offset randomly
    const ox = (Math.random() - 0.5) * 200;
    const oy = (Math.random() - 0.5) * 200;
    const zx = Math.max(20, Math.min(city.width - 20, sp.x + ox));
    const zy = Math.max(20, Math.min(city.height - 20, sp.y + oy));

    const nightBoost = state.isNight ? 1.25 : 1.0;
    const dayBoost = 1 + (state.day - 1) * 0.12;

    zombies.push({
      id: nextId(),
      type,
      x: zx, y: zy,
      hp: def.hp * dayBoost,
      maxHp: def.hp * dayBoost,
      speed: def.speed * nightBoost * dayBoost,
      damage: def.damage * dayBoost,
      size: def.size,
      color: def.color,
      score: def.score,
      special: def.special ?? "",
      hitFlash: 0,
      groanTimer: Math.random() * ZOMBIE_GROAN_INTERVAL,
      attackCooldown: 0,
      spitCooldown: 0,
      explodeArmed: false,
    });
  }

  function fireWeapon(mx: number, my: number) {
    const w = getWeapon();
    if (reloading) return;
    if (fireCooldown > 0) return;
    if (w.ammo <= 0) {
      startReload();
      return;
    }

    const worldMx = mx + camX;
    const worldMy = my + camY;
    const a = angle(px, py, worldMx, worldMy);

    for (let p = 0; p < w.projectiles; p++) {
      const spread = (Math.random() - 0.5) * w.spread * 2;
      const ba = a + spread;
      bullets.push({
        x: px, y: py,
        vx: Math.cos(ba) * BULLET_SPEED,
        vy: Math.sin(ba) * BULLET_SPEED,
        life: BULLET_LIFE * (w.range / 220),
        damage: w.damage * (1 + w.upgrades * 0.25),
        fromPlayer: true,
      });
    }

    w.ammo--;
    fireCooldown = 1 / w.fireRate;
    sfxShoot(w.id);

    if (w.ammo <= 0) startReload();
  }

  function startReload() {
    if (reloading) return;
    const w = getWeapon();
    if (w.ammo >= w.clipSize) return;
    reloading = true;
    reloadTimer = w.reloadTime;
    sfxReload();
    showNotif("Reloading...", w.reloadTime);
  }

  function pickupSupply(s: Supply) {
    sfxPickup();
    supplies = supplies.filter(x => x.id !== s.id);
    collectCount++;

    // Update collect mission
    const cm = state.missions.find(m => m.id === "collect3");
    if (cm && !cm.completed) { cm.progress++; checkMissions(); }

    switch (s.type) {
      case "health": {
        const heal = 30 + Math.floor(Math.random() * 20);
        state.health = Math.min(state.maxHealth, state.health + heal);
        addFloat(px - camX, py - camY - 20, `+${heal} HP`, [80, 220, 80]);
        showNotif(`+${heal} Health`);
        break;
      }
      case "ammo": {
        const w = getWeapon();
        const refill = w.clipSize * 2;
        w.ammo = Math.min(w.maxAmmo, w.ammo + refill);
        addFloat(px - camX, py - camY - 20, `+AMMO`, [220, 200, 60]);
        showNotif(`Ammo refilled`);
        break;
      }
      case "weapon": {
        const available = WEAPONS.filter(ww => !state.weapons.find(sw => sw.id === ww.id));
        if (available.length > 0) {
          const newW = { ...available[Math.floor(Math.random() * available.length)]! };
          state.weapons.push(newW);
          showNotif(`Found: ${newW.name}!`);
          addFloat(px - camX, py - camY - 20, `NEW: ${newW.name}`, [100, 180, 255]);
        } else {
          // All weapons owned — give ammo instead
          const w = getWeapon();
          w.ammo = Math.min(w.maxAmmo, w.ammo + w.clipSize * 3);
          addFloat(px - camX, py - camY - 20, `+AMMO`, [220, 200, 60]);
          showNotif("Ammo refilled");
        }
        break;
      }
      case "upgrade": {
        upgradeMenuOpen = true;
        upgradeWeaponIdx = state.activeWeaponIdx;
        showNotif("Weapon upgrade available! Press U to open.");
        break;
      }
    }
  }

  function applyUpgrade(idx: number) {
    const w = state.weapons[idx];
    if (!w || w.upgrades >= 3) return;
    w.upgrades++;
    w.damage *= 1.25;
    w.fireRate *= 1.1;
    w.range *= 1.1;
    upgradeMenuOpen = false;
    addScore(0);
    showNotif(`${w.name} upgraded to level ${w.upgrades}!`);
    sfxMissionComplete();
  }

  // ── input ──
  let mouseX = VW / 2;
  let mouseY = VH / 2;
  let mouseDown = false;

  k.onMouseMove(mp => { mouseX = mp.x; mouseY = mp.y; });
  k.onMousePress("left", () => {
    mouseDown = true;
    if (upgradeMenuOpen) {
      // Check upgrade button clicks
      for (let i = 0; i < state.weapons.length; i++) {
        const bx = VW / 2 - 160 + i * 90;
        const by = VH / 2 + 40;
        if (mouseX > bx && mouseX < bx + 80 && mouseY > by && mouseY < by + 44) {
          applyUpgrade(i);
          return;
        }
      }
      upgradeMenuOpen = false;
      return;
    }
    if (!state.paused) fireWeapon(mouseX, mouseY);
  });
  k.onMouseRelease("left", () => { mouseDown = false; });

  k.onKeyPress("escape", () => { state.paused = !state.paused; upgradeMenuOpen = false; });
  k.onKeyPress("p", () => { state.paused = !state.paused; upgradeMenuOpen = false; });
  k.onKeyPress("r", () => { if (!state.paused) startReload(); });
  k.onKeyPress("e", () => {
    if (state.paused) return;
    // Pick up nearest supply
    let nearest: Supply | null = null;
    let nearDist = PICKUP_RADIUS;
    for (const s of supplies) {
      const d = dist(px, py, s.x, s.y);
      if (d < nearDist) { nearDist = d; nearest = s; }
    }
    if (nearest) pickupSupply(nearest);
  });
  k.onKeyPress("u", () => { if (upgradeMenuOpen) upgradeMenuOpen = false; });
  k.onKeyPress("1", () => { if (state.weapons.length >= 1) { state.activeWeaponIdx = 0; reloading = false; } });
  k.onKeyPress("2", () => { if (state.weapons.length >= 2) { state.activeWeaponIdx = 1; reloading = false; } });
  k.onKeyPress("3", () => { if (state.weapons.length >= 3) { state.activeWeaponIdx = 2; reloading = false; } });
  k.onKeyPress("4", () => { if (state.weapons.length >= 4) { state.activeWeaponIdx = 3; reloading = false; } });

  // Touch controls
  k.onTouchStart((touch) => {
    const tp = touch;
    if (tp.x < VW * 0.35 && tp.y > VH * 0.55) return; // left joystick area
    if (!state.paused && !upgradeMenuOpen) fireWeapon(tp.x, tp.y);
  });

  // ── update ──
  k.onUpdate(() => {
    if (state.paused || upgradeMenuOpen) { pauseFrame++; return; }

    const dt = k.dt();
    totalTime += dt;
    fireCooldown = Math.max(0, fireCooldown - dt);
    notifTimer = Math.max(0, notifTimer - dt);
    waveAnnounce = Math.max(0, waveAnnounce - dt);
    nightTransitionMsg = Math.max(0, nightTransitionMsg - dt);
    dayTransitionMsg = Math.max(0, dayTransitionMsg - dt);

    // Auto-fire
    if (mouseDown && !reloading && !state.paused) fireWeapon(mouseX, mouseY);

    // ── reload ──
    if (reloading) {
      reloadTimer -= dt;
      if (reloadTimer <= 0) {
        reloading = false;
        const w = getWeapon();
        const need = w.clipSize - w.ammo;
        const take = Math.min(need, w.maxAmmo - w.ammo);
        w.ammo = Math.min(w.clipSize, w.ammo + take);
      }
    }

    // ── day/night cycle ──
    dayTimer += dt;
    state.dayTime = (dayTimer % DAY_DURATION) / DAY_DURATION;
    const wasNight = lastNight;
    state.isNight = state.dayTime >= NIGHT_START;
    lastNight = state.isNight;

    if (!wasNight && state.isNight) {
      nightTransitionMsg = 4;
      sfxDayChange();
      // Spawn extra zombies at night
      if (!waveActive) startWave(state.wave + 1);
    }
    if (wasNight && !state.isNight) {
      state.day++;
      dayTransitionMsg = 4;
      sfxDayChange();
      state.missions = makeMissions(state.day);
      survivalMissionDone = false;
      tankKilled = false;
      addScore(500 * state.day);
      showNotif(`Day ${state.day} begins! +${500 * state.day} pts`);
    }

    // Survive mission
    if (!state.isNight && !survivalMissionDone) {
      const sm = state.missions.find(m => m.id === "survive");
      if (sm && !sm.completed) { sm.progress = 1; checkMissions(); survivalMissionDone = true; }
    }

    // ── wave management ──
    if (!waveActive && zombies.length === 0) {
      waveTimer += dt;
      if (waveTimer >= 5) startWave(state.wave + 1);
    }

    if (waveActive && zombiesToSpawn > 0) {
      zombieSpawnTimer -= dt;
      if (zombieSpawnTimer <= 0) {
        const type = spawnQueue.shift();
        if (type) spawnZombie(type);
        zombiesToSpawn--;
        zombieSpawnTimer = 0.4 + Math.random() * 0.6;
      }
      if (zombiesToSpawn === 0 && spawnQueue.length === 0) waveActive = false;
    }

    // ── player movement ──
    let dx = 0, dy = 0;
    const sprint = k.isKeyDown("shift") && state.stamina > 0;
    const speed = sprint ? PLAYER_SPRINT : PLAYER_SPEED;

    if (k.isKeyDown("a") || k.isKeyDown("left")) dx -= 1;
    if (k.isKeyDown("d") || k.isKeyDown("right")) dx += 1;
    if (k.isKeyDown("w") || k.isKeyDown("up")) dy -= 1;
    if (k.isKeyDown("s") || k.isKeyDown("down")) dy += 1;

    if (dx !== 0 || dy !== 0) {
      const len = Math.sqrt(dx * dx + dy * dy);
      dx /= len; dy /= len;
      const nx = px + dx * speed * dt;
      const ny = py + dy * speed * dt;
      const clamped = clampToCity(city, nx, ny);
      if (!isBuildingAt(city, clamped.x, py, PLAYER_R)) px = clamped.x;
      if (!isBuildingAt(city, px, clamped.y, PLAYER_R)) py = clamped.y;

      if (sprint) state.stamina = Math.max(0, state.stamina - STAMINA_DRAIN * dt);
    } else {
      state.stamina = Math.min(state.maxStamina, state.stamina + STAMINA_REGEN * dt);
    }

    // Camera follows player
    camX = px - VW / 2;
    camY = py - VH / 2;

    // ── bullets ──
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i]!;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;

      if (b.life <= 0 || isBuildingAt(city, b.x, b.y, 4)) {
        spawnParticles(particles, b.x - camX, b.y - camY, 3, [200, 180, 100], 60, 0.3);
        bullets.splice(i, 1);
        continue;
      }

      if (b.fromPlayer) {
        for (let j = zombies.length - 1; j >= 0; j--) {
          const z = zombies[j]!;
          if (dist(b.x, b.y, z.x, z.y) < z.size + 4) {
            z.hp -= b.damage;
            z.hitFlash = 0.15;
            sfxHit();
            spawnParticles(particles, z.x - camX, z.y - camY, 5, [180, 30, 30], 80, 0.4);
            addFloat(z.x - camX, z.y - camY - 16, `-${Math.round(b.damage)}`, [255, 80, 80]);
            bullets.splice(i, 1);

            if (z.hp <= 0) killZombie(z, j);
            break;
          }
        }
      } else {
        // Enemy bullet hits player
        if (dist(b.x, b.y, px, py) < PLAYER_R + 4) {
          state.health -= b.damage;
          sfxPlayerHurt();
          spawnParticles(particles, px - camX, py - camY, 8, [220, 40, 40], 90, 0.5);
          addFloat(px - camX, py - camY - 20, `-${Math.round(b.damage)} HP`, [255, 60, 60]);
          bullets.splice(i, 1);
          if (state.health <= 0) { k.go("over", state.score); return; }
        }
      }
    }

    // ── zombies ──
    for (let i = zombies.length - 1; i >= 0; i--) {
      const z = zombies[i]!;
      z.hitFlash = Math.max(0, z.hitFlash - dt);
      z.attackCooldown = Math.max(0, z.attackCooldown - dt);
      z.spitCooldown = Math.max(0, z.spitCooldown - dt);
      z.groanTimer -= dt;
      if (z.groanTimer <= 0) {
        const d = dist(z.x, z.y, px, py);
        if (d < 400) sfxZombieGroan();
        z.groanTimer = ZOMBIE_GROAN_INTERVAL + Math.random() * 2;
      }

      const d = dist(z.x, z.y, px, py);

      // Spitter: shoot at player
      if (z.type === "spitter" && z.spitCooldown <= 0 && d < 280) {
        const a = angle(z.x, z.y, px, py);
        bullets.push({
          x: z.x, y: z.y,
          vx: Math.cos(a) * 200,
          vy: Math.sin(a) * 200,
          life: 1.5,
          damage: z.damage,
          fromPlayer: false,
        });
        z.spitCooldown = 2.5;
      }

      // Exploder: arm when close
      if (z.type === "exploder" && d < 60 && !z.explodeArmed) z.explodeArmed = true;
      if (z.explodeArmed && d < 30) {
        // BOOM
        sfxExplosion();
        spawnParticles(particles, z.x - camX, z.y - camY, 30, [255, 120, 30], 200, 0.8);
        state.health -= z.damage;
        sfxPlayerHurt();
        addFloat(px - camX, py - camY - 20, `BOOM! -${Math.round(z.damage)}`, [255, 120, 30]);
        killZombie(z, i);
        if (state.health <= 0) { k.go("over", state.score); return; }
        continue;
      }

      // Move toward player (avoid buildings)
      if (d > ZOMBIE_ATTACK_RANGE) {
        const a = angle(z.x, z.y, px, py);
        let mx = Math.cos(a) * z.speed * dt;
        let my = Math.sin(a) * z.speed * dt;

        // Simple wall avoidance: try perpendicular if blocked
        const nx = z.x + mx;
        const ny = z.y + my;
        if (isBuildingAt(city, nx, ny, z.size)) {
          if (!isBuildingAt(city, nx, z.y, z.size)) { my = 0; }
          else if (!isBuildingAt(city, z.x, ny, z.size)) { mx = 0; }
          else { mx = -mx; my = -my; }
        }
        const nc = clampToCity(city, z.x + mx, z.y + my);
        z.x = nc.x; z.y = nc.y;
      } else if (z.attackCooldown <= 0) {
        // Attack player
        state.health -= z.damage;
        sfxPlayerHurt();
        spawnParticles(particles, px - camX, py - camY, 6, [220, 40, 40], 80, 0.4);
        addFloat(px - camX, py - camY - 20, `-${Math.round(z.damage)} HP`, [255, 60, 60]);
        z.attackCooldown = 1.2;
        if (state.health <= 0) { k.go("over", state.score); return; }
      }
    }

    // ── particles ──
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]!;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.92;
      p.vy *= 0.92;
      p.life -= dt;
      if (p.life <= 0) particles.splice(i, 1);
    }

    // ── float texts ──
    for (let i = floatTexts.length - 1; i >= 0; i--) {
      const f = floatTexts[i]!;
      f.y -= 28 * dt;
      f.life -= dt;
      if (f.life <= 0) floatTexts.splice(i, 1);
    }

    // ── supply auto-pickup when very close ──
    for (let i = supplies.length - 1; i >= 0; i--) {
      const s = supplies[i]!;
      s.pulse += dt * 3;
      if (dist(px, py, s.x, s.y) < 22) pickupSupply(s);
    }
  });

  function killZombie(z: ZombieInst, idx: number) {
    sfxZombieDie();
    addScore(z.score);
    state.kills++;
    state.zombiesLeft = Math.max(0, state.zombiesLeft - 1);
    spawnParticles(particles, z.x - camX, z.y - camY, 12, z.color, 100, 0.6);
    addFloat(z.x - camX, z.y - camY - 20, `+${z.score}`, [255, 200, 60]);
    zombies.splice(idx, 1);

    // Kill missions
    const km = state.missions.find(m => m.id === "kill10");
    if (km && !km.completed) { km.progress++; checkMissions(); }
    if (z.type === "tank" && !tankKilled) {
      tankKilled = true;
      const tm = state.missions.find(m => m.id === "killtank");
      if (tm && !tm.completed) { tm.progress = 1; checkMissions(); }
    }

    // Chance to drop supply
    if (Math.random() < 0.12) {
      const types = ["ammo", "health"];
      const t = types[Math.floor(Math.random() * types.length)] ?? "ammo";
      supplies.push({ id: nextId(), x: z.x, y: z.y, type: t, label: t.toUpperCase(), pulse: 0 });
    }
  }

  // ── draw ──
  k.onDraw(() => {
    // Sky / atmosphere
    const nt = state.isNight
      ? 1.0
      : state.dayTime < 0.15
      ? state.dayTime / 0.15
      : state.dayTime > 0.55
      ? (state.dayTime - 0.55) / 0.1
      : 0;
    const nightFactor = Math.min(1, nt);

    const skyR = Math.floor(10 + (50 - 10) * (1 - nightFactor));
    const skyG = Math.floor(10 + (40 - 10) * (1 - nightFactor));
    const skyB = Math.floor(20 + (60 - 20) * (1 - nightFactor));
    k.drawRect({ pos: k.vec2(0, 0), width: VW, height: VH, color: k.rgb(skyR, skyG, skyB) });

    // Ground
    const groundBright = Math.floor(25 + 20 * (1 - nightFactor));
    k.drawRect({ pos: k.vec2(0, 0), width: VW, height: VH, color: k.rgb(groundBright, groundBright + 3, groundBright) });

    // City
    drawCity(k, city, camX, camY, nightFactor);

    // Supplies
    for (const s of supplies) {
      const sx = s.x - camX;
      const sy = s.y - camY;
      if (sx < -40 || sx > VW + 40 || sy < -40 || sy > VH + 40) continue;
      const pulse = Math.sin(s.pulse) * 4;
      let col = k.rgb(60, 200, 60);
      if (s.type === "health") col = k.rgb(220, 60, 60);
      else if (s.type === "ammo") col = k.rgb(220, 200, 60);
      else if (s.type === "weapon") col = k.rgb(60, 120, 220);
      else if (s.type === "upgrade") col = k.rgb(180, 60, 220);
      k.drawRect({ pos: k.vec2(sx - 12, sy - 12 + pulse), width: 24, height: 24, color: col, radius: 4 });
      k.drawText({ text: s.label[0] ?? "?", pos: k.vec2(sx, sy + pulse), size: 14, font: "monospace", color: k.rgb(255, 255, 255), anchor: "center" });
      // Pickup hint
      if (dist(px, py, s.x, s.y) < PICKUP_RADIUS) {
        k.drawText({ text: "[E]", pos: k.vec2(sx, sy - 22 + pulse), size: 11, font: "monospace", color: k.rgb(255, 255, 200), anchor: "center" });
      }
    }

    // Bullets
    for (const b of bullets) {
      const bsx = b.x - camX;
      const bsy = b.y - camY;
      const col = b.fromPlayer ? k.rgb(255, 240, 100) : k.rgb(100, 220, 80);
      k.drawCircle({ pos: k.vec2(bsx, bsy), radius: b.fromPlayer ? 3 : 5, color: col });
    }

    // Zombies
    for (const z of zombies) {
      const zsx = z.x - camX;
      const zsy = z.y - camY;
      if (zsx < -60 || zsx > VW + 60 || zsy < -60 || zsy > VH + 60) continue;

      const flash = z.hitFlash > 0;
      const zc = flash ? k.rgb(255, 255, 255) : k.rgb(z.color[0], z.color[1], z.color[2]);

      // Shadow
      k.drawEllipse({ pos: k.vec2(zsx, zsy + z.size * 0.8), radiusX: z.size * 0.8, radiusY: z.size * 0.3, color: k.rgb(0, 0, 0), opacity: 0.3 });

      // Body
      k.drawCircle({ pos: k.vec2(zsx, zsy), radius: z.size, color: zc });

      // Eyes
      k.drawCircle({ pos: k.vec2(zsx - 4, zsy - 3), radius: 3, color: k.rgb(255, 30, 30) });
      k.drawCircle({ pos: k.vec2(zsx + 4, zsy - 3), radius: 3, color: k.rgb(255, 30, 30) });

      // Tank indicator
      if (z.type === "tank") {
        k.drawCircle({ pos: k.vec2(zsx, zsy), radius: z.size + 3, color: k.rgb(100, 100, 200), opacity: 0.3 });
      }
      if (z.type === "exploder" && z.explodeArmed) {
        k.drawCircle({ pos: k.vec2(zsx, zsy), radius: z.size + 4, color: k.rgb(255, 100, 0), opacity: 0.5 + Math.sin(totalTime * 10) * 0.3 });
      }

      // HP bar
      const hpFrac = z.hp / z.maxHp;
      k.drawRect({ pos: k.vec2(zsx - z.size, zsy - z.size - 8), width: z.size * 2, height: 4, color: k.rgb(60, 20, 20) });
      k.drawRect({ pos: k.vec2(zsx - z.size, zsy - z.size - 8), width: z.size * 2 * hpFrac, height: 4, color: k.rgb(220, 40, 40) });
    }

    // Player
    const psx = px - camX;
    const psy = py - camY;
    // Shadow
    k.drawEllipse({ pos: k.vec2(psx, psy + PLAYER_R * 0.7), radiusX: PLAYER_R * 0.9, radiusY: PLAYER_R * 0.3, color: k.rgb(0, 0, 0), opacity: 0.35 });
    // Body
    k.drawCircle({ pos: k.vec2(psx, psy), radius: PLAYER_R, color: k.rgb(60, 160, 220) });
    // Direction indicator (gun barrel)
    const aimA = angle(px, py, mouseX + camX, mouseY + camY);
    k.drawRect({
      pos: k.vec2(psx + Math.cos(aimA) * PLAYER_R, psy + Math.sin(aimA) * PLAYER_R),
      width: 14, height: 5,
      color: k.rgb(180, 180, 180),
      anchor: "left",
      angle: aimA,
    });

    // Particles
    for (const p of particles) {
      const alpha = p.life / p.maxLife;
      k.drawCircle({ pos: k.vec2(p.x, p.y), radius: p.size * alpha, color: k.rgb(p.color[0], p.color[1], p.color[2]), opacity: alpha });
    }

    // Float texts
    for (const f of floatTexts) {
      const alpha = Math.min(1, f.life);
      k.drawText({ text: f.text, pos: k.vec2(f.x, f.y), size: 14, font: "monospace", color: k.rgb(f.color[0], f.color[1], f.color[2]), opacity: alpha, anchor: "center" });
    }

    // Night overlay
    if (nightFactor > 0) {
      k.drawRect({ pos: k.vec2(0, 0), width: VW, height: VH, color: k.rgb(0, 0, 20), opacity: nightFactor * 0.55 });
      // Flashlight cone around player
      const flashR = 160 + Math.sin(totalTime * 1.5) * 8;
      k.drawCircle({ pos: k.vec2(psx, psy), radius: flashR, color: k.rgb(255, 240, 180), opacity: 0.07 });
    }

    // ── HUD ──
    drawHUD(k, state, reloading, reloadTimer, nightFactor, city);

    // Wave announce
    if (waveAnnounce > 0) {
      const alpha = Math.min(1, waveAnnounce);
      k.drawText({
        text: `WAVE ${state.wave}`,
        pos: k.vec2(VW / 2, VH / 2 - 40),
        size: 48, font: "monospace",
        color: k.rgb(220, 40, 40), opacity: alpha, anchor: "center",
      });
      k.drawText({
        text: `${state.zombiesLeft} zombies incoming!`,
        pos: k.vec2(VW / 2, VH / 2 + 10),
        size: 20, font: "monospace",
        color: k.rgb(255, 180, 60), opacity: alpha, anchor: "center",
      });
    }

    // Night/Day transition
    if (nightTransitionMsg > 0) {
      k.drawText({ text: "☽ NIGHT FALLS — STAY ALIVE", pos: k.vec2(VW / 2, 80), size: 22, font: "monospace", color: k.rgb(180, 100, 220), opacity: Math.min(1, nightTransitionMsg), anchor: "center" });
    }
    if (dayTransitionMsg > 0) {
      k.drawText({ text: `☀ DAY ${state.day} — YOU SURVIVED`, pos: k.vec2(VW / 2, 80), size: 22, font: "monospace", color: k.rgb(255, 220, 60), opacity: Math.min(1, dayTransitionMsg), anchor: "center" });
    }

    // Notification
    if (notifTimer > 0) {
      const alpha = Math.min(1, notifTimer);
      k.drawRect({ pos: k.vec2(VW / 2 - 200, VH - 100), width: 400, height: 36, color: k.rgb(10, 10, 20), opacity: alpha * 0.85, radius: 6 });
      k.drawText({ text: notifMsg, pos: k.vec2(VW / 2, VH - 82), size: 15, font: "monospace", color: k.rgb(220, 220, 100), opacity: alpha, anchor: "center" });
    }

    // Pause overlay
    if (state.paused) drawPause(k, pauseFrame);

    // Upgrade menu
    if (upgradeMenuOpen) drawUpgradeMenu(k, state);
  });

  // Resume / menu from pause
  k.onMousePress("left", () => {
    if (!state.paused) return;
    const mp = k.mousePos();
    if (mp.x > VW / 2 - 100 && mp.x < VW / 2 + 100 && mp.y > VH / 2 + 10 && mp.y < VH / 2 + 54) {
      state.paused = false;
    }
    if (mp.x > VW / 2 - 100 && mp.x < VW / 2 + 100 && mp.y > VH / 2 + 65 && mp.y < VH / 2 + 109) {
      k.go("menu");
    }
  });
}

// ─── HUD ──────────────────────────────────────────────────────────────────────
function drawHUD(k: K, state: GameState, reloading: boolean, reloadTimer: number, nightFactor: number, _city: CityMap) {
  const w = state.weapons[state.activeWeaponIdx];
  if (!w) return;

  // Top bar background
  k.drawRect({ pos: k.vec2(0, 0), width: 800, height: 52, color: k.rgb(0, 0, 0), opacity: 0.6 });

  // Health bar
  k.drawText({ text: "HP", pos: k.vec2(10, 10), size: 13, font: "monospace", color: k.rgb(180, 60, 60) });
  k.drawRect({ pos: k.vec2(36, 10), width: 130, height: 14, color: k.rgb(40, 10, 10), radius: 3 });
  const hpFrac = Math.max(0, state.health / state.maxHealth);
  const hpColor = hpFrac > 0.5 ? k.rgb(60, 200, 60) : hpFrac > 0.25 ? k.rgb(220, 180, 40) : k.rgb(220, 40, 40);
  k.drawRect({ pos: k.vec2(36, 10), width: 130 * hpFrac, height: 14, color: hpColor, radius: 3 });
  k.drawText({ text: `${Math.ceil(state.health)}`, pos: k.vec2(101, 17), size: 11, font: "monospace", color: k.rgb(255, 255, 255), anchor: "center" });

  // Stamina bar
  k.drawText({ text: "SP", pos: k.vec2(10, 28), size: 13, font: "monospace", color: k.rgb(60, 140, 220) });
  k.drawRect({ pos: k.vec2(36, 28), width: 130, height: 10, color: k.rgb(10, 20, 40), radius: 3 });
  k.drawRect({ pos: k.vec2(36, 28), width: 130 * (state.stamina / state.maxStamina), height: 10, color: k.rgb(60, 140, 220), radius: 3 });

  // Weapon info
  const reloadFrac = reloading ? 1 - reloadTimer / w.reloadTime : 1;
  k.drawText({ text: w.name + (w.upgrades > 0 ? ` +${w.upgrades}` : ""), pos: k.vec2(180, 8), size: 15, font: "monospace", color: k.rgb(220, 200, 100) });
  k.drawText({ text: reloading ? `RELOADING ${Math.floor(reloadFrac * 100)}%` : `${w.ammo} / ${w.maxAmmo}`, pos: k.vec2(180, 26), size: 13, font: "monospace", color: reloading ? k.rgb(220, 140, 40) : k.rgb(180, 180, 200) });
  if (reloading) {
    k.drawRect({ pos: k.vec2(180, 40), width: 100, height: 6, color: k.rgb(40, 30, 10), radius: 3 });
    k.drawRect({ pos: k.vec2(180, 40), width: 100 * reloadFrac, height: 6, color: k.rgb(220, 160, 40), radius: 3 });
  }

  // Weapon slots
  for (let i = 0; i < state.weapons.length; i++) {
    const sw = state.weapons[i]!;
    const active = i === state.activeWeaponIdx;
    const wx = 310 + i * 90;
    k.drawRect({ pos: k.vec2(wx, 6), width: 80, height: 38, color: active ? k.rgb(60, 40, 10) : k.rgb(20, 20, 25), radius: 4, opacity: active ? 1 : 0.7 });
    if (active) k.drawRect({ pos: k.vec2(wx, 6), width: 80, height: 3, color: k.rgb(220, 180, 40), radius: 2 });
    k.drawText({ text: `${i + 1} ${sw.name}`, pos: k.vec2(wx + 4, 12), size: 10, font: "monospace", color: active ? k.rgb(255, 220, 80) : k.rgb(140, 140, 160) });
    k.drawText({ text: `${sw.ammo}/${sw.clipSize}`, pos: k.vec2(wx + 4, 28), size: 10, font: "monospace", color: k.rgb(120, 120, 140) });
  }

  // Day/night + score
  const dayStr = state.isNight ? `☽ NIGHT  Day ${state.day}` : `☀ DAY ${state.day}`;
  const dayCol = state.isNight ? k.rgb(160, 100, 220) : k.rgb(255, 210, 60);
  k.drawText({ text: dayStr, pos: k.vec2(700, 8), size: 13, font: "monospace", color: dayCol, anchor: "right" });
  k.drawText({ text: `Score: ${state.score.toLocaleString()}`, pos: k.vec2(700, 24), size: 13, font: "monospace", color: k.rgb(180, 180, 200), anchor: "right" });
  k.drawText({ text: `Wave: ${state.wave}  Kills: ${state.kills}`, pos: k.vec2(700, 40), size: 11, font: "monospace", color: k.rgb(140, 140, 160), anchor: "right" });

  // Missions panel (right side, partial)
  k.drawRect({ pos: k.vec2(680, 60), width: 118, height: state.missions.length * 38 + 10, color: k.rgb(0, 0, 0), opacity: 0.55, radius: 4 });
  k.drawText({ text: "MISSIONS", pos: k.vec2(739, 65), size: 11, font: "monospace", color: k.rgb(180, 140, 60), anchor: "center" });
  state.missions.forEach((m, mi) => {
    const my = 80 + mi * 38;
    const col = m.completed ? k.rgb(60, 200, 60) : k.rgb(200, 200, 200);
    k.drawText({ text: (m.completed ? "✓ " : "○ ") + m.title, pos: k.vec2(686, my), size: 10, font: "monospace", color: col });
    if (!m.completed) {
      k.drawRect({ pos: k.vec2(686, my + 13), width: 106, height: 5, color: k.rgb(30, 30, 40), radius: 2 });
      k.drawRect({ pos: k.vec2(686, my + 13), width: 106 * Math.min(1, m.progress / m.target), height: 5, color: k.rgb(100, 180, 255), radius: 2 });
      k.drawText({ text: `${m.progress}/${m.target}`, pos: k.vec2(686, my + 22), size: 9, font: "monospace", color: k.rgb(120, 120, 160) });
    }
  });

  // Night warning vignette
  if (nightFactor > 0.3) {
    k.drawRect({ pos: k.vec2(0, 0), width: 800, height: 600, color: k.rgb(60, 0, 80), opacity: nightFactor * 0.08 });
  }

  // Controls hint (bottom left)
  k.drawText({ text: "WASD Move  Shift Sprint  R Reload  E Pickup  ESC Pause", pos: k.vec2(6, 590), size: 10, font: "monospace", color: k.rgb(80, 80, 100) });
}

// ─── Pause overlay ─────────────────────────────────────────────────────────────
function drawPause(k: K, frame: number) {
  k.drawRect({ pos: k.vec2(0, 0), width: VW, height: VH, color: k.rgb(0, 0, 0), opacity: 0.72 });
  k.drawText({ text: "PAUSED", pos: k.vec2(VW / 2, VH / 2 - 80), size: 48, font: "monospace", color: k.rgb(220, 220, 255), anchor: "center" });

  const resumePulse = Math.sin(frame * 0.08) * 4;
  k.drawRect({ pos: k.vec2(VW / 2 - 100, VH / 2 + 10 + resumePulse), width: 200, height: 44, color: k.rgb(40, 120, 40), radius: 6 });
  k.drawText({ text: "RESUME", pos: k.vec2(VW / 2, VH / 2 + 32 + resumePulse), size: 22, font: "monospace", color: k.rgb(255, 255, 255), anchor: "center" });

  k.drawRect({ pos: k.vec2(VW / 2 - 100, VH / 2 + 65), width: 200, height: 44, color: k.rgb(80, 30, 30), radius: 6 });
  k.drawText({ text: "MAIN MENU", pos: k.vec2(VW / 2, VH / 2 + 87), size: 22, font: "monospace", color: k.rgb(255, 255, 255), anchor: "center" });

  k.drawText({ text: "ESC / P to resume", pos: k.vec2(VW / 2, VH / 2 + 130), size: 14, font: "monospace", color: k.rgb(120, 120, 160), anchor: "center" });
}

// ─── Upgrade menu ──────────────────────────────────────────────────────────────
function drawUpgradeMenu(k: K, state: GameState) {
  k.drawRect({ pos: k.vec2(VW / 2 - 220, VH / 2 - 120), width: 440, height: 260, color: k.rgb(10, 10, 20), opacity: 0.96, radius: 8 });
  k.drawRect({ pos: k.vec2(VW / 2 - 220, VH / 2 - 120), width: 440, height: 4, color: k.rgb(180, 60, 220), radius: 2 });
  k.drawText({ text: "WEAPON UPGRADE", pos: k.vec2(VW / 2, VH / 2 - 100), size: 22, font: "monospace", color: k.rgb(180, 60, 220), anchor: "center" });
  k.drawText({ text: "Select a weapon to upgrade (max level 3):", pos: k.vec2(VW / 2, VH / 2 - 68), size: 13, font: "monospace", color: k.rgb(180, 180, 200), anchor: "center" });

  for (let i = 0; i < state.weapons.length; i++) {
    const w = state.weapons[i]!;
    const bx = VW / 2 - 160 + i * 90;
    const by = VH / 2 + 40;
    const canUp = w.upgrades < 3;
    k.drawRect({ pos: k.vec2(bx, by), width: 80, height: 44, color: canUp ? k.rgb(40, 20, 60) : k.rgb(20, 20, 30), radius: 6 });
    k.drawText({ text: w.name, pos: k.vec2(bx + 40, by + 10), size: 11, font: "monospace", color: canUp ? k.rgb(200, 160, 255) : k.rgb(80, 80, 100), anchor: "center" });
    k.drawText({ text: canUp ? `Lv ${w.upgrades} → ${w.upgrades + 1}` : "MAX", pos: k.vec2(bx + 40, by + 28), size: 11, font: "monospace", color: canUp ? k.rgb(255, 200, 80) : k.rgb(80, 200, 80), anchor: "center" });
  }
  k.drawText({ text: "Click a weapon button to upgrade  |  U to close", pos: k.vec2(VW / 2, VH / 2 + 105), size: 12, font: "monospace", color: k.rgb(100, 100, 140), anchor: "center" });
}
