import React, { useEffect, useMemo } from 'react';

// EXACT BINARY BACKGROUND FROM CONTACT US PAGE
// ⚠️ DO NOT MODIFY - PERFECT AS IS ⚠️
const BinaryBackground = () => {
    const canvasId = useMemo(() => `binaryMatrixCanvas-${Math.random().toString(36).substr(2, 9)}`, []);
    
    // Matrix-like particle effect - EXACT COPY FROM CONTACT US
    useEffect(() => {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        canvas.height = window.innerHeight;
        canvas.width = window.innerWidth;
        
        // Initialize with very dark purple background
        ctx.fillStyle = '#0a0a1a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // ⚠️ EXACT SETTINGS FROM CONTACT US - DO NOT CHANGE
        const characters = "01010101";
        const columns = canvas.width / 20;
        const drops = [];
        
        for (let i = 0; i < columns; i++) {
            drops[i] = 1;
        }
        
        function draw() {
            ctx.fillStyle = 'rgba(10, 10, 26, 0.05)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.font = '15px monospace';
            
            for (let i = 0; i < drops.length; i++) {
                const text = characters[Math.floor(Math.random() * characters.length)];
                ctx.fillText(text, i * 20, drops[i] * 20);
                
                if (drops[i] * 20 > canvas.height && Math.random() > 0.975) {
                    drops[i] = 0;
                }
                
                drops[i]++;
            }
        }
        
        // Start immediately
        draw();
        const interval = setInterval(draw, 70);
        
        // Handle window resize
        const handleResize = () => {
            const currentCanvas = document.getElementById(canvasId);
            if (!currentCanvas) return;
            const currentCtx = currentCanvas.getContext('2d');
            currentCanvas.height = window.innerHeight;
            currentCanvas.width = window.innerWidth;
            // Re-initialize background on resize
            currentCtx.fillStyle = '#0a0a1a';
            currentCtx.fillRect(0, 0, currentCanvas.width, currentCanvas.height);
        };
        window.addEventListener('resize', handleResize);
        
        return () => {
            clearInterval(interval);
            window.removeEventListener('resize', handleResize);
        };
    }, [canvasId]);
    
    return (
        <canvas 
            id={canvasId} 
            className="matrix-background" 
            style={{ 
                position: 'fixed', 
                top: 0, 
                left: 0, 
                width: '100%', 
                height: '100%', 
                zIndex: 0, 
                opacity: 0.5, 
                pointerEvents: 'none',
                backgroundColor: '#0a0a1a'
            }}
        ></canvas>
    );
};

export default BinaryBackground;

