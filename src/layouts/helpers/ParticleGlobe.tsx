import React, { useEffect, useMemo, useRef, useState } from "react";

// Independent WebGL2 particle-sphere globe. No cobe, no Three.js —
// raw WebGL2, one canvas, one component. Two point sets are drawn
// within that single canvas: a bright core cluster, and a separate,
// sparse, dim "far-edge arc" set pushed to a larger radius and gated
// to a grazing-angle visibility band, so it reads as a detached
// fragment of a much larger sphere rather than a variation of the
// same falloff.

const CORE_VERTEX_SHADER = `#version 300 es
in vec3 aPosition;
uniform float uRotY;
uniform float uTiltX;
uniform float uCameraDist;
uniform mat4 uProjection;
uniform float uPointSize;
out float vFacing;

vec3 rotateY(vec3 p, float a) {
  float c = cos(a);
  float s = sin(a);
  return vec3(p.x * c + p.z * s, p.y, -p.x * s + p.z * c);
}

vec3 rotateX(vec3 p, float a) {
  float c = cos(a);
  float s = sin(a);
  return vec3(p.x, p.y * c - p.z * s, p.y * s + p.z * c);
}

void main() {
  vec3 p = rotateX(rotateY(aPosition, uRotY), uTiltX);
  vFacing = p.z;

  vec3 viewPos = vec3(p.x, p.y, p.z - uCameraDist);
  gl_Position = uProjection * vec4(viewPos, 1.0);

  float b = smoothstep(0.15, 0.65, p.z);
  float perspective = uCameraDist / max(-viewPos.z, 0.5);
  gl_PointSize = uPointSize * (0.15 + 1.6 * b) * perspective;
}
`;

const CORE_FRAGMENT_SHADER = `#version 300 es
precision mediump float;
in float vFacing;
out vec4 outColor;
uniform vec3 uColorNear;
uniform vec3 uColorFar;

void main() {
  vec2 uv = (gl_PointCoord - 0.5) * 2.0;
  float d = length(uv);
  float alpha = smoothstep(1.0, 0.0, d);
  float brightness = smoothstep(0.15, 0.65, vFacing);
  if (brightness < 0.03) discard;
  vec3 color = mix(uColorFar, uColorNear, brightness);
  outColor = vec4(color, alpha * brightness);
}
`;

// Far-edge arc points: pushed to a larger radius, visible only in a
// narrow grazing-angle band (neither dead-on nor fully back-facing),
// with per-point random size/brightness so most are tiny and faint
// with occasional larger, brighter specks.
const ARC_VERTEX_SHADER = `#version 300 es
in vec3 aPosition;
in float aSizeRand;
in float aBrightRand;
uniform float uRotY;
uniform float uTiltX;
uniform float uCameraDist;
uniform mat4 uProjection;
uniform float uPointSize;
uniform float uTime;
out float vBrightness;
out float vCrisp;

vec3 rotateY(vec3 p, float a) {
  float c = cos(a);
  float s = sin(a);
  return vec3(p.x * c + p.z * s, p.y, -p.x * s + p.z * c);
}

vec3 rotateX(vec3 p, float a) {
  float c = cos(a);
  float s = sin(a);
  return vec3(p.x, p.y * c - p.z * s, p.y * s + p.z * c);
}

void main() {
  vec3 p = rotateX(rotateY(aPosition, uRotY), uTiltX);
  float len = length(p);
  float facing = p.z / max(len, 0.0001);
  float band = smoothstep(-0.8, -0.35, facing) * (1.0 - smoothstep(-0.05, 0.4, facing));

  // Per-point twinkle: independent phase derived from each point's own
  // static object-space position (no extra attribute needed), so the
  // whole field never brightens/dims in lockstep -- a felt sense of
  // independent life, not a visible synchronized loop.
  float seed = fract(sin(dot(aPosition.xy, vec2(12.9898, 78.233))) * 43758.5453);
  float twinkle = 0.86 + 0.14 * sin(uTime * 0.5 + seed * 6.2831853);

  float brightness = band * aBrightRand * twinkle;
  vBrightness = brightness;
  // Larger/brighter points read as crisper accents; the tiny majority
  // stay soft/diffuse -- a cheap depth cue without a new attribute.
  vCrisp = smoothstep(0.5, 2.1, aSizeRand);

  vec3 viewPos = vec3(p.x, p.y, p.z - uCameraDist);
  gl_Position = uProjection * vec4(viewPos, 1.0);

  float perspective = uCameraDist / max(-viewPos.z, 0.5);
  gl_PointSize = uPointSize * aSizeRand * perspective;
}
`;

const ARC_FRAGMENT_SHADER = `#version 300 es
precision mediump float;
in float vBrightness;
in float vCrisp;
out vec4 outColor;
uniform vec3 uColorNear;
uniform vec3 uColorFar;

void main() {
  vec2 uv = (gl_PointCoord - 0.5) * 2.0;
  float d = length(uv);
  // Blend between a wide, soft falloff (tiny/diffuse points) and a
  // tighter, more defined edge (the few bright accents) for real depth.
  float soft = smoothstep(1.0, 0.0, d);
  float crisp = smoothstep(0.85, 0.25, d);
  float alpha = mix(soft, crisp, vCrisp);
  if (vBrightness < 0.015) discard;
  vec3 color = mix(uColorFar, uColorNear, clamp(vBrightness * 1.6, 0.0, 1.0));
  outColor = vec4(color, alpha * vBrightness);
}
`;

// Orbital trade-line points: a sparse open arc riding at a larger, tilted
// radius around the globe, rotating together with it. Brightness is driven
// entirely by JS-side envelopes (draw-on reveal, hold, dissolve) rather than
// shader-side looping, so each pass feels like a one-off event, not a tiled
// animation. Facing-based dimming (same technique as the arc band) fakes
// passing behind/in front of the sphere without a real depth buffer.
const TRADE_VERTEX_SHADER = `#version 300 es
in vec3 aPosition;
in float aT;
uniform float uRotY;
uniform float uTiltX;
uniform float uCameraDist;
uniform mat4 uProjection;
uniform float uPointSize;
uniform float uRevealFront;
uniform float uGlobalAlpha;
out float vAlpha;

vec3 rotateY(vec3 p, float a) {
  float c = cos(a);
  float s = sin(a);
  return vec3(p.x * c + p.z * s, p.y, -p.x * s + p.z * c);
}

vec3 rotateX(vec3 p, float a) {
  float c = cos(a);
  float s = sin(a);
  return vec3(p.x, p.y * c - p.z * s, p.y * s + p.z * c);
}

void main() {
  vec3 p = rotateX(rotateY(aPosition, uRotY), uTiltX);

  // Soft taper at both open ends -- never a hard dot/endpoint.
  float endTaper = smoothstep(0.0, 0.08, aT) * (1.0 - smoothstep(0.92, 1.0, aT));

  // Progressive draw-on: everything behind the traveling front is lit at a
  // steady base level, with a slightly brighter traveling head right at it.
  float base = 1.0 - smoothstep(uRevealFront - 0.02, uRevealFront + 0.02, aT);
  float head = smoothstep(uRevealFront - 0.07, uRevealFront - 0.015, aT) *
    (1.0 - smoothstep(uRevealFront - 0.015, uRevealFront + 0.03, aT));

  float facing = p.z / max(length(p), 0.0001);
  float depthCue = 0.3 + 0.7 * smoothstep(-1.0, 0.6, facing);

  vAlpha = endTaper * (base * 0.55 + head * 0.9) * depthCue * uGlobalAlpha;

  vec3 viewPos = vec3(p.x, p.y, p.z - uCameraDist);
  gl_Position = uProjection * vec4(viewPos, 1.0);

  float perspective = uCameraDist / max(-viewPos.z, 0.5);
  gl_PointSize = uPointSize * perspective;
}
`;

const TRADE_FRAGMENT_SHADER = `#version 300 es
precision mediump float;
in float vAlpha;
out vec4 outColor;
uniform vec3 uColor;

void main() {
  vec2 uv = (gl_PointCoord - 0.5) * 2.0;
  float d = length(uv);
  float shape = smoothstep(1.0, 0.0, d);
  if (vAlpha < 0.02) discard;
  outColor = vec4(uColor, shape * vAlpha);
}
`;

function perspectiveMatrix(
  fovyRad: number,
  aspect: number,
  near: number,
  far: number,
): Float32Array {
  const f = 1 / Math.tan(fovyRad / 2);
  const nf = 1 / (near - far);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0,
  ]);
}

// Even coverage of a unit sphere, no pole clustering. A small amount of
// jitter breaks up the Fibonacci lattice's too-regular, grid-like look
// so it reads as an organic particle field rather than a woven pattern.
function fibonacciSpherePoints(count: number): Float32Array {
  const points = new Float32Array(count * 3);
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const jitterAmount = 0.012;
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2;
    const radiusAtY = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = goldenAngle * i;
    let x = Math.cos(theta) * radiusAtY;
    let z = Math.sin(theta) * radiusAtY;
    let yj = y;
    const jx = (Math.random() - 0.5) * jitterAmount;
    const jy = (Math.random() - 0.5) * jitterAmount;
    const jz = (Math.random() - 0.5) * jitterAmount;
    x += jx;
    yj += jy;
    z += jz;
    const len = Math.sqrt(x * x + yj * yj + z * z) || 1;
    x /= len;
    yj /= len;
    z /= len;
    points[i * 3] = x;
    points[i * 3 + 1] = yj;
    points[i * 3 + 2] = z;
  }
  return points;
}

// Sparse, irregular points scattered around a larger radius than the
// core sphere -- deliberately NOT a uniform Fibonacci lattice, so the
// arc band reads as organic scatter rather than a geometric ring. Radius
// is biased so most points sit close to the globe's silhouette, with a
// sparser few drifting a little further out -- kept tight so the field
// reads as scatter around the globe, never a separate halo layer. Three
// loose size/brightness tiers (mostly tiny, some medium, very few bright
// accents) give the field real depth instead of a flat scattering of
// identical dots.
function generateArcPoints(count: number) {
  const positions = new Float32Array(count * 3);
  const sizeRand = new Float32Array(count);
  const brightRand = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const u = Math.random() * 2 - 1;
    const theta = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.max(0, 1 - u * u));
    const radiusScale = 1.04 + Math.pow(Math.random(), 1.7) * 0.38;
    positions[i * 3] = Math.cos(theta) * r * radiusScale;
    positions[i * 3 + 1] = u * radiusScale;
    positions[i * 3 + 2] = Math.sin(theta) * r * radiusScale;

    const roll = Math.random();
    if (roll < 0.03) {
      // very few bright, crisp accents
      sizeRand[i] = 1.5 + Math.random() * 1.5;
      brightRand[i] = 0.5 + Math.random() * 0.3;
    } else if (roll < 0.16) {
      // some medium
      sizeRand[i] = 0.5 + Math.random() * 0.45;
      brightRand[i] = 0.16 + Math.random() * 0.18;
    } else {
      // mostly tiny and soft
      sizeRand[i] = 0.14 + Math.random() * 0.24;
      brightRand[i] = 0.03 + Math.random() * 0.11;
    }
  }
  return { positions, sizeRand, brightRand };
}

// A single open, tilted arc (not a closed ring) sampled at even angular
// steps at a fixed radius larger than the core sphere. The plane tilt is
// baked into the positions here, in object space, so the shared uRotY/
// uTiltX rotation in the shader spins it together with the globe.
function generateOrbitalArc(
  count: number,
  radius: number,
  tiltX: number,
  tiltZ: number,
  startAngle: number,
  sweep: number,
) {
  const positions = new Float32Array(count * 3);
  const tParam = new Float32Array(count);
  const cx = Math.cos(tiltX);
  const sx = Math.sin(tiltX);
  const cz = Math.cos(tiltZ);
  const sz = Math.sin(tiltZ);
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const theta = startAngle + t * sweep;
    let x = Math.cos(theta) * radius;
    let y = Math.sin(theta) * radius;
    let z = 0;
    // rotateX
    const y1 = y * cx - z * sx;
    const z1 = y * sx + z * cx;
    y = y1;
    z = z1;
    // rotateZ
    const x2 = x * cz - y * sz;
    const y2 = x * sz + y * cz;
    x = x2;
    y = y2;
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
    tParam[i] = t;
  }
  return { positions, tParam };
}

// Orbital ring decoration -- a lightweight SVG overlay drawn around (never
// through) the globe. It's positioned as a sibling of the ambient-glow div,
// outside the inner canvas-wrapper's overflow:hidden box, so it can extend
// past the globe's own circle the same way that glow already does; and it
// sits *before* the canvas in DOM order, so the globe's own opaque core
// always paints on top of it. Pure CSS rotation (reusing the sitewide
// `spin` keyframe already defined in animation.css) at a few different slow
// durations for depth -- no WebGL, no new dependency, and no change to the
// globe's own rendering, rotation, or interaction.
function pointOnCircle(cx: number, cy: number, r: number, deg: number): [number, number] {
  const rad = (deg * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}

function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  const [x1, y1] = pointOnCircle(cx, cy, r, startDeg);
  const [x2, y2] = pointOnCircle(cx, cy, r, endDeg);
  const largeArc = Math.abs(endDeg - startDeg) > 180 ? 1 : 0;
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

const RING_COLOR_STRONG = "rgba(0, 78, 255, 0.46)";
const RING_COLOR_SOFT = "rgba(130, 172, 255, 0.30)";
const RING_COLOR_FAINT = "rgba(130, 172, 255, 0.20)";
const ORBIT_POINT_COLOR = "rgba(190, 215, 255, 0.92)";

function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error("Shader compile error: " + info);
  }
  return shader;
}

function createProgram(
  gl: WebGL2RenderingContext,
  vsSource: string,
  fsSource: string,
): WebGLProgram {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSource);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSource);
  const program = gl.createProgram()!;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error("Program link error: " + gl.getProgramInfoLog(program));
  }
  return program;
}

const CORE_POINT_COUNT = 7500;
const ARC_POINT_COUNT = 2600;
const CAMERA_DIST = 4.3;
const FOV = (26 * Math.PI) / 180;

// Motion polish constants -- restrained, premium, additive on top of the
// approved static composition. None of these touch geometry, point counts,
// sizes, colors, or the base scale/tilt/position of the globe.
const BASE_TILT_X = 0.35;
const BASE_ROT_SPEED = 0.0012;; // ~ one full turn every ~190s -- almost imperceptible
const PARALLAX_MAX_ROT = 0.035; // radians, heavily capped
const PARALLAX_MAX_TILT = 0.018; // radians, heavily capped
const PARALLAX_EASE = 0.04; // per-frame lerp factor -- slow, calm settle
const SCROLL_SHIFT_MAX = 14; // px, capped small vertical/depth drift
const SCROLL_SHIFT_FACTOR = 0.025;
const SCROLL_EASE = 0.08;

// Jadat brand colors, normalized 0..1
const COLOR_NEAR = [0.7, 0.82, 1.0]; // bright white-blue glow core
const COLOR_FAR = [0.0078, 0, 0.3569]; // #02005B
const TRADE_COLOR = [0.62, 0.78, 1.0]; // soft light blue -- lighter than core, still on-brand

// Orbital trade lines -- thin, asymmetric, obliquely tilted open arcs
// riding just outside the core sphere. Each cycles through its own
// wait -> reveal -> hold -> fade rhythm independently, with randomized
// durations so they never fall into a mechanical, synchronized loop.
const TRADE_POINT_COUNT = 220;
const TRADE_ARC_CONFIGS = [
  { radius: 1.2, tiltX: 0.5, tiltZ: 0.15, start: 0, sweep: 6.0, maxAlpha: 0.5 },
  { radius: 1.32, tiltX: -0.35, tiltZ: 0.6, start: 0.5, sweep: 5.6, maxAlpha: 0.35 },
];

const ParticleGlobe = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const pointerInteracting = useRef<number | null>(null);
  const pointerMovement = useRef(0);
  const dragRotation = useRef(0);
  const [revealed, setRevealed] = useState(false);

  const prefersReducedMotion = useMemo(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );

  // Rotation style for one orbital-ring group -- reuses the sitewide `spin`
  // keyframe (animation.css) rather than defining a new one. Reduced motion
  // simply omits the animation, leaving the ring static but still visible.
  const ringStyle = (durationSec: number, reverse = false): React.CSSProperties =>
    prefersReducedMotion
      ? { transformOrigin: "100px 100px" }
      : {
          transformOrigin: "100px 100px",
          animation: `spin ${durationSec}s linear infinite${reverse ? " reverse" : ""}`,
        };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const outerWrapper = canvas.closest(
      "[data-globe-size]",
    ) as HTMLElement | null;
    if (!outerWrapper) return;

    const gl = canvas.getContext("webgl2", { antialias: true, alpha: true });
    if (!gl) return;

    const coreProgram = createProgram(
      gl,
      CORE_VERTEX_SHADER,
      CORE_FRAGMENT_SHADER,
    );
    const arcProgram = createProgram(gl, ARC_VERTEX_SHADER, ARC_FRAGMENT_SHADER);
    const tradeProgram = createProgram(gl, TRADE_VERTEX_SHADER, TRADE_FRAGMENT_SHADER);

    // Core buffer
    const corePositions = fibonacciSpherePoints(CORE_POINT_COUNT);
    const coreBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, coreBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, corePositions, gl.STATIC_DRAW);
    const coreAPosition = gl.getAttribLocation(coreProgram, "aPosition");
    const coreU = {
      rotY: gl.getUniformLocation(coreProgram, "uRotY"),
      tiltX: gl.getUniformLocation(coreProgram, "uTiltX"),
      cameraDist: gl.getUniformLocation(coreProgram, "uCameraDist"),
      projection: gl.getUniformLocation(coreProgram, "uProjection"),
      pointSize: gl.getUniformLocation(coreProgram, "uPointSize"),
      colorNear: gl.getUniformLocation(coreProgram, "uColorNear"),
      colorFar: gl.getUniformLocation(coreProgram, "uColorFar"),
    };

    // Arc buffers
    const arcData = generateArcPoints(ARC_POINT_COUNT);
    const arcPositionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, arcPositionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, arcData.positions, gl.STATIC_DRAW);
    const arcSizeBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, arcSizeBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, arcData.sizeRand, gl.STATIC_DRAW);
    const arcBrightBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, arcBrightBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, arcData.brightRand, gl.STATIC_DRAW);

    const arcAPosition = gl.getAttribLocation(arcProgram, "aPosition");
    const arcASizeRand = gl.getAttribLocation(arcProgram, "aSizeRand");
    const arcABrightRand = gl.getAttribLocation(arcProgram, "aBrightRand");
    const arcU = {
      rotY: gl.getUniformLocation(arcProgram, "uRotY"),
      tiltX: gl.getUniformLocation(arcProgram, "uTiltX"),
      cameraDist: gl.getUniformLocation(arcProgram, "uCameraDist"),
      projection: gl.getUniformLocation(arcProgram, "uProjection"),
      pointSize: gl.getUniformLocation(arcProgram, "uPointSize"),
      colorNear: gl.getUniformLocation(arcProgram, "uColorNear"),
      colorFar: gl.getUniformLocation(arcProgram, "uColorFar"),
      time: gl.getUniformLocation(arcProgram, "uTime"),
    };

    // Trade-line buffers -- one position/t pair per arc config.
    const tradeAPosition = gl.getAttribLocation(tradeProgram, "aPosition");
    const tradeAT = gl.getAttribLocation(tradeProgram, "aT");
    const tradeU = {
      rotY: gl.getUniformLocation(tradeProgram, "uRotY"),
      tiltX: gl.getUniformLocation(tradeProgram, "uTiltX"),
      cameraDist: gl.getUniformLocation(tradeProgram, "uCameraDist"),
      projection: gl.getUniformLocation(tradeProgram, "uProjection"),
      pointSize: gl.getUniformLocation(tradeProgram, "uPointSize"),
      revealFront: gl.getUniformLocation(tradeProgram, "uRevealFront"),
      globalAlpha: gl.getUniformLocation(tradeProgram, "uGlobalAlpha"),
      color: gl.getUniformLocation(tradeProgram, "uColor"),
    };

    type ArcPhase = "waiting" | "revealing" | "holding" | "fading";
    interface ArcRuntime {
      positionBuffer: WebGLBuffer;
      tBuffer: WebGLBuffer;
      maxAlpha: number;
      phase: ArcPhase;
      timer: number;
      phaseDuration: number;
      revealFront: number;
      alpha: number;
    }
    const randBetween = (min: number, max: number) => min + Math.random() * (max - min);

    const tradeArcs: ArcRuntime[] = TRADE_ARC_CONFIGS.map((cfg, i) => {
      const { positions, tParam } = generateOrbitalArc(
        TRADE_POINT_COUNT,
        cfg.radius,
        cfg.tiltX,
        cfg.tiltZ,
        cfg.start,
        cfg.sweep,
      );
      const positionBuffer = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
      const tBuffer = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, tBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, tParam, gl.STATIC_DRAW);
      return {
        positionBuffer,
        tBuffer,
        maxAlpha: cfg.maxAlpha,
        phase: "waiting",
        timer: randBetween(2, 6) + i * 3,
        phaseDuration: 1,
        revealFront: 0,
        alpha: 0,
      };
    });

    // Advance one arc's wait -> reveal -> hold -> fade cycle by one frame
    // step. Durations are re-rolled each cycle so the rhythm never repeats
    // mechanically. Under reduced motion, arcs freeze at a dim static hold.
    const stepArc = (arc: ArcRuntime, dt: number) => {
      if (prefersReducedMotion) {
        arc.phase = "holding";
        arc.revealFront = 1.05;
        arc.alpha = 0.4;
        return;
      }
      arc.timer -= dt;
      if (arc.phase === "waiting") {
        arc.revealFront = 0;
        arc.alpha = 0;
        if (arc.timer <= 0) {
          arc.phase = "revealing";
          arc.phaseDuration = randBetween(1.6, 2.6);
          arc.timer = arc.phaseDuration;
        }
      } else if (arc.phase === "revealing") {
        const p = 1 - Math.max(arc.timer, 0) / arc.phaseDuration;
        arc.revealFront = p * 1.08;
        arc.alpha = 1;
        if (arc.timer <= 0) {
          arc.phase = "holding";
          arc.revealFront = 1.08;
          arc.timer = randBetween(1.2, 2.4);
        }
      } else if (arc.phase === "holding") {
        if (arc.timer <= 0) {
          arc.phase = "fading";
          arc.phaseDuration = randBetween(1.4, 2.2);
          arc.timer = arc.phaseDuration;
        }
      } else {
        const p = Math.max(arc.timer, 0) / arc.phaseDuration;
        arc.alpha = p;
        if (arc.timer <= 0) {
          arc.phase = "waiting";
          arc.timer = randBetween(6, 13);
        }
      }
    };

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.disable(gl.DEPTH_TEST);

    let width = 0;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      width = outerWrapper.offsetWidth;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${width}px`;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(width * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
    };

    resize();
    window.addEventListener("resize", resize);

    // Passive pointer parallax -- desktop-only (fine pointer + hover capable),
    // heavily damped and capped. Purely additive on top of the base pose;
    // never active while the user is actively drag-rotating the globe.
    const supportsHoverFine =
      window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const parallaxTarget = { x: 0, y: 0 };
    const handlePointerMove = (e: PointerEvent) => {
      if (prefersReducedMotion || pointerInteracting.current !== null) return;
      parallaxTarget.x = (e.clientX / window.innerWidth) * 2 - 1;
      parallaxTarget.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    if (supportsHoverFine && !prefersReducedMotion) {
      window.addEventListener("pointermove", handlePointerMove);
    }

    // Subtle scroll drift -- small, capped, relative to scroll position at
    // mount so it never accumulates into a large offset.
    const baseScrollY = window.scrollY;
    let parallaxRot = 0;
    let parallaxTilt = 0;
    let scrollShift = 0;

    let rotY = 0;
    let raf = 0;
    let lastFrameTime = performance.now();

    const render = () => {
      const now = performance.now();
      // Real elapsed time, not an assumed frame rate -- keeps the trade-line
      // reveal/hold/fade rhythm correct in wall-clock time even if the tab
      // is briefly throttled (backgrounded) and rAF fires sparsely. Capped
      // so a long pause doesn't cause one giant catch-up jump.
      const dt = Math.min((now - lastFrameTime) / 1000, 0.5);
      lastFrameTime = now;

      if (pointerInteracting.current === null && !prefersReducedMotion) {
        rotY += BASE_ROT_SPEED;
      }
      const aspect = canvas.width / canvas.height;
      const projection = perspectiveMatrix(FOV, aspect, 0.1, 20);

      parallaxRot +=
        (parallaxTarget.x * PARALLAX_MAX_ROT - parallaxRot) * PARALLAX_EASE;
      parallaxTilt +=
        (parallaxTarget.y * PARALLAX_MAX_TILT - parallaxTilt) * PARALLAX_EASE;

      const scrollTarget = prefersReducedMotion
        ? 0
        : Math.max(
            -SCROLL_SHIFT_MAX,
            Math.min(
              SCROLL_SHIFT_MAX,
              (window.scrollY - baseScrollY) * SCROLL_SHIFT_FACTOR,
            ),
          );
      scrollShift += (scrollTarget - scrollShift) * SCROLL_EASE;
      if (wrapperRef.current) {
        wrapperRef.current.style.transform = `translateY(${scrollShift.toFixed(2)}px)`;
      }

      const rot = rotY + dragRotation.current + parallaxRot;
      const tilt = BASE_TILT_X + parallaxTilt;

      gl.clear(gl.COLOR_BUFFER_BIT);

      // Trade lines -- additive blending makes draw order visually
      // irrelevant against the other passes, so they're drawn first.
      gl.useProgram(tradeProgram);
      gl.uniform1f(tradeU.rotY, rot);
      gl.uniform1f(tradeU.tiltX, tilt);
      gl.uniform1f(tradeU.cameraDist, CAMERA_DIST);
      gl.uniformMatrix4fv(tradeU.projection, false, projection);
      gl.uniform1f(tradeU.pointSize, width * dpr * 0.004);
      gl.uniform3fv(tradeU.color, TRADE_COLOR);
      for (const arc of tradeArcs) {
        stepArc(arc, dt);
        if (arc.alpha <= 0.001) continue;
        gl.bindBuffer(gl.ARRAY_BUFFER, arc.positionBuffer);
        gl.enableVertexAttribArray(tradeAPosition);
        gl.vertexAttribPointer(tradeAPosition, 3, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, arc.tBuffer);
        gl.enableVertexAttribArray(tradeAT);
        gl.vertexAttribPointer(tradeAT, 1, gl.FLOAT, false, 0, 0);
        gl.uniform1f(tradeU.revealFront, arc.revealFront);
        gl.uniform1f(tradeU.globalAlpha, arc.alpha * arc.maxAlpha);
        gl.drawArrays(gl.POINTS, 0, TRADE_POINT_COUNT);
      }

      // Draw arcs first (behind), then the bright core on top.
      gl.useProgram(arcProgram);
      gl.bindBuffer(gl.ARRAY_BUFFER, arcPositionBuffer);
      gl.enableVertexAttribArray(arcAPosition);
      gl.vertexAttribPointer(arcAPosition, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, arcSizeBuffer);
      gl.enableVertexAttribArray(arcASizeRand);
      gl.vertexAttribPointer(arcASizeRand, 1, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, arcBrightBuffer);
      gl.enableVertexAttribArray(arcABrightRand);
      gl.vertexAttribPointer(arcABrightRand, 1, gl.FLOAT, false, 0, 0);

      gl.uniform1f(arcU.rotY, rot);
      gl.uniform1f(arcU.tiltX, tilt);
      gl.uniform1f(arcU.cameraDist, CAMERA_DIST);
      gl.uniformMatrix4fv(arcU.projection, false, projection);
      gl.uniform1f(arcU.pointSize, width * dpr * 0.0052);
      gl.uniform3fv(arcU.colorNear, COLOR_NEAR);
      gl.uniform3fv(arcU.colorFar, COLOR_FAR);
      gl.uniform1f(arcU.time, prefersReducedMotion ? 0 : now / 1000);
      gl.drawArrays(gl.POINTS, 0, ARC_POINT_COUNT);

      gl.useProgram(coreProgram);
      gl.bindBuffer(gl.ARRAY_BUFFER, coreBuffer);
      gl.enableVertexAttribArray(coreAPosition);
      gl.vertexAttribPointer(coreAPosition, 3, gl.FLOAT, false, 0, 0);

      gl.uniform1f(coreU.rotY, rot);
      gl.uniform1f(coreU.tiltX, tilt);
      gl.uniform1f(coreU.cameraDist, CAMERA_DIST);
      gl.uniformMatrix4fv(coreU.projection, false, projection);
      gl.uniform1f(coreU.pointSize, width * dpr * 0.0055);
      gl.uniform3fv(coreU.colorNear, COLOR_NEAR);
      gl.uniform3fv(coreU.colorFar, COLOR_FAR);
      gl.drawArrays(gl.POINTS, 0, CORE_POINT_COUNT);

      raf = requestAnimationFrame(render);
    };

    gl.clearColor(0, 0, 0, 0);
    raf = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", handlePointerMove);
      gl.deleteProgram(coreProgram);
      gl.deleteProgram(arcProgram);
      gl.deleteProgram(tradeProgram);
      gl.deleteBuffer(coreBuffer);
      gl.deleteBuffer(arcPositionBuffer);
      gl.deleteBuffer(arcSizeBuffer);
      gl.deleteBuffer(arcBrightBuffer);
      for (const arc of tradeArcs) {
        gl.deleteBuffer(arc.positionBuffer);
        gl.deleteBuffer(arc.tBuffer);
      }
    };
  }, [prefersReducedMotion]);

  useEffect(() => {
    if (prefersReducedMotion) {
      setRevealed(true);
      return;
    }
    const timer = setTimeout(() => setRevealed(true), 50);
    return () => clearTimeout(timer);
  }, [prefersReducedMotion]);

  return (
    <div
      ref={wrapperRef}
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* Soft ambient glow behind/around the globe -- centered on the
          object rather than pinned above it, and biased slightly toward
          the bottom so it blends into the hero background's own glow
          lower in the section instead of bleeding up toward the
          headline. Restrained brightness/spread -- a quiet accent around
          a small floating object, not a wash. */}
      <div
        style={{
          position: "absolute",
          top: "-10%",
          bottom: "-35%",
          left: "-20%",
          right: "-20%",
          background:
            "radial-gradient(circle at 50% 58%, rgba(0,78,255,0.30) 0%, rgba(0,78,255,0.14) 42%, rgba(2,0,91,0) 74%)",
          filter: "blur(20px)",
          pointerEvents: "none",
        }}
      />
      {/* Orbital ring system -- three thin elliptical rings at different
          sizes/tilts/speeds for depth, two small points riding along two of
          them, and one short dashed "data" arc hugging just outside the
          globe. Sits behind the canvas in paint order (see comment above
          pointOnCircle) so it only ever reads as framing the globe, never
          crossing over it. */}
      <svg
        viewBox="0 0 200 200"
        style={{
          position: "absolute",
          top: "-44%",
          bottom: "-44%",
          left: "-44%",
          right: "-44%",
          width: "188%",
          height: "188%",
          pointerEvents: "none",
        }}
        aria-hidden="true"
      >

        {/* One subtle dashed data arc, hugging just outside the globe --
            suggests connectivity/data without encircling it. */}
        <g style={ringStyle(130)}>
          <path
            d={arcPath(100, 100, 60, 200, 340)}
            fill="none"
            stroke={RING_COLOR_SOFT}
            strokeWidth="0.6"
            strokeDasharray="1.4 3.2"
            strokeLinecap="round"
          />
          <circle
            cx={pointOnCircle(100, 100, 60, 200)[0]}
            cy={pointOnCircle(100, 100, 60, 200)[1]}
            r="1.1"
            fill={ORBIT_POINT_COLOR}
          />
          <circle
            cx={pointOnCircle(100, 100, 60, 340)[0]}
            cy={pointOnCircle(100, 100, 60, 340)[1]}
            r="0.9"
            fill={ORBIT_POINT_COLOR}
            opacity="0.8"
          />
        </g>
      </svg>
      {/* No crop mask -- the whole sphere renders, a complete floating
          object rather than a peek cut off by an edge. */}
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          overflow: "hidden",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <canvas
          id="particleGlobe"
          ref={canvasRef}
          onPointerDown={(e) => {
            pointerInteracting.current = e.clientX - pointerMovement.current;
            if (canvasRef.current) canvasRef.current.style.cursor = "grabbing";
          }}
          onPointerUp={() => {
            pointerInteracting.current = null;
            if (canvasRef.current) canvasRef.current.style.cursor = "grab";
          }}
          onPointerOut={() => {
            pointerInteracting.current = null;
            if (canvasRef.current) canvasRef.current.style.cursor = "grab";
          }}
          onMouseMove={(e) => {
            if (pointerInteracting.current !== null) {
              const delta = e.clientX - pointerInteracting.current;
              pointerMovement.current = delta;
              dragRotation.current = delta / 200;
            }
          }}
          onTouchMove={(e) => {
            if (pointerInteracting.current !== null && e.touches[0]) {
              const delta = e.touches[0].clientX - pointerInteracting.current;
              pointerMovement.current = delta;
              dragRotation.current = delta / 100;
            }
          }}
          style={{
            position: "relative",
            cursor: "grab",
            opacity: revealed ? 1 : 0,
            transform: revealed ? "scale(1)" : "scale(0.97)",
            filter: revealed ? "blur(0px)" : "blur(4px)",
            transition: prefersReducedMotion
              ? "opacity 0.4s ease"
              : "opacity 1.1s cubic-bezier(0.16, 1, 0.3, 1), transform 1.1s cubic-bezier(0.16, 1, 0.3, 1), filter 1.1s cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        />
      </div>
    </div>
  );
};

export default ParticleGlobe;
