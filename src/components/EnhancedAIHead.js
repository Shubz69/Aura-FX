import React, { useEffect, useRef } from 'react';
import '../styles/EnhancedAIHead.css';

const EnhancedAIHead = () => {
    const canvasRef = useRef(null);
    const containerRef = useRef(null);
    
    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        let animationFrameId;
        let particles = [];
        let connections = [];
        let mouseX = 0;
        let mouseY = 0;
        let frameCount = 0;
        let lastTime = 0;
        let isHovering = false;
        
        // Function declarations first to avoid initialization errors
        function createParticles() {
            particles = [];
            connections = [];
            
            // Face dimensions
            const centerX = canvas.width / 2;
            const centerY = canvas.height / 2;
            const faceRadius = Math.min(canvas.width, canvas.height) * 0.3;
            
            // Create face outline
            const numParticles = 60;
            for (let i = 0; i < numParticles; i++) {
                const angle = (i / numParticles) * Math.PI * 2;
                const radiusVariation = Math.random() * 0.05 + 0.95;
                const x = centerX + Math.cos(angle) * faceRadius * radiusVariation;
                const y = centerY + Math.sin(angle) * faceRadius * radiusVariation;
                
                particles.push({
                    id: i,
                    x,
                    y,
                    originalX: x,
                    originalY: y,
                    vx: 0,
                    vy: 0,
                    size: Math.random() * 2 + 2,
                    color: `rgba(${40 + Math.random() * 20}, ${100 + Math.random() * 30}, ${230 + Math.random() * 25}, ${0.7 + Math.random() * 0.3})`,
                    speed: 0.2 + Math.random() * 0.3,
                    angle: Math.random() * Math.PI * 2,
                    friction: 0.95,
                    pulseSpeed: 0.01 + Math.random() * 0.02,
                    pulseValue: Math.random(),
                    distanceFromMouse: 0
                });
            }
            
            // Create eyes (two ellipses)
            const eyeOffsetX = faceRadius * 0.25;
            const eyeOffsetY = faceRadius * 0.1;
            const eyeWidth = faceRadius * 0.18;
            const eyeHeight = faceRadius * 0.08;
            
            // Left eye
            for (let i = 0; i < 15; i++) {
                const angle = (i / 15) * Math.PI * 2;
                const x = centerX - eyeOffsetX + Math.cos(angle) * eyeWidth;
                const y = centerY - eyeOffsetY + Math.sin(angle) * eyeHeight;
                
                particles.push({
                    id: particles.length,
                    x,
                    y,
                    originalX: x,
                    originalY: y,
                    vx: 0,
                    vy: 0,
                    size: Math.random() * 1.5 + 1.5,
                    color: `rgba(${100 + Math.random() * 20}, ${140 + Math.random() * 40}, ${240 + Math.random() * 15}, ${0.8 + Math.random() * 0.2})`,
                    speed: 0.1 + Math.random() * 0.2,
                    angle: Math.random() * Math.PI * 2,
                    friction: 0.95,
                    pulseSpeed: 0.02 + Math.random() * 0.03,
                    pulseValue: Math.random(),
                    distanceFromMouse: 0
                });
            }
            
            // Right eye
            for (let i = 0; i < 15; i++) {
                const angle = (i / 15) * Math.PI * 2;
                const x = centerX + eyeOffsetX + Math.cos(angle) * eyeWidth;
                const y = centerY - eyeOffsetY + Math.sin(angle) * eyeHeight;
                
                particles.push({
                    id: particles.length,
                    x,
                    y,
                    originalX: x,
                    originalY: y,
                    vx: 0,
                    vy: 0,
                    size: Math.random() * 1.5 + 1.5,
                    color: `rgba(${100 + Math.random() * 20}, ${140 + Math.random() * 40}, ${240 + Math.random() * 15}, ${0.8 + Math.random() * 0.2})`,
                    speed: 0.1 + Math.random() * 0.2,
                    angle: Math.random() * Math.PI * 2,
                    friction: 0.95,
                    pulseSpeed: 0.02 + Math.random() * 0.03,
                    pulseValue: Math.random(),
                    distanceFromMouse: 0
                });
            }
            
            // Create mouth (curved line, smiling)
            for (let i = 0; i < 20; i++) {
                const t = i / 19;
                const angle = Math.PI * t;
                const mouthCurve = Math.sin(angle) * 0.15;
                const x = centerX + Math.cos(angle) * faceRadius * 0.4;
                const y = centerY + faceRadius * 0.25 + Math.sin(angle) * faceRadius * 0.15 - mouthCurve * faceRadius;
                
                particles.push({
                    id: particles.length,
                    x,
                    y,
                    originalX: x,
                    originalY: y,
                    vx: 0,
                    vy: 0,
                    size: Math.random() * 1.8 + 1.5,
                    color: `rgba(${80 + Math.random() * 30}, ${120 + Math.random() * 30}, ${250 + Math.random() * 5}, ${0.75 + Math.random() * 0.25})`,
                    speed: 0.1 + Math.random() * 0.2,
                    angle: Math.random() * Math.PI * 2,
                    friction: 0.95,
                    pulseSpeed: 0.01 + Math.random() * 0.02,
                    pulseValue: Math.random(),
                    distanceFromMouse: 0
                });
            }
            
            // Add some particles inside the head for "brain activity"
            for (let i = 0; i < 60; i++) {
                const angle = Math.random() * Math.PI * 2;
                const distance = Math.random() * faceRadius * 0.8;
                const x = centerX + Math.cos(angle) * distance;
                const y = centerY + Math.sin(angle) * distance;
                
                // Avoid adding particles too close to the eyes or mouth
                const distToLeftEye = Math.sqrt(Math.pow(x - (centerX - eyeOffsetX), 2) + Math.pow(y - (centerY - eyeOffsetY), 2));
                const distToRightEye = Math.sqrt(Math.pow(x - (centerX + eyeOffsetX), 2) + Math.pow(y - (centerY - eyeOffsetY), 2));
                const isMouthArea = y > centerY && y < centerY + faceRadius * 0.4 && Math.abs(x - centerX) < faceRadius * 0.4;
                
                if (distToLeftEye > eyeWidth * 1.5 && distToRightEye > eyeWidth * 1.5 && !isMouthArea) {
                    particles.push({
                        id: particles.length,
                        x,
                        y,
                        originalX: x,
                        originalY: y,
                        vx: 0,
                        vy: 0,
                        size: Math.random() * 1.5 + 0.8,
                        color: `rgba(${50 + Math.random() * 30}, ${100 + Math.random() * 40}, ${220 + Math.random() * 35}, ${0.2 + Math.random() * 0.3})`,
                        speed: 0.2 + Math.random() * 0.4,
                        angle: Math.random() * Math.PI * 2,
                        friction: 0.97,
                        pulseSpeed: 0.01 + Math.random() * 0.04,
                        pulseValue: Math.random(),
                        distanceFromMouse: 0,
                        isBrain: true
                    });
                }
            }
            
            // Create connections between particles that are close to each other
            for (let i = 0; i < particles.length; i++) {
                for (let j = i + 1; j < particles.length; j++) {
                    const dx = particles[i].originalX - particles[j].originalX;
                    const dy = particles[i].originalY - particles[j].originalY;
                    const distance = Math.sqrt(dx * dx + dy * dy);
                    
                    // Connect particles that are close enough
                    if (distance < 40) {
                        connections.push({
                            from: i,
                            to: j,
                            distance: distance,
                            opacity: Math.random() * 0.5 + 0.1,
                            pulseSpeed: 0.005 + Math.random() * 0.01,
                            pulseValue: Math.random()
                        });
                    }
                }
            }
        }
        
        function resizeCanvas() {
            // Get container dimensions
            const container = containerRef.current;
            const containerWidth = container.offsetWidth;
            const containerHeight = container.offsetHeight;
            
            // Set canvas to container size with higher resolution for crisp rendering
            canvas.width = containerWidth * 2;
            canvas.height = containerHeight * 2;
            canvas.style.width = `${containerWidth}px`;
            canvas.style.height = `${containerHeight}px`;
            
            // Create particles based on new dimensions
            createParticles();
        }
        
        function animate(currentTime) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            // Calculate delta time to make animations frame rate independent
            const deltaTime = lastTime ? (currentTime - lastTime) / 16 : 1; // 16ms is roughly 60fps
            lastTime = currentTime;
            frameCount++;
            
            // Update connections
            ctx.lineWidth = 1;
            connections.forEach(connection => {
                const p1 = particles[connection.from];
                const p2 = particles[connection.to];
                
                // Update pulse value
                connection.pulseValue += connection.pulseSpeed * deltaTime;
                if (connection.pulseValue > 1) connection.pulseValue = 0;
                
                // Dynamic opacity based on pulse and user interaction
                let opacity = connection.opacity * (0.4 + Math.sin(connection.pulseValue * Math.PI) * 0.3);
                
                // Increase connection visibility when hovering
                if (isHovering) {
                    opacity = Math.min(1, opacity * 2);
                }
                
                // Draw connection with gradient
                const gradient = ctx.createLinearGradient(p1.x, p1.y, p2.x, p2.y);
                gradient.addColorStop(0, p1.color.replace(/[^,]+(?=\))/, opacity));
                gradient.addColorStop(1, p2.color.replace(/[^,]+(?=\))/, opacity));
                
                ctx.strokeStyle = gradient;
                ctx.beginPath();
                ctx.moveTo(p1.x, p1.y);
                ctx.lineTo(p2.x, p2.y);
                ctx.stroke();
                
                // Occasionally draw pulse traveling along the connection
                if (Math.random() > 0.95) {
                    const t = Math.random();
                    const x = p1.x + (p2.x - p1.x) * t;
                    const y = p1.y + (p2.y - p1.y) * t;
                    
                    ctx.beginPath();
                    ctx.arc(x, y, 1.5, 0, Math.PI * 2);
                    ctx.fillStyle = `rgba(150, 200, 255, ${0.7 + Math.random() * 0.3})`;
                    ctx.fill();
                }
            });
            
            // Update particles
            particles.forEach(particle => {
                // Update pulse value
                particle.pulseValue += particle.pulseSpeed * deltaTime;
                if (particle.pulseValue > 1) particle.pulseValue = 0;
                
                // Pulsing size effect
                const pulseEffect = 0.7 + Math.sin(particle.pulseValue * Math.PI * 2) * 0.3;
                let size = particle.size * pulseEffect;
                
                // Calculate distance from mouse
                const dx = particle.x - mouseX;
                const dy = particle.y - mouseY;
                particle.distanceFromMouse = Math.sqrt(dx * dx + dy * dy);
                
                // Reactive behavior based on mouse position
                if (particle.distanceFromMouse < 100) {
                    // Particles move away from mouse
                    const repelForce = (1 - particle.distanceFromMouse / 100) * 2;
                    const angle = Math.atan2(dy, dx);
                    particle.vx += Math.cos(angle) * repelForce * deltaTime;
                    particle.vy += Math.sin(angle) * repelForce * deltaTime;
                    
                    // Increase size when mouse is nearby
                    size *= 1 + (1 - particle.distanceFromMouse / 100) * 0.5;
                } else {
                    // Return to original position
                    const dx = particle.originalX - particle.x;
                    const dy = particle.originalY - particle.y;
                    particle.vx += dx * 0.03 * deltaTime;
                    particle.vy += dy * 0.03 * deltaTime;
                }
                
                // Add some movement for brain particles
                if (particle.isBrain) {
                    particle.angle += (Math.random() - 0.5) * 0.1 * deltaTime;
                    particle.vx += Math.cos(particle.angle) * particle.speed * 0.2 * deltaTime;
                    particle.vy += Math.sin(particle.angle) * particle.speed * 0.2 * deltaTime;
                    
                    // Occasional bursts of activity
                    if (Math.random() > 0.99) {
                        const burstPower = Math.random() * 2 + 1;
                        const burstAngle = Math.random() * Math.PI * 2;
                        particle.vx += Math.cos(burstAngle) * burstPower;
                        particle.vy += Math.sin(burstAngle) * burstPower;
                    }
                }
                
                // Apply velocity with friction
                particle.x += particle.vx * deltaTime;
                particle.y += particle.vy * deltaTime;
                particle.vx *= particle.friction;
                particle.vy *= particle.friction;
                
                // Draw particle with appropriate color and size
                ctx.beginPath();
                ctx.arc(particle.x, particle.y, size, 0, Math.PI * 2);
                ctx.fillStyle = particle.color;
                ctx.fill();
                
                // Add glow effect to particles
                const glow = ctx.createRadialGradient(
                    particle.x, particle.y, 0,
                    particle.x, particle.y, size * 3
                );
                glow.addColorStop(0, particle.color.replace(/[^,]+(?=\))/, 0.3));
                glow.addColorStop(1, particle.color.replace(/[^,]+(?=\))/, 0));
                
                ctx.beginPath();
                ctx.arc(particle.x, particle.y, size * 3, 0, Math.PI * 2);
                ctx.fillStyle = glow;
                ctx.fill();
            });
            
            // Draw occasional "neural sparks" between brain particles
            if (frameCount % 5 === 0) {
                const brainParticles = particles.filter(p => p.isBrain);
                if (brainParticles.length > 1) {
                    const p1 = brainParticles[Math.floor(Math.random() * brainParticles.length)];
                    const p2 = brainParticles[Math.floor(Math.random() * brainParticles.length)];
                    
                    if (p1.id !== p2.id) {
                        const dx = p2.x - p1.x;
                        const dy = p2.y - p1.y;
                        const distance = Math.sqrt(dx * dx + dy * dy);
                        
                        if (distance < 80) {
                            // Draw neural connection
                            const gradient = ctx.createLinearGradient(p1.x, p1.y, p2.x, p2.y);
                            gradient.addColorStop(0, 'rgba(100, 180, 255, 0.7)');
                            gradient.addColorStop(0.5, 'rgba(130, 200, 255, 0.9)');
                            gradient.addColorStop(1, 'rgba(100, 180, 255, 0.7)');
                            
                            ctx.beginPath();
                            ctx.moveTo(p1.x, p1.y);
                            ctx.lineTo(p2.x, p2.y);
                            ctx.strokeStyle = gradient;
                            ctx.lineWidth = 1;
                            ctx.stroke();
                            
                            // Draw pulse traveling along the connection
                            const t = (frameCount % 20) / 20;
                            const x = p1.x + dx * t;
                            const y = p1.y + dy * t;
                            
                            ctx.beginPath();
                            ctx.arc(x, y, 2, 0, Math.PI * 2);
                            ctx.fillStyle = 'rgba(150, 220, 255, 0.8)';
                            ctx.fill();
                        }
                    }
                }
            }
            
            animationFrameId = requestAnimationFrame(animate);
        }
        
        // Mouse interaction
        function handleMouseMove(e) {
            const rect = canvas.getBoundingClientRect();
            // Scale mouse coordinates to match the canvas resolution
            mouseX = (e.clientX - rect.left) * 2;
            mouseY = (e.clientY - rect.top) * 2;
        }
        
        function handleMouseEnter() {
            isHovering = true;
        }
        
        function handleMouseLeave() {
            isHovering = false;
            mouseX = canvas.width / 2;
            mouseY = canvas.height / 2;
        }
        
        // Initialize animation
        resizeCanvas();
        canvas.addEventListener('mousemove', handleMouseMove);
        canvas.addEventListener('mouseenter', handleMouseEnter);
        canvas.addEventListener('mouseleave', handleMouseLeave);
        window.addEventListener('resize', resizeCanvas);
        
        // Start animation
        animationFrameId = requestAnimationFrame(animate);
        
        // Cleanup
        return () => {
            cancelAnimationFrame(animationFrameId);
            canvas.removeEventListener('mousemove', handleMouseMove);
            canvas.removeEventListener('mouseenter', handleMouseEnter);
            canvas.removeEventListener('mouseleave', handleMouseLeave);
            window.removeEventListener('resize', resizeCanvas);
        };
    }, []);
    
    return (
        <div className="enhanced-ai-head-container" ref={containerRef}>
            <canvas ref={canvasRef} className="enhanced-ai-head-canvas"></canvas>
            <div className="ai-head-glow"></div>
            <div className="ai-head-label">Infinity Neural Core</div>
        </div>
    );
};

export default EnhancedAIHead; 