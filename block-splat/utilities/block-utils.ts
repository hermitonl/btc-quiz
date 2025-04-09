// Utility functions for managing block states and help with map cleanup
import type { Vector3Like, World } from 'hytopia';

export enum BLOCK_STATE {
  EMPTY = 0,
  BLUE = 1,
  RED = 2
}

// Helper function to generate consistent key format for the block map
export function getBlockKey(pos: Vector3Like): string {
  return `${Math.floor(pos.x)},${Math.floor(pos.y)},${Math.floor(pos.z)}`;
}

export function getBlockIdFromState(state: BLOCK_STATE): number {
  switch(state) {
    case BLOCK_STATE.BLUE:
      return BLUE_BLOCK_ID;
    case BLOCK_STATE.RED:
      return RED_BLOCK_ID;
    default:
      return BLANK_BLOCK_ID;
  }
}

export function getStateFromTag(tag: string): BLOCK_STATE {
  if(tag === 'RED') {
    return BLOCK_STATE.RED;
  } else if(tag === 'BLUE') {
    return BLOCK_STATE.BLUE;
  }
  return BLOCK_STATE.EMPTY;
}

// Helper functions to interact with the map
export function setBlockState(blockStateMap: Map<string, BLOCK_STATE>, pos: Vector3Like, state: BLOCK_STATE): void {
  blockStateMap.set(getBlockKey(pos), state);
}

export function getBlockState(blockStateMap: Map<string, BLOCK_STATE>, pos: Vector3Like): BLOCK_STATE {
  return blockStateMap.get(getBlockKey(pos)) ?? BLOCK_STATE.EMPTY;
}

export async function clearBlockStates(blockStateMap: Map<string, BLOCK_STATE>, world: World): Promise<void> {
  const blockKeys = Array.from(blockStateMap.keys());
  
  for (const key of blockKeys) {
    const [x, y, z] = key.split(',').map(Number);
    setBlockState(blockStateMap, { x, y, z }, BLOCK_STATE.EMPTY);
    world.chunkLattice.setBlock({ x, y, z }, BLANK_BLOCK_ID);
    
    // Yield control to allow other operations between block updates
    // TODO would probably perform better somewhere in ontick
    await new Promise(resolve => setTimeout(resolve, 1));
  }
  
  blockStateMap.clear();
}

// Block IDs for different colored blocks
export const BLANK_BLOCK_ID = 100;
export const RED_BLOCK_ID = 101;
export const BLUE_BLOCK_ID = 102;
export const blockIds = [BLANK_BLOCK_ID, RED_BLOCK_ID, BLUE_BLOCK_ID];

// Block data for registration
export const coloredBlockData = [
  { id: BLANK_BLOCK_ID, textureUri: 'blocks/colors/white_concrete.png', name: 'Blank Block' },
  { id: RED_BLOCK_ID, textureUri: 'blocks/colors/red_wool.png', name: 'Red Block' },
  { id: BLUE_BLOCK_ID, textureUri: 'blocks/colors/blue_wool.png', name: 'Blue Block' }
];
