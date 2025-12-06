import React, { useEffect, useRef, useState } from 'react';
import '../styles/FancyAIHead.css';

const FancyAIHead = ({ state = 'idle', onInteraction, mousePosition }) => {
    const canvasRef = useRef(null);
    const neuralRef = useRef(null);
    const containerRef = useRef(null);
    const [hoveredElement, setHoveredElement] = useState(null);
    const [isInteracting, setIsInteracting] = useState(false);
    const [eyeDirection, setEyeDirection] = useState({ x: 0, y: 0 });
    const pulseIntensityRef = useRef(1);
    const mousePosRef = useRef({ x: 0, y: 0 });

    useEffect(() => {
        const canvas = canvasRef.current;
        const neuralCanvas = neuralRef.current;
        const neuralCtx = neuralCanvas.getContext('2d');

        const resizeCanvas = () => {
            canvas.width = canvas.offsetWidth;
            canvas.height = canvas.offsetHeight;
            neuralCanvas.width = neuralCanvas.offsetWidth;
            neuralCanvas.height = neuralCanvas.offsetHeight;
        };

        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);

        // Enhanced neural network with multiple layers
        let layers = [];
        let connections = [];
        const layerCount = 5;
        const nodesPerLayer = [12, 18, 15, 12, 8];

        // Initialize neural network layers
        for (let layer = 0; layer < layerCount; layer++) {
            const layerNodes = [];
            const layerWidth = neuralCanvas.width * 0.8;
            const layerHeight = neuralCanvas.height * 0.6;
            const startX = (neuralCanvas.width - layerWidth) / 2;
            const startY = (neuralCanvas.height - layerHeight) / 2;
            
            for (let i = 0; i < nodesPerLayer[layer]; i++) {
                const x = startX + (i / (nodesPerLayer[layer] - 1)) * layerWidth;
                const y = startY + (layer / (layerCount - 1)) * layerHeight + (Math.random() - 0.5) * 30;
                
                layerNodes.push({
                    x, y,
                    vx: (Math.random() - 0.5) * 0.4,
                    vy: (Math.random() - 0.5) * 0.4,
                    size: Math.random() * 5 + 3,
                    pulse: Math.random() * Math.PI * 2,
                    layer,
                    connections: [],
                    energy: Math.random() * 0.5 + 0.5,
                    type: Math.random() > 0.7 ? 'core' : 'regular'
                });
            }
            layers.push(layerNodes);
        }

        // Create connections between layers
        for (let layer = 0; layer < layerCount - 1; layer++) {
            const currentLayer = layers[layer];
            const nextLayer = layers[layer + 1];
            
            currentLayer.forEach(node => {
                const connectionCount = Math.floor(Math.random() * 4) + 2;
                for (let i = 0; i < connectionCount; i++) {
                    const targetNode = nextLayer[Math.floor(Math.random() * nextLayer.length)];
                    connections.push({
                        from: node,
                        to: targetNode,
                        strength: Math.random() * 0.6 + 0.2,
                        pulse: Math.random() * Math.PI * 2,
                        type: Math.random() > 0.8 ? 'primary' : 'secondary'
                    });
                }
            });
        }

        // Mouse tracking for eye movement
        const updateEyeDirection = (mouseX, mouseY) => {
            const container = containerRef.current || neuralCanvas;
            if (container) {
                const rect = container.getBoundingClientRect();
                const centerX = rect.left + rect.width / 2;
                const centerY = rect.top + rect.height / 2;
                
                // Use provided mousePosition or current mousePos state
                const currentX = mouseX !== undefined ? mouseX : mousePosRef.current.x;
                const currentY = mouseY !== undefined ? mouseY : mousePosRef.current.y;
                
                const deltaX = (currentX - centerX) / (rect.width / 2);
                const deltaY = (currentY - centerY) / (rect.height / 2);
                
                // Clamp values and apply smoothing
                const newX = Math.max(-1, Math.min(1, deltaX * 0.6));
                const newY = Math.max(-1, Math.min(1, deltaY * 0.6));
                
                setEyeDirection(prev => ({
                    x: prev.x + (newX - prev.x) * 0.3, // Smooth interpolation
                    y: prev.y + (newY - prev.y) * 0.3
                }));
            }
        };

        // Mouse move event handler
        const handleMouseMove = (e) => {
            mousePosRef.current = { x: e.clientX, y: e.clientY };
            updateEyeDirection(e.clientX, e.clientY);
        };

        // Add mouse move listener
        window.addEventListener('mousemove', handleMouseMove);

        // Animation loop
        const animate = () => {
            // Update eye direction in animation loop for smooth tracking
            if (mousePosRef.current.x !== 0 || mousePosRef.current.y !== 0) {
                updateEyeDirection();
            }
            
            neuralCtx.clearRect(0, 0, neuralCanvas.width, neuralCanvas.height);

            // Update pulse intensity based on state
            let targetPulse = 1;
            switch (state) {
                case 'thinking':
                    targetPulse = 1.8;
                    break;
                case 'analyzing':
                    targetPulse = 2.5;
                    break;
                case 'learning':
                    targetPulse = 2.2;
                    break;
                default:
                    targetPulse = 1;
            }
            
            const updatedPulse = pulseIntensityRef.current + (targetPulse - pulseIntensityRef.current) * 0.1;
            pulseIntensityRef.current = updatedPulse;

            // Animate neural network
            layers.forEach((layer, layerIndex) => {
                layer.forEach(node => {
                    let speedMultiplier = 1;
                    let sizeMultiplier = 1;
                    let colorIntensity = 0.3;

                    switch (state) {
                        case 'thinking':
                            speedMultiplier = 0.15;
                            sizeMultiplier = 2.2;
                            colorIntensity = 0.9;
                            break;
                        case 'analyzing':
                            speedMultiplier = 3.0;
                            sizeMultiplier = 0.6;
                            colorIntensity = 1.0;
                            break;
                        case 'learning':
                            speedMultiplier = 2.2;
                            sizeMultiplier = 1.5;
                            colorIntensity = 0.95;
                            break;
                        case 'idle':
                        default:
                            speedMultiplier = 1;
                            sizeMultiplier = 1;
                            colorIntensity = 0.3;
                    }

                    // Update node position
                    node.x += node.vx * speedMultiplier;
                    node.y += node.vy * speedMultiplier;
                    node.pulse += 0.08;

                    // Bounce off edges
                    if (node.x < 0 || node.x > neuralCanvas.width) node.vx *= -1;
                    if (node.y < 0 || node.y > neuralCanvas.height) node.vy *= -1;

                    // Draw node with enhanced effects
                    const alpha = colorIntensity + 0.3 * Math.sin(node.pulse);
                    const nodeSize = node.size * sizeMultiplier * pulseIntensityRef.current;
                    
                    // Node glow
                    neuralCtx.beginPath();
                    neuralCtx.arc(node.x, node.y, nodeSize + 8, 0, Math.PI * 2);
                    neuralCtx.fillStyle = `rgba(30, 144, 255, ${alpha * 0.15})`;
                    neuralCtx.fill();
                    
                    // Node core
                    neuralCtx.beginPath();
                    neuralCtx.arc(node.x, node.y, nodeSize, 0, Math.PI * 2);
                    neuralCtx.fillStyle = `rgba(30, 144, 255, ${alpha})`;
                    neuralCtx.fill();
                    
                    // Node highlight
                    neuralCtx.beginPath();
                    neuralCtx.arc(node.x - nodeSize * 0.3, node.y - nodeSize * 0.3, nodeSize * 0.4, 0, Math.PI * 2);
                    neuralCtx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.8})`;
                    neuralCtx.fill();

                    // Special effects for core nodes
                    if (node.type === 'core') {
                        neuralCtx.beginPath();
                        neuralCtx.arc(node.x, node.y, nodeSize * 1.5, 0, Math.PI * 2);
                        neuralCtx.strokeStyle = `rgba(0, 255, 255, ${alpha * 0.6})`;
                        neuralCtx.lineWidth = 2;
                        neuralCtx.stroke();
                    }
                });
            });

            // Animate connections
            connections.forEach(conn => {
                const distance = Math.sqrt((conn.from.x - conn.to.x) ** 2 + (conn.from.y - conn.to.y) ** 2);
                let maxDistance = 100;
                let lineWidth = 1;
                
                switch (state) {
                    case 'thinking':
                        maxDistance = 180;
                        lineWidth = 3;
                        break;
                    case 'analyzing':
                        maxDistance = 70;
                        lineWidth = 2.2;
                        break;
                    case 'learning':
                        maxDistance = 140;
                        lineWidth = 2.8;
                        break;
                    default:
                        maxDistance = 100;
                        lineWidth = 1;
                        break;
                }
                
                if (distance < maxDistance) {
                    const alpha = conn.strength * (1 - distance / maxDistance);
                    const pulseEffect = Math.sin(conn.pulse) * 0.3 + 0.7;
                    
                    // Connection glow
                    neuralCtx.beginPath();
                    neuralCtx.moveTo(conn.from.x, conn.from.y);
                    neuralCtx.lineTo(conn.to.x, conn.to.y);
                    neuralCtx.strokeStyle = `rgba(30, 144, 255, ${alpha * 0.4})`;
                    neuralCtx.lineWidth = lineWidth + 3;
                    neuralCtx.stroke();
                    
                    // Connection core
                    neuralCtx.beginPath();
                    neuralCtx.moveTo(conn.from.x, conn.from.y);
                    neuralCtx.lineTo(conn.to.x, conn.to.y);
                    neuralCtx.strokeStyle = `rgba(30, 144, 255, ${alpha * pulseEffect})`;
                    neuralCtx.lineWidth = lineWidth;
                    neuralCtx.stroke();
                    
                    // Special effects for primary connections
                    if (conn.type === 'primary') {
                        neuralCtx.beginPath();
                        neuralCtx.moveTo(conn.from.x, conn.from.y);
                        neuralCtx.lineTo(conn.to.x, conn.to.y);
                        neuralCtx.strokeStyle = `rgba(0, 255, 255, ${alpha * 0.8})`;
                        neuralCtx.lineWidth = lineWidth + 1;
                        neuralCtx.stroke();
                    }
                    
                    conn.pulse += 0.12;
                }
            });

            requestAnimationFrame(animate);
        };

        animate();

        // Cleanup
        return () => {
            window.removeEventListener('resize', resizeCanvas);
            window.removeEventListener('mousemove', handleMouseMove);
        };
    }, [state]);

    const handleElementHover = (element) => {
        setHoveredElement(element);
        setIsInteracting(true);
    };

    const handleElementLeave = () => {
        setHoveredElement(null);
        setIsInteracting(false);
    };

    return (
        <div 
            ref={containerRef}
            className={`fancy-ai-head ${state} ${isInteracting ? 'interacting' : ''}`}
        >
            <div className="ai-head-container">
                {/* Enhanced Neural Network Background */}
                <canvas 
                    ref={neuralRef} 
                    className="neural-background"
                    width="600"
                    height="600"
                />
                
                {/* Main Head Structure */}
                <div className="head-structure">
                    {/* Enhanced Head Base */}
                    <div className="head-base">
                        <div className="head-outer-glow"></div>
                        <div className="head-outline"></div>
                        <div className="head-inner-glow"></div>
                        <div className="head-core"></div>
                        <div className="head-energy-field"></div>
                    </div>
                    
                    {/* Enhanced Eyes with Mouse Tracking */}
                    <div className="eyes-container">
                        <div className="eye left-eye" 
                             onMouseEnter={() => handleElementHover('left-eye')}
                             onMouseLeave={handleElementLeave}>
                            <div className="eye-outer-ring"></div>
                            <div className="eye-iris" style={{
                                transform: `translate(${eyeDirection.x * 10}px, ${eyeDirection.y * 10}px)`,
                                transition: 'transform 0.15s ease-out'
                            }}>
                                <div className="eye-pupil"></div>
                                <div className="eye-highlight"></div>
                                <div className="eye-scan-line"></div>
                                <div className="eye-data-stream"></div>
                            </div>
                            <div className="eye-ring"></div>
                            <div className="eye-glow"></div>
                        </div>
                        
                        <div className="eye right-eye"
                             onMouseEnter={() => handleElementHover('right-eye')}
                             onMouseLeave={handleElementLeave}>
                            <div className="eye-outer-ring"></div>
                            <div className="eye-iris" style={{
                                transform: `translate(${eyeDirection.x * 10}px, ${eyeDirection.y * 10}px)`,
                                transition: 'transform 0.15s ease-out'
                            }}>
                                <div className="eye-pupil"></div>
                                <div className="eye-highlight"></div>
                                <div className="eye-scan-line"></div>
                                <div className="eye-data-stream"></div>
                            </div>
                            <div className="eye-ring"></div>
                            <div className="eye-glow"></div>
                        </div>
                    </div>
                    
                    {/* Enhanced Neural Processing Units */}
                    <div className="neural-units">
                        {[...Array(12)].map((_, i) => (
                            <div 
                                key={i}
                                className={`unit unit-${i + 1}`}
                                onMouseEnter={() => handleElementHover(`unit-${i + 1}`)}
                                onMouseLeave={handleElementLeave}
                            >
                                <div className="unit-core"></div>
                                <div className="unit-pulse"></div>
                                <div className="unit-data-flow"></div>
                            </div>
                        ))}
                    </div>
                    
                    {/* Enhanced Data Streams */}
                    <div className="data-streams">
                        {[...Array(8)].map((_, i) => (
                            <div 
                                key={i}
                                className={`stream stream-${i + 1}`}
                                onMouseEnter={() => handleElementHover(`stream-${i + 1}`)}
                                onMouseLeave={handleElementLeave}
                            >
                                <div className="stream-particle"></div>
                                <div className="stream-energy"></div>
                            </div>
                        ))}
                    </div>
                    
                    {/* Enhanced Energy Field */}
                    <div className="energy-field">
                        {[...Array(6)].map((_, i) => (
                            <div 
                                key={i}
                                className={`field-layer field-${i + 1}`}
                                onMouseEnter={() => handleElementHover(`field-${i + 1}`)}
                                onMouseLeave={handleElementLeave}
                            >
                                <div className="field-particles"></div>
                            </div>
                        ))}
                    </div>
                </div>
                
                {/* Enhanced Floating Data Particles */}
                <div className="data-particles">
                    {[...Array(40)].map((_, i) => (
                        <div 
                            key={i} 
                            className="particle"
                            style={{
                                '--delay': `${i * 0.1}s`,
                                '--duration': `${2 + Math.random() * 3}s`,
                                '--x': `${Math.random() * 100}%`,
                                '--y': `${Math.random() * 100}%`
                            }}
                            onMouseEnter={() => handleElementHover(`particle-${i}`)}
                            onMouseLeave={handleElementLeave}
                        ></div>
                    ))}
                </div>
                
                {/* Enhanced Scanning Lines */}
                <div className="scanning-lines">
                    {[...Array(8)].map((_, i) => (
                        <div 
                            key={i}
                            className={`scan-line scan-${i + 1}`}
                            onMouseEnter={() => handleElementHover(`scan-${i + 1}`)}
                            onMouseLeave={handleElementLeave}
                        ></div>
                    ))}
                </div>
                
                {/* Enhanced Status Indicators */}
                <div className="status-indicators">
                    <div className="status status-1">
                        <div className="status-dot"></div>
                        <span className="status-text">AI CORE</span>
                        <div className="status-pulse"></div>
                        <div className="status-data"></div>
                    </div>
                    <div className="status status-2">
                        <div className="status-dot"></div>
                        <span className="status-text">NEURAL</span>
                        <div className="status-pulse"></div>
                        <div className="status-data"></div>
                    </div>
                    <div className="status status-3">
                        <div className="status-dot"></div>
                        <span className="status-text">{state.toUpperCase()}</span>
                        <div className="status-pulse"></div>
                        <div className="status-data"></div>
                    </div>
                </div>
            </div>
            
            {/* Enhanced Effects Canvas */}
            <canvas 
                ref={canvasRef} 
                className="effects-canvas"
                width="600"
                height="600"
            />
            
            {/* Enhanced Hover Info */}
            {hoveredElement && (
                <div className="hover-info">
                    <div className="info-content">
                        <h4>{hoveredElement.replace('-', ' ').toUpperCase()}</h4>
                        <p>Status: Active</p>
                        <p>Performance: Optimal</p>
                        <p>Energy: {Math.floor(Math.random() * 40 + 60)}%</p>
                        <div className="info-glow"></div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default FancyAIHead;
