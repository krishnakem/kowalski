/**
 * PostIdentifier — Tree-based post fingerprinting for deduplication.
 *
 * Extracts owner (username) and caption snippet from the accessibility tree
 * to produce a deterministic fingerprint string for Set-based dedup.
 *
 * Returns null when no usable article is found (stories, explore grids, etc.)
 * — callers fall through to perceptual hash dedup in that case.
 */

import { AXTree, AXTreeNode } from '../types/instagram.js';

export interface PostFingerprint {
    owner: string;          // username from article's first link
    captionSnippet: string; // first 40 chars of caption text
    hash: string;           // "owner|captionSnippet" for Set-based dedup
}

/**
 * Extract a post fingerprint from the current accessibility tree.
 *
 * Algorithm:
 * 1. Find the primary article (prefer article inside dialog for modals)
 * 2. Walk its children to find: username link, caption text
 * 3. Build a deterministic hash string
 */
export function getPostFingerprint(tree: AXTree): PostFingerprint | null {
    const articleNode = findPrimaryArticle(tree);

    let descendants: AXTreeNode[];
    if (articleNode) {
        descendants = collectDescendants(tree, articleNode);
    } else {
        // Fallback: scan all nodes (standalone post detail pages may lack article role,
        // or have multiple articles from "More posts from X" section)
        descendants = Array.from(tree.nodeMap.values());
        console.log(`[FINGERPRINT] No primary article found, scanning all ${descendants.length} nodes`);
    }

    const owner = extractOwner(descendants);
    const captionSnippet = extractCaptionSnippet(descendants);

    // Need at least the owner to produce a useful fingerprint
    if (!owner) {
        console.log(`[FINGERPRINT] Could not find owner in tree (${descendants.length} nodes scanned)`);
        return null;
    }

    const hash = `${owner}|${captionSnippet}`;
    console.log(`[FINGERPRINT] ${hash}`);
    return { owner, captionSnippet, hash };
}

/**
 * Find the primary article node to fingerprint.
 * Prefers an article inside a dialog (modal post) over articles in the feed.
 * For standalone post pages, finds the single article with engagement buttons.
 */
function findPrimaryArticle(tree: AXTree): AXTreeNode | null {
    let dialogNode: AXTreeNode | null = null;
    const articles: AXTreeNode[] = [];

    for (const node of tree.nodeMap.values()) {
        const role = node.role?.value;
        if (role === 'dialog') {
            dialogNode = node;
        }
        if (role === 'article') {
            articles.push(node);
        }
    }

    console.log(`[FINGERPRINT] findPrimaryArticle: articles=${articles.length}, dialog=${!!dialogNode}`);

    // If dialog exists, find article inside it
    if (dialogNode) {
        for (const article of articles) {
            if (isDescendantOf(tree, article.nodeId, dialogNode.nodeId)) {
                return article;
            }
        }
    }

    // Single article with engagement buttons = standalone post detail
    if (articles.length === 1) {
        return articles[0];
    }

    // Multiple articles = feed. Find the first one (topmost) as a fallback,
    // but this is less reliable since the "current" post depends on scroll position.
    // Return null — callers should use perceptual hash dedup for feed captures.
    if (articles.length > 1) {
        return null;
    }

    return null;
}

/**
 * Check if a node is a descendant of an ancestor by walking parent links.
 */
function isDescendantOf(tree: AXTree, childNodeId: string, ancestorNodeId: string): boolean {
    let current = tree.nodeMap.get(childNodeId);
    while (current?.parentId) {
        if (current.parentId === ancestorNodeId) return true;
        current = tree.nodeMap.get(current.parentId);
    }
    return false;
}

/**
 * Collect all descendant nodes of a given parent (BFS).
 */
function collectDescendants(tree: AXTree, parent: AXTreeNode): AXTreeNode[] {
    const result: AXTreeNode[] = [];
    const queue: string[] = [...(parent.childIds || [])];

    while (queue.length > 0) {
        const nodeId = queue.shift()!;
        const node = tree.nodeMap.get(nodeId);
        if (!node) continue;
        result.push(node);
        if (node.childIds) {
            queue.push(...node.childIds);
        }
    }

    return result;
}

/**
 * Extract the post owner (username) from article descendants.
 *
 * Instagram article structure has a username link early in the tree,
 * typically: link "username" or link "username Verified".
 * We take the first link that looks like a username (no spaces except "Verified",
 * not a timestamp pattern like "1h", "16h", "2d").
 */
function extractOwner(descendants: AXTreeNode[]): string {
    const timestampPattern = /^\d+[smhdw]$/;

    for (const node of descendants) {
        if (node.role?.value !== 'link') continue;
        const name = node.name?.value?.trim();
        if (!name) continue;

        // Skip timestamp links (e.g., "16h", "2d", "1w")
        if (timestampPattern.test(name)) continue;

        // Skip generic/utility links
        if (name === 'Instagram' || name === 'Close' || name === 'More') continue;

        // Username links: "username" or "username Verified"
        // They don't contain numbers-only patterns and are relatively short
        const cleaned = name.replace(/\s*Verified\s*$/, '').trim();
        if (cleaned.length > 0 && cleaned.length <= 50 && !cleaned.includes('View all')) {
            return cleaned;
        }
    }

    return '';
}

/**
 * Extract a caption snippet from article descendants.
 *
 * The caption is typically a StaticText node that's longer than short UI labels.
 * We skip buttons, links, and very short texts that are likely UI chrome.
 */
function extractCaptionSnippet(descendants: AXTreeNode[]): string {
    for (const node of descendants) {
        const role = node.role?.value;
        // Caption appears as StaticText or in a generic container
        if (role !== 'StaticText' && role !== 'text') continue;

        const text = node.name?.value?.trim();
        if (!text || text.length < 10) continue;

        // Skip engagement count patterns (e.g., "1,234 likes", "View all 42 comments")
        if (/^\d[\d,.]*\s*(likes?|comments?)$/i.test(text)) continue;
        if (/^View all \d/i.test(text)) continue;

        // This looks like caption text — take first 40 chars
        return text.slice(0, 40);
    }

    return '';
}
