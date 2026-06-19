import { useState, useCallback } from 'react';

export interface DOMNodeData {
  nodeId: number;
  nodeType: number;   // 1=element, 3=text, 8=comment, 9=document, 10=doctype
  nodeName: string;
  localName: string;
  attributes: string[] | null;
  childCount: number;
  nodeValue: string;
  children: DOMNodeData[] | null;
}

interface DOMTreeNodeProps {
  node: DOMNodeData;
  depth: number;
  onExpand: (nodeId: number) => Promise<DOMNodeData[]>;
  onHover: (nodeId: number) => void;
  onHoverEnd: () => void;
}

// Void elements that don't have closing tags.
const VOID_ELEMENTS = new Set([
  'area','base','br','col','embed','hr','img','input',
  'link','meta','param','source','track','wbr',
]);

export function DOMTreeNode({ node, depth, onExpand, onHover, onHoverEnd }: DOMTreeNodeProps) {
  const [expanded, setExpanded] = useState(depth < 2); // auto-expand first 2 levels
  const [children, setChildren] = useState<DOMNodeData[] | null>(node.children);
  const [loading, setLoading] = useState(false);

  const hasChildren = (children && children.length > 0) || node.childCount > 0;
  const isVoid = VOID_ELEMENTS.has(node.localName);

  const handleToggle = useCallback(async () => {
    if (!hasChildren) return;

    if (expanded) {
      setExpanded(false);
      return;
    }

    // Lazy load children if we don't have them yet
    if (!children || children.length === 0) {
      setLoading(true);
      try {
        const fetched = await onExpand(node.nodeId);
        setChildren(fetched);
      } catch (e) {
        console.error('Failed to expand node:', e);
      } finally {
        setLoading(false);
      }
    }

    setExpanded(true);
  }, [expanded, children, hasChildren, node.nodeId, onExpand]);

  const indent = depth * 16;

  // --- Document node (nodeType 9) — just render children ---
  if (node.nodeType === 9) {
    return (
      <>
        {(children || []).map((child) => (
          <DOMTreeNode
            key={child.nodeId}
            node={child}
            depth={depth}
            onExpand={onExpand}
            onHover={onHover}
            onHoverEnd={onHoverEnd}
          />
        ))}
      </>
    );
  }

  // --- Doctype node (nodeType 10) ---
  if (node.nodeType === 10) {
    return (
      <div
        className="flex items-center py-[2px] hover:bg-white/[0.03] transition-colors"
        style={{ paddingLeft: indent }}
      >
        <span className="text-white/25 text-[11px] font-mono">
          {'<!DOCTYPE html>'}
        </span>
      </div>
    );
  }

  // --- Text node (nodeType 3) ---
  if (node.nodeType === 3) {
    const text = (node.nodeValue || '').trim();
    if (!text) return null; // skip whitespace-only text nodes
    return (
      <div
        className="py-[2px] hover:bg-white/[0.03] transition-colors"
        style={{ paddingLeft: indent }}
        onMouseEnter={() => onHover(node.nodeId)}
        onMouseLeave={onHoverEnd}
      >
        <span className="text-[11px] font-mono text-white/50">
          {text.length > 80 ? text.slice(0, 80) + '…' : text}
        </span>
      </div>
    );
  }

  // --- Comment node (nodeType 8) ---
  if (node.nodeType === 8) {
    return (
      <div
        className="py-[2px] hover:bg-white/[0.03] transition-colors"
        style={{ paddingLeft: indent }}
      >
        <span className="text-[11px] font-mono text-white/20 italic">
          {'<!-- '}{(node.nodeValue || '').slice(0, 60)}{'-->'}
        </span>
      </div>
    );
  }

  // --- Element node (nodeType 1) ---
  if (node.nodeType !== 1) return null;

  const attrs = parseAttributes(node.attributes);
  const isSingleTextChild = children?.length === 1 && children[0].nodeType === 3;
  const inlineText = isSingleTextChild ? (children![0].nodeValue || '').trim() : null;

  return (
    <div>
      {/* Opening tag line */}
      <div
        className="flex items-center py-[2px] hover:bg-white/[0.03] group transition-colors cursor-default"
        style={{ paddingLeft: indent }}
        onMouseEnter={() => onHover(node.nodeId)}
        onMouseLeave={onHoverEnd}
      >
        {/* Expand arrow */}
        {hasChildren && !isVoid ? (
          <button
            onClick={handleToggle}
            className="w-4 h-4 flex items-center justify-center text-white/25
                       hover:text-white/50 transition-colors shrink-0 mr-0.5"
          >
            <svg
              className={`w-2.5 h-2.5 transition-transform duration-150 ${expanded ? 'rotate-90' : ''}`}
              fill="currentColor"
              viewBox="0 0 16 16"
            >
              <path d="M6 4l4 4-4 4" />
            </svg>
          </button>
        ) : (
          <span className="w-4 mr-0.5 shrink-0" />
        )}

        {/* Tag content */}
        <span className="text-[11px] font-mono leading-relaxed">
          <span className="text-white/25">{'<'}</span>
          <span className="text-[#E06C75]">{node.localName || node.nodeName.toLowerCase()}</span>
          {attrs.map((attr, i) => (
            <span key={i}>
              {' '}
              <span className="text-[#D19A66]">{attr.name}</span>
              {attr.value !== '' && (
                <>
                  <span className="text-white/25">=</span>
                  <span className="text-[#98C379]">"{truncateAttr(attr.value)}"</span>
                </>
              )}
            </span>
          ))}
          {isVoid ? (
            <span className="text-white/25">{' />'}</span>
          ) : inlineText ? (
            <>
              <span className="text-white/25">{'>'}</span>
              <span className="text-white/50">{inlineText.length > 60 ? inlineText.slice(0, 60) + '…' : inlineText}</span>
              <span className="text-white/25">{'</'}</span>
              <span className="text-[#E06C75]">{node.localName || node.nodeName.toLowerCase()}</span>
              <span className="text-white/25">{'>'}</span>
            </>
          ) : (
            <span className="text-white/25">{'>'}</span>
          )}
          {loading && <span className="text-white/20 ml-2">loading…</span>}
        </span>
      </div>

      {/* Children */}
      {expanded && !isVoid && !inlineText && children && children.length > 0 && (
        <>
          {children.map((child) => (
            <DOMTreeNode
              key={child.nodeId}
              node={child}
              depth={depth + 1}
              onExpand={onExpand}
              onHover={onHover}
              onHoverEnd={onHoverEnd}
            />
          ))}
          {/* Closing tag */}
          <div
            className="py-[2px] hover:bg-white/[0.03] transition-colors"
            style={{ paddingLeft: indent }}
            onMouseEnter={() => onHover(node.nodeId)}
            onMouseLeave={onHoverEnd}
          >
            <span className="text-[11px] font-mono">
              <span className="w-4 mr-0.5 inline-block shrink-0" />
              <span className="text-white/25">{'</'}</span>
              <span className="text-[#E06C75]">{node.localName || node.nodeName.toLowerCase()}</span>
              <span className="text-white/25">{'>'}</span>
            </span>
          </div>
        </>
      )}
    </div>
  );
}

// --- Helpers ---

interface Attr {
  name: string;
  value: string;
}

function parseAttributes(attrs: string[] | null): Attr[] {
  if (!attrs || attrs.length === 0) return [];
  const result: Attr[] = [];
  for (let i = 0; i < attrs.length; i += 2) {
    result.push({ name: attrs[i], value: attrs[i + 1] || '' });
  }
  return result;
}

function truncateAttr(value: string, max = 50): string {
  return value.length > max ? value.slice(0, max) + '…' : value;
}
