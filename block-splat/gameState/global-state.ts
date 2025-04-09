import { World } from "hytopia";
import type CustomPlayerEntity from "../entities/CustomPlayerEntity";
import type NPCEntity from "../entities/NPCEntity";

export class GlobalState {
  private static instance: GlobalState;
  private _world?: World;

  private constructor() {}

  static getInstance(): GlobalState {
    if (!GlobalState.instance) {
      GlobalState.instance = new GlobalState();
    }
    return GlobalState.instance;
  }

  setWorld(world: World) {
    this._world = world;
  }

  get world(): World {
    if (!this._world) {
      throw new Error("World not initialized in GlobalState");
    }
    return this._world;
  }

  getPlayersOnTeam(teamId: number): CustomPlayerEntity[] {
    return this.getAllPlayers().filter(entity => (entity as CustomPlayerEntity).getTeam() === teamId) as CustomPlayerEntity[];
  }

  getAllPlayers(): CustomPlayerEntity[] {
    return this.world.entityManager.getAllPlayerEntities() as CustomPlayerEntity[];
  }

  getPlayerEntity(playerId: string): CustomPlayerEntity {
    return this.world.entityManager.getAllPlayerEntities().find(entity => entity.player.username === playerId) as CustomPlayerEntity;
  }

  getAllNPCs(): NPCEntity[] {
    return this.world.entityManager.getEntitiesByTag("npc") as NPCEntity[];
  }
}

export const globalState = GlobalState.getInstance();
