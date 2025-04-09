import { CellType, Maze, Vector2 } from "../Maze.ts";

const enum Direction {
	Up,
	Down,
	Left,
	Right,
}

/**
 * The position you get when stepping in a given direction for a given amount of tiles.
 *
 * @param pos the position to step from
 * @param dir the direction to step in
 * @param scale the number of tiles to step
 */
function stepIn(pos: Vector2, dir: Direction, scale: number): Vector2 {
	switch (dir) {
		case Direction.Up:
			return { x: pos.x, z: pos.z - scale };
		case Direction.Down:
			return { x: pos.x, z: pos.z + scale };
		case Direction.Left:
			return { x: pos.x - scale, z: pos.z };
		case Direction.Right:
			return { x: pos.x + scale, z: pos.z };
	}
}

/**
 * Returns a hash value for any Vector2 that is perfect for coordinates in [0, 2^16)
 *
 * @param vec the vector to generate a hash value for
 */
function hash(vec: Vector2): number {
	return ((vec.x & 0xFFFF) << 16) | (vec.z & 0xFFFF);
}
export class WilsonMaze implements Maze {
	readonly width: number;
	readonly height: number;

	readonly cells: Array<CellType>;
	readonly startIndex: number;
	readonly goalIndex: number;

	/**
	 * Construct a maze with the given dimensions. If any of the dimensions is even,
	 * it is rounded up to the nearest odd number.
	 *
	 * @param width the width (in cells) this maze should have
	 * @param height the height (in cells) this maze should have
	 * @param startPos the starting position in this maze. If no starting position is specified, (1, 1) is used.
	 * @param goalPos the goal position in this maze. If no goal position is specified, (width - 2, height - 2) is used.
	 */
	constructor(
		width: number,
		height: number,
		startPos?: Vector2,
		goalPos?: Vector2,
	) {
		this.width = width + (width % 2 == 0 ? 1 : 0);
		this.height = height + (height % 2 == 0 ? 1 : 0);

		const start = startPos === undefined ? { x: 1, z: 1 } : startPos;
		const goal = goalPos === undefined
			? { x: this.width - 2, z: this.height - 2 }
			: goalPos;

		this.startIndex = this.linearize(start.x, start.z);
		this.goalIndex = this.linearize(goal.x, goal.z);

		this.cells = new Array(this.width * this.height);
		for (let z = 0; z < this.height; z++) {
			for (let x = 0; x < this.width; x++) {
				this.cells[z * this.width + x] = CellType.Solid;
			}
		}

		this.cells[this.startIndex] = CellType.Empty;
		this.generateMaze();
	}

	private linearize(x: number, z: number): number {
		return z * this.width + x;
	}

	delinearize(index: number): Vector2 {
		return { x: index % this.width, z: Math.floor(index / this.width) };
	}

	private setCellType(x: number, z: number, cellType: CellType) {
		this.cells[this.linearize(x, z)] = cellType;
	}

	private getCellType(x: number, z: number): CellType {
		return this.cells[this.linearize(x, z)];
	}

	private generateMaze() {
		let unvisitedIntersections =
			Math.floor(this.width / 2) * Math.floor(this.height / 2) - 1;

		while (unvisitedIntersections > 0) {
			const start = this.randomOddCell();
			const path = this.randomWalk(start);

			let curr = start;
			while (this.getCellType(curr.x, curr.z) === CellType.Solid) {
				this.setCellType(curr.x, curr.z, CellType.Empty);
				const dir = path.get(hash(curr))!;
				const between = stepIn(curr, dir, 1);
				this.setCellType(between.x, between.z, CellType.Empty);
				curr = stepIn(curr, dir, 2);

				unvisitedIntersections--;
			}
		}
	}

	private randomWalk(
		start: Vector2,
	): Map<number, Direction> {
		const path = new Map();
		let curr = start;

		while (this.getCellType(curr.x, curr.z) == CellType.Solid) {
			const dir = this.randomDir();
			const nextPos = stepIn(curr, dir, 2);

			if (
				nextPos.x < 0 || nextPos.z < 0 || nextPos.x > this.width - 1 ||
				nextPos.z > this.height - 1
			) {
				continue;
			}

			path.set(hash(curr), dir);

			curr = nextPos;
			if (this.getCellType(nextPos.x, nextPos.z) != CellType.Solid) {
				break;
			}
		}

		return path;
	}

	private randomOddCell(): Vector2 {
		const x = Math.floor(Math.random() * (this.width - 1) / 2);
		const z = Math.floor(Math.random() * (this.height - 1) / 2);

		return { x: 2 * x + 1, z: 2 * z + 1 };
	}

	private randomDir(): Direction {
		const index = Math.floor(Math.random() * 4);
		return index as Direction;
	}

	public startPos(): Vector2 {
		return this.delinearize(this.startIndex);
	}

	public goalPos(): Vector2 {
		return this.delinearize(this.goalIndex);
	}
}
