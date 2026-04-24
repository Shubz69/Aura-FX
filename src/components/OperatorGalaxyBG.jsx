import React, { useEffect, useRef } from 'react';

const OperatorGalaxyBG = () => {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let raf;

    const bgImage = new Image();
    bgImage.src = '/assets/cosmic-nebula-space-background.jpg'; // put image in public/assets/
    let imageLoaded = false;
    bgImage.onload = () => { imageLoaded = true; };

    const resize = () => {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    /* ── Bright star-points matching the image's star colors ── */
    const stars = Array.from({ length: 180 }, () => {
      const roll = Math.random();
      let rgb, size, baseAlpha;
      if (roll < 0.65) {
        // cool blue-white stars matching image
        rgb = [195, 215, 240];
        size = Math.random() * 0.9 + 0.2;
        baseAlpha = Math.random() * 0.4 + 0.2;
      } else if (roll < 0.88) {
        // warm gold stars matching nebula glow
        rgb = [220, 156, 85];
        size = Math.random() * 1.1 + 0.5;
        baseAlpha = Math.random() * 0.35 + 0.45;
      } else {
        // bright highlight stars
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

    /* ── Lens-flare spikes for the bright star (top-left of image) ── */
    const drawLensFlare = (W, H) => {
      // The bright star in the image sits roughly top-left area
      const fx = W * 0.18;
      const fy = H * 0.14;

      // Core bloom
      const bloom = ctx.createRadialGradient(fx, fy, 0, fx, fy, W * 0.12);
      bloom.addColorStop(0,   'rgba(200, 230, 255, 0.18)');
      bloom.addColorStop(0.3, 'rgba(150, 200, 255, 0.08)');
      bloom.addColorStop(1,   'transparent');
      ctx.fillStyle = bloom;
      ctx.beginPath();
      ctx.arc(fx, fy, W * 0.12, 0, Math.PI * 2);
      ctx.fill();

      // Cross spike lines
      const spikeLen = W * 0.09;
      const spikeAlpha = 0.12;
      const angles = [0, Math.PI/2, Math.PI/4, -Math.PI/4];
      angles.forEach(angle => {
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

    /* ── Nebula dust overlay — warm gold + cool blue matching image ── */
    const drawNebulaOverlay = (W, H, t) => {
      // Warm nebula band — diagonal like in image (top-left to bottom-right)
   const nb1 = ctx.createLinearGradient(0, H * 0.1, W, H * 0.75);
nb1.addColorStop(0,    'transparent');
nb1.addColorStop(0.25, 'rgba(180, 110, 40, 0.02)');
nb1.addColorStop(0.5,  'rgba(200, 130, 50, 0.03)');
nb1.addColorStop(0.75, 'rgba(160, 90, 30, 0.02)');
nb1.addColorStop(1,    'transparent');
      ctx.fillStyle = nb1;
      ctx.fillRect(0, 0, W, H);

      // Gold orbit-center glow (aligned with orbit system)
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

      // Subtle breathing pulse on glow
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

        // Tiny glow for brighter stars
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
      if (imageLoaded && bgImage.complete) {
        // Cover-fit the image
        const imgRatio = bgImage.naturalWidth / bgImage.naturalHeight;
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
        ctx.drawImage(bgImage, dx, dy, dw, dh);
      } else {
        // Fallback deep space gradient
        const grad = ctx.createLinearGradient(0, 0, W * 0.3, H);
        grad.addColorStop(0,   '#05060f');
        grad.addColorStop(0.4, '#080a18');
        grad.addColorStop(1,   '#030308');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);
      }

      // 2. Dark overlay — preserves image but darkens for UI legibility
    ctx.fillStyle = 'rgba(4, 3, 12, 0.28)';
ctx.fillRect(0, 0, W, H);

      // 3. Nebula overlays + orbit glow
      drawNebulaOverlay(W, H, time);

      // 4. Lens flare on bright star
      drawLensFlare(W, H);

      // 5. Twinkling stars on top
      drawStars(W, H, time);

const vig = ctx.createRadialGradient(W/2, H/2, H * 0.18, W/2, H/2, W * 0.82);
vig.addColorStop(0,   'transparent');
vig.addColorStop(0.6, 'rgba(3,2,10,0.08)');
vig.addColorStop(1,   'rgba(2,1,8,0.52)');
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, W, H);

      // 7. Bottom fade to pure dark (so orbit system floats cleanly)
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
      imageRendering: 'high-quality',
      filter: 'contrast(1.08) saturate(1.15) brightness(1.05)',
    }}
  />
);
};

export default OperatorGalaxyBG;