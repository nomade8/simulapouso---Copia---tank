import * as THREE from 'three';


class EnemyManager {
    constructor(scene, mountainsGroup = null) {
        this.scene = scene;
        this.mountainsGroup = mountainsGroup;
        this.enemies = [];
        this.bullets = [];
        this.enemyBullets = [];
        this.lastShootTime = 0; // Cooldown do jogador
        this.shootCooldown = 100; // Cooldown do jogador
        this.enemyShootCooldown = 1000; // Cooldown de tiro do inimigo (ms)
        this.boundarySize = 150; // Aumentado de 60 para 180
        this.changeDirectionInterval = 2000; // Intervalo menor para reavaliar direção
        this.minEnemyDistance = 50;
        this.maxSpawnAttempts = 10;
        this.particles = [];
        this.score = 0;
        this.phase = 1; // Fase atual
        this.enemiesPerPhase = 7;
        this.gameState = 'combat'; // Estados: 'combat', 'landing', 'descanso'
        this.scoreElement = document.createElement('div');
        this.scoreElement.style.position = 'absolute';
        this.scoreElement.style.top = '130px';
        this.scoreElement.style.left = '30px';
        this.scoreElement.style.color = 'white';
        this.scoreElement.style.fontSize = '24px';
        this.scoreElement.style.fontFamily = 'Arial, sans-serif';
        this.scoreElement.style.textShadow = '2px 2px 2px black';
        document.body.appendChild(this.scoreElement);
        this.updateScoreDisplay();
        this.shootRange = 20; // Adicionando range de tiro

        // Parâmetros de colisão/evitação (ajustes finos)
        this.collisionSkin = 0.6;              // distância mínima para ficar “fora” da superfície
        this.maxCorrectionPerFrame = 0.3;      // limite de correção de posição por frame
        this.avoidPersistMs = 250;             // “memória” de desvio após detectar montanha

        // Raycaster com BVH
        this.raycaster = new THREE.Raycaster();
        this.raycaster.firstHitOnly = true;
    }

    updateScoreDisplay() {
        this.scoreElement.innerHTML = `Pontuação: ${this.score} <br>
        Fase: ${this.phase} `;
        
    }

    createEnemy(playerPosition, spawnAttempt = 0) {
        // Só cria inimigos se estiver em combate e houver espaço na fase
        if (this.gameState !== 'combat' || this.enemies.length >= this.enemiesPerPhase) {
            return null;
        }

        // Prevent infinite recursion
        if (spawnAttempt >= this.maxSpawnAttempts) {
            console.log("Failed to find valid spawn position");
            return null;
        }

        const randomAngle = Math.random() * Math.PI * 2 - 1;
        const distance = 80 + Math.random() * 30; // Increased random distance range
        const spawnPosition = new THREE.Vector3(
            playerPosition.x + Math.cos(randomAngle) * distance,
            playerPosition.y + (Math.random() * 2 + 1), // More height variation
            playerPosition.z + Math.sin(randomAngle) * distance
        );

        // Check distance from ALL other enemies
        let tooClose = false;
        for (const existingEnemy of this.enemies) {
            const dist = spawnPosition.distanceTo(existingEnemy.mesh.position);
            if (dist < this.minEnemyDistance) {
                tooClose = true;
                break;
            }
        }

        if (tooClose) {
            return this.createEnemy(playerPosition, spawnAttempt + 1);
        }

        // Continue with enemy creation if position is valid
        const enemy = new THREE.Group();
        
        // Corpo do avião (Fuselagem) - Vermelho
        const fuselageGeometry = new THREE.CapsuleGeometry(0.5, 3, 4, 8);
        const fuselageMaterial = new THREE.MeshPhongMaterial({
            color: '#ff0000',
            flatShading: true
        });
        const fuselage = new THREE.Mesh(fuselageGeometry, fuselageMaterial);
        fuselage.castShadow = true;
        fuselage.rotation.x = Math.PI / 2;
        enemy.add(fuselage);

        // Asas
        const wingGeometry = new THREE.BoxGeometry(6, 0.2, 1.5);
        const wingMaterial = new THREE.MeshPhongMaterial({
            color: '#fcfcfc',
            flatShading: true
        });
        const wings = new THREE.Mesh(wingGeometry, wingMaterial);
        wings.castShadow = true;
        wings.position.y = 0;
        enemy.add(wings);

        // Leme (Tail Fin)
        const tailFinGeometry = new THREE.BoxGeometry(0.2, 1.5, 1);
        const tailFin = new THREE.Mesh(tailFinGeometry, wingMaterial);
        tailFin.castShadow = true;
        tailFin.position.set(0, 0.75, -1.5);
        enemy.add(tailFin);

        // Estabilizador Horizontal (Tail Plane)
        const tailPlaneGeometry = new THREE.BoxGeometry(2, 0.15, 0.8);
        const tailPlane = new THREE.Mesh(tailPlaneGeometry, wingMaterial);
        tailPlane.castShadow = true;
        tailPlane.position.set(0, 0, -1.6);
        enemy.add(tailPlane);

       

        // Use the validated spawn position and set initial orientation
        enemy.position.copy(spawnPosition);
        
        // Calculate direction towards center, but maintain height
        const centerPoint = new THREE.Vector3(0, spawnPosition.y, 0);
        const directionToCenter = centerPoint.sub(spawnPosition).normalize();
        
        // Set initial movement direction circling around center
        const perpDirection = new THREE.Vector3(directionToCenter.z, 0, directionToCenter.x);
        
        // Rotate enemy to face movement direction
        enemy.lookAt(enemy.position.clone().add(perpDirection));
        
        const escala = 0.25;
        enemy.scale.set(escala, escala, escala);

        // Add to scene with corrected initial direction
        this.scene.add(enemy);
        this.enemies.push({
            mesh: enemy,
            health: 100,
            lastShootTime: 0,
            moveDirection: perpDirection,
            lastDirectionChange: Date.now(),
            speed: 0.16 + Math.random() * 0.030 // Reduced speed variation
        });

        return enemy;
    }

    updateEnemies(playerPosition) {
        const now = Date.now();
        const enemyForward = new THREE.Vector3();
        const directionToPlayer = new THREE.Vector3();
    
        // Loop reverso para remoção segura
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const enemy = this.enemies[i];

            // Queda parabólica levando em conta a velocidade no momento da morte
            if (enemy.isDying && enemy.death) {
                const now = Date.now();
                const dt = enemy._deathLastTime ? (now - enemy._deathLastTime) / 1000 : 0.016;
                enemy._deathLastTime = now;

                // Integra posição: mantém velocidade horizontal, aplica gravidade em Y
                if (!enemy.death.velocity) {
                    enemy.death.velocity = new THREE.Vector3(0, -2.5, 0);
                }
                enemy.mesh.position.add(enemy.death.velocity.clone().multiplyScalar(dt));
                enemy.death.velocity.y -= enemy.death.gravity * dt;

                // Aponta nariz para baixo com leve giro
                const targetPitch = -Math.PI / 2; // -90°
                const currentPitch = enemy.mesh.rotation.x || 0;
                enemy.mesh.rotation.x = THREE.MathUtils.lerp(currentPitch, targetPitch, 0.2);
                enemy.mesh.rotation.y += enemy.death.yawSpin * dt;
                enemy.mesh.rotation.z += enemy.death.rollSpin * dt;
                
                // Adiciona fumaça durante a queda (a cada 200ms aproximadamente)
                if (!enemy._lastSmokeTime || now - enemy._lastSmokeTime > 60) {

                    // Posição ligeiramente atrás do avião
                    const smokePos = enemy.mesh.position.clone();
                    smokePos.y -= 0.1; // Um pouco abaixo para parecer que sai da parte traseira
                    this.createSmokeEffect(smokePos);
                    enemy._lastSmokeTime = now;
                }

                // Detecta o chão (raycast) ou fallback por y
                let groundY = 0;
                const downHit = this.raycastMountains(enemy.mesh.position.clone(), new THREE.Vector3(0, -1, 0), 1000);
                if (downHit && downHit.point) {
                    groundY = downHit.point.y;
                }
                if (enemy.mesh.position.y <= groundY + 0.1) {
                    this.createExplosion(enemy.mesh.position.clone());
                    this.scene.remove(enemy.mesh);
                    this.enemies.splice(i, 1);
                    continue;
                }

                // Enquanto morrendo, não aplica mais lógica normal
                continue;
            }

            // --- Lógica de Movimento ---
            if (now - enemy.lastDirectionChange > this.changeDirectionInterval) {
                // Vetor na direção do jogador
                const targetDirection = playerPosition.clone().sub(enemy.mesh.position).normalize();
    
                // Vetor aleatório para adicionar variação
                const randomDirection = new THREE.Vector3(
                    Math.random() * 2 * -0.1,
                    Math.random() * 0.2 - 0.2, // Menos variação vertical
                    Math.random() * 2 - 2
                ).normalize();
    
                // Mistura a direção do jogador com a aleatória (70% jogador, 30% aleatório)
                const newDir = targetDirection.multiplyScalar(0.75).add(randomDirection.multiplyScalar(0.25)).normalize();
    
                // Suaviza a mudança de direção
                enemy.moveDirection.lerp(newDir, 0.35).normalize(); // Aumentar lerp para seguir mais rápido
                enemy.lastDirectionChange = now;
                
               
            }
    
            // Verificações de limites X e Z com curva mais aberta ao longo da borda
            const pos = enemy.mesh.position;
            const minHeight = 5; // Altura mínima de voo
            const maxHeight = this.boundarySize / 3; // Altura máxima de voo
    
            // Inicia curva mais cedo e de forma suave
            const borderProximity = 10; // Distância da borda para começar a curva (maior = curva mais antecipada)
            const nearBorderX = Math.abs(pos.x) > (this.boundarySize - borderProximity);
            const nearBorderZ = Math.abs(pos.z) > (this.boundarySize - borderProximity);
    
            if (nearBorderX || nearBorderZ) {
                // Normal da borda (pode ser diagonal num canto)
                const normal = new THREE.Vector3(
                    nearBorderX ? Math.sign(pos.x) : 0,
                    0,
                    nearBorderZ ? Math.sign(pos.z) : 0
                ).normalize();
    
                // Direção atual projetada na tangente (remove componente que empurra contra a borda)
                const dir = enemy.moveDirection.clone().normalize();
                const normalComponent = normal.clone().multiplyScalar(dir.dot(normal));
                let tangent = dir.clone().sub(normalComponent);
    
                // Se estiver indo exatamente contra a borda, escolhe uma tangente ortogonal estável
                if (tangent.lengthSq() < 1e-6) {
                    tangent = new THREE.Vector3(-normal.z, 0, normal.x).normalize();
                } else {
                    tangent.normalize();
                }
    
                // Quanto mais próximo da borda, mais forte o viés para dentro e a velocidade de curva
                const distFromBorderX = nearBorderX ? (this.boundarySize - Math.abs(pos.x)) : Infinity;
                const distFromBorderZ = nearBorderZ ? (this.boundarySize - Math.abs(pos.z)) : Infinity;
                const minDist = Math.min(distFromBorderX, distFromBorderZ);
                const turnFactor = 1 - Math.min(minDist / borderProximity, 1); // 0 longe, 1 colado na borda
    
                // Direção desejada: segue paralelo à borda com leve inclinação para dentro
                const inwardStrength = 0.15 + 0.35 * turnFactor; // 0.15..0.5
                const desiredDir = tangent.clone()
                    .add(normal.clone().multiplyScalar(-inwardStrength))
                    .normalize();
    
                // Suaviza a mudança (ligeiramente mais forte perto da borda)
                const turnSpeed = 0.15 + 0.25 * turnFactor; // 0.15..0.4
                enemy.moveDirection.lerp(desiredDir, turnSpeed).normalize();
            }
    
            // Ainda mantém limites rígidos para garantir que não saia da área
            if (Math.abs(pos.x) > this.boundarySize) {
                pos.x = Math.sign(pos.x) * this.boundarySize;
            }
            if (Math.abs(pos.z) > this.boundarySize) {
                pos.z = Math.sign(pos.z) * this.boundarySize;
            }
    
            let bounced = false;
            if (Math.abs(pos.x) > this.boundarySize) {
                enemy.moveDirection.x *= -1;
                pos.x = Math.sign(pos.x) * this.boundarySize;
                bounced = true;
            }
            if (Math.abs(pos.z) > this.boundarySize) {
                enemy.moveDirection.z *= -1;
                pos.z = Math.sign(pos.z) * this.boundarySize;
                bounced = true;
            }
    
            if (bounced) {
                // Normaliza direção e alinha yaw imediatamente para não “andar de ré”
                enemy.moveDirection.y = 0;
                enemy.moveDirection.normalize();
                const dirXZ = enemy.moveDirection.clone();
                dirXZ.y = 0;
                if (dirXZ.lengthSq() > 1e-6) {
                    const snapYaw = Math.atan2(dirXZ.x, dirXZ.z);
                    enemy._yaw = snapYaw;     // Alinha o yaw interno
                    enemy._roll = 0;          // Zera roll para evitar torção após a batida
                }
                enemy.lastDirectionChange = now; // opcional: reinicia timer de direção
            }
    
            // Controle de altura
            if (pos.y < minHeight) {
                enemy.moveDirection.y = 0.1; // Força suave para cima
                pos.y = minHeight;
            } else if (pos.y > maxHeight) {
                enemy.moveDirection.y = -0.1; // Força suave para baixo
                pos.y = maxHeight;
            }
    
            // Evitar montanhas à frente de forma antecipada (suave)
            this.steerIfMountainAhead(enemy);
    
            // Aplicar movimento com checagem de colisão contra montanhas (suave)
            const stepVec = enemy.moveDirection.clone().multiplyScalar(enemy.speed);
            const collided = this.resolveMountainCollision(enemy, stepVec);
            if (!collided) {
                enemy.mesh.position.add(stepVec);
            }
    
            // --- Rotação suave e curva realista ---
            const moveXZ = enemy.moveDirection.clone();
            moveXZ.y = 0;
            moveXZ.normalize();
            // Calcula o yaw alvo (ângulo desejado)
            const targetYaw = Math.atan2(moveXZ.x, moveXZ.z);
            // Inicializa yaw atual se não existir
            if (enemy._yaw === undefined) enemy._yaw = targetYaw;
            // Interpola suavemente o yaw atual para o alvo
            // Corrige wrap-around de ângulo (-PI a PI)
            let deltaYaw = targetYaw - enemy._yaw;
            if (deltaYaw > Math.PI) deltaYaw -= 2 * Math.PI;
            if (deltaYaw < -Math.PI) deltaYaw += 2 * Math.PI;
            // Limita a mudança máxima de yaw para evitar giros rápidos
            const maxYawChange = 0.05; // Ajuste conforme necessário
            deltaYaw = THREE.MathUtils.clamp(deltaYaw, -maxYawChange, maxYawChange);
            enemy._yaw += deltaYaw;
            // Normaliza yaw para manter entre -PI e PI
            enemy._yaw = (enemy._yaw + Math.PI) % (2 * Math.PI) - Math.PI;
            // Calcula e aplica roll baseado na taxa de mudança de yaw (inclinação em curvas)
            const roll = -deltaYaw * 2; // Ajuste o multiplicador para intensidade do roll
            enemy.mesh.rotation.set(0, enemy._yaw, roll);
    
            // --- Roll acompanha a curva ---
            const maxRoll = 0.7;
            // O roll é proporcional à diferença de yaw (quanto mais curva, mais roll)
            let targetRoll = THREE.MathUtils.clamp(-deltaYaw * 20, -maxRoll, maxRoll);
            if (!enemy._roll) enemy._roll = 0;
            enemy._roll = THREE.MathUtils.lerp(enemy._roll, targetRoll, 0.08);
            enemy.mesh.rotation.z = enemy._roll;
    
            // --- Lógica de Tiro ---
            // Modificação na lógica de tiro
            if (now - enemy.lastShootTime > this.enemyShootCooldown) {
                // Calcular distância até o jogador
                const distanceToPlayer = enemy.mesh.position.distanceTo(playerPosition);
                
                // Só atirar se estiver dentro do alcance
                if (distanceToPlayer <= this.shootRange) {
                    enemy.mesh.getWorldDirection(enemyForward);
                    directionToPlayer.subVectors(playerPosition, enemy.mesh.position).normalize();
                    const dotProduct = enemyForward.dot(directionToPlayer);
    
                    if (dotProduct > 0.7) { // Corrigido de 50 para 0.8
                        const shootPosition = enemy.mesh.position.clone().add(enemyForward.multiplyScalar(2));
                        this.shoot(shootPosition, directionToPlayer, true);
                        enemy.lastShootTime = now;
                    }
                }
            }
            // Estabilização da altura
            if (Math.abs(enemy.moveDirection.y) > 0.1) {
                enemy.moveDirection.y *= 0.7; // Reduz gradualmente movimentos verticais bruscos
            }
        };
        this.updateParticles();
    }

    shoot(position, direction, isEnemy = false) {
        const now = Date.now();
        if (!isEnemy && now - this.lastShootTime < this.shootCooldown) return;

        const bulletGeometry = new THREE.SphereGeometry(0.08, 8, 8);
        const bulletMaterial = new THREE.MeshBasicMaterial({
            color: isEnemy ? 0xff0000 : 'rgb(250, 9, 9)'
        });
        const bullet = new THREE.Mesh(bulletGeometry, bulletMaterial);
        
        // Clone position to avoid reference issues
        bullet.position.copy(position);
        
        // Create velocity vector and normalize for consistent speed
        const speed = isEnemy ? 0.7 : 1.2;
        bullet.velocity = direction.clone().normalize().multiplyScalar(speed);
        
        this.scene.add(bullet);
        
        // Add bullet to appropriate array
        if (isEnemy) {
            this.enemyBullets.push(bullet);
        } else {
            this.bullets.push(bullet);
            this.lastShootTime = now;
        }
    }

    updateBullets() {
        // Atualizar projéteis do jogador
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const bullet = this.bullets[i];
            if (bullet && bullet.velocity) {
                // Move bullet in its velocity direction
                bullet.position.add(bullet.velocity);
            }
            
            // Remove bullets that are too far away
            const distanceFromOrigin = bullet.position.length();
            if (distanceFromOrigin > 200) {
                this.scene.remove(bullet);
                this.bullets.splice(i, 1);
            }
        }
        
        // Atualizar projéteis inimigos
        for (let i = this.enemyBullets.length - 1; i >= 0; i--) {
            const bullet = this.enemyBullets[i];
            if (bullet && bullet.velocity) {
                // Move bullet in its velocity direction
                bullet.position.add(bullet.velocity);
            }
            
            // Remove bullets that are too far away
            const distanceFromOrigin = bullet.position.length();
            if (distanceFromOrigin > 200) {
                this.scene.remove(bullet);
                this.enemyBullets.splice(i, 1);
            }
        }
    }

    checkBulletCollision(bullet, targetMesh) {
        if (!targetMesh || !bullet) {
            return false;
        }
        
        const distance = bullet.position.distanceTo(targetMesh.position);
        // Aumentando o raio de colisão para facilitar a detecção
        const collisionThreshold = 0.3; // Valor fixo mais apropriado
        
       
        
        return distance < collisionThreshold;
    }

    createExplosion(position) {
        // Adiciona o som da explosão
        const explosionSound = new Audio('explosion.mp3');
        explosionSound.volume = 0.05; // Ajuste o volume conforme necessário
        explosionSound.play();

        const particleCount = 150;
        const particleGeometry = new THREE.BufferGeometry();
        const positions = [];
        const colors = [];
        const color = new THREE.Color();

        for (let i = 0; i < particleCount; i++) {
            positions.push((Math.random() - 0.5) * 0.9, (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5);
            color.setHSL(Math.random() * 0.1 + 0.05, 1, 0.5); // Tons de laranja/vermelho
            colors.push(color.r, color.g, color.b);
        }

        particleGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        particleGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

        const particleMaterial = new THREE.PointsMaterial({
            size: 0.2,
            vertexColors: true,
            transparent: true,
            opacity: 0.6,
            sizeAttenuation: true
        });

        const points = new THREE.Points(particleGeometry, particleMaterial);
        points.position.copy(position);

        this.scene.add(points);
        this.particles.push({ mesh: points, life: 1.0, type: 'explosion' });
    }

    createSmokeEffect(position) {
        const particleCount = 40;
        const particleGeometry = new THREE.BufferGeometry();
        const positions = [];
        const colors = [];
        const color = new THREE.Color();

        for (let i = 0; i < particleCount; i++) {
            positions.push((Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5);
            const gray = Math.random() * 0.3 + 0.3; // Tons de cinza
            color.setRGB(0.05, 0.05, 0.05);

            colors.push(color.r, color.g, color.b);
        }

        particleGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        particleGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

        const particleMaterial = new THREE.PointsMaterial({
            size: 0.13,
            vertexColors: true,
            transparent: true,
            opacity: 0.1,
            sizeAttenuation: true
        });

        const points = new THREE.Points(particleGeometry, particleMaterial);
        points.position.copy(position);

        this.scene.add(points);
        this.particles.push({ mesh: points, life: 0.7, type: 'smoke' }); // Fumaça dura mais
    }

    updateParticles() {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const particle = this.particles[i];
            particle.life -= 0.02;

            if (particle.type === 'explosion') {
                particle.mesh.material.opacity = particle.life;
                particle.mesh.scale.multiplyScalar(1.00);
            } else if (particle.type === 'smoke') {
                particle.mesh.material.opacity = particle.life * 2; // Fumaça mais sutil
                particle.mesh.position.y += 0.01; // Fumaça sobe
            }

            if (particle.life <= 0) {
                this.scene.remove(particle.mesh);
                this.particles.splice(i, 1);
            }
        }
    }

    // Função para iniciar a próxima fase
    startNextPhase(playerPosition) {
        if (this.gameState === 'landing') {
            this.phase++;
            this.gameState = 'combat';
            this.updateScoreDisplay();
            console.log(`Iniciando Fase ${this.phase}`);
            // Criar novos inimigos para a nova fase
            for (let i = 0; i < this.enemiesPerPhase; i++) {
                this.createEnemy(playerPosition);
            }
        }
    }

    reset() {
        // Limpar inimigos, balas e partículas existentes
        this.enemies.forEach(enemy => this.scene.remove(enemy.mesh));
        this.enemies = [];
        this.bullets.forEach(bullet => this.scene.remove(bullet));
        this.bullets = [];
        this.enemyBullets.forEach(bullet => this.scene.remove(bullet));
        this.enemyBullets = [];
        this.particles.forEach(particle => this.scene.remove(particle.mesh));
        this.particles = [];

        // Resetar estado do jogo
        this.score = 0;
        this.phase = 1;
        this.gameState = 'combat';
        this.updateScoreDisplay();
    }

    // Raycast contra o grupo de montanhas utilizando BVH
    raycastMountains(origin, direction, distance) {
        if (!this.mountainsGroup) return null;
        this.raycaster.set(origin, direction.clone().normalize());
        this.raycaster.far = distance;
        const hits = this.raycaster.intersectObject(this.mountainsGroup, true);
        return hits && hits.length ? hits[0] : null;
    }

    // NOVO: Raycast com detecção nas asas do avião
    raycastMountainsWithWingspan(enemy, direction, distance) {
        if (!this.mountainsGroup) return null;
        
        const wingspan = enemy.wingspan || 3;
        const halfWingspan = wingspan / 2;
        const pos = enemy.mesh.position;
        
        // Raycast central
        const centerHit = this.raycastMountains(pos, direction, distance);
        if (centerHit) return centerHit;
        
        // Raycast nas asas (esquerda e direita)
        const rightVector = new THREE.Vector3().crossVectors(direction, new THREE.Vector3(0, 1, 0)).normalize();
        const leftWingPos = pos.clone().add(rightVector.clone().multiplyScalar(-halfWingspan));
        const rightWingPos = pos.clone().add(rightVector.clone().multiplyScalar(halfWingspan));
        
        const leftHit = this.raycastMountains(leftWingPos, direction, distance);
        if (leftHit) return leftHit;
        
        const rightHit = this.raycastMountains(rightWingPos, direction, distance);
        if (rightHit) return rightHit;
        
        return null;
    }

    // Ajusta direção/posição para não atravessar a montanha (lateral apenas)
    resolveMountainCollision(enemy, stepVec) {
        if (!this.mountainsGroup) return false;

        const pos = enemy.mesh.position;
        const dir = stepVec.clone().normalize();
        const hit = this.raycastMountainsWithWingspan(
            enemy,
            dir,
            stepVec.length() + this.collisionSkin
        );
        if (!hit) return false;

        let normalWorld = null;
        if (hit.face && hit.object && hit.object.matrixWorld) {
            normalWorld = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize();
        } else {
            normalWorld = pos.clone().sub(hit.point).normalize();
        }

        // Força a normal a ser mais horizontal
        normalWorld.y = 0;
        normalWorld.normalize();

        // Margem de segurança aumentada
        const safetyMargin = this.collisionSkin + 4; // Maior margem
        const safePoint = hit.point.clone().add(normalWorld.clone().multiplyScalar(safetyMargin));
        safePoint.y = pos.y;

        // Vetor de correção suave
        const correction = safePoint.clone().sub(pos);
        correction.y = 0;
        const maxCorr = this.maxCorrectionPerFrame * 2; // Correção mais rápida
        if (correction.length() > maxCorr) correction.setLength(maxCorr);

        pos.add(correction);

        // Deslize lateral natural
        const lateralDirection = stepVec.clone();
        lateralDirection.y = 0;
        const slide = lateralDirection.projectOnPlane(normalWorld);
        const newDir = slide.lengthSq() > 1e-6 ? slide.normalize() : lateralDirection.clone().reflect(normalWorld).normalize();

        newDir.y = THREE.MathUtils.clamp(newDir.y, -0.05, 0.05); // Menos variação vertical
        newDir.normalize();
        enemy.moveDirection.lerp(newDir, 0.4).normalize(); // Desvio mais rápido

        // Memoriza desvio para persistência
        enemy._avoidNormal = normalWorld.clone();
        enemy._avoidUntil = Date.now() + this.avoidPersistMs;

        return true;
    }

    // Nova versão de steerIfMountainAhead sem explosão
    steerIfMountainAhead(enemy) {
        if (!this.mountainsGroup) return;

        const now = Date.now();

        // Persistência do desvio lateral
        if (enemy._avoidNormal && enemy._avoidUntil && now < enemy._avoidUntil) {
            const lateralDir = enemy.moveDirection.clone();
            lateralDir.y = THREE.MathUtils.clamp(lateralDir.y, -0.05, 0.05);
            const persistedDir = lateralDir.projectOnPlane(enemy._avoidNormal).normalize();
            persistedDir.y = THREE.MathUtils.clamp(persistedDir.y, -0.05, 0.05);
            enemy.moveDirection.lerp(persistedDir, 0.25).normalize();
            return;
        }

        const lookAhead = Math.max(30, enemy.speed * 25); // Detecção mais antecipada
        const hitAhead = this.raycastMountainsWithWingspan(enemy, enemy.moveDirection, lookAhead);
        if (!hitAhead) return;

        let normalWorld = null;
        if (hitAhead.face && hitAhead.object && hitAhead.object.matrixWorld) {
            normalWorld = hitAhead.face.normal.clone().transformDirection(hitAhead.object.matrixWorld).normalize();
        } else {
            normalWorld = enemy.mesh.position.clone().sub(hitAhead.point).normalize();
        }

        normalWorld.y = 0;
        normalWorld.normalize();

        // Calcula opções de desvio lateral
        const right = new THREE.Vector3().crossVectors(normalWorld, new THREE.Vector3(0, 1, 0)).normalize();
        const left = right.clone().multiplyScalar(-1);

        const wingspan = enemy.wingspan || 3;
        const lateralCheckDist = Math.max(3, wingspan); // Distância de verificação aumentada
        
        const rightBlocked = this.raycastMountains(enemy.mesh.position, right, lateralCheckDist);
        const leftBlocked  = this.raycastMountains(enemy.mesh.position, left,  lateralCheckDist);

        // Se ambos os lados estão bloqueados, faz um desvio vertical suave
        if (rightBlocked && leftBlocked) {
            const upDir = new THREE.Vector3(0, 1, 0);
            const downDir = new THREE.Vector3(0, -1, 0);
            
            const upBlocked = this.raycastMountains(enemy.mesh.position, upDir, 3);
            const downBlocked = this.raycastMountains(enemy.mesh.position, downDir, 3);
            
            if (!upBlocked) {
                enemy.moveDirection.y = Math.min(enemy.moveDirection.y + 0.1, 0.3);
            } else if (!downBlocked) {
                enemy.moveDirection.y = Math.max(enemy.moveDirection.y - 0.1, -0.3);
            } else {
                // Último recurso: desvio diagonal
                const diagonal = right.clone().add(new THREE.Vector3(0, 0.2, 0)).normalize();
                enemy.moveDirection.lerp(diagonal, 0.3).normalize();
            }
            return;
        }

        // Escolhe a direção que mais se alinha com o movimento atual
        const currentDir = enemy.moveDirection.clone();
        currentDir.y = 0; currentDir.normalize();

        const rightDot = right.dot(currentDir);
        const leftDot = left.dot(currentDir);
        const preferred = rightBlocked ? left : leftBlocked ? right : (rightDot > leftDot ? right : left);

        const steerDir = currentDir.clone().lerp(preferred, 0.5).normalize();
        steerDir.y = THREE.MathUtils.clamp(enemy.moveDirection.y, -0.05, 0.05);
        enemy.moveDirection.lerp(steerDir, 0.25).normalize();
    }

    // Remove a função checkAndHandleStuckEnemy ou a torna apenas recuperação
    // Também remove toda lógica de explosão do updateEnemies
    checkAndHandleStuckEnemy(enemy, index) {
        if (!enemy || !enemy.mesh) return false;

        // Distância crítica baseada na envergadura (fallback padrão)
        const wingspan = enemy.wingspan || 3;
        const criticalDist = Math.max(1.2, wingspan * 0.35);

        // Raycast curtíssimo à frente (com asas) e um pouco para trás
        const hitCloseFront = this.raycastMountainsWithWingspan(
            enemy,
            enemy.moveDirection,
            criticalDist
        );
        const hitCloseBack = this.raycastMountains(
            enemy.mesh.position,
            enemy.moveDirection.clone().multiplyScalar(-1),
            criticalDist * 0.6
        );

        // Detecção de “movimento mínimo” (travado)
        const lastPos = enemy._lastPos ? enemy._lastPos.clone() : enemy.mesh.position.clone();
        const moved = enemy.mesh.position.distanceTo(lastPos);
        enemy._lastPos = enemy.mesh.position.clone();

        if (moved < 0.03) {
            enemy._stuckFrames = (enemy._stuckFrames || 0) + 1;
        } else {
            enemy._stuckFrames = 0;
        }

        // Se está travado e próximo de montanha, inverte direção em vez de explodir
        if ((hitCloseFront || hitCloseBack) && enemy._stuckFrames >= 8) {
            // Inverte o sentido (apenas X e Z)
            enemy.moveDirection.x *= -1;
            enemy.moveDirection.z *= -1;
            enemy.moveDirection.y = 0;
            enemy.moveDirection.normalize();

            // Atualiza yaw para alinhar com nova direção
            const dirXZ = enemy.moveDirection.clone();
            dirXZ.y = 0;
            if (dirXZ.lengthSq() > 1e-6) {
                enemy._yaw = Math.atan2(dirXZ.x, dirXZ.z);
                enemy._roll = 0;
            }

            // Reseta contadores de stuck
            enemy._stuckFrames = 0;
            enemy.lastDirectionChange = Date.now();

            return true;
        }

        return false;
    }

    // Inicia a queda em espiral lenta a partir da posição ATUAL do inimigo (sem movimento instantâneo)
    startEnemyDeathSpiral(enemy) {
        if (!enemy || !enemy.mesh) return;
        enemy.isDying = true;

        // Direção horizontal atual e velocidade do inimigo no momento da morte
        const dirXZ = enemy.moveDirection.clone();
        dirXZ.y = 0;
        if (dirXZ.lengthSq() < 1e-6) dirXZ.set(1, 0, 0);
        dirXZ.normalize();

        // Converte a "speed" por frame para unidades/segundo (aprox. 60 fps)
        const initialHorizontalSpeed = enemy.speed * 60;

        // Define estado da queda: velocidade inicial horizontal e leve componente vertical para iniciar o mergulho
        enemy.death = {
            velocity: new THREE.Vector3(
                dirXZ.x * initialHorizontalSpeed *1.4,
                -2.5, // inicia descendo suavemente
                dirXZ.z * initialHorizontalSpeed
            ),
            gravity: 10.5, // aceleração da gravidade (unidades/s^2)
            yawSpin: 0.3,  // giro lento para dar vida à queda
            rollSpin: 2.5 // leve rolamento
        };

        // Zera efeitos de rolagem interna para não conflitar
        enemy._roll = 0;
        enemy._deathLastTime = Date.now();
    }
}

export default EnemyManager;