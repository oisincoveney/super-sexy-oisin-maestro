/**
 * Layout algorithms for the Document Graph visualization.
 *
 * Provides two layout options:
 * - Force-directed: Uses d3-force for organic, physics-based node positioning
 * - Hierarchical: Uses dagre for tree-like, ranked layouts
 *
 * Both algorithms preserve node data and only update positions.
 */

import { Node, Edge } from 'reactflow';
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  forceX,
  forceY,
  SimulationNodeDatum,
  SimulationLinkDatum,
} from 'd3-force';
import dagre from '@dagrejs/dagre';
import type { GraphNodeData } from './graphDataBuilder';

/**
 * Layout configuration options
 */
export interface LayoutOptions {
  /** Node width for layout calculations */
  nodeWidth?: number;
  /** Node height for layout calculations */
  nodeHeight?: number;
  /** Direction for hierarchical layout: 'TB' (top-bottom) or 'LR' (left-right) */
  rankDirection?: 'TB' | 'LR';
  /** Separation between nodes (hierarchical) or base distance (force) */
  nodeSeparation?: number;
  /** Separation between ranks/levels (hierarchical only) */
  rankSeparation?: number;
  /** Center X position for the layout */
  centerX?: number;
  /** Center Y position for the layout */
  centerY?: number;
}

/**
 * Default layout options
 */
const DEFAULT_OPTIONS: Required<LayoutOptions> = {
  nodeWidth: 280,
  nodeHeight: 120,
  rankDirection: 'TB',
  nodeSeparation: 50,
  rankSeparation: 100,
  centerX: 0,
  centerY: 0,
};

/**
 * Extended node datum for d3-force simulation
 */
interface ForceNodeDatum extends SimulationNodeDatum {
  id: string;
  width: number;
  height: number;
  isExternal: boolean;
}

/**
 * Link datum for d3-force simulation
 */
interface ForceLinkDatum extends SimulationLinkDatum<ForceNodeDatum> {
  id: string;
  isExternal: boolean;
}

/**
 * Apply force-directed layout using d3-force.
 *
 * Creates an organic layout where nodes repel each other and edges act as springs.
 * This works well for visualizing document relationships without strict hierarchy.
 *
 * @param nodes - React Flow nodes to position
 * @param edges - React Flow edges defining relationships
 * @param options - Layout configuration options
 * @returns New array of nodes with updated positions
 */
export function applyForceLayout(
  nodes: Node<GraphNodeData>[],
  edges: Edge[],
  options: LayoutOptions = {}
): Node<GraphNodeData>[] {
  if (nodes.length === 0) return [];

  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Create simulation nodes
  const simNodes: ForceNodeDatum[] = nodes.map((node) => ({
    id: node.id,
    x: node.position.x || Math.random() * 500,
    y: node.position.y || Math.random() * 500,
    width: node.type === 'externalLinkNode' ? 160 : opts.nodeWidth,
    height: node.type === 'externalLinkNode' ? 60 : opts.nodeHeight,
    isExternal: node.type === 'externalLinkNode',
  }));

  // Create node lookup map
  const nodeMap = new Map(simNodes.map((n) => [n.id, n]));

  // Create simulation links (only for edges where both nodes exist)
  const simLinks: ForceLinkDatum[] = edges
    .filter((edge) => nodeMap.has(edge.source) && nodeMap.has(edge.target))
    .map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      isExternal: edge.type === 'external',
    }));

  // Calculate link distance based on node sizes
  const baseLinkDistance = opts.nodeSeparation + Math.max(opts.nodeWidth, opts.nodeHeight) / 2;

  // Create and run the force simulation
  const simulation = forceSimulation<ForceNodeDatum>(simNodes)
    .force(
      'link',
      forceLink<ForceNodeDatum, ForceLinkDatum>(simLinks)
        .id((d) => d.id)
        .distance((link) => {
          // External links can be longer
          return link.isExternal ? baseLinkDistance * 1.5 : baseLinkDistance;
        })
        .strength((link) => {
          // External links are weaker
          return link.isExternal ? 0.3 : 0.7;
        })
    )
    .force(
      'charge',
      forceManyBody<ForceNodeDatum>()
        .strength((d) => {
          // External nodes need stronger repulsion to prevent overlap
          return d.isExternal ? -300 : -400;
        })
        .distanceMax(600)
    )
    .force(
      'collide',
      forceCollide<ForceNodeDatum>()
        .radius((d) => {
          // External nodes need more collision space to prevent overlap
          const baseRadius = Math.max(d.width, d.height) / 2;
          return d.isExternal ? baseRadius + 40 : baseRadius + 20;
        })
        .strength(1.0)
        .iterations(3)
    )
    .force('center', forceCenter(opts.centerX, opts.centerY))
    .force(
      'x',
      forceX<ForceNodeDatum>(opts.centerX).strength(0.05)
    )
    .force(
      'y',
      forceY<ForceNodeDatum>(opts.centerY).strength(0.05)
    )
    .stop();

  // Run simulation synchronously for a set number of iterations
  const iterations = 300;
  simulation.tick(iterations);

  // Build result nodes with updated positions
  const positionMap = new Map(simNodes.map((n) => [n.id, { x: n.x ?? 0, y: n.y ?? 0 }]));

  return nodes.map((node) => {
    const pos = positionMap.get(node.id);
    return {
      ...node,
      position: pos ?? node.position,
    };
  });
}

/**
 * Apply hierarchical layout using dagre.
 *
 * Creates a tree-like layout with clear levels/ranks. Documents that link to
 * each other are arranged in a directed acyclic graph structure.
 *
 * @param nodes - React Flow nodes to position
 * @param edges - React Flow edges defining relationships
 * @param options - Layout configuration options
 * @returns New array of nodes with updated positions
 */
export function applyHierarchicalLayout(
  nodes: Node<GraphNodeData>[],
  edges: Edge[],
  options: LayoutOptions = {}
): Node<GraphNodeData>[] {
  if (nodes.length === 0) return [];

  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Create a new dagre graph
  const g = new dagre.graphlib.Graph();

  // Configure the graph
  g.setGraph({
    rankdir: opts.rankDirection,
    nodesep: opts.nodeSeparation,
    ranksep: opts.rankSeparation,
    marginx: 50,
    marginy: 50,
  });

  // Default edge label
  g.setDefaultEdgeLabel(() => ({}));

  // Add nodes to the graph
  for (const node of nodes) {
    const width = node.type === 'externalLinkNode' ? 160 : opts.nodeWidth;
    const height = node.type === 'externalLinkNode' ? 60 : opts.nodeHeight;

    g.setNode(node.id, {
      // Add padding to external nodes to prevent overlap in hierarchical layout
      width: node.type === 'externalLinkNode' ? width + 40 : width,
      height: node.type === 'externalLinkNode' ? height + 20 : height,
      label: node.id,
    });
  }

  // Add edges to the graph
  for (const edge of edges) {
    // Only add edge if both nodes exist
    if (g.hasNode(edge.source) && g.hasNode(edge.target)) {
      g.setEdge(edge.source, edge.target, {
        minlen: edge.type === 'external' ? 2 : 1,
      });
    }
  }

  // Run the layout algorithm
  dagre.layout(g);

  // Extract positions from dagre and update nodes
  return nodes.map((node) => {
    const dagreNode = g.node(node.id);
    if (!dagreNode) {
      return node;
    }

    // Dagre returns center positions, convert to top-left for React Flow
    const width = node.type === 'externalLinkNode' ? 160 : opts.nodeWidth;
    const height = node.type === 'externalLinkNode' ? 60 : opts.nodeHeight;

    return {
      ...node,
      position: {
        x: dagreNode.x - width / 2,
        y: dagreNode.y - height / 2,
      },
    };
  });
}

/**
 * Interpolate between two positions for smooth animation.
 *
 * @param start - Starting position
 * @param end - Ending position
 * @param t - Interpolation factor (0-1)
 * @returns Interpolated position
 */
export function interpolatePosition(
  start: { x: number; y: number },
  end: { x: number; y: number },
  t: number
): { x: number; y: number } {
  // Clamp t to [0, 1]
  const clampedT = Math.max(0, Math.min(1, t));

  // Use easing function for smoother animation (ease-out cubic)
  const easedT = 1 - Math.pow(1 - clampedT, 3);

  return {
    x: start.x + (end.x - start.x) * easedT,
    y: start.y + (end.y - start.y) * easedT,
  };
}

/**
 * Create intermediate frames for animating between layouts.
 *
 * @param startNodes - Nodes with starting positions
 * @param endNodes - Nodes with ending positions
 * @param frameCount - Number of intermediate frames
 * @returns Array of node arrays, one per frame
 */
export function createLayoutTransitionFrames(
  startNodes: Node<GraphNodeData>[],
  endNodes: Node<GraphNodeData>[],
  frameCount: number = 30
): Node<GraphNodeData>[][] {
  if (startNodes.length === 0 || endNodes.length === 0) return [endNodes];
  if (frameCount <= 1) return [endNodes];

  // Create position lookup for end positions
  const endPositions = new Map(endNodes.map((n) => [n.id, n.position]));

  const frames: Node<GraphNodeData>[][] = [];

  for (let i = 0; i <= frameCount; i++) {
    const t = i / frameCount;

    const frameNodes = startNodes.map((node) => {
      const endPos = endPositions.get(node.id);
      if (!endPos) return node;

      return {
        ...node,
        position: interpolatePosition(node.position, endPos, t),
      };
    });

    frames.push(frameNodes);
  }

  return frames;
}

/**
 * Store for persisting node positions during a session.
 * Positions are stored in memory and lost on page refresh.
 */
const positionStore = new Map<string, Map<string, { x: number; y: number }>>();

/**
 * Save node positions to the in-memory store.
 *
 * @param graphId - Unique identifier for the graph (e.g., rootPath)
 * @param nodes - Nodes with positions to save
 */
export function saveNodePositions(graphId: string, nodes: Node<GraphNodeData>[]): void {
  const positions = new Map<string, { x: number; y: number }>();

  for (const node of nodes) {
    positions.set(node.id, { ...node.position });
  }

  positionStore.set(graphId, positions);
}

/**
 * Restore saved node positions from the in-memory store.
 *
 * @param graphId - Unique identifier for the graph
 * @param nodes - Nodes to restore positions for
 * @returns Nodes with restored positions (unchanged if no saved positions)
 */
export function restoreNodePositions(
  graphId: string,
  nodes: Node<GraphNodeData>[]
): Node<GraphNodeData>[] {
  const savedPositions = positionStore.get(graphId);
  if (!savedPositions) return nodes;

  return nodes.map((node) => {
    const savedPos = savedPositions.get(node.id);
    if (!savedPos) return node;

    return {
      ...node,
      position: { ...savedPos },
    };
  });
}

/**
 * Clear saved positions for a graph.
 *
 * @param graphId - Unique identifier for the graph
 */
export function clearNodePositions(graphId: string): void {
  positionStore.delete(graphId);
}

/**
 * Check if a graph has saved positions.
 *
 * @param graphId - Unique identifier for the graph
 * @returns True if positions are saved for this graph
 */
export function hasSavedPositions(graphId: string): boolean {
  return positionStore.has(graphId);
}

/**
 * Animation state that can be attached to nodes for entry/exit animations.
 */
export interface NodeAnimationState {
  /** Current animation phase */
  animationPhase: 'entering' | 'stable' | 'exiting';
  /** Animation progress (0-1) */
  animationProgress: number;
  /** Original opacity before animation */
  originalOpacity?: number;
  /** Original scale before animation */
  originalScale?: number;
}

/**
 * Result of diffing two sets of nodes to detect additions and removals.
 */
export interface NodeDiff<T> {
  /** Nodes that exist in new set but not in old set */
  added: Node<T>[];
  /** Nodes that exist in old set but not in new set */
  removed: Node<T>[];
  /** Nodes that exist in both sets (potentially with updated data/position) */
  unchanged: Node<T>[];
  /** IDs of added nodes */
  addedIds: Set<string>;
  /** IDs of removed nodes */
  removedIds: Set<string>;
}

/**
 * Diff two sets of nodes to find additions, removals, and unchanged nodes.
 *
 * @param oldNodes - Previous set of nodes
 * @param newNodes - New set of nodes
 * @returns NodeDiff containing categorized nodes
 */
export function diffNodes<T>(
  oldNodes: Node<T>[],
  newNodes: Node<T>[]
): NodeDiff<T> {
  const oldIds = new Set(oldNodes.map((n) => n.id));
  const newIds = new Set(newNodes.map((n) => n.id));

  const addedIds = new Set<string>();
  const removedIds = new Set<string>();

  const added: Node<T>[] = [];
  const removed: Node<T>[] = [];
  const unchanged: Node<T>[] = [];

  // Find added nodes (in new but not in old)
  for (const node of newNodes) {
    if (!oldIds.has(node.id)) {
      added.push(node);
      addedIds.add(node.id);
    } else {
      unchanged.push(node);
    }
  }

  // Find removed nodes (in old but not in new)
  for (const node of oldNodes) {
    if (!newIds.has(node.id)) {
      removed.push(node);
      removedIds.add(node.id);
    }
  }

  return { added, removed, unchanged, addedIds, removedIds };
}

/**
 * Create animation frames for nodes entering the graph.
 * Nodes fade in and scale up from 0 to 1.
 *
 * @param nodes - Nodes to animate entering
 * @param frameCount - Number of animation frames
 * @returns Array of node arrays, one per frame with updated animation state
 */
export function createNodeEntryFrames<T>(
  nodes: Node<T>[],
  frameCount: number = 15
): Node<T & NodeAnimationState>[][] {
  if (nodes.length === 0) return [];
  if (frameCount <= 1) return [nodes.map((n) => ({ ...n, data: { ...n.data, animationPhase: 'stable' as const, animationProgress: 1 } }))];

  const frames: Node<T & NodeAnimationState>[][] = [];

  for (let i = 0; i <= frameCount; i++) {
    const progress = i / frameCount;
    // Use ease-out cubic for smooth entry
    const easedProgress = 1 - Math.pow(1 - progress, 3);

    const frameNodes = nodes.map((node) => ({
      ...node,
      data: {
        ...node.data,
        animationPhase: progress < 1 ? ('entering' as const) : ('stable' as const),
        animationProgress: easedProgress,
      },
      // Store animation state in node style for CSS-based animation
      style: {
        ...node.style,
        opacity: easedProgress,
        transform: `scale(${0.5 + easedProgress * 0.5})`,
        transition: 'none', // Disable CSS transitions during JS animation
      },
    }));

    frames.push(frameNodes);
  }

  return frames;
}

/**
 * Create animation frames for nodes exiting the graph.
 * Nodes fade out and scale down from 1 to 0.
 *
 * @param nodes - Nodes to animate exiting
 * @param frameCount - Number of animation frames
 * @returns Array of node arrays, one per frame with updated animation state
 */
export function createNodeExitFrames<T>(
  nodes: Node<T>[],
  frameCount: number = 10
): Node<T & NodeAnimationState>[][] {
  if (nodes.length === 0) return [];
  if (frameCount <= 1) return []; // Exit ends with nodes removed

  const frames: Node<T & NodeAnimationState>[][] = [];

  for (let i = 0; i <= frameCount; i++) {
    const progress = i / frameCount;
    // Use ease-in cubic for quick exit
    const easedProgress = Math.pow(progress, 2);
    const inverseProgress = 1 - easedProgress;

    const frameNodes = nodes.map((node) => ({
      ...node,
      data: {
        ...node.data,
        animationPhase: 'exiting' as const,
        animationProgress: easedProgress,
      },
      style: {
        ...node.style,
        opacity: inverseProgress,
        transform: `scale(${0.5 + inverseProgress * 0.5})`,
        transition: 'none',
      },
    }));

    frames.push(frameNodes);
  }

  return frames;
}

/**
 * Merge nodes from multiple sources, handling animation states.
 * Used to combine stable nodes with entering/exiting nodes during animation.
 *
 * @param stableNodes - Nodes that are not animating
 * @param animatingNodes - Nodes that are currently animating (entering or exiting)
 * @returns Combined array of all nodes
 */
export function mergeAnimatingNodes<T>(
  stableNodes: Node<T>[],
  animatingNodes: Node<T>[]
): Node<T>[] {
  // Create a map of animating nodes for quick lookup
  const animatingMap = new Map(animatingNodes.map((n) => [n.id, n]));

  // Replace stable nodes with their animating counterparts if they exist
  const merged = stableNodes.map((node) => {
    const animating = animatingMap.get(node.id);
    return animating ?? node;
  });

  // Add any animating nodes that aren't in stable nodes (e.g., exiting nodes)
  for (const node of animatingNodes) {
    if (!stableNodes.some((n) => n.id === node.id)) {
      merged.push(node);
    }
  }

  return merged;
}

/**
 * Calculate optimal positions for new nodes based on their connections.
 * New nodes are positioned near their connected neighbors.
 *
 * @param newNodes - New nodes to position
 * @param existingNodes - Existing nodes with known positions
 * @param edges - All edges including connections to new nodes
 * @param options - Layout options
 * @returns New nodes with initial positions near connected neighbors
 */
export function positionNewNodesNearNeighbors<T extends GraphNodeData>(
  newNodes: Node<T>[],
  existingNodes: Node<T>[],
  edges: Edge[],
  options: LayoutOptions = {}
): Node<T>[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const existingPositions = new Map(existingNodes.map((n) => [n.id, n.position]));

  return newNodes.map((node) => {
    // Find edges connected to this node
    const connectedEdges = edges.filter(
      (e) => e.source === node.id || e.target === node.id
    );

    // Find positions of connected existing nodes
    const neighborPositions: { x: number; y: number }[] = [];
    for (const edge of connectedEdges) {
      const neighborId = edge.source === node.id ? edge.target : edge.source;
      const neighborPos = existingPositions.get(neighborId);
      if (neighborPos) {
        neighborPositions.push(neighborPos);
      }
    }

    let initialPosition: { x: number; y: number };

    if (neighborPositions.length > 0) {
      // Calculate centroid of connected neighbors
      const avgX = neighborPositions.reduce((sum, p) => sum + p.x, 0) / neighborPositions.length;
      const avgY = neighborPositions.reduce((sum, p) => sum + p.y, 0) / neighborPositions.length;

      // Offset slightly to avoid exact overlap
      const offset = opts.nodeSeparation;
      const angle = Math.random() * Math.PI * 2;
      initialPosition = {
        x: avgX + Math.cos(angle) * offset,
        y: avgY + Math.sin(angle) * offset,
      };
    } else {
      // No connected neighbors, position at center with random offset
      const offset = opts.nodeSeparation * 2;
      initialPosition = {
        x: opts.centerX + (Math.random() - 0.5) * offset,
        y: opts.centerY + (Math.random() - 0.5) * offset,
      };
    }

    return {
      ...node,
      position: initialPosition,
    };
  });
}
