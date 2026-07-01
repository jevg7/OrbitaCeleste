import { useEffect, useRef, useState } from "react";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Play, Pause, RotateCcw, Sparkles } from "lucide-react";

// Canonical units: distances in AU, time in years. GM_sun = 4π².
const GM = 4 * Math.PI * Math.PI;

type PlanetSpec = {
  id: string;
  name: string;
  a: number;
  color: string;
  radiusPx: number;
};

const PLANETS: PlanetSpec[] = [
  { id: "mercury", name: "Mercurio", a: 0.39, color: "#b1b1b1", radiusPx: 3 },
  { id: "venus", name: "Venus", a: 0.72, color: "#e8c37a", radiusPx: 4 },
  { id: "earth", name: "Tierra", a: 1.0, color: "#4f9dff", radiusPx: 4 },
  { id: "mars", name: "Marte", a: 1.52, color: "#e06b4a", radiusPx: 4 },
  { id: "jupiter", name: "Júpiter", a: 5.2, color: "#d9a066", radiusPx: 9 },
  { id: "saturn", name: "Saturno", a: 9.58, color: "#e6d3a3", radiusPx: 8 },
  { id: "uranus", name: "Urano", a: 19.2, color: "#8ed6e0", radiusPx: 6 },
  { id: "neptune", name: "Neptuno", a: 30.05, color: "#4a6bd6", radiusPx: 6 },
];

type Body = {
  spec: PlanetSpec;
  x: number;
  y: number;
  vx: number;
  vy: number;
  trail: { x: number; y: number }[];
};

function makeBody(spec: PlanetSpec, angle = 0): Body {
  const v = Math.sqrt(GM / spec.a);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    spec,
    x: spec.a * cos,
    y: spec.a * sin,
    vx: -v * sin,
    vy: v * cos,
    trail: [],
  };
}

export function OrbitSimulation() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const bodiesRef = useRef<Body[]>([]);
  const runningRef = useRef(false);
  const [running, setRunning] = useState(false);
  const [activeIds, setActiveIds] = useState<string[]>([]);

  const step = (dt: number) => {
    for (const b of bodiesRef.current) {
      const r2 = b.x * b.x + b.y * b.y;
      const r = Math.sqrt(r2);
      const a = -GM / r2;
      b.vx += ((a * b.x) / r) * dt;
      b.vy += ((a * b.y) / r) * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.trail.push({ x: b.x, y: b.y });
      if (b.trail.length > 2000) b.trail.shift();
    }
  };

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const W = canvas.width;
    const H = canvas.height;
    ctx.fillStyle = "#05070f";
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = "rgba(255,255,255,0.4)";
    for (let i = 0; i < 80; i++) {
      const sx = (i * 97) % W;
      const sy = (i * 53) % H;
      ctx.fillRect(sx, sy, 1, 1);
    }

    const bodies = bodiesRef.current;
    const cx = W / 2;
    const cy = H / 2;
    const Rmax = Math.min(W, H) / 2 - 24;
    const maxA = Math.max(1.5, ...bodies.map((b) => b.spec.a));

    // Log radial mapping — used when inner + outer planets coexist so the
    // rocky worlds don't collapse into the Sun.
    const mixed =
      bodies.some((b) => b.spec.a > 3) && bodies.some((b) => b.spec.a < 3);
    const a0 = 0.15;
    const logDen = Math.log(1 + maxA / a0);
    const mapR = (r: number) =>
      mixed ? (Rmax * Math.log(1 + r / a0)) / logDen : (r / (maxA * 1.15)) * Rmax;

    const project = (x: number, y: number) => {
      const r = Math.hypot(x, y);
      if (r < 1e-9) return { px: cx, py: cy };
      const rd = mapR(r);
      return { px: cx + (x / r) * rd, py: cy - (y / r) * rd };
    };

    // Orbit guides
    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.lineWidth = 1;
    for (const b of bodies) {
      ctx.beginPath();
      ctx.arc(cx, cy, mapR(b.spec.a), 0, Math.PI * 2);
      ctx.stroke();
    }

    const sunCore = mixed ? 6 : 10;
    const sunGlow = mixed ? 14 : 26;
    const sunGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, sunGlow);
    sunGrad.addColorStop(0, "#fff2b0");
    sunGrad.addColorStop(0.3, "#ffcf4a");
    sunGrad.addColorStop(1, "rgba(255,140,0,0)");
    ctx.fillStyle = sunGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, sunGlow, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff5c2";
    ctx.beginPath();
    ctx.arc(cx, cy, sunCore, 0, Math.PI * 2);
    ctx.fill();

    for (const b of bodies) {
      ctx.strokeStyle = b.spec.color + "aa";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < b.trail.length; i++) {
        const { px, py } = project(b.trail[i].x, b.trail[i].y);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();

      const { px, py } = project(b.x, b.y);
      ctx.fillStyle = b.spec.color;
      ctx.beginPath();
      ctx.arc(px, py, Math.max(3, b.spec.radiusPx), 0, Math.PI * 2);
      ctx.fill();
    }
  };

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (t: number) => {
      const elapsed = Math.min(0.05, (t - last) / 1000);
      last = t;
      if (runningRef.current) {
        const bodies = bodiesRef.current;
        const minA = bodies.length
          ? Math.min(...bodies.map((b) => b.spec.a))
          : 1;
        const speed = 0.15 * Math.pow(minA, 1.5);
        const simTime = elapsed * speed;
        const substeps = 400;
        const dt = simTime / substeps;
        for (let i = 0; i < substeps; i++) step(dt);
      }
      draw();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const addPlanet = (spec: PlanetSpec) => {
    if (bodiesRef.current.some((b) => b.spec.id === spec.id)) return;
    bodiesRef.current = [
      ...bodiesRef.current,
      makeBody(spec, Math.random() * Math.PI * 2),
    ];
    setActiveIds((ids) => [...ids, spec.id]);
  };

  const addAll = () => {
    bodiesRef.current = PLANETS.map((p, i) =>
      makeBody(p, (i / PLANETS.length) * Math.PI * 2)
    );
    setActiveIds(PLANETS.map((p) => p.id));
  };

  const reset = () => {
    bodiesRef.current = [];
    setActiveIds([]);
    setRunning(false);
    runningRef.current = false;
  };

  const toggleRun = () => {
    const next = !runningRef.current;
    runningRef.current = next;
    setRunning(next);
  };

  return (
    <Card className="w-full max-w-6xl bg-slate-900/80 border-slate-800 p-6 flex flex-col gap-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-slate-100">Simulador del Sistema Solar</h1>
          <p className="text-slate-400">
            Integración newtoniana · escala radial logarítmica cuando se mezclan
            planetas internos y externos
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={toggleRun} disabled={activeIds.length === 0}>
            {running ? <Pause className="size-4" /> : <Play className="size-4" />}
            {running ? "Pausar" : "Iniciar"}
          </Button>
          <Button variant="secondary" onClick={reset}>
            <RotateCcw className="size-4" />
            Reiniciar
          </Button>
        </div>
      </div>

      <div className="grid md:grid-cols-[1fr_260px] gap-6">
        <div className="rounded-lg overflow-hidden border border-slate-800 bg-black">
          <canvas
            ref={canvasRef}
            width={800}
            height={640}
            className="w-full h-auto block"
          />
        </div>

        <div className="flex flex-col gap-3">
          <Button onClick={addAll} className="bg-indigo-600 hover:bg-indigo-500">
            <Sparkles className="size-4" />
            Agregar todos
          </Button>

          <div className="flex flex-col gap-2 mt-2">
            {PLANETS.map((p) => {
              const active = activeIds.includes(p.id);
              return (
                <button
                  key={p.id}
                  onClick={() => addPlanet(p)}
                  disabled={active}
                  className={`flex items-center justify-between px-3 py-2 rounded-md border transition ${
                    active
                      ? "bg-slate-800/40 border-slate-800 text-slate-500 cursor-not-allowed"
                      : "bg-slate-800 border-slate-700 hover:border-slate-500 text-slate-100"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span
                      className="inline-block rounded-full"
                      style={{ background: p.color, width: 12, height: 12 }}
                    />
                    {p.name}
                  </span>
                  <span className="text-slate-400">{p.a} AU</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </Card>
  );
}
