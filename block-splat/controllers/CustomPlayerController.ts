import { 
  Audio, 
  BaseEntityController, 
  Entity, 
  ColliderShape, 
  CollisionGroup, 
  CoefficientCombineRule, 
  BlockType, 
  PlayerEntity,
  type PlayerInput, 
  type PlayerCameraOrientation,
  Vector3,
  type Vector3Like,
  World
} from 'hytopia';
import { spawnProjectile } from "../utilities/projectiles";
import { PlayerClass } from "../entities/player-types";
import TeamManager, { TEAM_COLORS, TEAM_COLOR_STRINGS } from "../gameState/team";
import {
  TACKLE_ENERGY_COST,
  SPRINT_ENERGY_COST,
  PROJECTILES,
  type ProjectileType,
  PUNCH_PLAYER_FORCE,
  PUNCH_VERTICAL_FORCE,
  UI_EVENT_TYPES,
  SHOOTING_COOLDOWN,
} from "../utilities/gameConfig";
import CustomPlayerEntity from "../entities/CustomPlayerEntity";
import { globalState } from "../gameState/global-state";
import { getDirectionFromRotation } from '../utilities/math';

/** Options for creating a PlayerEntityController instance. @public */
export interface PlayerEntityControllerOptions {
  /** A function allowing custom logic to determine if the entity can jump. */
  canJump?: () => boolean;

  /** A function allowing custom logic to determine if the entity can walk. */
  canWalk?: () => boolean;

  /** A function allowing custom logic to determine if the entity can run. */
  canRun?: () => boolean;

  /** The upward velocity applied to the entity when it jumps. */
  jumpVelocity?: number;

  /** The normalized horizontal velocity applied to the entity when it runs. */
  runVelocity?: number;

  /** Whether the entity sticks to platforms, defaults to true. */
  sticksToPlatforms?: boolean;

  /** The normalized horizontal velocity applied to the entity when it walks. */
  walkVelocity?: number;

  /** The team manager instance */
  teamManager?: TeamManager;

  /** The game world instance */
  world?: World;
}

export default class CustomPlayerController extends BaseEntityController {
  public canWalk: (playerEntityController: CustomPlayerController) => boolean = () => true;
  public canRun: (playerEntityController: CustomPlayerController) => boolean = () => true;
  public canJump: (playerEntityController: CustomPlayerController) => boolean = () => true;
  public jumpVelocity: number = 10;
  public runVelocity: number = 8;
  public sticksToPlatforms: boolean = true;
  public walkVelocity: number = 4;

  private _stepAudio: Audio | undefined;
  private _groundContactCount: number = 0;
  private _platform: Entity | undefined;
  private _lastShootTime: Map<string, number> = new Map();
  private _teamManager: TeamManager;
  private _world: World;

  public constructor(options: PlayerEntityControllerOptions = {}) {
    super();

    this.jumpVelocity = options.jumpVelocity ?? this.jumpVelocity;
    this.runVelocity = options.runVelocity ?? this.runVelocity;
    this.walkVelocity = options.walkVelocity ?? this.walkVelocity;
    this.canWalk = options.canWalk ?? this.canWalk;
    this.canRun = options.canRun ?? this.canRun;
    this.canJump = options.canJump ?? this.canJump;
    this.sticksToPlatforms = options.sticksToPlatforms ?? this.sticksToPlatforms;
    
    if (!options.teamManager || !options.world) {
      throw new Error('TeamManager and World are required for CustomPlayerController');
    }
    
    this._teamManager = options.teamManager;
    this._world = options.world;
  }

  public get isGrounded(): boolean { return this._groundContactCount > 0; }
  public get isOnPlatform(): boolean { return !!this._platform; }
  public get platform(): Entity | undefined { return this._platform; }

  public attach(entity: Entity) {
    this._stepAudio = new Audio({
      uri: 'audio/sfx/step/stone/stone-step-04.mp3',
      loop: true,
      volume: 0.1,
      attachedToEntity: entity,
    });

    entity.lockAllRotations();
  }

  public spawn(entity: Entity) {
    if (!entity.isSpawned) {
      throw new Error('CustomPlayerController.createColliders(): Entity is not spawned!');
    }

    // Ground sensor
    entity.createAndAddChildCollider({
      shape: ColliderShape.CYLINDER,
      radius: 0.23,
      halfHeight: 0.125,
      collisionGroups: {
        belongsTo: [ CollisionGroup.ENTITY_SENSOR ],
        collidesWith: [ CollisionGroup.BLOCK, CollisionGroup.ENTITY ],
      },
      isSensor: true,
      relativePosition: { x: 0, y: -0.75, z: 0 },
      tag: 'groundSensor',
      onCollision: (_other: BlockType | Entity, started: boolean) => {
        this._groundContactCount += started ? 1 : -1;
  
        // Check if entity is spawned before manipulating animations
        if (entity.isSpawned) {
            if (!this._groundContactCount) {
              entity.startModelOneshotAnimations([ 'jump_loop' ]);
            } else {
              entity.stopModelAnimations([ 'jump_loop' ]);
            }
        }

        if (!(_other instanceof Entity) || !_other.isKinematic) return;
        
        if (started && this.sticksToPlatforms) {
          this._platform = _other;
        } else if (_other === this._platform && !started) {
          this._platform = undefined;
        }
      },
    });

    // Wall collider
    entity.createAndAddChildCollider({
      shape: ColliderShape.CAPSULE,
      halfHeight: 0.31,
      radius: 0.38,
      collisionGroups: {
        belongsTo: [ CollisionGroup.ENTITY_SENSOR ],
        collidesWith: [ CollisionGroup.BLOCK, CollisionGroup.ENTITY ],
      },
      friction: 0,
      frictionCombineRule: CoefficientCombineRule.Min,
      tag: 'wallCollider',
    });
  }

  private handleShooting(entity: CustomPlayerEntity, cameraOrientation: PlayerCameraOrientation) {
    if (entity.getPlayerClass() === PlayerClass.RUNNER || entity.getIsRespawning()) {
      return;
    }

    const lastShoot = this._lastShootTime.get(entity.player.username);
    if (lastShoot && Date.now() - lastShoot < SHOOTING_COOLDOWN) {
      return;
    }
    this._lastShootTime.set(entity.player.username, Date.now());

    const direction = this.calculateShootingDirection(entity, cameraOrientation);
    const bulletOrigin = this.calculateBulletOrigin(entity, direction);

    const projectileMap: { [key: string]: { type: string; energy: number } } = {
      [PlayerClass.GRENADER]: { type: "BLOB", energy: PROJECTILES.BLOB.ENERGY },
      [PlayerClass.SLINGSHOT]: { type: "SLINGSHOT", energy: PROJECTILES.SLINGSHOT.ENERGY },
      [PlayerClass.SNIPER]: { type: "SNIPER", energy: PROJECTILES.SNIPER.ENERGY },
    };

    const projectileConfig = projectileMap[entity.getPlayerClass()];
    if (!projectileConfig) return;
    const { type, energy } = projectileConfig;
    if (entity.getStamina() >= Math.abs(energy)) {
      entity.startModelOneshotAnimations(["chuck"]);
      const projectile = spawnProjectile(
        this._world,
        bulletOrigin,
        direction,
        entity.player.username,
        TEAM_COLOR_STRINGS[entity.getTeam() ?? 0] ?? 'WHITE', // Provide default team 0 or color 'WHITE' if team is undefined
        type as ProjectileType
      );
      entity.setStamina(energy);
      setTimeout(() => projectile.isSpawned && projectile.despawn(), 2000);
    }
  }

  private handleMeleeAttack(entity: CustomPlayerEntity) {
    if(entity.isPlayerTackling() || entity.getStamina() < TACKLE_ENERGY_COST) {
      return;
    }
    let multiplier = 1;
    if (entity.getPlayerClass() === PlayerClass.RUNNER) {
      multiplier = 1.4;
    } else if (entity.getPlayerClass() === PlayerClass.GRENADER) {
      multiplier = 1.1;
    }
    
    const direction = getDirectionFromRotation(entity.rotation);
    entity.startModelOneshotAnimations(["tackle"]);
    entity.applyImpulse({
      x: direction.x * PUNCH_PLAYER_FORCE * multiplier,
      y: PUNCH_VERTICAL_FORCE,
      z: direction.z * PUNCH_PLAYER_FORCE * multiplier,
    });
    entity.setStamina(-TACKLE_ENERGY_COST);
    entity.tackle();
    new Audio({
      uri: 'audio/sfx/player/tackle.mp3',
      attachedToEntity: entity,
      volume: 0.5,
    }).play(entity.world as World);
  }

  private handleSprint(entity: CustomPlayerEntity, input: PlayerInput) {
    if (entity.getStamina() >= SPRINT_ENERGY_COST) {
      entity.setStamina(-1 * SPRINT_ENERGY_COST);
    } else {
      input.sh = false;
    }
  }

  private showLeaderboard(entity: CustomPlayerEntity) {
    const teams = [TEAM_COLORS.RED, TEAM_COLORS.BLUE]
    const leaderboards = teams.map((team) => {
      return globalState.getPlayersOnTeam(team)
        .sort((a, b) => b.getPlayerPoints() - a.getPlayerPoints())
      .map((player) => ({
        name: player.getDisplayName(),
        points: player.getPlayerPoints(),
        kills: player.getKills(),
        deaths: player.getPlayerDeaths(),
      }));
    });

    entity.player.ui.sendData({
      type: UI_EVENT_TYPES.SHOW_PLAYER_LEADERBOARD,
      redLeaderboard: leaderboards[0],
      blueLeaderboard: leaderboards[1],
    });
  }

  private handleClassSelection(entity: CustomPlayerEntity, key: "1" | "2" | "3" | "4", input: PlayerInput) {
    const classMap = {
      "1": PlayerClass.RUNNER,
      "2": PlayerClass.GRENADER,
      "3": PlayerClass.SNIPER,
      "4": PlayerClass.SLINGSHOT,
    };

    const selectedClass = classMap[key];
    if (selectedClass) {
      entity.setPlayerClass(selectedClass);
      entity.player.ui.sendData({
        type: UI_EVENT_TYPES.GAME_UI,
        playerClass: selectedClass,
      });
    }
  }

  private calculateShootingDirection(entity: PlayerEntity, cameraOrientation: PlayerCameraOrientation): Vector3 {
    const direction = Vector3.fromVector3Like(entity.directionFromRotation);
    direction.y = Math.sin(cameraOrientation.pitch);

    const cosP = Math.cos(cameraOrientation.pitch);
    direction.x = -direction.x * cosP;
    direction.z = -direction.z * cosP;

    return direction.normalize();
  }

  private calculateBulletOrigin(entity: PlayerEntity, direction: Vector3Like): Vector3Like {
    const bulletOrigin = entity.position;
    bulletOrigin.y += 1.4;
    bulletOrigin.x += direction.x;
    bulletOrigin.z += direction.z;
    return bulletOrigin;
  }

  public tickWithPlayerInput(entity: PlayerEntity, input: PlayerInput, cameraOrientation: PlayerCameraOrientation, deltaTimeMs: number) {
    const customEntity = entity as CustomPlayerEntity;
    const { w, a, s, d, sp, sh, ml, mr, q, e, r } = input;
    const { yaw } = cameraOrientation;
    const currentVelocity = entity.linearVelocity;
    const targetVelocities = { x: 0, y: 0, z: 0 };
    const isRunning = sh;
    // Handle animations
    if (this.isGrounded && (w || a || s || d)) {
      if (isRunning) {
        const runAnimations = [ 'run_upper', 'run_lower' ];
        entity.stopModelAnimations(Array.from(entity.modelLoopedAnimations).filter(v => !runAnimations.includes(v)));
        entity.startModelLoopedAnimations(runAnimations);
        this._stepAudio?.setPlaybackRate(0.81);
      } else {
        const walkAnimations = [ 'walk_upper', 'walk_lower' ];
        entity.stopModelAnimations(Array.from(entity.modelLoopedAnimations).filter(v => !walkAnimations.includes(v)));
        entity.startModelLoopedAnimations(walkAnimations);
        this._stepAudio?.setPlaybackRate(0.55);
      }

      this._stepAudio?.play(entity.world as World, !this._stepAudio?.isPlaying);
    } else {
      this._stepAudio?.pause();
      const idleAnimations = [ 'idle_upper', 'idle_lower' ];
      entity.stopModelAnimations(Array.from(entity.modelLoopedAnimations).filter(v => !idleAnimations.includes(v)));
      entity.startModelLoopedAnimations(idleAnimations);
    }

    // Handle custom input actions
    if (ml) {
      this.handleShooting(customEntity, cameraOrientation);
    }
    if (mr || q) {
      this.handleMeleeAttack(customEntity);
    } else if (sh) {
      this.handleSprint(customEntity, input);
    } else if (e) {
      customEntity.player.ui.sendData({ type: UI_EVENT_TYPES.SHOW_CLASS_SELECT });
    } else if (r) {
      this.showLeaderboard(customEntity);
      input.r = false;
    } else if (input["1"]) {
      this.handleClassSelection(customEntity, "1", input);
    } else if (input["2"]) {
      this.handleClassSelection(customEntity, "2", input);
    } else if (input["3"]) {
      this.handleClassSelection(customEntity, "3", input);
    } else if (input["4"]) {
      this.handleClassSelection(customEntity, "4", input);
    }

    // Calculate movement velocities
    if ((isRunning && this.canRun(this)) || (!isRunning && this.canWalk(this))) {
      const velocity = isRunning ? this.runVelocity : this.walkVelocity;

      if (w) {
        targetVelocities.x -= velocity * Math.sin(yaw);
        targetVelocities.z -= velocity * Math.cos(yaw);
      }
  
      if (s) {
        targetVelocities.x += velocity * Math.sin(yaw);
        targetVelocities.z += velocity * Math.cos(yaw);
      }
      
      if (a) {
        targetVelocities.x -= velocity * Math.cos(yaw);
        targetVelocities.z += velocity * Math.sin(yaw);
      }
      
      if (d) {
        targetVelocities.x += velocity * Math.cos(yaw);
        targetVelocities.z -= velocity * Math.sin(yaw);
      }

      // Normalize for diagonals
      const length = Math.sqrt(targetVelocities.x * targetVelocities.x + targetVelocities.z * targetVelocities.z);
      if (length > velocity) {
        const factor = velocity / length;
        targetVelocities.x *= factor;
        targetVelocities.z *= factor;
      }
    }

    // Calculate jump velocity
    if (sp && this.canJump(this)) {
      if (this.isGrounded && currentVelocity.y > -0.001 && currentVelocity.y <= 3) {
        targetVelocities.y = this.jumpVelocity;
      }
    }

    // Apply velocities
    const platformVelocity = this._platform ? this._platform.linearVelocity : { x: 0, y: 0, z: 0 };
    const deltaVelocities = {
      x: targetVelocities.x - currentVelocity.x + platformVelocity.x,
      y: targetVelocities.y + platformVelocity.y,
      z: targetVelocities.z - currentVelocity.z + platformVelocity.z,
    };

    const hasExternalVelocity = 
      Math.abs(currentVelocity.x) > this.runVelocity ||
      Math.abs(currentVelocity.y) > this.jumpVelocity ||
      Math.abs(currentVelocity.z) > this.runVelocity;
    
    if (!hasExternalVelocity || this.isOnPlatform) {
      if (Object.values(deltaVelocities).some(v => v !== 0)) {
        const mass = entity.mass;        
        entity.applyImpulse({
          x: deltaVelocities.x * mass,
          y: deltaVelocities.y * mass,
          z: deltaVelocities.z * mass,
        });
      }
    }

    // Apply rotation
    if (yaw !== undefined) {
      const halfYaw = yaw / 2;
      entity.setRotation({
        x: 0,
        y: Math.fround(Math.sin(halfYaw)),
        z: 0,
        w: Math.fround(Math.cos(halfYaw)),
      });
    }
  }
}