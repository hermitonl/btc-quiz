// This file contains the player join, leave, death, and respawn events
import {
  Player,
  World,
  PlayerEntity,
  Entity,
  PlayerUI,
  ChatManager,
  EntityEvent,
  PlayerUIEvent,
} from "hytopia";
import type Game from "../gameState/game";
import { PlayerClass } from "../entities/player-types";
import type TeamManager from "../gameState/team";
import { TEAM_COLORS } from "../gameState/team";
import { getFallingMessage, getKillingMessage } from "../utilities/language";
import {
  RESPAWN_TIME,
  RESPAWN_HEIGHT,
  UI_BUTTONS,
  UI_EVENT_TYPES,
} from "../utilities/gameConfig";
import CustomPlayerEntity from "../entities/CustomPlayerEntity";
import { globalState } from "../gameState/global-state";

export const LOBBY_SPAWN = { x: 0, y: 65, z: 0 };

export function onPlayerJoin(
  player: Player,
  world: World,
  teamManager: TeamManager,
  game: Game
) {
  teamManager.addPlayerToMinTeam(player.username);

  const team = teamManager.getPlayerTeam(player.username);
  const playerEntity = new CustomPlayerEntity(player, team || 0, teamManager);
  playerEntity.setPlayerClass(PlayerClass.SLINGSHOT);

  if (game.isGameRunning) {
    playerEntity.spawn(
      world,
      teamManager.getTeamSpawn(team ?? 0) ?? LOBBY_SPAWN
    );
    playerEntity.setPlayerClass(PlayerClass.SLINGSHOT);
    playerEntity.setStamina(playerEntity.getMaxStamina());
  } else {
    const randomLobbySpawn = {
      x: LOBBY_SPAWN.x + (Math.random() * 3 - 1),
      y: LOBBY_SPAWN.y,
      z: LOBBY_SPAWN.z + (Math.random() * 3 - 1),
    };
    playerEntity.spawn(world, randomLobbySpawn);
    game.checkPlayerCount();
  }

  let paintModelUri = "models/items/paint-brush.gltf";
  if (teamManager.getPlayerTeam(player.username) === TEAM_COLORS.RED) {
    paintModelUri = "models/items/paint-brush-red.gltf";
  }

  const paintBrush = new Entity({
    name: "Paint Brush",
    modelUri: paintModelUri,
    modelScale: 1.5,
    parent: playerEntity,
    parentNodeName: "hand_right_weapon_anchor",
  });
  paintBrush.spawn(world, { x: 0, y: 0.15, z: 0.15 });
  paintBrush.setRotation({ x: 0, y: 0, z: 45, w: 1 });
  player.camera.setFov(80);
  player.camera.setOffset({ x: 0, y: 1, z: 0 });

  playerEntity.on(EntityEvent.TICK, ({ entity }) => {
    if (entity instanceof PlayerEntity && entity.position.y < -8) {
      handlePlayerDeath(
        entity as CustomPlayerEntity,
        teamManager,
        world.chatManager,
        game
      );
    }
  });

  player.ui.load("ui/hud.html");

  player.ui.on(PlayerUIEvent.DATA, ({ playerUI, data }) => {
    if (data.button === "select-team" && data.team) {
      teamManager.addPlayerToTeam(
        playerUI.player.username,
        TEAM_COLORS[data.team as keyof typeof TEAM_COLORS]
      );
    }
  });

  player.ui.on(PlayerUIEvent.DATA, ({ playerUI, data }) => {
    if (data.button === "select-team" && data.team) {
      playerUI.player.camera.setAttachedToEntity(playerEntity);

      if (data.team === "Red") {
        teamManager.addPlayerToTeam(playerUI.player.username, TEAM_COLORS.RED);
      } else if (data.team === "Blue") {
        teamManager.addPlayerToTeam(playerUI.player.username, TEAM_COLORS.BLUE);
        playerUI.player.camera.setAttachedToEntity(playerEntity);
      }
    }

    if (data.button && data.button === UI_BUTTONS.SELECT_CLASS && data.class) {
      playerEntity.setPlayerClass(data.class as PlayerClass);
    }
  });

  // we store the player id in the local storage so we can use it to hide the player's own name bar
  player.ui.sendData({
    type: UI_EVENT_TYPES.PLAYER_ID,
    playerId: player.username,
  });

  const messages = [
    "Welcome! Use WASD to move around.",
    "Press space to jump.",
    "If you get stuck, use /stuck to respawn",
    "Hold shift to sprint.",
    "Press left mouse button to shoot.",
    "Press Q or right mouse to tackle.",
    "Press E to open the class menu. Use 1, 2, 3, or 4 to change class quickly.",
    "Press R to view the leaderboard.",
    "Force game to start early with the /start command."
  ];

  messages.forEach((message) => {
    world.chatManager.sendPlayerMessage(player, message);
  });

  game.checkPlayerCount();
}

export function onPlayerLeave(
  player: Player,
  world: World,
  teamManager: TeamManager
) {
  teamManager.removePlayer(player.username);
  world.entityManager
    .getPlayerEntitiesByPlayer(player)
    .forEach((entity) => entity.despawn());
}

export function handlePlayerDeath(
  entity: CustomPlayerEntity,
  teamManager: TeamManager,
  chatManager: ChatManager,
  game: Game
) {
  if (entity.position.y === RESPAWN_HEIGHT) return; // dont respawn if player is already dead
  entity.player.ui.sendData({
    type: UI_EVENT_TYPES.PLAYER_DEATH,
    message: "You fell off the map!",
    time: RESPAWN_TIME / 1000,
  });

  entity.incrementPlayerDeaths();
  if (entity.getLastHitBy()) {
    const killer = globalState.getPlayerEntity(entity.getLastHitBy());
    if (killer) {
      chatManager.sendBroadcastMessage(
        getKillingMessage(killer.getDisplayName(), entity.getDisplayName()),
        "FF0000"
      );
      killer.incrementKills();
    } else {
      chatManager.sendBroadcastMessage(
        "You were killed by a bot lmfao",
        "FF0000"
      );
    }
    entity.setLastHitBy("");
  } else {
    chatManager.sendBroadcastMessage(
      getFallingMessage(entity.getDisplayName()),
      "FF0000"
    );
  }

  // Make player spectator during respawn
  entity.setPosition({ x: 0, y: RESPAWN_HEIGHT, z: 0 });
  if (entity.rawRigidBody) {
    entity.rawRigidBody.setEnabled(false);
  }
  entity.setLinearVelocity({ x: 0, y: 0, z: 0 });
  entity.setIsRespawning(true);
  setTimeout(() => {
    respawnPlayer(entity, teamManager, game);
  }, RESPAWN_TIME);
}

export function respawnPlayer(
  entity: CustomPlayerEntity,
  teamManager: TeamManager,
  game: Game
) {
  // Get team spawn point
  if (!entity.isSpawned) return;

  const team = entity.getTeam();
  const spawn = teamManager.getTeamSpawn(team ?? 0) ?? LOBBY_SPAWN;
  entity.rawRigidBody?.setEnabled(true);

  if (game.isGameRunning) {
    entity.setPosition(spawn);
  } else {
    entity.setPosition(LOBBY_SPAWN);
  }
  entity.setInvincible();
  entity.setIsRespawning(false);
}
