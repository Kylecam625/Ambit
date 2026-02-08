"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyle } from "@tiptap/extension-text-style";
import { useCallback, useEffect, useRef, useState } from "react";
import { JournalToolbar } from "./journal_toolbar";

// Custom FontSize extension via TextStyle
const FontSize = TextStyle.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      fontSize: {
        default: null,
        parseHTML: (element: HTMLElement) => element.style.fontSize || null,
        renderHTML: (attributes: Record<string, string | null>) => {
          if (!attributes.fontSize) return {};
          return { style: `font-size: ${attributes.fontSize}` };
        },
      },
    };
  },
});

type JournalEditorProps = {
  initial_html: string;
  on_save: (html: string, text: string) => void;
  is_saving: boolean;
  save_status: "idle" | "saving" | "saved" | "error";
};

export const JournalEditor = ({
  initial_html,
  on_save,
  is_saving,
  save_status,
}: JournalEditorProps) => {
  const [has_unsaved_changes, set_has_unsaved_changes] = useState(false);
  const auto_save_timer_ref = useRef<ReturnType<typeof setTimeout> | null>(null);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      Underline,
      TextAlign.configure({
        types: ["heading", "paragraph"],
      }),
      FontSize,
    ],
    content: initial_html,
    editorProps: {
      attributes: {
        class:
          "journal-editor-content prose prose-invert prose-amber max-w-none min-h-[400px] px-6 py-5 outline-none focus:outline-none",
      },
    },
    onUpdate: () => {
      set_has_unsaved_changes(true);
    },
  });

  // Update content when initial_html changes (e.g. after generation)
  useEffect(() => {
    if (editor && initial_html && !editor.isDestroyed) {
      const current = editor.getHTML();
      if (current !== initial_html) {
        editor.commands.setContent(initial_html);
        set_has_unsaved_changes(true);
      }
    }
  }, [initial_html, editor]);

  // Auto-save every 30 seconds when there are unsaved changes
  useEffect(() => {
    if (!has_unsaved_changes || !editor) return;

    if (auto_save_timer_ref.current) clearTimeout(auto_save_timer_ref.current);
    auto_save_timer_ref.current = setTimeout(() => {
      const html = editor.getHTML();
      const text = editor.getText();
      on_save(html, text);
      set_has_unsaved_changes(false);
    }, 30_000);

    return () => {
      if (auto_save_timer_ref.current) clearTimeout(auto_save_timer_ref.current);
    };
  }, [has_unsaved_changes, editor, on_save]);

  const handle_manual_save = useCallback(() => {
    if (!editor) return;
    const html = editor.getHTML();
    const text = editor.getText();
    on_save(html, text);
    set_has_unsaved_changes(false);
    if (auto_save_timer_ref.current) clearTimeout(auto_save_timer_ref.current);
  }, [editor, on_save]);

  const status_label = (() => {
    if (is_saving || save_status === "saving") return "Saving...";
    if (save_status === "saved" && !has_unsaved_changes) return "Saved";
    if (save_status === "error") return "Save failed";
    if (has_unsaved_changes) return "Unsaved changes";
    return "Saved";
  })();

  const status_color = (() => {
    if (save_status === "error") return "text-red-400";
    if (has_unsaved_changes) return "text-amber-400/70";
    return "text-emerald-400/70";
  })();

  return (
    <div className="flex flex-col rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm overflow-hidden">
      {/* Toolbar */}
      <JournalToolbar editor={editor} />

      {/* Editor content area */}
      <div className="flex-1 overflow-y-auto max-h-[60vh]">
        <EditorContent editor={editor} />
      </div>

      {/* Footer: save status + save button */}
      <div className="flex items-center justify-between border-t border-white/10 px-4 py-2.5 bg-white/[0.02]">
        <span className={`text-xs font-medium ${status_color} transition-colors`}>
          {status_label}
        </span>
        <button
          type="button"
          onClick={handle_manual_save}
          disabled={is_saving || (!has_unsaved_changes && save_status === "saved")}
          className="rounded-lg bg-amber-500/20 px-4 py-1.5 text-sm font-semibold text-amber-200 transition-all hover:bg-amber-500/30 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        >
          {is_saving ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
};
