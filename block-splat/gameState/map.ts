// Not yet implemented
import type { World } from "hytopia";
import map1 from "../assets/maps/mainMap.json";
import map2 from "../assets/maps/secondMap.json";

const MAPS = [
  {
    name: "map1",
    worldMap: map1,
  },
  {
    name: "map2",
    worldMap: map2,
  },
];

export default class GameMap {
  private world: World;
  private currentMap: number;

  constructor(world: World) {
    this.world = world;
    this.currentMap = 0;
  }

  public loadMap(mapName: string) {
    const map = MAPS.find((map) => map.name === mapName);
    this.world.loadMap(map?.worldMap || map1);
  }

  public switchMap() {
    const currentMap = this.currentMap;
    const nextMap = currentMap === 0 ? 1 : 0;
    this.world.loadMap(MAPS[nextMap].worldMap);
    this.currentMap = nextMap;
  }
}
