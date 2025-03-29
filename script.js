import * as THREE from 'three';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Biến tạm dùng cho tính toán nametag
const tempVector = new THREE.Vector3();
const tempVector2 = new THREE.Vector3();
const tempQuaternion = new THREE.Quaternion();
const tempColor = new THREE.Color();

// Biến toàn cục khác
let Earth, astronaut, astronauts;
let controls;
let loadingManager, textureLoader, fontLoader;
let nametagCanvas, nametagTexture;
let earthShaderMaterial;

// Dimensions
const sizes = {
    width: window.innerWidth,
    height: window.innerHeight
};

// Create a Three.js scene
const scene = new THREE.Scene();

// Add event listeners to prevent pinch zooming
document.addEventListener('touchstart', function(e) {
    if (e.touches.length > 1) {
        e.preventDefault();
    }
}, { passive: false });

document.addEventListener('gesturestart', function(e) {
    e.preventDefault();
}, { passive: false });

document.addEventListener('gesturechange', function(e) {
    e.preventDefault();
}, { passive: false });

document.addEventListener('gestureend', function(e) {
    e.preventDefault();
}, { passive: false });

// Create a camera
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.z = 2.5;

// Create a renderer with antialias
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.getElementById('earth-container').appendChild(renderer.domElement);

// Khởi tạo controls
controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.enablePan = false;

// Create Earth
const earthGeometry = new THREE.SphereGeometry(1, 64, 64);

// Define local and fallback texture URLs
const texturePaths = {
    earth: {
        local: 'assets/textures/earth_atmos_2048.jpg',
        fallback: 'https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg'
    },
    normal: {
        local: 'assets/textures/earth_normal_2048.jpg',
        fallback: 'https://threejs.org/examples/textures/planets/earth_normal_2048.jpg'
    },
    specular: {
        local: 'assets/textures/earth_specular_2048.jpg',
        fallback: 'https://threejs.org/examples/textures/planets/earth_specular_2048.jpg'
    },
    clouds: {
        local: 'assets/textures/earth_clouds_1024.png',
        fallback: 'https://threejs.org/examples/textures/planets/earth_clouds_1024.png'
    }
};

// Function to load texture with fallback
const loadTextureWithFallback = (localPath, fallbackPath) => {
    return new Promise((resolve) => {
        const textureLoader = new THREE.TextureLoader();
        
        // Try to load local texture first
        textureLoader.load(
            localPath,
            // Success callback
            (texture) => {
                console.log(`Successfully loaded texture from: ${localPath}`);
                resolve(texture);
            },
            // Progress callback
            undefined,
            // Error callback
            (error) => {
                console.warn(`Failed to load local texture from ${localPath}. Trying fallback...`, error);
                
                // Try fallback URL
                textureLoader.load(
                    fallbackPath,
                    // Success callback for fallback
                    (texture) => {
                        console.log(`Successfully loaded fallback texture from: ${fallbackPath}`);
                        resolve(texture);
                    },
                    // Progress callback
                    undefined,
                    // Error callback for fallback
                    (finalError) => {
                        console.error(`Failed to load fallback texture from ${fallbackPath}`, finalError);
                        // Return a basic texture to prevent errors
                        const canvas = document.createElement('canvas');
                        canvas.width = 128;
                        canvas.height = 128;
                        const ctx = canvas.getContext('2d');
                        ctx.fillStyle = 'white';
                        ctx.fillRect(0, 0, 128, 128);
                        const basicTexture = new THREE.CanvasTexture(canvas);
                        resolve(basicTexture);
                    }
                );
            }
        );
    });
};

// Load all textures with fallbacks
Promise.all([
    loadTextureWithFallback(texturePaths.earth.local, texturePaths.earth.fallback),
    loadTextureWithFallback(texturePaths.normal.local, texturePaths.normal.fallback),
    loadTextureWithFallback(texturePaths.specular.local, texturePaths.specular.fallback),
    loadTextureWithFallback(texturePaths.clouds.local, texturePaths.clouds.fallback)
]).then(([earthMap, earthBumpMap, earthSpecularMap, cloudsMap]) => {
    // Earth material with day/night effect
    const earthMaterial = new THREE.MeshPhongMaterial({
        map: earthMap,
        bumpMap: earthBumpMap,
        bumpScale: 0.05,
        specularMap: earthSpecularMap,
        specular: new THREE.Color(0x333333),
        shininess: 15
    });

    // Custom shader material to handle day/night transition
    const customUniforms = {
        dayTexture: { value: earthMap },
        bumpTexture: { value: earthBumpMap },
        bumpScale: { value: 0.05 },
        lightPosition: { value: new THREE.Vector3(5, 3, 5) },
        time: { value: 0.0 }
    };

    const earthShaderMaterial = new THREE.ShaderMaterial({
        uniforms: customUniforms,
        vertexShader: `
            varying vec2 vUv;
            varying vec3 vNormal;
            varying vec3 vPosition;
            
            void main() {
                vUv = uv;
                vNormal = normalize(normalMatrix * normal);
                vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform sampler2D dayTexture;
            uniform sampler2D bumpTexture;
            uniform float bumpScale;
            uniform vec3 lightPosition;
            uniform float time;
            
            varying vec2 vUv;
            varying vec3 vNormal;
            varying vec3 vPosition;
            
            void main() {
                vec3 lightDir = normalize(lightPosition);
                vec3 normal = normalize(vNormal);
                
                // Calculate day-night mix based on dot product of normal and light direction
                float dayNightMix = dot(normal, lightDir);
                
                // Create a sharper transition between day and night
                float transition = 0.08; // Even sharper edge
                dayNightMix = smoothstep(-transition, transition, dayNightMix);
                
                // Sample day texture
                vec4 dayColor = texture2D(dayTexture, vUv);
                
                // Make night side genuinely dark
                vec3 darkSide = vec3(0.02, 0.02, 0.05); // Very dark blue/black
                
                // Blend between night side and day side
                vec4 finalColor = mix(vec4(darkSide, 1.0), dayColor, dayNightMix);
                
                // Add atmospheric effect at edges (simple Fresnel)
                vec3 viewDir = normalize(-vPosition);
                float fresnel = 1.0 - max(dot(viewDir, normal), 0.0);
                fresnel = pow(fresnel, 3.0) * 0.6;
                
                // Add a blue atmospheric rim light, different between day and night sides
                vec3 dayAtmosphere = vec3(0.3, 0.6, 1.0);
                vec3 nightAtmosphere = vec3(0.1, 0.2, 0.5);
                vec3 atmosphereColor = mix(nightAtmosphere, dayAtmosphere, dayNightMix);
                
                finalColor.rgb += atmosphereColor * fresnel;
                
                gl_FragColor = finalColor;
            }
        `
    });

    // Create Earth mesh with the shader material
    const earth = new THREE.Mesh(earthGeometry, earthShaderMaterial);
    scene.add(earth);

    // Create clouds layer
    const cloudsGeometry = new THREE.SphereGeometry(1.01, 64, 64);
    const cloudsMaterial = new THREE.MeshPhongMaterial({
        map: cloudsMap,
        transparent: true,
        opacity: 0.4
    });
    const clouds = new THREE.Mesh(cloudsGeometry, cloudsMaterial);
    scene.add(clouds);

    // Add ambient light (reduced for better day/night contrast)
    const ambientLight = new THREE.AmbientLight(0x404040, 0.1);
    scene.add(ambientLight);

    // Add directional light (like the sun)
    const directionalLight = new THREE.DirectionalLight(0xffddaa, 1.8);
    directionalLight.position.set(5, 2, 5);
    scene.add(directionalLight);

    // Add a soft atmosphere glow
    const atmosphereGeometry = new THREE.SphereGeometry(1.02, 64, 64);
    const atmosphereMaterial = new THREE.MeshPhongMaterial({
        color: 0x9999ff,
        transparent: true,
        opacity: 0.15,
        side: THREE.BackSide
    });
    const atmosphere = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial);
    scene.add(atmosphere);

    // Create Among Us astronaut model with nametag instead of 3D text
    let astronauts;
    const gltfLoader = new GLTFLoader();
    const fontLoader = new FontLoader();
    
    // Load Among Us model
    gltfLoader.load(
        'assets/textures/among_us_blue.glb',
        (gltf) => {
            // Create a group to hold astronaut
            astronauts = new THREE.Group();
            
            // Create a single astronaut to orbit the Earth
            const orbitRadius = 2;
            
            // Clone the model
            const model = gltf.scene.clone();
            
            // Scale model down to appropriate size (50% smaller than before)
            model.scale.set(0.1, 0.1, 0.1);
            
            // Position around orbit
            model.position.set(
                Math.sin(0) * orbitRadius,
                0.3,
                Math.cos(0) * orbitRadius
            );
            
            // Make astronaut look at Earth center
            model.lookAt(0, 0, 0);
            
            // Add emissive material to make Among Us glow like a space suit
            model.traverse((child) => {
                if (child.isMesh && child.material) {
                    // Clone the material to avoid affecting other instances
                    if (Array.isArray(child.material)) {
                        child.material = child.material.map(mat => {
                            const newMat = mat.clone();
                            newMat.emissive = new THREE.Color(0x3a86ff);
                            newMat.emissiveIntensity = 0.3;
                            return newMat;
                        });
                    } else {
                        const newMat = child.material.clone();
                        newMat.emissive = new THREE.Color(0x3a86ff);
                        newMat.emissiveIntensity = 0.3;
                        child.material = newMat;
                    }
                }
            });
            
            // Add an atmospheric glow effect
            const glowGeometry = new THREE.SphereGeometry(0.15, 16, 16);
            const glowMaterial = new THREE.MeshBasicMaterial({
                color: 0x3a86ff,
                transparent: true,
                opacity: 0.2,
                side: THREE.BackSide
            });
            const glow = new THREE.Mesh(glowGeometry, glowMaterial);
            model.add(glow);
            
            // Store reference to glow for animation
            model.userData.glow = glow;
            
            // Add model to group
            astronauts.add(model);
            
            // Add nametag above astronaut
            createNametag(model);
            
            // Add small particle effects for jet propulsion
            addJetParticles(model);
            
            // Add astronauts group to scene
            scene.add(astronauts);
        },
        // Progress callback
        (xhr) => {
            console.log(`Among Us model ${(xhr.loaded / xhr.total) * 100}% loaded`);
        },
        // Error callback
        (error) => {
            console.error('Error loading Among Us model:', error);
        }
    );
    
    // Function to create nametag above astronaut
    function createNametag(astronautModel) {
        console.log("Starting to create nametag...");
        
        // Tạo một nhóm chứa nametag - nhóm này sẽ được quản lý độc lập với model
        const nametagHolder = new THREE.Object3D();
        nametagHolder.position.y = 1; // Vị trí cao hơn đầu model
        astronautModel.add(nametagHolder);
        
        // Lưu tham chiếu đến holder để cập nhật vị trí trong animation loop
        astronautModel.userData.nametagHolder = nametagHolder;
        
        fontLoader.load(
            'https://threejs.org/examples/fonts/helvetiker_bold.typeface.json',
            (font) => {
                console.log("Font loaded successfully");
                
                const textGeometry = new TextGeometry('ThaiHoangBao', {
                    font: font,
                    size: 0.12,  
                    height: 0.02, 
                    curveSegments: 12,
                    bevelEnabled: true,
                    bevelThickness: 0.004,
                    bevelSize: 0.002,
                    bevelOffset: 0,
                    bevelSegments: 5
                });
                textGeometry.center();
                
                // Create material for nametag with stronger emissive effect
                const textMaterial = new THREE.MeshPhongMaterial({ 
                    color: 0xffffff,
                    emissive: 0x8B0000, // Màu đỏ
                    emissiveIntensity: 1.0, // Độ sáng tối đa
                    shininess: 100
                });
                
                // Create text mesh
                const textMesh = new THREE.Mesh(textGeometry, textMaterial);
                
                // Thêm outline màu đen để text dễ đọc
                const outlineGeometry = textGeometry.clone();
                const outlineMaterial = new THREE.MeshBasicMaterial({
                    color: 0x000000,
                    side: THREE.BackSide
                });
                const outlineMesh = new THREE.Mesh(outlineGeometry, outlineMaterial);
                outlineMesh.scale.multiplyScalar(1.1); // Viền dày
                textMesh.add(outlineMesh);
                
                // Add a pointlight to make the nametag glow
                const nameLight = new THREE.PointLight(0xff0000, 1.5, 1.0);
                nameLight.position.set(0, 0.1, 0);
                textMesh.add(nameLight);
                
                // Add text to the holder (không phải trực tiếp vào model)
                nametagHolder.add(textMesh);
                
                // Store references for animation
                astronautModel.userData.nametagMesh = textMesh;
                astronautModel.userData.nametagLight = nameLight;
                
                console.log("Nametag created successfully and added to model");
            },
            // Progress callback
            (xhr) => {
                console.log(`Font loading: ${(xhr.loaded / xhr.total) * 100}% loaded`);
            },
            // Error callback
            (error) => {
                console.error('Error loading font for nametag:', error);
                
                // Fallback to create a simple nametag without font
                createSimpleNametag(astronautModel, nametagHolder);
            }
        );
    }
    
    // Create a simple nametag without fancy font as fallback
    function createSimpleNametag(astronautModel, nametagHolder) {
        console.log("Creating simple fallback nametag");
        
        // Create a canvas to draw text
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 64;
        const context = canvas.getContext('2d');
        
        // Draw text on canvas
        context.fillStyle = 'black';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.font = 'bold 36px Arial';
        context.fillStyle = 'red';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText('ThaiHoangBao', canvas.width / 2, canvas.height / 2);
        
        // Create a texture from the canvas
        const texture = new THREE.CanvasTexture(canvas);
        
        // Create a plane geometry for the nametag
        const nametagGeometry = new THREE.PlaneGeometry(0.5, 0.125);
        const nametagMaterial = new THREE.MeshBasicMaterial({ 
            map: texture,
            transparent: true,
            side: THREE.DoubleSide
        });
        
        // Create nametag mesh
        const nametagMesh = new THREE.Mesh(nametagGeometry, nametagMaterial);
        
        // Add to the holder (không phải trực tiếp vào model)
        nametagHolder.add(nametagMesh);
        
        // Store reference for animation
        astronautModel.userData.nametagMesh = nametagMesh;
    }

    // Function to add jet particle effects
    function addJetParticles(astronautModel) {
        // Create a simple particle system for jet propulsion effect
        const particleCount = 20;
        const particleGeometry = new THREE.BufferGeometry();
        const particlePositions = new Float32Array(particleCount * 3);
        
        // Set initial positions in a small area below the astronaut
        for (let i = 0; i < particleCount; i++) {
            const i3 = i * 3;
            particlePositions[i3] = (Math.random() - 0.5) * 0.05;
            particlePositions[i3 + 1] = (Math.random() - 0.5) * 0.05 - 0.1; // Below the astronaut
            particlePositions[i3 + 2] = (Math.random() - 0.5) * 0.05;
        }
        
        particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
        
        // Create a particle material with a soft glow
        const particleMaterial = new THREE.PointsMaterial({
            color: 0x3a86ff,
            size: 0.01,
            transparent: true,
            opacity: 0.6,
            blending: THREE.AdditiveBlending
        });
        
        // Create the particle system
        const particles = new THREE.Points(particleGeometry, particleMaterial);
        
        // Add to astronaut and store reference for animation
        astronautModel.add(particles);
        astronautModel.userData.jetParticles = particles;
        astronautModel.userData.particlePositions = particlePositions;
    }

    // Variables for rotation
    let targetRotationY = 0;
    let targetRotationX = 0;
    let currentRotationY = 0;
    let currentRotationX = 0;
    let lastScrollY = window.scrollY;
    let lastTime = Date.now();
    // Add quaternion variables for smooth rotation
    let targetQuaternion = new THREE.Quaternion();
    let currentQuaternion = new THREE.Quaternion();

    // Auto-rotation variables
    let isAutoRotating = true;
    let autoRotationSpeed = 0.00005; // Base rotation speed when idle
    let scrollBoostSpeed = 0.00015; // Speed boost when scrolling
    let scrollRotationBoost = 0; // Additional rotation from scrolling
    let scrollBoostDecay = 0.95; // How quickly scroll boost fades
    let lastInteractionTime = Date.now();
    const AUTO_ROTATION_DELAY = 3000; // Wait 3 seconds after last interaction to start auto-rotation again

    // Handle window resize
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    });

    // Function to temporarily disable auto-rotation when user interacts
    function disableAutoRotation() {
        isAutoRotating = false;
        lastInteractionTime = Date.now();
    }

    // Handle scroll for rotation
    window.addEventListener('scroll', () => {
        const scrollDiff = window.scrollY - lastScrollY;
        scrollRotationBoost += scrollDiff * scrollBoostSpeed;
        lastScrollY = window.scrollY;
        disableAutoRotation();
    });

    // Handle mouse wheel for additional rotation
    window.addEventListener('wheel', (event) => {
        targetRotationY += event.deltaY * 0.0005;
        targetRotationX += event.deltaX * 0.0005;
        disableAutoRotation();
    });

    // Handle mouse drag interaction
    let isDragging = false;
    let previousMousePosition = { x: 0, y: 0 };
    let isZooming = false;
    let zoomTarget = new THREE.Vector3();
    let initialCameraPosition = new THREE.Vector3(0, 0, 2.5);
    let targetCameraPosition = new THREE.Vector3(0, 0, 2.5);
    // Add variables to handle zoom animation state
    let zoomStartTime = 0;
    let zoomDuration = 1000; // 1 second for zoom animation
    let zoomEasing = true;

    // Add constants for camera constraints
    const MIN_CAMERA_DISTANCE = 1.5;
    const MAX_CAMERA_DISTANCE = 3.0;
    const DEFAULT_CAMERA_DISTANCE = 2.5;

    // Setup raycaster for detecting clicks on the globe
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    // Create visible stars in the background
    const createStars = () => {
        // Create a simple circular texture for stars
        const canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 32;
        
        const context = canvas.getContext('2d');
        
        // Draw a simple white circle with gradient
        const gradient = context.createRadialGradient(16, 16, 0, 16, 16, 16);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
        gradient.addColorStop(0.2, 'rgba(240, 248, 255, 0.8)');
        gradient.addColorStop(0.5, 'rgba(240, 240, 255, 0.5)');
        gradient.addColorStop(1, 'rgba(240, 240, 255, 0)');
        
        context.fillStyle = gradient;
        context.beginPath();
        context.arc(16, 16, 16, 0, Math.PI * 2);
        context.fill();
        
        // Create texture from canvas
        const starTexture = new THREE.CanvasTexture(canvas);
        
        // Create a star field with twinkling effect
        const starsGeometry = new THREE.BufferGeometry();
        const starsMaterial = new THREE.PointsMaterial({
            color: 0xffffff,
            size: 0.3,
            map: starTexture,
            transparent: true,
            alphaTest: 0.01,
            sizeAttenuation: true,
            blending: THREE.AdditiveBlending,
        });
        
        const starsCount = 1500;
        const positions = new Float32Array(starsCount * 3);
        const sizes = new Float32Array(starsCount);
        const colors = new Float32Array(starsCount * 3);
        const starSpeeds = new Float32Array(starsCount);
        
        for (let i = 0; i < starsCount; i++) {
            const i3 = i * 3;
            
            // Position stars in a sphere around the center
            const radius = 30 + Math.random() * 20;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            
            positions[i3] = radius * Math.sin(phi) * Math.cos(theta);
            positions[i3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
            positions[i3 + 2] = radius * Math.cos(phi);
            
            // Random sizes for stars
            sizes[i] = 0.1 + Math.random() * 0.9;
            
            // Slightly different colors for stars
            const hue = Math.random() * 0.1 + 0.6; // Blue to white
            const color = new THREE.Color().setHSL(hue, 0.2, 0.8);
            colors[i3] = color.r;
            colors[i3 + 1] = color.g;
            colors[i3 + 2] = color.b;
            
            // Random speeds for twinkling
            starSpeeds[i] = 0.01 + Math.random() * 0.04;
        }
        
        starsGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        starsGeometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
        starsGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        
        // Store speed data for animation
        starsGeometry.userData = { 
            speeds: starSpeeds,
            time: 0,
            originalSizes: sizes.slice()
        };
        
        const stars = new THREE.Points(starsGeometry, starsMaterial);
        scene.add(stars);
        
        return stars;
    };

    // Add stars to the scene with twinkling effect
    const stars = createStars();

    document.addEventListener('mousedown', (event) => {
        // Set mouse position for raycaster
        mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
        
        disableAutoRotation();
        
        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObject(earth);
        
        if (event.button === 0) { // Left click
            // Start dragging regardless of zoom state
            isDragging = true;
            previousMousePosition = {
                x: event.clientX,
                y: event.clientY
            };
            
            // If not zoomed and clicking on the globe, zoom in
            if (!isZooming && intersects.length > 0) {
                isZooming = true;
                // Get the point of intersection
                const point = intersects[0].point;
                // Store a normalized vector pointing from center to intersection
                zoomTarget.copy(point).normalize();
                // Set target position for camera (closer to the globe in the direction of clicked point)
                targetCameraPosition.copy(zoomTarget).multiplyScalar(MIN_CAMERA_DISTANCE);
                
                // Calculate rotation to look at the point
                targetQuaternion.setFromUnitVectors(
                    new THREE.Vector3(0, 0, 1), 
                    zoomTarget
                );
                
                // Reset animation timer
                zoomStartTime = Date.now();
            }
        } else if (event.button === 2) { // Right click
            // Reset to original position
            if (isZooming) {
                isZooming = false;
                targetCameraPosition.copy(initialCameraPosition);
                // Reset to standard rotation logic when zooming out
                earth.quaternion.identity();
                clouds.quaternion.identity();
                atmosphere.quaternion.identity();
            }
        }
    });

    document.addEventListener('mousemove', (event) => {
        if (isDragging) {
            const deltaMove = {
                x: event.clientX - previousMousePosition.x,
                y: event.clientY - previousMousePosition.y
            };
            
            if (isZooming) {
                // When zoomed in, rotate around the point using quaternions
                const rotationSpeed = 0.003;
                const rotationX = new THREE.Quaternion().setFromAxisAngle(
                    new THREE.Vector3(0, 1, 0), 
                    deltaMove.x * rotationSpeed
                );
                const rotationY = new THREE.Quaternion().setFromAxisAngle(
                    new THREE.Vector3(1, 0, 0), 
                    -deltaMove.y * rotationSpeed
                );
                
                // Apply rotations to target quaternion
                targetQuaternion.premultiply(rotationX).premultiply(rotationY);
            } else {
                // When not zoomed, use the regular rotation
                targetRotationY += deltaMove.x * 0.003;
                targetRotationX -= deltaMove.y * 0.003;
            }
            
            previousMousePosition = {
                x: event.clientX,
                y: event.clientY
            };
        }
    });

    document.addEventListener('mouseup', () => {
        isDragging = false;
    });

    // Prevent context menu on right-click
    document.addEventListener('contextmenu', (event) => {
        event.preventDefault();
    });

    // Animation loop
    function animate() {
        requestAnimationFrame(animate);
        
        const currentTime = Date.now();
        const deltaTime = currentTime - lastTime;
        lastTime = currentTime;
        
        // Animate stars twinkling
        if (stars && stars.geometry) {
            const geometry = stars.geometry;
            const originalSizes = geometry.userData.originalSizes;
            const speeds = geometry.userData.speeds;
            geometry.userData.time += deltaTime * 0.001;
            
            const sizes = geometry.attributes.size.array;
            for (let i = 0; i < sizes.length; i++) {
                // Create twinkling effect with sine wave
                const phase = geometry.userData.time * speeds[i];
                const scale = 0.5 + Math.sin(phase * 5) * 0.5;
                sizes[i] = originalSizes[i] * scale;
            }
            
            geometry.attributes.size.needsUpdate = true;
            
            // Rotate stars slowly in the opposite direction of earth rotation
            // This creates the illusion that the stars are fixed and the earth is rotating
            stars.rotation.y = -currentRotationY * 0.1;
        }
        
        // Check if we should resume auto-rotation
        if (!isAutoRotating && currentTime - lastInteractionTime > AUTO_ROTATION_DELAY && !isZooming && !isDragging) {
            isAutoRotating = true;
        }
        
        if (isZooming) {
            // Use quaternion for smooth rotation when zoomed in
            const zoomProgress = Math.min((currentTime - zoomStartTime) / zoomDuration, 1.0);
            let t = zoomProgress;
            
            if (zoomEasing) {
                t = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
            }
            
            // Smoothly interpolate camera position with distance constraints
            camera.position.lerp(targetCameraPosition, 0.05);
            
            // Ensure camera doesn't get too close or too far
            const distance = camera.position.length();
            if (distance < MIN_CAMERA_DISTANCE) {
                camera.position.normalize().multiplyScalar(MIN_CAMERA_DISTANCE);
            } else if (distance > MAX_CAMERA_DISTANCE) {
                camera.position.normalize().multiplyScalar(MAX_CAMERA_DISTANCE);
            }
            
            // Smoothly rotate to look at the target point
            earth.quaternion.slerp(targetQuaternion, 0.05);
            clouds.quaternion.copy(earth.quaternion);
            atmosphere.quaternion.copy(earth.quaternion);
        } else {
            // Always apply base auto-rotation
            targetRotationY += autoRotationSpeed * deltaTime;
            
            // Apply and decay scroll boost
            targetRotationY += scrollRotationBoost;
            scrollRotationBoost *= scrollBoostDecay;
            if (Math.abs(scrollRotationBoost) < 0.0001) {
                scrollRotationBoost = 0;
            }
            
            // Update rotations with smooth easing when not zoomed
            currentRotationY += (targetRotationY - currentRotationY) * 0.1;
            currentRotationX += (targetRotationX - currentRotationX) * 0.1;
            
            // Limit vertical rotation to prevent flipping
            currentRotationX = Math.max(Math.min(currentRotationX, Math.PI / 4), -Math.PI / 4);
            
            // Apply rotations to Earth, clouds, and atmosphere
            earth.rotation.y = currentRotationY;
            earth.rotation.x = currentRotationX;
            clouds.rotation.y = currentRotationY * 1.05; // Clouds rotate slightly faster
            clouds.rotation.x = currentRotationX;
            atmosphere.rotation.y = currentRotationY;
            atmosphere.rotation.x = currentRotationX;
            
            // Rotate Among Us astronaut around the Earth
            if (astronauts) {
                // Create smooth orbit path for astronaut
                const orbitSpeed = 0.0002 * deltaTime;
                const astronaut = astronauts.children[0];
                
                if (astronaut) {
                    // Store initial angle if not yet defined
                    if (astronaut.userData.orbitAngle === undefined) {
                        astronaut.userData.orbitAngle = 0;
                    }
                    
                    // Update orbit angle
                    astronaut.userData.orbitAngle += orbitSpeed;
                    const angle = astronaut.userData.orbitAngle;
                    
                    // Define orbit path (slightly elliptical)
                    const orbitRadius = 2;
                    const orbitRadiusY = 0.2;
                    astronaut.position.x = Math.sin(angle) * orbitRadius;
                    astronaut.position.z = Math.cos(angle) * orbitRadius;
                    astronaut.position.y = Math.sin(angle * 2) * orbitRadiusY + 0.3;
                    
                    // Create floating effect animation
                    const floatAmount = 0.02;
                    const floatSpeed = 0.003;
                    const floatValue = Math.sin(currentTime * floatSpeed) * floatAmount;
                    astronaut.position.y += floatValue;
                    
                    // Make astronaut look at Earth center
                    astronaut.lookAt(0, 0, 0);
                    
                    // Add slight tilt in movement direction
                    const tangent = new THREE.Vector3(
                        Math.cos(angle),
                        0,
                        -Math.sin(angle)
                    ).normalize();
                    
                    // Create a quaternion for the tilt
                    const tiltAmount = 0.2; // Slight tilt
                    const tiltAxis = new THREE.Vector3().crossVectors(
                        new THREE.Vector3(0, 1, 0),
                        tangent
                    ).normalize();
                    
                    const tiltQuaternion = new THREE.Quaternion().setFromAxisAngle(
                        tiltAxis,
                        tiltAmount
                    );
                    
                    // Apply tilt in movement direction
                    astronaut.quaternion.premultiply(tiltQuaternion);
                    
                    // Make nametag always face camera
                    if (astronaut.userData.nametagMesh) {
                        const nametag = astronaut.userData.nametagMesh;
                        
                        // Áp dụng kỹ thuật Billboard để nametag luôn hướng về camera nhưng giữ chiều chữ đúng
                        // Lấy ma trận quay đang áp dụng cho model
                        const modelRotation = new THREE.Quaternion();
                        astronaut.getWorldQuaternion(modelRotation);
                        
                        // Bù lại sự quay của model để nametag quay độc lập
                        nametag.quaternion.copy(modelRotation).invert();
                        
                        // Áp dụng quay hướng về phía camera (chỉ quay theo trục Y)
                        const camPosition = new THREE.Vector3();
                        camera.getWorldPosition(camPosition);
                        
                        // Tạo vector từ model tới camera, chỉ xét component x và z (nằm ngang)
                        const lookDir = new THREE.Vector3();
                        astronaut.getWorldPosition(lookDir);
                        camPosition.y = lookDir.y; // Giữ cùng độ cao
                        lookDir.subVectors(camPosition, lookDir).normalize();
                        
                        // Tính góc quay trục Y để hướng về phía camera
                        const angle = Math.atan2(lookDir.x, lookDir.z);
                        const billboardRotation = new THREE.Quaternion();
                        billboardRotation.setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle);
                        
                        // Áp dụng quay billboard
                        nametag.quaternion.premultiply(billboardRotation);
                        
                        // Make nametag light flicker for attention
                        if (astronaut.userData.nametagLight) {
                            const light = astronaut.userData.nametagLight;
                            light.intensity = 1.0 + Math.sin(currentTime * 0.005) * 0.5;
                            
                            // Change light color slightly for dynamic effect
                            const hue = 0.0 + Math.sin(currentTime * 0.001) * 0.05; // Điều chỉnh cho màu đỏ
                            light.color.setHSL(hue, 1.0, 0.5);
                        }
                        
                        // Pulse effect on nametag (only for TextGeometry nametag)
                        if (nametag.material && nametag.material.emissiveIntensity !== undefined) {
                            const pulseSpeed = 0.002;
                            nametag.material.emissiveIntensity = 1.0 + Math.sin(currentTime * pulseSpeed) * 0.5;
                            nametag.material.needsUpdate = true;
                        }
                    }
                    
                    // Animate glow effect
                    if (astronaut.userData.glow) {
                        const glow = astronaut.userData.glow;
                        glow.material.opacity = 0.2 + Math.sin(currentTime * 0.003) * 0.1;
                    }
                    
                    // Animate jet particles
                    if (astronaut.userData.jetParticles && astronaut.userData.particlePositions) {
                        const particles = astronaut.userData.jetParticles;
                        const positions = astronaut.userData.particlePositions;
                        const positionAttribute = particles.geometry.getAttribute('position');
                        
                        // Update each particle position
                        for (let i = 0; i < positions.length / 3; i++) {
                            const i3 = i * 3;
                            
                            // Move particle downward
                            positions[i3 + 1] -= 0.01 * Math.random();
                            
                            // Reset particle if it's too far down
                            if (positions[i3 + 1] < -0.3) {
                                positions[i3] = (Math.random() - 0.5) * 0.05;
                                positions[i3 + 1] = -0.1;
                                positions[i3 + 2] = (Math.random() - 0.5) * 0.05;
                            }
                            
                            // Add some random horizontal movement
                            positions[i3] += (Math.random() - 0.5) * 0.005;
                            positions[i3 + 2] += (Math.random() - 0.5) * 0.005;
                        }
                        
                        positionAttribute.needsUpdate = true;
                    }
                }
            }
            
            // If we're zooming out, smoothly move camera back with constraints
            if (camera.position.distanceTo(initialCameraPosition) > 0.01) {
                camera.position.lerp(initialCameraPosition, 0.05);
                
                // Ensure camera stays within bounds while returning
                const distance = camera.position.length();
                if (distance < MIN_CAMERA_DISTANCE) {
                    camera.position.normalize().multiplyScalar(MIN_CAMERA_DISTANCE);
                } else if (distance > MAX_CAMERA_DISTANCE) {
                    camera.position.normalize().multiplyScalar(MAX_CAMERA_DISTANCE);
                }
            }
        }
        
        // Update shader uniforms
        earthShaderMaterial.uniforms.lightPosition.value = directionalLight.position;
        earthShaderMaterial.uniforms.time.value += deltaTime * 0.001;
        
        controls.update();
        renderer.render(scene, camera);
    }

    // Initialize animation
    animate();
}); 