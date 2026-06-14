"use client";

import type { MutableRefObject, PointerEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";

import {
  demoNebulaEntity,
  demoNebulaNodes,
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

type HitNode = {
  node: DemoNebulaNode;
  x: number;
  y: number;
  radius: number;
};

type Particle = {
  x: number;
  y: number;
  angle: number;
  distance: number;
  scatter: number;
  branch: number;
  layer: "field" | "filament";
  radius: number;
  alpha: number;
  speed: number;
  phase: number;
  hue: "gold" | "orange" | "cyan" | "violet" | "rose" | "white";
};

type LayoutNode = {
  node: DemoNebulaNode;
  x: number;
  y: number;
  radius: number;
  alpha: number;
  angle: number;
  distance: number;
};

const TAU = Math.PI * 2;

const termColors: Record<DemoNebulaTermType, { fill: string; stroke: string; glow: string; aura: string }> = {
  POSITIVE: { fill: "#8be9ff", stroke: "#22d3ee", glow: "rgba(34,211,238,0.88)", aura: "rgba(14,165,233,0.32)" },
  RISK: { fill: "#ff6f91", stroke: "#fb7185", glow: "rgba(251,113,133,0.82)", aura: "rgba(190,18,60,0.28)" },
  COMPETITOR: { fill: "#ffc766", stroke: "#f59e0b", glow: "rgba(245,158,11,0.92)", aura: "rgba(217,119,6,0.34)" },
  SCENARIO: { fill: "#bfa7ff", stroke: "#a78bfa", glow: "rgba(167,139,250,0.84)", aura: "rgba(124,58,237,0.28)" },
  OPPORTUNITY: { fill: "#8dffbf", stroke: "#34d399", glow: "rgba(52,211,153,0.8)", aura: "rgba(5,150,105,0.26)" },
  MISSING: { fill: "#f0abfc", stroke: "#d946ef", glow: "rgba(217,70,239,0.76)", aura: "rgba(147,51,234,0.24)" },
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
  const particlesRef = useRef<Particle[]>([]);
  const sizeRef = useRef({ width: 0, height: 0, dpr: 1, isMobile: false });
  const pointerRef = useRef({ x: 0, y: 0, active: false });
  const hoveredIdRef = useRef<string | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; width: number; node: DemoNebulaNode } | null>(null);

  const selectedNode = useMemo(
    () => demoNebulaNodes.find((node) => node.id === selectedId) ?? null,
    [selectedId],
  );

  useEffect(() => {
    hoveredIdRef.current = hoveredId;
  }, [hoveredId]);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

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

    function resize() {
      const rect = shellElement.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const isMobile = rect.width < 720;
      canvasElement.width = Math.max(1, Math.floor(rect.width * dpr));
      canvasElement.height = Math.max(1, Math.floor(rect.height * dpr));
      canvasElement.style.width = `${rect.width}px`;
      canvasElement.style.height = `${rect.height}px`;
      sizeRef.current = { width: rect.width, height: rect.height, dpr, isMobile };
      particlesRef.current = createParticles(isMobile ? 780 : 3600);
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

      renderContext.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawNebulaFrame({
        context: renderContext,
        width,
        height,
        time,
        locale,
        isMobile,
        reducedMotion: reducedMotion.matches,
        particles: particlesRef.current,
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
    if (hit) {
      setSelectedId(hit.node.id);
    }
  }

  return (
    <div
      ref={shellRef}
      className={cn("relative min-h-[calc(100svh-3.5rem)] overflow-hidden bg-[#02040d]", className)}
    >
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
          style={{
            left: Math.min(tooltip.x + 18, tooltip.width - 280),
            top: Math.max(20, tooltip.y - 22),
          }}
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

      <DemoNebulaEvidencePanel
        locale={locale}
        copy={copy}
        node={selectedNode}
        onClose={() => setSelectedId(null)}
      />
    </div>
  );
}

function drawNebulaFrame(input: {
  context: CanvasRenderingContext2D;
  width: number;
  height: number;
  time: number;
  locale: MarketingLocale;
  isMobile: boolean;
  reducedMotion: boolean;
  particles: Particle[];
  pointer: { x: number; y: number; active: boolean };
  hoveredId: string | null;
  selectedId: string | null;
  hitNodesRef: MutableRefObject<HitNode[]>;
}) {
  const { context, width, height, time, isMobile, reducedMotion, particles, pointer, hoveredId, selectedId, hitNodesRef } = input;
  const center = {
    x: width * (isMobile ? 0.5 : 0.53) + (pointer.active && !isMobile ? (pointer.x - width / 2) * 0.012 : 0),
    y: height * (isMobile ? 0.42 : 0.5) + (pointer.active && !isMobile ? (pointer.y - height / 2) * 0.01 : 0),
  };
  const t = reducedMotion ? 0 : time * 0.001;

  context.clearRect(0, 0, width, height);
  drawBackground(context, width, height, center, t);
  drawDecorativeThreads(context, width, height, center, t, isMobile, reducedMotion);
  drawPeripheralWebs(context, width, height, center, t, isMobile, reducedMotion);
  drawParticles(context, width, height, center, particles, t, reducedMotion, isMobile);

  const nodes = [...demoNebulaNodes]
    .sort((a, b) => b.semanticGravity - a.semanticGravity)
    .slice(0, isMobile ? 18 : 34);
  const layouts = nodes.map((node, index) => layoutNode(node, index, center, width, height, t, isMobile, reducedMotion));
  hitNodesRef.current = layouts.map(({ node, x, y, radius }) => ({ node, x, y, radius }));

  drawSemanticWeb(context, center, layouts, hoveredId, selectedId);
  drawCenterEntity(context, center, time, reducedMotion, isMobile);

  for (const layout of layouts) {
    drawSemanticNode(context, layout, input.locale, hoveredId, selectedId);
  }
}

function drawBackground(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  center: { x: number; y: number },
  time: number,
) {
  const bg = context.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, "#01020a");
  bg.addColorStop(0.34, "#061322");
  bg.addColorStop(0.68, "#090611");
  bg.addColorStop(1, "#02030b");
  context.fillStyle = bg;
  context.fillRect(0, 0, width, height);

  drawGlow(context, center.x, center.y, Math.min(width, height) * 0.62, `rgba(255,167,55,${0.17 + Math.sin(time * 0.7) * 0.02})`);
  drawGlow(context, center.x + width * 0.08, center.y - height * 0.06, Math.min(width, height) * 0.4, "rgba(255,219,130,0.08)");
  drawGlow(context, width * 0.2, height * 0.16, Math.min(width, height) * 0.34, "rgba(34,211,238,0.15)");
  drawGlow(context, width * 0.82, height * 0.28, Math.min(width, height) * 0.38, "rgba(59,130,246,0.14)");
  drawGlow(context, width * 0.18, height * 0.8, Math.min(width, height) * 0.34, "rgba(236,72,153,0.12)");
  drawGlow(context, width * 0.76, height * 0.78, Math.min(width, height) * 0.34, "rgba(168,85,247,0.12)");

  const vignette = context.createRadialGradient(center.x, center.y, 0, center.x, center.y, Math.max(width, height) * 0.72);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(0.74, "rgba(0,0,0,0.16)");
  vignette.addColorStop(1, "rgba(0,0,0,0.58)");
  context.fillStyle = vignette;
  context.fillRect(0, 0, width, height);
}

function drawDecorativeThreads(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  center: { x: number; y: number },
  time: number,
  isMobile: boolean,
  reducedMotion: boolean,
) {
  const branchCount = isMobile ? 52 : 118;
  const maxRadius = Math.max(width, height) * (isMobile ? 0.72 : 0.76);
  context.save();
  context.globalCompositeOperation = "lighter";
  for (let branch = 0; branch < branchCount; branch += 1) {
    const baseAngle = (branch / branchCount) * TAU + (seeded(branch, 12) - 0.5) * 0.18;
    const strandCount = isMobile ? 2 : 3;
    for (let strand = 0; strand < strandCount; strand += 1) {
      const phase = seeded(branch * 7 + strand, 4) * TAU;
      const wave = reducedMotion ? 0 : Math.sin(time * (0.09 + seeded(branch, 8) * 0.1) + phase) * 0.055;
      const angle = baseAngle + wave + (strand - 1) * 0.035;
      const distance = maxRadius * (0.28 + seeded(branch * 13 + strand, 5) * 0.72);
      const curl = (seeded(branch, 15) - 0.5) * 0.42;
      const end = pointOnField(center, angle + curl * 0.18, distance, isMobile);
      const cp1 = pointOnField(center, angle - curl, distance * 0.32, isMobile);
      const cp2 = pointOnField(center, angle + curl, distance * 0.72, isMobile);
      const hue = branchHue(branch);
      const alpha = 0.035 + seeded(branch * 17 + strand, 2) * (isMobile ? 0.05 : 0.1);

      context.beginPath();
      context.moveTo(center.x, center.y);
      context.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, end.x, end.y);
      context.strokeStyle = colorWithAlpha(hue, alpha);
      context.lineWidth = 0.25 + seeded(branch * 19 + strand, 3) * (isMobile ? 0.55 : 0.95);
      context.stroke();

      if (!isMobile && branch % 3 === 0) {
        const forkDistance = distance * (0.45 + seeded(branch, 9) * 0.25);
        const fork = pointOnField(center, angle + (seeded(branch, 11) - 0.5) * 0.7, forkDistance, false);
        context.beginPath();
        context.moveTo(cp1.x, cp1.y);
        context.quadraticCurveTo(cp2.x, cp2.y, fork.x, fork.y);
        context.strokeStyle = colorWithAlpha(hue, alpha * 0.72);
        context.lineWidth = 0.22;
        context.stroke();
      }
    }
  }
  context.restore();
}

function drawPeripheralWebs(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  center: { x: number; y: number },
  time: number,
  isMobile: boolean,
  reducedMotion: boolean,
) {
  const clusterCount = isMobile ? 5 : 11;
  const fieldRadius = Math.max(width, height) * (isMobile ? 0.56 : 0.62);
  context.save();
  context.globalCompositeOperation = "lighter";
  for (let cluster = 0; cluster < clusterCount; cluster += 1) {
    const clusterAngle = (cluster / clusterCount) * TAU + seeded(cluster, 31) * 0.9;
    const clusterDistance = fieldRadius * (0.34 + seeded(cluster, 32) * 0.52);
    const anchor = pointOnField(center, clusterAngle, clusterDistance, isMobile);
    const hue = branchHue(cluster * 5);
    drawGlow(context, anchor.x, anchor.y, Math.min(width, height) * (isMobile ? 0.11 : 0.16), colorWithAlpha(hue, isMobile ? 0.08 : 0.12));

    const arms = isMobile ? 9 : 18;
    for (let arm = 0; arm < arms; arm += 1) {
      const armAngle = clusterAngle + Math.PI + (arm / arms - 0.5) * 1.9 + (seeded(cluster * 41 + arm, 2) - 0.5) * 0.7;
      const motion = reducedMotion ? 0 : Math.sin(time * (0.08 + seeded(arm, 4) * 0.08) + seeded(cluster, 6) * TAU) * 0.06;
      const distance = Math.min(width, height) * (0.08 + seeded(cluster * 43 + arm, 8) * (isMobile ? 0.16 : 0.24));
      const end = {
        x: anchor.x + Math.cos(armAngle + motion) * distance,
        y: anchor.y + Math.sin(armAngle + motion) * distance * 0.82,
      };
      const cp = {
        x: anchor.x + Math.cos(armAngle + motion + 0.7) * distance * 0.5,
        y: anchor.y + Math.sin(armAngle + motion - 0.5) * distance * 0.45,
      };
      context.beginPath();
      context.moveTo(anchor.x, anchor.y);
      context.quadraticCurveTo(cp.x, cp.y, end.x, end.y);
      context.strokeStyle = colorWithAlpha(hue, 0.045 + seeded(cluster * 47 + arm, 9) * (isMobile ? 0.04 : 0.08));
      context.lineWidth = 0.25 + seeded(cluster * 49 + arm, 10) * 0.8;
      context.stroke();

      if (arm % 4 === 0) {
        context.beginPath();
        context.arc(end.x, end.y, 1.2 + seeded(cluster * 53 + arm, 11) * 2.2, 0, TAU);
        context.fillStyle = colorWithAlpha(hue, 0.28);
        context.fill();
      }
    }
  }
  context.restore();
}

function drawParticles(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  center: { x: number; y: number },
  particles: Particle[],
  time: number,
  reducedMotion: boolean,
  isMobile: boolean,
) {
  context.save();
  context.globalCompositeOperation = "lighter";
  for (let index = 0; index < particles.length; index += 1) {
    const particle = particles[index];
    const point = particle.layer === "field"
      ? fieldParticlePosition(particle, width, height, time, reducedMotion)
      : filamentParticlePosition(particle, center, width, height, time, reducedMotion, isMobile);
    const pulse = reducedMotion ? 1 : 0.78 + Math.sin(time * particle.speed + particle.phase) * 0.22;
    const alpha = Math.max(0.02, particle.alpha * pulse);
    const color = particleColor(particle.hue, alpha);

    if (particle.radius > 1.55 && index % 7 === 0) {
      drawGlow(context, point.x, point.y, particle.radius * 8, particleColor(particle.hue, alpha * 0.2));
    }

    context.beginPath();
    context.arc(point.x, point.y, particle.radius, 0, TAU);
    context.fillStyle = color;
    context.fill();
  }
  context.restore();
}

function drawSemanticWeb(
  context: CanvasRenderingContext2D,
  center: { x: number; y: number },
  layouts: LayoutNode[],
  hoveredId: string | null,
  selectedId: string | null,
) {
  context.save();
  context.globalCompositeOperation = "lighter";
  for (const layout of layouts) {
    const active = layout.node.id === hoveredId || layout.node.id === selectedId;
    drawDataEdge(context, center, layout, active);
  }

  for (let index = 0; index < layouts.length; index += 1) {
    for (let next = index + 1; next < layouts.length; next += 1) {
      const source = layouts[index];
      const target = layouts[next];
      const sameCluster = source.node.cluster === target.node.cluster;
      const angleGap = Math.abs(source.angle - target.angle);
      const related = sameCluster || angleGap < 0.34 || Math.abs(source.node.coMentionStrength - target.node.coMentionStrength) < 6;
      if (!related) continue;
      const distance = Math.hypot(source.x - target.x, source.y - target.y);
      if (distance > 260) continue;
      const active = source.node.id === hoveredId || target.node.id === hoveredId || source.node.id === selectedId || target.node.id === selectedId;
      const color = termColors[source.node.termType];
      const alpha = active ? 0.34 : sameCluster ? 0.075 : 0.045;
      context.beginPath();
      context.moveTo(source.x, source.y);
      const cpX = (source.x + target.x + center.x) / 3;
      const cpY = (source.y + target.y + center.y) / 3;
      context.quadraticCurveTo(cpX, cpY, target.x, target.y);
      context.strokeStyle = color.glow.replace(/[\d.]+\)$/u, `${alpha})`);
      context.lineWidth = active ? 1.1 : 0.35;
      context.stroke();
    }
  }
  context.restore();
}

function drawDataEdge(
  context: CanvasRenderingContext2D,
  center: { x: number; y: number },
  layout: LayoutNode,
  active: boolean,
) {
  const { node, x, y, angle } = layout;
  const color = termColors[node.termType];
  const edgeStrength = node.coMentionStrength / 100;
  const midDistance = layout.distance * 0.54;
  const mid = pointOnField(center, angle + Math.sin(angle * 2) * 0.2, midDistance, false);
  context.beginPath();
  context.moveTo(center.x, center.y);
  context.quadraticCurveTo(mid.x, mid.y, x, y);
  context.strokeStyle = color.glow.replace(/[\d.]+\)$/u, `${active ? 0.62 : 0.07 + edgeStrength * 0.2})`);
  context.lineWidth = active ? 1.9 + edgeStrength * 1.5 : 0.35 + edgeStrength * 0.82;
  context.stroke();
}

function drawCenterEntity(
  context: CanvasRenderingContext2D,
  center: { x: number; y: number },
  time: number,
  reducedMotion: boolean,
  isMobile: boolean,
) {
  const pulse = reducedMotion ? 0 : Math.sin(time * 0.0018) * 0.14;
  const coreRadius = isMobile ? 17 : 25;
  context.save();
  context.globalCompositeOperation = "lighter";
  drawGlow(context, center.x, center.y, coreRadius * (15 + pulse * 3), "rgba(255,149,34,0.28)");
  drawGlow(context, center.x, center.y, coreRadius * (8 + pulse * 2), "rgba(255,210,92,0.34)");
  drawGlow(context, center.x, center.y, coreRadius * (3.8 + pulse), "rgba(255,255,255,0.42)");

  const rayCount = isMobile ? 34 : 72;
  for (let index = 0; index < rayCount; index += 1) {
    const angle = (index / rayCount) * TAU + seeded(index, 21) * 0.04;
    const length = coreRadius * (2.2 + seeded(index, 22) * (isMobile ? 4 : 8));
    const start = pointOnField(center, angle, coreRadius * 0.52, isMobile);
    const end = pointOnField(center, angle + (seeded(index, 23) - 0.5) * 0.06, length, isMobile);
    const gradient = context.createLinearGradient(start.x, start.y, end.x, end.y);
    gradient.addColorStop(0, "rgba(255,255,245,0.78)");
    gradient.addColorStop(0.42, "rgba(255,183,66,0.28)");
    gradient.addColorStop(1, "rgba(255,183,66,0)");
    context.beginPath();
    context.moveTo(start.x, start.y);
    context.lineTo(end.x, end.y);
    context.strokeStyle = gradient;
    context.lineWidth = 0.5 + seeded(index, 24) * 1.2;
    context.stroke();
  }

  const gradient = context.createRadialGradient(center.x - 6, center.y - 8, 0, center.x, center.y, coreRadius);
  gradient.addColorStop(0, "#ffffff");
  gradient.addColorStop(0.22, "#fff7cf");
  gradient.addColorStop(0.58, "#ffb02e");
  gradient.addColorStop(1, "#f97316");
  context.beginPath();
  context.arc(center.x, center.y, coreRadius, 0, TAU);
  context.fillStyle = gradient;
  context.fill();
  context.restore();
}

function drawSemanticNode(
  context: CanvasRenderingContext2D,
  layout: LayoutNode,
  locale: MarketingLocale,
  hoveredId: string | null,
  selectedId: string | null,
) {
  const { node, x, y, radius, alpha } = layout;
  const color = termColors[node.termType];
  const active = node.id === hoveredId || node.id === selectedId;
  const glowAlpha = active ? 0.54 : Math.max(0.16, alpha * 0.32);

  context.save();
  context.globalCompositeOperation = "lighter";
  drawGlow(context, x, y, radius * (active ? 8.5 : 5.2), color.aura.replace(/[\d.]+\)$/u, `${glowAlpha})`));
  drawGlow(context, x, y, radius * (active ? 4.2 : 2.7), color.glow.replace(/[\d.]+\)$/u, `${glowAlpha * 0.72})`));

  const gradient = context.createRadialGradient(x - radius * 0.28, y - radius * 0.34, 0, x, y, radius * 1.18);
  gradient.addColorStop(0, "rgba(255,255,255,0.98)");
  gradient.addColorStop(0.26, color.fill);
  gradient.addColorStop(1, color.stroke);
  context.beginPath();
  context.arc(x, y, radius, 0, TAU);
  context.globalAlpha = Math.min(1, active ? 1 : alpha);
  context.fillStyle = gradient;
  context.fill();
  context.globalAlpha = 1;

  context.beginPath();
  context.arc(x, y, radius + (active ? 4 : 2), 0, TAU);
  context.strokeStyle = active ? "rgba(255,255,255,0.86)" : color.glow.replace(/[\d.]+\)$/u, `${0.24 + node.evidenceConfidence / 520})`);
  context.lineWidth = active ? 1.5 : 0.7;
  context.stroke();

  if (active) {
    context.font = active ? "600 12px Geist, ui-sans-serif, system-ui" : "11px Geist, ui-sans-serif, system-ui";
    context.fillStyle = active ? "rgba(255,255,255,0.96)" : "rgba(226,232,240,0.72)";
    context.shadowColor = "rgba(0,0,0,0.8)";
    context.shadowBlur = 8;
    context.fillText(node.term[locale], x + radius + 8, y + 4);
  }
  context.restore();
}

function layoutNode(
  node: DemoNebulaNode,
  index: number,
  center: { x: number; y: number },
  width: number,
  height: number,
  time: number,
  isMobile: boolean,
  reducedMotion: boolean,
): LayoutNode {
  const fieldRadius = Math.max(width, height) * (isMobile ? 0.44 : 0.48);
  const association = node.observableAssociationStrength / 100;
  const drift = reducedMotion ? 0 : Math.sin(time * 0.14 + index * 0.63) * 0.04;
  const angle = node.angle + drift;
  const seededOffset = (seeded(index, 41) - 0.5) * fieldRadius * (isMobile ? 0.1 : 0.18);
  const distance = fieldRadius * (0.12 + (1 - association) * 0.62) + (index % 5) * (isMobile ? 4 : 10) + seededOffset;
  const point = pointOnField(center, angle + (seeded(index, 42) - 0.5) * 0.14, Math.max(fieldRadius * 0.11, distance), isMobile);
  const confidence = node.evidenceConfidence / 100;
  return {
    node,
    x: point.x,
    y: point.y,
    radius: 4.2 + node.semanticGravity / (isMobile ? 10.5 : 7.8),
    alpha: 0.42 + confidence * 0.58,
    angle,
    distance,
  };
}

function pointOnField(center: { x: number; y: number }, angle: number, distance: number, isMobile: boolean) {
  return {
    x: center.x + Math.cos(angle) * distance * (isMobile ? 0.9 : 1.22),
    y: center.y + Math.sin(angle) * distance * (isMobile ? 0.92 : 0.74),
  };
}

function drawGlow(context: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string) {
  const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, color);
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  context.fillStyle = gradient;
  context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}

function createParticles(count: number) {
  return Array.from({ length: count }, (_, index) => {
    const layer = seeded(index, 1) < 0.22 ? "field" : "filament";
    const branchCount = 84;
    const branch = Math.floor(seeded(index, 2) * branchCount);
    const branchAngle = (branch / branchCount) * TAU + (seeded(index, 3) - 0.5) * 0.24;
    const distance = 0.035 + Math.pow(seeded(index, 4), 0.62) * 0.98;
    const scatter = (seeded(index, 5) - 0.5) * (0.02 + distance * 0.22);
    const hueSeed = seeded(index, 6);
    const radiusSeed = seeded(index, 7);
    const brightSeed = seeded(index, 8);
    return {
      x: seeded(index, 9),
      y: seeded(index, 10),
      angle: branchAngle + scatter + Math.sin(distance * 7 + branch) * 0.08,
      distance,
      scatter,
      branch,
      layer,
      radius: radiusSeed > 0.988 ? 2.8 + seeded(index, 11) * 2.6 : 0.28 + Math.pow(radiusSeed, 1.7) * 1.5,
      alpha: (brightSeed > 0.985 ? 0.72 : 0.1 + seeded(index, 12) * 0.34) * (layer === "field" ? 0.6 : 1),
      speed: 0.04 + seeded(index, 13) * 0.22,
      phase: seeded(index, 14) * TAU,
      hue: hueSeed > 0.84 ? "cyan" : hueSeed > 0.72 ? "violet" : hueSeed > 0.62 ? "rose" : hueSeed > 0.18 ? "gold" : "white",
    } satisfies Particle;
  });
}

function fieldParticlePosition(particle: Particle, width: number, height: number, time: number, reducedMotion: boolean) {
  const drift = reducedMotion ? 0 : Math.sin(time * particle.speed + particle.phase) * 8;
  return {
    x: particle.x * width + drift,
    y: particle.y * height + (reducedMotion ? 0 : Math.cos(time * particle.speed * 0.7 + particle.phase) * 6),
  };
}

function filamentParticlePosition(
  particle: Particle,
  center: { x: number; y: number },
  width: number,
  height: number,
  time: number,
  reducedMotion: boolean,
  isMobile: boolean,
) {
  const maxRadius = Math.max(width, height) * (isMobile ? 0.7 : 0.74);
  const motion = reducedMotion ? 0 : Math.sin(time * particle.speed + particle.phase) * 0.018;
  const angle = particle.angle + motion + Math.sin(particle.distance * 4 + particle.branch) * 0.06;
  const distance = particle.distance * maxRadius;
  const cross = particle.scatter * maxRadius;
  return {
    x: center.x + Math.cos(angle) * distance * (isMobile ? 0.9 : 1.08) + Math.cos(angle + Math.PI / 2) * cross,
    y: center.y + Math.sin(angle) * distance * (isMobile ? 0.88 : 0.7) + Math.sin(angle + Math.PI / 2) * cross * 0.72,
  };
}

function particleColor(hue: Particle["hue"], alpha: number) {
  switch (hue) {
    case "cyan":
      return `rgba(55,221,255,${alpha})`;
    case "violet":
      return `rgba(191,129,255,${alpha})`;
    case "rose":
      return `rgba(255,112,188,${alpha})`;
    case "orange":
      return `rgba(255,128,48,${alpha})`;
    case "white":
      return `rgba(245,250,255,${alpha})`;
    case "gold":
    default:
      return `rgba(255,178,64,${alpha})`;
  }
}

function branchHue(branch: number) {
  const mode = branch % 9;
  if (mode === 0 || mode === 1) return "rgba(255,177,62,1)";
  if (mode === 2 || mode === 3) return "rgba(36,211,238,1)";
  if (mode === 4) return "rgba(185,110,255,1)";
  if (mode === 5) return "rgba(255,104,176,1)";
  return "rgba(255,214,136,1)";
}

function colorWithAlpha(color: string, alpha: number) {
  return color.replace(/[\d.]+\)$/u, `${alpha})`);
}

function seeded(index: number, salt: number) {
  const value = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function findHitNode(nodes: HitNode[], x: number, y: number) {
  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    const item = nodes[index];
    if (Math.hypot(item.x - x, item.y - y) <= item.radius + 9) {
      return item;
    }
  }
  return null;
}

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
  if (!node) {
    return null;
  }

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
