// Procedural audio using Web Audio API — no asset files needed.

let ctx: AudioContext | null = null;
let muted = true;
let masterGain: GainNode | null = null;

function getCtx(): AudioContext | null {
  if (muted) return null;
  if (!ctx) {
    ctx = new AudioContext();
    masterGain = ctx.createGain();
    masterGain.gain.value = 0.18;
    masterGain.connect(ctx.destination);
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

export function setMuted(m: boolean) {
  muted = m;
  if (masterGain) masterGain.gain.value = m ? 0 : 0.18;
}

export function isMuted() {
  return muted;
}

export function unlockAudio() {
  muted = false;
  getCtx();
}

function playTone(
  freq: number,
  duration: number,
  type: OscillatorType = "square",
  vol = 0.5,
  freqEnd?: number,
  delay = 0
) {
  const c = getCtx();
  if (!c || !masterGain) return;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, c.currentTime + delay);
  if (freqEnd !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(freqEnd, c.currentTime + delay + duration);
  }
  gain.gain.setValueAtTime(vol, c.currentTime + delay);
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + delay + duration);
  osc.connect(gain);
  gain.connect(masterGain);
  osc.start(c.currentTime + delay);
  osc.stop(c.currentTime + delay + duration + 0.01);
}

function playNoise(duration: number, vol = 0.3, filterFreq = 2000, delay = 0) {
  const c = getCtx();
  if (!c || !masterGain) return;
  const bufSize = Math.floor(c.sampleRate * duration);
  const buf = c.createBuffer(1, bufSize, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const filter = c.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = filterFreq;
  const gain = c.createGain();
  gain.gain.setValueAtTime(vol, c.currentTime + delay);
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + delay + duration);
  src.connect(filter);
  filter.connect(gain);
  gain.connect(masterGain);
  src.start(c.currentTime + delay);
}

export function sfxShoot(weaponId: string) {
  if (weaponId === "pistol") {
    playNoise(0.08, 0.6, 3000);
    playTone(200, 0.06, "sawtooth", 0.3, 80);
  } else if (weaponId === "shotgun") {
    playNoise(0.15, 0.9, 1500);
    playTone(120, 0.12, "sawtooth", 0.4, 60);
  } else if (weaponId === "rifle") {
    playNoise(0.06, 0.7, 4000);
    playTone(300, 0.05, "square", 0.2, 100);
  } else if (weaponId === "smg") {
    playNoise(0.04, 0.5, 3500);
    playTone(250, 0.04, "sawtooth", 0.15, 90);
  }
}

export function sfxReload() {
  playTone(400, 0.05, "square", 0.2);
  playTone(600, 0.05, "square", 0.2, undefined, 0.08);
  playTone(350, 0.08, "square", 0.15, undefined, 0.16);
}

export function sfxHit() {
  playNoise(0.06, 0.4, 800);
  playTone(150, 0.05, "sawtooth", 0.3, 60);
}

export function sfxZombieDie() {
  playTone(180, 0.12, "sawtooth", 0.5, 50);
  playNoise(0.1, 0.3, 600);
}

export function sfxZombieGroan() {
  playTone(100 + Math.random() * 40, 0.3, "sawtooth", 0.15, 70);
}

export function sfxPlayerHurt() {
  playTone(300, 0.08, "square", 0.4, 100);
  playNoise(0.1, 0.5, 500);
}

export function sfxPickup() {
  playTone(660, 0.06, "sine", 0.3);
  playTone(880, 0.06, "sine", 0.3, undefined, 0.07);
  playTone(1100, 0.08, "sine", 0.25, undefined, 0.14);
}

export function sfxMissionComplete() {
  const notes = [523, 659, 784, 1047];
  notes.forEach((n, i) => playTone(n, 0.15, "sine", 0.4, undefined, i * 0.12));
}

export function sfxExplosion() {
  playNoise(0.4, 1.0, 600);
  playTone(80, 0.3, "sawtooth", 0.6, 30);
}

export function sfxDayChange() {
  playTone(440, 0.2, "sine", 0.3);
  playTone(550, 0.2, "sine", 0.25, undefined, 0.25);
  playTone(660, 0.3, "sine", 0.2, undefined, 0.5);
}
