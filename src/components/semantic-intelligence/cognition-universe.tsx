"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import type { UniverseNode, UniverseType } from "@/components/semantic-intelligence/universe-adapter";

const HUE: Record<UniverseType, [number, number, number]> = {
  positive: [56, 224, 161], // emerald: positive evaluation
  risk: [255, 82, 119], // rose: risk / negative association
  opportunity: [255, 190, 72], // amber: growth opportunity
  competitor: [190, 104, 255], // violet: competitor
  entity: [65, 220, 235], // cyan: entity
  attribute: [72, 176, 255], // sky: attribute
  context: [91, 122, 255], // indigo: context / audience
  activity: [255, 139, 76], // orange: action / event / function
  relation: [148, 118, 255], // purple: relation
  evidence: [202, 211, 226], // silver: evidence
};
const SECTOR_DIR: Record<UniverseType, [number, number, number]> = {
  positive: [-0.25, -0.62, 0.18],
  risk: [0.22, 0.5, 0.24],
  opportunity: [0.64, -0.38, 0.2],
  competitor: [-0.72, 0.34, -0.22],
  entity: [-0.58, -0.18, 0.44],
  attribute: [0.48, -0.1, -0.5],
  context: [0.68, 0.18, 0.28],
  activity: [-0.08, 0.72, -0.28],
  relation: [-0.52, 0.5, 0.18],
  evidence: [0.12, -0.72, -0.28],
};

type Copy = {
  legend: Record<UniverseType, string>;
  hint: string;
  pull: string;
  freq: string;
  confidence: string;
  empty: string;
  evidence: string;
  fullscreen?: string;
  exitFullscreen?: string;
  balanced?: string;
  raw?: string;
};

const DEFAULT_COPY: Copy = {
  legend: { positive: "Positive", risk: "Risk", opportunity: "Opportunity", competitor: "Competitor", entity: "Entity", attribute: "Attribute", context: "Context", activity: "Activity", relation: "Relation", evidence: "Evidence" },
  hint: "drag · scroll · click a star",
  pull: "pull",
  freq: "freq",
  confidence: "confidence",
  empty: "No semantic field yet.",
  evidence: "Why AI placed it here",
  fullscreen: "Fullscreen",
  exitFullscreen: "Exit fullscreen",
  balanced: "Balanced",
  raw: "Raw space",
};

type Star = UniverseNode & { hue: [number, number, number]; tw: number };

export function CognitionUniverse({
  nodes,
  subjectName,
  copy = DEFAULT_COPY,
  className,
  variant = "interactive",
}: {
  nodes: UniverseNode[];
  subjectName: string;
  copy?: Copy;
  className?: string;
  /** "ambient" = passive background (no chrome, click-through, slow drift). */
  variant?: "interactive" | "ambient";
}) {
  const interactive = variant !== "ambient";
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [typeOn, setTypeOn] = useState<Record<UniverseType, boolean>>({ positive: true, risk: true, opportunity: true, competitor: true, entity: true, attribute: true, context: true, activity: true, relation: true, evidence: true });
  const [paused, setPaused] = useState(false);
  const [selected, setSelected] = useState<UniverseNode | null>(null);
  const [tip, setTip] = useState<{ x: number; y: number; node: UniverseNode } | null>(null);
  const [layoutMode, setLayoutMode] = useState<"balanced" | "raw">("balanced");
  const [isFullscreen, setIsFullscreen] = useState(false);

  // mirror reactive state into a ref the animation loop can read each frame
  const ui = useRef({ typeOn, paused, selected });
  useEffect(() => {
    ui.current = { typeOn, paused, selected };
  }, [typeOn, paused, selected]);

  useEffect(() => {
    const syncFullscreen = () => setIsFullscreen(document.fullscreenElement === wrapRef.current);
    document.addEventListener("fullscreenchange", syncFullscreen);
    return () => document.removeEventListener("fullscreenchange", syncFullscreen);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const stars: Star[] = nodes.map((n, i) => ({
      ...n,
      x: layoutMode === "raw" ? n.rawX : n.x,
      y: layoutMode === "raw" ? n.rawY : n.y,
      z: layoutMode === "raw" ? n.rawZ : n.z,
      hue: HUE[n.type], tw: (i * 2.399) % 6.283,
    }));
    const cam = { yaw: 0.2, pitch: -0.18, dist: 3.4, tdist: 2.6 };
    const look = { x: 0, y: 0, z: 0 };
    const focus = { x: 0, y: 0, z: 0 };
    let W = 0, H = 0, cx = 0, cy = 0, base = 600, dpr = 1;
    let drag: { x: number; y: number; yaw: number; pitch: number; moved: boolean } | null = null;
    let hoverStar: Star | null = null;
    let lastScreen: Array<{ s: Star; sx: number; sy: number }> = [];
    let raf = 0;
    let lastFrame = performance.now();
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const resize = () => {
      const r = wrap.getBoundingClientRect();
      W = r.width; H = r.height; dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = W * dpr; canvas.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cx = W / 2; cy = H / 2; base = Math.min(W, H) * 0.6;
    };
    const project = (x: number, y: number, z: number) => {
      x -= look.x; y -= look.y; z -= look.z;
      const cyw = Math.cos(cam.yaw), syw = Math.sin(cam.yaw), cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
      const x1 = x * cyw - z * syw, z1 = x * syw + z * cyw, y2 = y * cp - z1 * sp, z2 = y * sp + z1 * cp;
      let zc = z2 + cam.dist; if (zc < 0.05) zc = 0.05;
      const s = 2.3 / zc;
      return { sx: cx + x1 * s * base, sy: cy + y2 * s * base, s, depth: zc };
    };
    const fog = (d: number) => Math.max(0, Math.min(1, (4.6 - d) / 3.4));

    const draw = () => {
      raf = requestAnimationFrame(draw);
      const { typeOn, paused, selected } = ui.current;
      const now = performance.now();
      const elapsed = Math.min((now - lastFrame) / 1000, 0.05);
      lastFrame = now;
      if (!drag && !paused && !reduceMotion) cam.yaw += (interactive ? 0.02 : 0.012) * elapsed;
      cam.dist += (cam.tdist - cam.dist) * 0.06;
      look.x += (focus.x - look.x) * 0.08; look.y += (focus.y - look.y) * 0.08; look.z += (focus.z - look.z) * 0.08;

      const bg = ctx.createRadialGradient(cx, cy * 0.8, 0, cx, cy, Math.max(W, H) * 0.8);
      bg.addColorStop(0, "#0a0b16"); bg.addColorStop(0.5, "#06070e"); bg.addColorStop(1, "#030308");
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = "lighter";

      (Object.keys(SECTOR_DIR) as UniverseType[]).forEach((t) => {
        if (!typeOn[t]) return;
        const dir = SECTOR_DIR[t], p = project(dir[0] * 0.7, dir[1] * 0.7, dir[2] * 0.7), f = fog(p.depth); if (f <= 0) return;
        const rad = 0.4 * p.s * base, h = HUE[t], g = ctx.createRadialGradient(p.sx, p.sy, 0, p.sx, p.sy, rad);
        g.addColorStop(0, `rgba(${h[0]},${h[1]},${h[2]},${0.14 * f})`); g.addColorStop(1, `rgba(${h[0]},${h[1]},${h[2]},0)`);
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.sx, p.sy, rad, 0, 6.2832); ctx.fill();
      });

      const bp = project(0, 0, 0);
      stars.forEach((s) => {
        if (!typeOn[s.type] || (s.affinity < 0.72 && hoverStar !== s && selected !== s)) return;
        if (selected && s.type !== selected.type) return;
        const p = project(s.x, s.y, s.z), f = fog(p.depth); if (f <= 0) return;
        const grd = ctx.createLinearGradient(bp.sx, bp.sy, p.sx, p.sy);
        grd.addColorStop(0, "rgba(41,211,236,0)"); grd.addColorStop(1, `rgba(${s.hue[0]},${s.hue[1]},${s.hue[2]},${0.24 * f})`);
        ctx.strokeStyle = grd; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(bp.sx, bp.sy); ctx.lineTo(p.sx, p.sy); ctx.stroke();
      });

      const order = stars.map((s) => ({ s, p: project(s.x, s.y, s.z) })).sort((a, b) => b.p.depth - a.p.depth);
      lastScreen = [];
      order.forEach(({ s, p }) => {
        if (!typeOn[s.type]) return;
        const f = fog(p.depth); if (f <= 0) return;
        lastScreen.push({ s, sx: p.sx, sy: p.sy });
        const dim = selected && selected.type !== s.type ? 0.25 : 1;
        const pulse = s.type === "risk" ? 0.7 + 0.3 * Math.sin(now * 0.004 + s.tw) : 1;
        const r = (0.75 + s.affinity * 4.8) * p.s * 1.45 * pulse, isH = hoverStar === s || selected === s;
        ctx.globalAlpha = (0.12 + s.affinity * 0.88) * f * dim;
        ctx.fillStyle = `rgb(${s.hue[0]},${s.hue[1]},${s.hue[2]})`;
        ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = isH ? 26 * f : s.affinity > 0.62 ? (s.affinity - 0.5) * 30 * f : 0;
        ctx.beginPath(); ctx.arc(p.sx, p.sy, isH ? r + 2.5 : r, 0, 6.2832); ctx.fill();
      });
      ctx.shadowBlur = 0; ctx.globalAlpha = 1;

      // labels for prominent / hovered stars
      ctx.globalCompositeOperation = "source-over";
      const labelBoxes: Array<{ left: number; top: number; right: number; bottom: number }> = [];
      const labelLimit = Math.max(14, Math.min(42, Math.round(Math.sqrt(stars.length) * 1.6)));
      const labelThreshold = stars.length > 400 ? 0.78 : stars.length > 180 ? 0.7 : 0.62;
      let visibleLabels = 0;
      order.forEach(({ s, p }) => {
        if (!typeOn[s.type]) return;
        const f = fog(p.depth);
        const isH = hoverStar === s || selected === s;
        if (!(isH || (s.affinity > labelThreshold && f > 0.4 && visibleLabels < labelLimit))) return;
        ctx.font = `${isH ? "600" : "500"} 11px Inter, system-ui, sans-serif`;
        const width = ctx.measureText(s.label).width;
        const box = { left: p.sx + 6, top: p.sy - 7, right: p.sx + width + 12, bottom: p.sy + 7 };
        if (!isH && labelBoxes.some((other) => box.left < other.right && box.right > other.left && box.top < other.bottom && box.bottom > other.top)) return;
        labelBoxes.push(box);
        visibleLabels += 1;
        ctx.globalAlpha = isH ? 1 : 0.78 * f; ctx.fillStyle = isH ? "#fff" : "#c4c8d6";
        ctx.textAlign = "left"; ctx.textBaseline = "middle";
        ctx.fillText(s.label, p.sx + 8, p.sy);
      });
      ctx.globalAlpha = 1;

      // brand star
      ctx.globalCompositeOperation = "lighter";
      const cr = 15 * bp.s + 7;
      const halo = ctx.createRadialGradient(bp.sx, bp.sy, 0, bp.sx, bp.sy, cr * 3.2);
      halo.addColorStop(0, "rgba(180,245,255,0.5)"); halo.addColorStop(0.4, "rgba(41,211,236,0.28)"); halo.addColorStop(1, "rgba(41,211,236,0)");
      ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(bp.sx, bp.sy, cr * 3.2, 0, 6.2832); ctx.fill();
      const core = ctx.createRadialGradient(bp.sx, bp.sy, 0, bp.sx, bp.sy, cr);
      core.addColorStop(0, "#ffffff"); core.addColorStop(0.4, "#c9f7ff"); core.addColorStop(1, "rgba(41,211,236,0)");
      ctx.fillStyle = core; ctx.beginPath(); ctx.arc(bp.sx, bp.sy, cr, 0, 6.2832); ctx.fill();
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "#eafcff"; ctx.font = "700 14px Inter, system-ui, sans-serif"; ctx.textAlign = "center";
      ctx.fillText(subjectName, bp.sx, bp.sy - cr - 12);

      const vg = ctx.createRadialGradient(cx, cy, Math.min(W, H) * 0.3, cx, cy, Math.max(W, H) * 0.75);
      vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,0.55)");
      ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    };

    const pick = (px: number, py: number) => {
      let best: Star | null = null, bd = 15 * 15;
      for (const { s, sx, sy } of lastScreen) {
        if (!ui.current.typeOn[s.type]) continue;
        const dx = sx - px, dy = sy - py, dd = dx * dx + dy * dy;
        if (dd < bd) { bd = dd; best = s; }
      }
      return best;
    };
    const localXY = (e: MouseEvent) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    const onDown = (e: MouseEvent) => { const { x, y } = localXY(e); drag = { x, y, yaw: cam.yaw, pitch: cam.pitch, moved: false }; };
    const onUp = (e: MouseEvent) => {
      if (drag && !drag.moved) { const { x, y } = localXY(e); const hit = pick(x, y); if (hit) { setSelected(hit); focus.x = hit.x; focus.y = hit.y; focus.z = hit.z; cam.tdist = 1.7; } else { setSelected(null); focus.x = 0; focus.y = 0; focus.z = 0; cam.tdist = 2.6; } }
      drag = null;
    };
    const onMove = (e: MouseEvent) => {
      const { x, y } = localXY(e);
      if (drag) {
        if (Math.abs(x - drag.x) + Math.abs(y - drag.y) > 3) drag.moved = true;
        cam.yaw = drag.yaw + (x - drag.x) * 0.005; cam.pitch = Math.max(-1.2, Math.min(1.2, drag.pitch + (y - drag.y) * 0.005));
        hoverStar = null; setTip(null); return;
      }
      const hit = pick(x, y); hoverStar = hit;
      setTip(hit ? { x, y, node: hit } : null);
      canvas.style.cursor = hit ? "pointer" : "grab";
    };
    const onWheel = (e: WheelEvent) => { e.preventDefault(); cam.tdist = Math.max(1.1, Math.min(5.5, cam.tdist * (e.deltaY < 0 ? 0.9 : 1.11))); };
    const onLeave = () => { hoverStar = null; setTip(null); };

    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(wrap);
    window.addEventListener("resize", resize);
    if (interactive) {
      canvas.addEventListener("mousedown", onDown);
      window.addEventListener("mouseup", onUp);
      canvas.addEventListener("mousemove", onMove);
      canvas.addEventListener("mouseleave", onLeave);
      canvas.addEventListener("wheel", onWheel, { passive: false });
    }
    draw(); // paint the first frame synchronously (rAF is paused in hidden tabs)

    return () => {
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("mousedown", onDown);
      window.removeEventListener("mouseup", onUp);
      canvas.removeEventListener("mousemove", onMove);
      canvas.removeEventListener("mouseleave", onLeave);
      canvas.removeEventListener("wheel", onWheel);
    };
  }, [nodes, subjectName, interactive, layoutMode]);

  const toggle = (t: UniverseType) => setTypeOn((s) => ({ ...s, [t]: !s[t] }));
  const changeLayout = (mode: "balanced" | "raw") => {
    setSelected(null);
    setTip(null);
    setLayoutMode(mode);
  };
  const toggleFullscreen = async () => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await wrap.requestFullscreen();
    } catch {
      // Fullscreen may be blocked by browser or embedding policy.
    }
  };

  return (
    <div
      ref={wrapRef}
      className={cn("relative overflow-hidden", interactive && "rounded-2xl border border-border bg-[#06070b]", className, isFullscreen && "h-screen w-screen rounded-none border-0")}
    >
      <canvas
        ref={canvasRef}
        className={cn("block h-full w-full", !interactive && "pointer-events-none")}
        style={interactive ? { cursor: "grab" } : undefined}
      />

      {interactive && nodes.length === 0 ? (
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-faint">{copy.empty}</div>
      ) : null}

      {interactive ? (
        <>
      {/* view controls */}
      <div className="absolute left-3 top-3 z-20 flex items-center gap-2">
        <button
          type="button"
          onClick={toggleFullscreen}
          className="flex h-8 items-center gap-2 rounded-lg border border-white/10 bg-black/60 px-2.5 text-xs text-[#c4c8d6] backdrop-blur transition-[transform,background-color,color] duration-150 ease-out hover:bg-black/80 hover:text-white active:scale-[0.97]"
          aria-label={isFullscreen ? copy.exitFullscreen ?? DEFAULT_COPY.exitFullscreen : copy.fullscreen ?? DEFAULT_COPY.fullscreen}
          aria-pressed={isFullscreen}
        >
          {isFullscreen ? (
            <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3v5H3M16 3v5h5M8 21v-5H3M16 21v-5h5" /></svg>
          ) : (
            <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5" /></svg>
          )}
          <span>{isFullscreen ? copy.exitFullscreen ?? DEFAULT_COPY.exitFullscreen : copy.fullscreen ?? DEFAULT_COPY.fullscreen}</span>
        </button>
        <div className="flex rounded-lg border border-white/10 bg-black/60 p-0.5 backdrop-blur" aria-label="Nebula layout">
          {(["balanced", "raw"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => changeLayout(mode)}
              className={cn(
                "h-7 rounded-md px-2.5 text-[11px] transition-[transform,background-color,color] duration-150 ease-out active:scale-[0.97]",
                layoutMode === mode ? "bg-white/12 text-white" : "text-[#8f95a6] hover:text-[#d8dbe5]",
              )}
              aria-pressed={layoutMode === mode}
            >
              {mode === "balanced" ? copy.balanced ?? DEFAULT_COPY.balanced : copy.raw ?? DEFAULT_COPY.raw}
            </button>
          ))}
        </div>
      </div>

      {/* type filters */}
      <div className="absolute right-3 top-3 grid grid-cols-2 gap-x-3 gap-y-1.5 rounded-lg bg-black/35 p-2 backdrop-blur-sm">
        {(Object.keys(HUE) as UniverseType[]).map((t) => {
          const h = HUE[t];
          return (
            <button
              key={t}
              type="button"
              onClick={() => toggle(t)}
              aria-pressed={typeOn[t]}
              className={cn(
                "flex items-center justify-end gap-2 text-xs transition-[transform,opacity] duration-150 ease-out active:scale-[0.97]",
                typeOn[t] ? "opacity-100" : "opacity-30",
              )}
            >
              <span className="text-[#c4c8d6]">{copy.legend[t]}</span>
              <span className="size-2 rounded-full" style={{ background: `rgb(${h[0]},${h[1]},${h[2]})`, boxShadow: `0 0 8px rgb(${h[0]},${h[1]},${h[2]})` }} />
            </button>
          );
        })}
      </div>

      {/* pause + hint */}
      <div className="absolute bottom-3 left-3 flex items-center gap-3">
        <button
          type="button"
          onClick={() => setPaused((p) => !p)}
          className="grid size-7 place-items-center rounded-md border border-border bg-black/40 text-[#c4c8d6] transition-[transform,color] duration-150 ease-out hover:text-white active:scale-[0.97]"
          aria-label={paused ? "Resume" : "Pause"}
          aria-pressed={paused}
        >
          {paused ? (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M7 5l12 7-12 7z" /></svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" /><rect x="14" y="5" width="4" height="14" /></svg>
          )}
        </button>
        <span className="font-mono text-[10px] leading-tight text-faint">{copy.hint}</span>
      </div>

      {/* hover tooltip */}
      {tip ? (
        <div
          className="pointer-events-none absolute z-10 max-w-[220px] rounded-lg border border-border bg-black/85 px-3 py-2 text-xs backdrop-blur"
          style={{ left: Math.min(tip.x + 14, 9999), top: tip.y + 10 }}
        >
          <div className="font-medium text-foreground">{tip.node.label}</div>
          <div className="mt-0.5 font-mono text-[10px] text-faint">
            {tip.node.type} · {copy.pull} {Math.round(tip.node.affinity * 100)}
          </div>
        </div>
      ) : null}

      {/* selected detail */}
      {selected ? (
        <div className="absolute bottom-3 right-3 flex max-h-[calc(100%-1.5rem)] w-64 flex-col rounded-lg border border-border bg-black/85 p-4 backdrop-blur">
          <button className="absolute right-2.5 top-2 text-faint hover:text-foreground" onClick={() => setSelected(null)} aria-label="Close">×</button>
          <div className="pr-4 text-sm font-semibold text-foreground">{selected.label}</div>
          <div className="mt-0.5 font-mono text-[10px] uppercase tracking-wide" style={{ color: `rgb(${HUE[selected.type].join(",")})` }}>
            {selected.type}
          </div>
          <div className="mt-1 font-mono text-[9px] uppercase tracking-wide text-faint">{selected.domain} · {selected.semanticType}</div>
          {(["affinity", "confidence"] as const).map((k) => (
            <div key={k} className="mt-3">
              <div className="mb-1 flex justify-between text-[11px] text-muted-foreground">
                <span>{k === "affinity" ? copy.pull : copy.confidence}</span>
                <span className="font-mono">{Math.round((selected[k] as number) * 100)}</span>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full" style={{ width: `${Math.round((selected[k] as number) * 100)}%`, background: `rgb(${HUE[selected.type].join(",")})` }} />
              </div>
            </div>
          ))}
          {selected.examples.length > 0 ? (
            <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
              <div className="mb-2 font-mono text-[9.5px] uppercase tracking-wide text-faint">{copy.evidence}</div>
              <div className="space-y-2">
                {selected.examples.map((ex, i) => (
                  <div key={i} className="rounded-md border border-border bg-white/[0.03] p-2">
                    {ex.question ? <div className="mb-1 text-[10.5px] font-medium text-foreground/80">{ex.question}</div> : null}
                    <p className="text-[11px] leading-5 text-dim">“{ex.excerpt}”</p>
                    {ex.source ? <div className="mt-1 font-mono text-[9px] text-faint">{ex.source}</div> : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
        </>
      ) : null}
    </div>
  );
}
