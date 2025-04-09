import { CellType, Maze, Vector2 } from "../Maze.ts";

export class EdgePercolationMaze implements Maze {
	width: number;
	height: number;
	cells: CellType[];
	startIndex: number;
	goalIndex: number;

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
				let cellType = CellType.Empty;
				if (
					x == 0 || x == this.width - 1 || z == 0 ||
					z == this.height - 1
				) {
					cellType = CellType.Solid;
				} else if (x % 2 == 1 && z % 2 == 1) {
					cellType = CellType.Empty;
				} else if (x % 2 == 0 && z % 2 == 0) {
					cellType = CellType.Solid;
				}

				this.cells[z * this.width + x] = cellType;
			}
		}

		const p = 0.57;
		for (let z = 1; z < this.height - 1; z++) {
			for (let x = 1; x < this.width - 1; x++) {
				if (z % 2 == 0 || x % 2 == 0) {
					if (Math.random() >= p) {
						this.cells[z * this.width + x] = CellType.Solid;
					}
				}
			}
		}
	}
	startPos(): Vector2 {
		return this.delinearize(this.startIndex);
	}
	goalPos(): Vector2 {
		return this.delinearize(this.goalIndex);
	}

	delinearize(index: number): Vector2 {
		return { x: index % this.width, z: Math.floor(index / this.width) };
	}

	private linearize(x: number, z: number): number {
		return z * this.width + x;
	}
}
