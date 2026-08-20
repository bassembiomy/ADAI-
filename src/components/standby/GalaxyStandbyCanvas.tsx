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
      ...params
    };

    // 1. Scene & Camera setup
    const scene = new THREE.Scene();

    const width = canvas.parentElement?.clientWidth || window.innerWidth;
    const height = canvas.parentElement?.clientHeight || window.innerHeight;

    const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 100);
    camera.position.set(0, 3.8, 5.2);
    camera.lookAt(0, 0, 0);

    // 2. Renderer setup
    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance'
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    // 3. Generate Galaxy Particles
    const galaxyData = generateGalaxyData(mergedParams);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(galaxyData.positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(galaxyData.colors, 3));

    // Generate circular point texture to give particles a soft glowing round shape
    const particleTextureCanvas = document.createElement('canvas');
    particleTextureCanvas.width = 32;
    particleTextureCanvas.height = 32;
    const pCtx = particleTextureCanvas.getContext('2d');
    if (pCtx) {
      const gradient = pCtx.createRadialGradient(16, 16, 0, 16, 16, 16);
      gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
      gradient.addColorStop(0.2, 'rgba(255, 230, 180, 0.8)');
      gradient.addColorStop(0.5, 'rgba(255, 120, 40, 0.3)');
      gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
      pCtx.fillStyle = gradient;
      pCtx.fillRect(0, 0, 32, 32);
    }
    const particleTexture = new THREE.CanvasTexture(particleTextureCanvas);

    const material = new THREE.PointsMaterial({
      size: mergedParams.size,
      sizeAttenuation: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
      transparent: true,
      map: particleTexture,
      opacity: 0.95
    });

    const points = new THREE.Points(geometry, material);
    scene.add(points);

    // 4. Central Supermassive Core Flare
    const coreGeometry = new THREE.SphereGeometry(0.12, 16, 16);
    const coreMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.9
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
      const newWidth = canvas.parentElement?.clientWidth || window.innerWidth;
      const newHeight = canvas.parentElement?.clientHeight || window.innerHeight;

      camera.aspect = newWidth / newHeight;
      camera.updateProjectionMatrix();

      renderer.setSize(newWidth, newHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    };

    window.addEventListener('resize', handleResize);

    // 7. Animation Loop
    let animationFrameId: number;
    let clock = new THREE.Clock();

    const animate = () => {
      const elapsedTime = clock.getElapsedTime();

      // Smooth mouse interpolation
      mouseX += (targetMouseX - mouseX) * 0.04;
      mouseY += (targetMouseY - mouseY) * 0.04;

      // Galaxy rotation & gentle dynamic wobble
      points.rotation.y = elapsedTime * 0.08;
      points.rotation.x = Math.sin(elapsedTime * 0.15) * 0.05 + mouseY * 0.3;
      points.rotation.z = Math.cos(elapsedTime * 0.12) * 0.03 + mouseX * 0.3;

      // Camera parallax orbit
      camera.position.x = Math.sin(elapsedTime * 0.03) * 0.5 + mouseX * 1.5;
      camera.position.y = 3.6 + Math.cos(elapsedTime * 0.04) * 0.3 - mouseY * 1.2;
      camera.lookAt(0, 0, 0);

      // Core pulse
      const pulse = 1 + Math.sin(elapsedTime * 4) * 0.18;
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
      particleTexture.dispose();
      coreGeometry.dispose();
      coreMaterial.dispose();
      renderer.dispose();
      if (renderer.domElement && renderer.domElement.parentNode) {
        renderer.forceContextLoss();
      }
    };
  }, [params]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
    />
  );
};
