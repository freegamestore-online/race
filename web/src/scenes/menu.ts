import type { K } from "../game";
import { VW, VH } from "../game";
import { unlockAudio, setMuted, isMuted } from "../lib/audio";

export function runMenu(k: K, _onScore: (n: number) => void) {
  _onScore(0);

  let frame = 0;

  // Animated background — drifting city silhouette
  k.onDraw(() => {
    frame++;

    // Sky gradient effect
    const nightBlend = 0.7;
    k.drawRect({
      pos: k.vec2(0, 0),
      width: VW,
      height: VH,
      color: k.rgb(
        Math.floor(10 + 20 * (1 - nightBlend)),
        Math.floor(10 + 15 * (1 - nightBlend)),
        Math.floor(20 + 30 * (1 - nightBlend))
      ),
    });

    // Moon
    k.drawCircle({ pos: k.vec2(680, 80), radius: 36, color: k.rgb(220, 215, 200) });
    k.drawCircle({ pos: k.vec2(695, 72), radius: 34, color: k.rgb(10, 10, 20) });

    // Stars
    for (let i = 0; i < 40; i++) {
      const sx = ((i * 197 + 50) % VW);
      const sy = ((i * 113 + 20) % (VH * 0.55));
      const blink = Math.sin(frame * 0.04 + i) * 0.5 + 0.5;
      k.drawCircle({
        pos: k.vec2(sx, sy),
        radius: 1.2,
        color: k.rgb(200 + blink * 55, 200 + blink * 55, 220 + blink * 35),
        opacity: 0.6 + blink * 0.4,
      });
    }

    // City silhouette
    const buildings = [
      { x: 0, w: 60, h: 180 }, { x: 55, w: 80, h: 240 }, { x: 130, w: 50, h: 160 },
      { x: 175, w: 90, h: 300 }, { x: 260, w: 60, h: 200 }, { x: 315, w: 110, h: 260 },
      { x: 420, w: 70, h: 180 }, { x: 485, w: 55, h: 220 }, { x: 535, w: 100, h: 290 },
      { x: 630, w: 80, h: 200 }, { x: 705, w: 60, h: 160 }, { x: 760, w: 50, h: 240 },
    ];
    for (const b of buildings) {
      k.drawRect({
        pos: k.vec2(b.x, VH - b.h),
        width: b.w,
        height: b.h,
        color: k.rgb(18, 18, 25),
      });
      // Windows
      const wCols = Math.floor(b.w / 22);
      const wRows = Math.floor(b.h / 30);
      for (let r = 0; r < wRows; r++) {
        for (let c = 0; c < wCols; c++) {
          const lit = Math.sin(b.x * 0.3 + r * 2.1 + c * 1.7) > 0.2;
          if (!lit) continue;
          k.drawRect({
            pos: k.vec2(b.x + 6 + c * 22, VH - b.h + 8 + r * 30),
            width: 10,
            height: 8,
            color: k.rgb(255, 210, 100),
            opacity: 0.7 + Math.sin(frame * 0.02 + r + c) * 0.15,
          });
        }
      }
    }

    // Ground
    k.drawRect({ pos: k.vec2(0, VH - 40), width: VW, height: 40, color: k.rgb(15, 15, 20) });

    // Red fog / atmosphere
    k.drawRect({
      pos: k.vec2(0, VH - 120),
      width: VW,
      height: 80,
      color: k.rgb(80, 10, 10),
      opacity: 0.18 + Math.sin(frame * 0.015) * 0.06,
    });

    // Title
    k.drawText({
      text: "DEAD CITY",
      pos: k.vec2(VW / 2, 110),
      size: 72,
      font: "monospace",
      color: k.rgb(220, 30, 30),
      anchor: "center",
    });
    k.drawText({
      text: "DEAD CITY",
      pos: k.vec2(VW / 2 + 2, 112),
      size: 72,
      font: "monospace",
      color: k.rgb(60, 0, 0),
      anchor: "center",
      opacity: 0.5,
    });
    k.drawText({
      text: "ZOMBIE SURVIVAL",
      pos: k.vec2(VW / 2, 176),
      size: 22,
      font: "monospace",
      color: k.rgb(160, 160, 160),
      anchor: "center",
    });

    // Buttons
    const pulse = Math.sin(frame * 0.06) * 8;
    drawButton(k, VW / 2, 290 + pulse, "[ PLAY ]", k.rgb(220, 40, 40), 28);
    drawButton(k, VW / 2, 360, "[ HOW TO PLAY ]", k.rgb(140, 140, 160), 20);
    drawButton(k, VW / 2, 420, isMuted() ? "[ SOUND: OFF ]" : "[ SOUND: ON ]", k.rgb(100, 180, 100), 20);

    // Tagline
    k.drawText({
      text: "Survive the night. Every kill counts.",
      pos: k.vec2(VW / 2, VH - 60),
      size: 14,
      font: "monospace",
      color: k.rgb(100, 100, 110),
      anchor: "center",
    });
  });

  let showHelp = false;

  k.onMousePress(() => {
    const mp = k.mousePos();

    if (showHelp) {
      showHelp = false;
      return;
    }

    // Play button
    if (mp.x > VW / 2 - 100 && mp.x < VW / 2 + 100 && mp.y > 265 && mp.y < 315) {
      unlockAudio();
      k.go("play", { day: 1, score: 0 });
      return;
    }
    // How to play
    if (mp.x > VW / 2 - 120 && mp.x < VW / 2 + 120 && mp.y > 340 && mp.y < 385) {
      showHelp = !showHelp;
      return;
    }
    // Sound toggle
    if (mp.x > VW / 2 - 100 && mp.x < VW / 2 + 100 && mp.y > 400 && mp.y < 440) {
      setMuted(!isMuted());
      unlockAudio();
      return;
    }
  });

  k.onKeyPress("space", () => {
    unlockAudio();
    k.go("play", { day: 1, score: 0 });
  });
  k.onKeyPress("enter", () => {
    unlockAudio();
    k.go("play", { day: 1, score: 0 });
  });

  // Help overlay
  k.onDraw(() => {
    if (!showHelp) return;
    k.drawRect({ pos: k.vec2(80, 80), width: VW - 160, height: VH - 160, color: k.rgb(10, 10, 20), opacity: 0.97 });
    k.drawRect({ pos: k.vec2(80, 80), width: VW - 160, height: VH - 160, color: k.rgb(0, 0, 0), opacity: 0 });

    const lines = [
      "HOW TO PLAY",
      "",
      "WASD / Arrow Keys — Move",
      "Mouse — Aim",
      "Left Click — Shoot",
      "R — Reload",
      "1/2/3/4 — Switch Weapon",
      "E — Pick up items",
      "Shift — Sprint (uses stamina)",
      "ESC / P — Pause",
      "",
      "Survive zombie waves each day.",
      "Collect supplies & complete missions.",
      "Upgrade weapons to fight harder zombies.",
      "",
      "Click anywhere to close",
    ];
    lines.forEach((line, i) => {
      k.drawText({
        text: line,
        pos: k.vec2(VW / 2, 115 + i * 24),
        size: i === 0 ? 24 : 16,
        font: "monospace",
        color: i === 0 ? k.rgb(220, 40, 40) : k.rgb(200, 200, 210),
        anchor: "center",
      });
    });
  });
}

function drawButton(k: K, x: number, y: number, label: string, color: ReturnType<typeof k.rgb>, size: number) {
  k.drawText({ text: label, pos: k.vec2(x, y), size, font: "monospace", color, anchor: "center" });
}
