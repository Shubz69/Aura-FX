import React, { useEffect, useRef, useState } from 'react';

/* ── Module-level preload — starts loading as soon as this file is imported ── */
const BG_IMAGE_SRC = '/assets/my-bg.jpg';

let preloadedImage = null;
let preloadStarted = false;

function ensurePreload() {
  if (preloadStarted) return;
  preloadStarted = true;
  preloadedImage = new Image();
  preloadedImage.src = BG_IMAGE_SRC;
}

// Start loading immediately when this module is evaluated
ensurePreload();

const CosmicBackground = () => {
  const canvasRef = useRef(null);
  const [imageReady, setImageReady] = useState(() => {
    // If already cached/loaded before mount, start with true
    return preloadedImage?.complete && preloadedImage.naturalWidth > 0;
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let raf;
    let time = 0;

    let bgImage = preloadedImage;

    const onImageReady = () => setImageReady(true);

    // If preload isn't complete yet, wait for it
    if (bgImage) {
      if (bgImage.complete && bgImage.naturalWidth > 0) {
        // Already ready — no action needed
      } else {
        bgImage.addEventListener('load', onImageReady, { once: true });
        bgImage.addEventListener('error', () => setImageReady(false), { once: true });
      }
    } else {
      // Edge case: start loading now
      bgImage = new Image();
      bgImage.src = BG_IMAGE_SRC;
      preloadedImage = bgImage;
      bgImage.addEventListener('load', onImageReady, { once: true });
      bgImage.addEventListener('error', () => setImageReady(false), { once: true });
    }

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    /* ── Stars ── */
    const stars = Array.from({ length: 100 }, () => {
      const roll = Math.random();
      let rgb, size, baseAlpha;

      if (roll < 0.80) {
        rgb = [195, 210, 228];
        size = Math.random() * 0.8 + 0.2;
        baseAlpha = Math.random() * 0.35 + 0.25;
      } else if (roll < 0.95) {
        rgb = [220, 156, 85];
        size = Math.random() * 1.0 + 0.5;
        baseAlpha = Math.random() * 0.3 + 0.45;
      } else {
        rgb = [250, 175, 94];
        size = Math.random() * 1.4 + 1.2;
        baseAlpha = Math.random() * 0.15 + 0.75;
      }

      return {
        x: Math.random(),
        y: Math.random() * 0.85,
        r: size,
        rgb,
        baseAlpha,
        speed: Math.random() * 0.0018 + 0.0005,
        phase: Math.random() * Math.PI * 2,
      };
    });

    const drawStars = (W, H) => {
      stars.forEach(s => {
        s.phase += s.speed;
        const tw = Math.sin(s.phase) * 0.18 + 0.82;
        const alpha = s.baseAlpha * tw;

        ctx.beginPath();
        ctx.arc(s.x * W, s.y * H, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${s.rgb},${alpha})`;
        ctx.fill();
      });
    };

    /* ── Draw image with cover-fit (no stretching/distortion) ── */
    const drawImageCover = (img, W, H) => {
      const imgRatio = img.naturalWidth / img.naturalHeight;
      const canRatio = W / H;
      let dx = 0, dy = 0, dw = W, dh = H;
      if (imgRatio > canRatio) {
        // Image wider than canvas — fit by height, crop sides
        dh = H;
        dw = H * imgRatio;
        dx = (W - dw) / 2;
      } else {
        // Image taller than canvas — fit by width, crop top/bottom
        dw = W;
        dh = W / imgRatio;
        dy = (H - dh) / 2;
      }
      ctx.drawImage(img, dx, dy, dw, dh);
    };

    const draw = () => {
      time += 0.004;
      const W = canvas.width;
      const H = canvas.height;

      ctx.clearRect(0, 0, W, H);

      // 1. Background image with cover-fit
      const img = bgImage;
      if (img?.complete && img.naturalWidth > 0) {
        drawImageCover(img, W, H);
      } else {
        // Fallback gradient
        const gradient = ctx.createLinearGradient(0, 0, W, H);
        gradient.addColorStop(0, '#0a0a0a');
        gradient.addColorStop(1, '#1a1a1a');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, W, H);
      }

      // 2. Dark overlay for text readability
      ctx.fillStyle = 'rgba(10, 10, 10, 0.6)';
      ctx.fillRect(0, 0, W, H);

      // 3. Stars
      drawStars(W, H);

      // 4. Vignette
      const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, W * 0.8);
      v.addColorStop(0, 'transparent');
      v.addColorStop(1, 'rgba(0, 0, 0, 0.5)');
      ctx.fillStyle = v;
      ctx.fillRect(0, 0, W, H);

      raf = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: 0,
        pointerEvents: 'none',
      }}
    />
  );
};

export default CosmicBackground;