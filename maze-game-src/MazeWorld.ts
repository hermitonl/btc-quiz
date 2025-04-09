import { type BlockTypeOptions, BlockType, type WorldMap, type Vector3Like } from "hytopia";
import { CellType, type Maze } from "./Maze.ts";

// Define BlockTypes using the BlockType class with numeric IDs and names
export const BLOCK_TYPE_FLOOR = new BlockType({ id: 1, name: "floor", textureUri: "blocks/bricks.png" });
export const BLOCK_TYPE_START = new BlockType({ id: 2, name: "start", textureUri: "blocks/red.png" });
export const BLOCK_TYPE_GOAL = new BlockType({ id: 3, name: "goal", textureUri: "blocks/green.png" });
export const BLOCK_TYPE_WALL = new BlockType({ id: 4, name: "wall", textureUri: "blocks/bricks.png" });
export const BLOCK_TYPE_VISITED = new BlockType({ id: 5, name: "visited", textureUri: "blocks/blue.png" });

// Scale factor for maze generation
const MAZE_SCALE = 3; // Increased scale for wider paths

// Implement WorldMap interface
export class MazeWorld implements WorldMap {
	width: number;
	height: number;
	spawnPoint: Vector3Like;
	blockTypes: BlockTypeOptions[]; // Keep this for compatibility if needed
    blocks: { [coordinate: string]: number }; // Map coordinates "x,y,z" to block ID

	constructor(private maze: Maze) {
		// Scale dimensions
		this.width = maze.width * MAZE_SCALE;
		this.height = maze.height * MAZE_SCALE;
		// Scale spawn point
		this.spawnPoint = {
			x: maze.startPos().x * MAZE_SCALE + MAZE_SCALE / 2,
			y: 3, // Keep spawn height
			z: maze.startPos().z * MAZE_SCALE + MAZE_SCALE / 2
		};

        this.blocks = {};

		// Define block types for the WorldMap (might be redundant)
		this.blockTypes = [
			{ id: BLOCK_TYPE_FLOOR.id, name: "floor", textureUri: BLOCK_TYPE_FLOOR.textureUri },
			{ id: BLOCK_TYPE_START.id, name: "start", textureUri: BLOCK_TYPE_START.textureUri },
			{ id: BLOCK_TYPE_GOAL.id, name: "goal", textureUri: BLOCK_TYPE_GOAL.textureUri },
			{ id: BLOCK_TYPE_WALL.id, name: "wall", textureUri: BLOCK_TYPE_WALL.textureUri },
			{ id: BLOCK_TYPE_VISITED.id, name: "visited", textureUri: BLOCK_TYPE_VISITED.textureUri },
		];

        // Pre-populate the blocks map based on the scaled maze
        this.maze.cells.forEach((cell, index) => {
			const pos = this.maze.delinearize(index); // Original maze coordinates

            for (let dx = 0; dx < MAZE_SCALE; dx++) {
                for (let dz = 0; dz < MAZE_SCALE; dz++) {
                    const worldX = pos.x * MAZE_SCALE + dx;
                    const worldZ = pos.z * MAZE_SCALE + dz;

                    if (cell === CellType.Solid) {
                        // Two block high walls
                        this.addBlock(worldX, 1, worldZ, BLOCK_TYPE_WALL.id);
                        this.addBlock(worldX, 2, worldZ, BLOCK_TYPE_WALL.id);
                    } else if (cell === CellType.Empty) {
                        // Ground plane for empty cells
                        let blockId = BLOCK_TYPE_FLOOR.id; // Default floor
                        if (index === this.maze.startIndex) {
                            blockId = BLOCK_TYPE_START.id;
                        } else if (index === this.maze.goalIndex) {
                            blockId = BLOCK_TYPE_GOAL.id;
                        }
                        this.addBlock(worldX, 0, worldZ, blockId);
                    }
                }
            }
		});
	}

    // Helper to add block to the map
	addBlock(x: number, y: number, z: number, id: number) {
		this.blocks[`${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`] = id;
	}

    // Required by WorldMap interface - simple lookup
	getBlock(x: number, y: number, z: number): BlockType | undefined {
        const blockId = this.blocks[`${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`];
        switch (blockId) {
            case BLOCK_TYPE_FLOOR.id: return BLOCK_TYPE_FLOOR;
            case BLOCK_TYPE_START.id: return BLOCK_TYPE_START;
            case BLOCK_TYPE_GOAL.id: return BLOCK_TYPE_GOAL;
            case BLOCK_TYPE_WALL.id: return BLOCK_TYPE_WALL;
            case BLOCK_TYPE_VISITED.id: return BLOCK_TYPE_VISITED;
            default: return undefined;
        }
	}

    // setBlock is not part of the standard WorldMap interface
    // Visited block logic needs to be handled in the main game script using world.chunkLattice.setBlock
}
