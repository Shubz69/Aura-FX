import React, { useEffect, useRef } from 'react';

const SharedBackground = () => {
    const gridRef = useRef(null);

    // 3D grid effect with improved animation
    useEffect(() => {
        const grid = gridRef.current;
        if (!grid) return;

        for (let i = 0; i < 15; i++) {
            const gridLine = document.createElement('div');
            gridLine.className = 'grid-line';
            gridLine.style.setProperty('--delay', i * 0.4);
            gridLine.style.top = `${i * 7}%`;
            grid.appendChild(gridLine);
        }

        return () => {
            while (grid && grid.firstChild) {
                grid.removeChild(grid.firstChild);
            }
        };
    }, []);

    // Matrix-like particle effect
    useEffect(() => {
        const canvas = document.getElementById('matrixCanvas');
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        canvas.height = window.innerHeight;
        canvas.width = window.innerWidth;
        
        const characters = "01010101";
        const columns = canvas.width / 20;
        const drops = [];
        
        for (let i = 0; i < columns; i++) {
            drops[i] = 1;
        }
        
        function draw() {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            ctx.fillStyle = '#fff';
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
        
        const interval = setInterval(draw, 70);
        
        return () => clearInterval(interval);
    }, []);

    // Render chart background with more complex pattern
    const renderChartBg = () => (
        <div className="chart-bg">
            <svg width="100%" height="100%" viewBox="0 0 1200 800" preserveAspectRatio="none">
                <path 
                    className="chart-line" 
                    d="M0,600 C100,580 200,620 300,580 C400,540 500,600 600,550 C700,500 800,650 900,600 C1000,550 1100,570 1200,540" 
                    stroke="#fff" 
                />
                <path 
                    className="chart-line" 
                    d="M0,500 C100,480 200,520 300,490 C400,460 500,510 600,470 C700,430 800,550 900,500 C1000,450 1100,470 1200,430" 
                    stroke="#ccc" 
                    style={{ animationDelay: '0.5s' }}
                />
            </svg>
        </div>
    );

    return (
        <>
            <canvas id="matrixCanvas" className="matrix-background"></canvas>
            {renderChartBg()}
            
            {/* Floating elements with enhanced SVGs */}
            <div className="floating-element el1">
                <svg width="100%" height="100%" viewBox="0 0 100 100">
                    <path d="M50,10 L90,50 L50,90 L10,50 Z" stroke="#fff" strokeWidth="1" fill="none" />
                </svg>
            </div>
            
            <div className="floating-element el2">
                <svg width="100%" height="100%" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="40" stroke="#ccc" strokeWidth="1" fill="none" />
                </svg>
            </div>
            
            <div className="floating-element el3">
                <svg width="100%" height="100%" viewBox="0 0 100 100">
                    <path d="M20,20 L80,20 L80,80 L20,80 Z" stroke="#fff" strokeWidth="1" fill="none" />
                </svg>
            </div>
            
            <div className="grid-3d" ref={gridRef}></div>
        </>
    );
};

export default SharedBackground;
