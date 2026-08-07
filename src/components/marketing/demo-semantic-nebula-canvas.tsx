"use client";

import type { MutableRefObject, PointerEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";

import {
  demoNebulaEntity,
  demoNebulaNodes,
  nebulaVocabulary,
  type DemoNebulaNode,
  type DemoNebulaTermType,
  type MarketingLocale,
} from "@/components/marketing/demo-nebula-data";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type DemoNebulaCopy = {
  demoBadge: string;
  clickHint: string;
  semanticGravity: string;
  evidenceConfidence: string;
  associationStrength: string;
  coMentionStrength: string;
  panelTitle: string;
  sourceQuestion: string;
  answerExcerpt: string;
  whyItMatters: string;
  providerModel: string;
  close: string;
  nodeTypes: Record<DemoNebulaTermType, string>;
};

type Vec3 = { x: number; y: number; z: number };

type HueKey = "haze" | "blue" | "cyan" | "violet" | "gold" | "rose" | "emerald";

type WordPoint = Vec3 & {
  text: string;
  hue: HueKey;
  baseAlpha: number;
  weight: number;
  phase: number;
  speed: number;
  fontScale: number;
  drift: number;
};

type DustPoint = Vec3 & { size: number; baseAlpha: number; phase: number; hue: HueKey };

type NodePoint = Vec3 & { node: DemoNebulaNode };

type HitNode = { node: DemoNebulaNode; x: number; y: number; radius: number };

type Projected = { sx: number; sy: number; scale: number; depth: number };

const TAU = Math.PI * 2;
const FOCAL = 2.35;

// Dust / word field hues — the brand spectrum (magenta·violet·blue·cyan·mint)
// plus a neutral haze. No off-brand gold.
const hueRgb: Record<HueKey, [number, number, number]> = {
  haze: [188, 202, 224],
  blue: [91, 139, 255],
  cyan: [41, 211, 236],
  violet: [168, 120, 255],
  gold: [255, 92, 168], // remapped onto spectrum magenta (key name kept)
  rose: [255, 92, 168],
  emerald: [56, 224, 161],
};

// Node types coded on the brand spectrum; RISK keeps one semantic red.
const termColors: Record<DemoNebulaTermType, { fill: string; stroke: string; glow: string }> = {
  POSITIVE: { fill: "#7fe3f5", stroke: "#29d3ec", glow: "rgba(41,211,236,1)" },
  RISK: { fill: "#ff9aa5", stroke: "#ff5d6c", glow: "rgba(255,93,108,1)" },
  COMPETITOR: { fill: "#9db4ff", stroke: "#5b8bff", glow: "rgba(91,139,255,1)" },
  SCENARIO: { fill: "#c3aaff", stroke: "#a878ff", glow: "rgba(168,120,255,1)" },
  OPPORTUNITY: { fill: "#7fecc0", stroke: "#38e0a1", glow: "rgba(56,224,161,1)" },
  MISSING: { fill: "#ffa6cf", stroke: "#ff5ca8", glow: "rgba(255,92,168,1)" },
};

export function DemoSemanticNebulaCanvas({
  locale,
  copy,
  className,
}: {
  locale: MarketingLocale;
  copy: DemoNebulaCopy;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const hitNodesRef = useRef<HitNode[]>([]);
  const wordsRef = useRef<WordPoint[]>([]);
  const dustRef = useRef<DustPoint[]>([]);
  const nodePointsRef = useRef<NodePoint[]>([]);
  const sizeRef = useRef({ width: 0, height: 0, dpr: 1, isMobile: false });
  const pointerRef = useRef({ x: 0, y: 0, active: false });
  const hoveredIdRef = useRef<string | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; width: number; node: DemoNebulaNode } | null>(null);

  const selectedNode = useMemo(() => demoNebulaNodes.find((node) => node.id === selectedId) ?? null, [selectedId]);

  useEffect(() => {
    hoveredIdRef.current = hoveredId;
  }, [hoveredId]);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    nodePointsRef.current = buildNodePoints();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const shell = shellRef.current;
    if (!canvas || !shell) return;

    const context = canvas.getContext("2d", { alpha: false });
    if (!context) return;

    const canvasElement = canvas;
    const shellElement = shell;
    const renderContext = context;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let animationFrame = 0;
    let resizeTimer: number | null = null;
    let lastDraw = Number.NEGATIVE_INFINITY; // ensure the first frame paints immediately
    const frameInterval = 1000 / 30; // throttle to ~30fps — plenty for drift, far cheaper

    function resize() {
      const rect = shellElement.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const isMobile = rect.width < 720;
      canvasElement.width = Math.max(1, Math.floor(rect.width * dpr));
      canvasElement.height = Math.max(1, Math.floor(rect.height * dpr));
      canvasElement.style.width = `${rect.width}px`;
      canvasElement.style.height = `${rect.height}px`;
      sizeRef.current = { width: rect.width, height: rect.height, dpr, isMobile };
      wordsRef.current = buildWords(locale, isMobile ? 150 : 360);
      dustRef.current = buildDust(isMobile ? 900 : 2200);
    }

    function scheduleResize() {
      if (resizeTimer) window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(resize, 80);
    }

    function render(time: number) {
      const { width, height, dpr, isMobile } = sizeRef.current;
      if (width <= 0 || height <= 0) {
        animationFrame = window.requestAnimationFrame(render);
        return;
      }
      if (!reducedMotion.matches && time - lastDraw < frameInterval) {
        animationFrame = window.requestAnimationFrame(render);
        return;
      }
      lastDraw = time;
      renderContext.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawFrame({
        context: renderContext,
        width,
        height,
        time,
        locale,
        isMobile,
        reducedMotion: reducedMotion.matches,
        words: wordsRef.current,
        dust: dustRef.current,
        nodes: nodePointsRef.current,
        pointer: pointerRef.current,
        hoveredId: hoveredIdRef.current,
        selectedId: selectedIdRef.current,
        hitNodesRef,
      });
      if (!reducedMotion.matches) {
        animationFrame = window.requestAnimationFrame(render);
      }
    }

    resize();
    render(0);
    window.addEventListener("resize", scheduleResize);
    reducedMotion.addEventListener("change", scheduleResize);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", scheduleResize);
      reducedMotion.removeEventListener("change", scheduleResize);
      if (resizeTimer) window.clearTimeout(resizeTimer);
    };
  }, [locale]);

  function handlePointerMove(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    pointerRef.current = { x, y, active: true };
    const hovered = findHitNode(hitNodesRef.current, x, y);
    setHoveredId(hovered?.node.id ?? null);
    setTooltip(hovered ? { x, y, width: rect.width, node: hovered.node } : null);
    canvas.style.cursor = hovered ? "pointer" : "default";
  }

  function handlePointerLeave() {
    pointerRef.current.active = false;
    setHoveredId(null);
    setTooltip(null);
  }

  function handleClick(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const hit = findHitNode(hitNodesRef.current, event.clientX - rect.left, event.clientY - rect.top);
    if (hit) setSelectedId(hit.node.id);
  }

  return (
    <div ref={shellRef} className={cn("relative min-h-[calc(100svh-3.5rem)] overflow-hidden bg-[#020205]", className)}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        aria-label={`${demoNebulaEntity.name[locale]} semantic nebula demo`}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        onPointerDown={handleClick}
      />

      {tooltip ? (
        <div
          className="pointer-events-none absolute z-20 hidden max-w-64 rounded-lg border border-white/12 bg-slate-950/82 p-3 text-xs text-white shadow-2xl backdrop-blur md:block"
          style={{ left: Math.min(tooltip.x + 18, tooltip.width - 280), top: Math.max(20, tooltip.y - 22) }}
        >
          <div className="flex items-center justify-between gap-3">
            <span className="font-medium">{tooltip.node.term[locale]}</span>
            <span className="text-white/45">{copy.nodeTypes[tooltip.node.termType]}</span>
          </div>
          <div className="mt-2 grid gap-1 text-white/64">
            <span>{copy.semanticGravity}: {tooltip.node.semanticGravity}</span>
            <span>{copy.evidenceConfidence}: {tooltip.node.evidenceConfidence}</span>
          </div>
        </div>
      ) : null}

      <DemoNebulaEvidencePanel locale={locale} copy={copy} node={selectedNode} onClose={() => setSelectedId(null)} />
    </div>
  );
}

/* ------------------------------------------------------------------ build --- */

function buildNodePoints(): NodePoint[] {
  return demoNebulaNodes.map((node, index) => {
    const assoc = node.observableAssociationStrength / 100;
    const az = node.angle;
    const el = (seeded(index, 71) - 0.5) * 1.05;
    const radius = 0.34 + (1 - assoc) * 0.5; // strong associations sit nearer the core
    return {
      node,
      x: Math.cos(az) * Math.cos(el) * radius,
      y: Math.sin(el) * radius * 0.82,
      z: Math.sin(az) * Math.cos(el) * radius,
    };
  });
}

function buildWords(locale: MarketingLocale, count: number): WordPoint[] {
  const pool = nebulaVocabulary[locale];
  return Array.from({ length: count }, (_, index) => {
    const dir = randomDirection(index, 200);
    const radius = Math.pow(seeded(index, 211), 0.7); // concentrate toward the core
    const accentRoll = seeded(index, 212);
    // Restrained, cool-dominant palette: mostly haze/blue, accents are rare.
    const hue: HueKey =
      accentRoll > 0.975 ? "gold" : accentRoll > 0.94 ? "cyan" : accentRoll > 0.9 ? "violet" : accentRoll > 0.46 ? "blue" : "haze";
    return {
      x: dir.x * radius,
      y: dir.y * radius * 0.82,
      z: dir.z * radius,
      text: pool[Math.floor(seeded(index, 213) * pool.length) % pool.length],
      hue,
      baseAlpha: 0.2 + seeded(index, 214) * 0.48,
      weight: seeded(index, 215) > 0.9 ? 600 : 400,
      fontScale: 0.78 + seeded(index, 216) * 0.7,
      phase: seeded(index, 217) * TAU,
      speed: 0.16 + seeded(index, 218) * 0.4,
      // Inner words drift more than the outer shell → organic, non-rigid flow.
      drift: (0.012 + seeded(index, 219) * 0.03) * (1 - radius * 0.5),
    };
  });
}

function buildDust(count: number): DustPoint[] {
  return Array.from({ length: count }, (_, index) => {
    const dir = randomDirection(index, 400);
    const radius = Math.pow(seeded(index, 411), 0.5) * 1.12;
    const accent = seeded(index, 412);
    const hue: HueKey = accent > 0.96 ? "gold" : accent > 0.9 ? "cyan" : accent > 0.85 ? "violet" : "haze";
    return {
      x: dir.x * radius,
      y: dir.y * radius * 0.82,
      z: dir.z * radius,
      size: seeded(index, 413) > 0.985 ? 1.8 + seeded(index, 414) * 1.6 : 0.4 + Math.pow(seeded(index, 415), 1.6) * 1.1,
      baseAlpha: 0.12 + seeded(index, 416) * 0.4,
      phase: seeded(index, 417) * TAU,
      hue,
    };
  });
}

/* ----------------------------------------------------------------- render --- */

function drawFrame(input: {
  context: CanvasRenderingContext2D;
  width: number;
  height: number;
  time: number;
  locale: MarketingLocale;
  isMobile: boolean;
  reducedMotion: boolean;
  words: WordPoint[];
  dust: DustPoint[];
  nodes: NodePoint[];
  pointer: { x: number; y: number; active: boolean };
  hoveredId: string | null;
  selectedId: string | null;
  hitNodesRef: MutableRefObject<HitNode[]>;
}) {
  const { context, width, height, time, locale, isMobile, reducedMotion, words, dust, nodes, pointer, hoveredId, selectedId, hitNodesRef } = input;
  const t = reducedMotion ? 0 : time * 0.001;
  const cx = width * 0.5;
  const cy = height * (isMobile ? 0.45 : 0.5);
  const spread = Math.min(width, height) * (isMobile ? 0.62 : 0.66);

  const px = pointer.active ? (pointer.x / width - 0.5) : 0;
  const py = pointer.active ? (pointer.y / height - 0.5) : 0;
  const baseYaw = t * 0.04 + px * 0.45;
  const pitch = (reducedMotion ? 0 : Math.sin(t * 0.045) * 0.07) - py * 0.32;
  const cosX = Math.cos(pitch);
  const sinX = Math.sin(pitch);

  // Differential rotation (inner shells rotate faster, like a real galaxy) plus
  // a per-node organic drift — so the field flows instead of spinning rigidly.
  const project = (p: Vec3, phase = 0, driftAmp = 0): Projected => {
    let x = p.x;
    let y = p.y;
    let z = p.z;
    if (driftAmp > 0) {
      x += Math.sin(t * 0.5 + phase) * driftAmp;
      y += Math.cos(t * 0.42 + phase * 1.3) * driftAmp;
      z += Math.sin(t * 0.36 + phase * 0.7) * driftAmp;
    }
    const r = Math.sqrt(x * x + y * y + z * z);
    const yaw = baseYaw * (0.55 + (1 - Math.min(r, 1.2) / 1.2) * 0.95);
    const cosY = Math.cos(yaw);
    const sinY = Math.sin(yaw);
    const rx = x * cosY + z * sinY;
    const rz = -x * sinY + z * cosY;
    const ry = y * cosX - rz * sinX;
    const fz = y * sinX + rz * cosX; // +near, -far
    const scale = FOCAL / (FOCAL - fz);
    return { sx: cx + rx * spread * scale, sy: cy + ry * spread * scale, scale, depth: fz };
  };

  drawBackground(context, width, height, cx, cy, t);
  drawCore(context, cx, cy, spread, t, reducedMotion);

  // Dust (cheap, additive, no depth sort needed).
  context.save();
  context.globalCompositeOperation = "lighter";
  for (const d of dust) {
    const pr = project(d, d.phase, 0.01);
    if (pr.scale < 0.45) continue;
    const twinkle = reducedMotion ? 1 : 0.7 + Math.sin(t * 1.4 + d.phase) * 0.3;
    const alpha = depthAlpha(d.baseAlpha * twinkle, pr.scale);
    if (alpha < 0.02) continue;
    context.beginPath();
    context.arc(pr.sx, pr.sy, d.size * pr.scale, 0, TAU);
    context.fillStyle = rgba(d.hue, alpha);
    context.fill();
  }
  context.restore();

  // Words + real nodes: depth sorted so nearer words paint over farther ones.
  type Item = { kind: "word"; word: WordPoint; pr: Projected } | { kind: "node"; node: NodePoint; pr: Projected };
  const items: Item[] = [];
  for (const word of words) items.push({ kind: "word", word, pr: project(word, word.phase, word.drift) });
  for (const node of nodes) items.push({ kind: "node", node, pr: project(node, (node.x + node.z) * 3, 0.016) });
  items.sort((a, b) => a.pr.depth - b.pr.depth);

  const hits: HitNode[] = [];
  context.save();
  context.textAlign = "center";
  context.textBaseline = "middle";
  for (const item of items) {
    if (item.kind === "word") {
      drawWord(context, item.word, item.pr, t, isMobile, reducedMotion);
    } else {
      const hit = drawNode(context, item.node, item.pr, locale, isMobile, hoveredId, selectedId);
      if (hit) hits.push(hit);
    }
  }
  context.restore();
  hitNodesRef.current = hits;
}

function drawBackground(context: CanvasRenderingContext2D, width: number, height: number, cx: number, cy: number, time: number) {
  const bg = context.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, "#020205");
  bg.addColorStop(0.5, "#05070e");
  bg.addColorStop(1, "#010103");
  context.fillStyle = bg;
  context.fillRect(0, 0, width, height);

  // A single restrained core wash + one faint cool accent — mostly black.
  drawGlow(context, cx, cy, Math.min(width, height) * 0.55, `rgba(48,96,170,${0.07 + Math.sin(time * 0.6) * 0.01})`);
  drawGlow(context, width * 0.84, height * 0.16, Math.min(width, height) * 0.3, "rgba(34,180,220,0.045)");

  const vignette = context.createRadialGradient(cx, cy, 0, cx, cy, Math.max(width, height) * 0.7);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(0.62, "rgba(0,0,0,0.28)");
  vignette.addColorStop(1, "rgba(0,0,0,0.82)");
  context.fillStyle = vignette;
  context.fillRect(0, 0, width, height);
}

function drawCore(context: CanvasRenderingContext2D, cx: number, cy: number, spread: number, time: number, reducedMotion: boolean) {
  const pulse = reducedMotion ? 0 : Math.sin(time * 0.5) * 0.05;
  context.save();
  context.globalCompositeOperation = "lighter";
  drawGlow(context, cx, cy, spread * (0.42 + pulse), "rgba(96,140,210,0.06)");
  drawGlow(context, cx, cy, spread * 0.22, "rgba(150,180,230,0.08)");
  drawGlow(context, cx, cy, spread * 0.09, "rgba(220,232,255,0.12)");
  context.restore();
}

function drawWord(
  context: CanvasRenderingContext2D,
  word: WordPoint,
  pr: Projected,
  time: number,
  isMobile: boolean,
  reducedMotion: boolean,
) {
  if (pr.scale < 0.5) return;
  const twinkle = reducedMotion ? 1 : 0.78 + Math.sin(time * word.speed + word.phase) * 0.22;
  const alpha = depthAlpha(word.baseAlpha * twinkle, pr.scale) * 0.92;
  if (alpha < 0.04) return;
  const fontSize = (isMobile ? 9 : 12) * word.fontScale * pr.scale;
  if (fontSize < 6) return;
  context.font = `${word.weight} ${fontSize.toFixed(1)}px Geist, ui-sans-serif, system-ui`;
  context.fillStyle = rgba(word.hue, alpha);
  context.fillText(word.text, pr.sx, pr.sy);
}

function drawNode(
  context: CanvasRenderingContext2D,
  point: NodePoint,
  pr: Projected,
  locale: MarketingLocale,
  isMobile: boolean,
  hoveredId: string | null,
  selectedId: string | null,
): HitNode | null {
  if (pr.scale < 0.4) return null;
  const { node } = point;
  const color = termColors[node.termType];
  const active = node.id === hoveredId || node.id === selectedId;
  const gravity = node.semanticGravity / 100;
  const dotRadius = (2.4 + gravity * (isMobile ? 3.4 : 5)) * pr.scale * (active ? 1.5 : 1);
  const alpha = Math.min(1, depthAlpha(0.7 + gravity * 0.3, pr.scale) + 0.18);

  context.save();
  context.globalCompositeOperation = "lighter";
  drawGlow(context, pr.sx, pr.sy, dotRadius * (active ? 9 : 5.5), color.glow.replace(/1\)$/u, `${active ? 0.5 : alpha * 0.34})`));
  context.restore();

  // Solid dot core (over the additive glow).
  const grad = context.createRadialGradient(pr.sx - dotRadius * 0.3, pr.sy - dotRadius * 0.3, 0, pr.sx, pr.sy, dotRadius * 1.2);
  grad.addColorStop(0, "rgba(255,255,255,0.98)");
  grad.addColorStop(0.32, color.fill);
  grad.addColorStop(1, color.stroke);
  context.beginPath();
  context.arc(pr.sx, pr.sy, dotRadius, 0, TAU);
  context.globalAlpha = alpha;
  context.fillStyle = grad;
  context.fill();
  context.globalAlpha = 1;

  // Label — the surfaced, legible concepts.
  const labelSize = (active ? 14 : 11.5) * Math.min(1.25, pr.scale);
  context.font = `${active ? 600 : 500} ${labelSize.toFixed(1)}px Geist, ui-sans-serif, system-ui`;
  context.textAlign = "left";
  context.fillStyle = active ? "rgba(255,255,255,0.98)" : `rgba(236,242,255,${Math.min(0.92, alpha)})`;
  context.shadowColor = "rgba(0,0,0,0.85)";
  context.shadowBlur = 8;
  context.fillText(node.term[locale], pr.sx + dotRadius + 6, pr.sy + 0.5);
  context.shadowBlur = 0;
  context.textAlign = "center";

  return { node, x: pr.sx, y: pr.sy, radius: Math.max(dotRadius, 10) };
}

/* ------------------------------------------------------------------ utils --- */

function depthAlpha(base: number, scale: number) {
  // scale ranges ~0.5 (far) .. ~1.8 (near); fade the far field for depth-of-field.
  const k = Math.max(0, Math.min(1, (scale - 0.55) / 0.9));
  return base * (0.15 + k * 0.85);
}

function randomDirection(index: number, salt: number): Vec3 {
  const u = seeded(index, salt);
  const v = seeded(index, salt + 1);
  const theta = u * TAU;
  const phi = Math.acos(2 * v - 1);
  return {
    x: Math.sin(phi) * Math.cos(theta),
    y: Math.sin(phi) * Math.sin(theta),
    z: Math.cos(phi),
  };
}

function rgba(hue: HueKey, alpha: number) {
  const [r, g, b] = hueRgb[hue];
  return `rgba(${r},${g},${b},${alpha})`;
}

function drawGlow(context: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string) {
  const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, color);
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  context.fillStyle = gradient;
  context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}

function seeded(index: number, salt: number) {
  const value = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function findHitNode(nodes: HitNode[], x: number, y: number) {
  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    const item = nodes[index];
    if (Math.hypot(item.x - x, item.y - y) <= item.radius + 9) return item;
  }
  return null;
}

/* ------------------------------------------------------------ evidence UI --- */

function DemoNebulaEvidencePanel({
  locale,
  copy,
  node,
  onClose,
}: {
  locale: MarketingLocale;
  copy: DemoNebulaCopy;
  node: DemoNebulaNode | null;
  onClose: () => void;
}) {
  if (!node) return null;
  const evidence = node.evidence[0];

  return (
    <aside className="absolute inset-x-3 bottom-3 z-30 rounded-lg border border-white/12 bg-slate-950/88 p-4 text-white shadow-2xl backdrop-blur-xl md:inset-x-auto md:bottom-8 md:right-8 md:w-[360px]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Badge className="border-white/12 bg-white/8 text-white/76" variant="outline">
            {copy.nodeTypes[node.termType]}
          </Badge>
          <h3 className="mt-3 text-lg font-semibold">{node.term[locale]}</h3>
          <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-white/62">
            <Metric label={copy.semanticGravity} value={node.semanticGravity} />
            <Metric label={copy.evidenceConfidence} value={node.evidenceConfidence} />
            <Metric label={copy.associationStrength} value={node.observableAssociationStrength} />
            <Metric label={copy.coMentionStrength} value={node.coMentionStrength} />
          </div>
        </div>
        <button
          type="button"
          aria-label={copy.close}
          className="rounded-full border border-white/10 bg-white/6 p-2 text-white/70 transition hover:bg-white/12 hover:text-white"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-4 space-y-3 text-sm">
        <EvidenceBlock label={copy.sourceQuestion} value={evidence.question[locale]} />
        <EvidenceBlock label={copy.answerExcerpt} value={evidence.excerpt[locale]} />
        <EvidenceBlock label={copy.whyItMatters} value={evidence.explanation[locale]} />
        <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-xs text-white/62">
          {copy.providerModel}: {evidence.provider} / {evidence.model} / {evidence.timestampLabel}
        </div>
      </div>
    </aside>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-2">
      <div className="text-[10px] uppercase tracking-[0.12em] text-white/38">{label}</div>
      <div className="mt-1 font-mono text-sm text-white">{value}</div>
    </div>
  );
}

function EvidenceBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-[0.14em] text-white/38">{label}</div>
      <p className="mt-1 leading-6 text-white/72">{value}</p>
    </div>
  );
}
