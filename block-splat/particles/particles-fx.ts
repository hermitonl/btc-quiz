import { type EmitterOptions } from "./particle-emmitter";

export const ParticleFX = {
    RED_PAINT: {
        count: 2,
        speed: 1.5,
        spawnOptions: {
            radius: 0.8,
            shellOnly: false,
            useSpawnDirectionForVelocity: false,
            velocityRandomness: 0.8 // 30% randomness
        },
        particleOptions: {
            color: { r: 255, g: 0, b: 0 },
            size: 0.8,
            sizeRandomness: 1, // 30% size variation
            lifetime: 0.5,
            modelUri: 'models/particles/blooddrop.gltf',
            gravityScale: 0.6
        }
    } satisfies EmitterOptions,

    RED_STRENGTH_BOOST: {
        count: 10,
        speed: 2,
        spawnOptions: {
            radius: 1.2,
            shellOnly: true,
            useSpawnDirectionForVelocity: true,
            velocityRandomness: 0.3,
            direction: { x: 0, y: 1, z: 0 }
        },
        particleOptions: {
            color: { r: 255, g: 0, b: 0 },
            size: 0.4,
            sizeRandomness: 0.2,
            lifetime: 0.8,
            lifetimeRandomness: 0.2,
            modelUri: 'models/particles/blooddrop.gltf',
            gravityScale: 0.1
        }
    } satisfies EmitterOptions,

    BLUE_STRENGTH_BOOST: {
        count: 10,
        speed: 2,
        spawnOptions: {
            radius: 1.2,
            shellOnly: true,
            useSpawnDirectionForVelocity: true,
            velocityRandomness: 0.3,
            direction: { x: 0, y: 1, z: 0 }
        },
        particleOptions: {
            color: { r: 0, g: 0, b: 255 },
            size: 0.4,
            sizeRandomness: 0.2,
            lifetime: 0.8,
            lifetimeRandomness: 0.2,
            modelUri: 'models/particles/blue-blob.gltf',
            gravityScale: 0.1
        }
    } satisfies EmitterOptions,

    STRENGTH_BOOST: {
        count: 12,
        speed: 2,
        spawnOptions: {
            radius: 1.2,
            shellOnly: true,
            useSpawnDirectionForVelocity: true,
            velocityRandomness: 0.3,
            direction: { x: 0, y: 1, z: 0 }
        },
        particleOptions: {
            color: { r: 255, g: 215, b: 0 }, // Golden color
            size: 0.4,
            sizeRandomness: 0.2,
            lifetime: 0.8,
            lifetimeRandomness: 0.2,
            modelUri: 'models/particles/ember.gltf',
            gravityScale: 0.1
        }
    } satisfies EmitterOptions,

    BLUE_PAINT: {
        count: 2,
        speed: 1.5,
        spawnOptions: {
            radius: 0.8,
            shellOnly: false,
            useSpawnDirectionForVelocity: false,
            velocityRandomness: 0.8 // 30% randomness
        },
        particleOptions: {
            color: { r: 0, g: 0, b: 255 },
            size: 0.8,
            sizeRandomness: 1, // 30% size variation
            lifetime: 0.5,
            modelUri: 'models/particles/blue-blob.gltf',
            gravityScale: 0.6
        }
    } satisfies EmitterOptions,

    BIG_BLUE: {
        count: 8,
        speed: 1.5,
        spawnOptions: {
            radius: 0.2,
            shellOnly: false,
            useSpawnDirectionForVelocity: false,
            velocityRandomness: 0.8 // 30% randomness
        },
        particleOptions: {
            color: { r: 0, g: 0, b: 255 },
            size: 2.5,
            sizeRandomness: 0.3, // 30% size variation
            lifetime: 0.5,
            modelUri: 'models/particles/blue-blob.gltf',
            gravityScale: 0.6
        }
    } satisfies EmitterOptions,

    EXPLOSION: {
        count: 20,
        speed: 3,
        spawnOptions: {
            radius: 0.05,
            shellOnly: false,
            useSpawnDirectionForVelocity: true,
            velocityRandomness: 0.7 // 30% randomness
        },
        particleOptions: {
            color: { r: 255, g: 0, b: 0 },
            size: 3.5,
            sizeRandomness: 0.2, // 30% size variation
            lifetime: 0.5,
            lifetimeRandomness: 0.3, // 30% lifetime variation
            modelUri: 'models/particles/ember.gltf',
            gravityScale: 0.2
        }
    } satisfies EmitterOptions,
    FOUNTAIN: {
        count: 20,
        speed: 5,
        spawnOptions: {
            radius: 0.2,
            direction: { x: 0, y: 1, z: 0 }, // Shoot upward
            velocityRandomness: 0.2
        },
        particleOptions: {
            color: { r: 0, g: 0.5, b: 1 },
            size: 0.2,
            lifetime: 2,
            modelUri: 'models/particles/water-drop.gltf',
            gravityScale: 0.8
        }
    } satisfies EmitterOptions
} as const;

// Type for accessing particle effects
export type ParticleEffectType = keyof typeof ParticleFX; 