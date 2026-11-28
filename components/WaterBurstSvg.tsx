'use client';

import React, { useEffect, useId, useRef } from 'react';
import { RELAY_BURST } from '@/lib/relay-motion';
import {
  LIGHT_DIR,
  WAVE,
  waterBox,
  waterScene,
  wavePacket,
  type Ellipse,
  type WaterGeometry,
} from '@/lib/relay-water';

/*
 * Physically shaded water in SVG. Each frame reads the physics (waterScene) and
 * moves pooled elements. A bead is lit as a sphere of water seen head-on, and
 * because that shading depends only on radius, each term becomes a gradient
 * whose stops are the formula sampled at normalised radius d:
 *   body    bodyA = 0.08 + 0.62 (1 - z)^1.4, tint deepening toward the rim
 *   rim     Schlick Fresnel 0.02 + 0.98 (1 - z)^5, sky below, highlight above
 *   glint   Blinn-Phong peak where the normal meets the half vector
 *   caustic exp(-9 d²) focus opposite the light
 * where z = sqrt(1 - d²) is the surface height at normalised radius d.
 */

const RING_POOL = 30;
const DROP_COUNT = 7;

// Normal that faces the half vector: where the sun glint sits on a unit bead.
const GLINT = (() => {
  const [lx, ly, lz] = LIGHT_DIR;
  const ll = Math.hypot(lx, ly, lz);
  const h = [lx / ll, ly / ll, lz / ll + 1];
  const hl = Math.hypot(h[0], h[1], h[2]);
  // Bead normals are (x, -y, 1.15 z); undo the z stretch to land in local coords.
  const nx = h[0] / hl;
  const ny = h[1] / hl;
  const nz = h[2] / hl / 1.15;
  const s = 1 / Math.hypot(nx, ny, nz);
  return { x: +(nx * s).toFixed(3), y: +(-ny * s).toFixed(3) };
})();

function bodyStops() {
  return [0, 0.5, 0.7, 0.8, 0.88, 0.94, 0.98, 1].map((d) => {
    const z = Math.sqrt(Math.max(1 - d * d, 0));
    const alpha = 0.08 + 0.62 * Math.pow(1 - z, 1.4);
    const deep = Math.round((1 - z * 0.55) * 100);
    return { offset: d, alpha: +alpha.toFixed(3), deep };
  });
}

function fresnelStops() {
  return [0, 0.8, 0.9, 0.95, 0.98, 0.995, 1].map((d) => {
    const z = Math.sqrt(Math.max(1 - d * d, 0));
    return { offset: d, alpha: +(0.02 + 0.98 * Math.pow(1 - z, 5)).toFixed(3) };
  });
}

const BODY = bodyStops();
const FRESNEL = fresnelStops();

function setEllipse(el: SVGGraphicsElement | null, e: Ellipse) {
  if (!el) return;
  if (e.alpha <= 0.001) {
    el.setAttribute('opacity', '0');
    return;
  }
  el.setAttribute('opacity', e.alpha.toFixed(3));
  el.setAttribute(
    'transform',
    `translate(${e.x.toFixed(2)} ${e.y.toFixed(2)}) scale(${Math.max(e.rx, 0.5).toFixed(3)} ${Math.max(e.ry, 0.5).toFixed(3)})`
  );
}

interface Ring {
  r: number;
  tone: 'crest' | 'trough';
  alpha: number;
  width: number;
}

// Zero crossings of a wave packet are its steepest slopes, where ripples catch
// the most light. Alternate slopes face toward and away from it.
function packetRings(front: number, width: number, gain: number, k: number, decay: number, fade: number) {
  const rings: Ring[] = [];
  const half = Math.PI / k;
  const reach = 2.2 * width;
  const first = Math.ceil(-reach / half);
  const last = Math.floor(reach / half);
  for (let m = first; m <= last; m += 1) {
    const offset = m * half;
    const r = front + offset;
    if (r < 3) continue;
    const env = Math.exp(-Math.pow(offset / width, 2));
    // Peak surface gradient at this crossing, foreshortened by the view angle.
    const g = WAVE.amplitude * gain * env * decay * k * WAVE.foreshorten;
    // Still water is invisible over the page; a ripple shows in proportion to
    // its tilt (1 - n.z ≈ g²/2, saturating fast) times lit water's own alpha
    // (~0.1 body + Fresnel, more where the glint lands).
    const disturbed = Math.min(14 * g * g, 1);
    const lit = m % 2 === 0 ? 0.34 : 0.2;
    const alpha = disturbed * lit * fade;
    if (alpha < 0.01) continue;
    rings.push({
      r,
      tone: m % 2 === 0 ? 'crest' : 'trough',
      alpha,
      width: Math.max(half * 0.22, 0.8),
    });
  }
  return rings;
}

function rippleRings(age: number): Ring[] {
  if (age < 0) return [];
  const { front, width, decay, lambda } = wavePacket(age);
  const k = (2 * Math.PI) / lambda;
  const fade = 1 - Math.min(Math.max((age - 0.85) / 0.5, 0), 1);
  return [
    ...packetRings(front, width, 1, k, decay, fade),
    ...packetRings(front * WAVE.trailRatio, width * 0.8, WAVE.trailGain, k * 1.25, decay, fade),
  ].slice(0, RING_POOL);
}

export function WaterBurstSvg({
  geometry,
  onDone,
}: {
  geometry: WaterGeometry;
  onDone: () => void;
}) {
  const id = useId().replace(/:/g, '');
  const geometryRef = useRef(geometry);
  const onDoneRef = useRef(onDone);
  const beadRef = useRef<SVGGElement | null>(null);
  const jetRef = useRef<SVGGElement | null>(null);
  const shadowRef = useRef<SVGGElement | null>(null);
  const craterRef = useRef<SVGEllipseElement | null>(null);
  const dropRefs = useRef<(SVGGElement | null)[]>([]);
  const ringRefs = useRef<(SVGEllipseElement | null)[]>([]);

  useEffect(() => {
    geometryRef.current = geometry;
    onDoneRef.current = onDone;
  });

  useEffect(() => {
    let frame = 0;
    let start = -1;
    const tick = (now: number) => {
      if (start < 0) start = now;
      const t = (now - start) / 1000;
      const scene = waterScene(t, geometryRef.current);

      setEllipse(shadowRef.current, scene.shadow);
      setEllipse(jetRef.current, scene.jet);
      setEllipse(beadRef.current, scene.bead);
      scene.drops.forEach((d, i) => setEllipse(dropRefs.current[i], d));

      const rings = rippleRings(scene.rippleAge);
      ringRefs.current.forEach((el, i) => {
        if (!el) return;
        const ring = rings[i];
        if (!ring) {
          el.setAttribute('opacity', '0');
          return;
        }
        el.setAttribute('rx', ring.r.toFixed(2));
        el.setAttribute('ry', (ring.r * WAVE.foreshorten).toFixed(2));
        el.setAttribute('cy', scene.surfaceY.toFixed(2));
        el.setAttribute('stroke-width', ring.width.toFixed(2));
        el.setAttribute('opacity', ring.alpha.toFixed(3));
        el.style.stroke = ring.tone === 'crest' ? 'var(--color-water-crest)' : 'var(--color-water-trough)';
      });

      const crater = craterRef.current;
      if (crater) {
        const a = scene.rippleAge >= 0 ? 0.35 * Math.exp(-13 * scene.rippleAge) : 0;
        crater.setAttribute('cy', scene.surfaceY.toFixed(2));
        crater.setAttribute('opacity', a.toFixed(3));
      }

      if (t >= RELAY_BURST.total) {
        onDoneRef.current();
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  const box = waterBox(geometry);
  const ref = (name: string) => `${id}-${name}`;

  return (
    <svg
      aria-hidden="true"
      width={box.width}
      height={box.height}
      className="pointer-events-none absolute top-0 overflow-visible"
      style={{ left: box.left }}
    >
      <defs>
        <radialGradient id={ref('body')} cx="50%" cy="50%" r="50%">
          {BODY.map((s) => (
            <stop
              key={s.offset}
              offset={s.offset}
              style={{
                stopColor: `color-mix(in oklch, var(--color-water-deep) ${s.deep}%, var(--color-water-body))`,
                stopOpacity: s.alpha,
              }}
            />
          ))}
        </radialGradient>
        <radialGradient id={ref('fresnel')} cx="50%" cy="50%" r="50%">
          {FRESNEL.map((s) => (
            <stop key={s.offset} offset={s.offset} style={{ stopColor: 'var(--color-water-mask)', stopOpacity: s.alpha }} />
          ))}
        </radialGradient>
        {/* Reflected sky: brighter where the rim faces up toward the light. */}
        <linearGradient id={ref('sky')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--color-water-glint)' }} />
          <stop offset="0.55" style={{ stopColor: 'var(--color-water-sky)' }} />
          <stop offset="1" style={{ stopColor: 'var(--color-water-sky)' }} />
        </linearGradient>
        <mask id={ref('rim')} maskContentUnits="objectBoundingBox">
          <circle cx="0.5" cy="0.5" r="0.5" fill={`url(#${ref('fresnel')})`} />
        </mask>
        <radialGradient id={ref('caustic')} cx="50%" cy="50%" r="50%">
          <stop offset="0" style={{ stopColor: 'var(--color-water-caustic)', stopOpacity: 0.75 }} />
          <stop offset="0.6" style={{ stopColor: 'var(--color-water-caustic)', stopOpacity: 0.28 }} />
          <stop offset="1" style={{ stopColor: 'var(--color-water-caustic)', stopOpacity: 0 }} />
        </radialGradient>
        <radialGradient id={ref('sheen')} cx="50%" cy="50%" r="50%">
          <stop offset="0" style={{ stopColor: 'var(--color-water-glint)', stopOpacity: 0.22 }} />
          <stop offset="1" style={{ stopColor: 'var(--color-water-glint)', stopOpacity: 0 }} />
        </radialGradient>
        <clipPath id={ref('clip')} clipPathUnits="userSpaceOnUse">
          <circle cx="0" cy="0" r="1" />
        </clipPath>
        <filter id={ref('glint')} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="0.035" />
        </filter>
        <filter id={ref('soft')} x="-100%" y="-300%" width="300%" height="700%">
          <feGaussianBlur stdDeviation="0.45" />
        </filter>

        {/* A unit water bead (radius 1); each instance is placed by transform. */}
        <g id={ref('bead')}>
          <circle cx="0" cy="0" r="1" fill={`url(#${ref('body')})`} />
          <g clipPath={`url(#${ref('clip')})`}>
            <rect x="-1" y="-1" width="2" height="2" fill={`url(#${ref('sky')})`} mask={`url(#${ref('rim')})`} />
            <circle cx="0.32" cy="0.4" r="0.55" fill={`url(#${ref('caustic')})`} />
            <circle cx={GLINT.x} cy={GLINT.y} r="0.42" fill={`url(#${ref('sheen')})`} />
          </g>
          <ellipse
            cx={GLINT.x}
            cy={GLINT.y}
            rx="0.2"
            ry="0.12"
            transform={`rotate(-34 ${GLINT.x} ${GLINT.y})`}
            filter={`url(#${ref('glint')})`}
            style={{ fill: 'var(--color-water-glint)' }}
          />
        </g>
      </defs>

      <g transform={`translate(${box.originX} ${box.originY})`}>
        <g ref={shadowRef} opacity="0">
          <circle
            cx="0"
            cy="0"
            r="0.8"
            filter={`url(#${ref('soft')})`}
            style={{ fill: 'var(--color-water-shadow)', fillOpacity: 'var(--water-shadow-strength)' }}
          />
        </g>
        <ellipse ref={craterRef} cx="0" rx="9" ry="2.7" opacity="0" style={{ fill: 'var(--color-water-trough)' }} />
        {Array.from({ length: RING_POOL }, (_, i) => (
          <ellipse
            key={i}
            ref={(el) => {
              ringRefs.current[i] = el;
            }}
            cx="0"
            fill="none"
            opacity="0"
            style={{ strokeOpacity: 'var(--water-ripple-gain)' }}
          />
        ))}
        <g ref={jetRef} opacity="0">
          <use href={`#${ref('bead')}`} />
        </g>
        {Array.from({ length: DROP_COUNT }, (_, i) => (
          <g
            key={i}
            ref={(el) => {
              dropRefs.current[i] = el;
            }}
            opacity="0"
          >
            <use href={`#${ref('bead')}`} />
          </g>
        ))}
        <g ref={beadRef} opacity="0">
          <use href={`#${ref('bead')}`} />
        </g>
      </g>
    </svg>
  );
}
