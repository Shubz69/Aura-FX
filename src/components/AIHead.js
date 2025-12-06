import React, { useEffect, useRef } from 'react';
import '../styles/AIHead.css';

const AIHead = () => {
    const canvasRef = useRef(null);
    const brainNodesRef = useRef([]);
    const connectionsRef = useRef([]);
    const animationFrameRef = useRef(null);

    // Initialize brain nodes and connections
    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        
        // Set canvas dimensions
        const setCanvasDimensions = () => {
            canvas.width = canvas.offsetWidth;
            canvas.height = canvas.offsetHeight;
        };
        
        setCanvasDimensions();
        window.addEventListener('resize', setCanvasDimensions);
        
        // Create brain nodes
        const createBrainNodes = () => {
            const nodes = [];
            const numNodes = 150;
            
            for (let i = 0; i < numNodes; i++) {
                nodes.push({
                    x: Math.random() * canvas.width,
                    y: Math.random() * canvas.height,
                    radius: Math.random() * 2 + 1,
                    speed: Math.random() * 0.5 + 0.1,
                    angle: Math.random() * Math.PI * 2,
                    pulseSpeed: Math.random() * 0.05 + 0.01,
                    pulseDirection: Math.random() > 0.5 ? 1 : -1,
                    pulseValue: Math.random(),
                    color: `rgba(${111 + Math.random() * 30}, ${49 + Math.random() * 30}, ${255}, ${0.4 + Math.random() * 0.6})`
                });
            }
            
            return nodes;
        };
        
        // Create connections between nodes
        const createConnections = (nodes) => {
            const connections = [];
            const connectionLimit = 3; // Max connections per node
            
            nodes.forEach((node, i) => {
                // Sort nodes by distance
                const distances = nodes
                    .map((otherNode, j) => ({
                        index: j,
                        distance: Math.sqrt(
                            Math.pow(node.x - otherNode.x, 2) + 
                            Math.pow(node.y - otherNode.y, 2)
                        )
                    }))
                    .filter(node => node.distance > 0) // Exclude self
                    .sort((a, b) => a.distance - b.distance);
                
                // Create connections to closest nodes
                for (let j = 0; j < Math.min(connectionLimit, distances.length); j++) {
                    const targetNodeIndex = distances[j].index;
                    
                    // Avoid duplicate connections
                    const connectionExists = connections.some(
                        conn => (conn.from === i && conn.to === targetNodeIndex) || 
                               (conn.from === targetNodeIndex && conn.to === i)
                    );
                    
                    if (!connectionExists) {
                        connections.push({
                            from: i,
                            to: targetNodeIndex,
                            pulseSpeed: Math.random() * 0.02 + 0.005,
                            pulseValue: Math.random(),
                            width: Math.random() * 1.5 + 0.5
                        });
                    }
                }
            });
            
            return connections;
        };
        
        // Initialize
        brainNodesRef.current = createBrainNodes();
        connectionsRef.current = createConnections(brainNodesRef.current);
        
        // Start animation
        animate();
        
        // Animation function
        function animate() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            // Update and draw connections
            connectionsRef.current.forEach(connection => {
                const fromNode = brainNodesRef.current[connection.from];
                const toNode = brainNodesRef.current[connection.to];
                
                // Update pulse
                connection.pulseValue += connection.pulseSpeed;
                if (connection.pulseValue > 1) connection.pulseValue = 0;
                
                // Draw connection with pulse effect
                ctx.beginPath();
                ctx.moveTo(fromNode.x, fromNode.y);
                ctx.lineTo(toNode.x, toNode.y);
                
                const alpha = 0.2 + Math.sin(connection.pulseValue * Math.PI * 2) * 0.3;
                ctx.strokeStyle = `rgba(111, 49, 255, ${alpha})`;
                ctx.lineWidth = connection.width;
                ctx.stroke();
                
                // Draw pulse traveling along the line
                const pulsePosition = connection.pulseValue;
                const x = fromNode.x + (toNode.x - fromNode.x) * pulsePosition;
                const y = fromNode.y + (toNode.y - fromNode.y) * pulsePosition;
                
                ctx.beginPath();
                ctx.arc(x, y, 2, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(173, 122, 255, 0.8)';
                ctx.fill();
            });
            
            // Update and draw nodes
            brainNodesRef.current.forEach(node => {
                // Update pulse
                node.pulseValue += node.pulseSpeed * node.pulseDirection;
                if (node.pulseValue > 1 || node.pulseValue < 0) {
                    node.pulseDirection *= -1;
                }
                
                // Draw node with pulse effect
                ctx.beginPath();
                const radius = node.radius * (0.7 + node.pulseValue * 0.5);
                ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
                ctx.fillStyle = node.color;
                ctx.fill();
                
                // Add glow effect
                ctx.beginPath();
                ctx.arc(node.x, node.y, radius * 2, 0, Math.PI * 2);
                const gradient = ctx.createRadialGradient(
                    node.x, node.y, radius,
                    node.x, node.y, radius * 2
                );
                gradient.addColorStop(0, `rgba(173, 122, 255, ${0.2 * node.pulseValue})`);
                gradient.addColorStop(1, 'rgba(173, 122, 255, 0)');
                ctx.fillStyle = gradient;
                ctx.fill();
                
                // Move node
                node.x += Math.cos(node.angle) * node.speed;
                node.y += Math.sin(node.angle) * node.speed;
                
                // Boundary check with wrapping
                if (node.x < -50) node.x = canvas.width + 50;
                if (node.x > canvas.width + 50) node.x = -50;
                if (node.y < -50) node.y = canvas.height + 50;
                if (node.y > canvas.height + 50) node.y = -50;
                
                // Randomly change direction occasionally
                if (Math.random() < 0.01) {
                    node.angle += (Math.random() - 0.5) * Math.PI * 0.25;
                }
            });
            
            animationFrameRef.current = requestAnimationFrame(animate);
        }
        
        return () => {
            window.removeEventListener('resize', setCanvasDimensions);
            cancelAnimationFrame(animationFrameRef.current);
        };
    }, []);

    return (
        <div className="ai-head-container">
            <div className="ai-head-outline">
                <div className="ai-eye left"></div>
                <div className="ai-eye right"></div>
                <div className="ai-mouth"></div>
            </div>
            <canvas ref={canvasRef} className="brain-animation"></canvas>
        </div>
    );
};

export default AIHead; 