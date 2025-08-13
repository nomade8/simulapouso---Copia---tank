import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { MeshBVH, acceleratedRaycast } from 'three-mesh-bvh';
import EnemyManager from './enemies.js';
import TankManager from './tanks.js';

// Adiciona o método de raycast acelerado ao protótipo do Mesh
THREE.Mesh.prototype.raycast = acceleratedRaycast;

class LandingSimulator {
    constructor() {
        console.log("Iniciando simulador...");
        try {
            this.gameOver = false;
            this.gameOverDisplayed = false;
            this.playerHealth = 100;
            this.healthBar = document.getElementById('healthBar');
            this.gameOverScreen = document.getElementById('gameOverScreen');
            this.finalScoreElement = document.getElementById('finalScore');
            this.updateHealthBar();
            
            // Create scene first
            this.scene = new THREE.Scene();
            
            // Then set scene properties
            this.scene.background = new THREE.Color(0x87CEEB);
            this.scene.fog = new THREE.FogExp2('#d1c817', 0.0035);
            
            // Criar elemento de mensagem de pouso
            this.createLandingMessage(); 
            console.log("Cena criada");

            console.log("Configurando câmera e renderer...");
            this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
            this.renderer = new THREE.WebGLRenderer({ 
                antialias: false,
                logarithmicDepthBuffer: false
            });
            this.renderer.shadowMap.enabled = true;
            this.renderer.shadowMap.type = THREE.BasicShadowMap;
            
            this.renderer.setSize(window.innerWidth, window.innerHeight);
            document.body.appendChild(this.renderer.domElement);
            
            // Estilos já definidos no HTML
            
            this.createSkyGradient();
           

            // Iluminação
            this.setupLights();
           
            // Criar cenário
            this.createScene();
            
            
            // Criar avião (needs to be created before camera setup uses its position)
            this.createPlane(); 
            
            this.cameraOffset = new THREE.Vector3(0, 1.0, -1); // Initialize cameraOffset here

            // Inicializar gerenciador de inimigos
            this.enemyManager = new EnemyManager(this.scene);
            // Criar inimigos iniciais da primeira fase
            for (let i = 0; i < this.enemyManager.enemiesPerPhase; i++) {
                 this.enemyManager.createEnemy(this.airplane.position);
            }
            
            // Inicializar gerenciador de tanques
            this.tankManager = new TankManager(this.scene, this.ground);
            // Criar tanques iniciais da primeira fase
            for (let i = 0; i < this.tankManager.tanksPerPhase; i++) {
                this.tankManager.createTank(this.airplane.position);
            }
           

            // --- Camera Setup Moved Here ---
            this.setupCamera();
           

            // Controles - Target will be updated dynamically
            this.controls = new OrbitControls(this.camera, this.renderer.domElement);
            this.controls.target.copy(this.airplane.position); // Set initial target
            this.controls.enablePan = false; // Allow panning
            this.controls.enableZoom = false; // Allow zooming
            this.controls.enableRotate = false; // Disable manual rotation
            this.controls.enabled = false; // Completely disable OrbitControls
            
            // --- End of Camera Setup ---
            this.setupControls();
            
            // Variáveis de simulação
            this.planeState = {
                speed: 7,
                altitude: 400,
                fuel: 100,
                rotation: 0, // Yaw
                pitch: 0,    // Pitch
                roll: 0,     // Roll
                isTurningLeft: false,
                isTurningRight: false,
                isPitchingUp: false,
                isPitchingDown: false
            };
            
            console.log("Iniciando animação...");
            // Start animation after all initialization
            this.animate();
        } catch (error) {
            console.error("Erro na inicialização:", error);
        }
    }

    updateHealthBar() {
        if (this.healthBar) {
            const healthPercentage = Math.max(0, this.playerHealth); // Garante que não seja negativo
            this.healthBar.style.width = `${healthPercentage}%`;
            // Mudar a cor da barra com base na vida
            if (healthPercentage > 60) {
                this.healthBar.style.backgroundColor = '#4CAF50'; // Verde
            } else if (healthPercentage > 30) {
                this.healthBar.style.backgroundColor = '#ffc107'; // Amarelo
            } else {
                this.healthBar.style.backgroundColor = '#f44336'; // Vermelho
            }
        }
    }

    setupLights() {
        // Luz ambiente mais suave
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
        this.scene.add(ambientLight);

        // Luz principal (sol) com sombras melhoradas
        const sunLight = new THREE.DirectionalLight(0xffffff, 1);
        sunLight.position.set(50, 200, 100);
        sunLight.castShadow = true;
        
        // Configurações de alta qualidade para sombras
        sunLight.shadow.mapSize.width = 2048;
        sunLight.shadow.mapSize.height = 2048;
        sunLight.shadow.camera.near = 1;
        sunLight.shadow.camera.far = 500;
        sunLight.shadow.camera.left = -100;
        sunLight.shadow.camera.right = 100;
        sunLight.shadow.camera.top = 100;
        sunLight.shadow.camera.bottom = -100;
        
       
        
        this.scene.add(sunLight);

        // Luz secundária (preenchimento) para detalhes nas sombras
        const fillLight = new THREE.DirectionalLight('0x8088ff', 0.5); // Tom levemente azulado
        fillLight.position.set(-50, 100, -100);
        this.scene.add(fillLight);

        // Luz de realce (rim light) para melhorar a profundidade
        const rimLight = new THREE.DirectionalLight(0xfff0dd, 0.5); // Tom levemente amarelado
        rimLight.position.set(0, 50, -200);
        this.scene.add(rimLight);
    }

    createScene() {
        // Terreno com proporções maiores
        const groundGeometry = new THREE.PlaneGeometry(400, 400, 100, 100);
        
        // Adicionar variação de altura mais suave no terreno
        const vertices = groundGeometry.attributes.position.array;
        for (let i = 0; i < vertices.length; i += 3) {
            const x = vertices[i];
            const z = vertices[i + 2];
            // Evitar modificar a área da pista e proximidades - área plana maior
            if (Math.abs(x) > 205 || Math.abs(z) > 25) {
                vertices[i + 1] = Math.sin(x / 80) * Math.cos(z / 80) * 4 + 
                                Math.sin(x / 40 + z / 50) * 2 +
                                (Math.random() * 0.5);
            }
        }
        
        groundGeometry.computeVertexNormals();
        groundGeometry.boundsTree = new MeshBVH(groundGeometry);

        const groundMaterial = new THREE.MeshStandardMaterial({ 
            color: '#0b9e32',
            roughness: 0.8,
            metalness: 0.1,
            flatShading: false
        });

        this.ground = new THREE.Mesh(groundGeometry, groundMaterial);
        this.ground.rotation.x = -Math.PI / 2;
        this.ground.receiveShadow = true;
        this.scene.add(this.ground); 

        // Montanhas estilizadas
        this.createStylizedMountains();

        // Pista de pouso
        this.createRunway();

       

        // Vegetação estilizada (ajustada para o novo tamanho)
        this.createStylizedVegetation();

        // Nuvens estilizadas
        this.createClouds();
    }

    createStylizedMountains() {
        const mountainMaterial = new THREE.MeshStandardMaterial({ 
            color: '#b87058',
            roughness: 0.3,
            metalness: 0.1,
            flatShading: true 
        });

        const mountains = new THREE.Group();
        
        // Criar montanhas mais densas e próximas
        for (let i = 0; i < 15; i++) {
            const radius = Math.random() * 15 + 6; // Montanhas um pouco maiores
            const mountainGeometry = new THREE.IcosahedronGeometry(radius, 2); // Aumentado o detalhe
            
            // Adicionar variação mais suave aos vértices
            const vertices = mountainGeometry.attributes.position.array;
            for (let j = 0; j < vertices.length; j += 3) {
                const noise = (Math.random() * 0.2) + 0.1; // Menor variação aleatória
                vertices[j] = noise;
                vertices[j + 1] = noise * 0.5; // Um pouco mais alto
                vertices[j + 2] = noise;
            }
            
            mountainGeometry.computeVertexNormals();
            mountainGeometry.boundsTree = new MeshBVH(mountainGeometry);

            const mountain = new THREE.Mesh(mountainGeometry, mountainMaterial);
            
            // Posicionar montanhas em um padrão mais circular e denso
            const angle = (i / 15) * Math.PI * 2 + (Math.random() * 0.5 - 0.25);
            const distance = Math.random() * 40 + 100; // Distância mais consistente
            mountain.position.set(
                Math.cos(angle) * distance,
                Math.random() * 4 + 2, // Altura mais consistente
                Math.sin(angle) * distance
            );

            // Escala mais uniforme para evitar deformações estranhas
            const baseScale = Math.random() * 1.0 + 1.0;
            mountain.scale.set(
                baseScale,
                baseScale * (Math.random() * 2 + 2.2), // Altura um pouco variada
                baseScale
            );
            
            // Rotação mais sutil
            mountain.rotation.set(
                Math.random() * 0.1,
                Math.random() * Math.PI,
                Math.random() * 0.2
            );
            
            // Adicionar sub-montanhas para criar continuidade
            for (let j = 0; j < 3; j++) {
                const subRadius = radius * 0.6;
                const subMountain = new THREE.Mesh(
                    new THREE.IcosahedronGeometry(subRadius, 2),
                    mountainMaterial
                );
                
                // Posicionar próximo à montanha principal
                const subAngle = Math.random() * Math.PI * 2;
                const subDistance = radius * 1.2;
                subMountain.position.set(
                    Math.cos(subAngle) * subDistance,
                    -radius * 0.3, // Um pouco mais baixo
                    Math.sin(subAngle) * subDistance
                );
                
                subMountain.scale.set(
                    Math.random() * 0.3 + 0.7,
                    Math.random() * 0.3 + 0.7,
                    Math.random() * 0.3 + 0.7
                );
                
                mountain.add(subMountain);
            }
            
            mountain.castShadow = true;
            mountain.receiveShadow = true;
            
            mountains.add(mountain);
        }

        this.scene.add(mountains);
        this.mountainsGroup = mountains; // Armazenar referência para detecção de colisão
    }

    createRunway() {
        // Pista principal com textura mais realista
        const runwayGeometry = new THREE.PlaneGeometry(5, 30, 1, 20); // Mais segmentos para detalhe
        const runwayMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x333333,
            roughness: 0.7,
            metalness: 0.1,
        });
        const runway = new THREE.Mesh(runwayGeometry, runwayMaterial);
        runway.rotation.x = -Math.PI / 2;
        runway.position.y = 0.01;
        runway.receiveShadow = true;
        this.runwayMesh = runway; // Armazenar referência à malha da pista
        this.scene.add(runway);

        // Base da pista (mais larga, como asfalto circundante)
        const baseGeometry = new THREE.PlaneGeometry(8, 33);
        const baseMaterial = new THREE.MeshStandardMaterial({
            color: 0x1a1a1a,
            roughness: 0.8,
            metalness: 0.1
        });
        const base = new THREE.Mesh(baseGeometry, baseMaterial);
        base.rotation.x = -Math.PI / 2;
        base.position.y = 0.005;
        base.receiveShadow = true;
        this.scene.add(base);

        // Marcações da pista com material emissivo
        const lineMaterial = new THREE.MeshStandardMaterial({ 
            color: 0xFFFFFF,
            emissive: 0xFFFFFF,
            emissiveIntensity: 0.2,
            roughness: 0.5
        });

        // Linhas centrais
        for (let i = -12; i <= 12; i += 4) {
            const lineGeometry = new THREE.PlaneGeometry(0.3, 2);
            const line = new THREE.Mesh(lineGeometry, lineMaterial);
            line.rotation.x = -Math.PI / 2;
            line.position.set(0, 0.015, i);
            line.receiveShadow = true;
            this.scene.add(line);
        }

        // Marcações de cabeceira
        const createThreshold = (posZ) => {
            for (let i = -2; i <= 2; i += 0.5) {
                const thresholdGeometry = new THREE.PlaneGeometry(0.2, 1);
                const threshold = new THREE.Mesh(thresholdGeometry, lineMaterial);
                threshold.rotation.x = -Math.PI / 2;
                threshold.position.set(i, 0.015, posZ);
                threshold.receiveShadow = true;
                this.scene.add(threshold);
            }
        };

        createThreshold(-14); // Cabeceira inicial
        createThreshold(14);  // Cabeceira final

        // Linhas laterais contínuas
        const sideLine = new THREE.Mesh(
            new THREE.PlaneGeometry(0.15, 30),
            lineMaterial
        );
        const leftLine = sideLine.clone();
        leftLine.rotation.x = -Math.PI / 2;
        leftLine.position.set(-2.4, 0.015, 0);
        leftLine.receiveShadow = true;
        this.scene.add(leftLine);

        const rightLine = sideLine.clone();
        rightLine.rotation.x = -Math.PI / 2;
        rightLine.position.set(2.4, 0.015, 0);
        rightLine.receiveShadow = true;
        this.scene.add(rightLine);

        // Números da pista (opcional, pode ser adicionado depois)
        // Marcadores de distância nas laterais
        const createDistanceMarker = (posZ) => {
            const marker = new THREE.Mesh(
                new THREE.PlaneGeometry(0.8, 0.8),
                lineMaterial
            );
            marker.rotation.x = -Math.PI / 2;
            marker.position.y = 0.015;
            marker.position.z = posZ;
            marker.receiveShadow = true;
            return marker;
        };

        // Adicionar marcadores de distância em ambos os lados
        [-10, -5, 0, 5, 10].forEach(z => {
            const leftMarker = createDistanceMarker(z);
            leftMarker.position.x = -3;
            this.scene.add(leftMarker);

            const rightMarker = createDistanceMarker(z);
            rightMarker.position.x = 3;
            this.scene.add(rightMarker);
        });
    }

   

    createStylizedVegetation() {
        // Material base para árvores com variação de cores
        const createTreeMaterial = () => {
            const hue = 0.33 + (Math.random() * 0.1 - 0.05);
            const color = new THREE.Color().setHSL(hue, 0.6, 0.3 + Math.random() * 0.2);
            return new THREE.MeshPhongMaterial({
                color: color,
                flatShading: true,
                shininess: 0
            });
        };

        const createBushMaterial = () => {
            const hue = 0.35 + (Math.random() * 0.1 - 0.05);
            const color = new THREE.Color().setHSL(hue, 0.5, 0.4 + Math.random() * 0.2);
            return new THREE.MeshPhongMaterial({
                color: color,
                flatShading: true,
                shininess: 0
            });
        };

        const vegetationGroup = new THREE.Group();

        // Aumentar a quantidade de vegetação para o terreno maior
        for (let i = 0; i < 250; i++) {
            let vegMesh;
            const randomScale = Math.random() * 0.5 + 0.8;
            const posX = Math.random() * 400 - 200;
            const posZ = Math.random() * 400 - 200;

            // Evitar colocar vegetação na pista e no rio
            if ((Math.abs(posX) < 10 && Math.abs(posZ) < 20) || 
                (Math.abs(posX - 50) < 20)) continue;

            if (Math.random() > 0.4) {
                const treeGroup = new THREE.Group();
                
                const trunkGeometry = new THREE.CylinderGeometry(0.2, 0.3, 1.5 * randomScale, 5);
                const trunkMaterial = new THREE.MeshPhongMaterial({
                    color: 0x4A2E0F,
                    flatShading: true
                });
                const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
                trunk.position.y = 0.75 * randomScale;
                treeGroup.add(trunk);

                const numLayers = Math.floor(Math.random() * 2) + 2;
                for (let j = 0; j < numLayers; j++) {
                    const size = (1.2 - j * 0.2) * randomScale;
                    const height = (1.5 + j * 0.7) * randomScale;
                    const coneGeometry = new THREE.ConeGeometry(size, size * 1.5, 6);
                    const coneMesh = new THREE.Mesh(coneGeometry, createTreeMaterial());
                    coneMesh.position.y = height;
                    treeGroup.add(coneMesh);
                }

                vegMesh = treeGroup;
            } else {
                const bushGroup = new THREE.Group();
                const numSpheres = Math.floor(Math.random() * 3) + 2;
                
                for (let j = 0; j < numSpheres; j++) {
                    const sphereSize = (0.6 + Math.random() * 0.4) * randomScale;
                    const sphereGeometry = new THREE.SphereGeometry(sphereSize, 6, 5);
                    const sphereMesh = new THREE.Mesh(sphereGeometry, createBushMaterial());
                    
                    sphereMesh.position.set(
                        (Math.random() - 0.5) * 0.5,
                        sphereSize * 0.7,
                        (Math.random() - 0.5) * 0.5
                    );
                    bushGroup.add(sphereMesh);
                }

                vegMesh = bushGroup;
            }
            
            vegMesh.position.set(posX, 0, posZ);
            vegMesh.rotation.y = Math.random() * Math.PI;
            
            vegMesh.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });
            
            vegetationGroup.add(vegMesh);
        }

        this.scene.add(vegetationGroup);
    }

    createPlane() {
        this.airplane = new THREE.Group();

        // Corpo do avião (Fuselagem)
        const fuselageGeometry = new THREE.CapsuleGeometry(0.5, 3, 4, 8);
        const fuselageMaterial = new THREE.MeshPhongMaterial({
            color: '#0e036b',
            flatShading: true
        });
        const fuselage = new THREE.Mesh(fuselageGeometry, fuselageMaterial);
        fuselage.castShadow = true;  // Enable shadow casting
        fuselage.rotation.x = Math.PI / 2;
        this.airplane.add(fuselage);

        // Asas (cilindro estilizado)
        const wingGeometry = new THREE.CylinderGeometry(1, 1, 1.5, 32);
        const wingMaterial = new THREE.MeshStandardMaterial({
            color: '#fcfcfc',
            roughness: 1,
            metalness: 0
        });
        const wings = new THREE.Mesh(wingGeometry, wingMaterial);
        wings.position.set(0, 0.01, 0);
        wings.rotation.set(0, 0, 0, 'XYZ');
        wings.scale.set(3.28678, 0.081655, 0.8);
        wings.castShadow = true;
        wings.receiveShadow = false;
        this.airplane.add(wings);

        // Leme (Tail Fin)
        const tailFinGeometry = new THREE.BoxGeometry(0.1, 1, 1);
        const tailFinMaterial = new THREE.MeshPhongMaterial({
            color: '#fcfcfc',
            flatShading: true
        });
        const tailFin = new THREE.Mesh(tailFinGeometry, tailFinMaterial);
        tailFin.castShadow = true;  // Enable shadow casting
        tailFin.position.set(0, 0.75, -1.5);
        this.airplane.add(tailFin);

        // Estabilizador Horizontal (Tail Plane)
        const tailPlaneGeometry = new THREE.BoxGeometry(2.3, 0.1, 0.8);
        const tailPlane = new THREE.Mesh(tailPlaneGeometry, wingMaterial);
        tailPlane.castShadow = true;  // Enable shadow casting
        tailPlane.position.set(0, 0, -1.6);
        this.airplane.add(tailPlane);

        // --- Adicionando Rodas e Hastes ---

        const wheelMaterial = new THREE.MeshPhongMaterial({ color: 0x333333, flatShading: true });
        const strutMaterial = new THREE.MeshPhongMaterial({ color: 0x777777, flatShading: true });

        // Roda Traseira (próxima ao leme)
        const rearWheelRadius = 0.2;
        const rearWheelGeometry = new THREE.CylinderGeometry(rearWheelRadius, rearWheelRadius, 0.15, 16);
        const rearWheel = new THREE.Mesh(rearWheelGeometry, wheelMaterial);
        rearWheel.rotation.z = Math.PI / 2;
        rearWheel.position.set(0, -rearWheelRadius - 0.1, -1.8); // Posiciona abaixo da fuselagem traseira
        rearWheel.castShadow = true;
        this.airplane.add(rearWheel);

        const rearStrutHeight = 0.4;
        const rearStrutGeometry = new THREE.CylinderGeometry(0.05, 0.05, rearStrutHeight, 8);
        const rearStrut = new THREE.Mesh(rearStrutGeometry, strutMaterial);
        rearStrut.position.set(0, -rearStrutHeight / 2 - 0.1 - rearWheelRadius + 0.05, -1.8); // Conecta à fuselagem
        rearStrut.castShadow = true;
        this.airplane.add(rearStrut);

        // Rodas Dianteiras (nas asas)
        const frontWheelRadius = 0.3;
        const frontWheelGeometry = new THREE.CylinderGeometry(frontWheelRadius, frontWheelRadius, 0.2, 16);

        const frontStrutHeight = 0.6;
        const frontStrutGeometry = new THREE.CylinderGeometry(0.06, 0.06, frontStrutHeight, 8);

        const frontWheelOffset = 2.0; // Distância das rodas da frente do centro

        // Roda Dianteira Esquerda
        const frontWheelLeft = new THREE.Mesh(frontWheelGeometry, wheelMaterial);
        frontWheelLeft.rotation.z = Math.PI / 2;
        frontWheelLeft.position.set(-frontWheelOffset, -frontWheelRadius - 0.4, 0.5); // Abaixo da asa
        frontWheelLeft.castShadow = true;
        this.airplane.add(frontWheelLeft);

        const frontStrutLeft = new THREE.Mesh(frontStrutGeometry, strutMaterial);
        frontStrutLeft.position.set(-frontWheelOffset, -frontStrutHeight / 2 - 0.1 - frontWheelRadius + 0.06, 0.5); // Conecta à asa
        frontStrutLeft.castShadow = true;
        this.airplane.add(frontStrutLeft);

        // Roda Dianteira Direita
        const frontWheelRight = new THREE.Mesh(frontWheelGeometry, wheelMaterial);
        frontWheelRight.rotation.z = Math.PI / 2;
        frontWheelRight.position.set(frontWheelOffset, -frontWheelRadius - 0.4, 0.5); // Abaixo da asa
        frontWheelRight.castShadow = true;
        this.airplane.add(frontWheelRight);

        const frontStrutRight = new THREE.Mesh(frontStrutGeometry, strutMaterial);
        frontStrutRight.position.set(frontWheelOffset, -frontStrutHeight / 2 - 0.1 - frontWheelRadius + 0.06, 0.5); // Conecta à asa
        frontStrutRight.castShadow = true;
        this.airplane.add(frontStrutRight);

        // --- Fim da Adição de Rodas e Hastes ---

        

        // Posicionar o avião inicial mais alto para melhor visualização
        this.airplane.position.set(0, 50, -100); // Aumentado a altura inicial para evitar colisão
        const escala = 0.25;
        this.airplane.scale.set(escala, escala, escala);
        this.scene.add(this.airplane);
    }

    createClouds() {
        const cloudMaterial = new THREE.MeshLambertMaterial({
            color: '#eeb0ff',
            transparent: true,
            opacity: 0.3,
            flatShading: true
        });

        for (let i = 0; i < 15; i++) {
            const cloudGroup = new THREE.Group();
            
            // Criar núcleo da nuvem mais simples
            const mainSphereSize = Math.random() * 3 + 2;
            const mainSphere = new THREE.Mesh(
                new THREE.SphereGeometry(mainSphereSize, 6, 8),
                cloudMaterial
            );
            cloudGroup.add(mainSphere);

            // Apenas 2-3 detalhes por nuvem
            const numDetails = Math.floor(Math.random() * 2) + 2;
            for (let j = 0; j < numDetails; j++) {
                const detailSize = mainSphereSize * (Math.random() * 0.6 + 0.4);
                const detail = new THREE.Mesh(
                    new THREE.SphereGeometry(detailSize, 5, 8),
                    cloudMaterial
                );
                
                detail.position.set(
                    (Math.random() - 0.5) * mainSphereSize,
                    (Math.random() - 0.5) * mainSphereSize * 0.9,
                    (Math.random() - 0.5) * mainSphereSize
                );
                cloudGroup.add(detail);
            }

            cloudGroup.position.set(
                Math.random() * 200 - 100,
                Math.random() * 20 + 25,
                Math.random() * 200 - 100
            );
            
            this.scene.add(cloudGroup);
        }
    }

    updateHUD() {
        document.getElementById('speed').textContent = Math.round(this.planeState.speed*60);
        document.getElementById('altitude').textContent = Math.round(this.planeState.altitude*5);
        document.getElementById('fuel').textContent = Math.round(this.planeState.fuel);
    }

    setupControls() {
        window.addEventListener('keydown', (event) => {
            if (event.code === 'KeyZ') {
                // Get forward direction from airplane's world matrix
                const forward = new THREE.Vector3();
                this.airplane.getWorldDirection(forward);
                
                // Get position slightly in front of the airplane
                const shootPosition = this.airplane.position.clone();
                shootPosition.add(forward.clone().multiplyScalar(1));
                
                // Create shooting direction using the forward vector
                const shootDirection = forward.normalize();
                
                this.enemyManager.shoot(
                    shootPosition,
                    shootDirection
                );
                this.playShotgunSound();
            }
        });
   

        const keyStates = {
            ArrowUp: false,
            ArrowDown: false,
            ArrowLeft: false,
            ArrowRight: false,
            ' ': false,
            x: false
        };

        document.addEventListener('keydown', (event) => {
            if (keyStates.hasOwnProperty(event.key)) {
                keyStates[event.key] = true;
                this.updatePlaneStateFromKeys(keyStates);
            }
        });

        document.addEventListener('keyup', (event) => {
            if (keyStates.hasOwnProperty(event.key)) {
                keyStates[event.key] = false;
                this.updatePlaneStateFromKeys(keyStates);
            }
        });
    }

    // New method to handle continuous key presses
    updatePlaneStateFromKeys(keyStates) {
        // Update turning flags based on current key state
        this.planeState.isTurningLeft = keyStates.ArrowLeft;
        this.planeState.isTurningRight = keyStates.ArrowRight;
        this.planeState.isPitchingUp = keyStates.ArrowUp;
        this.planeState.isPitchingDown = keyStates.ArrowDown;

        // Handle speed changes (optional: could be instant or gradual)
        // --- Corrected speed increase/decrease logic ---
        const maxSpeed = 20; // Define a maximum speed limit
        const minSpeed = 0;  // Permite parar totalmente
        const speedChangeAmount = 0.2; // Use a smaller increment for gradual change

        if (keyStates.x) { // Spacebar to increase speed
            this.planeState.speed = Math.min(this.planeState.speed + speedChangeAmount, maxSpeed);
        }
        if (keyStates[' ']) { // X key to decrease speed
            this.planeState.speed = Math.max(this.planeState.speed - speedChangeAmount, minSpeed);
        }
        // --- End speed logic correction ---
        
    }

    createGameOverScreen() {
        // Usar o gameOverScreen existente em vez de criar um novo
        this.gameOverScreen = document.getElementById('gameOverScreen');
        this.finalScoreElement = document.getElementById('finalScore');
    }

    showGameOverScreen() {
        if (!this.gameOverDisplayed) {
            this.gameOverDisplayed = true;
            if (this.gameOverScreen) {
                // Update the final score
                if (this.finalScoreElement) {
                    this.finalScoreElement.textContent = `Pontuação Final: ${this.enemyManager.score}`;
                }
                
                // Show the game over screen
                this.gameOverScreen.style.display = 'flex';
                
                // Add the visible class after a small delay to trigger the fade-in animation
                setTimeout(() => {
                    this.gameOverScreen.classList.add('visible');
                }, 100);
            }
        }
    }

    createLandingMessage() {
        this.landingMessageElement = document.createElement('div');
        this.landingMessageElement.id = 'landingMessage';
        this.landingMessageElement.style.position = 'absolute';
        this.landingMessageElement.style.bottom = '30px';
        this.landingMessageElement.style.left = '50%';
        this.landingMessageElement.style.transform = 'translateX(-50%)';
        this.landingMessageElement.style.color = 'yellow';
        this.landingMessageElement.style.fontSize = '28px';
        this.landingMessageElement.style.fontFamily = 'Arial, sans-serif';
        this.landingMessageElement.style.textShadow = '2px 2px 4px black';
        this.landingMessageElement.style.display = 'none'; // Começa escondido
        this.landingMessageElement.textContent = 'Pouse o avião para iniciar a próxima fase!';
        document.body.appendChild(this.landingMessageElement);
    }

    restartGame() {
        // Resetar variáveis do jogo
        this.gameOver = false;
        this.gameOverDisplayed = false;
        this.playerHealth = 100;
        
        // Resetar posição e estado do avião
        this.airplane.position.set(0, 400, 0);
        this.planeState = {
            speed: 7,
            altitude: 400,
            fuel: 100,
            rotation: 0,
            pitch: 0,
            roll: 0,
            isTurningLeft: false,
            isTurningRight: false,
            isPitchingUp: false,
            isPitchingDown: false
        };
        
        // Limpar inimigos e resetar score
        this.enemyManager.reset();
        
        // Limpar tanques
        this.tankManager.reset();
        
        this.updateHealthBar(); // Resetar a barra de vida visualmente
        
        // Esconder tela de game over
        const gameOverScreen = document.getElementById('gameOverScreen');
        gameOverScreen.classList.remove('visible');
        setTimeout(() => {
            gameOverScreen.style.display = 'none';
        }, 500); // Tempo para a transição de opacidade

        // Esconder mensagem de pouso
        this.landingMessageElement.style.display = 'none';
        
        // Criar novos inimigos e tanques para a primeira fase
        for (let i = 0; i < this.enemyManager.enemiesPerPhase; i++) {
            this.enemyManager.createEnemy(this.airplane.position);
        }
        
        for (let i = 0; i < this.tankManager.tanksPerPhase; i++) {
            this.tankManager.createTank(this.airplane.position);
        }
        
        // Reiniciar animação
        this.animate();
    }

    checkLanding() {
        if (!this.airplane || !this.runwayMesh) return;

        const planePos = this.airplane.position;
        const runwayPos = this.runwayMesh.position;
        const runwayWidth = 5;
        const runwayLength = 30;
        const landingAltitudeThreshold = 0.5;
        const landingSpeedThreshold = 2;

        const withinXBounds = Math.abs(planePos.x - runwayPos.x) < runwayWidth / 2;
        const withinZBounds = Math.abs(planePos.z - runwayPos.z) < runwayLength / 2;
        const isLowEnough = planePos.y < landingAltitudeThreshold;
        const isSlowEnough = this.planeState.speed < landingSpeedThreshold;

        if (withinXBounds && withinZBounds && isLowEnough && isSlowEnough) {
            // Restaurar vida ao pousar
            if (this.playerHealth < 100) {
                this.playerHealth = 100;
                this.planeState.fuel= 100; // Restaurar combustível também
                this.updateHealthBar();
                console.log("Pouso bem-sucedido! Vida restaurada.");
              
            }
          
            // Se estiver em modo de pouso (fase completada), iniciar próxima fase
            if (this.enemyManager.gameState === 'landing') {
                
                this.enemyManager.startNextPhase(this.airplane.position);
                this.tankManager.startNextPhase(this.airplane.position);
                this.landingMessageElement.style.display = 'none';
                console.log("Próxima fase iniciada!");
            }
        }
    }

    // Reproduz som de explosão
    playExplosionSound() {
        const audio = new Audio('explosion.mp3');
        audio.volume = 0.1;
        audio.play();
    }
     // Reproduz som de tiro do avião do jogador
    playShotgunSound() {
        const audio = new Audio('shotgun.mp3');
        audio.volume = 0.05;
        audio.play();
    }

    animate() {
        // ...som removido...
        if (this.gameOver) {
            this.showGameOverScreen();
            return;
        }

        // Atualizar inimigos e projéteis
        this.enemyManager.updateEnemies(this.airplane.position);
        this.enemyManager.updateBullets();
        
        // Atualizar tanques e seus projéteis
        this.tankManager.updateTanks(this.airplane.position);
        this.tankManager.updateBullets();

        // Verificar colisões com projéteis inimigos e do jogador
        // Colisões entre balas inimigas e jogador
        for (let i = this.enemyManager.enemyBullets.length - 1; i >= 0; i--) {
            const bullet = this.enemyManager.enemyBullets[i];
            if (bullet && this.airplane) {
                const distance = bullet.position.distanceTo(this.airplane.position);
                if (distance < 1.0) { // Raio de colisão ajustado
                    console.log('Jogador atingido!');
                    this.playerHealth -= 10;
                    this.updateHealthBar();
                    // Remover bala
                    this.scene.remove(bullet);
                    this.enemyManager.enemyBullets.splice(i, 1);
                    // Criar explosão
                    this.enemyManager.createExplosion(this.airplane.position);
                    this.playExplosionSound();
                    if (this.playerHealth <= 0) {
                        this.playerHealth = 0;
                        this.updateHealthBar();
                        this.gameOver = true;
                        this.showGameOverScreen();
                        return;
                    }
                }
            }
        }
        
        // Colisões entre balas do jogador e inimigos
        for (let i = this.enemyManager.bullets.length - 1; i >= 0; i--) {
            const bullet = this.enemyManager.bullets[i];
            for (let j = this.enemyManager.enemies.length - 1; j >= 0; j--) {
                const enemy = this.enemyManager.enemies[j];
                if (bullet && enemy && enemy.mesh) {
                    enemy.mesh.updateMatrixWorld(true); // Ensure world matrix is updated
                    const enemyBoundingBox = new THREE.Box3().setFromObject(enemy.mesh); // Added for consistency
                    const distance = bullet.position.distanceTo(enemy.mesh.position);
                    if (distance < 1.0) { // Raio de colisão ajustado
                        console.log('Inimigo atingido!');
                        // Remover bala
                        this.scene.remove(bullet);
                        this.enemyManager.bullets.splice(i, 1);
                        // Criar explosão
                        this.enemyManager.createExplosion(enemy.mesh.position);
                         this.playExplosionSound();
                        // Pontuação por tiro acertado
                        this.enemyManager.score += 50;
                        this.enemyManager.updateScoreDisplay();
                        // Dano no inimigo
                        enemy.health -= 25;
                        if (enemy.health <= 0) {
                           
                            this.scene.remove(enemy.mesh);
                            this.enemyManager.enemies.splice(j, 1);
                            this.enemyManager.score += 100;
                            this.enemyManager.updateScoreDisplay();
                        }
                        break; // Sair do loop interno após a colisão
                    }
                }
            }
        }

        // Verificar pouso na pista para restaurar vida
        this.checkLanding();

        // Verificar colisões entre balas dos tanques e jogador
        for (let i = this.tankManager.tankBullets.length - 1; i >= 0; i--) {
            const bullet = this.tankManager.tankBullets[i];
            if (bullet && this.airplane) {
                const distance = bullet.position.distanceTo(this.airplane.position);
                if (distance < 1.0) { // Raio de colisão ajustado
                    console.log('Jogador atingido por tanque!');
                    this.playerHealth -= 15; // Dano maior que os aviões
                    this.updateHealthBar();
                    // Remover bala
                    this.scene.remove(bullet);
                    this.tankManager.tankBullets.splice(i, 1);
                    // Criar explosão
                    this.tankManager.createExplosion(this.airplane.position);
                    this.playExplosionSound();
                    if (this.playerHealth <= 0) {
                        this.playerHealth = 0;
                        this.updateHealthBar();
                        this.gameOver = true;
                        this.showGameOverScreen();
                        return;
                    }
                }
            }
        }
        
        // Colisões entre balas do jogador e tanques
        for (let i = this.enemyManager.bullets.length - 1; i >= 0; i--) {
            const bullet = this.enemyManager.bullets[i];
            for (let j = this.tankManager.tanks.length - 1; j >= 0; j--) {
                const tank = this.tankManager.tanks[j];
                if (bullet && tank && tank.mesh) {
                    const distance = bullet.position.distanceTo(tank.mesh.position);
                    if (distance < 1.5) { // Raio de colisão maior para tanques
                        console.log('Tanque atingido!');
                        // Remover bala
                        this.scene.remove(bullet);
                        this.enemyManager.bullets.splice(i, 1);
                        // Criar explosão
                        this.tankManager.createExplosion(tank.mesh.position);
                        this.playExplosionSound();
                        // Pontuação por tiro acertado
                        this.enemyManager.score += 50;
                        this.enemyManager.updateScoreDisplay();
                        // Dano no tanque
                        tank.health -= 20; // Tanques são mais resistentes
                        if (tank.health <= 0) {
                            this.scene.remove(tank.mesh);
                            this.tankManager.tanks.splice(j, 1);
                            this.enemyManager.score += 150; // Mais pontos por destruir tanques
                            this.enemyManager.updateScoreDisplay();
                        }
                        break; // Sair do loop interno após a colisão
                    }
                }
            }
        }

        // Verificar se a fase atual foi concluída (todos os inimigos eliminados)
        if (this.enemyManager.enemies.length === 0 && this.tankManager.tanks.length === 0) {
            // Mostrar mensagem para pousar e iniciar próxima fase
            this.landingMessageElement.style.display = 'flex';
            this.enemyManager.gameState = 'landing';
        }
         
        
        // Spawn de novos inimigos e tanques apenas no início de cada fase
        if (this.enemyManager.gameState !== 'landing' && this.enemyManager.enemies.length === 0 && this.tankManager.tanks.length === 0) {
            // Criar inimigos da nova fase
            for (let i = 0; i < this.enemyManager.enemiesPerPhase; i++) {
                this.enemyManager.createEnemy(this.airplane.position);
            }
            
            // Criar tanques da nova fase
            for (let i = 0; i < this.tankManager.tanksPerPhase; i++) {
                this.tankManager.createTank(this.airplane.position);
            }
        }

        // --- Detecção de Colisões ---
        // Certificar-se de que a matriz de transformação do avião está atualizada
        this.airplane.updateMatrixWorld(true);
        const playerBoundingBox = new THREE.Box3().setFromObject(this.airplane);
        playerBoundingBox.expandByScalar(0.1); // Expandir ligeiramente para colisão mais responsiva

        // Colisão com montanhas
        if (this.mountainsGroup) {
            const forward = new THREE.Vector3();
            this.airplane.getWorldDirection(forward);

            const raycaster = new THREE.Raycaster(this.airplane.position, forward);
            const collisionDistance = 1.5; // Distância de colisão (ajuste conforme necessário)

            for (const mountain of this.mountainsGroup.children) {
                const intersects = raycaster.intersectObject(mountain, true);

                if (intersects.length > 0 && intersects[0].distance < collisionDistance) {
                    this.playerHealth -= 50; // Dano de colisão
                    this.updateHealthBar();
                    console.log('Colisão com montanha!');
                    this.enemyManager.createExplosion(this.airplane.position);

                    if (this.playerHealth <= 0) {
                        this.gameOver = true;
                        this.showGameOverScreen();
                        return; // Sai da função animate
                    }
                    // Para a iteração para evitar dano múltiplo em um único quadro
                    break;
                }
            }
        }

        // Colisões com aeronaves inimigas
        for (let i = this.enemyManager.enemies.length - 1; i >= 0; i--) {
            const enemy = this.enemyManager.enemies[i];
            if (enemy && enemy.mesh) {
                enemy.mesh.updateMatrixWorld(true); // Ensure world matrix is updated
                const enemyBoundingBox = new THREE.Box3().setFromObject(enemy.mesh); // Added for consistency
                enemyBoundingBox.expandByScalar(0.1); // Expandir ligeiramente para colisão mais responsiva
                if (playerBoundingBox.intersectsBox(enemyBoundingBox)) {
                    const damage = 75; // Dano alto por colisão com inimigo
                    this.playerHealth -= damage;
                    this.updateHealthBar();
                    console.log('Colisão com aeronave inimiga!');
                    this.enemyManager.createExplosion(this.airplane.position);
                    this.scene.remove(enemy.mesh);
                    this.enemyManager.enemies.splice(i, 1);
                    this.enemyManager.score += 50; // Pontos por destruir inimigo em colisão
                    this.enemyManager.updateScoreDisplay();
                    if (this.playerHealth <= 0) {
                        this.gameOver = true;
                        this.showGameOverScreen();
                        return;
                    }
                }
            }
        }

        // --- Ground Collision and Altitude Update using Raycasting ---
        const raycaster = new THREE.Raycaster();
        const down = new THREE.Vector3(0, -1, 0);
        raycaster.set(this.airplane.position, down);

        const intersects = raycaster.intersectObject(this.ground);
        let groundAltitude = 0;

        if (intersects.length > 0) {
            const distanceToGround = intersects[0].distance;
            this.planeState.altitude = distanceToGround; // Update altitude for HUD

            // Considera "no chão sobre a pista" apenas se altitude < 0.5 e sobre a pista
            let onRunway = false;
            if (distanceToGround < 0.5) {
                // Nunca deixa o avião ultrapassar o solo
                if (this.airplane.position.y < 0.25) {
                    this.airplane.position.y = 0.25;
                }
                // Só trava a altura fixa se a velocidade for realmente baixa (parado)
                if (this.planeState.speed < 1) {
                    this.airplane.position.y = 0.25;
                }

                // Verifica se está sobre a pista
                const planePos = this.airplane.position;
                const runwayPos = this.runwayMesh.position;
                const runwayWidth = 5;
                const runwayLength = 50;
                onRunway = Math.abs(planePos.x - runwayPos.x) < runwayWidth / 2 &&
                           Math.abs(planePos.z - runwayPos.z) < runwayLength / 2;

                if (onRunway) {
                    // Só nivela o avião se estiver realmente parado
                    if (this.planeState.speed < 2) {
                       // this.planeState.pitch = 0;
                        this.airplane.rotation.x = 0;
                    }
                    this.planeState.roll = 0;
                    this.airplane.rotation.z = 0;
                } else {
                    // Lógica de colisão violenta fora da pista
                    if (this.planeState.speed > 3 && this.enemyManager.gameState !== 'landing') {
                        const damage = this.planeState.speed * 10;
                        this.playerHealth -= damage;
                        this.updateHealthBar();
                        console.log(`Colisão com o chão! Dano: ${damage.toFixed(2)}`);
                        this.enemyManager.createExplosion(this.airplane.position);
                        if (this.playerHealth <= 0) {
                            this.gameOver = true;
                            this.showGameOverScreen();
                            return;
                        }
                    }
                    // Desacelera e nivela fora da pista
                    this.planeState.speed = Math.max(0, this.planeState.speed - 0.05);
                    this.planeState.pitch = 0;
                    this.airplane.rotation.x = 0;
                    this.planeState.roll = 0;
                    this.airplane.rotation.z = 0;
                }
            }
            // Seta a flag só se está realmente parado na pista (velocidade < 1)
            this._onGroundOnRunway = (distanceToGround < 0.5 && onRunway && this.planeState.speed < 1);
        } else {
            // If no ground is detected below, use absolute Y for altitude as a fallback
            this.planeState.altitude = this.airplane.position.y;
            this._onGroundOnRunway = false;
        }

        // Update airplane position based on speed and orientation
        const moveDistance = this.planeState.speed * 0.01;
        this.airplane.translateZ(moveDistance);

        // --- Update Yaw, Pitch, and Roll based on key states ---
        const turnSpeed = 0.015;
        const pitchSpeed = 0.01;
        const maxPitch = 0.6;
        const maxRoll = 0.8;
        const rollLerpFactor = 0.06;


        let targetRoll = 0;

        // Permite yaw (giro do corpo) sempre, mas só aplica roll se não estiver parado na pista
        if (this.planeState.isTurningLeft) {
            this.planeState.rotation += turnSpeed;
            targetRoll = -maxRoll;
        } else if (this.planeState.isTurningRight) {
            this.planeState.rotation -= turnSpeed;
            targetRoll = +maxRoll;
        }
        // Só aplica roll se não estiver parado na pista
        if (this._onGroundOnRunway) {
            this.planeState.roll = 0;
        } else {
            this.planeState.roll = THREE.MathUtils.lerp(this.planeState.roll, targetRoll, rollLerpFactor);
        }

        if (this.planeState.isPitchingUp) {
            this.planeState.pitch = Math.min(this.planeState.pitch + pitchSpeed, maxPitch);
        } else if (this.planeState.isPitchingDown) {
            this.planeState.pitch = Math.max(this.planeState.pitch - pitchSpeed, -maxPitch);
        }

        // Consumo de combustível
        if (this.planeState.fuel > 0 && this.planeState.speed > 0) {
            this.planeState.fuel -= 0.05 * (this.planeState.speed / 100);
            this.planeState.fuel = Math.max(this.planeState.fuel, 0);
        } else if (this.planeState.fuel <= 0) {
            this.planeState.speed = Math.max(this.planeState.speed - 0.5, 0);
            this.planeState.pitch = Math.max(this.planeState.pitch - 0.01, -0.3);
        }

        this.airplane.rotation.order = 'YXZ';
        this.airplane.rotation.y = this.planeState.rotation;
        this.airplane.rotation.x = this.planeState.pitch;
        this.airplane.rotation.z = this.planeState.roll;

        const moveDirection = new THREE.Vector3(0, 0, 1);
        moveDirection.applyQuaternion(this.airplane.quaternion);

        const moveVector = moveDirection.multiplyScalar(this.planeState.speed * 0.01);
        this.airplane.position.add(moveVector);

        // Update camera position to follow the airplane with lerp
        const targetCameraPosition = this.airplane.position.clone().add(this.cameraOffset.clone().applyQuaternion(this.airplane.quaternion));
        this.camera.position.lerp(targetCameraPosition, 0.1); // Adjust lerp factor as needed for smoothness
        this.camera.lookAt(this.airplane.position);

        // Update HUD
        this.updateHUD();

        // Render the scene
        this.renderer.render(this.scene, this.camera);

        // Request next frame
        requestAnimationFrame(() => this.animate());
    }

    // --- Add the missing createSkyGradient method definition ---
    createSkyGradient() {
        const canvas = document.createElement('canvas');
        canvas.width = 2; // Minimal width needed
        canvas.height = 256; // Height determines gradient resolution

        const context = canvas.getContext('2d');
        const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
        
        // Define gradient colors: Yellow at bottom, Blue/Purple at top
        gradient.addColorStop(0, '#4a0e8a'); // Darker Purple/Blue at the top (y=0)
        gradient.addColorStop(0.4, '#fcba03'); // Transition to Sky Blue
        gradient.addColorStop(1, '#fcba03'); // Light Yellow/Cream at the bottom (y=canvas.height)

        context.fillStyle = gradient;
        context.fillRect(0, 0, canvas.width, canvas.height);

        const texture = new THREE.CanvasTexture(canvas);
        texture.needsUpdate = true; // Ensure texture updates
        this.scene.background = texture;
    }
    // --- End of createSkyGradient method ---

    setupCamera() {
        this.camera.position.copy(this.airplane.position).add(this.cameraOffset);
        this.camera.lookAt(this.airplane.position);
    }

} // End of LandingSimulator class

// Iniciar simulação
const simulator = new LandingSimulator();

// Responsividade
window.addEventListener('resize', () => {
    simulator.camera.aspect = window.innerWidth / window.innerHeight;
    simulator.camera.updateProjectionMatrix();
    simulator.renderer.setSize(window.innerWidth, window.innerHeight);
});