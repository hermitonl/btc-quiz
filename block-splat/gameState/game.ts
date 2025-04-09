import {
  World,
  Player,
  PlayerManager,
  type Vector3Like,
  PlayerEntity,
} from "hytopia";
import TeamManager, { TEAM_COLORS } from "./team";
import { BLOCK_STATE, clearBlockStates } from "../utilities/block-utils";
import { BOOST_SPAWN_INTERVAL, STAMINA_REGEN_RATE, UI_EVENT_TYPES } from "../utilities/gameConfig";
import { spawnRandomBoost } from "../utilities/boosts";
import { BACKGROUND_MUSIC, TO_THE_DEATH_MUSIC } from "../../block-splat-index"; // Corrected path
import worldMap from "../../assets/maps/block-splate-boilerplate.json"; // Import the map data
import { globalState } from "./global-state";
import NPCEntity from "../entities/NPCEntity";

export default class Game {
  private world: World;
  private teamManager: TeamManager;
  private gameTimer: Timer | null = null;
  private uiTimer: Timer | null = null;
  private boostTimer: Timer | null = null;
  private gameCountdownTimer: number = 30;
  private gameCountdownTimerInterval: Timer | null = null;
  private blockStateMap: Map<string, BLOCK_STATE>;
  private timeRemaining: number;
  private timeLimit: number;
  private scores: Map<number, number> = new Map();
  public isGameRunning: boolean = false;
  private energySpawnLocations: Vector3Like[] = [
    { x: 3.5, y: 5.5, z: 0.5 },
    { x: -4.5, y: 5.5, z: 1.5 },
    { x: 10, y: 5.5, z: -10 },
    { x: -10, y: 5.5, z: 10 },
    { x: 0, y: 5.5, z: 10 },
    { x: 0, y: 5.5, z: -10 },
    {x: 34, y: 10, z: -3},
    {x: 6, y: 11, z: 35},
    {x: -16.5, y: 7, z: 18}
  ];
  private npcs: NPCEntity[] = [];
  private isWaitingForPlayers: boolean = true;

  constructor(
    world: World,
    teamManager: TeamManager,
    timeLimit: number = 500,
    blockStateMap: Map<string, BLOCK_STATE>
  ) {
    if (this.gameTimer) clearInterval(this.gameTimer);
    if (this.uiTimer) clearInterval(this.uiTimer);

    this.world = world;
    this.teamManager = teamManager;
    this.timeRemaining = timeLimit;
    this.timeLimit = timeLimit;
    this.blockStateMap = blockStateMap;

    // Initialize scores for each team
    for (let i = 1; i <= 2; i++) {
      this.scores.set(i, 0);
    }
    this.uiTimer = setInterval(() => {
      globalState.getAllPlayers().forEach(player => player.setStamina(STAMINA_REGEN_RATE));
      this.updateAllPlayersUI();
    }, 225);
  }

  checkPlayerCount() {
    const players = PlayerManager.instance.getConnectedPlayers();
    if (players.length >= 1 && !this.isGameRunning && !this.gameCountdownTimerInterval) {
      // start game in 30 seconds
      this.world.chatManager.sendBroadcastMessage(
        "Game starting in " + this.gameCountdownTimer + " seconds!",
        "FFFF00"
      );
      this.gameCountdownTimer = 30;
      this.gameCountdownTimerInterval = setInterval(() => {
        this.gameCountdownTimer--;
        this.updateAllPlayersUI();
        if (this.gameCountdownTimer <= 0 && this.gameCountdownTimerInterval) {
          clearInterval(this.gameCountdownTimerInterval);
          this.gameCountdownTimerInterval = null;
          this.clearMapThenStartGame();
        }
      }, 1000);
    }
    this.updateAllPlayersUI();
  }
  
  clearMapThenStartGame() {
    if (this.blockStateMap.size > 0) {
      this.world.chatManager.sendBroadcastMessage('Game will begin once the map is reset!')
      clearBlockStates(this.blockStateMap, this.world).then(() => {
        this.startGame();
      });
    } else {
      this.startGame();
    }
  }

  startGame(reloadMap: boolean = true) { // Add optional reloadMap parameter
    if (this.isGameRunning) return;

    if (this.gameTimer) {
      clearInterval(this.gameTimer);
      this.gameTimer = null;
    }

    BACKGROUND_MUSIC.pause();
    TO_THE_DEATH_MUSIC.play(this.world);

    // Function to handle spawning after potential map load delay
    const spawnAfterLoad = () => {
        console.log("Spawning players after map load/delay...");
        this.teamManager.spawnPlayers(this.world);
        this.resetScores();
        this.updateAllPlayersUI();
        this.isWaitingForPlayers = false; // Update state after spawning

        // Clear any existing NPCs
        this.npcs.forEach(npc => npc.despawn());
        this.npcs = [];
        // ... (rest of NPC spawning logic if needed) ...
    };

    // clear player data
    globalState.getAllPlayers().forEach(player => {
      player.resetData();
    });

    // Reload the original map to ensure geometry is reset
    if (reloadMap) {
        console.log("Reloading world map...");
        // Assuming worldMap is accessible or passed appropriately
        // We might need to import it here if not already available via world instance
        this.world.loadMap(worldMap); // Reload the base map
        console.log("World map reloaded.");
        // Clear the block state map as the map is fresh
        this.blockStateMap.clear();
        // Add a delay before spawning players
        setTimeout(spawnAfterLoad, 500); // Delay by 500ms (adjust if needed)
    } else {
        // If not reloading map, spawn immediately (though this case might not be used now)
        spawnAfterLoad();
    }

    this.isGameRunning = true; // Set game running flag earlier
    this.timeRemaining = this.timeLimit;

    spawnRandomBoost(this.world, this.energySpawnLocations);

    this.boostTimer = setInterval(() => {
      spawnRandomBoost(this.world, this.energySpawnLocations);
    }, BOOST_SPAWN_INTERVAL * 1000);

    // Start main game timer
    this.gameTimer = setInterval(() => {
      this.timeRemaining--;

      if (this.timeRemaining <= 0) {
        this.endGame();
      }
    }, 1000);

    // Player spawning moved into spawnAfterLoad function

    // Clear any existing NPCs
    this.npcs.forEach(npc => npc.despawn());
    this.npcs = [];

    /// Spawn new NPCs using the static method
    // const redTeamPlayers = this.teamManager.getTeamPlayers(TEAM_COLORS.RED);
    // if(redTeamPlayers && redTeamPlayers.size < 2) {
    //   this.npcs.push(...NPCEntity.spawnNPCsForTeam(this.world, TEAM_COLORS.RED, this.teamManager, 2 - redTeamPlayers.size));
    // }

    // const blueTeamPlayers = this.teamManager.getTeamPlayers(TEAM_COLORS.BLUE);
    // if(blueTeamPlayers && blueTeamPlayers.size < 2) {
    //   this.npcs.push(...NPCEntity.spawnNPCsForTeam(this.world, TEAM_COLORS.BLUE, this.teamManager, 2 - blueTeamPlayers.size));
    // }
  }

  restartGame() {
    if (this.gameTimer) {
      clearInterval(this.gameTimer);
      this.gameTimer = null;
    }

    this.scores = new Map();
    this.clearMapThenStartGame();
  }

  changeScore(teamId: number, score: number) {
    this.scores.set(teamId, (this.scores.get(teamId) ?? 0) + score);
  }

  private resetScores() {
    this.scores.forEach((_, teamId) => {
      this.scores.set(teamId, 0);
    });
  }

  private updateAllPlayersUI() {
    const players = PlayerManager.instance.getConnectedPlayers();
    players.forEach((player) => this.updatePlayerUI(player));
  }

  private updatePlayerUI(player: Player) {
    let timeStr: string;
    
    if (this.isGameRunning) {
      const minutes = Math.floor(this.timeRemaining / 60);
      const seconds = this.timeRemaining % 60;
      timeStr = `${minutes}:${seconds.toString().padStart(2, "0")}`;
    } else if (this.gameCountdownTimerInterval) {
      timeStr = `Starting in ${this.gameCountdownTimer}`;
    } else {
      const players = PlayerManager.instance.getConnectedPlayers();
      timeStr = `Waiting... (${players.length}/2)`;
    }

    const scoreStr = Array.from(this.scores.entries())
      .map(
        ([teamId, score]) => `${this.teamManager.getTeamName(teamId)}: ${score}`
      )
      .join(" | ");

    const playerStats = globalState.getPlayerEntity(player.username);

    const playerStamina = playerStats.getStamina();
    const maxStamina = playerStats.getMaxStamina();
    const playerPoints = playerStats.getPlayerPoints();
    const playerKills = playerStats.getKills();

    const playerTeam = this.teamManager.getTeamName(
      this.teamManager.getPlayerTeam(player.username) ?? 1
    );
    player.ui.sendData({
      type: UI_EVENT_TYPES.GAME_UI,
      time: timeStr,
      scores: scoreStr,
      playerTeam: playerTeam,
      playerStamina: playerStamina,
      maxStamina: maxStamina,
      playerPoints: playerPoints,
      playerKills: playerKills,
      playerName: playerStats.getDisplayName(),
      playerClass: playerStats.getPlayerClass(),
    });
  }

  private endGame() {
    if (!this.isGameRunning) return;
    this.isGameRunning = false;

    if (this.gameTimer) clearInterval(this.gameTimer);
    if (this.boostTimer) clearInterval(this.boostTimer);

    // Find winning team
    let winningTeam = 1;
    let highestScore = this.scores.get(1) || 0;

    this.scores.forEach((score, teamId) => {
      if (score > highestScore) {
        highestScore = score;
        winningTeam = teamId;
      }
    });

    // Announce winner
    const winningTeamName = this.teamManager.getTeamName(winningTeam);
    this.world.chatManager.sendBroadcastMessage(
      `Game Over! ${winningTeamName} wins with ${highestScore} blocks!`,
      "FFFF00"
    );

    TO_THE_DEATH_MUSIC.pause();
    BACKGROUND_MUSIC.play(this.world);

    for (const player of PlayerManager.instance.getConnectedPlayers()) {
      const playerTeam = this.teamManager.getTeamName(
        this.teamManager.getPlayerTeam(player.username) ?? 1
      );
      if (playerTeam === winningTeamName) {
        player.ui.sendData({
          type: UI_EVENT_TYPES.VICTORY,
          winner: winningTeamName
        });
      } else {
        player.ui.sendData({
          type: UI_EVENT_TYPES.DEFEAT,
          winner: winningTeamName
        });
      }
    }

    // clear all non-player entities
    this.world.entityManager.getAllEntities().forEach((entity) => {
      if (!(entity instanceof PlayerEntity)) {
        entity.despawn();
      }
    });

    // send all players to lobby
    this.teamManager.sendAllPlayersToLobby(this.world);

    this.isWaitingForPlayers = true;
    this.gameCountdownTimer = 30;
    this.checkPlayerCount();
  }
}
