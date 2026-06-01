import { useSpring } from "@react-spring/web";
import createGlobe from "cobe";
import React, { useEffect, useRef, useState } from "react";

const Globe = () => {
  const canvasRef = useRef(null);
  const pointerInteracting = useRef(null);
  const pointerInteractionMovement = useRef(0);
  const globeRef = useRef(null);
  const [width, setWidth] = useState(0);

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
      if (canvasRef.current) {
        // @ts-ignore
        const newWidth = canvasRef.current.offsetWidth;
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
      theta: 0,
      dark: 0,
      diffuse: 0,
      mapSamples: 33000,
      mapBrightness: 12,
      baseColor: [1, 1, 1],
      markerColor: [255, 255, 255],
      glowColor: [1, 1, 1],
      markers: [],
      offset: [0, width * 1.8],
      scale: 1.2,
      onRender: (state) => {
        if (!pointerInteracting.current) {
          phi += 0.003;
        }
        state.phi = phi + r.get();
        state.width = width * 2;
        state.height = width * 2;
      },
    });

    setTimeout(() => {
      if (canvasRef.current) {
        // @ts-ignore
        canvasRef.current.style.opacity = "1";
      }
    });

    return () => {
      if (globeRef.current) {
        // @ts-ignore
        globeRef.current.destroy();
      }
      window.removeEventListener("resize", onResize);
    };
  }, [width, r]);

  return (
    <div data-aos="fade-up-sm" data-aos-delay="200" id="globeCanvas">
      <canvas
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
          cursor: "grab",
          contain: "layout paint size",
          opacity: 0,
          transition: "opacity 1s ease",
        }}
      />
    </div>
  );
};

export default Globe;
