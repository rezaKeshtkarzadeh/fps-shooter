import * as THREE from 'three';

/**
 * Creates high-contrast tactical greybox procedural canvas textures
 * with zero external asset dependencies.
 */
function createGridTexture(
  bgColor: string,
  lineColor: string,
  gridSize: number = 64,
  lineWidth: number = 2
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  // Background
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, 512, 512);

  // Sub-grid lines
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();

  for (let x = 0; x <= 512; x += gridSize) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 512);
  }
  for (let y = 0; y <= 512; y += gridSize) {
    ctx.moveTo(0, y);
    ctx.lineTo(512, y);
  }
  ctx.stroke();

  // Major accent border
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = lineWidth * 2;
  ctx.strokeRect(0, 0, 512, 512);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createGreyboxMaterials() {
  // 1. Floor Material (Dark Tactical Grey with subtle grid)
  const floorTex = createGridTexture('#1e2022', '#33383d', 64, 2);
  floorTex.repeat.set(60, 60);
  const floorMaterial = new THREE.MeshStandardMaterial({
    map: floorTex,
    roughness: 0.85,
    metalness: 0.1,
  });

  // 2. Wall Material (Industrial slate grey)
  const wallTex = createGridTexture('#2c3036', '#474f57', 64, 3);
  wallTex.repeat.set(8, 2);
  const wallMaterial = new THREE.MeshStandardMaterial({
    map: wallTex,
    roughness: 0.75,
    metalness: 0.2,
  });

  // 3. Walkable Ramp & Stairs Material (Cement / Military Concrete)
  const stairTex = createGridTexture('#3d434a', '#5f6874', 64, 3);
  stairTex.repeat.set(2, 2);
  const stairMaterial = new THREE.MeshStandardMaterial({
    map: stairTex,
    roughness: 0.65,
    metalness: 0.15,
  });

  // 4. Steep Slide Ramp Material (Caution Amber/Hazard - highlights non-climbable slope)
  const slideTex = createGridTexture('#6b361b', '#d97706', 64, 4);
  slideTex.repeat.set(2, 4);
  const slideMaterial = new THREE.MeshStandardMaterial({
    map: slideTex,
    roughness: 0.5,
    metalness: 0.3,
  });

  // 5. Obstacle / Box Material (Tactical Khaki/Olive)
  const boxTex = createGridTexture('#283329', '#445746', 64, 3);
  boxTex.repeat.set(1, 1);
  const boxMaterial = new THREE.MeshStandardMaterial({
    map: boxTex,
    roughness: 0.7,
    metalness: 0.2,
  });

  return {
    floorMaterial,
    wallMaterial,
    stairMaterial,
    slideMaterial,
    boxMaterial,
  };
}
