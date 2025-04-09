import { Entity, EntityEvent, Player, PlayerEntity } from "hytopia";
import { TEAM_COLORS } from "../gameState/team";
import {
  MAX_STAMINA,
  PUNCH_FORCE,
  PUNCH_VERTICAL_FORCE,
  RESPAWN_INVINCIBILITY_TIME,
  STRENGTH_BOOST_MULTIPLIER,
  STRENGTH_BOOST_DURATION,
} from "../utilities/gameConfig";
import { PlayerClass } from "./player-types";
import CustomPlayerController from "../controllers/CustomPlayerController";
import { globalState } from "../gameState/global-state";
import type TeamManager from "../gameState/team";
import { ParticleEmitter } from "../particles/particle-emmitter";
import { ParticleFX } from "../particles/particles-fx";
import NPCEntity from "./NPCEntity";
import { getDirectionFromRotation } from "../utilities/math";
class CustomPlayerEntity extends PlayerEntity {
  private playerClass: PlayerClass = PlayerClass.SLINGSHOT;
  private kills: number = 0;
  private playerDeaths: number = 0;
  private playerPoints: number = 0;
  private lastHitBy: string = "";
  private stamina: number = 0;
  private maxStamina: number = 0;
  private invincible: boolean = false;
  private strengthBoostActive: boolean = false;
  private team: number = 0;
  private isTackling: boolean = false;
  private strengthBoostEmitter: ParticleEmitter | null = null;
  private strengthBoostInterval: number | null = null;
  private isRespawning: boolean = false;
  private activeBoosts: {
    strength: { count: number; timeouts: number[]; remainingTime: number };
    invincibility: { count: number; timeouts: number[]; remainingTime: number };
  } = {
    strength: { count: 0, timeouts: [], remainingTime: 0 },
    invincibility: { count: 0, timeouts: [], remainingTime: 0 }
  };
  private _lastInvincibilityUpdate: number | null = null;
  private _lastStrengthUpdate: number | null = null;

  constructor(player: Player, team: number, teamManager: TeamManager) {
    super({
      player,
      name: "Player",
      modelUri:
        team === TEAM_COLORS.BLUE
          ? "models/players/player-blue.gltf"
          : "models/players/player-red.gltf",
      modelLoopedAnimations: ["idle"],
      modelScale: 0.5,
    });
    this.team = team;
    this.stamina = MAX_STAMINA[this.playerClass];

    // Set the custom controller
    const world = globalState.world;
    this.setController(new CustomPlayerController({
      teamManager: teamManager,
      world: world,
    }));
    this.player.camera.setOffset({x: 0, y: 0.8, z: 0});

    this.on(EntityEvent.ENTITY_COLLISION, ({ entity, otherEntity, started }) => {
      if (
        (otherEntity instanceof CustomPlayerEntity || otherEntity instanceof NPCEntity) &&
        entity instanceof CustomPlayerEntity && 
        this.isPlayerTackling() &&
        started
      ) {
        const direction = getDirectionFromRotation(entity.rotation)
        const verticalForce = Math.max(direction.y, 0.7) * PUNCH_VERTICAL_FORCE;
        let multiplier = 1;
        if (entity.isStrengthBoostActive()) {
          multiplier = STRENGTH_BOOST_MULTIPLIER;
          if(otherEntity instanceof NPCEntity) {
            multiplier = 5;
          }
        }
        otherEntity.applyImpulse({
          x: direction.x * PUNCH_FORCE * multiplier,
          y: verticalForce * multiplier,
          z: direction.z * PUNCH_FORCE * multiplier,
        });
        otherEntity.setLastHitBy(entity.player.username);
      }
    });
  }

  public getKills(): number {
    return this.kills;
  }

  public getTeam(): number {
    return this.team;
  }

  public getPlayerClass(): PlayerClass {
    return this.playerClass;
  }

  public getDisplayName(): string {
    return this.player.username;
  }

  public setPlayerClass(playerClass: PlayerClass): void {
    this.maxStamina = MAX_STAMINA[playerClass];
    this.playerClass = playerClass;
  }

  public getPlayerDeaths(): number {
    return this.playerDeaths;
  }

  public getPlayerPoints(): number {
    return this.playerPoints;
  }

  public getLastHitBy(): string {
    return this.lastHitBy;
  }

  public getIsRespawning(): boolean {
    return this.isRespawning;
  }

  public setIsRespawning(isRespawning: boolean): void {
    this.isRespawning = isRespawning;
  }

  public getStamina(): number {
    return this.stamina;
  }

  public getMaxStamina(): number {
    return this.maxStamina;
  }

  public isInvincible(): boolean {
    return this.invincible;
  }

  public isStrengthBoostActive(): boolean {
    return this.strengthBoostActive;
  }

  public setKills(kills: number): void {
    this.kills = kills;
  }

  public incrementPlayerDeaths(): void {
    this.playerDeaths++;
  }

  public incrementKills(): void {
    this.kills++;
  }

  public incrementPlayerPoints(points: number): void {
    this.playerPoints += points;
  }

  public resetData(): void {
    this.stamina = this.maxStamina;
    this.playerPoints = 0;
    this.kills = 0;
    this.playerDeaths = 0;
  }

  public setLastHitBy(lastHitBy: string): void {
    this.lastHitBy = lastHitBy;
  }

  public setStamina(stamina: number): void {
    if (stamina + this.stamina > this.maxStamina) {
      this.stamina = this.maxStamina;
    } else {
      this.stamina += stamina;
    }
  }

  public setInvincible(): void {
    // Clear any existing timeouts
    this.activeBoosts.invincibility.timeouts.forEach(timeout => clearTimeout(timeout));
    this.activeBoosts.invincibility.timeouts = [];
    
    // Calculate new remaining time
    const currentTime = Date.now();
    this.activeBoosts.invincibility.remainingTime = RESPAWN_INVINCIBILITY_TIME;
    if (this._lastInvincibilityUpdate) {
      const elapsedTime = currentTime - this._lastInvincibilityUpdate;
      const previousRemainingTime = Math.max(0, this.activeBoosts.invincibility.remainingTime - elapsedTime);
      this.activeBoosts.invincibility.remainingTime += previousRemainingTime;
    }
    this._lastInvincibilityUpdate = currentTime;

    // Set invincibility active
    this.invincible = true;
    this.setOpacity(0.5);

    // Add new timeout for total remaining time
    const timeout = setTimeout(() => {
      this.invincible = false;
      this.setOpacity(1);
      this.activeBoosts.invincibility.remainingTime = 0;
      this._lastInvincibilityUpdate = null;
    }, this.activeBoosts.invincibility.remainingTime) as unknown as number;

    // Store the timeout
    this.activeBoosts.invincibility.timeouts = [timeout];
  }

  public setStrengthBoostActive(strengthBoostActive: boolean): void {
    if (strengthBoostActive) {
      // Clear any existing timeouts
      this.activeBoosts.strength.timeouts.forEach(timeout => clearTimeout(timeout));
      this.activeBoosts.strength.timeouts = [];

      // Calculate new remaining time
      const currentTime = Date.now();
      this.activeBoosts.strength.remainingTime = STRENGTH_BOOST_DURATION;
      if (this._lastStrengthUpdate) {
        const elapsedTime = currentTime - this._lastStrengthUpdate;
        const previousRemainingTime = Math.max(0, this.activeBoosts.strength.remainingTime - elapsedTime);
        this.activeBoosts.strength.remainingTime += previousRemainingTime;
      }
      this._lastStrengthUpdate = currentTime;

      // Set strength boost active
      this.strengthBoostActive = true;

      // Start particle effect if not already active
      if (!this.strengthBoostEmitter && this.isSpawned && this.world) {
        const effectType = this.team === TEAM_COLORS.RED ? 
          ParticleFX.RED_STRENGTH_BOOST : 
          ParticleFX.BLUE_STRENGTH_BOOST;

        this.strengthBoostEmitter = new ParticleEmitter(effectType, this.world);
        this.strengthBoostEmitter.spawn(this.world, this.position);
        
        // Start particle emission if not already running
        if (!this.strengthBoostInterval) {
          this.strengthBoostInterval = setInterval(() => {
            if (this.strengthBoostEmitter && this.isSpawned) {
              this.strengthBoostEmitter.setPosition(this.position);
              this.strengthBoostEmitter.burst();
            }
          }, 100) as unknown as number;
        }
      }

      // Add new timeout for total remaining time
      const timeout = setTimeout(() => {
        this.strengthBoostActive = false;
        this.activeBoosts.strength.remainingTime = 0;
        this._lastStrengthUpdate = null;
        
        // Clean up particle effects
        if (this.strengthBoostInterval) {
          clearInterval(this.strengthBoostInterval);
          this.strengthBoostInterval = null;
        }
        if (this.strengthBoostEmitter) {
          this.strengthBoostEmitter.destroy();
          this.strengthBoostEmitter = null;
        }
      }, this.activeBoosts.strength.remainingTime) as unknown as number;

      // Store the timeout
      this.activeBoosts.strength.timeouts = [timeout];

    } else {
      // Force remove all strength boosts
      this.activeBoosts.strength.timeouts.forEach(timeout => clearTimeout(timeout));
      this.activeBoosts.strength = { count: 0, timeouts: [], remainingTime: 0 };
      this._lastStrengthUpdate = null;
      this.strengthBoostActive = false;
      
      // Clean up particle effects
      if (this.strengthBoostInterval) {
        clearInterval(this.strengthBoostInterval);
        this.strengthBoostInterval = null;
      }
      if (this.strengthBoostEmitter) {
        this.strengthBoostEmitter.destroy();
        this.strengthBoostEmitter = null;
      }
    }
  }

  public despawn(): void {
    // Clear all boost timeouts
    this.activeBoosts.strength.timeouts.forEach(timeout => clearTimeout(timeout));
    this.activeBoosts.invincibility.timeouts.forEach(timeout => clearTimeout(timeout));
    this.activeBoosts = {
      strength: { count: 0, timeouts: [], remainingTime: 0 },
      invincibility: { count: 0, timeouts: [], remainingTime: 0 }
    };
    this._lastInvincibilityUpdate = null;
    this._lastStrengthUpdate = null;

    if (this.strengthBoostInterval) {
      clearInterval(this.strengthBoostInterval);
      this.strengthBoostInterval = null;
    }
    if (this.strengthBoostEmitter) {
      this.strengthBoostEmitter.destroy();
      this.strengthBoostEmitter = null;
    }
    super.despawn();
  }

  public tackle() {
    this.isTackling = true;
    setTimeout(() => {
      this.isTackling = false;
    }, 1000);
  }

  public isPlayerTackling(): boolean {
    return this.isTackling;
  }
}

export default CustomPlayerEntity;
