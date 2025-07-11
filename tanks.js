import * as THREE from 'three';

class TankManager {
    constructor(scene, ground) {
        this.scene = scene;
        this.ground = ground; // Referência ao terreno para posicionamento
        this.tanks = [];
        this.bullets = [];
        this.tankBullets = [];
        this.lastShootTime = 0;
        this.shootCooldown = 1500; // Cooldown de tiro do tanque (ms)
        this.boundarySize = 200;
        this.changeDirectionInterval = 5000; // Intervalo para reavaliar direção
        this.minTankDistance = 30;
        this.maxSpawnAttempts = 10;
        this.particles = [];
        this.tanksPerPhase = 8; // 10 tanques por fase
        this.shootRange = 30; // Alcance de tiro
    }

    createTank(playerPosition, spawnAttempt = 0) {
        // Só cria tanques se houver espaço na fase
        if (this.tanks.length >= this.tanksPerPhase) {
            return null;
        }

        // Evitar recursão infinita
        if (spawnAttempt >= this.maxSpawnAttempts) {
            console.log("Falha ao encontrar posição válida para o tanque");
            return null;
        }

        const randomAngle = Math.random() * Math.PI * 2;
        const distance = 90 + Math.random() * 40; // Distância aleatória do jogador
        
        // Posição inicial do tanque
        const spawnPosition = new THREE.Vector3(
            playerPosition.x + Math.cos(randomAngle) * distance,
            0.5, // Altura fixa acima do solo
            playerPosition.z - Math.sin(randomAngle) * distance
        );

        // Verificar distância de outros tanques
        let tooClose = false;
        for (const existingTank of this.tanks) {
            const dist = spawnPosition.distanceTo(existingTank.mesh.position);
            if (dist < this.minTankDistance) {
                tooClose = true;
                break;
            }
        }

        if (tooClose) {
            return this.createTank(playerPosition, spawnAttempt + 1);
        }

        // Criar o tanque usando o modelo fornecido
        const tank = new THREE.Group();
        
        // Esfera lateral 1 (vermelha)
        const geometry_1 = new THREE.SphereGeometry(1, 32, 32);
        const material_1 = new THREE.MeshStandardMaterial({
            color: 0xd30d0d,
            roughness: 1,
            metalness: 0
        });
        const mesh_1 = new THREE.Mesh(geometry_1, material_1);
        mesh_1.position.set(-0.922213, 0, 0);
        mesh_1.rotation.set(0, 0.036818, 0, 'XYZ');
        mesh_1.scale.set(0.196428, 0.360094, 1.291452);
        mesh_1.castShadow = true;
        mesh_1.receiveShadow = true;
        tank.add(mesh_1);

        // Corpo principal (azul)
        const geometry_2 = new THREE.BoxGeometry(1, 1, 1);
        const material_2 = new THREE.MeshStandardMaterial({
            color: 0x2b0b9d,
            roughness: 1,
            metalness: 0
        });
        const mesh_2 = new THREE.Mesh(geometry_2, material_2);
        mesh_2.position.set(0, 0.464608, 0);
        mesh_2.rotation.set(0, 0, 0, 'XYZ');
        mesh_2.scale.set(1.569663, 0.789484, 2.642825);
        mesh_2.castShadow = true;
        mesh_2.receiveShadow = true;
        tank.add(mesh_2);

        // Torre (vermelha)
        const geometry_3 = new THREE.BoxGeometry(1, 1, 1);
        const material_3 = new THREE.MeshStandardMaterial({
            color: 0xda101b,
            roughness: 1,
            metalness: 0
        });
        const mesh_3 = new THREE.Mesh(geometry_3, material_3);
        mesh_3.position.set(0, 0.948098, -0.311484);
        mesh_3.rotation.set(0, 0, 0, 'XYZ');
        mesh_3.scale.set(1, 1, 1.334645);
        mesh_3.castShadow = true;
        mesh_3.receiveShadow = true;
        tank.add(mesh_3);

        // Canhão (cinza)
        const geometry_4 = new THREE.CylinderGeometry(1, 1, 2, 32);
        const material_4 = new THREE.MeshStandardMaterial({
            color: 0xb6b5b4,
            roughness: 1,
            metalness: 0
        });
        const mesh_4 = new THREE.Mesh(geometry_4, material_4);
        mesh_4.position.set(0, 1.399013, 0.921679);
        mesh_4.rotation.set(1.217597, 0, 0, 'XYZ');
        mesh_4.scale.set(0.13521, 1, 0.140009);
        mesh_4.castShadow = true;
        mesh_4.receiveShadow = true;
        tank.add(mesh_4);

        // Esfera lateral 2 (vermelha)
        const geometry_5 = new THREE.SphereGeometry(1, 32, 32);
        const material_5 = new THREE.MeshStandardMaterial({
            color: 0xd30d0d,
            roughness: 1,
            metalness: 0
        });
        const mesh_5 = new THREE.Mesh(geometry_5, material_5);
        mesh_5.position.set(0.938974, 0, 0);
        mesh_5.rotation.set(0, 0, 0, 'XYZ');
        mesh_5.scale.set(0.165582, 0.360094, 1.291452);
        mesh_5.castShadow = true;
        mesh_5.receiveShadow = true;
        tank.add(mesh_5);

        // Posicionar o tanque
        tank.position.copy(spawnPosition);
        
        // Calcular direção inicial aleatória
        const randomDirection = new THREE.Vector3(
            Math.random() * 2 - 1,
            0, // Sem movimento vertical
            Math.random() * 2 - 1
        ).normalize();
        
        // Rotacionar o tanque para a direção do movimento
        tank.lookAt(tank.position.clone().add(randomDirection));
        
        // Escala do tanque
        const escala = 0.8;
        tank.scale.set(escala, escala, escala);

        // Adicionar à cena
        this.scene.add(tank);
        this.tanks.push({
            mesh: tank,
            health: 100,
            lastShootTime: 0,
            moveDirection: randomDirection,
            lastDirectionChange: Date.now(),
            speed: 0.03 + Math.random() * 0.02 // Velocidade mais lenta que os aviões
        });

        return tank;
    }

    updateTanks(playerPosition) {
        const now = Date.now();
        const tankForward = new THREE.Vector3();
        const directionToPlayer = new THREE.Vector3();

        this.tanks.forEach(tank => {
            // Lógica de Movimento
            if (now - tank.lastDirectionChange > this.changeDirectionInterval) {
                // Vetor na direção do jogador
                const targetDirection = new THREE.Vector3(
                    playerPosition.x - tank.mesh.position.x,
                    0, // Sem movimento vertical
                    playerPosition.z - tank.mesh.position.z
                ).normalize();

                // Vetor aleatório para adicionar variação
                const randomDirection = new THREE.Vector3(
                    Math.random() * 2 - 1,
                    0, // Sem movimento vertical
                    Math.random() * 2 - 1
                ).normalize();

                // Mistura a direção do jogador com a aleatória (60% jogador, 40% aleatório)
                const newDir = targetDirection.multiplyScalar(0.6).add(randomDirection.multiplyScalar(0.4)).normalize();
                newDir.y = 0; // Garantir que não há movimento vertical

                // Suaviza a mudança de direção
                tank.moveDirection.lerp(newDir, 0.3).normalize();
                tank.lastDirectionChange = now;
            }

            // Verificações de limites X e Z
            const pos = tank.mesh.position;
            if (Math.abs(pos.x) > this.boundarySize) {
                tank.moveDirection.x *= -1;
                pos.x = Math.sign(pos.x) * this.boundarySize;
            }
            if (Math.abs(pos.z) > this.boundarySize) {
                tank.moveDirection.z *= -1;
                pos.z = Math.sign(pos.z) * this.boundarySize;
            }

            // Aplicar movimento
            tank.mesh.position.add(tank.moveDirection.clone().multiplyScalar(tank.speed));
            
            // Manter altura constante acima do solo
            tank.mesh.position.y = 0.1;

            // Atualizar rotação suavemente
            const targetPos = tank.mesh.position.clone().add(tank.moveDirection);
            targetPos.y = tank.mesh.position.y; // Manter mesma altura
            tank.mesh.lookAt(targetPos);

            // Lógica de Tiro
            if (now - tank.lastShootTime > this.shootCooldown) {
                // Calcular distância até o jogador
                const distanceToPlayer = tank.mesh.position.distanceTo(playerPosition);
                
                // Só atirar se estiver dentro do alcance
                if (distanceToPlayer <= this.shootRange) {
                    tank.mesh.getWorldDirection(tankForward);
                    directionToPlayer.subVectors(playerPosition, tank.mesh.position).normalize();
                    const dotProduct = tankForward.dot(directionToPlayer);

                    if (dotProduct > 0.7) { // Se o jogador estiver na frente do tanque
                        // Posição de tiro a partir do canhão
                        const shootPosition = tank.mesh.position.clone();
                        shootPosition.y += 1.0; // Altura do canhão
                        this.shoot(shootPosition, directionToPlayer, true);
                        tank.lastShootTime = now;
                    }
                }
            }
        });
        
        this.updateParticles();
    }

    shoot(position, direction, isEnemy = true) {
        const bulletGeometry = new THREE.SphereGeometry(0.2, 8, 8);
        const bulletMaterial = new THREE.MeshBasicMaterial({
            color: 0xff0000 // Projéteis vermelhos
        });
        const bullet = new THREE.Mesh(bulletGeometry, bulletMaterial);
        
        // Clonar posição para evitar problemas de referência
        bullet.position.copy(position);
        
        // Criar vetor de velocidade e normalizar para velocidade consistente
        const speed = 0.6;
        bullet.velocity = direction.clone().normalize().multiplyScalar(speed);
        
        this.scene.add(bullet);
        this.tankBullets.push(bullet);
    }

    updateBullets() {
        // Atualizar projéteis dos tanques
        for (let i = this.tankBullets.length - 1; i >= 0; i--) {
            const bullet = this.tankBullets[i];
            if (bullet && bullet.velocity) {
                // Mover o projétil na direção da velocidade
                bullet.position.add(bullet.velocity);
            }
            
            // Remover projéteis que estão muito longe
            const distanceFromOrigin = bullet.position.length();
            if (distanceFromOrigin > 200) {
                this.scene.remove(bullet);
                this.tankBullets.splice(i, 1);
            }
        }
    }

    checkBulletCollision(bullet, targetMesh) {
        if (!targetMesh || !bullet) {
            return false;
        }
        
        const distance = bullet.position.distanceTo(targetMesh.position);
        const collisionThreshold = 1.0; // Raio de colisão maior para os tanques
        
        return distance < collisionThreshold;
    }

    createExplosion(position) {
        const particleCount = 100;
        const particleGeometry = new THREE.BufferGeometry();
        const positions = [];
        const colors = [];
        const color = new THREE.Color();

        for (let i = 0; i < particleCount; i++) {
            positions.push((Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5);
            color.setHSL(Math.random() * 0.1 + 0.05, 1, 0.5); // Tons de laranja/vermelho
            colors.push(color.r, color.g, color.b);
        }

        particleGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        particleGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

        const particleMaterial = new THREE.PointsMaterial({
            size: 0.3,
            vertexColors: true,
            transparent: true,
            opacity: 0.8,
            sizeAttenuation: true
        });

        const points = new THREE.Points(particleGeometry, particleMaterial);
        points.position.copy(position);

        this.scene.add(points);
        this.particles.push({ mesh: points, life: 1.0, type: 'explosion' });
    }

    updateParticles() {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const particle = this.particles[i];
            particle.life -= 0.02;

            if (particle.type === 'explosion') {
                particle.mesh.material.opacity = particle.life;
                particle.mesh.scale.multiplyScalar(1.05);
            }

            if (particle.life <= 0) {
                this.scene.remove(particle.mesh);
                this.particles.splice(i, 1);
            }
        }
    }

    // Iniciar próxima fase
    startNextPhase(playerPosition) {
        // Criar novos tanques para a nova fase
        for (let i = 0; i < this.tanksPerPhase; i++) {
            this.createTank(playerPosition);
        }
    }

    reset() {
        // Limpar tanques, balas e partículas existentes
        this.tanks.forEach(tank => this.scene.remove(tank.mesh));
        this.tanks = [];
        this.tankBullets.forEach(bullet => this.scene.remove(bullet));
        this.tankBullets = [];
        this.particles.forEach(particle => this.scene.remove(particle.mesh));
        this.particles = [];
    }
}

export default TankManager;