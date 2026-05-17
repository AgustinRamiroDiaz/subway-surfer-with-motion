import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

const LANE_X = [-2.4, 0, 2.4] as const;
const PLAYER_Z = 2.6;
const OBSTACLE_SPAWN_Z = -18;
const OBSTACLE_DESPAWN_Z = 5.2;
const OBSTACLE_SPEED = 7.2;
const SPAWN_INTERVAL_MS = 2000;

type GameSceneProps = {
  playerColumn: number;
  laneLabel: string;
};

type Obstacle = {
  mesh: THREE.Mesh;
  lane: number;
  hit: boolean;
};

type GameStats = {
  dodged: number;
  hits: number;
  status: 'Running' | 'Hit';
};

function createRailMaterial(color: string) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.58,
    metalness: 0.32,
  });
}

export function GameScene({ playerColumn, laneLabel }: GameSceneProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const playerColumnRef = useRef(playerColumn);
  const [stats, setStats] = useState<GameStats>({
    dodged: 0,
    hits: 0,
    status: 'Running',
  });

  useEffect(() => {
    playerColumnRef.current = playerColumn;
  }, [playerColumn]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) {
      return undefined;
    }

    if (process.env.NODE_ENV === 'test') {
      return undefined;
    }

    let animationFrame = 0;
    let lastTime = performance.now();
    let lastSpawnAt = performance.now();
    let statusResetAt = 0;
    const obstacles: Obstacle[] = [];

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#101416');
    scene.fog = new THREE.Fog('#101416', 10, 30);

    const camera = new THREE.PerspectiveCamera(54, 1, 0.1, 100);
    camera.position.set(0, 4.4, 7.2);
    camera.lookAt(0, 0.2, -5);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.className = 'game-canvas';
    mount.appendChild(renderer.domElement);

    const ambient = new THREE.HemisphereLight('#dfffee', '#101416', 1.6);
    scene.add(ambient);

    const keyLight = new THREE.DirectionalLight('#ffffff', 2.6);
    keyLight.position.set(-4, 8, 5);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    scene.add(keyLight);

    const floorGeometry = new THREE.PlaneGeometry(9, 44);
    const floorMaterial = new THREE.MeshStandardMaterial({
      color: '#171d20',
      roughness: 0.82,
      metalness: 0.05,
    });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.z = -7;
    floor.receiveShadow = true;
    scene.add(floor);

    const railMaterial = createRailMaterial('#2fffb2');
    const dividerMaterial = createRailMaterial('#dce7df');
    const sleeperMaterial = new THREE.MeshStandardMaterial({
      color: '#2b3337',
      roughness: 0.74,
    });

    LANE_X.forEach((x) => {
      const railGeometry = new THREE.BoxGeometry(0.16, 0.1, 42);
      const leftRail = new THREE.Mesh(railGeometry, railMaterial);
      leftRail.position.set(x - 0.48, 0.05, -7);
      leftRail.castShadow = true;
      leftRail.receiveShadow = true;
      scene.add(leftRail);

      const rightRail = leftRail.clone();
      rightRail.position.x = x + 0.48;
      scene.add(rightRail);
    });

    [-1.2, 1.2].forEach((x) => {
      const divider = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.05, 42), dividerMaterial);
      divider.position.set(x, 0.08, -7);
      divider.receiveShadow = true;
      scene.add(divider);
    });

    for (let z = -26; z < 6; z += 1.45) {
      const sleeper = new THREE.Mesh(new THREE.BoxGeometry(7.3, 0.08, 0.14), sleeperMaterial);
      sleeper.position.set(0, 0.11, z);
      sleeper.receiveShadow = true;
      scene.add(sleeper);
    }

    const player = new THREE.Mesh(
      new THREE.SphereGeometry(0.48, 32, 32),
      new THREE.MeshStandardMaterial({
        color: '#2fffb2',
        emissive: '#0b5a3f',
        roughness: 0.38,
        metalness: 0.12,
      })
    );
    player.position.set(LANE_X[playerColumnRef.current], 0.62, PLAYER_Z);
    player.castShadow = true;
    scene.add(player);

    const obstacleGeometry = new THREE.SphereGeometry(0.74, 36, 36);
    const obstacleMaterial = new THREE.MeshStandardMaterial({
      color: '#ff5f7a',
      emissive: '#5a0b18',
      roughness: 0.42,
      metalness: 0.08,
    });

    const spawnObstacle = () => {
      const lane = Math.floor(Math.random() * LANE_X.length);
      const mesh = new THREE.Mesh(obstacleGeometry, obstacleMaterial.clone());
      mesh.position.set(LANE_X[lane], 0.82, OBSTACLE_SPAWN_Z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
      obstacles.push({ mesh, lane, hit: false });
    };

    const resize = () => {
      const { clientWidth, clientHeight } = mount;
      const width = Math.max(1, clientWidth);
      const height = Math.max(1, clientHeight);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mount);
    resize();

    const animate = (now: number) => {
      const delta = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;

      if (now - lastSpawnAt > SPAWN_INTERVAL_MS) {
        spawnObstacle();
        lastSpawnAt = now;
      }

      const targetX = LANE_X[playerColumnRef.current];
      player.position.x = THREE.MathUtils.lerp(player.position.x, targetX, 0.22);
      player.rotation.y += delta * 2;

      for (let index = obstacles.length - 1; index >= 0; index -= 1) {
        const obstacle = obstacles[index];
        obstacle.mesh.position.z += OBSTACLE_SPEED * delta;
        obstacle.mesh.rotation.x += delta * 2.8;
        obstacle.mesh.rotation.z += delta * 1.5;

        const isCollision =
          !obstacle.hit &&
          obstacle.lane === playerColumnRef.current &&
          Math.abs(obstacle.mesh.position.z - PLAYER_Z) < 0.78;

        if (isCollision) {
          obstacle.hit = true;
          obstacle.mesh.material = new THREE.MeshStandardMaterial({
            color: '#ffd166',
            emissive: '#6b3e00',
            roughness: 0.34,
          });
          statusResetAt = now + 650;
          setStats((current) => ({
            dodged: current.dodged,
            hits: current.hits + 1,
            status: 'Hit',
          }));
        }

        if (obstacle.mesh.position.z > OBSTACLE_DESPAWN_Z) {
          scene.remove(obstacle.mesh);
          if (Array.isArray(obstacle.mesh.material)) {
            obstacle.mesh.material.forEach((material) => material.dispose());
          } else {
            obstacle.mesh.material.dispose();
          }
          obstacles.splice(index, 1);
          if (!obstacle.hit) {
            setStats((current) => ({
              dodged: current.dodged + 1,
              hits: current.hits,
              status: current.status,
            }));
          }
        }
      }

      if (statusResetAt && now > statusResetAt) {
        statusResetAt = 0;
        setStats((current) => ({
          ...current,
          status: 'Running',
        }));
      }

      renderer.render(scene, camera);
      animationFrame = window.requestAnimationFrame(animate);
    };

    spawnObstacle();
    animationFrame = window.requestAnimationFrame(animate);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      obstacles.forEach((obstacle) => {
        scene.remove(obstacle.mesh);
        if (Array.isArray(obstacle.mesh.material)) {
          obstacle.mesh.material.forEach((material) => material.dispose());
        } else {
          obstacle.mesh.material.dispose();
        }
      });
      obstacleGeometry.dispose();
      floorGeometry.dispose();
      floorMaterial.dispose();
      railMaterial.dispose();
      dividerMaterial.dispose();
      sleeperMaterial.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return (
    <div className="game-scene" ref={mountRef}>
      <div className="stage-heading">
        <p className="eyebrow">Main game</p>
        <h1>Motion runner</h1>
      </div>
      <div className="game-hud" aria-label="Game status">
        <span>{stats.status}</span>
        <strong>{laneLabel}</strong>
      </div>
      <dl className="game-stats" aria-label="Game stats">
        <div>
          <dt>Dodged</dt>
          <dd>{stats.dodged}</dd>
        </div>
        <div>
          <dt>Hits</dt>
          <dd>{stats.hits}</dd>
        </div>
      </dl>
    </div>
  );
}
