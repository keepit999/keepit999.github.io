import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";

const canvas = document.querySelector("#spaceScene");
const pointer = new THREE.Vector2();
const smoothedPointer = new THREE.Vector2();

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x030611, 0.028);

const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 160);
camera.position.set(0, 0.1, 8.4);

const root = new THREE.Group();
const earthGroup = new THREE.Group();
const planetGroup = new THREE.Group();
const starGroup = new THREE.Group();
scene.add(root, planetGroup, starGroup);
root.add(earthGroup);

const sunLight = new THREE.DirectionalLight(0xfff0cf, 4.8);
sunLight.position.set(-6.8, 5.1, 6.2);
scene.add(sunLight);

const rimLight = new THREE.DirectionalLight(0x9fb8d8, 0.18);
rimLight.position.set(5.5, 0.4, -4.5);
scene.add(rimLight);
scene.add(new THREE.AmbientLight(0x0b1020, 0.18));

const sun = new THREE.Group();

function createSunCoreTexture() {
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = 256;
  textureCanvas.height = 256;
  const context = textureCanvas.getContext("2d");
  const gradient = context.createRadialGradient(128, 128, 0, 128, 128, 118);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.24, "rgba(255,255,255,1)");
  gradient.addColorStop(0.48, "rgba(255,236,132,0.9)");
  gradient.addColorStop(0.72, "rgba(255,169,48,0.58)");
  gradient.addColorStop(1, "rgba(255,132,26,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 256, 256);
  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const sunCore = new THREE.Sprite(
  new THREE.SpriteMaterial({
    map: createSunCoreTexture(),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  })
);
sunCore.scale.set(1.1, 1.1, 1);
sunCore.position.z = 0.08;

function createSunRayTexture() {
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = 512;
  textureCanvas.height = 32;
  const context = textureCanvas.getContext("2d");
  const gradient = context.createLinearGradient(0, 16, 512, 16);
  gradient.addColorStop(0, "rgba(255,180,54,0)");
  gradient.addColorStop(0.18, "rgba(255,190,72,0.26)");
  gradient.addColorStop(0.54, "rgba(255,224,132,0.36)");
  gradient.addColorStop(1, "rgba(255,180,54,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 512, 32);

  const softEdge = context.createLinearGradient(0, 0, 0, 32);
  softEdge.addColorStop(0, "rgba(0,0,0,0)");
  softEdge.addColorStop(0.5, "rgba(0,0,0,1)");
  softEdge.addColorStop(1, "rgba(0,0,0,0)");
  context.globalCompositeOperation = "destination-in";
  context.fillStyle = softEdge;
  context.fillRect(0, 0, 512, 32);

  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const sunRayMaterial = new THREE.MeshBasicMaterial({
  map: createSunRayTexture(),
  transparent: true,
  opacity: 0.52,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  side: THREE.DoubleSide
});

for (let i = 0; i < 9; i += 1) {
  const angle = (Math.PI * 2 * i) / 9 + (i % 2 ? 0.08 : -0.04);
  const length = i % 3 === 0 ? 1.65 : 1.24;
  const ray = new THREE.Mesh(new THREE.PlaneGeometry(length, 0.055), sunRayMaterial);
  const distance = 0.46 + length * 0.38;
  ray.position.set(Math.cos(angle) * distance, Math.sin(angle) * distance, -0.01);
  ray.rotation.z = angle;
  sun.add(ray);
}

sun.add(sunCore);
sun.position.set(-5.35, 2.75, -2.2);
sun.scale.setScalar(1.18);
scene.add(sun);

function seeded(seed) {
  let value = seed;
  return () => {
    value = (value * 1664525 + 1013904223) % 4294967296;
    return value / 4294967296;
  };
}

function createTexture(size, painter) {
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = size;
  textureCanvas.height = size / 2;
  const context = textureCanvas.getContext("2d");
  painter(context, textureCanvas.width, textureCanvas.height);
  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function blob(context, points, color) {
  context.fillStyle = color;
  context.beginPath();
  points.forEach(([x, y], index) => {
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.closePath();
  context.fill();
}

function createEarthTexture() {
  const random = seeded(241);
  return createTexture(1400, (context, width, height) => {
    const ocean = context.createRadialGradient(width * 0.42, height * 0.36, 80, width * 0.5, height * 0.5, width * 0.68);
    ocean.addColorStop(0, "#0d6ca6");
    ocean.addColorStop(0.42, "#064a82");
    ocean.addColorStop(0.74, "#02285c");
    ocean.addColorStop(1, "#010b25");
    context.fillStyle = ocean;
    context.fillRect(0, 0, width, height);

    const forest = "#1c6f3f";
    const grass = "#4d9a47";
    const jungle = "#0f5f39";
    const desert = "#b8a165";
    const highland = "#72764d";
    const ice = "rgba(238, 248, 255, 0.94)";

    blob(context, [[88, 166], [152, 82], [260, 54], [380, 86], [478, 158], [508, 248], [450, 324], [328, 316], [264, 390], [172, 330], [120, 250]], forest);
    blob(context, [[282, 318], [362, 335], [438, 420], [418, 548], [350, 632], [294, 520], [248, 408]], grass);
    blob(context, [[458, 178], [575, 158], [690, 214], [688, 306], [590, 354], [488, 306]], desert);
    blob(context, [[608, 126], [748, 62], [900, 92], [988, 194], [938, 296], [775, 310], [650, 242]], grass);
    blob(context, [[704, 292], [842, 286], [928, 394], [878, 548], [760, 524], [694, 414]], desert);
    blob(context, [[890, 122], [1044, 76], [1226, 122], [1336, 232], [1272, 360], [1092, 382], [944, 312]], forest);
    blob(context, [[1006, 342], [1166, 382], [1268, 494], [1188, 600], [1048, 520]], grass);
    blob(context, [[1088, 198], [1200, 202], [1260, 268], [1184, 320], [1076, 286]], highland);
    blob(context, [[1214, 404], [1320, 448], [1300, 548], [1208, 532]], desert);
    blob(context, [[514, 346], [628, 365], [694, 438], [642, 512], [538, 476], [488, 402]], jungle);

    context.globalAlpha = 0.26;
    for (let i = 0; i < 2800; i += 1) {
      const x = random() * width;
      const y = random() * height;
      const radius = random() * 2.1;
      const palette = random();
      context.fillStyle = palette > 0.8 ? "#79b95e" : palette > 0.55 ? "#1a7447" : palette > 0.28 ? "#0b4e7d" : "#062e63";
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fill();
    }

    context.globalAlpha = 1;

    const topIce = context.createLinearGradient(0, 0, 0, 72);
    topIce.addColorStop(0, ice);
    topIce.addColorStop(1, "rgba(238, 248, 255, 0)");
    context.fillStyle = topIce;
    context.fillRect(0, 0, width, 74);

    const bottomIce = context.createLinearGradient(0, height - 78, 0, height);
    bottomIce.addColorStop(0, "rgba(238, 248, 255, 0)");
    bottomIce.addColorStop(1, ice);
    context.fillStyle = bottomIce;
    context.fillRect(0, height - 78, width, 78);

    context.globalAlpha = 0.22;
    context.strokeStyle = "rgba(255,255,255,0.5)";
    for (let band = 0; band < 7; band += 1) {
      const y = 78 + band * 82 + random() * 18;
      context.lineWidth = 7 + random() * 9;
      context.beginPath();
      for (let x = -80; x <= width + 80; x += 58) {
        const wave = Math.sin(x * 0.012 + band * 1.8) * 18;
        if (x === -80) context.moveTo(x, y + wave);
        else context.lineTo(x, y + wave);
      }
      context.stroke();
    }

    for (let i = 0; i < 90; i += 1) {
      const x = random() * width;
      const y = random() * height;
      const cloud = context.createRadialGradient(x, y, 3, x, y, 36 + random() * 62);
      cloud.addColorStop(0, "rgba(255,255,255,0.38)");
      cloud.addColorStop(1, "rgba(255,255,255,0)");
      context.fillStyle = cloud;
      context.beginPath();
      context.ellipse(x, y, 58 + random() * 120, 8 + random() * 20, random() * Math.PI, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
  });
}

function createCloudTexture() {
  const random = seeded(93);
  return createTexture(1400, (context, width, height) => {
    context.clearRect(0, 0, width, height);
    for (let band = 0; band < 9; band += 1) {
      const y = 55 + band * 74 + random() * 24;
      context.strokeStyle = "rgba(255,255,255,0.17)";
      context.lineWidth = 12 + random() * 22;
      context.beginPath();
      for (let x = -100; x <= width + 100; x += 64) {
        const wave = Math.sin(x * 0.012 + band * 1.6) * (18 + random() * 14);
        if (x === -100) context.moveTo(x, y + wave);
        else context.lineTo(x, y + wave);
      }
      context.stroke();
    }

    for (let i = 0; i < 230; i += 1) {
      const x = random() * width;
      const y = random() * height;
      const cloud = context.createRadialGradient(x, y, 5, x, y, 48 + random() * 80);
      cloud.addColorStop(0, "rgba(255,255,255,0.4)");
      cloud.addColorStop(1, "rgba(255,255,255,0)");
      context.fillStyle = cloud;
      context.beginPath();
      context.ellipse(x, y, 72 + random() * 170, 10 + random() * 28, random() * Math.PI, 0, Math.PI * 2);
      context.fill();
    }
  });
}

function createMoonTexture() {
  const random = seeded(17);
  return createTexture(800, (context, width, height) => {
    const base = context.createLinearGradient(0, 0, width, height);
    base.addColorStop(0, "#bfc4c8");
    base.addColorStop(0.55, "#777e87");
    base.addColorStop(1, "#353b44");
    context.fillStyle = base;
    context.fillRect(0, 0, width, height);
    for (let i = 0; i < 190; i += 1) {
      const x = random() * width;
      const y = random() * height;
      const r = 4 + random() * 24;
      context.fillStyle = `rgba(28,32,38,${0.08 + random() * 0.22})`;
      context.beginPath();
      context.arc(x, y, r, 0, Math.PI * 2);
      context.fill();
    }
  });
}

const earth = new THREE.Mesh(
  new THREE.SphereGeometry(2.15, 128, 128),
  new THREE.MeshStandardMaterial({
    map: createEarthTexture(),
    roughness: 0.68,
    metalness: 0.01
  })
);
earth.rotation.z = -0.22;

earthGroup.add(earth);

const moon = new THREE.Mesh(
  new THREE.SphereGeometry(0.48, 64, 64),
  new THREE.MeshStandardMaterial({ map: createMoonTexture(), roughness: 0.95 })
);
moon.position.set(-1.2, 1.34, -2.25);
earthGroup.add(moon);

function createPlanet({ radius, colorA, colorB, position, opacity = 0.62 }) {
  const texture = createTexture(700, (context, width, height) => {
    const gradient = context.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, colorA);
    gradient.addColorStop(1, colorB);
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
    context.globalAlpha = 0.24;
    for (let y = 0; y < height; y += 26) {
      context.fillStyle = y % 52 ? "#ffffff" : "#000000";
      context.fillRect(0, y, width, 9);
    }
    context.globalAlpha = 1;
  });
  const planet = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 48, 48),
    new THREE.MeshStandardMaterial({ map: texture, roughness: 0.86, transparent: true, opacity })
  );
  planet.position.set(position[0], position[1], position[2]);
  planetGroup.add(planet);
  return planet;
}

const planets = [
  createPlanet({ radius: 0.34, colorA: "#8a6d9f", colorB: "#252244", position: [4.9, 1.6, -7.8], opacity: 0.5 }),
  createPlanet({ radius: 0.22, colorA: "#8b4e42", colorB: "#25110f", position: [3.5, -1.55, -5.8], opacity: 0.44 }),
  createPlanet({ radius: 0.58, colorA: "#9e9472", colorB: "#332f24", position: [7.6, -0.2, -11.2], opacity: 0.38 })
];

function createStarLayer(count, radius, size, opacity, speed) {
  const random = seeded(count + Math.round(radius * 10));
  const positions = new Float32Array(count * 3);
  const twinkles = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    const theta = random() * Math.PI * 2;
    const phi = Math.acos(2 * random() - 1);
    const r = radius * (0.72 + random() * 0.42);
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);
    twinkles[i] = random() * Math.PI * 2;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aTwinkle", new THREE.BufferAttribute(twinkles, 1));
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSize: { value: size },
      uOpacity: { value: opacity }
    },
    vertexShader: `
      attribute float aTwinkle;
      uniform float uTime;
      uniform float uSize;
      varying float vAlpha;
      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        float twinkle = 0.72 + sin(uTime * 0.8 + aTwinkle) * 0.28;
        gl_PointSize = uSize * twinkle * (180.0 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
        vAlpha = twinkle;
      }
    `,
    fragmentShader: `
      uniform float uOpacity;
      varying float vAlpha;
      void main() {
        vec2 uv = gl_PointCoord - vec2(0.5);
        float d = length(uv);
        float alpha = smoothstep(0.5, 0.05, d) * uOpacity * vAlpha;
        gl_FragColor = vec4(vec3(0.88, 0.95, 1.0), alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const stars = new THREE.Points(geometry, material);
  stars.userData.speed = speed;
  starGroup.add(stars);
  return stars;
}

const starLayers = [
  createStarLayer(900, 36, 0.34, 0.72, 0.004),
  createStarLayer(1500, 64, 0.5, 0.58, 0.002),
  createStarLayer(2200, 96, 0.62, 0.38, 0.001)
];

function createDust() {
  const random = seeded(151);
  const count = 170;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    positions[i * 3] = -7 + random() * 14;
    positions[i * 3 + 1] = -4 + random() * 8;
    positions[i * 3 + 2] = 1 + random() * 8;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const dust = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      color: 0x89dfff,
      size: 0.018,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })
  );
  scene.add(dust);
  return dust;
}

const dust = createDust();

const orbit = new THREE.Mesh(
  new THREE.TorusGeometry(2.92, 0.004, 8, 224),
  new THREE.MeshBasicMaterial({
    color: 0x35e59a,
    transparent: true,
    opacity: 0.18,
    blending: THREE.AdditiveBlending
  })
);
orbit.rotation.x = 1.04;
orbit.rotation.y = -0.42;
earthGroup.add(orbit);

const satellite = new THREE.Mesh(
  new THREE.SphereGeometry(0.045, 18, 18),
  new THREE.MeshBasicMaterial({ color: 0xffd776 })
);
earthGroup.add(satellite);

let isMobile = false;
let signalBoost = 0;
let signalTarget = 0;

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  isMobile = width < 760;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();

  if (isMobile) {
    earthGroup.position.set(0.45, 1.25, -1.1);
    earthGroup.scale.setScalar(0.78);
  } else {
    earthGroup.position.set(-3.0, 0.24, -0.7);
    earthGroup.scale.setScalar(1.08);
  }
}

function animate(time) {
  const seconds = time * 0.001;
  smoothedPointer.lerp(pointer, 0.045);

  starLayers.forEach((layer) => {
    layer.material.uniforms.uTime.value = seconds;
    layer.rotation.y = seconds * layer.userData.speed + smoothedPointer.x * 0.025;
    layer.rotation.x = smoothedPointer.y * 0.014;
  });

  const drift = Math.sin(seconds * 0.22) * 0.055;
  earth.rotation.y = seconds * 0.055;
  earthGroup.rotation.z = Math.sin(seconds * 0.09) * 0.028 - 0.11;
  earthGroup.position.y += (isMobile ? 1.25 + drift - earthGroup.position.y : 0.24 + drift - earthGroup.position.y) * 0.02;

  moon.position.x = -1.2 + Math.sin(seconds * 0.11) * 0.18;
  moon.position.y = 1.34 + Math.cos(seconds * 0.08) * 0.12;
  moon.rotation.y = seconds * 0.018;
  sun.rotation.z = seconds * 0.035;

  planets.forEach((planet, index) => {
    planet.rotation.y = seconds * (0.025 + index * 0.008);
    planet.position.y += Math.sin(seconds * (0.16 + index * 0.04) + index) * 0.0009;
  });

  dust.rotation.y = seconds * 0.018;
  dust.position.x = smoothedPointer.x * -0.28;
  dust.position.y = smoothedPointer.y * -0.18;

  const satelliteAngle = seconds * 0.62;
  satellite.position.set(Math.cos(satelliteAngle) * 2.92, Math.sin(satelliteAngle) * 0.86, Math.sin(satelliteAngle) * 2.4);
  signalBoost += (signalTarget - signalBoost) * 0.05;
  orbit.material.opacity = 0.18 + signalBoost * 0.28 + Math.max(0, Math.sin(seconds * 2.4)) * signalBoost * 0.16;

  camera.position.x = smoothedPointer.x * 0.34 + Math.sin(seconds * 0.12) * 0.035;
  camera.position.y = 0.1 + smoothedPointer.y * 0.2 + Math.cos(seconds * 0.1) * 0.025;
  camera.lookAt(smoothedPointer.x * 0.15, smoothedPointer.y * 0.08, 0);

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

window.addEventListener("resize", resize);
window.addEventListener("pointermove", (event) => {
  pointer.x = (event.clientX / window.innerWidth - 0.5) * 2;
  pointer.y = -(event.clientY / window.innerHeight - 0.5) * 2;
});
window.addEventListener("wrld-scan-state", (event) => {
  signalTarget = event.detail?.running ? 1 : 0;
});
resize();
requestAnimationFrame(animate);
