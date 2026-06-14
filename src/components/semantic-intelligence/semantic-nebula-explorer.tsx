"use client";

import type { MutableRefObject, PointerEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type NebulaNode = {
  id: string;
  term: string;
  normalizedTerm: string;
  termType: string;
  polarity: string;
  semanticGravity: number;
  proximityScore: number;
  frequencyScore: number;
  stabilityScore: number;
  coMentionStrength: number;
  recommendationContextWeight: number;
  evidenceConfidence: number;
  sourceCount: number;
  promptCount: number;
  modelCount: number;
  components: Record<string, number>;
  examples: EvidenceItem[];
  context?: {
    competitorContext?: boolean;
    riskContext?: boolean;
    missingDesired?: boolean;
  };
};

type EvidenceItem = {
  question?: string | null;
  excerpt: string;
  probeFamily?: string | null;
  scenario?: string | null;
  provider?: string | null;
  model?: string | null;
  createdAt?: string | null;
};

type NebulaSnapshot = {
  id: string;
  scope: string;
  nodeJson: unknown;
  edgeJson: unknown;
  summaryJson: unknown;
  createdAt: Date | string;
};

type Copy = {
  title: string;
  scopes: Record<string, string>;
  evidence: string;
  components: string;
  noData: string;
  showTop80: string;
  showAll: string;
  legend: string;
  gravity: string;
  confidence: string;
  closeEvidence: string;
};

type LayoutNode = {
  node: NebulaNode;
  rank: number;
  x: number;
  y: number;
  radius: number;
  alpha: number;
  angle: number;
  distance: number;
  showLabel: boolean;
};

type HitNode = Pick<LayoutNode, "node" | "x" | "y" | "radius">;

type Particle = {
  seed: number;
  angle: number;
  distance: number;
  scatter: number;
  radius: number;
  alpha: number;
  speed: number;
  phase: number;
  hue: "gold" | "cyan" | "violet" | "rose" | "white";
  layer: "field" | "filament";
};

const scopeOrder = ["OVERALL", "POSITIVE_NEGATIVE", "SCENARIO", "COMPETITOR", "MISSING", "RISK"];
const TAU = Math.PI * 2;
const PREVIEW_NODE_LIMIT = 120;
const MOBILE_RENDER_LIMIT = 60;

const clusterAngles: Record<string, number> = {
  POSITIVE: -0.95,
  BENEFIT: -0.58,
  TRUST: -0.3,
  SCENARIO: 0.08,
  AUDIENCE: 0.48,
  COMPETITOR: 0.88,
  RISK: 1.32,
  NEGATIVE: 1.62,
  INCORRECT: 1.85,
  UNDESIRED: 1.72,
  MISSING: 2.2,
  DESIRED: -1.2,
  FUNCTIONAL: 0.28,
  CATEGORY: -1.52,
  DESCRIPTIVE: -1.72,
  OTHER: 2.7,
};

const typeColors: Record<string, { fill: string; stroke: string; glow: string; aura: string }> = {
  POSITIVE: { fill: "#8be9ff", stroke: "#22d3ee", glow: "rgba(34,211,238,0.88)", aura: "rgba(14,165,233,0.28)" },
  BENEFIT: { fill: "#8dffbf", stroke: "#34d399", glow: "rgba(52,211,153,0.82)", aura: "rgba(5,150,105,0.24)" },
  TRUST: { fill: "#7ff7da", stroke: "#2dd4bf", glow: "rgba(45,212,191,0.8)", aura: "rgba(20,184,166,0.24)" },
  SCENARIO: { fill: "#8cbcff", stroke: "#60a5fa", glow: "rgba(96,165,250,0.78)", aura: "rgba(37,99,235,0.22)" },
  AUDIENCE: { fill: "#ff9ed0", stroke: "#f472b6", glow: "rgba(244,114,182,0.72)", aura: "rgba(219,39,119,0.2)" },
  COMPETITOR: { fill: "#ffc766", stroke: "#f59e0b", glow: "rgba(245,158,11,0.9)", aura: "rgba(217,119,6,0.28)" },
  RISK: { fill: "#ff7b8d", stroke: "#fb7185", glow: "rgba(251,113,133,0.82)", aura: "rgba(190,18,60,0.24)" },
  NEGATIVE: { fill: "#ff6f91", stroke: "#f43f5e", glow: "rgba(244,63,94,0.78)", aura: "rgba(190,18,60,0.24)" },
  INCORRECT: { fill: "#ff9a4f", stroke: "#fb923c", glow: "rgba(251,146,60,0.8)", aura: "rgba(234,88,12,0.24)" },
  UNDESIRED: { fill: "#ff8da1", stroke: "#fb7185", glow: "rgba(251,113,133,0.72)", aura: "rgba(225,29,72,0.2)" },
  MISSING: { fill: "#d0a8ff", stroke: "#a78bfa", glow: "rgba(167,139,250,0.78)", aura: "rgba(124,58,237,0.24)" },
  DESIRED: { fill: "#d8ff86", stroke: "#a3e635", glow: "rgba(163,230,53,0.72)", aura: "rgba(101,163,13,0.2)" },
  DEFAULT: { fill: "#e2e8f0", stroke: "#cbd5e1", glow: "rgba(203,213,225,0.54)", aura: "rgba(148,163,184,0.18)" },
};

export function SemanticNebulaExplorer({
  snapshots,
  subjectName,
  copy,
}: {
  snapshots: NebulaSnapshot[];
  subjectName: string;
  copy: Copy;
}) {
  const [scope, setScope] = useState(snapshots[0]?.scope ?? "OVERALL");
  const [expanded, setExpanded] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const snapshotByScope = useMemo(() => new Map(snapshots.map((snapshot) => [snapshot.scope, snapshot])), [snapshots]);
  const activeSnapshot = snapshotByScope.get(scope) ?? snapshots[0];
  const nodes = useMemo(() => parseNodes(activeSnapshot?.nodeJson), [activeSnapshot]);
  const visibleNodes = useMemo(() => {
    const sorted = [...nodes].sort((a, b) => safeNumber(b.semanticGravity) - safeNumber(a.semanticGravity));
    return expanded ? sorted : sorted.slice(0, PREVIEW_NODE_LIMIT);
  }, [expanded, nodes]);
  const selectedNode = visibleNodes.find((node) => node.id === selectedNodeId) ?? null;

  if (!snapshots.length || !activeSnapshot) {
    return <EmptyNebula copy={copy} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {scopeOrder.filter((item) => snapshotByScope.has(item)).map((item) => (
          <Button
            key={item}
            type="button"
            variant={item === scope ? "default" : "outline"}
            size="sm"
            onClick={() => {
              setScope(item);
              setSelectedNodeId(null);
            }}
          >
            {copy.scopes[item] ?? item}
          </Button>
        ))}
        {nodes.length > PREVIEW_NODE_LIMIT ? (
          <Button type="button" variant="outline" size="sm" onClick={() => setExpanded((value) => !value)}>
            {expanded ? copy.showTop80.replace("80", String(PREVIEW_NODE_LIMIT)) : copy.showAll}
          </Button>
        ) : null}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <RealSemanticNebulaCanvas
          key={`${activeSnapshot.id}-${expanded ? "expanded" : "top"}`}
          subjectName={subjectName}
          nodes={visibleNodes}
          totalNodeCount={nodes.length}
          selectedNodeId={selectedNodeId}
          onSelectNode={setSelectedNodeId}
          ariaLabel={`${subjectName} ${copy.title}`}
          copy={copy}
        />

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{copy.legend}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {["BENEFIT", "TRUST", "SCENARIO", "COMPETITOR", "RISK", "MISSING"].map((termType) => {
                const color = typeColors[termType] ?? typeColors.DEFAULT;
                return (
                  <Badge key={termType} variant="secondary" className="gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color.stroke }} />
                    {termType}
                  </Badge>
                );
              })}
            </CardContent>
          </Card>

          {selectedNode ? (
            <EvidencePanel node={selectedNode} copy={copy} onClose={() => setSelectedNodeId(null)} />
          ) : (
            <Card>
              <CardContent className="p-5 text-sm text-faint">{copy.noData}</CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function RealSemanticNebulaCanvas({
  subjectName,
  nodes,
  totalNodeCount,
  selectedNodeId,
  onSelectNode,
  ariaLabel,
  copy,
}: {
  subjectName: string;
  nodes: NebulaNode[];
  totalNodeCount: number;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string | null) => void;
  ariaLabel: string;
  copy: Copy;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const hitNodesRef = useRef<HitNode[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const pointerRef = useRef({ x: 0, y: 0, active: false });
  const sizeRef = useRef({ width: 0, height: 0, dpr: 1, isMobile: false });
  const nodesRef = useRef<NebulaNode[]>(nodes);
  const selectedNodeIdRef = useRef<string | null>(selectedNodeId);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; width: number; node: NebulaNode } | null>(null);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  useEffect(() => {
    selectedNodeIdRef.current = selectedNodeId;
  }, [selectedNodeId]);

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
    let frame = 0;
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
      particlesRef.current = createParticles(isMobile ? 520 : 1800);
    }

    function scheduleResize() {
      if (resizeTimer) window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(resize, 80);
    }

    function render(time: number) {
      const { width, height, dpr, isMobile } = sizeRef.current;
      if (width <= 0 || height <= 0) {
        frame = window.requestAnimationFrame(render);
        return;
      }

      renderContext.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawNebulaFrame({
        context: renderContext,
        width,
        height,
        time,
        subjectName,
        nodes: nodesRef.current,
        particles: particlesRef.current,
        pointer: pointerRef.current,
        isMobile,
        reducedMotion: reducedMotion.matches,
        selectedNodeId: selectedNodeIdRef.current,
        hitNodesRef,
      });

      if (!reducedMotion.matches) {
        frame = window.requestAnimationFrame(render);
      }
    }

    resize();
    render(0);
    window.addEventListener("resize", scheduleResize);
    reducedMotion.addEventListener("change", scheduleResize);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", scheduleResize);
      reducedMotion.removeEventListener("change", scheduleResize);
      if (resizeTimer) window.clearTimeout(resizeTimer);
    };
  }, [subjectName]);

  function handlePointerMove(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    pointerRef.current = { x, y, active: true };
    const hit = findHitNode(hitNodesRef.current, x, y);
    setHoveredNodeId(hit?.node.id ?? null);
    setTooltip(hit ? { x, y, width: rect.width, node: hit.node } : null);
    canvas.style.cursor = hit ? "pointer" : "default";
  }

  function handlePointerLeave() {
    pointerRef.current.active = false;
    setHoveredNodeId(null);
    setTooltip(null);
  }

  function handlePointerDown(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const hit = findHitNode(hitNodesRef.current, event.clientX - rect.left, event.clientY - rect.top);
    if (hit) onSelectNode(hit.node.id);
  }

  const activeTooltip = tooltip && hoveredNodeId === tooltip.node.id ? tooltip : null;

  return (
    <div
      ref={shellRef}
      className="relative min-h-[560px] overflow-hidden rounded-2xl border border-border bg-[oklch(0.08_0.02_264)] shadow-[0_40px_130px_-40px_oklch(0.04_0.04_264/80%)] md:min-h-[680px]"
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        aria-label={ariaLabel}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        onPointerDown={handlePointerDown}
      />

      <div className="pointer-events-none absolute left-4 top-4 rounded-full border border-border bg-background/40 px-3 py-1.5 text-xs text-dim backdrop-blur">
        {nodes.length}/{totalNodeCount} nodes · {copy.gravity} / {copy.confidence}
      </div>

      {activeTooltip ? (
        <div
          className="pointer-events-none absolute z-20 hidden max-w-72 rounded-lg border border-white/12 bg-slate-950/86 p-3 text-xs text-white shadow-2xl backdrop-blur md:block"
          style={{
            left: Math.min(activeTooltip.x + 18, activeTooltip.width - 300),
            top: Math.max(20, activeTooltip.y - 20),
          }}
        >
          <div className="flex items-center justify-between gap-4">
            <span className="font-medium">{activeTooltip.node.term}</span>
            <span className="text-white/45">{clusterKeyForNode(activeTooltip.node)}</span>
          </div>
          <div className="mt-2 grid gap-1 text-white/64">
            <span>{copy.gravity}: {Math.round(safeNumber(activeTooltip.node.semanticGravity))}</span>
            <span>{copy.confidence}: {Math.round(safeNumber(activeTooltip.node.evidenceConfidence))}</span>
          </div>
        </div>
      ) : null}

      <div className="absolute inset-x-4 bottom-4 flex flex-wrap gap-2 md:hidden">
        {nodes.slice(0, 10).map((node) => (
          <button
            key={node.id}
            type="button"
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs backdrop-blur",
              selectedNodeId === node.id
                ? "border-white/30 bg-white/16 text-white"
                : "border-white/10 bg-black/22 text-white/64",
            )}
            onClick={() => onSelectNode(node.id)}
          >
            {node.term.slice(0, 16)}
          </button>
        ))}
      </div>
    </div>
  );
}

function EvidencePanel({ node, copy, onClose }: { node: NebulaNode; copy: Copy; onClose: () => void }) {
  return (
    <Card className="glow-cyan">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <Badge variant="secondary">
            {clusterKeyForNode(node)}
          </Badge>
          <CardTitle className="mt-3 text-base">{node.term}</CardTitle>
          <p className="mt-1 text-sm text-faint">
            {copy.gravity} {Math.round(safeNumber(node.semanticGravity))} / {copy.confidence}{" "}
            {Math.round(safeNumber(node.evidenceConfidence))}
          </p>
        </div>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          onClick={onClose}
          aria-label={copy.closeEvidence}
        >
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="text-sm font-medium">{copy.components}</div>
          <div className="mt-2 grid gap-2">
            {Object.entries(node.components ?? {}).map(([key, value]) => (
              <div key={key} className="grid grid-cols-[1fr_48px] items-center gap-2 text-xs">
                <span className="text-faint">{key}</span>
                <span className="font-mono text-dim">{Math.round(safeNumber(value))}</span>
                <div className="col-span-2 h-1.5 overflow-hidden rounded-full bg-[oklch(0.92_0.04_255/10%)]">
                  <div className="h-full rounded-full bg-cyan" style={{ width: `${clamp(safeNumber(value), 0, 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="text-sm font-medium">{copy.evidence}</div>
          <div className="mt-2 space-y-3">
            {(node.examples ?? []).map((item, index) => (
              <div key={`${node.id}-${index}`} className="panel-inset p-3 text-sm">
                {item.question ? <div className="mb-2 font-medium text-foreground/90">{item.question}</div> : null}
                <p className="leading-6 text-dim">{item.excerpt}</p>
                <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-faint">
                  {item.probeFamily ? <span>{item.probeFamily}</span> : null}
                  {item.scenario ? <span>{item.scenario}</span> : null}
                  {item.provider ? <span>{item.provider}</span> : null}
                  {item.model ? <span>{item.model}</span> : null}
                  {item.createdAt ? <span>{new Date(item.createdAt).toLocaleString()}</span> : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyNebula({ copy }: { copy: Copy }) {
  return (
    <Card>
      <CardContent className="p-6 text-sm text-faint">{copy.noData}</CardContent>
    </Card>
  );
}

function drawNebulaFrame(input: {
  context: CanvasRenderingContext2D;
  width: number;
  height: number;
  time: number;
  subjectName: string;
  nodes: NebulaNode[];
  particles: Particle[];
  pointer: { x: number; y: number; active: boolean };
  isMobile: boolean;
  reducedMotion: boolean;
  selectedNodeId: string | null;
  hitNodesRef: MutableRefObject<HitNode[]>;
}) {
  const { context, width, height, time, subjectName, nodes, particles, pointer, isMobile, reducedMotion, selectedNodeId, hitNodesRef } = input;
  const t = reducedMotion ? 0 : time * 0.001;
  const center = {
    x: width * 0.5 + (pointer.active && !isMobile ? (pointer.x - width / 2) * 0.01 : 0),
    y: height * (isMobile ? 0.42 : 0.5) + (pointer.active && !isMobile ? (pointer.y - height / 2) * 0.008 : 0),
  };

  context.clearRect(0, 0, width, height);
  drawBackground(context, width, height, center, t);
  drawDecorativeFilaments(context, width, height, center, t, isMobile, reducedMotion);
  drawParticles(context, width, height, center, particles, t, isMobile, reducedMotion);

  const layouts = nodes
    .slice(0, isMobile ? Math.min(nodes.length, MOBILE_RENDER_LIMIT) : nodes.length)
    .map((node, index) => layoutNode(node, index, center, width, height, t, isMobile, reducedMotion));
  hitNodesRef.current = layouts.map(({ node, x, y, radius }) => ({ node, x, y, radius }));

  drawSemanticEdges(context, center, layouts, selectedNodeId);
  drawCenterEntity(context, center, subjectName, time, isMobile, reducedMotion);
  for (const layout of layouts) drawSemanticNode(context, layout, selectedNodeId);
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
  bg.addColorStop(0.34, "#061426");
  bg.addColorStop(0.68, "#090712");
  bg.addColorStop(1, "#02030b");
  context.fillStyle = bg;
  context.fillRect(0, 0, width, height);

  drawGlow(context, center.x, center.y, Math.min(width, height) * 0.68, `rgba(255,164,52,${0.16 + Math.sin(time * 0.7) * 0.02})`);
  drawGlow(context, width * 0.18, height * 0.18, Math.min(width, height) * 0.3, "rgba(34,211,238,0.14)");
  drawGlow(context, width * 0.82, height * 0.28, Math.min(width, height) * 0.34, "rgba(96,165,250,0.13)");
  drawGlow(context, width * 0.22, height * 0.82, Math.min(width, height) * 0.32, "rgba(236,72,153,0.1)");
  drawGlow(context, width * 0.78, height * 0.78, Math.min(width, height) * 0.34, "rgba(167,139,250,0.12)");

  const vignette = context.createRadialGradient(center.x, center.y, 0, center.x, center.y, Math.max(width, height) * 0.74);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(0.72, "rgba(0,0,0,0.16)");
  vignette.addColorStop(1, "rgba(0,0,0,0.62)");
  context.fillStyle = vignette;
  context.fillRect(0, 0, width, height);
}

function drawDecorativeFilaments(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  center: { x: number; y: number },
  time: number,
  isMobile: boolean,
  reducedMotion: boolean,
) {
  const branchCount = isMobile ? 42 : 96;
  const maxRadius = Math.max(width, height) * (isMobile ? 0.66 : 0.7);
  context.save();
  context.globalCompositeOperation = "lighter";
  for (let branch = 0; branch < branchCount; branch += 1) {
    const baseAngle = (branch / branchCount) * TAU + (seeded(branch, 12) - 0.5) * 0.18;
    const wave = reducedMotion ? 0 : Math.sin(time * (0.08 + seeded(branch, 8) * 0.1)) * 0.05;
    const distance = maxRadius * (0.22 + seeded(branch, 5) * 0.78);
    const curl = (seeded(branch, 15) - 0.5) * 0.44;
    const end = pointOnField(center, baseAngle + wave + curl * 0.12, distance, isMobile);
    const cp1 = pointOnField(center, baseAngle - curl, distance * 0.3, isMobile);
    const cp2 = pointOnField(center, baseAngle + curl, distance * 0.72, isMobile);
    const hue = branchHue(branch);

    context.beginPath();
    context.moveTo(center.x, center.y);
    context.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, end.x, end.y);
    context.strokeStyle = colorWithAlpha(hue, 0.035 + seeded(branch, 2) * (isMobile ? 0.045 : 0.075));
    context.lineWidth = 0.24 + seeded(branch, 3) * 0.75;
    context.stroke();
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
  isMobile: boolean,
  reducedMotion: boolean,
) {
  context.save();
  context.globalCompositeOperation = "lighter";
  for (const particle of particles) {
    const point = particle.layer === "field"
      ? {
          x: (seeded(particle.seed, 31) * width) + (reducedMotion ? 0 : Math.sin(time * particle.speed + particle.phase) * 7),
          y: (seeded(particle.seed, 32) * height) + (reducedMotion ? 0 : Math.cos(time * particle.speed + particle.phase) * 5),
        }
      : pointOnField(
          center,
          particle.angle + (reducedMotion ? 0 : Math.sin(time * particle.speed + particle.phase) * 0.018),
          particle.distance * Math.max(width, height) * 0.72 + particle.scatter,
          isMobile,
        );
    const pulse = reducedMotion ? 1 : 0.78 + Math.sin(time * particle.speed + particle.phase) * 0.22;
    context.beginPath();
    context.arc(point.x, point.y, particle.radius, 0, TAU);
    context.fillStyle = particleColor(particle.hue, particle.alpha * pulse);
    context.fill();
  }
  context.restore();
}

function drawSemanticEdges(
  context: CanvasRenderingContext2D,
  center: { x: number; y: number },
  layouts: LayoutNode[],
  selectedNodeId: string | null,
) {
  context.save();
  context.globalCompositeOperation = "lighter";
  for (const layout of layouts) {
    const color = colorForNode(layout.node);
    const active = layout.node.id === selectedNodeId;
    const strength = clamp(safeNumber(layout.node.coMentionStrength), 0, 100) / 100;
    const cp = pointOnField(center, layout.angle + Math.sin(layout.angle * 2) * 0.2, layout.distance * 0.52, false);
    context.beginPath();
    context.moveTo(center.x, center.y);
    context.quadraticCurveTo(cp.x, cp.y, layout.x, layout.y);
    context.strokeStyle = color.glow.replace(/[\d.]+\)$/u, `${active ? 0.58 : 0.06 + strength * 0.22})`);
    context.lineWidth = active ? 1.8 + strength * 1.5 : 0.32 + strength * 0.9;
    context.stroke();
  }

  for (let index = 0; index < layouts.length; index += 1) {
    for (let next = index + 1; next < layouts.length; next += 1) {
      const source = layouts[index];
      const target = layouts[next];
      if (clusterKeyForNode(source.node) !== clusterKeyForNode(target.node)) continue;
      const distance = Math.hypot(source.x - target.x, source.y - target.y);
      if (distance > 230) continue;
      const active = source.node.id === selectedNodeId || target.node.id === selectedNodeId;
      const color = colorForNode(source.node);
      context.beginPath();
      context.moveTo(source.x, source.y);
      context.quadraticCurveTo((source.x + target.x + center.x) / 3, (source.y + target.y + center.y) / 3, target.x, target.y);
      context.strokeStyle = color.glow.replace(/[\d.]+\)$/u, `${active ? 0.28 : 0.05})`);
      context.lineWidth = active ? 1 : 0.3;
      context.stroke();
    }
  }
  context.restore();
}

function drawCenterEntity(
  context: CanvasRenderingContext2D,
  center: { x: number; y: number },
  subjectName: string,
  time: number,
  isMobile: boolean,
  reducedMotion: boolean,
) {
  const pulse = reducedMotion ? 0 : Math.sin(time * 0.0018) * 0.14;
  const coreRadius = isMobile ? 20 : 30;
  context.save();
  context.globalCompositeOperation = "lighter";
  drawGlow(context, center.x, center.y, coreRadius * (14 + pulse * 2), "rgba(255,149,34,0.28)");
  drawGlow(context, center.x, center.y, coreRadius * (7 + pulse), "rgba(255,210,92,0.34)");
  drawGlow(context, center.x, center.y, coreRadius * 3.5, "rgba(255,255,255,0.36)");

  const gradient = context.createRadialGradient(center.x - 6, center.y - 8, 0, center.x, center.y, coreRadius);
  gradient.addColorStop(0, "#ffffff");
  gradient.addColorStop(0.24, "#fff7cf");
  gradient.addColorStop(0.58, "#ffb02e");
  gradient.addColorStop(1, "#f97316");
  context.beginPath();
  context.arc(center.x, center.y, coreRadius, 0, TAU);
  context.fillStyle = gradient;
  context.fill();

  context.font = `${isMobile ? 14 : 18}px Geist, ui-sans-serif, system-ui`;
  context.fillStyle = "rgba(255,255,255,0.92)";
  context.textAlign = "center";
  context.shadowColor = "rgba(0,0,0,0.9)";
  context.shadowBlur = 10;
  context.fillText(subjectName.slice(0, isMobile ? 22 : 32), center.x, center.y + coreRadius + 28);
  context.restore();
}

function drawSemanticNode(context: CanvasRenderingContext2D, layout: LayoutNode, selectedNodeId: string | null) {
  const { node, x, y, radius, alpha, showLabel } = layout;
  const color = colorForNode(node);
  const active = node.id === selectedNodeId;

  context.save();
  context.globalCompositeOperation = "lighter";
  drawGlow(context, x, y, radius * (active ? 8 : 4.8), color.aura.replace(/[\d.]+\)$/u, `${active ? 0.48 : alpha * 0.3})`));
  drawGlow(context, x, y, radius * (active ? 4 : 2.6), color.glow.replace(/[\d.]+\)$/u, `${active ? 0.44 : alpha * 0.24})`));

  const gradient = context.createRadialGradient(x - radius * 0.28, y - radius * 0.34, 0, x, y, radius * 1.15);
  gradient.addColorStop(0, "rgba(255,255,255,0.98)");
  gradient.addColorStop(0.28, color.fill);
  gradient.addColorStop(1, color.stroke);
  context.beginPath();
  context.arc(x, y, radius, 0, TAU);
  context.globalAlpha = active ? 1 : alpha;
  context.fillStyle = gradient;
  context.fill();
  context.globalAlpha = 1;

  context.beginPath();
  context.arc(x, y, radius + (active ? 4 : 2), 0, TAU);
  context.strokeStyle = active ? "rgba(255,255,255,0.9)" : color.glow.replace(/[\d.]+\)$/u, `${0.2 + safeNumber(node.evidenceConfidence) / 520})`);
  context.lineWidth = active ? 1.5 : 0.7;
  context.stroke();

  if (active || showLabel) {
    context.font = `${active ? "600" : "500"} 12px Geist, ui-sans-serif, system-ui`;
    context.fillStyle = active ? "rgba(255,255,255,0.96)" : "rgba(226,232,240,0.68)";
    context.shadowColor = "rgba(0,0,0,0.85)";
    context.shadowBlur = 8;
    context.textAlign = "left";
    context.fillText(node.term.slice(0, 28), x + radius + 8, y + 4);
  }
  context.restore();
}

function layoutNode(
  node: NebulaNode,
  index: number,
  center: { x: number; y: number },
  width: number,
  height: number,
  time: number,
  isMobile: boolean,
  reducedMotion: boolean,
): LayoutNode {
  const fieldRadius = Math.max(width, height) * (isMobile ? 0.42 : 0.46);
  const cluster = clusterKeyForNode(node);
  const baseAngle = clusterAngles[cluster] ?? clusterAngles.OTHER;
  const clusterIndex = indexWithinCluster(node, index);
  const bandSize = isMobile ? 10 : 14;
  const clusterRow = Math.floor(clusterIndex / bandSize);
  const angularSpan = isMobile ? 0.098 : 0.108;
  const spread = ((clusterIndex % bandSize) - (bandSize - 1) / 2) * angularSpan + clusterRow * 0.022;
  const orbitalRotation = reducedMotion ? 0 : time * clusterOrbitSpeed(cluster);
  const drift = reducedMotion ? 0 : Math.sin(time * 0.18 + index * 0.7) * 0.02;
  const angle = baseAngle + orbitalRotation + spread + drift;
  const proximity = clamp(safeNumber(node.proximityScore) || safeNumber(node.semanticGravity), 0, 100) / 100;
  const layerOffset = clusterRow * (isMobile ? 12 : 18);
  const distance = fieldRadius * (0.12 + (1 - proximity) * 0.66) + (index % 5) * (isMobile ? 4 : 9) + layerOffset;
  const point = pointOnField(center, angle + (seeded(index, 42) - 0.5) * 0.08, distance, isMobile);
  const gravity = clamp(safeNumber(node.semanticGravity), 0, 100);
  const confidence = clamp(safeNumber(node.evidenceConfidence), 0, 100) / 100;
  const showLabel = index < (isMobile ? 8 : 18) || gravity >= 86 || (gravity >= 78 && confidence >= 0.74);

  return {
    node,
    rank: index,
    x: point.x,
    y: point.y,
    radius: 4 + gravity / (isMobile ? 11 : 7.8),
    alpha: 0.34 + confidence * 0.62,
    angle,
    distance,
    showLabel,
  };
}

function indexWithinCluster(node: NebulaNode, fallback: number) {
  const key = normalizeStableKey(`${clusterKeyForNode(node)}:${node.normalizedTerm || node.term}`);
  return Math.abs(key + fallback) % 80;
}

function parseNodes(value: unknown): NebulaNode[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is NebulaNode => {
    if (!item || typeof item !== "object") return false;
    const record = item as Partial<NebulaNode>;
    return typeof record.id === "string" && typeof record.term === "string";
  });
}

function clusterOrbitSpeed(cluster: string) {
  const seed = seeded(normalizeStableKey(cluster), 19);
  const direction = seed > 0.52 ? 1 : -1;
  return direction * (0.014 + seed * 0.026);
}

function clusterKeyForNode(node: NebulaNode) {
  if (node.context?.missingDesired) return "MISSING";
  if (node.context?.riskContext) return node.termType === "INCORRECT" ? "INCORRECT" : "RISK";
  if (node.context?.competitorContext) return "COMPETITOR";
  if (node.polarity === "NEGATIVE") return "NEGATIVE";
  if (node.polarity === "POSITIVE" && node.termType === "DESCRIPTIVE") return "POSITIVE";
  return node.termType || "OTHER";
}

function colorForNode(node: NebulaNode) {
  return typeColors[clusterKeyForNode(node)] ?? typeColors[node.termType] ?? typeColors.DEFAULT;
}

function createParticles(count: number) {
  return Array.from({ length: count }, (_, seed) => {
    const hueSeed = seeded(seed, 6);
    return {
      seed,
      angle: seeded(seed, 3) * TAU,
      distance: 0.05 + Math.pow(seeded(seed, 4), 0.62),
      scatter: (seeded(seed, 5) - 0.5) * 120,
      radius: seeded(seed, 7) > 0.988 ? 2.4 + seeded(seed, 11) * 2.4 : 0.25 + Math.pow(seeded(seed, 7), 1.7) * 1.4,
      alpha: (seeded(seed, 8) > 0.985 ? 0.72 : 0.08 + seeded(seed, 12) * 0.3),
      speed: 0.04 + seeded(seed, 13) * 0.18,
      phase: seeded(seed, 14) * TAU,
      hue: hueSeed > 0.84 ? "cyan" : hueSeed > 0.72 ? "violet" : hueSeed > 0.62 ? "rose" : hueSeed > 0.18 ? "gold" : "white",
      layer: seeded(seed, 1) < 0.22 ? "field" : "filament",
    } satisfies Particle;
  });
}

function pointOnField(center: { x: number; y: number }, angle: number, distance: number, isMobile: boolean) {
  return {
    x: center.x + Math.cos(angle) * distance * (isMobile ? 0.9 : 1.18),
    y: center.y + Math.sin(angle) * distance * (isMobile ? 0.9 : 0.72),
  };
}

function drawGlow(context: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string) {
  const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, color);
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  context.fillStyle = gradient;
  context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}

function findHitNode(nodes: HitNode[], x: number, y: number) {
  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    const item = nodes[index];
    if (Math.hypot(item.x - x, item.y - y) <= item.radius + 10) return item;
  }
  return null;
}

function branchHue(branch: number) {
  const mode = branch % 9;
  if (mode === 0 || mode === 1) return "rgba(255,177,62,1)";
  if (mode === 2 || mode === 3) return "rgba(36,211,238,1)";
  if (mode === 4) return "rgba(185,110,255,1)";
  if (mode === 5) return "rgba(255,104,176,1)";
  return "rgba(255,214,136,1)";
}

function particleColor(hue: Particle["hue"], alpha: number) {
  if (hue === "cyan") return `rgba(55,221,255,${alpha})`;
  if (hue === "violet") return `rgba(191,129,255,${alpha})`;
  if (hue === "rose") return `rgba(255,112,188,${alpha})`;
  if (hue === "white") return `rgba(245,250,255,${alpha})`;
  return `rgba(255,178,64,${alpha})`;
}

function colorWithAlpha(color: string, alpha: number) {
  return color.replace(/[\d.]+\)$/u, `${alpha})`);
}

function seeded(index: number, salt: number) {
  const value = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function normalizeStableKey(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return hash;
}

function safeNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
