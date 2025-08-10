import * as THREE from 'three';


class EnemyManager {
    constructor(scene) {
        this.scene = scene;
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
                enemy.moveDirection.lerp(newDir, 0.4).normalize(); // Aumentar lerp para seguir mais rápido
                enemy.lastDirectionChange = now;
                
               
            }

            // Boundary check and movement (mantido)
            const pos = enemy.mesh.position;
            const minHeight = 5; // Altura mínima de voo
            const maxHeight = this.boundarySize / 3; // Altura máxima de voo

            // Verificações de limites X e Z
            if (Math.abs(pos.x) > this.boundarySize) {
                enemy.moveDirection.x *= -1;
                pos.x = Math.sign(pos.x) * this.boundarySize;
            }
            if (Math.abs(pos.z) > this.boundarySize) {
                enemy.moveDirection.z *= -1;
                pos.z = Math.sign(pos.z) * this.boundarySize;
            }

            // Controle de altura
            if (pos.y < minHeight) {
                enemy.moveDirection.y = 0.1; // Força suave para cima
                pos.y = minHeight;
            } else if (pos.y > maxHeight) {
                enemy.moveDirection.y = -0.1; // Força suave para baixo
                pos.y = maxHeight;
            }

            // Aplicar movimento
            enemy.mesh.position.add(enemy.moveDirection.clone().multiplyScalar(enemy.speed));

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
            enemy._yaw += deltaYaw * 0.08; // Fator de suavidade
            // Aplica rotação: Yaw interpolado, Pitch 0, Roll visual
            enemy.mesh.rotation.set(0, enemy._yaw, 0);

            // --- Roll acompanha a curva ---
            const maxRoll = 0.6;
            // O roll é proporcional à diferença de yaw (quanto mais curva, mais roll)
            let targetRoll = THREE.MathUtils.clamp(-deltaYaw * 2, -maxRoll, maxRoll);
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
    }

    shoot(position, direction, isEnemy = false) {
        const now = Date.now();
        if (!isEnemy && now - this.lastShootTime < this.shootCooldown) return;

        const bulletGeometry = new THREE.SphereGeometry(0.08, 8, 8);
        const bulletMaterial = new THREE.MeshBasicMaterial({
            color: isEnemy ? 0xff0000 : 'rgba(21, 47, 131, 1)'
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
        const particleCount = 100;
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
}

export default EnemyManager;