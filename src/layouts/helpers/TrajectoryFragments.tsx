import React, { useEffect, useMemo, useRef } from "react";

// Two sparse, independent trajectory fragments -- each enters from outside
// the viewport, curves gently toward the globe, and fades to nothing well
// before reaching its dense core. Not orbital paths (those stay in
// ParticleGlobe.tsx, untouched), not a network diagram: short, asymmetric,
// secondary to the globe. Both sit behind the globe canvas.
//
// A third fragment (upper-right, dashed, foreground) was removed after
// review -- it read as isolated/disconnected from the composition. Not
// replaced.

interface TrajectoryConfig {
  d: string;
  strokeWidth: number;
  dashArray?: string;
  baseOpacity: number;
  breatheAmp: number;
  breatheSpeed: number;
  phase: number;
  gradId: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

// Coordinate system: fixed 1344x900 px, 1:1 with a typical desktop hero at
// this breakpoint -- matches the viewport-relative measurements already
// used to place/verify the globe and (previously) the floating fragments.
// Retargeted to the smaller, lower globe (now centered ~x672, visible cap
// roughly y406-550) -- same gentle-curve, off-canvas-entry concept as
// before, just converging on the new, more compact object.
const TRAJECTORIES: TrajectoryConfig[] = [
  {
    // Enters from the left edge, gentle curve down toward the globe's
    // upper-left flank, tapering out well before the dense core.
    d: "M -40,410 Q 200,392 560,468",
    strokeWidth: 1.1,
    baseOpacity: 0.33,
    breatheAmp: 0.35,
    breatheSpeed: 0.00009,
    phase: 0,
    gradId: "traj-f1",
    x1: -40,
    y1: 410,
    x2: 560,
    y2: 468,
  },
  {
    // Enters from the bottom-right, short subtle curve toward the globe's
    // lower-right rim -- the quieter of the two.
    d: "M 1400,660 Q 1180,600 792,548",
    strokeWidth: 0.75,
    baseOpacity: 0.2,
    breatheAmp: 0.4,
    breatheSpeed: 0.00007,
    phase: 4.4,
    gradId: "traj-f3",
    x1: 1400,
    y1: 660,
    x2: 792,
    y2: 548,
  },
];

// Soft white-blue -- alpha carried entirely by the per-path gradient stops.
const STROKE_COLOR = "rgb(214,228,255)";

const TrajectoryFragments = () => {
  const pathRefs = useRef<(SVGPathElement | null)[]>([]);

  const prefersReducedMotion = useMemo(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );

  useEffect(() => {
    if (prefersReducedMotion) return;

    let raf = 0;
    const render = () => {
      const now = performance.now();
      TRAJECTORIES.forEach((cfg, i) => {
        const el = pathRefs.current[i];
        if (!el) return;
        // Slow, independent breathing -- phase-offset per fragment so the
        // two are never both near peak brightness at once.
        const t = now * cfg.breatheSpeed + cfg.phase;
        const mult = 1 + Math.sin(t) * cfg.breatheAmp;
        el.style.opacity = String(Math.max(0, cfg.baseOpacity * mult));
      });
      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);

    return () => cancelAnimationFrame(raf);
  }, [prefersReducedMotion]);

  return (
    <svg
      className="pointer-events-none absolute inset-0 hidden md:block"
      width={1344}
      height={900}
      style={{ position: "absolute", top: 0, left: 0 }}
    >
      <defs>
        {TRAJECTORIES.map((cfg) => (
          <linearGradient
            key={cfg.gradId}
            id={cfg.gradId}
            gradientUnits="userSpaceOnUse"
            x1={cfg.x1}
            y1={cfg.y1}
            x2={cfg.x2}
            y2={cfg.y2}
          >
            <stop offset="0%" stopColor={STROKE_COLOR} stopOpacity={1} />
            <stop offset="100%" stopColor={STROKE_COLOR} stopOpacity={0} />
          </linearGradient>
        ))}
      </defs>
      {TRAJECTORIES.map((cfg, i) => (
        <path
          key={cfg.gradId}
          ref={(el) => {
            pathRefs.current[i] = el;
          }}
          d={cfg.d}
          fill="none"
          stroke={`url(#${cfg.gradId})`}
          strokeWidth={cfg.strokeWidth}
          strokeDasharray={cfg.dashArray}
          strokeLinecap="round"
          opacity={cfg.baseOpacity}
        />
      ))}
    </svg>
  );
};

export default TrajectoryFragments;
