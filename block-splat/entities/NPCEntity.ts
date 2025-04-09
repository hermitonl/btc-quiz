import {
  Entity,
  RigidBodyType,
  PathfindingEntityController,
  World,
  type Vector3Like,
  ColliderShape,
  Audio,
} from "hytopia";
import { TEAM_COLOR_STRINGS, TEAM_COLORS } from "../gameState/team";
import { globalState } from "../gameState/global-state";
import { spawnProjectile } from "../utilities/projectiles";
import { getKillingMessage } from "../utilities/language";
import type TeamManager from "../gameState/team";
import { SEARCH_POINTS } from "../utilities/gameConfig";
import { getDirectionFromRotation } from "../utilities/math";

const speed = 4.5;

enum NPC_STATE {
  IDLE,
  FOLLOWING_ENEMIES,
  LOOKING_FOR_ENEMIES,
  RESPAWNING,
}

class NPCEntity extends Entity {
  private pathfindController: PathfindingEntityController;
  private currentTarget: Vector3Like | null = null;
  private team: number;
  private updateInterval: ReturnType<typeof setInterval> | null = null;
  private shootInterval: ReturnType<typeof setInterval> | null = null;
  private lastHitBy: string = "";
  private respawnTimer: ReturnType<typeof setTimeout> | null = null;
  private teamManager: TeamManager;
  private searchPoints: Vector3Like[] = [];
  private currentSearchPointIndex: number = 0;
  private currentState: NPC_STATE = NPC_STATE.IDLE;

  constructor(
    world: World,
    team: number,
    teamManager: TeamManager,
    searchPoints: Vector3Like[]
  ) {
    super({
      name: `Bot_${Math.floor(Math.random() * 1000)}`,
      modelUri:
        team === TEAM_COLORS.BLUE
          ? "models/players/player-blue.gltf"
          : "models/players/player-red.gltf",
      modelScale: 0.5,
      modelLoopedAnimations: ["idle_upper", "idle_lower"],
      controller: new PathfindingEntityController(),
      rigidBodyOptions: {
        enabledRotations: { x: false, y: false, z: false },
        ccdEnabled: true,
        type: RigidBodyType.DYNAMIC,
        colliders: [
          {
            mass: 1.1,
            shape: ColliderShape.CAPSULE,
            halfHeight: 0.5,
            radius: 0.3,
          },
        ],
      },
      tag: "npc",
    });

    this.team = team;
    this.teamManager = teamManager;
    this.pathfindController = this.controller as PathfindingEntityController;
    this.searchPoints = searchPoints;
    // Set up despawn handler
    this.onDespawn = () => {
      this.stopFollowingEnemies();
      this.stopShooting();
      this.currentState = NPC_STATE.RESPAWNING;
      if (this.respawnTimer) {
        clearTimeout(this.respawnTimer);
        this.respawnTimer = null;
      }
    };

    this.onTick = () => {
      if (this.position.y < -10 && this.isSpawned) {
        const player = globalState.getPlayerEntity(this.lastHitBy);
        if (player) {
          player.incrementKills();
          this.world?.chatManager.sendBroadcastMessage(
            getKillingMessage(player.getDisplayName(), this.getDisplayName()),
            "FF0000"
          );
        }
        this.handleDeath();
      }
    };
  }

  private handleDeath() {
    this.stopFollowingEnemies();
    this.stopShooting();

    // Hide NPC during respawn
    if (this.rawRigidBody) {
      this.rawRigidBody.setEnabled(false);
    }
    this.setPosition({ x: 0, y: 100, z: 0 });
    this.setLastHitBy("");
    // Set up respawn timer
    this.respawnTimer = setTimeout(() => {
      this.respawn();
      this.currentState = NPC_STATE.IDLE;
    }, 5000);
  }

  private respawn() {
    if (!this.isSpawned || !this.world) return;

    const spawnPoint = this.teamManager.getTeamSpawn(this.team);
    if (!spawnPoint) {
      console.warn("No valid spawn point found for team", this.team);
      return;
    }

    // Enable physics and move to spawn
    if (this.rawRigidBody) {
      this.rawRigidBody.setEnabled(true);
    }

    const adjustedSpawn = {
      x: spawnPoint.x,
      y: spawnPoint.y + 1,
      z: spawnPoint.z,
    };

    this.setPosition(adjustedSpawn);
    this.startFollowingEnemies();
  }

  // Static method to create and spawn NPCs for a team
  public static spawnNPCsForTeam(
    world: World,
    team: number,
    teamManager: TeamManager,
    count: number = 1
  ): NPCEntity[] {
    const npcs: NPCEntity[] = [];

    for (let i = 0; i < count; i++) {
      const npc = new NPCEntity(
        world,
        team,
        teamManager,
        SEARCH_POINTS[team as keyof typeof SEARCH_POINTS]
      );
      const spawnPoint = teamManager.getTeamSpawn(team);

      if (spawnPoint) {
        const adjustedSpawn = {
          x: spawnPoint.x,
          y: spawnPoint.y + 1,
          z: spawnPoint.z,
        };
        npc.spawn(world, adjustedSpawn);
        npcs.push(npc);
        npc.startFollowingEnemies();
      } else {
        console.warn("No valid spawn point found for team", team);
      }
    }

    // Start NPC behavior after a short delay
    // setTimeout(() => {
    //   npcs.forEach(npc => npc.startFollowingEnemies());
    // }, 2000);

    return npcs;
  }

  public startFollowingEnemies() {
    if (this.updateInterval) return;

    this.currentState = NPC_STATE.FOLLOWING_ENEMIES;
    // Update target every 2 seconds
    this.updateInterval = setInterval(() => {
      if (!this.isSpawned || !this.world) return;

      if (
        this.currentState === NPC_STATE.FOLLOWING_ENEMIES ||
        this.currentState === NPC_STATE.IDLE
      ) {
        console.log("Starting following enemies");
        this.startModelLoopedAnimations(["walk_upper", "walk_lower"]);

        const enemyTeam =
          this.team === TEAM_COLORS.BLUE ? TEAM_COLORS.RED : TEAM_COLORS.BLUE;
        let enemies: Entity[] = globalState.getPlayersOnTeam(enemyTeam);

        if (enemies.length === 0) {
          console.log("No players found, looking for npcs on the other team");
          // if no players look for npcs on the other team
          const otherTeamNPCs = globalState
            .getAllNPCs()
            .filter((npc) => npc.team === enemyTeam)
            .filter((npc) => npc instanceof NPCEntity && npc.getCurrentState() != NPC_STATE.RESPAWNING);
          if (otherTeamNPCs.length > 0) {
            console.log("Found npcs on the other team, using them as enemies");
            enemies = otherTeamNPCs as Entity[];
          } else {
            console.log("No npcs found on the other team, returning");
            return;
          }
        }

        // Find the nearest enemy
        let nearestEnemy = enemies[0];
        let nearestDistance = this.getDistanceTo(nearestEnemy.position);
        for (const enemy of enemies) {
          const distance = this.getDistanceTo(enemy.position);
          if (distance < nearestDistance) {
            nearestDistance = distance;
            nearestEnemy = enemy;
          }
        }

        this.shootAt(nearestEnemy.position);
        try {
          this.moveToPosition(nearestEnemy.position);
        } catch (error) {
          console.log("Pathfinding error!");
          this.currentState = NPC_STATE.FOLLOWING_ENEMIES;
        }
      } else if(this.currentState != NPC_STATE.RESPAWNING) {
        console.log(this.currentState);
        this.shootAt(getDirectionFromRotation(this.rotation));
      }
    }, 2000);

    // Start shooting interval
    //this.startShooting();
  }

  public getCurrentState() {
    return this.currentState;
  }

  private shootAt(targetPos: Vector3Like) {
    if (!this.isSpawned || !this.world || this.currentState == NPC_STATE.RESPAWNING) return;

    // Calculate direction to target
    const direction = {
      x: targetPos.x - this.position.x,
      y: targetPos.y + 1 - (this.position.y + 1), // Adjust for height
      z: targetPos.z - this.position.z,
    };

    // Normalize direction
    const length = Math.sqrt(
      direction.x * direction.x +
        direction.y * direction.y +
        direction.z * direction.z
    );
    direction.x /= length;
    direction.y /= length;
    direction.z /= length;

    // Add some randomness to make it less accurate
    direction.x += (Math.random() - 0.5) * 0.2;
    direction.y += (Math.random() - 0.5) * 0.1;
    direction.z += (Math.random() - 0.5) * 0.2;

    // Calculate bullet origin (slightly in front of NPC)
    const bulletOrigin = {
      x: this.position.x + direction.x,
      y: this.position.y + 1.2, // Adjust to match player height
      z: this.position.z + direction.z,
    };

    // Play shooting animation
    this.startModelOneshotAnimations(["chuck"]);

    // Spawn projectile
    spawnProjectile(
      this.world,
      bulletOrigin,
      direction,
      `Bot_${this.team}`,
      TEAM_COLOR_STRINGS[this.team],
      "SLINGSHOT"
    );

    // Play shoot sound
    new Audio({
      uri: "audio/sfx/player/bow-shoot.mp3",
      volume: 0.5,
      playbackRate: 1.2,
      position: this.position,
      referenceDistance: 10,
    }).play(this.world);
  }

  private stopShooting() {
    if (this.shootInterval) {
      clearInterval(this.shootInterval);
      this.shootInterval = null;
    }
  }

  public setLastHitBy(lastHitBy: string) {
    this.lastHitBy = lastHitBy;
  }

  public getLastHitBy() {
    return this.lastHitBy;
  }

  public stopFollowingEnemies() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    this.stopShooting();
  }

  private getDistanceTo(targetPos: Vector3Like): number {
    const dx = targetPos.x - this.position.x;
    const dy = targetPos.y - this.position.y;
    const dz = targetPos.z - this.position.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  public moveToPosition(targetPos: Vector3Like) {
    if (!this.isSpawned || !this.world) return;

    this.currentTarget = targetPos;
    // 17, 6, 20
      const succeeded = this.pathfindController.pathfind(targetPos, speed, {
        debug: false,
        maxFall: 20,
      maxJump: 5,
      maxOpenSetIterations: 400,
      verticalPenalty: 1,
      waypointTimeoutMs: 2000,
      pathfindCompleteCallback: () => {
        console.log("Pathfinding complete");
        this.currentState = NPC_STATE.FOLLOWING_ENEMIES;
      },
    });

    console.log(`Pathfinding to target: ${succeeded}`);

    if (!succeeded) {
      // try // 17, 6, 20

      const searchPointSucceeded = this.pathfindController.pathfind(
        this.searchPoints[this.currentSearchPointIndex],
        speed,
        {
          debug: false,
          maxFall: 20,
          maxJump: 5,
          maxOpenSetIterations: 400,
          verticalPenalty: 1,
          pathfindCompleteCallback: () => {
            // now try again to find player
            this.currentState = NPC_STATE.FOLLOWING_ENEMIES;
          },
          pathfindAbortCallback: () => {
            console.log("Failed to pathfind to search point, trying again");
            this.currentState = NPC_STATE.FOLLOWING_ENEMIES;
          },
        }
      );
      this.currentSearchPointIndex =
        (this.currentSearchPointIndex + 1) % this.searchPoints.length;
      if (searchPointSucceeded) {
        this.currentState = NPC_STATE.LOOKING_FOR_ENEMIES;
      } else {
        this.currentState = NPC_STATE.FOLLOWING_ENEMIES;
      } 
    } else {
      this.currentState = NPC_STATE.FOLLOWING_ENEMIES;
    }

    // console.log(`Path found successfully?: ${succeeded}`);
  }

  public getDisplayName() {
    return this.name;
  }

  public getTeam() {
    return this.team;
  }
}

export default NPCEntity;
