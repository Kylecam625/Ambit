import React, { useState, useEffect } from 'react';
// import AnimatedBackground from './AnimatedBackground'; // Remove or comment out old background
import WireframeBackground from './WireframeBackground'; // Import the new background
import './App.css'; // Keep global styles

function App() {
  // Keep fullscreen state if needed for other UI elements, otherwise could be removed
  const [isFullscreen, setIsFullscreen] = useState(!!document.fullscreenElement);

  const toggleFullScreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((err) => {
        console.error(`Error attempting to enable full-screen mode: ${err.message} (${err.name})`);
      });
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  };

  // Handle fullscreen state changes and keyboard input
  useEffect(() => {
    const handleFullScreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    const handleKeyDown = (event) => {
      if (event.key === 'f' || event.key === 'F') {
        toggleFullScreen();
      }
    };

    document.addEventListener('fullscreenchange', handleFullScreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullScreenChange);
    document.addEventListener('mozfullscreenchange', handleFullScreenChange);
    document.addEventListener('MSFullscreenChange', handleFullScreenChange);
    window.addEventListener('keydown', handleKeyDown); // Listen on window for keys

    return () => {
      document.removeEventListener('fullscreenchange', handleFullScreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullScreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullScreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullScreenChange);
      window.removeEventListener('keydown', handleKeyDown); // Cleanup listener
    };
  }, []); // Empty dependency array: run setup once

  return (
    <div className="App">
      {/* <AnimatedBackground /> */}
      <WireframeBackground /> { /* Use the new background */}
      <div className="name-tag-border"></div> {/* Added border element */}

      {/* Updated text for the top red bar with Ambit in a span */}
      <div className="name-tag-header-text">
        Hello, my name is <span className="ambit-highlight">Ambit</span>
      </div>

      <div className="content">
        {/* REMOVED greeting from here, moved to top bar */}
        {/* <h3 className="greeting">Hello, my name is Ambit</h3> */}
        <h1 className="title">NERD NITE</h1>
        <div className="presenters">
          <h2 className="presenter-name">Chad Mairn</h2>
          <h2 className="presenter-name">Kyle Camuti</h2>
        </div>
        {/* Add Robot | ILab text */}
        <div className="lab-text">Robot | ILab</div>
      </div>
      {/* Ensure Button is actually removed or commented out */}
      {/* <button onClick={toggleFullScreen} className="fullscreen-button">
        {isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
      </button> */}
    </div>
  );
}

export default App;
