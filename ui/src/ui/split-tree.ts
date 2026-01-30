/**
 * Recursive binary tree representing a split-pane layout.
 *
 * A leaf is a visible pane showing a specific thread.
 * A branch splits the space into two children (horizontal or vertical).
 */

export type SplitDirection = 'horizontal' | 'vertical'

export interface SplitLeaf {
  kind: 'leaf'
  id: string
  threadId: string
}

export interface SplitBranch {
  kind: 'branch'
  id: string
  direction: SplitDirection
  ratio: number // 0.0-1.0, size of first child
  first: SplitNode
  second: SplitNode
}

export type SplitNode = SplitLeaf | SplitBranch

export interface SplitPaneLayout {
  root: SplitNode
  focusedPaneId: string
}

// ---------------------------------------------------------------------------
// Pure tree manipulation helpers
// ---------------------------------------------------------------------------

let nextId = 0
export function generatePaneId(): string {
  return `pane-${Date.now()}-${nextId++}`
}

export function createLeaf(threadId: string, id?: string): SplitLeaf {
  return { kind: 'leaf', id: id ?? generatePaneId(), threadId }
}

/** Split a leaf into a branch with the original leaf and a new pane. */
export function splitLeaf(
  root: SplitNode,
  targetPaneId: string,
  direction: SplitDirection,
  newThreadId: string,
): SplitNode {
  return mapNode(root, (node) => {
    if (node.kind !== 'leaf' || node.id !== targetPaneId) return node
    const newLeaf = createLeaf(newThreadId)
    return {
      kind: 'branch',
      id: generatePaneId(),
      direction,
      ratio: 0.5,
      first: node,
      second: newLeaf,
    } as SplitBranch
  })
}

/** Remove a leaf from the tree. Returns the pruned tree or null if the tree is now empty. */
export function removeLeaf(root: SplitNode, paneId: string): SplitNode | null {
  if (root.kind === 'leaf') {
    return root.id === paneId ? null : root
  }
  // If either child is the target leaf, return the other child
  if (root.first.kind === 'leaf' && root.first.id === paneId) return root.second
  if (root.second.kind === 'leaf' && root.second.id === paneId) return root.first

  // Recurse into branches
  const newFirst = removeLeaf(root.first, paneId)
  const newSecond = removeLeaf(root.second, paneId)

  if (newFirst === null) return newSecond
  if (newSecond === null) return newFirst

  if (newFirst === root.first && newSecond === root.second) return root
  return { ...root, first: newFirst, second: newSecond }
}

/** Find a leaf node by pane id. */
export function findLeaf(root: SplitNode, paneId: string): SplitLeaf | null {
  if (root.kind === 'leaf') return root.id === paneId ? root : null
  return findLeaf(root.first, paneId) ?? findLeaf(root.second, paneId)
}

/** Find the parent branch of a given pane id. */
export function findParent(root: SplitNode, paneId: string): SplitBranch | null {
  if (root.kind === 'leaf') return null
  const isFirst =
    (root.first.kind === 'leaf' && root.first.id === paneId) ||
    (root.first.kind === 'branch' && root.first.id === paneId)
  const isSecond =
    (root.second.kind === 'leaf' && root.second.id === paneId) ||
    (root.second.kind === 'branch' && root.second.id === paneId)
  if (isFirst || isSecond) return root
  return findParent(root.first, paneId) ?? findParent(root.second, paneId)
}

/** Collect all leaf pane IDs in tree order. */
export function allLeafIds(root: SplitNode): string[] {
  if (root.kind === 'leaf') return [root.id]
  return [...allLeafIds(root.first), ...allLeafIds(root.second)]
}

/** Collect all unique thread IDs referenced by visible panes. */
export function allThreadIds(root: SplitNode): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const leaf of allLeaves(root)) {
    if (!seen.has(leaf.threadId)) {
      seen.add(leaf.threadId)
      result.push(leaf.threadId)
    }
  }
  return result
}

/** Collect all leaf nodes. */
export function allLeaves(root: SplitNode): SplitLeaf[] {
  if (root.kind === 'leaf') return [root]
  return [...allLeaves(root.first), ...allLeaves(root.second)]
}

/** Update the ratio of a specific branch node. */
export function updateBranchRatio(
  root: SplitNode,
  branchId: string,
  ratio: number,
): SplitNode {
  return mapNode(root, (node) => {
    if (node.kind !== 'branch' || node.id !== branchId) return node
    return { ...node, ratio: Math.max(0.15, Math.min(0.85, ratio)) }
  })
}

/** Replace the threadId of a specific leaf. */
export function setLeafThread(
  root: SplitNode,
  paneId: string,
  threadId: string,
): SplitNode {
  return mapNode(root, (node) => {
    if (node.kind !== 'leaf' || node.id !== paneId) return node
    return { ...node, threadId }
  })
}

/** Get the next leaf ID after the given one (wraps around). */
export function nextLeafId(root: SplitNode, currentId: string): string | null {
  const ids = allLeafIds(root)
  if (ids.length <= 1) return null
  const idx = ids.indexOf(currentId)
  if (idx === -1) return ids[0]
  return ids[(idx + 1) % ids.length]
}

/** Get the previous leaf ID before the given one (wraps around). */
export function prevLeafId(root: SplitNode, currentId: string): string | null {
  const ids = allLeafIds(root)
  if (ids.length <= 1) return null
  const idx = ids.indexOf(currentId)
  if (idx === -1) return ids[ids.length - 1]
  return ids[(idx - 1 + ids.length) % ids.length]
}

// ---------------------------------------------------------------------------
// Serialization (for localStorage persistence)
// ---------------------------------------------------------------------------

type SerializedLeaf = { k: 'l'; id: string; t: string }
type SerializedBranch = {
  k: 'b'
  id: string
  d: 'h' | 'v'
  r: number
  f: SerializedNode
  s: SerializedNode
}
type SerializedNode = SerializedLeaf | SerializedBranch
type SerializedLayout = { root: SerializedNode; fp: string }

function serializeNode(node: SplitNode): SerializedNode {
  if (node.kind === 'leaf') {
    return { k: 'l', id: node.id, t: node.threadId }
  }
  return {
    k: 'b',
    id: node.id,
    d: node.direction === 'horizontal' ? 'h' : 'v',
    r: node.ratio,
    f: serializeNode(node.first),
    s: serializeNode(node.second),
  }
}

function deserializeNode(data: SerializedNode): SplitNode {
  if (data.k === 'l') {
    return { kind: 'leaf', id: data.id, threadId: data.t }
  }
  return {
    kind: 'branch',
    id: data.id,
    direction: data.d === 'h' ? 'horizontal' : 'vertical',
    ratio: data.r,
    first: deserializeNode(data.f),
    second: deserializeNode(data.s),
  }
}

export function serializeLayout(layout: SplitPaneLayout): string {
  const data: SerializedLayout = {
    root: serializeNode(layout.root),
    fp: layout.focusedPaneId,
  }
  return JSON.stringify(data)
}

export function deserializeLayout(json: string): SplitPaneLayout | null {
  try {
    const data = JSON.parse(json) as SerializedLayout
    if (!data || !data.root) return null
    const root = deserializeNode(data.root)
    const focusedPaneId = typeof data.fp === 'string' ? data.fp : allLeafIds(root)[0]
    return { root, focusedPaneId }
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Tree construction from flat pane lists
// ---------------------------------------------------------------------------

/** Build a balanced binary tree from a flat list of session keys. */
export function buildBalancedTree(sessionKeys: string[]): SplitNode {
  if (sessionKeys.length === 0) {
    return createLeaf('main')
  }
  if (sessionKeys.length === 1) {
    return createLeaf(sessionKeys[0])
  }
  const mid = Math.ceil(sessionKeys.length / 2)
  return {
    kind: 'branch',
    id: generatePaneId(),
    direction: 'horizontal',
    ratio: 0.5,
    first: buildBalancedTree(sessionKeys.slice(0, mid)),
    second: buildBalancedTree(sessionKeys.slice(mid)),
  }
}

/** Reconcile an existing tree with a desired set of pane session keys.
 *  If the tree's leaves match (same keys, same order), reuse it (preserves ratios).
 *  Otherwise, build a fresh balanced tree. */
export function reconcileTreeWithPanes(
  existingTree: SplitNode | null,
  paneSessionKeys: string[],
): SplitNode {
  if (!existingTree) return buildBalancedTree(paneSessionKeys)
  const existingKeys = allLeaves(existingTree).map((l) => l.threadId)
  if (arraysEqual(existingKeys, paneSessionKeys)) return existingTree
  return buildBalancedTree(paneSessionKeys)
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Map over every node in the tree, replacing nodes returned by the callback. */
function mapNode(node: SplitNode, fn: (n: SplitNode) => SplitNode): SplitNode {
  const replaced = fn(node)
  if (replaced !== node) return replaced
  if (node.kind === 'leaf') return node
  const newFirst = mapNode(node.first, fn)
  const newSecond = mapNode(node.second, fn)
  if (newFirst === node.first && newSecond === node.second) return node
  return { ...node, first: newFirst, second: newSecond }
}
