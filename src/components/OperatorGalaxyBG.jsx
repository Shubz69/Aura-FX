import React, { useEffect, useRef, useState } from 'react';

/* ── Preload image at module level — starts loading immediately on import ── */
const BG_IMAGE_SRC = '/assets/cosmic-nebula-space-background.jpg';
let preloadedImage = null;
let preloadStarted = false;

function ensurePreload() {
  if (preloadStarted) return;
  preloadStarted = true;
  preloadedImage = new Image();
  preloadedImage.src = BG_IMAGE_SRC;
}

// Start preloading as soon as this module is imported (lazy-loaded with the page)
ensurePreload();

const OperatorGalaxyBG = () => {
  const canvasRef = useRef(null);
  const [imageReady, setImageReady] = useState(() => {
    // If the image was already cached/preloaded before mount, use it immediately
    return preloadedImage?.complete && preloadedImage.naturalWidth > 0;
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let raf;

    /* ── Resolve the final image to draw ── */
    let bgImage = preloadedImage;

    const onImageReady = () => {
      setImageReady(true);
    };

    // If preload already complete, mark ready
    if (bgImage?.complete && bgImage.naturalWidth > 0) {
      // already ready
    } else if (bgImage) {
      // Still loading — wait for it
      bgImage.addEventListener('load', onImageReady, { once: true });
      bgImage.addEventListener('error', () => {
        // Fallback: image failed, we'll use gradient forever
        setImageReady(false);
      }, { once: true });
    } else {
      // Edge case: start loading now
      bgImage = new Image();
      bgImage.src = BG_IMAGE_SRC;
      preloadedImage = bgImage;
      bgImage.addEventListener('load', onImageReady, { once: true });
      bgImage.addEventListener('error', () => setImageReady(false), { once: true });
    }

    const resize = () => {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    /* ── Stars ── */
    const stars = Array.from({ length: 180 }, () => {
      const roll = Math.random();
      let rgb, size, baseAlpha;
      if (roll < 0.65) {
        rgb = [195, 215, 240];
        size = Math.random() * 0.9 + 0.2;
        baseAlpha = Math.random() * 0.4 + 0.2;
      } else if (roll < 0.88) {
        rgb = [220, 156, 85];
        size = Math.random() * 1.1 + 0.5;
        baseAlpha = Math.random() * 0.35 + 0.45;
      } else {
        rgb = [255, 240, 200];
        size = Math.random() * 1.6 + 1.2;
        baseAlpha = Math.random() * 0.2 + 0.75;
      }
      return {
        x: Math.random(),
        y: Math.random(),
        r: size,
        rgb,
        baseAlpha,
        speed: Math.random() * 0.0015 + 0.0004,
        phase: Math.random() * Math.PI * 2,
      };
    });

    /* ── Lens flare ── */
    const drawLensFlare = (W, H) => {
      const fx = W * 0.18;
      const fy = H * 0.14;

      const bloom = ctx.createRadialGradient(fx, fy, 0, fx, fy, W * 0.12);
      bloom.addColorStop(0,   'rgba(200, 230, 255, 0.18)');
      bloom.addColorStop(0.3, 'rgba(150, 200, 255, 0.08)');
      bloom.addColorStop(1,   'transparent');
      ctx.fillStyle = bloom;
      ctx.beginPath();
      ctx.arc(fx, fy, W * 0.12, 0, Math.PI * 2);
      ctx.fill();

      const spikeLen = W * 0.09;
      const spikeAlpha = 0.12;
      [0, Math.PI/2, Math.PI/4, -Math.PI/4].forEach(angle => {
        const grad = ctx.createLinearGradient(
          fx - Math.cos(angle) * spikeLen, fy - Math.sin(angle) * spikeLen,
          fx + Math.cos(angle) * spikeLen, fy + Math.sin(angle) * spikeLen
        );
        grad.addColorStop(0,   'transparent');
        grad.addColorStop(0.5, `rgba(200,230,255,${spikeAlpha})`);
        grad.addColorStop(1,   'transparent');
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(fx - Math.cos(angle) * spikeLen, fy - Math.sin(angle) * spikeLen);
        ctx.lineTo(fx + Math.cos(angle) * spikeLen, fy + Math.sin(angle) * spikeLen);
        ctx.stroke();
      });
    };

    /* ── Nebula overlay ── */
    const drawNebulaOverlay = (W, H, t) => {
      const nb1 = ctx.createLinearGradient(0, H * 0.1, W, H * 0.75);
      nb1.addColorStop(0,    'transparent');
      nb1.addColorStop(0.25, 'rgba(180, 110, 40, 0.02)');
      nb1.addColorStop(0.5,  'rgba(200, 130, 50, 0.03)');
      nb1.addColorStop(0.75, 'rgba(160, 90, 30, 0.02)');
      nb1.addColorStop(1,    'transparent');
      ctx.fillStyle = nb1;
      ctx.fillRect(0, 0, W, H);

      const glowY = H / 2 + 60;
      const ng = ctx.createRadialGradient(W/2, glowY, 0, W/2, glowY, 280);
      ng.addColorStop(0,   'rgba(234,169,96,0.14)');
      ng.addColorStop(0.35,'rgba(200,130,50,0.07)');
      ng.addColorStop(0.7, 'rgba(120,70,20,0.03)');
      ng.addColorStop(1,   'transparent');
      ctx.fillStyle = ng;
      ctx.beginPath();
      ctx.arc(W/2, glowY, 280, 0, Math.PI * 2);
      ctx.fill();

      const pulse = Math.sin(t * 0.4) * 0.03 + 0.06;
      const ng2 = ctx.createRadialGradient(W/2, glowY, 0, W/2, glowY, 160);
      ng2.addColorStop(0,   `rgba(234,169,96,${pulse})`);
      ng2.addColorStop(1,   'transparent');
      ctx.fillStyle = ng2;
      ctx.beginPath();
      ctx.arc(W/2, glowY, 160, 0, Math.PI * 2);
      ctx.fill();
    };

    /* ── Twinkling stars ── */
    const drawStars = (W, H, t) => {
      stars.forEach(s => {
        s.phase += s.speed;
        const tw = Math.sin(s.phase) * 0.2 + 0.8;
        const alpha = s.baseAlpha * tw;
        const x = s.x * W;
        const y = s.y * H;

        if (s.r > 1.2) {
          const sg = ctx.createRadialGradient(x, y, 0, x, y, s.r * 3.5);
          sg.addColorStop(0,   `rgba(${s.rgb},${alpha * 0.6})`);
          sg.addColorStop(1,   'transparent');
          ctx.fillStyle = sg;
          ctx.beginPath();
          ctx.arc(x, y, s.r * 3.5, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.beginPath();
        ctx.arc(x, y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${s.rgb},${alpha})`;
        ctx.fill();
      });
    };

    /* ── Main draw loop ── */
    let time = 0;
    const draw = () => {
      time += 0.005;
      const W = canvas.width;
      const H = canvas.height;

      ctx.clearRect(0, 0, W, H);

      // 1. Base image
      const img = bgImage;
      if (img?.complete && img.naturalWidth > 0) {
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
      } else {
        // Deep space gradient fallback
        const grad = ctx.createLinearGradient(0, 0, W * 0.3, H);
        grad.addColorStop(0,   '#05060f');
        grad.addColorStop(0.4, '#080a18');
        grad.addColorStop(1,   '#030308');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);
      }

      // 2. Dark overlay
      ctx.fillStyle = 'rgba(4, 3, 12, 0.28)';
      ctx.fillRect(0, 0, W, H);

      // 3. Nebula
      drawNebulaOverlay(W, H, time);

      // 4. Lens flare
      drawLensFlare(W, H);

      // 5. Stars
      drawStars(W, H, time);

      // 6. Vignette
      const vig = ctx.createRadialGradient(W/2, H/2, H * 0.18, W/2, H/2, W * 0.82);
      vig.addColorStop(0,   'transparent');
      vig.addColorStop(0.6, 'rgba(3,2,10,0.08)');
      vig.addColorStop(1,   'rgba(2,1,8,0.52)');
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, W, H);

      // 7. Bottom fade
      const btm = ctx.createLinearGradient(0, H * 0.72, 0, H);
      btm.addColorStop(0,   'transparent');
      btm.addColorStop(1,   'rgba(3,2,10,0.35)');
      ctx.fillStyle = btm;
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
        imageRendering: 'auto',
        filter: 'contrast(1.08) saturate(1.15) brightness(1.05)',
      }}
    />
  );
};

export default OperatorGalaxyBG;