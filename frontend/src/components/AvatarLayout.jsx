import React from 'react';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';

export function AvatarLayout({ children, controls }) {
  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden' }}>
      <div style={{ flexGrow: 1, position: 'relative' }}>
        <Canvas
          gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
          dpr={[1, 2]}
          shadows
          camera={{ fov: 30, near: 0.1, far: 100, position: [0, 1.0, 2.8] }}
          onCreated={({ gl }) => {
            gl.toneMapping = THREE.ACESFilmicToneMapping
            gl.toneMappingExposure = 1.05
          }}
          style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', background: 'transparent', zIndex: 3 }}
        >
          {children}
        </Canvas>
      </div>
      <div style={{ width: '300px', background: '#282c34', color: 'white', padding: '20px', overflowY: 'auto' }}>
        {controls}
      </div>
    </div>
  );
}
