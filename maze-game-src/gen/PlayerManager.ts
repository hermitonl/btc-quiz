import { Vector3 } from "hytopia";
import { Vector2 } from "../Maze.ts";

/**
 * This class is responsible for allocating mazes
 */
export class PositionManager {
	positionMap: Map<number, Vector2>;
	size: number;

	constructor() {
		this.positionMap = new Map();
		this.size = 0;
	}

	public nextPosition(): Vector2 {
		// inverted cantor pairing function
		const z = this.size;
		const w = Math.floor(Math.sqrt(8 * z + 1) - 1);
		const t = (w * w + w) / 2;
		const y = z - t;
		const x = w - y;

		this.size++;
		return { x: x, z: y };
	}
}
