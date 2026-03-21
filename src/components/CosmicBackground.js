import React, { useEffect, useRef } from 'react';

const CosmicBackground = () => {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let raf;
    let time = 0;
    let bgImage = new Image();
    bgImage.src = '/assets/my-bg.jpg'; // Your image path
    let imageLoaded = false;

    bgImage.onload = () => {
      imageLoaded = true;
    };

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    // Stars configuration (optional - can remove if you want only image)
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

    const draw = () => {
      time += 0.004;
      const W = canvas.width;
      const H = canvas.height;

      ctx.clearRect(0, 0, W, H);

      // Draw background image if loaded
      if (imageLoaded && bgImage.complete) {
        ctx.drawImage(bgImage, 0, 0, W, H);
      } else {
        // Fallback gradient if image not loaded
        const gradient = ctx.createLinearGradient(0, 0, W, H);
        gradient.addColorStop(0, '#0a0a0a');
        gradient.addColorStop(1, '#1a1a1a');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, W, H);
      }

      // Optional: Add dark overlay for better text readability
      ctx.fillStyle = 'rgba(10, 10, 10, 0.6)';
      ctx.fillRect(0, 0, W, H);

      // Optional: Keep stars effect (comment out if you don't want stars)
      drawStars(W, H);

      // Optional: Vignette effect
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