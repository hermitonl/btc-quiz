/**
 * HYTOPIA SDK Boilerplate
 */

import {
  PlayerCameraMode,
  PlayerEntity,
  startServer,
  PlayerEvent,
  BlockType,
  World,
  Player,
  Entity, // Added Entity
  type Vector3Like, // Added Vector3Like
  EntityEvent, // Added EntityEvent
  type EntityEventPayloads, // Added EntityEventPayloads
  ColliderShape // Corrected from CollisionShapeType
} from "hytopia";
import CustomPlayerEntityController from "./scripts/CustomPlayerEntityController"; // Import the custom controller
import { type BlockTypeOptions } from "hytopia"; // Use type-only import
import { type Maze, CellType } from "./maze-game-src/Maze.ts"; // Add type keyword
import { WilsonMaze } from "./maze-game-src/gen/Wilson.ts";
import { BLOCK_TYPE_GOAL, BLOCK_TYPE_VISITED, MazeWorld, BLOCK_TYPE_FLOOR } from "./maze-game-src/MazeWorld.ts"; // Import BLOCK_TYPE_FLOOR

let currentMaze = new WilsonMaze(15, 15);
let playerInGoal = false;

startServer((world) => {
	// world.simulation.enableDebugRendering(true);

	world.loadMap(new MazeWorld(currentMaze));

	world.on(PlayerEvent.JOINED_WORLD, ({ player }) => {
		const startPos = currentMaze.startPos();
		const spawnPosition: Vector3Like = {
			x: startPos.x + 0.5,
			y: 3, // Ensure spawn is slightly above ground
			z: startPos.z + 0.5,
		};

		const playerEntity = new PlayerEntity({
			player,
			name: "Player",
			modelUri: "models/players/player.gltf",
			modelScale: 0.7,
			controller: new CustomPlayerEntityController({}), // Attach the custom controller
			// Position is set via spawn method
		});

		// Configure camera after entity creation
		playerEntity.player.camera.setMode(PlayerCameraMode.FIRST_PERSON);
		playerEntity.player.camera.setOffset({ x: 0, y: 0.7, z: 0 });
		playerEntity.player.camera.setModelHiddenNodes(["head", "neck"]);

		// Reset playerInGoal flag when a player joins
		playerInGoal = false;

		// Spawn the player entity with position
		playerEntity.spawn(world, spawnPosition);

		      // Removed attempt to set collider after spawn


		// Send initial message to the player
		world.chatManager.sendPlayerMessage(
			player,
			'Welcome! Use WASD keys to move. Type "/generate <width> <height>" to create a new maze.',
		);

        // Removed outdated onTick logic
	}); // End JOINED_WORLD

	world.on(PlayerEvent.LEFT_WORLD, ({ player }) => {
		// Find the specific entity for the leaving player
		const playerEntity = world.entityManager.getAllEntities().find(entity => entity instanceof PlayerEntity && entity.player === player) as PlayerEntity | undefined;
		if (playerEntity) {
			playerEntity.despawn();
		}
	});

	// Use world.on for UPDATE_POSITION
	world.on(EntityEvent.UPDATE_POSITION, (payload: EntityEventPayloads[EntityEvent.UPDATE_POSITION]) => {
		const entity = payload.entity;
		const currentPos = payload.position;

		// Check only for player entities
		if (!(entity instanceof PlayerEntity)) {
			return;
		}

		const goalPos = currentMaze.goalPos();
	       const startPos = currentMaze.startPos(); // Get start position for comparison

		// --- Goal Detection ---
		// Check if player is within the goal cell boundaries (checking floor position)
	       const currentCellX = Math.floor(currentPos.x);
	       const currentCellZ = Math.floor(currentPos.z);

		if (
			currentCellX === goalPos.x &&
			currentCellZ === goalPos.z &&
			!playerInGoal // Check if goal message hasn't been sent yet
		) {
			playerInGoal = true; // Set flag to prevent multiple messages
			world.chatManager.sendPlayerMessage(
				entity.player,
				"Congratulations, you solved the maze!",
			);
	           world.chatManager.sendPlayerMessage(
				entity.player,
				'Type "/generate <width> <height>" to create a new maze.',
			);
		} else if (
			// Reset goal flag if player moves out of the goal cell
			(currentCellX !== goalPos.x || currentCellZ !== goalPos.z) &&
			playerInGoal
		) {
			playerInGoal = false;
		}

	       // --- Visited Block Logic ---
	       // Check if the player is on a floor block that isn't start or goal
	       const blockBelowId = world.chunkLattice.getBlockId({x: currentCellX, y: 0, z: currentCellZ}); // Use getBlockId
	       if (blockBelowId === BLOCK_TYPE_FLOOR.id) { // Check if it's a floor block ID
	            world.chunkLattice.setBlock({
	               x: currentCellX,
	               y: 0,
	               z: currentCellZ,
	           }, BLOCK_TYPE_VISITED.id); // Set to visited
	       }
	});


	world.chatManager.registerCommand("/generate", (player, args) => {
		// Validate arguments
		const widthArg = args[0];
		const heightArg = args[1];
		let width = 15; // Default width
		let height = 15; // Default height
		if (widthArg && heightArg) {
			const parsedWidth = Number.parseInt(widthArg);
			const parsedHeight = Number.parseInt(heightArg);
			if (!isNaN(parsedWidth) && !isNaN(parsedHeight)) {
				// Clamp dimensions to reasonable values
				width = Math.max(5, Math.min(50, parsedWidth));
				height = Math.max(5, Math.min(50, parsedHeight));
			} else {
                world.chatManager.sendPlayerMessage(player, "Invalid size. Width and height must be numbers.", "FF0000");
                return;
            }
		} else {
			world.chatManager.sendPlayerMessage(player, "Usage: /generate <width> <height>", "FF0000");
			return;
		}

		// Generate new maze and update player positions
		currentMaze = new WilsonMaze(width, height);
        playerInGoal = false; // Reset goal flag
		const startPos = currentMaze.startPos();
		world.entityManager.getAllPlayerEntities().forEach((entity) => {
            if (entity instanceof PlayerEntity) { // Ensure it's a PlayerEntity
                entity.setPosition({ // Use setPosition
                    x: startPos.x + 0.5,
                    y: 3, // Adjust Y position if needed
                    z: startPos.z + 0.5,
                });
            }
		});

		// Reload the map with the new maze
        // Despawn old chunks before loading new map
		world.chunkLattice.getAllChunks().forEach((chunk) => chunk.despawn());
		world.loadMap(new MazeWorld(currentMaze));
		world.chatManager.sendPlayerMessage(
			player,
			`Generated a new ${currentMaze.width} by ${currentMaze.height} maze.`,
		);
	});
}); // Closing bracket for startServer
