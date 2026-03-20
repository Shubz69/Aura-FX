import React, { useEffect, useRef, useState, useCallback } from 'react';

const CosmicBackground = () => {
  const canvasRef = useRef(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const bgImageRef = useRef(null);
  const dimensionsRef = useRef({ width: 0, height: 0 });

  // Intelligent image scaling to maintain aspect ratio and prevent collapse
  const getImageDimensions = useCallback((imgWidth, imgHeight, canvasWidth, canvasHeight) => {
    // Calculate the scaling factor to cover the entire canvas while maintaining aspect ratio
    const canvasRatio = canvasWidth / canvasHeight;
    const imageRatio = imgWidth / imgHeight;

    let drawWidth, drawHeight, offsetX, offsetY;

    if (imageRatio > canvasRatio) {
      // Image is wider than canvas - match height, crop width
      drawHeight = canvasHeight;
      drawWidth = imgWidth * (canvasHeight / imgHeight);
      offsetX = (canvasWidth - drawWidth) / 2;
      offsetY = 0;
    } else {
      // Image is taller than canvas - match width, crop height
      drawWidth = canvasWidth;
      drawHeight = imgHeight * (canvasWidth / imgWidth);
      offsetX = 0;
      offsetY = (canvasHeight - drawHeight) / 2;
    }

    return { drawWidth, drawHeight, offsetX, offsetY };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false }); // Optimize performance
    let raf;
    let time = 0;
    let resizeTimeout;

    // Pre-load and cache the background image with responsive handling
    const bg = new Image();
    bg.crossOrigin = 'anonymous';
    bg.src = '/assets/my-bg.jpg';
    
    // Store in ref for access in animation loop
    bgImageRef.current = bg;

    // Handle image load success
    bg.onload = () => {
      setImageLoaded(true);
      dimensionsRef.current = {
        width: bg.naturalWidth,
        height: bg.naturalHeight
      };
      // Force immediate redraw
      if (canvas && ctx) {
        resize();
      }
    };

    // Handle image load error
    bg.onerror = () => {
      console.warn('Background image failed to load, using fallback');
      setImageLoaded(true);
    };

    // Debounced resize for performance
    const handleResize = () => {
      if (resizeTimeout) {
        cancelAnimationFrame(resizeTimeout);
      }
      
      resizeTimeout = requestAnimationFrame(() => {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        
        // Redraw immediately on resize
        if (bgImageRef.current?.complete) {
          // Let the next animation frame handle the draw
        }
      });
    };

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    
    resize();
    window.addEventListener('resize', handleResize);

    // ── Stars configuration (optimized) ──
    const stars = Array.from({ length: 170 }, () => {
      const roll = Math.random();
      let rgb, size, baseAlpha;
      if (roll < 0.80) {
        rgb = [195, 210, 228]; 
        size = Math.random() * 0.8 + 0.2;
        baseAlpha = Math.random() * 0.55 + 0.35;
      } else if (roll < 0.95) {
        rgb = [220, 156, 85];  
        size = Math.random() * 1.0 + 0.5;
        baseAlpha = Math.random() * 0.4 + 0.55;
      } else {
        rgb = [250, 175, 94];  
        size = Math.random() * 1.4 + 1.2;
        baseAlpha = Math.random() * 0.15 + 0.85;
      }
      return {
        x: Math.random(),
        y: Math.random() * 0.82,
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
        const alpha = +(s.baseAlpha * tw).toFixed(3);
        ctx.beginPath();
        ctx.arc(s.x * W, s.y * H, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${s.rgb[0]},${s.rgb[1]},${s.rgb[2]},${alpha})`;
        ctx.fill();
      });
    };

    // ── Navy Mesh (unchanged) ──
    const BLOBS = [
      { cx:0.14, cy:0.18, rr:0.50, rgb:[38,51,80],  a:0.18, ph:0.0 },
      { cx:0.82, cy:0.09, rr:0.44, rgb:[13,19,31],  a:0.22, ph:1.1 },
      { cx:0.50, cy:0.54, rr:0.55, rgb:[6,10,19],   a:0.18, ph:2.2 },
      { cx:0.08, cy:0.76, rr:0.40, rgb:[38,51,80],  a:0.14, ph:3.3 },
      { cx:0.88, cy:0.66, rr:0.38, rgb:[13,19,31],  a:0.18, ph:4.4 },
    ];

    const drawNavyMesh = (W, H, t) => {
      BLOBS.forEach(({ cx, cy, rr, rgb, a, ph }) => {
        const ox = Math.sin(t * 0.18 + ph) * 0.034 * W;
        const oy = Math.cos(t * 0.14 + ph) * 0.027 * H;
        const x  = cx * W + ox;
        const y  = cy * H + oy;
        const R  = rr * Math.max(W, H);
        const g  = ctx.createRadialGradient(x, y, 0, x, y, R);
        g.addColorStop(0,   `rgba(${rgb},${a})`);
        g.addColorStop(0.6, `rgba(${rgb},${+(a*0.20).toFixed(3)})`);
        g.addColorStop(1,   'transparent');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      });
    };

    // ── Gold Haze ──
    const drawGoldHaze = (W, H, t) => {
      const sx = Math.sin(t * 0.22) * 0.06;
      const sy = Math.cos(t * 0.17) * 0.04;
      const g1 = ctx.createRadialGradient(
        (0.74+sx)*W, (0.16+sy)*H, 0,
         0.74*W,      0.16*H,      0.42*W
      );
      g1.addColorStop(0,   'rgba(220,156,85,0.07)');
      g1.addColorStop(0.5, 'rgba(220,156,85,0.02)');
      g1.addColorStop(1,   'transparent');
      ctx.fillStyle = g1;
      ctx.fillRect(0, 0, W, H);
    };

    // ── Blue Edge Suppressor (adjusted for responsive) ──
    const drawAtmosphereMask = (W, H) => {
      const rimTop = H * (window.innerWidth < 768 ? 0.52 : 0.54); // Adjust for mobile
      const rimBottom = H * (window.innerWidth < 768 ? 0.74 : 0.72);
      
      const band = ctx.createLinearGradient(0, rimTop, 0, rimBottom);
      band.addColorStop(0,    'rgba(2,5,14,0.00)');
      band.addColorStop(0.28, 'rgba(2,5,14,0.30)');
      band.addColorStop(0.52, 'rgba(2,5,14,0.18)');
      band.addColorStop(1,    'rgba(2,5,14,0.00)');
      ctx.fillStyle = band;
      ctx.fillRect(0, 0, W, H);

      const rightRim = ctx.createRadialGradient(
        W * 0.94, H * 0.60, 0,
        W * 0.94, H * 0.60, W * 0.22
      );
      rightRim.addColorStop(0,   'rgba(2,5,14,0.38)');
      rightRim.addColorStop(0.5, 'rgba(2,5,14,0.12)');
      rightRim.addColorStop(1,   'transparent');
      ctx.fillStyle = rightRim;
      ctx.fillRect(0, 0, W, H);
    };

    // ── City Light Bloom (responsive adjustments) ──
    const CITY_LIGHTS = [
      { cx:0.07, cy:0.87, coreR:0.022, haloR:0.095, coreA:0.72, haloA:0.22, ph:0.0,  amp:0.06 },
      { cx:0.14, cy:0.84, coreR:0.018, haloR:0.080, coreA:0.65, haloA:0.20, ph:1.2,  amp:0.04 },
      { cx:0.22, cy:0.88, coreR:0.020, haloR:0.085, coreA:0.70, haloA:0.22, ph:2.1,  amp:0.05 },
      { cx:0.30, cy:0.86, coreR:0.016, haloR:0.072, coreA:0.60, haloA:0.18, ph:0.8,  amp:0.04 },
      { cx:0.38, cy:0.90, coreR:0.013, haloR:0.060, coreA:0.55, haloA:0.16, ph:3.4,  amp:0.03 },
      { cx:0.52, cy:0.91, coreR:0.015, haloR:0.068, coreA:0.60, haloA:0.17, ph:1.9,  amp:0.04 },
      { cx:0.62, cy:0.92, coreR:0.012, haloR:0.055, coreA:0.52, haloA:0.15, ph:2.7,  amp:0.03 },
      { cx:0.72, cy:0.90, coreR:0.010, haloR:0.050, coreA:0.50, haloA:0.14, ph:0.5,  amp:0.03 },
      { cx:0.80, cy:0.88, coreR:0.014, haloR:0.062, coreA:0.56, haloA:0.16, ph:4.1,  amp:0.04 },
    ];

    const drawCityLights = (W, H, t) => {
      const maxDim = Math.max(W, H);
      const isMobile = window.innerWidth < 768;
      
      // Adjust intensity for mobile
      const intensityFactor = isMobile ? 0.85 : 1;

      CITY_LIGHTS.forEach(({ cx, cy, coreR, haloR, coreA, haloA, ph, amp }) => {
        const pulse = 1 + Math.sin(t * 0.9 + ph) * amp * intensityFactor;
        const x = cx * W;
        const y = cy * H;

        const hR = haloR * maxDim * pulse * (isMobile ? 0.9 : 1);
        const halo = ctx.createRadialGradient(x, y, 0, x, y, hR);
        halo.addColorStop(0,    `rgba(255,160,40,${+(haloA * 0.9 * pulse * intensityFactor).toFixed(3)})`);
        halo.addColorStop(0.25, `rgba(230,120,20,${+(haloA * 0.55 * intensityFactor).toFixed(3)})`);
        halo.addColorStop(0.55, `rgba(180,80,10,${+(haloA * 0.18 * intensityFactor).toFixed(3)})`);
        halo.addColorStop(0.78, `rgba(120,50,5,${+(haloA * 0.06 * intensityFactor).toFixed(3)})`);
        halo.addColorStop(1,    'transparent');
        ctx.fillStyle = halo;
        ctx.fillRect(0, 0, W, H);

        const cR = coreR * maxDim * pulse * (isMobile ? 0.9 : 1);
        const core = ctx.createRadialGradient(x, y, 0, x, y, cR);
        core.addColorStop(0,    `rgba(255,240,180,${+(coreA * pulse * intensityFactor).toFixed(3)})`);
        core.addColorStop(0.30, `rgba(255,185,70,${+(coreA * 0.80 * intensityFactor).toFixed(3)})`);
        core.addColorStop(0.65, `rgba(220,120,30,${+(coreA * 0.40 * intensityFactor).toFixed(3)})`);
        core.addColorStop(1,    'transparent');
        ctx.fillStyle = core;
        ctx.fillRect(0, 0, W, H);
      });

      const terrainBleed = ctx.createLinearGradient(0, H * 0.76, 0, H);
      terrainBleed.addColorStop(0,    'transparent');
      terrainBleed.addColorStop(0.35, `rgba(160,80,10,${window.innerWidth < 768 ? 0.04 : 0.06})`);
      terrainBleed.addColorStop(0.65, `rgba(180,90,12,${window.innerWidth < 768 ? 0.07 : 0.10})`);
      terrainBleed.addColorStop(1,    `rgba(120,55,5,${window.innerWidth < 768 ? 0.02 : 0.04})`);
      ctx.fillStyle = terrainBleed;
      ctx.fillRect(0, 0, W, H);
    };

    // ── Vignette (responsive) ──
    const drawVignette = (W, H) => {
      const isMobile = window.innerWidth < 768;
      const vignetteStrength = isMobile ? 0.7 : 0.78;
      
      const v = ctx.createRadialGradient(W*0.5, H*0.46, H*0.18, W*0.5, H*0.50, W*0.80);
      v.addColorStop(0,    'transparent');
      v.addColorStop(0.70, `rgba(4,7,13,${isMobile ? 0.03 : 0.05})`);
      v.addColorStop(0.85, `rgba(4,7,13,${isMobile ? 0.28 : 0.38})`);
      v.addColorStop(1,    `rgba(4,7,13,${vignetteStrength})`);
      ctx.fillStyle = v;
      ctx.fillRect(0, 0, W, H);
      
      const btm = ctx.createLinearGradient(0, H*0.78, 0, H);
      btm.addColorStop(0, 'transparent');
      btm.addColorStop(1, `rgba(4,6,13,${isMobile ? 0.35 : 0.50})`);
      ctx.fillStyle = btm;
      ctx.fillRect(0, 0, W, H);
    };

    // ── Responsive fallback background ──
    const drawFallbackBackground = (W, H) => {
      const isMobile = window.innerWidth < 768;
      
      // Create a deep space gradient that adapts to screen size
      const gradient = ctx.createLinearGradient(0, 0, 0, H);
      if (isMobile) {
        gradient.addColorStop(0, '#0c121f');
        gradient.addColorStop(0.5, '#070b14');
        gradient.addColorStop(1, '#030508');
      } else {
        gradient.addColorStop(0, '#0a0f1a');
        gradient.addColorStop(0.5, '#050810');
        gradient.addColorStop(1, '#020304');
      }
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, W, H);
      
      // Add responsive noise texture
      const noiseCount = isMobile ? 30 : 50;
      ctx.fillStyle = 'rgba(255,255,255,0.02)';
      for (let i = 0; i < noiseCount; i++) {
        ctx.fillRect(
          Math.random() * W,
          Math.random() * H,
          isMobile ? 1.5 : 2,
          isMobile ? 1.5 : 2
        );
      }
    };

    // ── Main draw loop with responsive image handling ──
    const draw = () => {
      time += 0.004;
      const W = canvas.width;
      const H = canvas.height;

      // Clear canvas with optimization
      ctx.clearRect(0, 0, W, H);

      // Draw background (image or fallback) with proper scaling
      if (bgImageRef.current?.complete && bgImageRef.current?.naturalWidth > 0) {
        const img = bgImageRef.current;
        const { drawWidth, drawHeight, offsetX, offsetY } = getImageDimensions(
          img.naturalWidth,
          img.naturalHeight,
          W,
          H
        );
        
        // Draw image with proper scaling to cover the canvas
        ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
      } else {
        drawFallbackBackground(W, H);
      }

      // Draw all effects on top
      drawNavyMesh(W, H, time);
      drawGoldHaze(W, H, time);
      drawAtmosphereMask(W, H);
      drawCityLights(W, H, time);
      drawStars(W, H);
      drawVignette(W, H);

      raf = requestAnimationFrame(draw);
    };

    // Start animation
    draw();

    return () => {
      window.removeEventListener('resize', handleResize);
      if (resizeTimeout) {
        cancelAnimationFrame(resizeTimeout);
      }
      cancelAnimationFrame(raf);
      bgImageRef.current = null;
    };
  }, [getImageDimensions]);

  return (
    <canvas
      ref={canvasRef}
      className="cosmic-background-canvas"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: 0,
        pointerEvents: 'none',
        display: 'block',
        objectFit: 'cover', // Ensures canvas covers area properly
        willChange: 'transform', // Performance optimization
      }}
    />
  );
};

export default CosmicBackground;