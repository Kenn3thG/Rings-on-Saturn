// ===== BASIC SETUP =====
const canvas = document.getElementById("saturnCanvas");
const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  55, // slightly narrower FOV for a more cinematic feel
  window.innerWidth / window.innerHeight,
  0.1,
  5000
);
camera.position.set(0, 5.5, 12);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true
});
renderer.setSize(window.innerWidth, window.innerHeight);

// higher pixel ratio but clamped for performance
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

// physically based + filmic tone mapping for “rendered” look
renderer.physicallyCorrectLights = true;
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.35;

renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;


// ===== LIGHTING =====
const sunlight = new THREE.DirectionalLight(0xffffff, 2.8);
sunlight.position.set(-120, 40, 120);
sunlight.castShadow = true;

// sharper, higher‑quality shadows
sunlight.shadow.mapSize.set(2048, 2048);
sunlight.shadow.camera.near = 10;
sunlight.shadow.camera.far = 400;
sunlight.shadow.camera.left = -80;
sunlight.shadow.camera.right = 80;
sunlight.shadow.camera.top = 80;
sunlight.shadow.camera.bottom = -80;

scene.add(sunlight);

scene.add(new THREE.AmbientLight(0xffffff, 0.10));


// ===== SUN =====
const sunGeo = new THREE.SphereGeometry(0.45, 64, 64);
const sunMat = new THREE.MeshStandardMaterial({
  color: 0xfff2c7,
  emissive: 0xffd27f,
  emissiveIntensity: 8,
  roughness: 0.2,
  metalness: 0.0
});
const sunMesh = new THREE.Mesh(sunGeo, sunMat);
sunMesh.position.copy(sunlight.position);
scene.add(sunMesh);


// ===== SATURN =====
const textureLoader = new THREE.TextureLoader();
const saturnTexture = textureLoader.load("saturn.jpg");
saturnTexture.encoding = THREE.sRGBEncoding;

const saturnGeo = new THREE.SphereGeometry(1.5, 96, 96); // more segments for smoother shading
const saturnMat = new THREE.MeshStandardMaterial({
  map: saturnTexture,
  roughness: 0.88,
  metalness: 0.0
});
const saturn = new THREE.Mesh(saturnGeo, saturnMat);
saturn.castShadow = true;
saturn.receiveShadow = true;
saturn.rotation.x = 0.35;
saturn.rotation.z = 0.25;
scene.add(saturn);


// ===== ATMOSPHERE =====
const atmosphereGeo = new THREE.SphereGeometry(1.55, 64, 64);
const atmosphereMat = new THREE.ShaderMaterial({
  uniforms: {
    lightDirection: { value: sunlight.position.clone().normalize() },
    atmosphereColor: { value: new THREE.Color(0xbbe7ff) },
    intensity: { value: 1.25 },
    cameraPos: { value: camera.position }
  },
  vertexShader: `
    varying vec3 vNormalW;
    varying vec3 vPosW;

    void main() {
      vNormalW = normalize(mat3(modelMatrix) * normal);
      vec4 worldPos = modelMatrix * vec4(position, 1.0);
      vPosW = worldPos.xyz;
      gl_Position = projectionMatrix * viewMatrix * worldPos;
    }
  `,
  fragmentShader: `
    uniform vec3 lightDirection;
    uniform vec3 atmosphereColor;
    uniform float intensity;
    uniform vec3 cameraPos;

    varying vec3 vNormalW;
    varying vec3 vPosW;

    void main() {
      float diffuse = max(dot(vNormalW, normalize(lightDirection)), 0.0);
      vec3 viewDir = normalize(cameraPos - vPosW);
      float rim = pow(1.0 - max(dot(vNormalW, viewDir), 0.0), 2.0);
      float glow = diffuse * 0.6 + rim * 0.9;
      gl_FragColor = vec4(atmosphereColor * glow * intensity, glow * 0.65);
    }
  `,
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false
});
const atmosphere = new THREE.Mesh(atmosphereGeo, atmosphereMat);
scene.add(atmosphere);


// ===== PNG RINGS =====
function fixRingUV(geometry) {
  const pos = geometry.attributes.position;
  const uv = geometry.attributes.uv;

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const r = Math.sqrt(x * x + y * y);
    const u = (r - 2.0) / (4.2 - 2.0);
    const v = (Math.atan2(y, x) + Math.PI) / (2 * Math.PI);
    uv.setXY(i, u, v);
  }
  uv.needsUpdate = true;
}

const ringGeo = new THREE.RingGeometry(2.0, 4.2, 256);
fixRingUV(ringGeo);
ringGeo.rotateX(-Math.PI / 2);

const ringTexture = textureLoader.load("saturn_rings.png");
ringTexture.encoding = THREE.sRGBEncoding;

const ringMat = new THREE.MeshStandardMaterial({
  map: ringTexture,
  transparent: true,
  opacity: 1.0,
  side: THREE.DoubleSide,
  roughness: 0.55,
  metalness: 0.0,
  emissive: new THREE.Color(0x443322),
  emissiveIntensity: 0.18,
  alphaTest: 0.12,
  depthWrite: false
});

const rings = new THREE.Mesh(ringGeo, ringMat);
rings.rotation.x = 0.6;
rings.rotation.z = 0.25;
rings.castShadow = true;
scene.add(rings);


// ===== VOLUMETRIC RINGS (YOUR ORIGINAL SYSTEM) =====
function createVolumetricRings() {
  const particleCount = 18000;

  const positions = new Float32Array(particleCount * 3);
  const sizes = new Float32Array(particleCount);
  const brightness = new Float32Array(particleCount);

  for (let i = 0; i < particleCount; i++) {
    const i3 = i * 3;
    const radius = 2.0 + Math.random() * (4.2 - 2.0);
    const angle = Math.random() * Math.PI * 2;

    positions[i3]     = Math.cos(angle) * radius;
    positions[i3 + 1] = 0.0;
    positions[i3 + 2] = Math.sin(angle) * radius;

    sizes[i] = Math.random() * 0.025 + 0.01;
    brightness[i] = 0.45 + Math.random() * 0.55;
  }

  const volGeo = new THREE.BufferGeometry();
  volGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  volGeo.setAttribute("size", new THREE.BufferAttribute(sizes, 1));
  volGeo.setAttribute("brightness", new THREE.BufferAttribute(brightness, 1));

  const ringTint = new THREE.Color(0xd8c7a3);

  const volMat = new THREE.ShaderMaterial({
    uniforms: { tint: { value: ringTint }},
    vertexShader: `
      attribute float size;
      attribute float brightness;
      varying float vBrightness;

      void main() {
        vBrightness = brightness;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * (300.0 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 tint;
      varying float vBrightness;

      void main() {
        float d = length(gl_PointCoord - vec2(0.5));
        if (d > 0.5) discard;
        float alpha = (1.0 - d * 2.0) * vBrightness;
        gl_FragColor = vec4(tint * vBrightness, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });

  const ringParticles = new THREE.Points(volGeo, volMat);
  ringParticles.rotation.x = rings.rotation.x;
  ringParticles.rotation.z = rings.rotation.z;
  ringParticles.position.y = 0.001;
  scene.add(ringParticles);

  return ringParticles;
}

const volumetricRings = createVolumetricRings();


// ===== NEW CINEMATIC STARFIELD (MEDIUM BRIGHTNESS) =====
function createStarLayer(count, radius, sizeMin, sizeMax, brightnessMin, brightnessMax) {
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const baseBrightness = new Float32Array(count);
  const twinkleSpeed = new Float32Array(count);
  const colors = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    const i3 = i * 3;

    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);

    positions[i3]     = radius * Math.sin(phi) * Math.cos(theta);
    positions[i3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
    positions[i3 + 2] = radius * Math.cos(phi);

    sizes[i] = Math.random() * (sizeMax - sizeMin) + sizeMin;
    baseBrightness[i] = Math.random() * (brightnessMax - brightnessMin) + brightnessMin;

    twinkleSpeed[i] = Math.random() * 0.6 + 0.2;

    const r = 0.75 + Math.random() * 0.25;
    const g = 0.75 + Math.random() * 0.25;
    const b = 0.85 + Math.random() * 0.35;

    colors[i3]     = r;
    colors[i3 + 1] = g;
    colors[i3 + 2] = b;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("size", new THREE.BufferAttribute(sizes, 1));
  geo.setAttribute("baseBrightness", new THREE.BufferAttribute(baseBrightness, 1));
  geo.setAttribute("twinkleSpeed", new THREE.BufferAttribute(twinkleSpeed, 1));
  geo.setAttribute("starColor", new THREE.BufferAttribute(colors, 3));

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 }
    },
    vertexShader: `
      attribute float size;
      attribute float baseBrightness;
      attribute float twinkleSpeed;
      attribute vec3 starColor;

      varying float vBrightness;
      varying vec3 vColor;

      uniform float time;

      void main() {
        float twinkle = sin(time * twinkleSpeed + baseBrightness * 10.0) * 0.25 + 0.75;
        vBrightness = baseBrightness * twinkle;

        vColor = starColor * vBrightness;

        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        float dist = -mvPosition.z;

        gl_PointSize = size * (1200.0 / dist);
        gl_PointSize = max(gl_PointSize, size * 1.0);

        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      varying float vBrightness;
      varying vec3 vColor;

      void main() {
        vec2 c = gl_PointCoord - vec2(0.5);
        float d = length(c);

        if (d > 0.5) discard;

        float halo = smoothstep(0.5, 0.0, d);

        float alpha = halo * vBrightness;

        gl_FragColor = vec4(vColor, alpha);
      }
    `,
    transparent: true,
    depthWrite: false
  });

  const stars = new THREE.Points(geo, mat);
  scene.add(stars);

  return stars;
}

const starLayerNear = createStarLayer(3500, 260, 1.4, 2.0, 0.38, 0.62);
const starLayerMid  = createStarLayer(4500, 360, 1.0, 1.6, 0.32, 0.52);
const starLayerFar  = createStarLayer(5500, 480, 0.8, 1.2, 0.22, 0.38);


// ===== CAMERA CONTROL =====
let isDragging = false;
let lastX = 0;
let lastY = 0;

let yaw = 0;
let pitch = 0;

let autoOrbitAngle = 0;
let userLastMovedTime = 0;
let userOverride = false;

let blendFactor = 0;

canvas.addEventListener("mousedown", (e) => {
  isDragging = true;
  lastX = e.clientX;
  lastY = e.clientY;
  userOverride = true;
  userLastMovedTime = performance.now();
});

window.addEventListener("mouseup", () => {
  isDragging = false;
  userLastMovedTime = performance.now();
});

window.addEventListener("mousemove", (e) => {
  if (!isDragging) return;

  const dx = e.clientX - lastX;
  const dy = e.clientY - lastY;
  lastX = e.clientX;
  lastY = e.clientY;

  yaw   += dx * 0.005;
  pitch += dy * 0.005;

  pitch = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, pitch));

  userLastMovedTime = performance.now();
  userOverride = true;
});

function updateCamera() {
  const now = performance.now();

  if (userOverride && now - userLastMovedTime > 3000) {
    userOverride = false;
  }

  const targetBlend = userOverride ? 1 : 0;
  const blendSpeed = 0.03;
  blendFactor += (targetBlend - blendFactor) * blendSpeed;

  autoOrbitAngle += 0.002;
  const radius = 12;

  const autoX = Math.sin(autoOrbitAngle) * radius;
  const autoZ = Math.cos(autoOrbitAngle) * radius;
  const autoY = 0.5;

  const manualX = Math.sin(yaw) * Math.cos(pitch) * radius;
  const manualZ = Math.cos(yaw) * Math.cos(pitch) * radius;
  const manualY = Math.sin(pitch) * radius * 0.3 + 5.5;

  const x = THREE.MathUtils.lerp(autoX, manualX, blendFactor);
  const y = THREE.MathUtils.lerp(autoY, manualY, blendFactor);
  const z = THREE.MathUtils.lerp(autoZ, manualZ, blendFactor);

  camera.position.set(x, y, z);
  camera.lookAt(0, 0, 0);
}


// ===== ANIMATION LOOP =====
function animate() {
  requestAnimationFrame(animate);

  const now = performance.now();
  const t = now * 0.001;

  // keep atmosphere shader aware of camera
  atmosphere.material.uniforms.cameraPos.value.copy(camera.position);
  atmosphere.material.uniforms.lightDirection.value.copy(
    sunlight.position.clone().normalize()
  );

  // Saturn floating motion
  const floatY = Math.sin(now * 0.0008) * 0.15;
  saturn.position.y = floatY;
  rings.position.y = floatY;
  atmosphere.position.y = floatY;
  volumetricRings.position.y = floatY;

  // Star twinkle updates
  starLayerNear.material.uniforms.time.value = t;
  starLayerMid.material.uniforms.time.value = t;
  starLayerFar.material.uniforms.time.value = t;

  // Parallax drift for star layers
  const px = Math.sin(autoOrbitAngle) * 0.6;
  const pz = Math.cos(autoOrbitAngle) * 0.6;

  starLayerNear.position.set(px * 1.6, 0, pz * 1.6);
  starLayerMid.position.set(px * 1.0, 0, pz * 1.0);
  starLayerFar.position.set(px * 0.4, 0, pz * 0.4);

  const drift = Math.sin(t * 0.2) * 0.15;
  starLayerNear.position.x += drift * 0.4;
  starLayerMid.position.x  += drift * 0.25;
  starLayerFar.position.x  += drift * 0.1;

  // Camera update
  updateCamera();

  // Render
  renderer.render(scene, camera);
}

animate();


// ===== RESIZE HANDLER =====
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
