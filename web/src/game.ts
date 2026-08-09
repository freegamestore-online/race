import kaplay from "kaplay";
import type { KAPLAYCtx } from "kaplay";
import { runMenu } from "./scenes/menu";
import { runPlay } from "./scenes/play";
import { runGameOver } from "./scenes/gameover";

export type K = KAPLAYCtx;

export const VW = 800;
export const VH = 600;

export function startGame(
  canvas: HTMLCanvasElement,
  onScore: (n: number) => void
): () => void {
  const k = kaplay({
    canvas,
    width: VW,
    height: VH,
    letterbox: true,
    background: [10, 10, 15],
    global: false,
    pixelDensity: Math.min(window.devicePixelRatio || 1, 2),
  }) as K;

  k.scene("menu", () => runMenu(k, onScore));
  k.scene("play", (opts?: { day?: number; score?: number }) =>
    runPlay(k, onScore, opts?.day ?? 1, opts?.score ?? 0)
  );
  k.scene("over", (finalScore: number) => runGameOver(k, finalScore, onScore));

  k.go("menu");

  return () => k.quit();
}
