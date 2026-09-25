import { useSpring } from "@react-spring/web";
import createGlobe from "cobe";
import React, { useEffect, useRef, useState } from "react";

const Globe = () => {
  const canvasRef = useRef(null);
  const pointerInteracting = useRef(null);
  const pointerInteractionMovement = useRef(0);
  const globeRef = useRef(null);
  const [width, setWidth] = useState(0);
  const [revealed, setRevealed] = useState(false);

  const [{ r }, api] = useSpring(() => ({
    r: 0,
    config: {
      mass: 1,
      tension: 280,
      friction: 40,
      precision: 0.001,
    },
  }));

  useEffect(() => {
    let phi = 0;

    const onResize = () => {
      // @ts-ignore
      const outerWrapper = canvasRef.current?.closest("[data-globe-size]");
      if (outerWrapper) {
        const newWidth = outerWrapper.offsetWidth;
        setWidth(newWidth);
        if (globeRef.current) {
          // @ts-ignore
          globeRef.current.width = newWidth * 2;
          // @ts-ignore
          globeRef.current.height = newWidth * 2;
        }
      }
    };

    window.addEventListener("resize", onResize);
    onResize();

    // @ts-ignore
    globeRef.current = createGlobe(canvasRef.current, {
      devicePixelRatio: 2,
      width: width * 2,
      height: width * 2,
      phi: 0,
      theta: 0.25,
      dark: 1,
      diffuse: 0.6,
      mapSamples: 33000,
      mapBrightness: 9,
      baseColor: [0.0078, 0, 0.3569], // #02005B
      markerColor: [1, 1, 1],
      glowColor: [0.0118, 0.3059, 1], // #034EFF
      markers: [],
      offset: [0, width * 0.42],
      scale: 1.8,
      onRender: (state) => {
        if (!pointerInteracting.current) {
          phi += 0.003;
        }
        state.phi = phi + r.get();
        state.width = width * 2;
        state.height = width * 2;
      },
    });

    return () => {
      if (globeRef.current) {
        // @ts-ignore
        globeRef.current.destroy();
      }
      window.removeEventListener("resize", onResize);
    };
  }, [width, r]);

  // Entrance reveal: separate one-time effect so it can't be re-triggered
  // or overwritten by the resize-driven effect above re-rendering.
  useEffect(() => {
    const timer = setTimeout(() => setRevealed(true), 50);
    return () => clearTimeout(timer);
  }, []);

  return (
    <canvas
      id="globeCanvas"
      ref={canvasRef}
      onPointerDown={(e) => {
        // @ts-ignore
        pointerInteracting.current =
          e.clientX - pointerInteractionMovement.current;
        if (canvasRef.current) {
          // @ts-ignore
          canvasRef.current.style.cursor = "grabbing";
        }
      }}
      onPointerUp={() => {
        pointerInteracting.current = null;
        if (canvasRef.current) {
          // @ts-ignore
          canvasRef.current.style.cursor = "grab";
        }
      }}
      onPointerOut={() => {
        pointerInteracting.current = null;
        if (canvasRef.current) {
          // @ts-ignore
          canvasRef.current.style.cursor = "grab";
        }
      }}
      onMouseMove={(e) => {
        if (pointerInteracting.current !== null) {
          const delta = e.clientX - pointerInteracting.current;
          pointerInteractionMovement.current = delta;
          api.start({
            r: delta / 200,
          });
        }
      }}
      onTouchMove={(e) => {
        if (pointerInteracting.current !== null && e.touches[0]) {
          const delta = e.touches[0].clientX - pointerInteracting.current;
          pointerInteractionMovement.current = delta;
          api.start({
            r: delta / 100,
          });
        }
      }}
      style={{
        width: `${width}px`,
        height: `${width}px`,
        cursor: "grab",
        opacity: revealed ? 1 : 0,
        transform: revealed ? "scale(1)" : "scale(0.85)",
        filter: revealed ? "blur(0px)" : "blur(8px)",
        transition:
          "opacity 0.9s cubic-bezier(0.16, 1, 0.3, 1), transform 0.9s cubic-bezier(0.16, 1, 0.3, 1), filter 0.9s cubic-bezier(0.16, 1, 0.3, 1)",
      }}
    />
  );
};

export default Globe;
