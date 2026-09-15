"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import type { UniverseEvidence, UniverseNode, UniverseType } from "@/components/semantic-intelligence/universe-adapter";
import { nodeEvidenceScore, nodeVisualRadius, overviewRevealAlpha } from "@/components/semantic-intelligence/nebula-visual";
import { buildClusterTree, clusterExpansion, LOD_ACTIVATION, LOD_MIN_EXTENT } from "@/components/semantic-intelligence/semantic-cluster-tree";
import { drawClusterGlow } from "@/components/semantic-intelligence/nebula-field-renderer";

const MAX_DETAIL_NODES = 320;
const LARGE_NODE_THRESHOLD = 400;
const THIRTY_FPS_MS = 1000 / 30;
// Hard ceiling on base dots drawn per frame. The canvas is fill-rate bound, so
// this — not the node total — is what keeps a frame cheap when the camera opens
// many clusters at once (e.g. a spread-out real-embedding field).
const MAX_LIVE_NODES = 900;
const TOOLTIP_WIDTH = 220;

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
  zoomIn?: string;
  zoomOut?: string;
  resetView?: string;
  encoding?: string;
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
  zoomIn: "Zoom in",
  zoomOut: "Zoom out",
  resetView: "Fit nebula",
  encoding: "distance · semantic proximity  /  size · evidence gravity  /  brightness · confidence",
};

type Star = UniverseNode & { color: string; hue: [number, number, number]; tw: number };

export function CognitionUniverse({
  nodes,
  subjectName,
  copy = DEFAULT_COPY,
  className,
  evidenceEndpoint,
  variant = "interactive",
}: {
  nodes: UniverseNode[];
  subjectName: string;
  copy?: Copy;
  className?: string;
  evidenceEndpoint?: string;
  /** "ambient" = passive background (no chrome, click-through, slow drift). */
  variant?: "interactive" | "ambient";
}) {
  const interactive = variant !== "ambient";
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [typeOn, setTypeOn] = useState<Record<UniverseType, boolean>>({ positive: true, risk: true, opportunity: true, competitor: true, entity: true, attribute: true, context: true, activity: true, relation: true, evidence: true });
  const [paused, setPaused] = useState(false);
  const [selected, setSelected] = useState<UniverseNode | null>(null);
  // `flip` is decided at hover time, where the canvas width is already measured;
  // reading it during render would mean touching a ref mid-render.
  const [tip, setTip] = useState<{ x: number; y: number; flip: boolean; node: UniverseNode } | null>(null);
  const [layoutMode, setLayoutMode] = useState<"balanced" | "raw">("balanced");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [evidenceByKey, setEvidenceByKey] = useState<Record<string, UniverseEvidence[]>>({});
  const invalidateRef = useRef<() => void>(() => undefined);
  const cameraControlsRef = useRef<{ zoomIn: () => void; zoomOut: () => void; reset: () => void }>({
    zoomIn: () => undefined, zoomOut: () => undefined, reset: () => undefined,
  });

  // mirror reactive state into a ref the animation loop can read each frame
  const ui = useRef({ typeOn, paused, selected });
  useEffect(() => {
    ui.current = { typeOn, paused, selected };
    invalidateRef.current();
  }, [typeOn, paused, selected]);

  // Keys already requested, tracked outside React state so that caching one
  // node's evidence does not tear down and restart the in-flight request for
  // another. Only ever touched inside the effect and its callbacks.
  const requestedEvidenceRef = useRef(new Set<string>());

  useEffect(() => {
    if (!selected || selected.examples.length > 0 || !evidenceEndpoint) return;

    const key = selected.evidenceKey;
    if (requestedEvidenceRef.current.has(key)) return;
    requestedEvidenceRef.current.add(key);

    const controller = new AbortController();
    fetch(`${evidenceEndpoint}&node=${encodeURIComponent(key)}`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Evidence unavailable")))
      .then((body: unknown) => {
        const rows = body && typeof body === "object" && Array.isArray((body as { examples?: unknown }).examples)
          ? (body as { examples: UniverseEvidence[] }).examples
          : [];
        setEvidenceByKey((current) => ({ ...current, [key]: rows }));
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          // Nothing was cached, so let a later selection retry this node.
          requestedEvidenceRef.current.delete(key);
          return;
        }
        setEvidenceByKey((current) => ({ ...current, [key]: [] }));
      });

    return () => controller.abort();
  }, [evidenceEndpoint, selected]);

  const selectedExamples = selected
    ? selected.examples.length > 0
      ? selected.examples
      : evidenceByKey[selected.evidenceKey] ?? []
    : [];
  const evidenceLoading = Boolean(
    selected
    && evidenceEndpoint
    && selected.examples.length === 0
    && !Object.hasOwn(evidenceByKey, selected.evidenceKey),
  );

  useEffect(() => {
    const syncFullscreen = () => setIsFullscreen(document.fullscreenElement === wrapRef.current);
    document.addEventListener("fullscreenchange", syncFullscreen);
    return () => document.removeEventListener("fullscreenchange", syncFullscreen);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const drawingContext = canvas.getContext("2d");
    const backgroundCanvas = document.createElement("canvas");
    const backgroundDrawingContext = backgroundCanvas.getContext("2d");
    if (!drawingContext || !backgroundDrawingContext) return;
    const ctx = drawingContext;
    const backgroundCtx = backgroundDrawingContext;

    const stars: Star[] = nodes.map((node, index) => ({
      ...node,
      x: layoutMode === "raw" ? node.rawX : node.x,
      y: layoutMode === "raw" ? node.rawY : node.y,
      z: layoutMode === "raw" ? node.rawZ : node.z,
      hue: HUE[node.type],
      color: `rgb(${HUE[node.type].join(",")})`,
      tw: (index * 2.399) % 6.283,
    }));
    const screen = stars.map((star) => ({
      s: star,
      sx: 0,
      sy: 0,
      scale: 0,
      depth: 0,
      fog: 0,
      // LOD cross-fade weight for this frame, and the frame it was last marked
      // live — so the cluster expansion can build the draw set without a per-frame
      // allocation or a full-array scan.
      ct: 1,
      liveFrame: 0,
    }));

    // Semantic level-of-detail. Small fields render every node the classic way
    // (fast enough, pixel-identical); large fields collapse into cluster glows
    // that expand only where the camera is close. Nothing is ever removed.
    const useLod = stars.length > LOD_ACTIVATION;
    const tree = useLod ? buildClusterTree(stars) : { clusters: [] };
    const indexByKey = new Map(stars.map((star, index) => [star.evidenceKey, index]));
    const clusterSlots = tree.clusters.map((cluster) => ({
      cluster,
      sx: 0,
      sy: 0,
      scale: 0,
      depth: 0,
      fog: 0,
      screenR: 0,
      t: 0,
      // Fraction of this cluster's members actually drawn as nodes this frame
      // (0 = pure glow, 1 = fully opened). The glow fills in the rest.
      materialized: 0,
    }));
    const liveBuffer: typeof screen = [];
    let live: typeof screen = screen;
    let frameSeq = 0;
    const addLive = (index: number | undefined, weight: number) => {
      if (index === undefined || index < 0) return;
      const slot = screen[index];
      if (slot.liveFrame === frameSeq) {
        if (weight > slot.ct) slot.ct = weight;
        return;
      }
      slot.liveFrame = frameSeq;
      slot.ct = weight;
      liveBuffer.push(slot);
    };
    const cam = { yaw: 0.2, pitch: -0.18, dist: 3.4, tdist: 2.6 };
    const look = { x: 0, y: 0, z: 0 };
    const focus = { x: 0, y: 0, z: 0 };
    let W = 0, H = 0, cx = 0, cy = 0, base = 600, dpr = 1;
    let drag: { x: number; y: number; yaw: number; pitch: number; moved: boolean; coarse: boolean } | null = null;
    let hoverStar: Star | null = null;
    let pendingPointer: { x: number; y: number } | null = null;
    let raf = 0, pointerRaf = 0, lastPaint = 0, lastFrame = performance.now();
    let visible = true, destroyed = false;
    let detailOrder: typeof screen = [];
    let cosYaw = 1, sinYaw = 0, cosPitch = 1, sinPitch = 0;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const frameInterval = !interactive || stars.length > LARGE_NODE_THRESHOLD ? THIRTY_FPS_MS : 0;
    // Adaptive quality. The render cost of a soft nebula is dominated by canvas
    // fill-rate, which varies wildly across machines (device pixel ratio, GPU,
    // window size). Rather than guess a fixed budget, we measure the real draw
    // time on THIS machine and scale the backing-store resolution and the live
    // node budget to hold a smooth frame. renderScale 1 = full quality.
    const capDpr = stars.length > LARGE_NODE_THRESHOLD ? 1.5 : 1.9;
    let renderScale = 1, workEma = 0, lastQualityChange = 0;
    const liveBudget = () => Math.round(260 + (MAX_LIVE_NODES - 260) * renderScale);

    const updateProjection = () => {
      cosYaw = Math.cos(cam.yaw); sinYaw = Math.sin(cam.yaw);
      cosPitch = Math.cos(cam.pitch); sinPitch = Math.sin(cam.pitch);
    };
    const project = (x: number, y: number, z: number) => {
      x -= look.x; y -= look.y; z -= look.z;
      const x1 = x * cosYaw - z * sinYaw, z1 = x * sinYaw + z * cosYaw;
      const y2 = y * cosPitch - z1 * sinPitch, z2 = y * sinPitch + z1 * cosPitch;
      const depth = Math.max(0.05, z2 + cam.dist), scale = 2.3 / depth;
      return { sx: cx + x1 * scale * base, sy: cy + y2 * scale * base, scale, depth };
    };
    const projectScreen = () => {
      for (const item of screen) {
        const point = project(item.s.x, item.s.y, item.s.z);
        item.sx = point.sx; item.sy = point.sy; item.scale = point.scale; item.depth = point.depth;
        item.fog = Math.max(0, Math.min(1, (4.6 - point.depth) / 3.4));
      }
    };
    const requestDraw = () => {
      if (destroyed || raf || !visible || document.visibilityState === "hidden") return;
      raf = requestAnimationFrame(draw);
    };
    const paintBackground = () => {
      backgroundCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const bg = backgroundCtx.createRadialGradient(cx, cy * 0.8, 0, cx, cy, Math.max(W, H) * 0.8);
      bg.addColorStop(0, "#0a0b16"); bg.addColorStop(0.5, "#06070e"); bg.addColorStop(1, "#030308");
      backgroundCtx.fillStyle = bg; backgroundCtx.fillRect(0, 0, W, H);
      const vignette = backgroundCtx.createRadialGradient(cx, cy, Math.min(W, H) * 0.3, cx, cy, Math.max(W, H) * 0.75);
      vignette.addColorStop(0, "rgba(0,0,0,0)"); vignette.addColorStop(1, "rgba(0,0,0,0.55)");
      backgroundCtx.fillStyle = vignette; backgroundCtx.fillRect(0, 0, W, H);
    };
    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      // Canvas cost scales with the backing-store pixel count (dpr²). A soft,
      // glowy nebula survives a lower cap almost invisibly, so large fields are
      // capped harder — this is one of the biggest wins on hi-DPI screens.
      W = rect.width; H = rect.height; dpr = Math.max(0.6, Math.min(window.devicePixelRatio || 1, capDpr) * renderScale);
      canvas.width = W * dpr; canvas.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      backgroundCanvas.width = W * dpr; backgroundCanvas.height = H * dpr;
      cx = W / 2; cy = H / 2; base = Math.min(W, H) * 0.6;
      paintBackground();
      requestDraw();
    };

    function draw(now: number) {
      raf = 0;
      if (destroyed) return;
      const { typeOn, paused, selected } = ui.current;
      const autoRotate = !drag && !paused && !reduceMotion;
      if (frameInterval && autoRotate && lastPaint && now - lastPaint < frameInterval) {
        requestDraw();
        return;
      }
      const drawStart = performance.now();
      // Real delivered frame time since the last paint (captured before lastFrame
      // is advanced). While dragging the loop is uncapped, so this reflects true
      // on-screen FPS including GPU raster — the signal the governor trusts most.
      const frameMs = lastFrame ? now - lastFrame : 16.7;

      const elapsed = Math.min((now - lastFrame) / 1000, 0.05);
      lastFrame = now; lastPaint = now;
      if (autoRotate) cam.yaw += (interactive ? 0.02 : 0.012) * elapsed;
      cam.dist += (cam.tdist - cam.dist) * (reduceMotion ? 1 : 0.18);
      look.x += (focus.x - look.x) * 0.14; look.y += (focus.y - look.y) * 0.14; look.z += (focus.z - look.z) * 0.14;
      updateProjection();

      if (!useLod) {
        for (const item of screen) item.ct = 1;
        projectScreen();
        live = screen;
      } else {
        // Project the cluster centroids (a few dozen), decide each cluster's
        // expansion, then project only the nodes that will actually be drawn:
        // members of clusters the camera has opened, plus a few bright stars from
        // the collapsed ones, plus whatever is hovered or selected.
        for (const cs of clusterSlots) {
          const point = project(cs.cluster.cx, cs.cluster.cy, cs.cluster.cz);
          cs.sx = point.sx; cs.sy = point.sy; cs.scale = point.scale; cs.depth = point.depth;
          cs.fog = Math.max(0, Math.min(1, (4.6 - point.depth) / 3.4));
          cs.screenR = Math.max(cs.cluster.extent, LOD_MIN_EXTENT) * point.scale * base;
          cs.t = cs.fog <= 0 ? 0 : clusterExpansion(cs.screenR);
        }
        frameSeq += 1;
        liveBuffer.length = 0;
        // Spend a fixed per-frame node budget on the clusters the camera has
        // opened most, closest first. Members are strongest-first, so a cluster
        // that can only be partly afforded still shows its most important nodes;
        // whatever isn't materialised stays covered by the glow.
        let budget = liveBudget();
        const opened = clusterSlots
          .filter((cs) => cs.fog > 0 && cs.t > 0)
          .sort((a, b) => b.t - a.t || b.screenR - a.screenR);
        for (const cs of clusterSlots) cs.materialized = 0;
        for (const cs of opened) {
          if (budget <= 0) break;
          const members = cs.cluster.members;
          const take = Math.min(members.length, budget);
          for (let k = 0; k < take; k++) addLive(members[k], cs.t);
          cs.materialized = members.length ? take / members.length : 1;
          budget -= take;
        }
        // Sparse representative stars over every cluster that is not fully
        // opened, so a collapsed or budget-capped glow still reads as a star cloud.
        for (const cs of clusterSlots) {
          if (cs.fog <= 0 || cs.materialized >= 1) continue;
          for (const index of cs.cluster.reps) addLive(index, 0.8 * (1 - cs.t));
        }
        if (selected) addLive(indexByKey.get(selected.evidenceKey), 1);
        if (hoverStar) addLive(indexByKey.get(hoverStar.evidenceKey), 1);
        for (const item of liveBuffer) {
          const point = project(item.s.x, item.s.y, item.s.z);
          item.sx = point.sx; item.sy = point.sy; item.scale = point.scale; item.depth = point.depth;
          item.fog = Math.max(0, Math.min(1, (4.6 - point.depth) / 3.4));
        }
        live = liveBuffer;
      }

      ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
      ctx.drawImage(backgroundCanvas, 0, 0, backgroundCanvas.width, backgroundCanvas.height, 0, 0, W, H);
      ctx.globalCompositeOperation = "lighter";

      for (const type of Object.keys(SECTOR_DIR) as UniverseType[]) {
        if (!typeOn[type]) continue;
        const dir = SECTOR_DIR[type], point = project(dir[0] * 0.7, dir[1] * 0.7, dir[2] * 0.7);
        const amount = Math.max(0, Math.min(1, (4.6 - point.depth) / 3.4));
        if (amount <= 0) continue;
        const radius = 0.4 * point.scale * base, hue = HUE[type];
        const glow = ctx.createRadialGradient(point.sx, point.sy, 0, point.sx, point.sy, radius);
        glow.addColorStop(0, `rgba(${hue[0]},${hue[1]},${hue[2]},${0.14 * amount})`);
        glow.addColorStop(1, `rgba(${hue[0]},${hue[1]},${hue[2]},0)`);
        ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(point.sx, point.sy, radius, 0, 6.2832); ctx.fill();
      }

      // Far-view cluster glows: a few dozen additive blooms standing in for the
      // thousands of nodes they contain, fading out as the camera opens them.
      if (useLod) {
        for (const cs of clusterSlots) {
          // Glow covers whatever the node budget did not materialise — a fully
          // opened cluster shows none, a collapsed or capped one shows it in full.
          if (cs.fog <= 0 || cs.materialized >= 1 || !typeOn[cs.cluster.type]) continue;
          drawClusterGlow(ctx, cs.sx, cs.sy, cs.screenR * 1.9 + 26, HUE[cs.cluster.type], cs.cluster.intensity * cs.fog, 1 - cs.materialized);
        }
        ctx.globalAlpha = 1;
      }

      const brand = project(0, 0, 0);
      ctx.shadowBlur = 0;
      const zoomLevel = 2.6 / cam.dist;
      for (const item of live) {
        const { s } = item;
        const isSelected = selected?.evidenceKey === s.evidenceKey;
        if (!typeOn[s.type] || item.fog <= 0) continue;
        const dim = selected && selected.type !== s.type ? 0.2 : 1;
        // Interactive overview leads with high-evidence nodes; zooming in
        // re-reveals the long tail. Below-floor nodes only fade — never removed,
        // so they stay pickable and present in raw space. The ambient marketing
        // background has no zoom to bring the tail back, so it keeps a full field.
        const reveal = !interactive || isSelected || hoverStar === s ? 1 : overviewRevealAlpha(nodeEvidenceScore(s), zoomLevel);
        const radius = nodeVisualRadius(s.strength, item.scale);
        ctx.globalAlpha = (0.08 + s.confidence * 0.22 + s.affinity * 0.42) * item.fog * dim * reveal * item.ct;
        ctx.fillStyle = s.color;
        ctx.beginPath(); ctx.arc(item.sx, item.sy, radius, 0, 6.2832); ctx.fill();
      }

      // Detail is a camera-dependent layer, not a fixed top-N caste. Every
      // node uses the same radius above; zooming only adds glow, links and text.
      const detailThreshold = Math.max(2.15, 4.8 - Math.max(0, zoomLevel - 1) * 1.2);
      detailOrder = live.filter((item) => {
        const highlighted = hoverStar === item.s || selected?.evidenceKey === item.s.evidenceKey;
        return highlighted || (
          typeOn[item.s.type]
          && item.fog > 0
          && item.ct > 0.2
          && item.sx > -30 && item.sx < W + 30 && item.sy > -30 && item.sy < H + 30
          && nodeVisualRadius(item.s.strength, item.scale) >= detailThreshold
        );
      }).sort((left, right) => right.s.strength - left.s.strength || right.s.affinity - left.s.affinity).slice(0, MAX_DETAIL_NODES);
      detailOrder.sort((left, right) => right.depth - left.depth);
      for (const item of detailOrder) {
        const { s } = item;
        const isSelected = selected?.evidenceKey === s.evidenceKey;
        if (!typeOn[s.type] || item.fog <= 0 || (s.affinity < 0.72 && hoverStar !== s && !isSelected)) continue;
        if (selected && s.type !== selected.type) continue;
        const gradient = ctx.createLinearGradient(brand.sx, brand.sy, item.sx, item.sy);
        gradient.addColorStop(0, "rgba(41,211,236,0)");
        gradient.addColorStop(1, `rgba(${s.hue[0]},${s.hue[1]},${s.hue[2]},${0.24 * item.fog * item.ct})`);
        ctx.strokeStyle = gradient; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(brand.sx, brand.sy); ctx.lineTo(item.sx, item.sy); ctx.stroke();
      }

      for (const item of detailOrder) {
        const { s } = item;
        const isSelected = selected?.evidenceKey === s.evidenceKey;
        if (!typeOn[s.type] || item.fog <= 0) continue;
        const dim = selected && selected.type !== s.type ? 0.25 : 1;
        const pulse = s.type === "risk" && stars.length <= LARGE_NODE_THRESHOLD ? 0.7 + 0.3 * Math.sin(now * 0.004 + s.tw) : 1;
        const radius = nodeVisualRadius(s.strength, item.scale) * pulse;
        const highlighted = hoverStar === s || isSelected;
        ctx.globalAlpha = (0.12 + s.affinity * 0.88) * item.fog * dim * item.ct;
        ctx.fillStyle = s.color;
        // shadowBlur is the single most expensive per-node canvas op, so it is
        // reserved for the one hovered/selected node. Confident nodes still read
        // as bright from the additive `lighter` blend and the cluster glow behind
        // them — no per-node blur needed.
        if (highlighted) { ctx.shadowColor = s.color; ctx.shadowBlur = 22 * item.fog; } else { ctx.shadowBlur = 0; }
        ctx.beginPath(); ctx.arc(item.sx, item.sy, highlighted ? radius + 1.8 : radius, 0, 6.2832); ctx.fill();
      }
      ctx.shadowBlur = 0; ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";

      const labelBoxes: Array<{ left: number; top: number; right: number; bottom: number }> = [];
      const labelLimit = Math.max(14, Math.min(72, Math.round(Math.sqrt(detailOrder.length) * (1.6 + Math.min(1.2, zoomLevel * 0.3)))));
      const baseLabelThreshold = stars.length > LARGE_NODE_THRESHOLD ? 0.78 : stars.length > 180 ? 0.7 : 0.62;
      const labelThreshold = Math.max(0.38, baseLabelThreshold - Math.max(0, zoomLevel - 1) * 0.12);
      let visibleLabels = 0;
      for (const item of detailOrder) {
        const { s } = item;
        if (!typeOn[s.type]) continue;
        const highlighted = hoverStar === s || selected?.evidenceKey === s.evidenceKey;
        if (!(highlighted || (s.affinity > labelThreshold && item.fog > 0.4 && visibleLabels < labelLimit))) continue;
        ctx.font = `${highlighted ? "600" : "500"} 11px Inter, system-ui, sans-serif`;
        const width = ctx.measureText(s.label).width;
        const box = { left: item.sx + 6, top: item.sy - 7, right: item.sx + width + 12, bottom: item.sy + 7 };
        if (!highlighted && labelBoxes.some((other) => box.left < other.right && box.right > other.left && box.top < other.bottom && box.bottom > other.top)) continue;
        labelBoxes.push(box); visibleLabels += 1;
        ctx.globalAlpha = highlighted ? 1 : 0.78 * item.fog * item.ct; ctx.fillStyle = highlighted ? "#fff" : "#c4c8d6";
        ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.fillText(s.label, item.sx + 8, item.sy);
      }

      // Far view names the galaxies, not the stars: one label per collapsed
      // cluster, sharing the same collision boxes so it never sits on a node label.
      if (useLod) {
        const clusterLabels = clusterSlots
          .filter((cs) => cs.fog > 0.4 && cs.t < 0.85 && typeOn[cs.cluster.type])
          .sort((a, b) => b.cluster.count - a.cluster.count)
          .slice(0, 18);
        ctx.font = "600 11px Inter, system-ui, sans-serif";
        for (const cs of clusterLabels) {
          const width = ctx.measureText(cs.cluster.label).width;
          const box = { left: cs.sx + 6, top: cs.sy - 7, right: cs.sx + width + 12, bottom: cs.sy + 7 };
          if (labelBoxes.some((other) => box.left < other.right && box.right > other.left && box.top < other.bottom && box.bottom > other.top)) continue;
          labelBoxes.push(box);
          ctx.globalAlpha = 0.9 * cs.fog * (1 - cs.t); ctx.fillStyle = "#dfe4f2";
          ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.fillText(cs.cluster.label, cs.sx + 8, cs.sy);
        }
      }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = "lighter";

      const coreRadius = 15 * brand.scale + 7;
      const halo = ctx.createRadialGradient(brand.sx, brand.sy, 0, brand.sx, brand.sy, coreRadius * 3.2);
      halo.addColorStop(0, "rgba(180,245,255,0.5)"); halo.addColorStop(0.4, "rgba(41,211,236,0.28)"); halo.addColorStop(1, "rgba(41,211,236,0)");
      ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(brand.sx, brand.sy, coreRadius * 3.2, 0, 6.2832); ctx.fill();
      const core = ctx.createRadialGradient(brand.sx, brand.sy, 0, brand.sx, brand.sy, coreRadius);
      core.addColorStop(0, "#ffffff"); core.addColorStop(0.4, "#c9f7ff"); core.addColorStop(1, "rgba(41,211,236,0)");
      ctx.fillStyle = core; ctx.beginPath(); ctx.arc(brand.sx, brand.sy, coreRadius, 0, 6.2832); ctx.fill();
      ctx.globalCompositeOperation = "source-over"; ctx.fillStyle = "#eafcff";
      ctx.font = "700 14px Inter, system-ui, sans-serif"; ctx.textAlign = "center";
      ctx.fillText(subjectName, brand.sx, brand.sy - coreRadius - 12);

      // Governor: keep the measured draw cost inside a smooth band by scaling the
      // backing-store resolution (biggest lever) and the node budget. Hysteresis
      // + a cooldown stop it from oscillating; drops react fast, recovery is slow.
      const workMs = performance.now() - drawStart;
      // During a drag, trust the true frame time (GPU included); otherwise the JS
      // work time, since an idle frame's interval is throttled and meaningless.
      const signal = drag ? Math.max(frameMs, workMs) : workMs;
      workEma = workEma ? workEma * 0.85 + signal * 0.15 : signal;
      if (useLod && drawStart - lastQualityChange > 400) {
        if (workEma > 20 && renderScale > 0.55) {
          renderScale = Math.max(0.55, renderScale - 0.12); lastQualityChange = drawStart; resize();
        } else if (workEma < 10 && renderScale < 1 && drawStart - lastQualityChange > 1000) {
          renderScale = Math.min(1, renderScale + 0.08); lastQualityChange = drawStart; resize();
        }
      }

      const settling = Math.abs(cam.tdist - cam.dist) > 0.002
        || Math.abs(focus.x - look.x) + Math.abs(focus.y - look.y) + Math.abs(focus.z - look.z) > 0.002;
      if (autoRotate || settling || drag) requestDraw();
    }

    const nearest = (px: number, py: number, maxDistance: number) => {
      let best: Star | null = null, bestDistance = maxDistance * maxDistance;
      // Only nodes that were actually projected this frame are pickable; under LOD
      // that is the live set, otherwise the whole field.
      for (const item of live) {
        if (!ui.current.typeOn[item.s.type] || item.fog <= 0 || item.ct <= 0.15) continue;
        const dx = item.sx - px, dy = item.sy - py, distance = dx * dx + dy * dy;
        if (distance < bestDistance) { bestDistance = distance; best = item.s; }
      }
      return best;
    };
    const pick = (px: number, py: number) => nearest(px, py, 16);
    // A collapsed cluster has no pickable nodes; clicking its glow flies the
    // camera in until it opens. Returns null when LOD is off or nothing is near.
    const pickCluster = (px: number, py: number, maxDistance: number) => {
      if (!useLod) return null;
      let best: (typeof clusterSlots)[number] | null = null, bestDistance = maxDistance * maxDistance;
      for (const cs of clusterSlots) {
        if (cs.fog <= 0 || cs.t >= 1 || !ui.current.typeOn[cs.cluster.type]) continue;
        const dx = cs.sx - px, dy = cs.sy - py, distance = dx * dx + dy * dy;
        if (distance < bestDistance) { bestDistance = distance; best = cs; }
      }
      return best;
    };
    const localXY = (event: { clientX: number; clientY: number }) => {
      const rect = canvas.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };
    const flushPointer = () => {
      pointerRaf = 0;
      if (!pendingPointer) return;
      const point = pendingPointer; pendingPointer = null;
      const hit = pick(point.x, point.y);
      if (hit === hoverStar) return;
      hoverStar = hit;
      setTip(hit ? { x: point.x, y: point.y, flip: point.x > W - TOOLTIP_WIDTH - 20, node: hit } : null);
      canvas.style.cursor = hit ? "pointer" : "grab";
      requestDraw();
    };

    // Pointer events rather than mouse events, so touch and pen drive the same
    // code path. The mouse-only version left the nebula completely inert on
    // phones and tablets: no rotate, no zoom, no way to open a node's evidence.
    const pointers = new Map<number, { x: number; y: number }>();
    let pinchSpan = 0;
    const currentSpan = () => {
      const points = [...pointers.values()];
      return points.length < 2 ? 0 : Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
    };

    const onDown = (event: PointerEvent) => {
      const { x, y } = localXY(event);
      pointers.set(event.pointerId, { x, y });
      canvas.setPointerCapture(event.pointerId);

      if (pointers.size >= 2) {
        // A second contact turns the gesture into a pinch, not a rotation.
        pinchSpan = currentSpan();
        drag = null;
        return;
      }

      drag = { x, y, yaw: cam.yaw, pitch: cam.pitch, moved: false, coarse: event.pointerType !== "mouse" };
      requestDraw();
    };
    const onUp = (event: PointerEvent) => {
      const wasPinching = pointers.size > 1;
      pointers.delete(event.pointerId);
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);

      if (!wasPinching && drag && !drag.moved) {
        const { x, y } = localXY(event), hit = pick(x, y);
        if (hit) {
          setSelected(hit); focus.x = hit.x; focus.y = hit.y; focus.z = hit.z; cam.tdist = Math.min(cam.tdist, 0.95);
        } else {
          const cluster = pickCluster(x, y, 90);
          if (cluster) {
            // Fly into the galaxy: recentre on it and close in until it expands.
            focus.x = cluster.cluster.cx; focus.y = cluster.cluster.cy; focus.z = cluster.cluster.cz;
            cam.tdist = Math.max(0.6, cam.tdist * 0.62);
          } else {
            setSelected(null); focus.x = 0; focus.y = 0; focus.z = 0; cam.tdist = 2.6;
          }
        }
      }
      drag = null;
      pinchSpan = 0;
      // Touch has no hover state, so the tooltip must go when the finger lifts.
      if (event.pointerType !== "mouse" && hoverStar) { hoverStar = null; setTip(null); }
      requestDraw();
    };
    const onMove = (event: PointerEvent) => {
      const { x, y } = localXY(event);
      if (pointers.has(event.pointerId)) pointers.set(event.pointerId, { x, y });

      if (pointers.size >= 2) {
        const span = currentSpan();
        if (pinchSpan > 0 && span > 0) {
          cam.tdist = Math.max(0.42, Math.min(5.5, cam.tdist * (pinchSpan / span)));
        }
        pinchSpan = span;
        requestDraw();
        return;
      }

      if (drag) {
        // A finger wanders more than a mouse does on a tap, so the "this was a
        // drag, not a click" threshold has to be looser for touch.
        if (Math.abs(x - drag.x) + Math.abs(y - drag.y) > (drag.coarse ? 10 : 3)) drag.moved = true;
        cam.yaw = drag.yaw + (x - drag.x) * 0.005;
        cam.pitch = Math.max(-1.2, Math.min(1.2, drag.pitch + (y - drag.y) * 0.005));
        if (hoverStar) { hoverStar = null; setTip(null); }
        requestDraw();
        return;
      }

      if (event.pointerType !== "mouse") return;
      pendingPointer = { x, y };
      if (!pointerRaf) pointerRaf = requestAnimationFrame(flushPointer);
    };
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const zoomingIn = event.deltaY < 0;
      if (zoomingIn) {
        const point = localXY(event);
        const node = nearest(point.x, point.y, 120);
        const cluster = node ? null : pickCluster(point.x, point.y, 160);
        const target = node ?? (cluster ? { x: cluster.cluster.cx, y: cluster.cluster.cy, z: cluster.cluster.cz } : null);
        if (target) {
          focus.x += (target.x - focus.x) * 0.28;
          focus.y += (target.y - focus.y) * 0.28;
          focus.z += (target.z - focus.z) * 0.28;
        }
      } else if (cam.tdist > 2.4) {
        focus.x *= 0.8; focus.y *= 0.8; focus.z *= 0.8;
      }
      cam.tdist = Math.max(0.42, Math.min(5.5, cam.tdist * (zoomingIn ? 0.84 : 1.16)));
      requestDraw();
    };
    const onDoubleClick = (event: MouseEvent) => {
      const point = localXY(event), hit = nearest(point.x, point.y, 24);
      if (!hit) return;
      setSelected(hit); focus.x = hit.x; focus.y = hit.y; focus.z = hit.z; cam.tdist = 0.48;
      requestDraw();
    };
    const resetView = () => {
      setSelected(null); focus.x = 0; focus.y = 0; focus.z = 0; cam.tdist = 2.6;
      requestDraw();
    };
    const zoomBy = (factor: number) => {
      cam.tdist = Math.max(0.42, Math.min(5.5, cam.tdist * factor));
      requestDraw();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "+" || event.key === "=") { event.preventDefault(); zoomBy(0.78); }
      else if (event.key === "-") { event.preventDefault(); zoomBy(1.28); }
      else if (event.key === "0" || event.key === "Home" || event.key === "Escape") { event.preventDefault(); resetView(); }
    };
    cameraControlsRef.current = { zoomIn: () => zoomBy(0.72), zoomOut: () => zoomBy(1.38), reset: resetView };
    const onLeave = () => {
      pendingPointer = null;
      if (hoverStar) { hoverStar = null; setTip(null); requestDraw(); }
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden" && raf) { cancelAnimationFrame(raf); raf = 0; }
      else requestDraw();
    };

    invalidateRef.current = requestDraw;
    resize();
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    draw(performance.now());
    const resizeObserver = new ResizeObserver(resize);
    const intersectionObserver = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? true;
      if (!visible && raf) { cancelAnimationFrame(raf); raf = 0; }
      else requestDraw();
    });
    resizeObserver.observe(wrap); intersectionObserver.observe(wrap);
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", onVisibilityChange);
    if (interactive) {
      canvas.addEventListener("pointerdown", onDown);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
      canvas.addEventListener("pointermove", onMove);
      canvas.addEventListener("pointerleave", onLeave);
      canvas.addEventListener("wheel", onWheel, { passive: false });
      canvas.addEventListener("dblclick", onDoubleClick);
      canvas.addEventListener("keydown", onKeyDown);
    }

    return () => {
      destroyed = true;
      if (invalidateRef.current === requestDraw) invalidateRef.current = () => undefined;
      cancelAnimationFrame(raf); cancelAnimationFrame(pointerRaf);
      resizeObserver.disconnect(); intersectionObserver.disconnect();
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      canvas.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("dblclick", onDoubleClick);
      canvas.removeEventListener("keydown", onKeyDown);
      cameraControlsRef.current = { zoomIn: () => undefined, zoomOut: () => undefined, reset: () => undefined };
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
        aria-label={interactive ? copy.hint : undefined}
        tabIndex={interactive ? 0 : undefined}
        // touchAction none: without it the browser claims drag and pinch for
        // page scroll and zoom, and the canvas never sees the gesture.
        style={interactive ? { cursor: "grab", touchAction: "none" } : undefined}
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

      {/* camera controls + hint */}
      <div className="absolute bottom-3 left-3 flex items-center gap-2">
        <div className="flex rounded-lg border border-white/10 bg-black/60 p-0.5 text-[#c4c8d6] backdrop-blur">
          <button type="button" onClick={() => setPaused((p) => !p)} className="grid size-7 place-items-center rounded-md transition-[transform,color,background-color] duration-150 ease-out hover:bg-white/10 hover:text-white active:scale-[0.97]" aria-label={paused ? "Resume" : "Pause"} aria-pressed={paused}>
            {paused ? <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M7 5l12 7-12 7z" /></svg> : <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" /><rect x="14" y="5" width="4" height="14" /></svg>}
          </button>
          <button type="button" onClick={() => cameraControlsRef.current.zoomIn()} className="grid size-7 place-items-center rounded-md text-base transition-[transform,color,background-color] duration-150 ease-out hover:bg-white/10 hover:text-white active:scale-[0.97]" aria-label={copy.zoomIn ?? DEFAULT_COPY.zoomIn}>+</button>
          <button type="button" onClick={() => cameraControlsRef.current.zoomOut()} className="grid size-7 place-items-center rounded-md text-base transition-[transform,color,background-color] duration-150 ease-out hover:bg-white/10 hover:text-white active:scale-[0.97]" aria-label={copy.zoomOut ?? DEFAULT_COPY.zoomOut}>−</button>
          <button type="button" onClick={() => cameraControlsRef.current.reset()} className="grid size-7 place-items-center rounded-md transition-[transform,color,background-color] duration-150 ease-out hover:bg-white/10 hover:text-white active:scale-[0.97]" aria-label={copy.resetView ?? DEFAULT_COPY.resetView}>
            <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 8V4h4M20 8V4h-4M4 16v4h4M20 16v4h-4" /></svg>
          </button>
        </div>
        <span className="hidden font-mono text-[10px] leading-tight text-faint sm:inline">{copy.hint}</span>
      </div>

      {!selected ? <div className="absolute bottom-3 right-3 hidden max-w-[44%] rounded-md bg-black/45 px-2 py-1 font-mono text-[9px] leading-4 text-slate-500 backdrop-blur md:block">{copy.encoding ?? DEFAULT_COPY.encoding}</div> : null}

      {/* hover tooltip */}
      {tip ? (
        <div
          className="pointer-events-none absolute z-10 rounded-lg border border-border bg-black/85 px-3 py-2 text-xs backdrop-blur"
          // Flips to the left of the cursor near the right edge; the container
          // clips overflow, so a tooltip that runs past it is simply cut off.
          style={{
            width: TOOLTIP_WIDTH,
            left: tip.x + 14,
            top: tip.y + 10,
            transform: tip.flip ? "translateX(calc(-100% - 28px))" : undefined,
          }}
        >
          <div className="font-medium text-foreground">{tip.node.label}</div>
          <div className="mt-0.5 font-mono text-[10px] text-faint">
            {tip.node.type} · {copy.pull} {Math.round(tip.node.affinity * 100)}
          </div>
        </div>
      ) : null}

      {/* selected detail */}
      {selected ? (
        <div data-testid="nebula-detail-panel" className="absolute bottom-3 right-3 flex max-h-[calc(100%-1.5rem)] w-72 min-w-0 flex-col overflow-hidden rounded-xl border border-white/20 bg-[#07090e]/95 p-4 text-slate-200 shadow-2xl shadow-black/50 backdrop-blur-xl">
          <button className="absolute right-2.5 top-2 grid size-6 place-items-center rounded-md text-slate-500 transition-colors hover:bg-white/10 hover:text-white" onClick={() => setSelected(null)} aria-label="Close">×</button>
          <div className="min-w-0 break-words pr-7 text-sm font-semibold leading-5 text-white [overflow-wrap:anywhere]">{selected.label}</div>
          <div className="mt-0.5 font-mono text-[10px] uppercase tracking-wide" style={{ color: `rgb(${HUE[selected.type].join(",")})` }}>
            {selected.type}
          </div>
          <div className="mt-1 break-words font-mono text-[9px] uppercase tracking-wide text-slate-500 [overflow-wrap:anywhere]">{selected.domain} · {selected.semanticType}</div>
          {(["affinity", "confidence"] as const).map((k) => (
            <div key={k} className="mt-3">
              <div className="mb-1 flex justify-between text-[11px] text-slate-400">
                <span>{k === "affinity" ? copy.pull : copy.confidence}</span>
                <span className="font-mono">{Math.round((selected[k] as number) * 100)}</span>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full" style={{ width: `${Math.round((selected[k] as number) * 100)}%`, background: `rgb(${HUE[selected.type].join(",")})` }} />
              </div>
            </div>
          ))}
          {evidenceLoading ? (
            <div className="mt-4 space-y-2" aria-label="Loading evidence">
              <div className="h-2 w-24 rounded bg-white/10 motion-safe:animate-pulse" />
              <div className="h-16 rounded-md bg-white/[0.05] motion-safe:animate-pulse" />
            </div>
          ) : selectedExamples.length > 0 ? (
            <div className="mt-4 min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto pr-1 [scrollbar-color:rgb(71_85_105)_transparent]">
              <div className="mb-2 font-mono text-[9.5px] uppercase tracking-wide text-slate-500">{copy.evidence}</div>
              <div className="space-y-2">
                {selectedExamples.map((ex, i) => (
                  <div key={i} className="min-w-0 overflow-hidden rounded-lg border border-white/10 bg-white/[0.04] p-2.5">
                    {ex.question ? <div className="mb-1.5 whitespace-pre-wrap break-words text-[10.5px] font-medium leading-4 text-slate-200 [overflow-wrap:anywhere]">{ex.question}</div> : null}
                    <p className="whitespace-pre-wrap break-words text-[11px] leading-[1.65] text-slate-400 [overflow-wrap:anywhere]">“{ex.excerpt}”</p>
                    {ex.source ? <div className="mt-1.5 whitespace-pre-wrap break-words font-mono text-[9px] leading-4 text-slate-500 [overflow-wrap:anywhere]">{ex.source}</div> : null}
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
