// Manages active teams, their metadata and active players
import type { Vector3Like, World } from "hytopia";
import { LOBBY_SPAWN } from "../events/player-events";

interface Team {
  id: number;
  name: string;
  spawn?: Vector3Like;
  players: Set<string>;
}

export const TEAM_COLORS = {
  BLUE: 1,
  RED: 2,
  GREEN: 3,
  YELLOW: 4,
} as const;

export const TEAM_COLOR_STRINGS: { [key: number]: string } = {
  [TEAM_COLORS.BLUE]: 'BLUE',
  [TEAM_COLORS.RED]: 'RED',
  [TEAM_COLORS.GREEN]: 'GREEN',
  [TEAM_COLORS.YELLOW]: 'YELLOW',
};

export default class TeamManager {
  private teams: Map<number, Team>;
  
  // Will add support for multiple teams later
  // private maxTeams: number;

  getPlayerColor(playerId: string): string {
    const teamId = this.getPlayerTeam(playerId);
    return teamId ? TEAM_COLOR_STRINGS[teamId] ?? 'WHITE' : 'WHITE';
  }

  constructor(teamNames: string[] = ["Blue Bandits", "Red Raiders"], spawns: Vector3Like[]) {
    this.teams = new Map();
    for (let i = 1; i <= teamNames.length; i++) {
      this.teams.set(i, {
        id: i,
        name: teamNames[i - 1],
        spawn: { ...spawns[i - 1] }, // Create a new object to avoid sharing reference
        players: new Set()
      });
    }
  }

  spawnPlayers(world: World) {
    const players = world.entityManager.getAllPlayerEntities();
    for(const player of players) {
      const team = this.getPlayerTeam(player.player.username);
      const spawn = team ? this.getTeamSpawn(team) : undefined;
      if (spawn) {
        const randomPosition = {
          x: spawn.x + (Math.random() * 2 - 1),
          y: spawn.y,
          z: spawn.z + (Math.random() * 2 - 1)
        };
        player.setPosition(randomPosition);
      }
    }
  }

  sendAllPlayersToLobby(world: World) {
    const players = world.entityManager.getAllPlayerEntities();
    for(const player of players) {
      const randomLobbyPosition = { x: LOBBY_SPAWN.x + (Math.random() * 3 - 1.5), y: LOBBY_SPAWN.y, z: LOBBY_SPAWN.z + (Math.random() * 3 - 1.5) };
      player.setPosition(randomLobbyPosition);
    }
  }

  addPlayerToTeam(playerId: string, teamId: number) {
    const team = this.teams.get(teamId);
    if (!team) {
      return;
    }

    // Remove player from current team if they're in one
    this.removePlayer(playerId);

    // Add to new team
    team.players.add(playerId);
  }

  addPlayerToMinTeam(playerId: string) {
    // Find team with lowest number of players
    let minPlayers = Number.MAX_SAFE_INTEGER;
    let targetTeamId = 1;

    for (const [id, team] of this.teams) {
      if (team.players.size < minPlayers) {
        minPlayers = team.players.size;
        targetTeamId = id;
      }
    }

    this.addPlayerToTeam(playerId, targetTeamId);
  }

  switchTeam(playerId: string): void {
    const currentTeamId = this.getPlayerTeam(playerId);
    if (currentTeamId) {
      this.removePlayer(playerId);
      this.addPlayerToTeam(playerId, currentTeamId === 1 ? 2 : 1);
    }
  }

  removePlayer(playerId: string): void {
    for (const team of this.teams.values()) {
      if (team.players.delete(playerId)) {
        break;
      }
    }
  }

  getPlayerTeam(playerId: string): number | undefined {
    for (const [id, team] of this.teams) {
      if (team.players.has(playerId)) {
        return id;
      }
    }
    return undefined;
  }

  getTeamPlayers(teamId: number): Set<string> | undefined {
    return this.teams.get(teamId)?.players;
  }

  setTeamSpawn(teamId: number, spawn: Vector3Like): boolean {
    const team = this.teams.get(teamId);
    if (!team) {
      return false;
    }
    // Create new object to avoid external modifications
    team.spawn = { x: spawn.x, y: spawn.y, z: spawn.z };
    return true;
  }

  getTeamSpawn(teamId: number): Vector3Like | undefined {
    // get random position in a 2 block radius of the spawn
    const spawn = this.teams.get(teamId)?.spawn;
    if (!spawn) {
      return undefined;
    }
    return {
      x: spawn.x + (Math.random() * 2 - 1),
      y: spawn.y,
      z: spawn.z + (Math.random() * 2 - 1)
    };
  }

  setTeamName(teamId: number, name: string): boolean {
    const team = this.teams.get(teamId);
    if (!team) {
      return false;
    }
    team.name = name;
    return true;
  }

  getTeamName(teamId: number): string | undefined {
    return this.teams.get(teamId)?.name;
  }
}
