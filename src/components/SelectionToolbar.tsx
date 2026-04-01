"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { MessageSquarePlus } from "lucide-react";

interface SelectionToolbarProps {
  containerRef: React.RefObject<HTMLElement | null>;
  onComment: (selectedText: string, rect: DOMRect) => void;
}

export default function SelectionToolbar({
  containerRef,
  onComment,
}: SelectionToolbarProps) {
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const [selectedText, setSelectedText] = useState("");
  const [selectionRect, setSelectionRect] = useState<DOMRect | null>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);

  const handleSelectionChange = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.toString().trim()) {
      // Small delay to allow click events on the toolbar to fire before hiding
      setTimeout(() => {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || !sel.toString().trim()) {
          setPosition(null);
          setSelectedText("");
          setSelectionRect(null);
        }
      }, 200);
      return;
    }

    const container = containerRef.current;
    if (!container) return;

    // Check if selection is within our container
    const range = selection.getRangeAt(0);
    if (!container.contains(range.commonAncestorContainer)) {
      setPosition(null);
      return;
    }

    const text = selection.toString().trim();
    if (text.length < 2) return; // Ignore tiny selections

    const rect = range.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();

    // Position the toolbar above the selection, centered
    setPosition({
      top: rect.top - containerRect.top - 40,
      left: rect.left - containerRect.left + rect.width / 2 - 50,
    });
    setSelectedText(text);
    setSelectionRect(rect);
  }, [containerRef]);

  useEffect(() => {
    document.addEventListener("selectionchange", handleSelectionChange);
    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange);
    };
  }, [handleSelectionChange]);

  if (!position || !selectedText) return null;

  return (
    <div
      ref={toolbarRef}
      className="absolute z-30 animate-in fade-in"
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
      }}
    >
      <button
        onMouseDown={(e) => {
          e.preventDefault(); // Prevent losing selection
          e.stopPropagation();
          if (selectionRect) {
            onComment(selectedText, selectionRect);
          }
        }}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--accent)] text-white text-xs font-medium rounded-lg shadow-lg hover:bg-[var(--accent-hover)] transition-colors whitespace-nowrap"
      >
        <MessageSquarePlus size={13} />
        Comment
      </button>
      {/* Arrow */}
      <div
        className="w-2.5 h-2.5 bg-[var(--accent)] rotate-45 mx-auto -mt-1"
        style={{ marginLeft: "44px" }}
      />
    </div>
  );
}
