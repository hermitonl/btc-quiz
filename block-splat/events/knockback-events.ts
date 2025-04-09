// Handles player - projectile collisions applying knockback to the player when applicable
import { type Entity, Audio } from "hytopia";
import {
  PROJECTILES,
  STRENGTH_BOOST_MULTIPLIER,
} from "../utilities/gameConfig";
import { FRIENDLY_FIRE_DISABLED } from "../utilities/gameConfig";
import CustomPlayerEntity from "../entities/CustomPlayerEntity";
import { globalState } from "../gameState/global-state";
import NPCEntity from "../entities/NPCEntity";
import { TEAM_COLOR_STRINGS } from "../gameState/team";

export function knockBackCollisionHandler(
  projectile: Entity,
  otherEntity: Entity,
  started: boolean,
  tag: string,
  color: string
) {
  // only allow if it's a different player who isn't respawning and the game is active
  if (otherEntity instanceof NPCEntity) {
    const team = otherEntity.getTeam();
    const colorString = TEAM_COLOR_STRINGS[team];
    if (colorString !== color && FRIENDLY_FIRE_DISABLED) {
      otherEntity.setLastHitBy(tag);
      applyKnockbackToEntity(otherEntity, projectile, 1);
    }
  }
  if (
    !(otherEntity instanceof CustomPlayerEntity) ||
    otherEntity.player.username === tag ||
    otherEntity.position.y > 40 ||
    !started
  )
    return;
  if (
    otherEntity.isInvincible() ||
    (FRIENDLY_FIRE_DISABLED &&
      color === TEAM_COLOR_STRINGS[otherEntity.getTeam()])
  ) {
    // despawn projectile if it's a friendly fire or the player is invincible so it doesn't bounce off them
    projectile.despawn();
    return;
  }

  if (started && projectile.isSpawned) {
    // tag player so we can reward kills
    otherEntity.setLastHitBy(tag);
    const shootingEntity = globalState.getPlayerEntity(tag);

    let multiplier = 1;
    if (shootingEntity && shootingEntity.isStrengthBoostActive()) {
      multiplier = STRENGTH_BOOST_MULTIPLIER;
    }

    applyKnockbackToEntity(otherEntity, projectile, multiplier);
  }
}

const applyKnockbackToEntity = (
  otherEntity: Entity,
  projectile: Entity,
  multiplier: number
) => {
  // Calculate direction from projectile to player
  const dx = projectile.linearVelocity.x;
  const dy = projectile.linearVelocity.y;
  const dz = projectile.linearVelocity.z;

  // Normalize the direction vector
  const length = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const normalizedDx = dx / length;
  const normalizedDy = dy / length;
  const normalizedDz = dz / length;

  // Calculate impact force based on relative velocity
  const impactForce =
    PROJECTILES[projectile.name as keyof typeof PROJECTILES].KNOCKBACK;
  const verticalForce = Math.max(normalizedDy, 0.5) * impactForce * 0.9;

  otherEntity.applyImpulse({
    x: normalizedDx * impactForce * multiplier,
    y: verticalForce,
    z: normalizedDz * impactForce * multiplier,
  });

  // immediately despawn slingshot projectiles
  if (projectile.name === PROJECTILES.SLINGSHOT.NAME) {
    projectile.despawn();
  }

  // Play hit sound
  if (otherEntity.world) {
    new Audio({
      uri: "audio/sfx/player/bow-hit.mp3",
      volume: 0.5,
      playbackRate: 1.5,
      position: otherEntity.position,
      referenceDistance: 10,
    }).play(otherEntity.world);
  }
};
