import React, { useEffect, useRef, useState } from 'react';

/* ── Module-level preload — starts loading immediately on import ── */
const BG_IMAGE_SRC = '/assets/operatorbg.jpeg';

let preloadedImage = null;
let preloadStarted = false;

function ensurePreload() {
  if (preloadStarted) return;
  preloadStarted = true;
  preloadedImage = new Image();
  preloadedImage.src = BG_IMAGE_SRC;
}
ensurePreload();

const OperatorGalaxyBG = () => {
  const canvasRef = useRef(null);
  const [imageReady, setImageReady] = useState(() => {
    return preloadedImage?.complete && preloadedImage.naturalWidth > 0;
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let raf;
    let time = 0;
    let running = true;

    /* ── Resolve image ── */
    let bgImage = preloadedImage;
    const onImageReady = () => setImageReady(true);

    if (bgImage) {
      if (bgImage.complete && bgImage.naturalWidth > 0) {
        // already ready
      } else {
        bgImage.addEventListener('load', onImageReady, { once: true });
      }
    } else {
      bgImage = new Image();
      bgImage.src = BG_IMAGE_SRC;
      preloadedImage = bgImage;
      bgImage.addEventListener('load', onImageReady, { once: true });
    }

    /* ── Resize ── */
    const resize = () => {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    /* ── Seeded random ── */
    let seed = 42;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) & 0xffffffff;
      return (seed >>> 0) / 0xffffffff;
    };

    /* ══════════════════════════════════════════
       STARS
    ══════════════════════════════════════════ */
    const stars = [];

    // Cool blue-white
    for (let i = 0; i < 280; i++) {
      stars.push({
        x: rand(), y: rand(),
        r: rand() * 0.6 + 0.1,
        rgb: `${198 + rand()*22|0},${218 + rand()*22|0},${240 + rand()*15|0}`,
        alpha: rand() * 0.30 + 0.08,
        speed: rand() * 0.001 + 0.00025,
        phase: rand() * Math.PI * 2,
      });
    }

    // Warm gold
    for (let i = 0; i < 120; i++) {
      const t = rand();
      const spread = (rand() - 0.5) * 0.30;
      stars.push({
        x: t + spread * 0.35,
        y: 1 - t + spread,
        r: rand() * 0.9 + 0.3,
        rgb: `${228 + rand()*22|0},${160 + rand()*32|0},${70 + rand()*32|0}`,
        alpha: rand() * 0.44 + 0.24,
        speed: rand() * 0.0015 + 0.0004,
        phase: rand() * Math.PI * 2,
      });
    }

    // Sparkle stars
    for (let i = 0; i < 20; i++) {
      stars.push({
        x: rand(), y: rand(),
        r: rand() * 1.4 + 1.0,
        rgb: `${242 + rand()*13|0},${240 + rand()*15|0},${228 + rand()*27|0}`,
        alpha: rand() * 0.20 + 0.70,
        speed: rand() * 0.0007 + 0.00015,
        phase: rand() * Math.PI * 2,
        sparkle: true,
      });
    }

    /* ══════════════════════════════════════════
       DUST
    ══════════════════════════════════════════ */
    const dust = [];
    for (let i = 0; i < 400; i++) {
      const t = rand();
      const spread = (rand() - 0.5) * 0.24;
      const armX = t + spread * 0.45;
      const armY = 1 - t + spread;
      const inCluster = rand() < 0.25;
      dust.push({
        x: inCluster ? rand() * 0.22 : armX,
        y: inCluster ? 0.78 + rand() * 0.22 : armY,
        r: rand() * 0.45 + 0.05,
        alpha: rand() * 0.38 + 0.06,
        speed: rand() * 0.00085 + 0.00015,
        phase: rand() * Math.PI * 2,
      });
    }

    /* ══════════════════════════════════════════
       DRAW FUNCTIONS
    ══════════════════════════════════════════ */

    /* Cover-fit the background image */
    const drawImageCover = (img, W, H) => {
      const imgRatio = img.naturalWidth / img.naturalHeight;
      const canRatio = W / H;
      let dx = 0, dy = 0, dw = W, dh = H;
      if (imgRatio > canRatio) {
        dh = H;
        dw = H * imgRatio;
        dx = (W - dw) / 2;
      } else {
        dw = W;
        dh = W / imgRatio;
        dy = (H - dh) / 2;
      }
      ctx.drawImage(img, dx, dy, dw, dh);
    };

    /* Central orbit glow */
    const drawCenterGlow = (W, H, t) => {
      const cx = W * 0.5;
      const cy = H * 0.56;
      const pulse = Math.sin(t * 0.5) * 0.012 + 0.058;
      const pulse2 = Math.sin(t * 0.35 + 1) * 0.008 + 0.035;

      const g1 = ctx.createRadialGradient(cx, cy, 0, cx, cy, W * 0.18);
      g1.addColorStop(0,   `rgba(250, 218, 135, ${pulse * 1.3})`);
      g1.addColorStop(0.07,`rgba(235, 188, 85, ${pulse})`);
      g1.addColorStop(0.25,`rgba(205, 148, 48, ${pulse * 0.4})`);
      g1.addColorStop(1,   'transparent');
      ctx.fillStyle = g1;
      ctx.beginPath();
      ctx.arc(cx, cy, W * 0.18, 0, Math.PI * 2);
      ctx.fill();

      const g2 = ctx.createRadialGradient(cx, cy, 0, cx, cy, W * 0.03);
      g2.addColorStop(0,   `rgba(255, 248, 220, ${pulse2 * 2.5})`);
      g2.addColorStop(0.3, `rgba(250, 215, 115, ${pulse2 * 1.2})`);
      g2.addColorStop(1,   'transparent');
      ctx.fillStyle = g2;
      ctx.beginPath();
      ctx.arc(cx, cy, W * 0.03, 0, Math.PI * 2);
      ctx.fill();
    };

    /* Dust particles */
    const drawDust = (W, H) => {
      dust.forEach(d => {
        d.phase += d.speed;
        const tw = Math.sin(d.phase) * 0.25 + 0.75;
        const x = ((d.x % 1) + 1) % 1 * W;
        const y = ((d.y % 1) + 1) % 1 * H;
        ctx.beginPath();
        ctx.arc(x, y, d.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(225, 168, 75, ${d.alpha * tw})`;
        ctx.fill();
      });
    };

    /* Stars */
    const drawStars = (W, H) => {
      stars.forEach(s => {
        s.phase += s.speed;
        const tw = Math.sin(s.phase) * 0.15 + 0.85;
        const alpha = s.alpha * tw;
        const x = s.x * W;
        const y = s.y * H;

        if (s.r > 0.8 || s.sparkle) {
          const haloR = s.r * (s.sparkle ? 4 : 2.8);
          const sg = ctx.createRadialGradient(x, y, 0, x, y, haloR);
          sg.addColorStop(0,   `rgba(${s.rgb},${alpha * 0.48})`);
          sg.addColorStop(1,   'transparent');
          ctx.fillStyle = sg;
          ctx.beginPath();
          ctx.arc(x, y, haloR, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.beginPath();
        ctx.arc(x, y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${s.rgb},${alpha})`;
        ctx.fill();

        if (s.sparkle && alpha > 0.45) {
          const spikeLen = s.r * 5;
          ctx.strokeStyle = `rgba(${s.rgb},${alpha * 0.30})`;
          ctx.lineWidth = 0.5;
          ctx.beginPath();
          ctx.moveTo(x - spikeLen, y);
          ctx.lineTo(x + spikeLen, y);
          ctx.moveTo(x, y - spikeLen);
          ctx.lineTo(x, y + spikeLen);
          ctx.stroke();
        }
      });
    };

    /* Vignette */
    const drawVignette = (W, H) => {
      const v = ctx.createRadialGradient(W/2, H/2, H * 0.28, W/2, H/2, W * 0.80);
      v.addColorStop(0,   'transparent');
      v.addColorStop(0.55,'rgba(3, 5, 12, 0.08)');
      v.addColorStop(0.80,'rgba(3, 4, 10, 0.35)');
      v.addColorStop(1,   'rgba(2, 3, 8,  0.62)');
      ctx.fillStyle = v;
      ctx.fillRect(0, 0, W, H);

      // Bottom
      const btm = ctx.createLinearGradient(0, H * 0.70, 0, H);
      btm.addColorStop(0, 'transparent');
      btm.addColorStop(1, 'rgba(3, 4, 10, 0.45)');
      ctx.fillStyle = btm;
      ctx.fillRect(0, 0, W, H);

      // Top
      const top = ctx.createLinearGradient(0, 0, 0, H * 0.14);
      top.addColorStop(0, 'rgba(4, 5, 12, 0.38)');
      top.addColorStop(1, 'transparent');
      ctx.fillStyle = top;
      ctx.fillRect(0, 0, W, H);
    };

    /* ══════════════════════════════════════════
       MAIN LOOP
    ══════════════════════════════════════════ */
    const draw = () => {
      if (!running) return;
      time += 0.004;
      const W = canvas.width;
      const H = canvas.height;

      ctx.clearRect(0, 0, W, H);

      // 1. Background image (cover-fit)
      const img = bgImage;
      if (img?.complete && img.naturalWidth > 0) {
        drawImageCover(img, W, H);
      } else {
        // Fallback gradient
        const grad = ctx.createLinearGradient(0, 0, W * 0.4, H);
        grad.addColorStop(0,   '#060a15');
        grad.addColorStop(0.5, '#080d1a');
        grad.addColorStop(1,   '#03070d');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);
      }

      // 2. Subtle dark overlay to blend image with UI
      ctx.fillStyle = 'rgba(4, 5, 14, 0.22)';
      ctx.fillRect(0, 0, W, H);

      // 3. Center glow
      drawCenterGlow(W, H, time);

      // 4. Dust
      drawDust(W, H, time);

      // 5. Stars
      drawStars(W, H);

      // 6. Vignette
      drawVignette(W, H);

      raf = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      running = false;
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
        imageRendering: 'auto',
      }}
    />
  );
};

export default OperatorGalaxyBG;