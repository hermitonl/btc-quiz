// helper functions for spawning projectiles
import {
  type Vector3Like,
  type QuaternionLike,
  World,
  Entity,
  RigidBodyType,
  BlockType,
  Audio,
  EntityEvent,
} from "hytopia";
import { knockBackCollisionHandler } from "../events/knockback-events";
import { blockIds } from "./block-utils";
import { TEAM_COLOR_STRINGS, TEAM_COLORS } from "../gameState/team";
import {
  PROJECTILES,
  SLINGSHOT_OFFSET,
  SLINGSHOT_SPEED_OFFSET,
  type ProjectileType,
} from "./gameConfig";

export function spawnProjectile(
  world: World,
  coordinate: Vector3Like,
  direction: Vector3Like,
  tag: string,
  color: string,
  type: ProjectileType
) {
  // Spawn a projectileEntity when the player shoots.
  const projectileEntity = createProjectileEntity(direction, tag, color, type);

  let projectiles = [projectileEntity];
  if (type === PROJECTILES.SLINGSHOT.NAME) {
    // create two additional orbs to the left and right of the original
    const leftDirection = rotateDirectionVector(direction, -SLINGSHOT_OFFSET);
    const rightDirection = rotateDirectionVector(direction, SLINGSHOT_OFFSET);
    const leftOrb = createProjectileEntity(
      leftDirection,
      tag,
      color,
      PROJECTILES.SLINGSHOT.NAME as ProjectileType,
      SLINGSHOT_SPEED_OFFSET
    );
    const rightOrb = createProjectileEntity(
      rightDirection,
      tag,
      color,
      PROJECTILES.SLINGSHOT.NAME as ProjectileType,
      SLINGSHOT_SPEED_OFFSET
    );
    projectiles.push(leftOrb, rightOrb);
  }

  projectiles.forEach((projectile) => {
    projectile.on(EntityEvent.ENTITY_COLLISION, ({ entity, otherEntity, started }) => {
      knockBackCollisionHandler(
        entity,
        otherEntity,
        started,
        tag,
        color
      );
    });
  });

  projectiles.forEach((projectile) => {
    projectile.on(EntityEvent.BLOCK_COLLISION, ({ blockType, entity, started, colliderHandleA, colliderHandleB }) => {
      // If the projectileEntity hits a block, despawn it
      if (started && !blockIds.includes(blockType.id)) {
        entity.despawn();
      }
    });
  });

  projectiles.forEach((projectile) => {
    projectile.spawn(world, coordinate);
  });

  // SWOOSH!
  const audio = new Audio({
    uri: "audio/sfx/player/player-swing-woosh.mp3",
    playbackRate: 2,
    volume: 0.5,
    referenceDistance: 10,
    position: coordinate,
    loop: false,
  });

  audio.play(world);
  return projectileEntity;
}

function getRotationFromDirection(direction: Vector3Like): QuaternionLike {
  // Calculate yaw (rotation around Y-axis)
  const yaw = Math.atan2(-direction.x, -direction.z);

  // Calculate pitch (rotation around X-axis)
  const pitch = Math.asin(direction.y);

  // Pre-calculate common terms
  const halfYaw = yaw * 0.5;
  const halfPitch = pitch * 0.5;
  const cosHalfYaw = Math.cos(halfYaw);
  const sinHalfYaw = Math.sin(halfYaw);
  const cosHalfPitch = Math.cos(halfPitch);
  const sinHalfPitch = Math.sin(halfPitch);

  // Convert to quaternion
  return {
    x: sinHalfPitch * cosHalfYaw,
    y: sinHalfYaw * cosHalfPitch,
    z: sinHalfYaw * sinHalfPitch,
    w: cosHalfPitch * cosHalfYaw,
  };
}

function createProjectileEntity(
  direction: Vector3Like,
  tag: string,
  color: string,
  type: ProjectileType,
  speedOffset: number = 0
) {
  const projectile = PROJECTILES[type];

  const projectileEntity = new Entity({
    name: projectile.NAME,
    modelUri: projectile.MODEL_URI,
    modelScale: projectile.MODEL_SCALE,
    tintColor:
      color === TEAM_COLOR_STRINGS[TEAM_COLORS.RED]
        ? { r: 255, g: 0, b: 0 }
        : { r: 0, g: 0, b: 255 },
    rigidBodyOptions: {
      type: RigidBodyType.DYNAMIC,
      linearVelocity: {
        x: direction.x * (projectile.SPEED + speedOffset),
        y: direction.y * (projectile.SPEED + speedOffset),
        z: direction.z * (projectile.SPEED + speedOffset),
      },
      rotation: getRotationFromDirection(direction),
      ccdEnabled: projectile.CCD_ENABLED,
    },
    tag: tag,
  });
  return projectileEntity;
}

function rotateDirectionVector(
  direction: Vector3Like,
  angleInDegrees: number
): Vector3Like {
  // Convert angle to radians
  const angle = (angleInDegrees * Math.PI) / 180;

  // Rotate around Y axis
  const cosAngle = Math.cos(angle);
  const sinAngle = Math.sin(angle);

  return {
    x: direction.x * cosAngle - direction.z * sinAngle,
    y: direction.y,
    z: direction.x * sinAngle + direction.z * cosAngle,
  };
}
