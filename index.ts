import {
  startServer,
  Audio, // Keep for potential future use (or ambient sound)
  PlayerEntity,
  PlayerEvent,
  Vector3,
  World,
  Player,
  // EntityEvent, // Likely not needed now
  // Entity, // Likely not needed now
} from 'hytopia';

// Use the specified boilerplate map
import worldMap from './assets/maps/boilerplate.json';

// --- State Management ---
// Map to track player sat balances (using player.id as the key)
const playerSats = new Map<string, { sats: number }>();

// --- Server Start ---
startServer(world => {
  // world.simulation.enableDebugRendering(true); // Keep commented out

  world.loadMap(worldMap);
  // TODO: Replace with actual cyberpunk plaza map later

  // --- Player Join Logic ---
  world.on(PlayerEvent.JOINED_WORLD, ({ player }) => {
    const playerEntity = new PlayerEntity({
      player,
      name: player.username, // Use player's username for the entity name
      modelUri: 'models/players/player.gltf', // Use default player model
      // modelLoopedAnimations: ['idle'], // Optional: Add if model has idle animation
      // modelScale: 0.5, // Optional: Adjust scale if needed
    });

    // Spawn the player entity at the specified starting location
    // Adjust Y coordinate (5) if needed based on the boilerplate map's ground level
    playerEntity.spawn(world, new Vector3(0, 5, 0));

    // Initialize player sat balance AFTER spawning and confirming ID
    if (playerEntity.player?.id === undefined) {
        console.error(`Player entity for ${player.username} has no player ID after spawn. Cannot track state.`);
        // Attempt to despawn if possible, though spawn might have failed
        if (playerEntity.world) playerEntity.despawn();
        return; // Stop processing this player
    }

    const playerId = playerEntity.player.id;
    playerSats.set(playerId, { sats: 5 });
    console.log(`Player ${player.username} (ID: ${playerId}) joined. Initialized with 5 sats.`);

    // Send welcome messages
    world.chatManager.sendPlayerMessage(player, 'Welcome to the Bitcoin Learning Game!', '00FF00'); // Green
    world.chatManager.sendPlayerMessage(player, `You start with 5 sats.`, 'FFFF00'); // Yellow

    // Optional: Load UI if needed later
    // player.ui.load('ui/some-ui.html');

  }); // END JOINED_WORLD

  // --- Player Leave Logic ---
  world.on(PlayerEvent.LEFT_WORLD, ({ player }) => {
    // Despawn all entities associated with the player
    const entitiesToDespawn = world.entityManager.getPlayerEntitiesByPlayer(player);
    console.log(`Player ${player.username} left. Despawning ${entitiesToDespawn.length} associated entities.`);
    entitiesToDespawn.forEach(entity => {
        if (entity.world) {
             console.log(`Despawning entity ${entity.id} for leaving player ${player.username}`);
             entity.despawn();
        }
    });

    // Remove player's sat state when they leave
    if (player.id !== undefined) {
        if (playerSats.delete(player.id)) {
            console.log(`Removed sat state for player ${player.username} (ID: ${player.id}).`);
        } else {
             console.warn(`Could not find sat state for leaving player ${player.username} (ID: ${player.id}).`);
        }
    } else {
        console.error(`Leaving player ${player.username} has undefined ID. Cannot remove sat state.`);
    }
  }); // END LEFT_WORLD

  // --- Ambient Audio (Optional) ---
  // Keep or modify as needed for the new game's atmosphere
  new Audio({
    uri: 'audio/music/hytopia-main.mp3', // Consider changing this later
    loop: true,
    volume: 0.1,
  }).play(world);

  console.log("Bitcoin Learning Game server initialized.");
}); // END startServer
