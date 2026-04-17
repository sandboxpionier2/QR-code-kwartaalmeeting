import { useEffect, useRef } from "react";

export function DuckMatrix({ duckSrc }: { duckSrc?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const setCanvasSize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    setCanvasSize();

    const chars = ["0", "DUCK"];
    const fontSize = 24;
    const columns = Math.floor(canvas.width / fontSize) + 1;
    const drops: number[] = [];
    const duckImg = new Image();

    duckImg.src = duckSrc ?? "/duck.png";

    for (let x = 0; x < columns; x++) {
      drops[x] = Math.random() * -100;
    }

    const draw = () => {
      ctx.fillStyle = "rgba(0, 21, 43, 0.1)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.font = `${fontSize}px monospace`;

      for (let i = 0; i < drops.length; i++) {
        const text = chars[Math.floor(Math.random() * chars.length)];

        if (text === "DUCK") {
          if (duckImg.complete && duckImg.naturalWidth > 0) {
            ctx.drawImage(
              duckImg,
              i * fontSize,
              drops[i] * fontSize - fontSize * 0.8,
              fontSize,
              fontSize
            );
          }
        } else {
          ctx.fillStyle = "#009BDF";
          ctx.fillText(text, i * fontSize, drops[i] * fontSize);
        }

        if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) {
          drops[i] = 0;
        }

        drops[i]++;
      }
    };

    const interval = setInterval(draw, 50);
    window.addEventListener("resize", setCanvasSize);

    return () => {
      clearInterval(interval);
      window.removeEventListener("resize", setCanvasSize);
    };
  }, [duckSrc]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 z-0 opacity-40 pointer-events-none"
    />
  );
}
