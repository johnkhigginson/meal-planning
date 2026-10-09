"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";

// Maximum lean toward the cursor on hover, in degrees.
const LEAN = 10;
// Fling: top release speed (deg/s) and how fast it winds down (higher = sooner).
const MAX_FLING = 1440;
const FRICTION = 1.6;

const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";
function subscribeReduced(cb: () => void) {
  const mq = window.matchMedia(REDUCED_QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
function getReduced() {
  return window.matchMedia(REDUCED_QUERY).matches;
}

// Segment dividers, every 36 degrees, from the centre (200,200) to r=150.
const SEGMENTS = Array.from({ length: 10 }, (_, i) => {
  const a = (i * Math.PI) / 5;
  return { x2: 200 + Math.cos(a) * 150, y2: 200 + Math.sin(a) * 150 };
});

/**
 * Landing-page hero visual. The lemon slice sits still. Grab it and drag
 * around the centre to turn it; let go mid-drag and it keeps spinning, then
 * winds down. On hover it leans slightly toward the cursor.
 *
 * Nothing moves unless the visitor moves it, so no pause control is needed
 * (WCAG 2.2.2 covers motion that starts on its own). The rAF loop only runs
 * while something is moving and stops once the slice settles.
 *
 * Reduced motion: dragging still turns the slice 1:1, but there is no fling
 * and no lean.
 */
export function LemonSlice({ children }: { children?: React.ReactNode }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const grabRef = useRef<HTMLDivElement>(null);
  const tiltRef = useRef<HTMLDivElement>(null);
  const discRef = useRef<HTMLDivElement>(null);
  const spinRef = useRef<SVGGElement>(null);
  const sheenRef = useRef<SVGRadialGradientElement>(null);
  const reduced = useSyncExternalStore(subscribeReduced, getReduced, () => false);
  const reducedRef = useRef(reduced);

  useEffect(() => {
    reducedRef.current = reduced;
  }, [reduced]);

  useEffect(() => {
    const stage = stageRef.current;
    const grab = grabRef.current;
    if (!stage || !grab) return;

    let angle = 0; // degrees
    let speed = 0; // degrees per second, after release
    let dragging = false;
    let dragId = -1;
    let lastPointerAngle = 0;
    let lastMoveTime = 0;
    let velocity = 0; // smoothed drag velocity, deg/s
    let hover = false;
    let nx = 0;
    let ny = 0;
    let cx = 0;
    let cy = 0;
    let raf = 0;
    let last = 0;

    const apply = () => {
      spinRef.current?.setAttribute("transform", `rotate(${angle.toFixed(2)} 200 200)`);
      if (tiltRef.current) {
        tiltRef.current.style.transform = `perspective(900px) rotateX(${(cy * LEAN).toFixed(2)}deg) rotateY(${(-cx * LEAN).toFixed(2)}deg) translate(${(cx * 8).toFixed(1)}px, ${(cy * 8).toFixed(1)}px)`;
      }
      if (discRef.current) {
        discRef.current.style.transform = `translate(${(cx * 3).toFixed(1)}px, ${(cy * 3).toFixed(1)}px)`;
      }
      sheenRef.current?.setAttribute("cx", (150 + cx * 110).toFixed(1));
      sheenRef.current?.setAttribute("cy", (140 + cy * 110).toFixed(1));
    };

    const frame = (t: number) => {
      const dt = last ? Math.min(0.05, (t - last) / 1000) : 0;
      last = t;

      if (!dragging && speed !== 0) {
        angle = (angle + speed * dt) % 360;
        speed *= Math.exp(-dt * FRICTION);
        if (Math.abs(speed) < 2) speed = 0;
      }

      const leanOn = hover && !reducedRef.current;
      const k = 1 - Math.exp(-dt * 7);
      cx += ((leanOn ? nx : 0) - cx) * k;
      cy += ((leanOn ? ny : 0) - cy) * k;
      if (!leanOn && Math.abs(cx) < 0.001 && Math.abs(cy) < 0.001) {
        cx = 0;
        cy = 0;
      }

      apply();

      // Keep looping only while something is still moving.
      const settled = !dragging && speed === 0 && !leanOn && cx === 0 && cy === 0;
      if (settled) {
        raf = 0;
        last = 0;
      } else {
        raf = requestAnimationFrame(frame);
      }
    };

    const wake = () => {
      if (!raf) {
        last = 0;
        raf = requestAnimationFrame(frame);
      }
    };

    // Angle of the pointer around the slice's centre, in degrees.
    const pointerAngle = (e: PointerEvent) => {
      const r = grab.getBoundingClientRect();
      return (Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180) / Math.PI;
    };

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      dragging = true;
      dragId = e.pointerId;
      speed = 0;
      velocity = 0;
      lastPointerAngle = pointerAngle(e);
      lastMoveTime = e.timeStamp;
      grab.setPointerCapture(e.pointerId);
      stage.dataset.dragging = "";
      wake();
    };

    const onMove = (e: PointerEvent) => {
      const r = stage.getBoundingClientRect();
      nx = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1));
      ny = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height) * 2 - 1));

      if (dragging && e.pointerId === dragId) {
        const a = pointerAngle(e);
        let delta = a - lastPointerAngle;
        if (delta > 180) delta -= 360;
        if (delta < -180) delta += 360;
        angle = (angle + delta) % 360;
        const dt = Math.max(1, e.timeStamp - lastMoveTime) / 1000;
        velocity = velocity * 0.6 + (delta / dt) * 0.4;
        lastPointerAngle = a;
        lastMoveTime = e.timeStamp;
      }
      wake();
    };

    const onUp = (e: PointerEvent) => {
      if (!dragging || e.pointerId !== dragId) return;
      dragging = false;
      delete stage.dataset.dragging;
      // A drag that stopped before release shouldn't fling.
      const idle = e.timeStamp - lastMoveTime > 80;
      speed = reducedRef.current || idle ? 0 : Math.max(-MAX_FLING, Math.min(MAX_FLING, velocity));
      wake();
    };

    const onEnter = (e: PointerEvent) => {
      if (e.pointerType === "mouse") hover = true;
      wake();
    };
    const onLeave = () => {
      hover = false;
      wake();
    };

    grab.addEventListener("pointerdown", onDown);
    stage.addEventListener("pointermove", onMove);
    grab.addEventListener("pointerup", onUp);
    grab.addEventListener("pointercancel", onUp);
    stage.addEventListener("pointerenter", onEnter);
    stage.addEventListener("pointerleave", onLeave);

    apply();

    return () => {
      cancelAnimationFrame(raf);
      grab.removeEventListener("pointerdown", onDown);
      stage.removeEventListener("pointermove", onMove);
      grab.removeEventListener("pointerup", onUp);
      grab.removeEventListener("pointercancel", onUp);
      stage.removeEventListener("pointerenter", onEnter);
      stage.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return (
    <div ref={stageRef} className="group/lemon relative aspect-square w-full max-w-[520px] select-none">
      <div ref={discRef} className="absolute inset-0 rounded-full bg-[#f3e6be] will-change-transform dark:bg-[#3a3014]" />
      <div ref={tiltRef} className="absolute inset-0 flex items-center justify-center will-change-transform">
        {/* The grab target is the slice itself. pan-y keeps vertical page
            scrolling working on phones; a sideways swipe turns the slice. */}
        <div
          ref={grabRef}
          className="h-[86%] w-[86%] cursor-grab touch-pan-y rounded-full group-data-[dragging]/lemon:cursor-grabbing"
        >
          <svg
            viewBox="0 0 400 400"
            role="img"
            aria-label="A sliced lemon"
            className="h-full w-full overflow-visible drop-shadow-[0_18px_22px_rgb(92_69_0/0.18)]"
          >
            <defs>
              <radialGradient ref={sheenRef} id="lemon-sheen" gradientUnits="userSpaceOnUse" cx="150" cy="140" r="230">
                <stop offset="0" stopColor="#FFFBE8" stopOpacity="0.55" />
                <stop offset="0.55" stopColor="#FFFBE8" stopOpacity="0" />
              </radialGradient>
            </defs>
            <g ref={spinRef}>
              <circle cx="200" cy="200" r="190" fill="#F4CF3A" />
              <circle cx="200" cy="200" r="172" fill="#FFF3C9" />
              <circle className="lemon-flesh" cx="200" cy="200" r="158" fill="#F7DA5E" />
              <g stroke="#FFF3C9" strokeWidth="9" strokeLinecap="round">
                {SEGMENTS.map((s, i) => (
                  <line
                    key={i}
                    className="lemon-seg"
                    x1="200"
                    y1="200"
                    x2={s.x2.toFixed(1)}
                    y2={s.y2.toFixed(1)}
                    style={{ animationDelay: `${250 + i * 60}ms` }}
                  />
                ))}
              </g>
              <circle cx="200" cy="200" r="22" fill="#FFF3C9" />
              <ellipse cx="262" cy="150" rx="7" ry="11" fill="#FFF8E0" transform="rotate(30 262 150)" />
              <ellipse cx="140" cy="248" rx="7" ry="11" fill="#FFF8E0" transform="rotate(-20 140 248)" />
            </g>
            <circle cx="200" cy="200" r="190" fill="url(#lemon-sheen)" pointerEvents="none" />
          </svg>
        </div>
      </div>

      {children}
    </div>
  );
}
