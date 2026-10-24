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
  // 1. Floor Material (Bright clean tactical concrete with high-visibility grid)
  const floorTex = createGridTexture('#68717d', '#8b95a2', 64, 2);
  floorTex.repeat.set(60, 60);
  const floorMaterial = new THREE.MeshStandardMaterial({
    map: floorTex,
    roughness: 0.70,
    metalness: 0.05,
  });

  // 2. Wall Material (Clean architectural modular concrete)
  const wallTex = createGridTexture('#7e8894', '#9faab7', 64, 3);
  wallTex.repeat.set(8, 2);
  const wallMaterial = new THREE.MeshStandardMaterial({
    map: wallTex,
    roughness: 0.65,
    metalness: 0.1,
  });

  // 3. Walkable Ramp & Stairs Material (High-contrast light concrete)
  const stairTex = createGridTexture('#8c96a3', '#b1bcc9', 64, 3);
  stairTex.repeat.set(2, 2);
  const stairMaterial = new THREE.MeshStandardMaterial({
    map: stairTex,
    roughness: 0.60,
    metalness: 0.1,
  });

  // 4. Steep Slide Ramp Material (Vibrant caution amber / hazard)
  const slideTex = createGridTexture('#b45309', '#f59e0b', 64, 4);
  slideTex.repeat.set(2, 4);
  const slideMaterial = new THREE.MeshStandardMaterial({
    map: slideTex,
    roughness: 0.45,
    metalness: 0.2,
  });

  // 5. Obstacle / Box Material (Crisp tactical slate containers)
  const boxTex = createGridTexture('#5c6672', '#828f9d', 64, 3);
  boxTex.repeat.set(1, 1);
  const boxMaterial = new THREE.MeshStandardMaterial({
    map: boxTex,
    roughness: 0.65,
    metalness: 0.15,
  });

  return {
    floorMaterial,
    wallMaterial,
    stairMaterial,
    slideMaterial,
    boxMaterial,
  };
}
