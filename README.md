# Simulador de Voo e Combate - Lógica de Funcionamento

Este documento detalha o funcionamento técnico das mecânicas do jogo, servindo como guia para replicação em outros projetos.

## 1. Sistema de Voo (Flight System)

O sistema de voo é baseado em transformações de matrizes no espaço 3D usando Three.js.

### Mecânica de Movimento
- **Translação**: O avião se move constantemente para frente em seu eixo local Z (`translateZ`). A distância percorrida em cada quadro é `velocidade * 0.01`.
- **Rotação (Yaw, Pitch, Roll)**:
  - **Yaw (Giro Horizontal)**: Alterado pelas setas Esquerda/Direita. Afeta a direção do movimento.
  - **Pitch (Inclinação Vertical)**: Alterado pelas setas Cima/Baixo. Permite subir ou descer.
  - **Roll (Inclinação Lateral)**: Não é controlado diretamente, mas é uma consequência do Yaw. Ao girar para os lados, o avião inclina lateralmente (`lerp`) para um efeito visual realista, retornando ao centro quando não há comando de curva.
- **Ordem de Rotação**: Definida como `'YXZ'` para evitar *Gimbal Lock* durante manobras comuns.

### Sistema de Combustível e Gravidade
- O combustível é consumido proporcionalmente à velocidade.
- Se o combustível acaba, a aceleração é desativada e uma força de gravidade constante é aplicada ao eixo Y, forçando uma descida gradual enquanto mantém a capacidade de manobra limitada.

### Pouso e Colisão com o Solo
- O sistema usa **Raycasting** vertical para detectar a distância exata até o terreno.
- **Pouso Suave**: Se o avião está sobre a pista, com altitude < 0.5 e velocidade < 2, ele entra em estado de pouso, restaurando vida e combustível.
- **Colisão**: Se tocar o solo fora da pista ou com velocidade alta, o dano é calculado proporcionalmente à velocidade de impacto.

---

## 2. Sistema de Tiros (Shooting)

### Projéteis do Jogador
- Ativado pela tecla **Z**.
- **Instanciação**: Um novo projétil (esfera) é criado na posição atual do bico do avião.
- **Vetor de Direção**: O tiro recebe o vetor frontal (`getWorldDirection`) do avião no momento do disparo.
- **Velocidade**: O projétil se move independentemente, somando o vetor de direção multiplicado por um escalar fixo em cada quadro.

---

## 3. Lógica dos Inimigos (AI)

O jogo possui dois tipos de inimigos com comportamentos distintos:

### Aeronaves Inimigas (Aviões)
1. **Perseguição Suave**: A cada intervalo de tempo, o inimigo calcula o vetor em direção ao jogador. Ele mistura essa direção (75%) com um componente aleatório (25%) para não parecer mecânico demais.
2. **Gerenciamento de Bordas**: Se o inimigo se aproxima dos limites do mapa (`boundarySize`), ele inicia uma curva suave para dentro, evitando "bater" na parede invisível.
3. **Desvio de Obstáculos (Montanhas)**:
   - Usa Raycasting frontal e nas pontas das asas para detectar montanhas.
   - **Slide Vector**: Ao detectar uma colisão iminente, o inimigo calcula a normal da face da montanha e projeta seu vetor de movimento sobre o plano dessa face, permitindo que ele "deslize" pela encosta em vez de colidir de frente.
4. **Espiral da Morte**: Ao ser destruído, o inimigo não desaparece imediatamente. Ele entra em um estado onde perde o controle, ganha uma rotação aleatória de *roll*, emite fumaça e cai em uma trajetória parabólica (gravidade) até atingir o solo e explodir.

### Tanques (Inimigos Terrestres)
1. **Movimento 2D**: Movem-se apenas nos eixos X e Z, com o Y fixo logo acima do solo.
2. **Reação a Obstáculos**: Quando detectam uma montanha, simplesmente invertem sua direção de movimento.
3. **Lógica de Tiro**: Ambos (aviões e tanques) usam um **Produto Escalar (Dot Product)** para verificar se o jogador está "na frente" de seus canhões antes de disparar, garantindo que só atirem quando tiverem ângulo de visão.

---

## 4. O Terreno (Terrain)

O terreno é gerado proceduralmente para otimizar desempenho e estética.

### Geometria
- Criado a partir de um `PlaneGeometry` denso (100x100 segmentos).
- **Heightmap**: As alturas (eixo Y) dos vértices são manipuladas usando funções matemáticas (`Math.sin` e `Math.cos`) para criar ondulações suaves de relevo, garantindo que a área da pista permaneça plana (Y=0).

### Texturização Procedural
- Em vez de carregar uma imagem pesada, o jogo usa o **Canvas API** para gerar uma textura de ruído (*noise*) em tempo de execução.
- As cores são misturadas entre verde (grama) e marrom (terra) com base em valores de ruído, criando uma variação orgânica sem repetições óbvias.

### Objetos e Colisão
- **Montanhas**: São `IcosahedronGeometry` com vértices deslocados aleatoriamente para parecerem rochosas.
- **BVH (Bounding Volume Hierarchy)**: Para que o Raycasting de colisão (especialmente dos inimigos contra montanhas) seja rápido, o terreno e as montanhas usam a biblioteca `three-mesh-bvh`, que organiza a geometria em uma árvore de busca espacial eficiente.
