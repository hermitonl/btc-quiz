import {
  startServer,
  PlayerEntity,
  PlayerEvent,
} from 'hytopia';

import worldMap from './assets/maps/mobile-controls-map.json';

startServer(world => {
  world.loadMap(worldMap);

  // Spawn a player entity when a player joins the game.
  world.on(PlayerEvent.JOINED_WORLD, ({ player }) => {
    const playerEntity = new PlayerEntity({
      player,
      name: 'Player',
      modelUri: 'models/players/player.gltf',
      modelLoopedAnimations: [ 'idle' ],
      modelScale: 0.5,
    });

    // Load our game UI for this player, this creates our mobile controls UI
    player.ui.load('ui/mobile-controls-index.html');
  
    playerEntity.spawn(world, { x: 0, y: 10, z: 0 });
  });

  // Despawn all player entities when a player leaves the game.
  world.on(PlayerEvent.LEFT_WORLD, ({ player }) => {
    world.entityManager.getPlayerEntitiesByPlayer(player).forEach(entity => entity.despawn());
  });
});