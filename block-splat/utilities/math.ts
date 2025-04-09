import type { Vector3Like } from "hytopia";

export const getDirectionFromRotation = (rotation: { x: number, y: number, z: number, w: number }): Vector3Like => {
    const angle = 2 * Math.atan2(rotation.y, rotation.w);
    return {
      x: Math.sin(angle) * -1,
      y: 0,
      z: Math.cos(angle) * -1,
    };
  }