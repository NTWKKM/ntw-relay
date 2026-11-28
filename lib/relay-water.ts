import { GRAVITY, RELAY_BURST, ballistic, dampedScale } from '@/lib/relay-motion';

/**
 * Per-frame physical state of the send-drop water scene. All coordinates are
 * CSS pixels relative to the composer's centre, y pointing down. The SVG
 * renderer reads this every frame; nothing here touches the DOM.
 */

export const BEAD_RADIUS = 17;
const SAG = 5;

export interface Ellipse {
  x: number;
  y: number;
  rx: number;
  ry: number;
  alpha: number;
}

export interface WaterScene {
  bead: Ellipse;
  /** Crown droplets plus the jet's secondary droplet. */
  drops: Ellipse[];
  jet: Ellipse;
  shadow: Ellipse;
  /** Seconds since impact, or -1 before it. */
  rippleAge: number;
  surfaceY: number;
}

export interface WaterGeometry {
  width: number;
  height: number;
}

const CROWN = [
  { vx: -170, vy: -260, r: 3.5 },
  { vx: -95, vy: -360, r: 2.5 },
  { vx: -40, vy: -300, r: 2 },
  { vx: 55, vy: -320, r: 2.5 },
  { vx: 120, vy: -280, r: 3 },
  { vx: 190, vy: -230, r: 2 },
];

const SECONDARY_VY = -330;
const JET_HEIGHT = 30;

const hidden: Ellipse = { x: 0, y: 0, rx: 1, ry: 1, alpha: 0 };

/** Piecewise-linear lookup through [time, value] knots on 0..1. */
function knots(u: number, points: [number, number][]) {
  if (u <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i += 1) {
    const [t1, v1] = points[i];
    const [t0, v0] = points[i - 1];
    if (u <= t1) return v0 + ((v1 - v0) * (u - t0)) / (t1 - t0);
  }
  return points[points.length - 1][1];
}

export function surfaceOffset(geom: WaterGeometry) {
  return geom.height / 2 + RELAY_BURST.landY;
}

export function waterScene(t: number, geom: WaterGeometry): WaterScene {
  const { formAt, gatherEnd, launchAt, landAt } = RELAY_BURST;
  const R = BEAD_RADIUS;
  const surfaceY = surfaceOffset(geom);
  const fallTime = landAt - launchAt;
  const g = (2 * (surfaceY - R - SAG)) / (fallTime * fallTime);

  // Bead: gathers from a composer-sized sheet, sags, pinches off, falls, merges.
  let bead: Ellipse = hidden;
  if (t >= formAt && t < gatherEnd) {
    const u = (t - formAt) / (gatherEnd - formAt);
    bead = {
      x: 0,
      y: 0,
      rx: R * dampedScale(Math.max(geom.width / (2 * R), 2), u, 4.2, 1.5),
      ry: R * dampedScale(Math.max(geom.height / (2 * R), 2), u, 4.2, 1.5),
      alpha: Math.min(u / 0.35, 1),
    };
  } else if (t >= gatherEnd && t < launchAt) {
    const e = ((t - gatherEnd) / (launchAt - gatherEnd)) ** 2;
    bead = { x: 0, y: SAG * e, rx: R * (1 - 0.07 * e), ry: R * (1 + 0.14 * e), alpha: 1 };
  } else if (t >= launchAt && t < landAt) {
    const s = t - launchAt;
    const wobble = 0.14 * Math.exp(-6 * s) * Math.cos(2 * Math.PI * 9 * s);
    bead = {
      x: 0,
      y: SAG + 0.5 * g * s * s,
      rx: R / Math.sqrt(1 + wobble),
      ry: R * (1 + wobble),
      alpha: 1,
    };
  } else if (t >= landAt && t < landAt + 0.07) {
    const u = (t - landAt) / 0.07;
    bead = {
      x: 0,
      y: surfaceY - R * (1 - 0.7 * u) + 2,
      rx: R * (1 + 0.9 * u),
      ry: R * (1 - 0.7 * u),
      alpha: 1 - u,
    };
  }

  // Contact shadow: wide and faint far away, tight and dark on arrival.
  let shadow: Ellipse = hidden;
  const shadowStart = launchAt - 0.1;
  if (t >= shadowStart && t < landAt + 0.12) {
    let scale: number;
    let alpha: number;
    if (t <= landAt) {
      const near = ((t - shadowStart) / (landAt - shadowStart)) ** 2;
      scale = 2.6 - 1.7 * near;
      alpha = 0.06 + 0.3 * near;
    } else {
      const u = (t - landAt) / 0.12;
      scale = 0.9 + 0.8 * u;
      alpha = 0.36 * (1 - u);
    }
    shadow = { x: 0, y: surfaceY + 2, rx: 11 * scale, ry: 3.2 * scale, alpha };
  }

  // Crown splash on ballistic arcs.
  const drops: Ellipse[] = CROWN.map((d) => {
    const s = t - (landAt + 0.01);
    const flight = (-2 * d.vy) / GRAVITY;
    if (s < 0 || s > flight) return hidden;
    const p = ballistic(d.vx, d.vy, s);
    const fade = s / flight < 0.85 ? 1 : (1 - s / flight) / 0.15;
    return { x: p.x, y: surfaceY - 4 + p.y, rx: d.r, ry: d.r, alpha: fade };
  });

  // Worthington jet and the droplet it throws.
  const jetStart = landAt + 0.05;
  let jet: Ellipse = hidden;
  const ju = (t - jetStart) / 0.34;
  if (ju >= 0 && ju <= 1) {
    const h = JET_HEIGHT * knots(ju, [[0, 0], [0.35, 1], [0.7, 0.6], [1, 0]]);
    jet = {
      x: 0,
      y: surfaceY - h / 2,
      rx: 3.6 * (1 - 0.3 * ju),
      ry: Math.max(h / 2, 0.5),
      alpha: knots(ju, [[0, 0], [0.15, 0.95], [0.8, 0.85], [1, 0]]),
    };
  }
  const secondaryFlight = (-2 * SECONDARY_VY) / GRAVITY;
  const ss = t - (jetStart + 0.11);
  if (ss >= 0 && ss <= secondaryFlight) {
    const p = ballistic(0, SECONDARY_VY, ss);
    const fade = ss / secondaryFlight < 0.9 ? 1 : (1 - ss / secondaryFlight) / 0.1;
    drops.push({ x: 0, y: surfaceY - JET_HEIGHT + p.y, rx: 4.5, ry: 4.5, alpha: fade });
  } else {
    drops.push(hidden);
  }

  return { bead, drops, jet, shadow, rippleAge: t >= landAt ? t - landAt : -1, surfaceY };
}

/** Overlay box (canvas or SVG) around the composer, in CSS px. */
export const WATER_PAD_X = 220;
const WATER_PAD_BOTTOM = 150;

export function waterBox(geom: WaterGeometry) {
  return {
    left: -WATER_PAD_X,
    width: geom.width + WATER_PAD_X * 2,
    height: geom.height / 2 + surfaceOffset(geom) + WATER_PAD_BOTTOM,
    originX: WATER_PAD_X + geom.width / 2,
    originY: geom.height / 2,
  };
}

/**
 * Capillary wave packet: a Gaussian-enveloped sine whose front spreads and
 * slows, whose wavelength stretches, and whose amplitude decays with age.
 * A trailing packet follows at a fraction of the front's radius.
 */
export const WAVE = {
  reach: 290,
  spreadRate: 2.1,
  baseWidth: 12,
  widthGrowth: 55,
  decay: 1.7,
  baseLambda: 15,
  lambdaGrowth: 12,
  amplitude: 2.6,
  trailRatio: 0.58,
  trailGain: 0.45,
  foreshorten: 0.3,
} as const;

export function wavePacket(age: number) {
  return {
    front: WAVE.reach * (1 - Math.exp(-WAVE.spreadRate * age)),
    width: WAVE.baseWidth + WAVE.widthGrowth * age,
    decay: Math.exp(-WAVE.decay * age),
    lambda: WAVE.baseLambda + WAVE.lambdaGrowth * age,
  };
}

/** Direction of the key light (x right, y up, z toward the viewer). */
export const LIGHT_DIR = [-0.42, 0.62, 0.66] as const;
