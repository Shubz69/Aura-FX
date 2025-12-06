import React, { useEffect, useRef } from 'react';
import '../styles/NavbarAiHead.css';

const NavbarAiHead = () => {
    const canvasRef = useRef(null);
    
    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        let animationFrameId;
        let particles = [];
        
        // Function declarations first, to avoid the "Cannot access before initialization" error
        // Create AI face outline with fewer particles for better performance
        function createFace() {
            particles = [];
            
            // Face dimensions
            const centerX = canvas.width / 2;
            const centerY = canvas.height / 2;
            const faceRadius = Math.min(canvas.width, canvas.height) * 0.35;
            
            // Create face outline (circle) with fewer particles
            const numParticles = 30; // Reduced from 60
            for (let i = 0; i < numParticles; i++) {
                const angle = (i / numParticles) * Math.PI * 2;
                const x = centerX + Math.cos(angle) * faceRadius;
                const y = centerY + Math.sin(angle) * faceRadius;
                particles.push({
                    x,
                    y,
                    size: 2,
                    color: `rgba(111, 49, 255, 0.8)`,
                    originalX: x,
                    originalY: y,
                    vx: 0,
                    vy: 0,
                    pulseValue: Math.random()
                });
            }
            
            // Create simplified eyes (two arcs)
            const eyeOffset = faceRadius * 0.3;
            const eyeSize = faceRadius * 0.15;
            
            // Left eye (fewer particles)
            for (let i = 0; i < 8; i++) { // Reduced from 15
                const angle = Math.PI + (i / 8) * Math.PI;
                const x = centerX - eyeOffset + Math.cos(angle) * eyeSize;
                const y = centerY - eyeOffset/2 + Math.sin(angle) * eyeSize;
                particles.push({
                    x,
                    y,
                    size: 2,
                    color: `rgba(173, 122, 255, 0.8)`,
                    originalX: x,
                    originalY: y,
                    vx: 0,
                    vy: 0,
                    pulseValue: Math.random()
                });
            }
            
            // Right eye (fewer particles)
            for (let i = 0; i < 8; i++) { // Reduced from 15
                const angle = Math.PI + (i / 8) * Math.PI;
                const x = centerX + eyeOffset + Math.cos(angle) * eyeSize;
                const y = centerY - eyeOffset/2 + Math.sin(angle) * eyeSize;
                particles.push({
                    x,
                    y,
                    size: 2,
                    color: `rgba(173, 122, 255, 0.8)`,
                    originalX: x,
                    originalY: y,
                    vx: 0,
                    vy: 0,
                    pulseValue: Math.random()
                });
            }
            
            // Create mouth (arc with fewer particles)
            for (let i = 0; i < 10; i++) { // Reduced from 20
                const angle = (i / 10) * Math.PI;
                const x = centerX + Math.cos(angle) * (faceRadius * 0.5);
                const y = centerY + eyeOffset + Math.sin(angle) * (faceRadius * 0.2);
                particles.push({
                    x,
                    y,
                    size: 2,
                    color: `rgba(111, 49, 255, 0.8)`,
                    originalX: x,
                    originalY: y,
                    vx: 0,
                    vy: 0,
                    pulseValue: Math.random()
                });
            }
        }
        
        // Set canvas size
        function resizeCanvas() {
            canvas.width = canvas.offsetWidth * 2; // Higher resolution
            canvas.height = canvas.offsetHeight * 2;
            createFace(); // Recreate face when canvas is resized
        }
        
        // Animation loop - simplified for better performance
        function animate() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            // Update and draw particles
            particles.forEach(particle => {
                // Simple pulsing effect
                particle.pulseValue += 0.02;
                if (particle.pulseValue > 1) particle.pulseValue = 0;
                
                const size = particle.size * (0.8 + Math.sin(particle.pulseValue * Math.PI) * 0.4);
                
                // Add slight movement
                particle.x = particle.originalX + Math.sin(particle.pulseValue * Math.PI * 2) * 2;
                particle.y = particle.originalY + Math.cos(particle.pulseValue * Math.PI * 2) * 2;
                
                // Draw particle
                ctx.fillStyle = particle.color;
                ctx.beginPath();
                ctx.arc(particle.x, particle.y, size, 0, Math.PI * 2);
                ctx.fill();
            });
            
            // Occasionally draw connections between close particles for visual effect
            if (Math.random() > 0.7) {
                ctx.strokeStyle = 'rgba(111, 49, 255, 0.3)';
                ctx.lineWidth = 0.5;
                
                for (let i = 0; i < particles.length; i += 3) { // Only check every third particle
                    for (let j = i + 3; j < particles.length; j += 3) {
                        const dx = particles[i].x - particles[j].x;
                        const dy = particles[i].y - particles[j].y;
                        const distance = Math.sqrt(dx * dx + dy * dy);
                        
                        if (distance < 30) {
                            ctx.beginPath();
                            ctx.moveTo(particles[i].x, particles[i].y);
                            ctx.lineTo(particles[j].x, particles[j].y);
                            ctx.stroke();
                        }
                    }
                }
            }
            
            animationFrameId = requestAnimationFrame(animate);
        }
        
        // Initialize
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);
        animate();
        
        return () => {
            window.removeEventListener('resize', resizeCanvas);
            cancelAnimationFrame(animationFrameId);
        };
    }, []);
    
    return (
        <div className="navbar-ai-head-container">
            <canvas ref={canvasRef} className="navbar-ai-head-canvas"></canvas>
            <div className="navbar-ai-glow"></div>
        </div>
    );
};

export default NavbarAiHead; 