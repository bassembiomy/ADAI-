import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { generateGalaxyData, DEFAULT_GALAXY_PARAMS, GalaxyParameters } from './galaxyGenerator';

interface GalaxyStandbyCanvasProps {
  params?: Partial<GalaxyParameters>;
}

export const GalaxyStandbyCanvas: React.FC<GalaxyStandbyCanvasProps> = ({ params }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const mergedParams: GalaxyParameters = {
      ...DEFAULT_GALAXY_PARAMS,
      size: 0.025,
      ...params
    };

    // 1. Scene & Camera setup
    const scene = new THREE.Scene();

    const width = window.innerWidth;
    const height = window.innerHeight;

    const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 100);
    camera.position.set(0, 3.2, 5.0);
    camera.lookAt(0, 0, 0);

    // 2. Renderer setup
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: true,
        powerPreference: 'high-performance'
      });
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    } catch (e) {
      console.error('[GalaxyStandbyCanvas] Failed to create WebGLRenderer:', e);
      return;
    }

    // 3. Generate Galaxy Particles
    const galaxyData = generateGalaxyData(mergedParams);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(galaxyData.positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(galaxyData.colors, 3));

    // Create glowing circular particle texture
    let particleTexture: THREE.CanvasTexture | null = null;
    try {
      const pCanvas = document.createElement('canvas');
      pCanvas.width = 32;
      pCanvas.height = 32;
      const ctx = pCanvas.getContext('2d');
      if (ctx) {
        const rad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
        rad.addColorStop(0, 'rgba(255, 255, 255, 1)');
        rad.addColorStop(0.25, 'rgba(255, 220, 150, 0.9)');
        rad.addColorStop(0.55, 'rgba(255, 120, 30, 0.35)');
        rad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = rad;
        ctx.fillRect(0, 0, 32, 32);
        particleTexture = new THREE.CanvasTexture(pCanvas);
        particleTexture.needsUpdate = true;
      }
    } catch (e) {
      console.warn('[GalaxyStandbyCanvas] Failed to generate particle texture, using fallback:', e);
    }

    const material = new THREE.PointsMaterial({
      size: mergedParams.size,
      sizeAttenuation: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
      transparent: true,
      map: particleTexture || undefined,
      opacity: 0.95
    });

    const points = new THREE.Points(geometry, material);
    scene.add(points);

    // 4. Central Supermassive Core Flare
    const coreGeometry = new THREE.SphereGeometry(0.18, 16, 16);
    const coreMaterial = new THREE.MeshBasicMaterial({
      color: 0xfff0d0,
      transparent: true,
      opacity: 0.95
    });
    const coreMesh = new THREE.Mesh(coreGeometry, coreMaterial);
    scene.add(coreMesh);

    // 5. Mouse Parallax Handling
    let mouseX = 0;
    let mouseY = 0;
    let targetMouseX = 0;
    let targetMouseY = 0;

    const handleMouseMove = (event: MouseEvent) => {
      targetMouseX = (event.clientX / window.innerWidth - 0.5) * 1.2;
      targetMouseY = (event.clientY / window.innerHeight - 0.5) * 1.2;
    };

    window.addEventListener('mousemove', handleMouseMove);

    // 6. Responsive Resizing
    const handleResize = () => {
      if (!canvas) return;
      const newWidth = window.innerWidth;
      const newHeight = window.innerHeight;

      camera.aspect = newWidth / newHeight;
      camera.updateProjectionMatrix();

      renderer.setSize(newWidth, newHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    };

    window.addEventListener('resize', handleResize);

    // 7. Animation Loop
    let animationFrameId: number;
    const clock = new THREE.Clock();

    const animate = () => {
      const elapsedTime = clock.getElapsedTime();

      // Smooth mouse interpolation
      mouseX += (targetMouseX - mouseX) * 0.05;
      mouseY += (targetMouseY - mouseY) * 0.05;

      // Galaxy rotation & gentle dynamic tilt
      points.rotation.y = elapsedTime * 0.1;
      points.rotation.x = Math.sin(elapsedTime * 0.15) * 0.04 + mouseY * 0.25;
      points.rotation.z = Math.cos(elapsedTime * 0.12) * 0.03 + mouseX * 0.25;

      // Camera parallax orbit
      camera.position.x = Math.sin(elapsedTime * 0.04) * 0.4 + mouseX * 1.2;
      camera.position.y = 3.2 + Math.cos(elapsedTime * 0.05) * 0.25 - mouseY * 1.0;
      camera.lookAt(0, 0, 0);

      // Central core pulse
      const pulse = 1 + Math.sin(elapsedTime * 4.5) * 0.22;
      coreMesh.scale.set(pulse, pulse, pulse);

      renderer.render(scene, camera);
      animationFrameId = requestAnimationFrame(animate);
    };

    animate();

    // 8. Cleanup and Resource Disposal
    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('resize', handleResize);

      geometry.dispose();
      material.dispose();
      if (particleTexture) {
        particleTexture.dispose();
      }
      coreGeometry.dispose();
      coreMaterial.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
    />
  );
};
