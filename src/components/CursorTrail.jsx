import React, { useEffect, useRef, useState } from "react";
import "./CursorTrail.css";

const DOT_COUNT = 14;
const EASE = 0.28;

const CursorTrail = () => {
  const dotsRef = useRef([]);
  const mouse = useRef({ x: 0, y: 0 });
  const positions = useRef(Array.from({ length: DOT_COUNT }, () => ({ x: 0, y: 0 })));
  const frameRef = useRef(null);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const isCoarsePointer = window.matchMedia("(pointer: coarse)").matches;
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (isCoarsePointer || prefersReducedMotion) {
      setEnabled(false);
      return undefined;
    }

    setEnabled(true);

    const handleMouseMove = (event) => {
      mouse.current.x = event.clientX;
      mouse.current.y = event.clientY;
    };

    window.addEventListener("mousemove", handleMouseMove, { passive: true });

    const animate = () => {
      let x = mouse.current.x;
      let y = mouse.current.y;

      for (let index = 0; index < positions.current.length; index += 1) {
        const pos = positions.current[index];
        pos.x += (x - pos.x) * EASE;
        pos.y += (y - pos.y) * EASE;

        x = pos.x;
        y = pos.y;

        const dot = dotsRef.current[index];
        if (dot) {
          const scale = 1 - index / positions.current.length;
          dot.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0) scale(${scale})`;
          dot.style.opacity = String(scale);
        }
      }

      frameRef.current = window.requestAnimationFrame(animate);
    };

    frameRef.current = window.requestAnimationFrame(animate);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      if (frameRef.current) {
        window.cancelAnimationFrame(frameRef.current);
      }
    };
  }, []);

  if (!enabled) return null;

  return (
    <div className="cursor-trail" aria-hidden="true">
      {positions.current.map((_, index) => (
        <span
          key={index}
          ref={(element) => {
            dotsRef.current[index] = element;
          }}
          className="cursor-dot"
        />
      ))}
    </div>
  );
};

export default CursorTrail;
