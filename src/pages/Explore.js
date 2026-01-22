import React from 'react';
import '../styles/Explore.css';
import CosmicBackground from '../components/CosmicBackground';

const Explore = () => {
  return (
    <div className="explore-page">
      <CosmicBackground />
      
      {/* Main Title */}
      <div className="explore-header">
        <h1 className="explore-title">EXPLORE</h1>
      </div>

      {/* Content will go here */}
      <div className="explore-content">
        {/* Content sections will be added here */}
      </div>
    </div>
  );
};

export default Explore;
