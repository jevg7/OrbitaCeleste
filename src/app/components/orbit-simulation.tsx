import { useEffect, useMemo, useRef, useState } from "react";

// ============================================================
// CONFIGURACIÓN por defecto (Tierra alrededor del Sol).
// Se puede editar en vivo desde la UI.
// ============================================================
const DEFAULTS = {
  G: 6.6743e-11,          // Constante de Gravitación Universal [N·m²/kg²]
  m_central: 1.989e30,    // Masa del cuerpo central [kg] — Sol
  distancia_inicial: 1.496e11, // Distancia inicial [m] — 1 UA
  v_inicial: 29780,       // Velocidad orbital perpendicular [m/s]
  dt: 3600,               // Paso de integración [s] — 1 hora
  pasos_totales: 8760,    // Iteraciones — ~1 año terrestre
};

type Config = typeof DEFAULTS;

// Integración numérica: método de Euler explícito sobre la
// Ley de Gravitación Universal de Newton (F = G·M·m / r²).
// Trabajamos en 2D (plano XY): el cuerpo central está en el origen (0,0)
// y el cuerpo que orbita empieza en (distancia_inicial, 0) con velocidad
// perpendicular (0, v_inicial).
function simulate(cfg: Config) {
  const { G, m_central, distancia_inicial, v_inicial, dt, pasos_totales } = cfg;

  let x = distancia_inicial, y = 0;   // posición inicial [m]
  let vx = 0, vy = v_inicial;         // velocidad inicial [m/s]

  const xs = new Float64Array(pasos_totales);
  const ys = new Float64Array(pasos_totales);

  let maxR = distancia_inicial;

  for (let i = 0; i < pasos_totales; i++) {
    // 1) Distancia actual al cuerpo central (origen).
    const r = Math.sqrt(x * x + y * y);

    // 2) Magnitud de la aceleración gravitatoria: a = G·M / r².
    const a = (G * m_central) / (r * r);

    // 3) Componentes vectoriales apuntando al origen (signo negativo).
    const ax = -a * (x / r);
    const ay = -a * (y / r);

    // 4) Euler: v_f = v_0 + a·dt
    vx += ax * dt;
    vy += ay * dt;

    // 5) Euler: r_f = r_0 + v·dt
    x += vx * dt;
    y += vy * dt;

    xs[i] = x; ys[i] = y;
    const rr = Math.sqrt(x * x + y * y);
    if (rr > maxR) maxR = rr;
  }

  return { xs, ys, maxR };
}

export function OrbitSimulation() {
  const [cfg, setCfg] = useState<Config>(DEFAULTS);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0); // índice actual dibujado
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);

  // Recalcular la trayectoria completa cuando cambia la configuración.
  const sim = useMemo(() => simulate(cfg), [cfg]);

  // Animación: avanza el índice `progress` frame a frame mientras `running` sea true.
  useEffect(() => {
    if (!running) return;
    const stepsPerFrame = Math.max(1, Math.floor(cfg.pasos_totales / 600));
    const tick = () => {
      setProgress(p => {
        const next = p + stepsPerFrame;
        if (next >= cfg.pasos_totales) {
          setRunning(false);
          return cfg.pasos_totales;
        }
        return next;
      });
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [running, cfg.pasos_totales]);

  // Dibujar el gráfico 2D.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const W = canvas.clientWidth, H = canvas.clientHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const cx = W / 2, cy = H / 2;
    const margin = 50;
    const scale = (Math.min(W, H) / 2 - margin) / sim.maxR;

    // Ejes X e Y con etiquetas dinámicas basadas en la escala real.
    ctx.strokeStyle = "#334155";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(margin / 2, cy); ctx.lineTo(W - margin / 2, cy);
    ctx.moveTo(cx, margin / 2); ctx.lineTo(cx, H - margin / 2);
    ctx.stroke();

    ctx.fillStyle = "#94a3b8";
    ctx.font = "12px ui-sans-serif, system-ui";
    ctx.fillText(`X [m]  (~${sim.maxR.toExponential(1)})`, W - 140, cy - 6);
    ctx.fillText(`Y [m]`, cx + 6, margin / 2 + 10);

    // Marcas en los ejes cada r_max/2.
    ctx.strokeStyle = "#1e293b";
    for (const frac of [-1, -0.5, 0.5, 1]) {
      const px = cx + frac * sim.maxR * scale;
      const py = cy - frac * sim.maxR * scale;
      ctx.beginPath(); ctx.moveTo(px, cy - 4); ctx.lineTo(px, cy + 4); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx - 4, py); ctx.lineTo(cx + 4, py); ctx.stroke();
      ctx.fillStyle = "#64748b";
      ctx.fillText(`${(frac * sim.maxR).toExponential(1)}`, px + 3, cy + 14);
    }

    // Trayectoria orbital ya recorrida.
    const upto = Math.min(progress, sim.xs.length);
    ctx.strokeStyle = "#93c5fd";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let i = 0; i < upto; i++) {
      const sx = cx + sim.xs[i] * scale;
      const sy = cy - sim.ys[i] * scale; // invertimos Y (pantalla ↓ es negativo)
      if (i === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    }
    ctx.stroke();

    // Cuerpo central en el origen (halo amarillo).
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 26);
    grad.addColorStop(0, "rgba(253,224,71,1)");
    grad.addColorStop(1, "rgba(253,224,71,0)");
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(cx, cy, 26, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#facc15";
    ctx.beginPath(); ctx.arc(cx, cy, 9, 0, Math.PI * 2); ctx.fill();

    // Posición inicial (verde).
    const sx0 = cx + sim.xs[0] * scale;
    const sy0 = cy - sim.ys[0] * scale;
    ctx.fillStyle = "#22c55e";
    ctx.beginPath(); ctx.arc(sx0, sy0, 4, 0, Math.PI * 2); ctx.fill();

    // Cuerpo en órbita en la posición actual (azul).
    if (upto > 0) {
      const i = upto - 1;
      const sx = cx + sim.xs[i] * scale;
      const sy = cy - sim.ys[i] * scale;
      ctx.fillStyle = "#60a5fa";
      ctx.beginPath(); ctx.arc(sx, sy, 6, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "rgba(96,165,250,0.5)";
      ctx.beginPath(); ctx.arc(sx, sy, 10, 0, Math.PI * 2); ctx.stroke();
    }
  }, [sim, progress]);

  const tiempoTotalDias = (cfg.dt * cfg.pasos_totales) / 86400;
  const vCircular = Math.sqrt((cfg.G * cfg.m_central) / cfg.distancia_inicial);
  const tiempoActualDias = (cfg.dt * progress) / 86400;

  const setField = (k: keyof Config) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    if (!Number.isFinite(v)) return;
    setCfg(c => ({ ...c, [k]: v }));
    setRunning(false);
    setProgress(0);
  };

  const handleStart = () => {
    if (progress >= cfg.pasos_totales) setProgress(0);
    setRunning(true);
  };
  const handlePause = () => setRunning(false);
  const handleReset = () => { setRunning(false); setProgress(0); };

  return (
    <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
      <div className="bg-slate-900/60 rounded-lg p-5 border border-slate-800 space-y-4">
        <div>
          <div className="text-xs uppercase tracking-wider text-slate-400">Simulación</div>
          <h1 className="text-white">Órbita gravitacional (Euler)</h1>
          <p className="text-sm text-slate-400 mt-1">
            Ley de Newton F = G·M·m / r², integrada paso a paso en 2D.
          </p>
        </div>

        {[
          { k: "G", label: "G [N·m²/kg²]", step: "1e-12" },
          { k: "m_central", label: "Masa central [kg]", step: "any" },
          { k: "distancia_inicial", label: "Distancia inicial [m]", step: "any" },
          { k: "v_inicial", label: "Velocidad inicial ⊥ [m/s]", step: "any" },
          { k: "dt", label: "Paso dt [s]", step: "any" },
          { k: "pasos_totales", label: "Pasos totales", step: "1" },
        ].map(({ k, label, step }) => (
          <label key={k} className="block">
            <span className="text-xs text-slate-300">{label}</span>
            <input
              type="number"
              step={step}
              value={cfg[k as keyof Config]}
              onChange={setField(k as keyof Config)}
              className="mt-1 w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-sm text-slate-100 outline-none focus:border-blue-500"
            />
          </label>
        ))}

        <div className="flex gap-2 pt-2">
          {!running ? (
            <button
              onClick={handleStart}
              className="flex-1 bg-blue-600 hover:bg-blue-500 text-white text-sm py-2 rounded transition"
            >
              {progress > 0 && progress < cfg.pasos_totales ? "Continuar" : "Iniciar"}
            </button>
          ) : (
            <button
              onClick={handlePause}
              className="flex-1 bg-amber-600 hover:bg-amber-500 text-white text-sm py-2 rounded transition"
            >
              Pausar
            </button>
          )}
          <button
            onClick={handleReset}
            className="flex-1 bg-slate-700 hover:bg-slate-600 text-white text-sm py-2 rounded transition"
          >
            Reiniciar
          </button>
        </div>

        <button
          onClick={() => { setCfg(DEFAULTS); setProgress(0); setRunning(false); }}
          className="w-full bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs py-2 rounded transition"
        >
          Restablecer valores (Tierra–Sol)
        </button>

        <div className="text-xs text-slate-400 space-y-1 pt-2 border-t border-slate-800">
          <div>Tiempo simulado ≈ <span className="text-slate-200">{tiempoTotalDias.toFixed(1)} días</span></div>
          <div>Tiempo actual: <span className="text-slate-200">{tiempoActualDias.toFixed(1)} días</span></div>
          <div>v circular teórica: <span className="text-slate-200">{vCircular.toFixed(0)} m/s</span></div>
          <div>r máx: <span className="text-slate-200">{sim.maxR.toExponential(2)} m</span></div>
          <div>Progreso: <span className="text-slate-200">{progress}/{cfg.pasos_totales}</span></div>
        </div>
      </div>

      <div className="bg-slate-900/60 rounded-lg border border-slate-800 overflow-hidden flex flex-col">
        <div className="px-4 py-2 border-b border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <span>Trayectoria 2D (plano XY)</span>
          <span className="flex gap-3">
            <span><span className="inline-block w-2 h-2 rounded-full bg-yellow-400 mr-1" />cuerpo central</span>
            <span><span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-1" />inicio</span>
            <span><span className="inline-block w-2 h-2 rounded-full bg-blue-400 mr-1" />posición actual</span>
          </span>
        </div>
        <canvas
          ref={canvasRef}
          className="w-full flex-1"
          style={{ minHeight: 520 }}
        />
      </div>
    </div>
  );
}
