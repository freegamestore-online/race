import { GameShell, GameTopbar, useSound } from "@freegamestore/games";
import { useEffect, useRef, useState } from "react";
import { startGame } from "./game";
import { setMuted, setToggleHandler } from "./lib/audio";

// Keeps the game's Web Audio mute state in step with the platform topbar
// Mute button, and routes the in-game SOUND button through the same toggle.
function SoundBridge() {
  const { muted, toggle } = useSound();
  useEffect(() => {
    setMuted(muted);
  }, [muted]);
  useEffect(() => {
    setToggleHandler(toggle);
  }, [toggle]);
  return null;
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const stop = startGame(canvas, setScore);
    return stop;
  }, []);

  return (
    <GameShell topbar={<GameTopbar title="Dead City" score={score} />}>
      <SoundBridge />
      <canvas ref={canvasRef} className="w-full h-full block touch-none" />
    </GameShell>
  );
}
