/**
 * Stable, lazy access to the singleton MeshNode.
 */
import {useEffect, useState} from 'react';
import {bootstrapMesh, maybeMesh} from '../core/mesh/bootstrap';
import type {MeshNode} from '../core/mesh/meshNode';

export function useMesh(): MeshNode | null {
  const [node, setNode] = useState<MeshNode | null>(maybeMesh());
  useEffect(() => {
    if (node) return;
    let cancelled = false;
    bootstrapMesh().then(n => {
      if (!cancelled) setNode(n);
    });
    return () => {
      cancelled = true;
    };
  }, [node]);
  return node;
}
