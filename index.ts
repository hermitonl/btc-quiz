import {
  startServer,
  Audio,
  PlayerEntity,
  PlayerEvent,
  Entity,     // Use standard Entity for NPC
  Vector3,    // Import Vector3 for positions/directions
  World,      // Import World type for function signatures
  Player,     // Import Player type
  EntityEvent // Import EntityEvent
} from 'hytopia';

import worldMap from './assets/map.json';

// --- Configuration ---
const PLAYER_MAX_HEALTH = 100;
const NPC_MAX_HEALTH = 50;
const PLAYER_ATTACK_DAMAGE = 10; // Player deals damage by colliding
const NPC_ATTACK_DAMAGE = 2; // NPC deals damage by colliding
const ATTACK_RANGE = 3; // Max distance for attacks
const NPC_ATTACK_INTERVAL = 5000; // Milliseconds between attacks (for both player and NPC)
const PLAYER_ATTACK_COOLDOWN = 1000; // Cooldown for player attacks via collision

// --- State Management ---
// Using Maps to store custom state associated with entity IDs
const entityState = new Map<number, { health: number; isDead: boolean; type: 'player' | 'npc' }>(); // Key is entity.id (number)
const npcState = new Map<number, { lastAttackTime: number; lastDamageTime: number; attackIntervalId: NodeJS.Timeout | null }>(); // Key is entity.id (number)
const playerState = new Map<number, { checkDeathIntervalId: NodeJS.Timeout | null; lastAttackTime: number; }>(); // Key is playerEntity.id (number)

// --- Helper Function ---
function applyDamage(target: Entity, damage: number, world: World) {
  if (target.id === undefined) return; // Guard against undefined ID
  const state = entityState.get(target.id);
  if (!state || state.isDead) { // Don't damage dead entities or entities without state
    // console.warn(`Entity ${target.id} has no state tracked or is dead.`); // Optional logging
    return;
  }

  state.health -= damage;
  console.log(`Entity ${target.id} (${state.type}) took ${damage} damage. Health: ${state.health}`);

  // Optional: Add visual/audio feedback for damage
  // target.playAnimationOnce('damage_animation'); // Example
  // new Audio({ uri: 'audio/sfx/damage/hit.mp3' }).playAt(target.position, world); // Example

  if (state.health <= 0) {
    state.health = 0;
    state.isDead = true;
    console.log(`Entity ${target.id} (${state.type}) has died.`);

    // Clean up specific intervals if they exist
    if (state.type === 'npc') {
        if (target.id === undefined) return; // Guard
        const npcSpecificState = npcState.get(target.id);
        if (npcSpecificState?.attackIntervalId) {
            clearInterval(npcSpecificState.attackIntervalId);
            npcSpecificState.attackIntervalId = null; // Prevent further AI ticks
        }
    } else if (state.type === 'player') {
        // Use target.id for player state lookup as well
        if (target.id === undefined) return; // Guard
        const playerSpecificState = playerState.get(target.id);
        if (playerSpecificState?.checkDeathIntervalId) {
            clearInterval(playerSpecificState.checkDeathIntervalId); // Stop the death check loop
        }
        // Note: Player input listeners are cleaned up on leave event
    }


    // Optional: Play death animation/sound
    // target.playAnimationOnce('death_animation'); // Example
    // Despawn after a delay
    const targetId = target.id; // Capture ID before setTimeout
    setTimeout(() => {
      if (target.world) { // Check if still in world
         target.despawn(); // Despawn the entity
         console.log(`Entity ${targetId} despawned after dying.`); // Use captured ID
         // Remove state from maps after despawn
         if (targetId !== undefined) { // Guard with captured ID
             entityState.delete(targetId);
             if (state.type === 'npc') npcState.delete(targetId);
             if (state.type === 'player') playerState.delete(targetId); // Use captured ID here too
         }
      }
    }, 3000); // Despawn after 3 seconds
  }
}

// --- NPC Management ---
function createRoboNPC(world: World, position: Vector3): Entity | null {
    // Create Entity with world and options
    // Create Entity with options only
    const npcEntity = new Entity({
        name: 'RoboNPC',
        // Using skeleton as placeholder for robotic appearance - REMOVED due to errors
        // modelUri: 'assets/models/players/player.gltf', // Use player model for testing
        // modelLoopedAnimations: ['idle'], // Assuming skeleton has an 'idle' animation
        // modelScale: 0.5, // Adjust scale as needed
        // Reverting to modelUri based on example code path structure
        modelUri: 'models/npcs/skeleton.gltf', // Path relative to assets root
        modelLoopedAnimations: ['idle'], // Add back animation
        modelScale: 0.5, // Add back scale
        // Removed collider and rigidbody due to errors
    });

    // Spawn the entity in the world
    npcEntity.spawn(world, position);

    // Initialize and store state
    // Check if entity creation failed or ID is missing
    if (!npcEntity || npcEntity.id === undefined) {
        console.error("Failed to create NPC entity or entity has no ID.");
        return null;
    }

    const npcId = npcEntity.id; // Capture ID for use in closures
    const state = { health: NPC_MAX_HEALTH, isDead: false, type: 'npc' as const };
    entityState.set(npcId, state);
    const npcSpecificState = { lastAttackTime: 0, lastDamageTime: 0, attackIntervalId: null as NodeJS.Timeout | null }; // Added lastDamageTime
    npcState.set(npcId, npcSpecificState);

    console.log(`RoboNPC ${npcId} spawned at ${position.x}, ${position.y}, ${position.z} with ${state.health} HP.`);

    // --- NPC AI Logic (AI Tick) ---
    const aiTick = () => {
        if (!npcEntity.world || state.isDead) { // Stop if despawned or dead
            if (npcSpecificState.attackIntervalId) {
                clearInterval(npcSpecificState.attackIntervalId);
                npcSpecificState.attackIntervalId = null;
            }
            return;
        }

        // Find nearby players
        const nearbyPlayers: PlayerEntity[] = [];
        const allPlayers = world.entityManager.getAllPlayerEntities(); // Use getAllPlayerEntities
        for (const playerEntity of allPlayers) {
            if (playerEntity.id === undefined) continue; // Guard
            const playerStateCheck = entityState.get(playerEntity.id); // Use playerEntity.id
            if (playerStateCheck && !playerStateCheck.isDead) { // Check if player is alive
                const dx = npcEntity.position.x - playerEntity.position.x;
                const dy = npcEntity.position.y - playerEntity.position.y;
                const dz = npcEntity.position.z - playerEntity.position.z;
                const distance = Math.sqrt(dx*dx + dy*dy + dz*dz);
                if (distance <= ATTACK_RANGE) {
                    nearbyPlayers.push(playerEntity);
                }
            }
        }

        // Attack the first nearby player found if cooldown allows
        if (nearbyPlayers.length > 0 && Date.now() - npcSpecificState.lastAttackTime > NPC_ATTACK_INTERVAL) {
            const targetPlayerEntity = nearbyPlayers[0];
            if (targetPlayerEntity) { // Check if target exists
                console.log(`NPC ${npcId} attacking Player ${targetPlayerEntity.id}`);
                applyDamage(targetPlayerEntity, NPC_ATTACK_DAMAGE, world);
                npcSpecificState.lastAttackTime = Date.now(); // Update last attack time
                // Optional: Play attack animation/sound
                // npcEntity.playAnimationOnce('attack');
            }
        }
    };

    // Start AI loop
    npcSpecificState.attackIntervalId = setInterval(aiTick, 500); // Check every 500ms

    // --- NPC Collision Logic ---
    // Assuming EntityEvent.COLLISION exists and provides { entity: Entity, otherEntity: Entity }
    npcEntity.on(EntityEvent.COLLISION, ({ entity, otherEntity }) => {
        // Check if the collision is between the NPC and a PlayerEntity
        // Ensure both entities exist and the NPC is alive
        if (entity === npcEntity && otherEntity instanceof PlayerEntity && !state.isDead) {
            const now = Date.now();
            // Check cooldown for player attacking NPC
            if (now - npcSpecificState.lastDamageTime > PLAYER_ATTACK_COOLDOWN) { // Use PLAYER_ATTACK_COOLDOWN
                console.log(`Player ${otherEntity.id} collided with NPC ${npcEntity.id}`);
                applyDamage(npcEntity, PLAYER_ATTACK_DAMAGE, world); // Apply damage to NPC
                npcSpecificState.lastDamageTime = now; // Update last damage time
            }
        } else if (entity instanceof PlayerEntity && otherEntity === npcEntity && !state.isDead) {
            // Handle the case where the event might be triggered on the player instead
            const now = Date.now();
            // Check cooldown for player attacking NPC
            if (now - npcSpecificState.lastDamageTime > PLAYER_ATTACK_COOLDOWN) { // Use PLAYER_ATTACK_COOLDOWN
                console.log(`Player ${entity.id} collided with NPC ${npcEntity.id}`);
                applyDamage(npcEntity, PLAYER_ATTACK_DAMAGE, world); // Apply damage to NPC
                npcSpecificState.lastDamageTime = now; // Update last damage time
            }
        }
    });

    // --- NPC Despawn Logic ---
    // Removed npcEntity.on('despawn', ...) as cleanup is handled in applyDamage

    return npcEntity;
}

// --- Server Start ---
startServer(world => {
  // world.simulation.enableDebugRendering(true); // Keep commented out unless debugging physics

  world.loadMap(worldMap);

  // Spawn one NPC initially using the factory function
  createRoboNPC(world, new Vector3(5, 5, 5)); // Use new Vector3

  // --- Player Join Logic ---
  world.on(PlayerEvent.JOINED_WORLD, ({ player }) => {
    const playerEntity = new PlayerEntity({
      player,
      name: 'Player',
      // Using default player model, ideally replace with a robot model
      // Reverting PlayerEntity back to block texture due to persistent model loading errors
      // Reverting to modelUri based on example code path structure
      modelUri: 'models/players/player.gltf', // Path relative to assets root
      modelLoopedAnimations: ['idle'], // Add back animation
      modelScale: 0.5, // Add back scale
      // blockTextureUri: 'textures/blocks/bricks.png', // Remove block texture
      // blockHalfExtents: { x: 0.5, y: 0.5, z: 0.5 }, // Remove block extents
      // Collider/RigidBody are usually default for PlayerEntity, no need to specify unless overriding
    });

    // Spawn the player entity first
    playerEntity.spawn(world, new Vector3(0, 10, 0)); // Use new Vector3

    // Initialize player state AFTER spawning, checking for ID
    if (playerEntity.id === undefined) {
        // If ID is still undefined after spawn, something is wrong. Log and exit for this player.
        console.error(`Player entity for ${player.username} still has no ID after spawn. Cannot track state.`);
        // Do NOT call despawn here as it might not be valid if spawn failed internally
        return; // Stop processing this player
    }
    const playerInitialState = { health: PLAYER_MAX_HEALTH, isDead: false, type: 'player' as const };
    entityState.set(playerEntity.id, playerInitialState); // Use the now-defined ID
    const playerSpecificState = { checkDeathIntervalId: null as NodeJS.Timeout | null, lastAttackTime: 0 }; // Added lastAttackTime
    playerState.set(playerEntity.id, playerSpecificState); // Use the now-defined ID

    // Player already spawned above

    player.ui.load('ui/index.html');

    world.chatManager.sendPlayerMessage(player, 'Welcome to the Robo-Game!', '00FF00');
    world.chatManager.sendPlayerMessage(player, 'Bump into NPCs to attack them!'); // Updated hint
    world.chatManager.sendPlayerMessage(player, `Your HP: ${playerInitialState.health}/${PLAYER_MAX_HEALTH}`);
    // world.chatManager.sendPlayerMessage(player, 'Press \\ to enter or exit debug view.'); // Keep if needed

    // --- Player Death/Respawn Logic ---
    // Simple check interval for player death to trigger respawn message
    // More robust handling might involve events or state machines
    // Get the specific state for this player to store the interval ID
    if (playerEntity.id === undefined) return; // Guard added earlier, but double-check
    const currentPlayerSpecificState = playerState.get(playerEntity.id);

    if (currentPlayerSpecificState) { // Should always exist, but check for safety
        const deathCheckIntervalId: NodeJS.Timeout = setInterval(() => {
            if (playerEntity.id === undefined) { // Guard inside interval
                 clearInterval(deathCheckIntervalId);
                 return;
            }
            const currentState = entityState.get(playerEntity.id); // Get current health state

            if (!playerEntity.world || !currentState) { // Player entity despawned or state removed
                if (currentPlayerSpecificState.checkDeathIntervalId) {
                    clearInterval(deathCheckIntervalId); // Use the correct interval ID
                }
                return;
            }

            if (currentState.isDead) {
                world.chatManager.sendPlayerMessage(player, 'You died! You will despawn shortly.', 'FF0000');
                if (currentPlayerSpecificState.checkDeathIntervalId) {
                    clearInterval(deathCheckIntervalId); // Use the correct interval ID
                }
                // Despawn is handled by applyDamage timeout
            } else {
                 // Optional: Update health display periodically?
                 // player.ui.call('updateHealth', { current: currentState.health, max: PLAYER_MAX_HEALTH });
            }
        }, 1000); // Check every second
        currentPlayerSpecificState.checkDeathIntervalId = deathCheckIntervalId; // Store the ID
    }


    // --- Cleanup on Player Leave ---
    // Ensure listeners and intervals are cleaned up when the player leaves
    // to prevent memory leaks if the player entity instance isn't garbage collected immediately.
    const leaveListener = ({ player: leavingPlayer }: { player: Player }) => {
        if (leavingPlayer.id === player.id) {
            console.log(`Cleaning up resources for player ${player.username} (ID: ${player.id})`);
            // Unregister the command handler when the player leaves
            // world.chatManager.unregisterCommand(attackCommand); // Command removed
            // Unregister the command handler when the player leaves
            // world.chatManager.unregisterCommand(attackCommand); // Removed from here
            // Key listener is global, no need to unregister here

            // Clear the death check interval using the stored ID
            if (playerEntity.id === undefined) return; // Guard
            const playerSpecificState = playerState.get(playerEntity.id);
            if (playerSpecificState?.checkDeathIntervalId) {
                clearInterval(playerSpecificState.checkDeathIntervalId);
                playerSpecificState.checkDeathIntervalId = null;
            }
            // Note: State maps are cleaned up when entity despawns (either via death or leave)
            world.off(PlayerEvent.LEFT_WORLD, leaveListener); // Remove this listener itself
        }
    };
    world.on(PlayerEvent.LEFT_WORLD, leaveListener);

  }); // END JOINED_WORLD

  // --- Global Event Listeners ---
  // Removed global attack listener

  // --- Player Leave Logic (Main Handler) ---
  // This part just handles the despawning of entities.
  // Specific listener cleanup (like death check interval) is handled within the JOINED_WORLD scope.
  world.on(PlayerEvent.LEFT_WORLD, ({ player }) => {
    // Despawn all entities associated with the player
    const entitiesToDespawn = world.entityManager.getPlayerEntitiesByPlayer(player);
    console.log(`Player ${player.username} left. Despawning ${entitiesToDespawn.length} associated entities.`);
    entitiesToDespawn.forEach(entity => {
        if (entity.world) {
             console.log(`Despawning entity ${entity.id} for leaving player ${player.username}`);
             entity.despawn(); // Despawn triggers state cleanup via 'despawn' event or applyDamage
        }
    });
  });

  // --- Commands ---
  // Removed /attack command, keeping /rocket for now
  world.chatManager.registerCommand('/rocket', player => {
    world.entityManager.getPlayerEntitiesByPlayer(player).forEach((entity: PlayerEntity) => {
      if (entity.id === undefined) return; // Guard
      const state = entityState.get(entity.id);
      // Don't rocket dead, despawned, or state-missing players
      if (state && !state.isDead && entity.world) {
          entity.applyImpulse(new Vector3(0, 20, 0)); // Use new Vector3
      }
    });
  });

  // --- Ambient Audio ---
  new Audio({
    uri: 'assets/audio/music/hytopia-main.mp3', // Maybe change to a more robotic theme later?
    loop: true,
    volume: 0.1,
  }).play(world);

  console.log("Robo-Game server initialized.");
}); // END startServer
