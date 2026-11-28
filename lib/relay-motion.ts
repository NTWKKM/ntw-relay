// Shared send timeline (seconds), measured from the moment a drop is sent.
// The composer melt, the water droplet, the impact, the feed card catch, and the
// Workspace "just relayed" window all key off these values.
export const RELAY_BURST = {
  // Composer swells on a disturbed surface, then melts away.
  swellEnd: 0.26,
  collapseEnd: 0.5,
  // Its water gathers into one bead under surface tension.
  formAt: 0.16,
  gatherEnd: 0.8,
  // The bead sags, pinches off, and falls under gravity.
  launchAt: 0.92,
  landAt: 1.32,
  // Gap from the composer's bottom edge to the top of the feed.
  landY: 90,
  // Last capillary ripple has faded by here.
  total: 2.5,
} as const;

export const EASE_STREAM = [0.22, 1, 0.36, 1] as const;

/** Screen-space gravity, px/s². Tuned so a ~170px fall takes ~0.4s. */
export const GRAVITY = 2100;

/** Damped oscillation around 1 in log space, so a scale never goes negative. */
export function dampedScale(start: number, u: number, decay: number, cycles: number) {
  return Math.exp(Math.log(start) * Math.exp(-decay * u) * Math.cos(2 * Math.PI * cycles * u));
}

/** Ballistic flight: position after `t` seconds from launch velocity (px/s). */
export function ballistic(vx: number, vy: number, t: number) {
  return { x: vx * t, y: vy * t + 0.5 * GRAVITY * t * t };
}
