"use client";

import type { Editor } from "@tiptap/react";
import { useCallback } from "react";

const FONT_SIZES = ["14", "16", "18", "20", "24"];

const ToolbarButton = ({
  is_active = false,
  on_click,
  title,
  children,
  className = "",
}: {
  is_active?: boolean;
  on_click: () => void;
  title: string;
  children: React.ReactNode;
  className?: string;
}) => (
  <button
    type="button"
    onClick={on_click}
    title={title}
    className={`
      flex h-8 min-w-8 items-center justify-center rounded-md px-1.5
      text-sm font-medium transition-all duration-150 cursor-pointer
      ${is_active
        ? "bg-amber-500/30 text-amber-200 shadow-inner"
        : "text-zinc-400 hover:bg-white/10 hover:text-zinc-200"
      }
      ${className}
    `}
  >
    {children}
  </button>
);

const Divider = () => (
  <div className="mx-1 h-5 w-px bg-white/10" />
);

export const JournalToolbar = ({
  editor,
  on_generate_movie,
  has_entry = false,
}: {
  editor: Editor | null;
  on_generate_movie?: () => void;
  has_entry?: boolean;
}) => {
  if (!editor) return null;

  const set_font_size = useCallback(
    (size: string) => {
      editor.chain().focus().setMark("textStyle", { fontSize: `${size}px` }).run();
    },
    [editor]
  );

  return (
    <div className="flex flex-wrap items-center gap-0.5 rounded-t-xl border-b border-white/10 bg-white/5 px-3 py-2">
      {/* Text style */}
      <ToolbarButton
        is_active={editor.isActive("bold")}
        on_click={() => editor.chain().focus().toggleBold().run()}
        title="Bold"
      >
        <span className="font-bold">B</span>
      </ToolbarButton>
      <ToolbarButton
        is_active={editor.isActive("italic")}
        on_click={() => editor.chain().focus().toggleItalic().run()}
        title="Italic"
      >
        <span className="italic">I</span>
      </ToolbarButton>
      <ToolbarButton
        is_active={editor.isActive("underline")}
        on_click={() => editor.chain().focus().toggleUnderline().run()}
        title="Underline"
      >
        <span className="underline">U</span>
      </ToolbarButton>
      <ToolbarButton
        is_active={editor.isActive("strike")}
        on_click={() => editor.chain().focus().toggleStrike().run()}
        title="Strikethrough"
      >
        <span className="line-through">S</span>
      </ToolbarButton>

      <Divider />

      {/* Headings */}
      <ToolbarButton
        is_active={editor.isActive("heading", { level: 2 })}
        on_click={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        title="Heading 1"
      >
        H1
      </ToolbarButton>
      <ToolbarButton
        is_active={editor.isActive("heading", { level: 3 })}
        on_click={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        title="Heading 2"
      >
        H2
      </ToolbarButton>

      <Divider />

      {/* Font size */}
      <select
        onChange={(e) => set_font_size(e.target.value)}
        title="Font Size"
        className="h-8 rounded-md bg-white/5 px-2 text-sm text-zinc-300 outline-none hover:bg-white/10 cursor-pointer border border-white/10"
        defaultValue="16"
      >
        {FONT_SIZES.map((size) => (
          <option key={size} value={size} className="bg-zinc-900">
            {size}px
          </option>
        ))}
      </select>

      <Divider />

      {/* Alignment */}
      <ToolbarButton
        is_active={editor.isActive({ textAlign: "left" })}
        on_click={() => editor.chain().focus().setTextAlign("left").run()}
        title="Align Left"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><rect x="2" y="3" width="12" height="1.5" rx="0.5" /><rect x="2" y="7" width="8" height="1.5" rx="0.5" /><rect x="2" y="11" width="10" height="1.5" rx="0.5" /></svg>
      </ToolbarButton>
      <ToolbarButton
        is_active={editor.isActive({ textAlign: "center" })}
        on_click={() => editor.chain().focus().setTextAlign("center").run()}
        title="Align Center"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><rect x="2" y="3" width="12" height="1.5" rx="0.5" /><rect x="4" y="7" width="8" height="1.5" rx="0.5" /><rect x="3" y="11" width="10" height="1.5" rx="0.5" /></svg>
      </ToolbarButton>
      <ToolbarButton
        is_active={editor.isActive({ textAlign: "right" })}
        on_click={() => editor.chain().focus().setTextAlign("right").run()}
        title="Align Right"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><rect x="2" y="3" width="12" height="1.5" rx="0.5" /><rect x="6" y="7" width="8" height="1.5" rx="0.5" /><rect x="4" y="11" width="10" height="1.5" rx="0.5" /></svg>
      </ToolbarButton>

      <Divider />

      {/* Blockquote */}
      <ToolbarButton
        is_active={editor.isActive("blockquote")}
        on_click={() => editor.chain().focus().toggleBlockquote().run()}
        title="Blockquote"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M3 4h4v4H5l-1 3H3V4zm6 0h4v4h-2l-1 3H9V4z" /></svg>
      </ToolbarButton>

      {/* Lists */}
      <ToolbarButton
        is_active={editor.isActive("bulletList")}
        on_click={() => editor.chain().focus().toggleBulletList().run()}
        title="Bullet List"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><circle cx="3.5" cy="4" r="1.2" /><rect x="6" y="3.2" width="8" height="1.5" rx="0.5" /><circle cx="3.5" cy="8" r="1.2" /><rect x="6" y="7.2" width="8" height="1.5" rx="0.5" /><circle cx="3.5" cy="12" r="1.2" /><rect x="6" y="11.2" width="8" height="1.5" rx="0.5" /></svg>
      </ToolbarButton>
      <ToolbarButton
        is_active={editor.isActive("orderedList")}
        on_click={() => editor.chain().focus().toggleOrderedList().run()}
        title="Ordered List"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><text x="2" y="5" fontSize="5" fontWeight="bold">1</text><rect x="6" y="3.2" width="8" height="1.5" rx="0.5" /><text x="2" y="9" fontSize="5" fontWeight="bold">2</text><rect x="6" y="7.2" width="8" height="1.5" rx="0.5" /><text x="2" y="13" fontSize="5" fontWeight="bold">3</text><rect x="6" y="11.2" width="8" height="1.5" rx="0.5" /></svg>
      </ToolbarButton>

      <Divider />

      {/* Undo / Redo */}
      <ToolbarButton
        on_click={() => editor.chain().focus().undo().run()}
        title="Undo"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M4 7l3-3v2h4a3 3 0 0 1 0 6H8v-1.5h3a1.5 1.5 0 0 0 0-3H7v2L4 7z" /></svg>
      </ToolbarButton>
      <ToolbarButton
        on_click={() => editor.chain().focus().redo().run()}
        title="Redo"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M12 7l-3-3v2H5a3 3 0 0 0 0 6h3v-1.5H5a1.5 1.5 0 0 1 0-3h4v2l3-3z" /></svg>
      </ToolbarButton>

      {has_entry && on_generate_movie && (
        <>
          <Divider />
          <ToolbarButton
            on_click={on_generate_movie}
            title="Generate Movie"
            className="text-amber-400 hover:text-amber-300 hover:bg-amber-500/15"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" />
              <line x1="7" y1="2" x2="7" y2="22" />
              <line x1="17" y1="2" x2="17" y2="22" />
              <line x1="2" y1="12" x2="22" y2="12" />
              <line x1="2" y1="7" x2="7" y2="7" />
              <line x1="2" y1="17" x2="7" y2="17" />
              <line x1="17" y1="7" x2="22" y2="7" />
              <line x1="17" y1="17" x2="22" y2="17" />
            </svg>
            <span className="ml-1 text-xs">Movie</span>
          </ToolbarButton>
        </>
      )}
    </div>
  );
};
