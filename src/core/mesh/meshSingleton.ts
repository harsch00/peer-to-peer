/**
 * Global mesh node handle — avoids circular imports (e.g. profileStore ↔ bootstrap).
 */
import type {MeshNode} from './meshNode';

let node: MeshNode | null = null;

export function setMeshNode(n: MeshNode | null): void {
  node = n;
}

export function maybeMesh(): MeshNode | null {
  return node;
}

export function getMesh(): MeshNode {
  if (!node) {
    throw new Error('mesh not bootstrapped');
  }
  return node;
}
