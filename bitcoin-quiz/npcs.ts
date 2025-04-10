import { World, Entity, Vector3, Player, RigidBodyType, ColliderShape, PlayerEntity, BlockType } from "hytopia"; // Try importing BlockType again

// Simple structure to hold NPC data
interface NpcInfo {
    position: Vector3;
    message: string;
    skin?: string; // Optional: Specify a skin/model if available
    name: string;
}

// Define our NPCs
const npcsToSpawn: NpcInfo[] = [
    {
        position: new Vector3(5, 65, 5), // Center-ish of one quadrant
        message: "NPC 1: The Lightning Network allows for fast, cheap Bitcoin transactions off-chain.",
        name: "LN Expert",
        // skin: "default_npc_skin_1" // Example if skins were available
    },
    {
        position: new Vector3(15, 65, 5), // Another quadrant
        message: "NPC 2: Liquidity in Lightning refers to having funds available to route payments.",
        name: "Liquidity Guru",
        // skin: "default_npc_skin_2"
    },
    {
        position: new Vector3(10, 65, 15), // Near the back
        message: "NPC 3: Channel management involves opening, closing, and balancing your Lightning channels.",
        name: "Channel Master",
        // skin: "default_npc_skin_3"
    }
];

// Function to initialize NPCs, accepting the world object
export function initializeNpcs(world: World): void {
    console.log("Initializing Bitcoin Quiz NPCs...");

    npcsToSpawn.forEach((npcInfo, index) => {
        const npcEntity = new Entity({
            name: npcInfo.name, // Set name during construction
            modelUri: npcInfo.skin || 'models/players/robot1.gltf', // Use specified skin or default skeleton
            modelScale: 0.5, // Match player scale from index.ts example
            modelLoopedAnimations: ['idle'],
            rigidBodyOptions: {
                type: RigidBodyType.FIXED,
                colliders: [
                    // Basic physical collider
                    { shape: ColliderShape.CYLINDER, radius: 0.3, halfHeight: 0.9 }, // Adjusted size
                    // Interaction sensor
                    {
                        shape: ColliderShape.CYLINDER, radius: 1.0, halfHeight: 1.0, isSensor: true, // Larger radius for easier interaction
                        onCollision: (other: Entity | BlockType, started: boolean) => { // Reverted to include BlockType
                            // Check if a player started colliding (entered the sensor)
                            if (started && other instanceof PlayerEntity && other.player) {
                                const player = other.player;
                                // Send the NPC's message to the interacting player
                                world.chatManager.sendPlayerMessage(
                                    player,
                                    `<${npcInfo.name}> ${npcInfo.message}`,
                                    'FFFF00' // Yellow color
                                );
                                console.log(`Player ${player.username} interacted with NPC ${npcInfo.name}`);
                            }
                        }
                    }
                ]
            }
        });

        // Set NPC-specific properties (optional, but good practice) - Name moved to constructor
        // npcEntity.isNpc = true; // isNpc might not be a standard property, depends on API version/custom setup

        // Spawn the entity in the world
        npcEntity.spawn(world, npcInfo.position);

        console.log(`Spawned NPC: ${npcInfo.name} (ID: ${npcEntity.id}) at ${npcInfo.position.x}, ${npcInfo.position.y}, ${npcInfo.position.z}`);

    });

    console.log("Bitcoin Quiz NPCs initialized.");
}