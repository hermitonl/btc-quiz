import { PlayerEntity, type Vector3Like, type World, Audio } from "hytopia";

import type { Entity } from "hytopia";
import type { BlockType } from "hytopia";
import type Game from "../gameState/game";
import { PlayerClass} from "../entities/player-types";
import {
  BLOCK_STATE,
  blockIds,
  BLUE_BLOCK_ID,
  RED_BLOCK_ID,
  setBlockState,
} from "../utilities/block-utils";
import { PROJECTILES, USE_PARTICLES } from "../utilities/gameConfig";
import { TEAM_COLORS } from "../gameState/team";
import { ParticleEmitter } from "../particles/particle-emmitter";
import { ParticleFX } from "../particles/particles-fx";
import { globalState } from "../gameState/global-state";
import CustomPlayerEntity from "../entities/CustomPlayerEntity";
import NPCEntity from "../entities/NPCEntity";
const BLOB_CHECK_PATTERN = [
  [0, 0, 0], // Center block
  [0, 1, 0], // Above
  [0, -1, 0], // Below
  [1, 0, 0], // East
  [-1, 0, 0], // West
  [0, 0, 1], // North
  [0, 0, -1], // South
  // Diagonals if needed for blob
  [1, 0, 1],
  [-1, 0, 1],
  [1, 0, -1],
  [-1, 0, -1],
  [-1, -1, -1],
  [1, -1, -1],
  [0, -1, 1],
  [0, -1, -1],
  [1, -1, 1],
  [-1, -1, 1],
];

// Cache frequently used values
const BLOCK_COLORS = {
  BLUE: {
    state: BLOCK_STATE.BLUE,
    id: BLUE_BLOCK_ID,
    particleFX: ParticleFX.BLUE_PAINT
  },
  RED: {
    state: BLOCK_STATE.RED, 
    id: RED_BLOCK_ID,
    particleFX: ParticleFX.RED_PAINT
  }
};

// Update the pre-calculated patterns
const PROJECTILE_CHECK_PATTERN = [
  [0, 0, 0], // Center block
  [0, 1, 0], // Above
  [0, -1, 0], // Below
  [1, 0, 0], // East
  [-1, 0, 0], // West
  [0, 0, 1], // North
  [0, 0, -1], // South
]; // Give more options to find 2 blocks

// Pre-calculate block check patterns

export function onBlockHit(
  type: BlockType,
  entity: Entity,
  started: boolean,
  colliderHandleA: number,
  colliderHandleB: number,
  world: World,
  game: Game,
  blockStateMap: Map<string, BLOCK_STATE>
) {
  // Early exit conditions
  if (!started || !blockIds.includes(type.id) || !game.isGameRunning || entity instanceof NPCEntity) return;

  if (!(entity instanceof PlayerEntity)) {
    handleProjectileHit(entity, colliderHandleA, colliderHandleB, world, game, blockStateMap);
  } else {
    handlePlayerHit(entity, world, game, blockStateMap);
  }
}

function handleProjectileHit(
  entity: Entity,
  colliderHandleA: number,
  colliderHandleB: number,
  world: World,
  game: Game,
  blockStateMap: Map<string, BLOCK_STATE>
) {
  if (!entity.tag) return;
  const playerEntity = globalState.getPlayerEntity(entity.tag);
  let teamColor = "BLUE";
  let colorData = BLOCK_COLORS.BLUE;
  if(!playerEntity) {
    // check Bot_1 for team id
    const teamId = entity.tag.split("_")[1];
    teamColor = teamId === "1" ? "BLUE" : "RED";
    colorData = BLOCK_COLORS[teamColor as keyof typeof BLOCK_COLORS];
  } else {
    teamColor = playerEntity.getTeam() === TEAM_COLORS.BLUE ? "BLUE" : "RED";
    colorData = BLOCK_COLORS[teamColor as keyof typeof BLOCK_COLORS];
  }
  
  const contactPoint = getContactPoint(world, colliderHandleA, colliderHandleB);
  if (!contactPoint) return;

  const position = {
    x: Math.round(contactPoint.x),
    y: Math.floor(contactPoint.y),
    z: Math.round(contactPoint.z),
  };

  const isSmallProjectile = entity.name === PROJECTILES.SLINGSHOT.NAME || 
                           entity.name === PROJECTILES.SNIPER.NAME;
  const checkPattern = isSmallProjectile ? PROJECTILE_CHECK_PATTERN : BLOB_CHECK_PATTERN;
  const maxBlocks = isSmallProjectile ? 2 : 12;

  const blocksColored = colorBlocks(
    position,
    colorData,
    checkPattern,
    maxBlocks,
    world,
    game,
    blockStateMap
  );

  if (blocksColored > 0) {
    handleEffects(position, colorData, world);
    playerEntity?.incrementPlayerPoints(blocksColored);
  }

  if (entity.isSpawned) {
    entity.despawn();
  }
}

function handlePlayerHit(
  entity: PlayerEntity,
  world: World,
  game: Game,
  blockStateMap: Map<string, BLOCK_STATE>
) {
  const playerEntity = globalState.getPlayerEntity(entity.player.username);
  if (playerEntity?.getPlayerClass() !== PlayerClass.RUNNER) return;

  const teamColor = playerEntity?.getTeam() === TEAM_COLORS.BLUE ? "BLUE" : "RED";
  const colorData = BLOCK_COLORS[teamColor as keyof typeof BLOCK_COLORS];
  const position = entity.position;

  const blockPos = {
    x: Math.floor(position.x),
    y: Math.floor(position.y - 1),
    z: Math.floor(position.z),
  };

  const nearbyBlocks = getNearbyBlocks(blockPos);
  colorRunnerBlocks(nearbyBlocks, colorData, world, game, blockStateMap, playerEntity);
}

// Helper functions
function getContactPoint(world: World, handleA: number, handleB: number): Vector3Like | undefined {
  const manifolds = world.simulation.getContactManifolds(handleA, handleB);
  for (const manifold of manifolds) {
    if (manifold.contactPoints.length > 0) {
      return manifold.contactPoints[0];
    }
  }
  return undefined;
}

function colorBlocks(
  position: Vector3Like,
  colorData: typeof BLOCK_COLORS.BLUE,
  pattern: typeof BLOB_CHECK_PATTERN,
  maxBlocks: number,
  world: World,
  game: Game,
  blockStateMap: Map<string, BLOCK_STATE>
): number {
  let blocksColored = 0;
  const isSmallProjectile = maxBlocks === 2;

  // For small projectiles, keep checking until we find 2 blocks or run out of positions
  if (isSmallProjectile) {
    for (const [dx, dy, dz] of pattern) {
      if (blocksColored >= maxBlocks) break;

      const blockPos = {
        x: position.x + dx,
        y: position.y + dy,
        z: position.z + dz,
      };

      const blockId = world.chunkLattice.getBlockId(blockPos);
      if (!blockIds.includes(blockId) || blockId === colorData.id) continue;

      updateBlockScore(blockId, colorData.state, game);
      world.chunkLattice.setBlock(blockPos, colorData.id);
      setBlockState(blockStateMap, blockPos, colorData.state);
      blocksColored++;
    }
  } else {
    // For larger projectiles (blobs), keep original behavior
    for (const [dx, dy, dz] of pattern) {
      if (blocksColored >= maxBlocks) break;

      const blockPos = {
        x: position.x + dx,
        y: position.y + dy,
        z: position.z + dz,
      };

      const blockId = world.chunkLattice.getBlockId(blockPos);
      if (!blockIds.includes(blockId) || blockId === colorData.id) continue;

      updateBlockScore(blockId, colorData.state, game);
      world.chunkLattice.setBlock(blockPos, colorData.id);
      setBlockState(blockStateMap, blockPos, colorData.state);
      blocksColored++;
    }
  }

  return blocksColored;
}

function handleEffects(position: Vector3Like, colorData: typeof BLOCK_COLORS.BLUE, world: World) {
  if (USE_PARTICLES) {
    const particleEmitter = new ParticleEmitter(colorData.particleFX, world);
    particleEmitter.spawn(world, {x: position.x, y: position.y + 2, z: position.z});
    particleEmitter.burst();
  }

  new Audio({
    uri: "audio/sfx/liquid/splash-01.mp3",
    playbackRate: 2,
    volume: 0.4,
    referenceDistance: 6,
    position: position,
    loop: false,
  }).play(world);
}

function updateBlockScore(oldBlockId: number, newState: BLOCK_STATE, game: Game) {
  if (oldBlockId === BLUE_BLOCK_ID) {
    game.changeScore(TEAM_COLORS.BLUE, -1);
  } else if (oldBlockId === RED_BLOCK_ID) {
    game.changeScore(TEAM_COLORS.RED, -1);
  }

  if (newState === BLOCK_STATE.BLUE) {
    game.changeScore(TEAM_COLORS.BLUE, 1);
  } else if (newState === BLOCK_STATE.RED) {
    game.changeScore(TEAM_COLORS.RED, 1);
  }
}

function getNearbyBlocks(blockPos: Vector3Like): Vector3Like[] {
  return [
    blockPos, // Block below player
    { x: blockPos.x + 1, y: blockPos.y + 1, z: blockPos.z },
    { x: blockPos.x - 1, y: blockPos.y + 1, z: blockPos.z },
    { x: blockPos.x, y: blockPos.y + 1, z: blockPos.z + 1 },
    { x: blockPos.x, y: blockPos.y + 1, z: blockPos.z - 1 },
  ];
}

function colorRunnerBlocks(
  blocks: Vector3Like[],
  colorData: typeof BLOCK_COLORS.BLUE,
  world: World,
  game: Game,
  blockStateMap: Map<string, BLOCK_STATE>,
  playerEntity: PlayerEntity
) {
  if(!(playerEntity instanceof CustomPlayerEntity)) return;
  for (const block of blocks) {
    const blockState = world.chunkLattice.getBlockId(block);
    
    // Skip if block is air or already colored correctly
    if (blockState === 0 || blockState === colorData.id) continue;

    // Update scores and block state
    updateBlockScore(blockState, colorData.state, game);
    world.chunkLattice.setBlock(block, colorData.id);
    setBlockState(blockStateMap, block, colorData.state);
    playerEntity.incrementPlayerPoints(1);
  }
}
