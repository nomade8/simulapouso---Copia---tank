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

        
        this.enemies.forEach(enemy => {
            // --- Lógica de Movimento ---
            if (now - enemy.lastDirectionChange > this.changeDirectionInterval) {
                // Vetor na direção do jogador
                const targetDirection = playerPosition.clone().sub(enemy.mesh.position).normalize();

                // Vetor aleatório para adicionar variação
                const randomDirection = new THREE.Vector3(
                    Math.random() * 2 * -0.1,
                    Math.random() * 0.2 - 0.2, // Menos variação vertical
                    Math.random() * 2 - 1
                ).normalize();

                // Mistura a direção do jogador com a aleatória (70% jogador, 30% aleatório)
                const newDir = targetDirection.multiplyScalar(0.7).add(randomDirection.multiplyScalar(0.3)).normalize();

                // Suaviza a mudança de direção
                enemy.moveDirection.lerp(newDir, 0.3).normalize(); // Aumentar lerp para seguir mais rápido
                enemy.lastDirectionChange = now;
                
               
            }

            // Verificações de limites X e Z + alinhamento imediato do yaw
            // Verificações de limites X e Z com curva suave
            const pos = enemy.mesh.position;
            const minHeight = 5; // Altura mínima de voo
            const maxHeight = this.boundarySize / 3; // Altura máxima de voo

            // Detecta se está próximo da borda
            const borderProximity = 2; // Distância da borda para começar a curva
            const nearBorderX = Math.abs(pos.x) > (this.boundarySize - borderProximity);
            const nearBorderZ = Math.abs(pos.z) > (this.boundarySize - borderProximity);
            
            // Inicia curva suave se estiver próximo da borda
            if (nearBorderX || nearBorderZ) {
                // Calcula direção para o centro
                const centerDir = new THREE.Vector3(-pos.x, 0, -pos.z).normalize();
                
                // Quanto mais próximo da borda, mais forte a influência da direção ao centro
                const distFromBorderX = this.boundarySize - Math.abs(pos.x);
                const distFromBorderZ = this.boundarySize - Math.abs(pos.z);
                const minDist = Math.min(distFromBorderX, distFromBorderZ);
                const turnFactor = 1 - Math.min(minDist / borderProximity, 1);
                
                // Interpola suavemente entre a direção atual e a direção ao centro
                const turnSpeed = 0.5 + (turnFactor * 0.1); // Aumenta velocidade de curva perto da borda
                enemy.moveDirection.lerp(centerDir, turnSpeed).normalize();
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
        });
        this.updateParticles();

        // --- NOVO: remover inimigos que explodiram por colisão com montanha ---
        this.enemies = this.enemies.filter(e => {
            if (e._explodeNow) {
                return false;
            }
            return true;
        });
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
            positions.push((Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.2);
            color.setHSL(Math.random() * 0.1 + 0.05, 1, 0.5); // Tons de laranja/vermelho
            colors.push(color.r, color.g, color.b);
        }

        particleGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        particleGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

        const particleMaterial = new THREE.PointsMaterial({
            size: 0.1,
            vertexColors: true,
            transparent: true,
            opacity: 1,
            sizeAttenuation: true
        });

        const points = new THREE.Points(particleGeometry, particleMaterial);
        points.position.copy(position);

        this.scene.add(points);
        this.particles.push({ mesh: points, life: 1.0, type: 'explosion' });
    }

    createSmokeEffect(position) {
        const particleCount = 20;
        const particleGeometry = new THREE.BufferGeometry();
        const positions = [];
        const colors = [];
        const color = new THREE.Color();

        for (let i = 0; i < particleCount; i++) {
            positions.push((Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5);
            const gray = Math.random() * 0.3 + 0.3; // Tons de cinza
            color.setRGB(gray, gray, gray);
            colors.push(color.r, color.g, color.b);
        }

        particleGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        particleGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

        const particleMaterial = new THREE.PointsMaterial({
            size: 0.3,
            vertexColors: true,
            transparent: true,
            opacity: 0.5,
            sizeAttenuation: true
        });

        const points = new THREE.Points(particleGeometry, particleMaterial);
        points.position.copy(position);

        this.scene.add(points);
        this.particles.push({ mesh: points, life: 1.5, type: 'smoke' }); // Fumaça dura mais
    }

    updateParticles() {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const particle = this.particles[i];
            particle.life -= 0.02;

            if (particle.type === 'explosion') {
                particle.mesh.material.opacity = particle.life;
                particle.mesh.scale.multiplyScalar(1.05);
            } else if (particle.type === 'smoke') {
                particle.mesh.material.opacity = particle.life * 0.5; // Fumaça mais sutil
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

    // Ajusta direção/posição para não atravessar a montanha (lateral apenas)
    resolveMountainCollision(enemy, stepVec) {
        if (!this.mountainsGroup) return false;

        const pos = enemy.mesh.position;
        const dir = stepVec.clone().normalize();
        const hit = this.raycastMountains(enemy, dir, stepVec.length() + this.collisionSkin);
        if (!hit) return false;

        let normalWorld = null;
        if (hit.face && hit.object && hit.object.matrixWorld) {
            normalWorld = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize();
        } else {
            normalWorld = pos.clone().sub(hit.point).normalize();
        }

        // Força a normal a ser mais horizontal para evitar subida irreal
        normalWorld.y = 0;
        normalWorld.normalize();

        // Ponto seguro fora da superfície (apenas lateral)
        const safePoint = hit.point.clone().add(normalWorld.clone().multiplyScalar(this.collisionSkin));
        safePoint.y = pos.y;

        // Vetor de correção limitado por quadro (apenas lateral)
        const correction = safePoint.clone().sub(pos);
        correction.y = 0;
        const maxCorr = this.maxCorrectionPerFrame;
        if (correction.length() > maxCorr) correction.setLength(maxCorr);

        // Aplica correção lateral suavemente
        pos.add(correction);

        // Deslize lateral ao longo da superfície
        const lateralDirection = stepVec.clone();
        lateralDirection.y = 0;
        const slide = lateralDirection.projectOnPlane(normalWorld);
        const newDir = slide.lengthSq() > 1e-6 ? slide.normalize() : lateralDirection.clone().reflect(normalWorld).normalize();

        // Garante que a nova direção seja majoritariamente horizontal
        newDir.y = THREE.MathUtils.clamp(newDir.y, -0.1, 0.1);
        newDir.normalize();
        enemy.moveDirection.lerp(newDir, 0.3).normalize();

        // Memoriza a normal lateral para manter o desvio
        enemy._avoidNormal = normalWorld.clone();
        enemy._avoidUntil = Date.now() + this.avoidPersistMs;

        // --- NOVO: detecção de travamento e explosão ---
        const slideLen = slide.length();
        // Se praticamente não há escape lateral, conta frames travados
        if (slideLen < 0.02) {
            enemy._blockedFrames = (enemy._blockedFrames || 0) + 1;
        } else {
            enemy._blockedFrames = 0;
        }

        // Se ficou travado por ~0.6s (36 frames a ~60fps), explode
        if (enemy._blockedFrames >= 36) {
            this.createExplosion(pos.clone());
            this.scene.remove(enemy.mesh);
            enemy._explodeNow = true;
        }

        return true;
    }

    // Antecipação lateral com look-ahead suavizado
    steerIfMountainAhead(enemy) {
        if (!this.mountainsGroup) return;

        const now = Date.now();

        // Se ainda estamos no período de desvio, continue com desvio lateral
        if (enemy._avoidNormal && enemy._avoidUntil && now < enemy._avoidUntil) {
            const lateralDir = enemy.moveDirection.clone();
            lateralDir.y = THREE.MathUtils.clamp(lateralDir.y, -0.1, 0.1);
            const persistedDir = lateralDir.projectOnPlane(enemy._avoidNormal).normalize();
            persistedDir.y = THREE.MathUtils.clamp(persistedDir.y, -0.1, 0.1);
            enemy.moveDirection.lerp(persistedDir, 0.2).normalize();
            return;
        }

        const lookAhead = Math.max(15, enemy.speed * 20); // Aumenta ainda mais a distância de detecção
        const hitAhead = this.raycastMountainsWithWingspan(enemy, enemy.moveDirection, lookAhead);
        if (!hitAhead) return;

        let normalWorld = null;
        if (hitAhead.face && hitAhead.object && hitAhead.object.matrixWorld) {
            normalWorld = hitAhead.face.normal.clone().transformDirection(hitAhead.object.matrixWorld).normalize();
        } else {
            normalWorld = enemy.mesh.position.clone().sub(hitAhead.point).normalize();
        }

        // Força desvio lateral: remove componente vertical da normal
        normalWorld.y = 0;
        normalWorld.normalize();

        // Calcula duas opções de desvio lateral (esquerda e direita)
        const right = new THREE.Vector3().crossVectors(normalWorld, new THREE.Vector3(0, 1, 0)).normalize();
        const left = right.clone().multiplyScalar(-1);

        const wingspan = enemy.wingspan || 3;
        const lateralCheckDist = Math.max(2.5, wingspan * 0.8);
        const rightBlocked = this.raycastMountains(enemy.mesh.position, right, lateralCheckDist);
        const leftBlocked  = this.raycastMountains(enemy.mesh.position, left,  lateralCheckDist);

        const frontClose = this.raycastMountainsWithWingspan(enemy, enemy.moveDirection, Math.max(2, lateralCheckDist * 0.6));
        if (frontClose && rightBlocked && leftBlocked) {
            // Sem espaço realista: acelera explosão por travamento
            enemy._blockedFrames = (enemy._blockedFrames || 0) + 3;
            if (enemy._blockedFrames >= 12) {
                this.createExplosion(enemy.mesh.position.clone());
                this.scene.remove(enemy.mesh);
                enemy._explodeNow = true;
            }
            return;
        }

        // Escolhe a direção que mais se alinha com o movimento atual
        const currentDir = enemy.moveDirection.clone();
        currentDir.y = 0; currentDir.normalize();

        const rightDot = right.dot(currentDir);
        const leftDot = left.dot(currentDir);
        const preferred = rightBlocked && !leftBlocked ? left
                     : leftBlocked && !rightBlocked ? right
                     : (rightDot > leftDot ? right : left);

        const steerDir = currentDir.clone().lerp(preferred, 0.45).normalize();
        steerDir.y = THREE.MathUtils.clamp(enemy.moveDirection.y, -0.1, 0.1);
        enemy.moveDirection.lerp(steerDir, 0.18).normalize();
    }

    // Função melhorada para detectar colisões considerando a largura das asas
    raycastMountainsWithWingspan(enemy, direction, distance) {
        if (!this.mountainsGroup) return null;
        
        const pos = enemy.mesh.position;
        const wingSpan = 4; // Largura das asas do avião
        
        // Calcula direção perpendicular para as asas (esquerda e direita)
        const rightVector = new THREE.Vector3().crossVectors(direction, new THREE.Vector3(0, 1, 0)).normalize();
        
        // Pontos de teste: centro, asa esquerda e asa direita
        const testPoints = [
            pos.clone(), // Centro
            pos.clone().add(rightVector.clone().multiplyScalar(wingSpan / 2)), // Asa direita
            pos.clone().add(rightVector.clone().multiplyScalar(-wingSpan / 2)) // Asa esquerda
        ];
        
        let closestHit = null;
        let minDistance = Infinity;
        
        // Testa colisão em todos os pontos
        for (const testPoint of testPoints) {
            this.raycaster.set(testPoint, direction.clone().normalize());
            this.raycaster.far = distance;
            const hits = this.raycaster.intersectObject(this.mountainsGroup, true);
            
            if (hits && hits.length > 0) {
                const hit = hits[0];
                if (hit.distance < minDistance) {
                    minDistance = hit.distance;
                    closestHit = hit;
                }
            }
        }
        
        return closestHit;
    }

    // Atualiza resolveMountainCollision para usar a nova detecção
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

        // Explosão imediata se impacto iminente (muito perto)
        const wingspan = enemy.wingspan || 3;
        const minImpact = Math.max(1.2, wingspan * 0.35);
        const impactDist = pos.distanceTo(hit.point);
        if (impactDist <= minImpact) {
            this.createExplosion(pos.clone());
            this.scene.remove(enemy.mesh);
            enemy._explodeNow = true;
            return true;
        }

        let normalWorld = null;
        if (hit.face && hit.object && hit.object.matrixWorld) {
            normalWorld = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize();
        } else {
            normalWorld = pos.clone().sub(hit.point).normalize();
        }

        // Força a normal a ser mais horizontal para evitar subida irreal
        normalWorld.y = 0;
        normalWorld.normalize();

        // Ponto seguro fora da superfície com margem maior para as asas
        const safetyMargin = this.collisionSkin + 2; // Margem extra para as asas
        const safePoint = hit.point.clone().add(normalWorld.clone().multiplyScalar(safetyMargin));
        safePoint.y = pos.y;

        // Vetor de correção limitado por quadro (apenas lateral)
        const correction = safePoint.clone().sub(pos);
        correction.y = 0;
        const maxCorr = this.maxCorrectionPerFrame;
        if (correction.length() > maxCorr) correction.setLength(maxCorr);

        // Aplica correção lateral suavemente
        pos.add(correction);

        // Deslize lateral ao longo da superfície
        const lateralDirection = stepVec.clone();
        lateralDirection.y = 0;
        const slide = lateralDirection.projectOnPlane(normalWorld);
        const newDir = slide.lengthSq() > 1e-6 ? slide.normalize() : lateralDirection.clone().reflect(normalWorld).normalize();

        // Garante que a nova direção seja majoritariamente horizontal
        newDir.y = THREE.MathUtils.clamp(newDir.y, -0.1, 0.1);
        newDir.normalize();
        enemy.moveDirection.lerp(newDir, 0.3).normalize();

        // Memoriza a normal lateral para manter o desvio
        enemy._avoidNormal = normalWorld.clone();
        enemy._avoidUntil = Date.now() + this.avoidPersistMs;

        // Detecção de travamento e explosão
        const slideLen = slide.length();
        if (slideLen < 0.02) {
            enemy._blockedFrames = (enemy._blockedFrames || 0) + 1;
        } else {
            enemy._blockedFrames = 0;
        }

        // Se ficou travado por ~0.6s (36 frames a ~60fps), explode
        if (enemy._blockedFrames >= 36) {
            this.createExplosion(pos.clone());
            this.scene.remove(enemy.mesh);
            enemy._explodeNow = true;
        }

        return true;
    }

    // Atualiza steerIfMountainAhead para usar a nova detecção
    steerIfMountainAhead(enemy) {
        if (!this.mountainsGroup) return;

        const now = Date.now();

        // Se ainda estamos no período de desvio, continue com desvio lateral
        if (enemy._avoidNormal && enemy._avoidUntil && now < enemy._avoidUntil) {
            const lateralDir = enemy.moveDirection.clone();
            lateralDir.y = THREE.MathUtils.clamp(lateralDir.y, -0.1, 0.1);
            const persistedDir = lateralDir.projectOnPlane(enemy._avoidNormal).normalize();
            persistedDir.y = THREE.MathUtils.clamp(persistedDir.y, -0.1, 0.1);
            enemy.moveDirection.lerp(persistedDir, 0.2).normalize();
            return;
        }

        const lookAhead = Math.max(15, enemy.speed * 20); // Aumenta ainda mais a distância de detecção
        const hitAhead = this.raycastMountainsWithWingspan(enemy, enemy.moveDirection, lookAhead);
        if (!hitAhead) return;

        let normalWorld = null;
        if (hitAhead.face && hitAhead.object && hitAhead.object.matrixWorld) {
            normalWorld = hitAhead.face.normal.clone().transformDirection(hitAhead.object.matrixWorld).normalize();
        } else {
            normalWorld = enemy.mesh.position.clone().sub(hitAhead.point).normalize();
        }

        // Força desvio lateral: remove componente vertical da normal
        normalWorld.y = 0;
        normalWorld.normalize();

        // Calcula duas opções de desvio lateral (esquerda e direita)
        const right = new THREE.Vector3().crossVectors(normalWorld, new THREE.Vector3(0, 1, 0)).normalize();
        const left = right.clone().multiplyScalar(-1);

        const wingspan = enemy.wingspan || 3;
        const lateralCheckDist = Math.max(2.5, wingspan * 0.8);
        const rightBlocked = this.raycastMountains(enemy.mesh.position, right, lateralCheckDist);
        const leftBlocked  = this.raycastMountains(enemy.mesh.position, left,  lateralCheckDist);

        const frontClose = this.raycastMountainsWithWingspan(enemy, enemy.moveDirection, Math.max(2, lateralCheckDist * 0.6));
        if (frontClose && rightBlocked && leftBlocked) {
            // Sem espaço realista: acelera explosão por travamento
            enemy._blockedFrames = (enemy._blockedFrames || 0) + 3;
            if (enemy._blockedFrames >= 12) {
                this.createExplosion(enemy.mesh.position.clone());
                this.scene.remove(enemy.mesh);
                enemy._explodeNow = true;
            }
            return;
        }

        // Escolhe a direção que mais se alinha com o movimento atual
        const currentDir = enemy.moveDirection.clone();
        currentDir.y = 0; currentDir.normalize();

        const rightDot = right.dot(currentDir);
        const leftDot = left.dot(currentDir);
        const preferred = rightBlocked && !leftBlocked ? left
                     : leftBlocked && !rightBlocked ? right
                     : (rightDot > leftDot ? right : left);

        const steerDir = currentDir.clone().lerp(preferred, 0.45).normalize();
        steerDir.y = THREE.MathUtils.clamp(enemy.moveDirection.y, -0.1, 0.1);
        enemy.moveDirection.lerp(steerDir, 0.18).normalize();
    }

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

        if (hitCloseFront || hitCloseBack) {
            // Já está encostado: explode imediatamente
            this.createExplosion(enemy.mesh.position.clone());
            this.scene.remove(enemy.mesh);
            this.enemies.splice(index, 1);
            return true;
        }

        // Detecção de “movimento mínimo” (travado)
        const lastPos = enemy._lastPos ? enemy._lastPos.clone() : enemy.mesh.position.clone();
        const moved = enemy.mesh.position.distanceTo(lastPos);
        enemy._lastPos = enemy.mesh.position.clone();

        if (moved < 0.03) {
            enemy._stuckFrames = (enemy._stuckFrames || 0) + 1;
        } else {
            enemy._stuckFrames = 0;
        }

        // Se está próximo (mesmo que não detecte hit nesse frame) e não se move, explode
        if ((hitCloseFront || hitCloseBack) && enemy._stuckFrames >= 8) {
            this.createExplosion(enemy.mesh.position.clone());
            this.scene.remove(enemy.mesh);
            this.enemies.splice(index, 1);
            return true;
        }

        return false;
    }
}

export default EnemyManager;