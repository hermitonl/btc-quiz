export enum CellType {
	Solid = 0,
	Empty,
}

export type Vector2 = { x: number; z: number };

export function hash(vec: Vector2): number {
	return ((vec.x & 0xFFFF) << 16) | (vec.z & 0xFFFF);
}

export interface Maze {
	readonly width: number;
	readonly height: number;

	readonly cells: Array<CellType>;
	readonly startIndex: number;
	readonly goalIndex: number;

	delinearize(index: number): Vector2;
	startPos(): Vector2;
	goalPos(): Vector2;
}
