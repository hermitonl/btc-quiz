import {
  startServer,
  Audio,
  PlayerEntity,
  Entity,
  PlayerUI,
  type EntityEventPayloads, // Corrected from EntityEventPayload
  EntityEvent, // Corrected from EntityEventType
  PlayerEvent, // Reverted back from WorldEvent
  BlockType,
  type Vector3Like,
  World,
  Player
} from 'hytopia'

import worldMap from './assets/maps/lava-jump-map.json'
import GlassBridge from './scripts/glassBridge'
import CustomPlayerEntityController from './scripts/CustomPlayerEntityController'

export const PLAYER_VOID_FALL_EVENT = 'PLAYER_VOID_FALL_EVENT'
export interface PlayerVoidFallEventPayload {
  player: PlayerEntity
}

const SPAWN = { x: 0, y: 17, z: 0 }
const VICTORY_BLOCK_ID = 102
const FAULTY_BLOCK_ID = 101

// Define the main game logic function
const gameLogic = (world: World) => {
  // world.simulation.enableDebugRendering(true);

  world.loadMap(worldMap);
  const glassBridge = new GlassBridge(world, FAULTY_BLOCK_ID, SPAWN)
  loadCustomBlocks(world, glassBridge)

  world.simulation.setGravity({ x: 0, y: -28, z: 0 })
  world.setAmbientLightColor({ r: 198, g: 198, b: 198 })
  new Audio({
    uri: 'audio/music/hytopia-main.mp3',
    loop: true,
    volume: 0.1
  }).play(world)

  world.chatManager.registerCommand('/start', () => {
    if (glassBridge.isActive) {
      world.chatManager.sendBroadcastMessage('Game already running!')
      return
    }
    glassBridge.reset()
  })

  // Use standard event listeners instead of direct assignment
  // Use correct event names for player joining/leaving the world
  world.on(PlayerEvent.JOINED_WORLD, ({ player }) => onPlayerJoin(world, player, glassBridge)); // Reverted back
  world.on(PlayerEvent.LEFT_WORLD, ({ player }) => onPlayerLeave(world, player, glassBridge)); // Reverted back

  // testing custom events, would be useful if we wanted multiple subscriptions
  // to the same event across our codebase
  // Listen directly for UPDATE_POSITION using world.on
  world.on(EntityEvent.UPDATE_POSITION, (payload: EntityEventPayloads[EntityEvent.UPDATE_POSITION]) => { // Corrected type usage with enum key
    if (payload.position.y < 0 && payload.entity instanceof PlayerEntity) {
      // Call the fall handler directly
      glassBridge.onPlayerFall(payload.entity);
    }
  });

  // Removed custom event logic for PLAYER_VOID_FALL_EVENT
};

// Start the server with the simplified logic
startServer(gameLogic);

function onPlayerJoin(world: World, player: Player, glassBridge: GlassBridge) {
  const playerEntity = new PlayerEntity({
    player,
    name: 'Player',
    modelUri: 'models/players/player.gltf',
    modelLoopedAnimations: ['idle'],
    modelScale: 0.5,
    controller: new CustomPlayerEntityController({})
  })

  playerEntity.spawn(world, SPAWN)

  // Send a nice welcome message that only the player who joined will see ;)
  world.chatManager.sendPlayerMessage(player, 'Welcome to the game!!', '00FF00')
  world.chatManager.sendPlayerMessage(player, 'Use WASD to move around.')
  world.chatManager.sendPlayerMessage(player, 'Press space to jump.')
  world.chatManager.sendPlayerMessage(
    player,
    'Take turns trying to cross the bridge, each row of tiles contains 1 sturdy platform and one platform that will shatter. Remember which platforms are real and try to cross the bridge before the other players!'
  )
  world.chatManager.sendPlayerMessage(
    player,
    'If the game has not started type /start to begin'
  )
  player.ui.load('ui/index.html')

  glassBridge.addPlayer(playerEntity)
}

function onPlayerLeave(world: World, player: Player, glassBridge: GlassBridge) {
  world.entityManager
    .getPlayerEntitiesByPlayer(player)
    .forEach((entity) => entity.despawn())
  // glassBridge.stop()
  glassBridge.removePlayer(player.id)
}

function loadCustomBlocks(world: World, glassBridge: GlassBridge) {
  const faultyBlock = world.blockTypeRegistry.registerGenericBlockType({
    id: FAULTY_BLOCK_ID,
    textureUri: 'blocks/glass.png', // Corrected path
    name: 'Faulty Platform'
  })

  // Removed faultyBlock.onContact handler due to errors

  const victoryBlock = world.blockTypeRegistry.registerGenericBlockType({
    id: VICTORY_BLOCK_ID,
    textureUri: 'blocks/dragons-stone.png', // Corrected path
    name: 'Victory Block'
  })

  for (let x = 35; x <= 39; x++) {
    for (let z = -2; z <= 2; z++) {
      world.chunkLattice.setBlock({ x, y: 10, z }, VICTORY_BLOCK_ID)
    }
  }

  // Player wins when they collide with the victory block - TODO: make sure they land on the block
  // Removed victoryBlock.onContact handler due to errors
}
