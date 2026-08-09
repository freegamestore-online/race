import type { K } from "../game";
import { VW, VH } from "../game";

export function runGameOver(k: K, finalScore: number, _onScore: (n: number) => void) {
  const best = parseInt(localStorage.getItem("deadcity_best") ?? "0", 10);
  if (finalScore > best) {
    localStorage.setItem("deadcity_best", String(finalScore));
  }
  const newBest = Math.max(finalScore, best);

  let frame = 0;

  k.onDraw(() => {
    frame++;

    // Dark red background
    k.drawRect({ pos: k.vec2(0, 0), width: VW, height: VH, color: k.rgb(8, 4, 4) });

    // Dripping blood effect
    for (let i = 0; i < 8; i++) {
      const dx = (i * 113 + 40) % VW;
      const dy = ((frame * (1 + (i % 3) * 0.5) + i * 70) % (VH + 80)) - 40;
      const dh = 20 + (i * 37) % 60;
      k.drawRect({
        pos: k.vec2(dx, dy),
        width: 6 + (i % 4) * 2,
        height: dh,
        color: k.rgb(140, 10, 10),
        opacity: 0.6,
      });
      k.drawCircle({
        pos: k.vec2(dx + 3, dy + dh),
        radius: 5 + (i % 3) * 2,
        color: k.rgb(120, 8, 8),
        opacity: 0.7,
      });
    }

    // Title
    k.drawText({
      text: "YOU DIED",
      pos: k.vec2(VW / 2 + 3, VH / 2 - 143),
      size: 64,
      font: "monospace",
      color: k.rgb(60, 0, 0),
      anchor: "center",
    });
    k.drawText({
      text: "YOU DIED",
      pos: k.vec2(VW / 2, VH / 2 - 145),
      size: 64,
      font: "monospace",
      color: k.rgb(220, 20, 20),
      anchor: "center",
    });

    // Stats panel
    k.drawRect({
      pos: k.vec2(VW / 2 - 180, VH / 2 - 90),
      width: 360,
      height: 180,
      color: k.rgb(20, 8, 8),
      opacity: 0.9,
    });
    k.drawRect({
      pos: k.vec2(VW / 2 - 180, VH / 2 - 90),
      width: 360,
      height: 3,
      color: k.rgb(180, 20, 20),
    });

    k.drawText({
      text: `SCORE: ${finalScore.toLocaleString()}`,
      pos: k.vec2(VW / 2, VH / 2 - 58),
      size: 28,
      font: "monospace",
      color: k.rgb(220, 180, 60),
      anchor: "center",
    });
    k.drawText({
      text: `BEST:  ${newBest.toLocaleString()}`,
      pos: k.vec2(VW / 2, VH / 2 - 20),
      size: 20,
      font: "monospace",
      color: finalScore >= best && finalScore > 0 ? k.rgb(80, 220, 80) : k.rgb(140, 140, 160),
      anchor: "center",
    });
    if (finalScore >= best && finalScore > 0) {
      k.drawText({
        text: "★ NEW BEST ★",
        pos: k.vec2(VW / 2, VH / 2 + 14),
        size: 18,
        font: "monospace",
        color: k.rgb(255, 200, 40),
        anchor: "center",
        opacity: 0.7 + Math.sin(frame * 0.1) * 0.3,
      });
    }

    // Buttons
    const playPulse = Math.sin(frame * 0.07) * 5;
    k.drawRect({
      pos: k.vec2(VW / 2 - 130, VH / 2 + 55 + playPulse),
      width: 260,
      height: 44,
      color: k.rgb(160, 20, 20),
      radius: 6,
    });
    k.drawText({
      text: "PLAY AGAIN",
      pos: k.vec2(VW / 2, VH / 2 + 77 + playPulse),
      size: 22,
      font: "monospace",
      color: k.rgb(255, 255, 255),
      anchor: "center",
    });

    k.drawRect({
      pos: k.vec2(VW / 2 - 130, VH / 2 + 115),
      width: 260,
      height: 44,
      color: k.rgb(30, 30, 40),
      radius: 6,
    });
    k.drawText({
      text: "MAIN MENU",
      pos: k.vec2(VW / 2, VH / 2 + 137),
      size: 22,
      font: "monospace",
      color: k.rgb(180, 180, 200),
      anchor: "center",
    });

    k.drawText({
      text: "SPACE / ENTER to play again",
      pos: k.vec2(VW / 2, VH - 30),
      size: 13,
      font: "monospace",
      color: k.rgb(80, 80, 100),
      anchor: "center",
    });
  });

  k.onMousePress(() => {
    const mp = k.mousePos();
    const playPulse = 0;
    if (mp.y > VH / 2 + 55 + playPulse && mp.y < VH / 2 + 99 + playPulse &&
        mp.x > VW / 2 - 130 && mp.x < VW / 2 + 130) {
      k.go("play", { day: 1, score: 0 });
      return;
    }
    if (mp.y > VH / 2 + 115 && mp.y < VH / 2 + 159 &&
        mp.x > VW / 2 - 130 && mp.x < VW / 2 + 130) {
      k.go("menu");
      return;
    }
  });

  k.onKeyPress("space", () => k.go("play", { day: 1, score: 0 }));
  k.onKeyPress("enter", () => k.go("play", { day: 1, score: 0 }));
  k.onKeyPress("escape", () => k.go("menu"));
}
