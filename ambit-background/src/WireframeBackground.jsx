import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';
// Import post-processing essentials
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

// Helper function to get visible dimensions at a specific z-depth
const getVisibleSizeAtZDepth = (depth, camera) => {
  const cameraOffset = camera.position.z;
  if (depth < cameraOffset) depth -= cameraOffset;
  else depth += cameraOffset;

  // Convert vertical fov to radians
  const vFOV = THREE.MathUtils.degToRad(camera.fov);

  // Visible height
  const height = 2 * Math.tan(vFOV / 2) * Math.abs(depth);
  // Visible width
  const width = height * camera.aspect;
  return { width, height };
};

const WireframeBackground = () => {
  const mountRef = useRef(null);
  const gridHelperRef = useRef(null); // Ref to hold the grid helper
  const sceneRef = useRef(null); // Ref to hold the scene

  useEffect(() => {
    const currentMount = mountRef.current;
    let animationFrameId = null;
    if (!currentMount) return;

    // Scene setup
    const scene = new THREE.Scene();
    sceneRef.current = scene; // Store scene in ref
    const camera = new THREE.PerspectiveCamera(75, currentMount.clientWidth / currentMount.clientHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ antialias: true });

    renderer.setSize(currentMount.clientWidth, currentMount.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    // No need to set clear color here, composer will handle background
    currentMount.appendChild(renderer.domElement);

    camera.position.z = 60; // Slightly further back to see more

    // Post-processing Composer
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));

    // Bloom pass for glow
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(currentMount.clientWidth, currentMount.clientHeight),
      0.7, // Slightly increased bloom strength
      0.5, // Slightly increased radius
      0.55 // Slightly lower threshold to catch more glow
    );
    composer.addPass(bloomPass);

    // --- Elements ---
    const objects = [];
    const greenMaterial = new THREE.MeshBasicMaterial({
        color: 0x00ff00,
        wireframe: true,
    });

    // Add wireframe geometries
    const geometryCube = new THREE.BoxGeometry(10, 10, 10);
    const geometryTetra = new THREE.TetrahedronGeometry(8);
    const geometryIco = new THREE.IcosahedronGeometry(9);
    const geometryTorusKnot = new THREE.TorusKnotGeometry(7, 1.5, 100, 12); // Added TorusKnot

    for (let i = 0; i < 25; i++) { // Slightly more objects
        let geometry;
        const randGeom = Math.random();
        if (randGeom < 0.25) {
            geometry = geometryCube;
        } else if (randGeom < 0.5) {
            geometry = geometryTetra;
        } else if (randGeom < 0.75) {
            geometry = geometryIco;
        } else {
            geometry = geometryTorusKnot; // Use new geometry
        }

        const mesh = new THREE.Mesh(geometry, greenMaterial);

        // Start objects closer to the center
        mesh.position.x = (Math.random() - 0.5) * 80;
        mesh.position.y = (Math.random() - 0.5) * 80;
        mesh.position.z = (Math.random() - 0.5) * 80;

        mesh.rotation.x = Math.random() * 2 * Math.PI;
        mesh.rotation.y = Math.random() * 2 * Math.PI;

        mesh.userData.velocity = new THREE.Vector3(
            (Math.random() - 0.5) * 0.15, // Slightly slower base speed
            (Math.random() - 0.5) * 0.15,
            (Math.random() - 0.5) * 0.15
        );
        mesh.userData.rotationSpeed = new THREE.Vector3(
            (Math.random() - 0.5) * 0.008,
            (Math.random() - 0.5) * 0.008,
            (Math.random() - 0.5) * 0.008
        );

        scene.add(mesh);
        objects.push(mesh);
    }

    // --- Dynamic Grid Helper ---
    const gridZPosition = -50;
    const createOrUpdateGrid = () => {
        if (!sceneRef.current) return; // Ensure scene exists

        // Remove old grid if it exists
        if (gridHelperRef.current) {
            sceneRef.current.remove(gridHelperRef.current);
            gridHelperRef.current.geometry.dispose();
            // gridHelperRef.current.material.dispose(); // Material is shared or basic, maybe not needed
            gridHelperRef.current = null;
        }

        const visibleSize = getVisibleSizeAtZDepth(gridZPosition, camera);
        const gridSize = Math.max(visibleSize.width, visibleSize.height) * 1.1; // Make slightly larger than viewport
        const divisions = Math.floor(gridSize / 10); // Keep cells roughly 10x10 units

        const gridHelper = new THREE.GridHelper(gridSize, divisions, 0x00ff00, 0x008800);
        gridHelper.position.z = gridZPosition;
        gridHelper.rotation.x = Math.PI / 2;
        gridHelper.material.opacity = 0.15;
        gridHelper.material.transparent = true;
        sceneRef.current.add(gridHelper);
        gridHelperRef.current = gridHelper; // Store new grid in ref
    }

    createOrUpdateGrid(); // Create initial grid

    // Add animated lines (like a grid or matrix effect)
    const lineMaterial = new THREE.LineBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0.2 });
    const points = [];
    const lineCount = 20; // Even fewer persistent lines
    const lineLength = 200;
    for(let i = 0; i < lineCount; i++) {
        const x = (Math.random() - 0.5) * lineLength;
        const y = (Math.random() - 0.5) * lineLength;
        const z = (Math.random() - 0.5) * lineLength;
        points.push( new THREE.Vector3( x, y, z ) );
        points.push( new THREE.Vector3( x + (Math.random()-0.5)*2, y + (Math.random()-0.5)*2, z + (Math.random()-0.5)*2 ) );
    }
    const lineGeometry = new THREE.BufferGeometry().setFromPoints( points );
    const lineSegments = new THREE.LineSegments( lineGeometry, lineMaterial );
    scene.add(lineSegments);

    // --- Lightning Effect --- (adjust color/intensity for bloom)
    let lightning = null;
    const lightningMaterial = new THREE.LineBasicMaterial({
      color: 0x88ffff,
      linewidth: 2,
      transparent: true,
      opacity: 1.0
    });
    let lightningTimeoutId = null;

    function createLightning() {
      if (lightningTimeoutId) clearTimeout(lightningTimeoutId);
      if (lightning) {
        scene.remove(lightning);
        if (lightning.geometry) lightning.geometry.dispose();
      }
       const lightningPoints = [];
       const startPoint = new THREE.Vector3((Math.random() - 0.5) * 150, (Math.random() - 0.5) * 150, (Math.random() - 0.5) * 100 - 50 );
       lightningPoints.push(startPoint);
       let currentPoint = startPoint.clone();
       const segments = 5 + Math.floor(Math.random() * 5);
       for (let i = 0; i < segments; i++) {
         const nextPoint = currentPoint.clone();
         nextPoint.x += (Math.random() - 0.5) * 30;
         nextPoint.y += (Math.random() - 0.5) * 30;
         nextPoint.z += (Math.random() - 0.5) * 15;
         lightningPoints.push(nextPoint);
         if (i < segments -1) { lightningPoints.push(nextPoint); }
         currentPoint = nextPoint;
       }
       const lightningGeometry = new THREE.BufferGeometry().setFromPoints(lightningPoints);
       lightning = new THREE.LineSegments(lightningGeometry, lightningMaterial);
       lightningMaterial.opacity = 1.0;
       scene.add(lightning);
       lightningTimeoutId = setTimeout(() => {
         if (lightning && scene.children.includes(lightning)) { scene.remove(lightning); lightning = null; }
          lightningTimeoutId = null;
       }, 80 + Math.random() * 100);
     }
    let lastLightningTime = 0;
    const lightningCooldown = 400;

    // --- Animation Loop ---
    const boundary = 80; // Define boundary slightly smaller than initial spread

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const now = Date.now();

      objects.forEach(obj => {
          obj.position.add(obj.userData.velocity);
          obj.rotation.x += obj.userData.rotationSpeed.x;
          obj.rotation.y += obj.userData.rotationSpeed.y;
          obj.rotation.z += obj.userData.rotationSpeed.z;

          // Improved Boundary check: Reflect velocity and push back slightly
          if (Math.abs(obj.position.x) > boundary) {
              obj.userData.velocity.x *= -1;
              obj.position.x = Math.sign(obj.position.x) * boundary; // Push back
          }
          if (Math.abs(obj.position.y) > boundary) {
              obj.userData.velocity.y *= -1;
              obj.position.y = Math.sign(obj.position.y) * boundary;
          }
          if (Math.abs(obj.position.z) > boundary) {
              obj.userData.velocity.z *= -1;
              obj.position.z = Math.sign(obj.position.z) * boundary;
          }
      });

      // Animate existing lines
      lineMaterial.opacity = 0.1 + Math.sin(now * 0.0005) * 0.1; // Even dimmer persistent lines

      // Trigger lightning effect
      if (now - lastLightningTime > lightningCooldown && Math.random() < 0.07) {
        createLightning();
        lastLightningTime = now;
      }

      // Fade out lightning
      if (lightning) {
          lightningMaterial.opacity -= 0.08;
      }

      // Subtle camera movement (optional)
      // camera.position.x = Math.sin(now * 0.0001) * 5;
      // camera.lookAt(scene.position); // Make sure camera keeps looking at the center

      composer.render();
    };
    animate();

    // --- Resize Handling ---
    const handleResize = () => {
      if (!currentMount) return;
      const width = currentMount.clientWidth;
      const height = currentMount.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
      composer.setSize(width, height);
      // Update grid on resize
      createOrUpdateGrid();
    };
    window.addEventListener('resize', handleResize);

    // --- Cleanup ---
    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      if (lightningTimeoutId) clearTimeout(lightningTimeoutId);

      if (renderer && renderer.domElement && currentMount && currentMount.contains(renderer.domElement)) {
          currentMount.removeChild(renderer.domElement);
      }

      // Dispose objects, materials, composer
      if (lightning) {
          scene.remove(lightning);
          if (lightning.geometry) lightning.geometry.dispose();
      }
       scene.traverse((object) => {
         // Make sure to dispose grid helper geometry/material too
         if (object instanceof THREE.GridHelper || object !== lightning) {
             if (object.geometry) object.geometry.dispose();
             if (object.material) {
               if (Array.isArray(object.material)) {
                 object.material.forEach(material => material.dispose());
               } else {
                 object.material.dispose();
               }
             }
         }
       });
       // Ensure specific geometries are disposed if not caught by traverse
       geometryCube.dispose();
       geometryTetra.dispose();
       geometryIco.dispose();
       geometryTorusKnot.dispose();
       lineGeometry.dispose();

       greenMaterial.dispose();
       lineMaterial.dispose();
       lightningMaterial.dispose();

       composer.dispose();
       renderer.dispose();
    };
  }, []);

  return <div ref={mountRef} style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', zIndex: -1 }} />;
};

export default WireframeBackground; 