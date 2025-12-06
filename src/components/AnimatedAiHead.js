import React, { useEffect, useRef } from 'react';
import '../styles/AnimatedAiHead.css';

const AnimatedAiHead = () => {
    const canvasRef = useRef(null);
    
    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        let animationFrameId;
        let particles = [];
        
        // Set canvas size
        const resizeCanvas = () => {
            canvas.width = canvas.offsetWidth;
            canvas.height = canvas.offsetHeight;
        };
        
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);
        
        // Particle class
        class Particle {
            constructor(x, y, size, color) {
                this.x = x;
                this.y = y;
                this.size = size;
                this.color = color;
                this.targetX = x;
                this.targetY = y;
                this.vx = 0;
                this.vy = 0;
                this.friction = 0.95;
                this.ease = 0.1;
                this.distanceFromMouse = 0;
                this.originalX = x;
                this.originalY = y;
            }
            
            update(mouseX, mouseY) {
                // Calculate distance from mouse
                const dx = mouseX - this.x;
                const dy = mouseY - this.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                // Move particles away from mouse when close
                if (distance < 80) {
                    const repelX = dx / distance * 5;
                    const repelY = dy / distance * 5;
                    this.vx -= repelX;
                    this.vy -= repelY;
                } else {
                    // Move particles back to their original position
                    const dx = this.originalX - this.x;
                    const dy = this.originalY - this.y;
                    this.vx += dx * this.ease;
                    this.vy += dy * this.ease;
                }
                
                // Apply velocity with friction
                this.x += this.vx;
                this.y += this.vy;
                this.vx *= this.friction;
                this.vy *= this.friction;
            }
            
            draw(ctx) {
                ctx.fillStyle = this.color;
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        
        // Create AI face outline
        const createFace = () => {
            particles = [];
            
            // Face dimensions
            const centerX = canvas.width / 2;
            const centerY = canvas.height / 2;
            const faceRadius = Math.min(canvas.width, canvas.height) * 0.3;
            
            // Create face outline (circle)
            const numParticles = 60;
            for (let i = 0; i < numParticles; i++) {
                const angle = (i / numParticles) * Math.PI * 2;
                const x = centerX + Math.cos(angle) * faceRadius;
                const y = centerY + Math.sin(angle) * faceRadius;
                const size = Math.random() * 2 + 1;
                const color = `rgba(111, 49, 255, ${Math.random() * 0.5 + 0.5})`;
                particles.push(new Particle(x, y, size, color));
            }
            
            // Create eyes (two arcs)
            const eyeOffset = faceRadius * 0.3;
            const eyeSize = faceRadius * 0.15;
            
            // Left eye
            for (let i = 0; i < 15; i++) {
                const angle = Math.PI + (i / 15) * Math.PI;
                const x = centerX - eyeOffset + Math.cos(angle) * eyeSize;
                const y = centerY - eyeOffset/2 + Math.sin(angle) * eyeSize;
                const size = Math.random() * 2 + 1;
                const color = `rgba(173, 122, 255, ${Math.random() * 0.5 + 0.5})`;
                particles.push(new Particle(x, y, size, color));
            }
            
            // Right eye
            for (let i = 0; i < 15; i++) {
                const angle = Math.PI + (i / 15) * Math.PI;
                const x = centerX + eyeOffset + Math.cos(angle) * eyeSize;
                const y = centerY - eyeOffset/2 + Math.sin(angle) * eyeSize;
                const size = Math.random() * 2 + 1;
                const color = `rgba(173, 122, 255, ${Math.random() * 0.5 + 0.5})`;
                particles.push(new Particle(x, y, size, color));
            }
            
            // Create mouth (arc)
            for (let i = 0; i < 20; i++) {
                const angle = (i / 20) * Math.PI;
                const x = centerX + Math.cos(angle) * (faceRadius * 0.5);
                const y = centerY + eyeOffset + Math.sin(angle) * (faceRadius * 0.2);
                const size = Math.random() * 2 + 1;
                const color = `rgba(111, 49, 255, ${Math.random() * 0.5 + 0.5})`;
                particles.push(new Particle(x, y, size, color));
            }
            
            // Add some random particles inside face for effect
            for (let i = 0; i < 30; i++) {
                const angle = Math.random() * Math.PI * 2;
                const radius = Math.random() * faceRadius * 0.8;
                const x = centerX + Math.cos(angle) * radius;
                const y = centerY + Math.sin(angle) * radius;
                const size = Math.random() * 1.5 + 0.5;
                const color = `rgba(173, 122, 255, ${Math.random() * 0.3 + 0.2})`;
                particles.push(new Particle(x, y, size, color));
            }
        };
        
        // Initialize face
        createFace();
        
        // Mouse position
        let mouseX = 0;
        let mouseY = 0;
        
        canvas.addEventListener('mousemove', (e) => {
            const rect = canvas.getBoundingClientRect();
            mouseX = e.clientX - rect.left;
            mouseY = e.clientY - rect.top;
        });
        
        canvas.addEventListener('mouseleave', () => {
            mouseX = canvas.width / 2;
            mouseY = canvas.height / 2;
        });
        
        // Animation loop
        const animate = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            // Draw connections between particles
            ctx.strokeStyle = 'rgba(111, 49, 255, 0.2)';
            ctx.lineWidth = 0.5;
            
            for (let i = 0; i < particles.length; i++) {
                for (let j = i + 1; j < particles.length; j++) {
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
            
            // Update and draw particles
            particles.forEach(particle => {
                particle.update(mouseX, mouseY);
                particle.draw(ctx);
            });
            
            animationFrameId = requestAnimationFrame(animate);
        };
        
        animate();
        
        return () => {
            window.removeEventListener('resize', resizeCanvas);
            cancelAnimationFrame(animationFrameId);
        };
    }, []);
    
    return (
        <div className="ai-head-container">
            <canvas ref={canvasRef} className="ai-head-canvas"></canvas>
            <div className="glow-effect"></div>
        </div>
    );
};

export default AnimatedAiHead; 