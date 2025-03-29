import * as THREE from 'three';

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
        
        renderer.render(scene, camera);
    }

    // Initialize animation
    animate();
}); 