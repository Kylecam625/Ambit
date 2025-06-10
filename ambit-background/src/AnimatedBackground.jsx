import React from 'react';
import './AnimatedBackground.css';

const AnimatedBackground = () => {
  // Increase the number of shapes for a denser effect
  const shapes = Array.from({ length: 15 }).map((_, i) => {
    // Randomize size, position, animation duration/delay
    const size = Math.random() * 100 + 20; // Size between 20px and 120px
    const top = Math.random() * 90 + '%'; // Avoid edges slightly
    const left = Math.random() * 90 + '%';
    const duration = Math.random() * 15 + 15; // Duration between 15s and 30s
    const delay = Math.random() * 5; // Delay up to 5s
    const type = Math.random() > 0.7 ? 'square' : 'circle'; // Add squares

    return (
      <div
        key={i}
        className={`shape shape-${i + 1} ${type}`}
        style={{
          width: `${size}px`,
          height: `${size}px`,
          top: top,
          left: left,
          animationDuration: `${duration}s`,
          animationDelay: `${delay}s`,
          // Add individual animation name if varying animations
        }}
      ></div>
    );
  });

  return (
    <div className="animated-background">
       {/* Add some line elements */}
       <div className="line line-1"></div>
       <div className="line line-2"></div>
       <div className="line line-3"></div>
       {shapes}
    </div>
  );
};

export default AnimatedBackground; 