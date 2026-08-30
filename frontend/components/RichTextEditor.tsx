"use client";

import { forwardRef, useImperativeHandle, useRef } from "react";
import {
  Undo2,
  Redo2,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  AlignLeft,
  List,
  ListOrdered,
  IndentIncrease,
  IndentDecrease,
  Quote,
  Highlighter,
  Link2,
} from "lucide-react";

export interface RichTextEditorHandle {
  getHtml: () => string;
  getText: () => string;
  clear: () => void;
  isEmpty: () => boolean;
}

const alignCycle = ["justifyLeft", "justifyCenter", "justifyRight"] as const;

const RichTextEditor = forwardRef<RichTextEditorHandle, { placeholder?: string }>(function RichTextEditor(
  { placeholder = "Type Your Reply..." },
  ref
) {
  const editorRef = useRef<HTMLDivElement>(null);
  const alignIndex = useRef(0);

  useImperativeHandle(ref, () => ({
    getHtml: () => editorRef.current?.innerHTML.trim() || "",
    getText: () => editorRef.current?.innerText.trim() || "",
    clear: () => {
      if (editorRef.current) editorRef.current.innerHTML = "";
    },
    isEmpty: () => !editorRef.current?.innerText.trim(),
  }));

  function exec(command: string, value?: string) {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
  }

  function cycleAlign() {
    alignIndex.current = (alignIndex.current + 1) % alignCycle.length;
    exec(alignCycle[alignIndex.current]);
  }

  function insertLink() {
    const url = window.prompt("Link URL");
    if (url) exec("createLink", url);
  }

  const buttons: { icon: React.ReactNode; title: string; onClick: () => void }[] = [
    { icon: <Undo2 size={15} />, title: "Undo", onClick: () => exec("undo") },
    { icon: <Redo2 size={15} />, title: "Redo", onClick: () => exec("redo") },
    { icon: <Bold size={15} />, title: "Bold", onClick: () => exec("bold") },
    { icon: <Italic size={15} />, title: "Italic", onClick: () => exec("italic") },
    { icon: <Underline size={15} />, title: "Underline", onClick: () => exec("underline") },
    { icon: <Strikethrough size={15} />, title: "Strikethrough", onClick: () => exec("strikeThrough") },
    { icon: <AlignLeft size={15} />, title: "Align", onClick: cycleAlign },
    { icon: <ListOrdered size={15} />, title: "Numbered list", onClick: () => exec("insertOrderedList") },
    { icon: <List size={15} />, title: "Bullet list", onClick: () => exec("insertUnorderedList") },
    { icon: <IndentIncrease size={15} />, title: "Indent", onClick: () => exec("indent") },
    { icon: <IndentDecrease size={15} />, title: "Outdent", onClick: () => exec("outdent") },
    { icon: <Quote size={15} />, title: "Quote", onClick: () => exec("formatBlock", "blockquote") },
    { icon: <Highlighter size={15} />, title: "Highlight", onClick: () => exec("hiliteColor", "#fef9c3") },
    { icon: <Link2 size={15} />, title: "Link", onClick: insertLink },
  ];

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50">
      <div className="flex flex-wrap items-center gap-0.5 rounded-t-xl border-b border-slate-200/70 bg-white px-2 py-1.5">
        {buttons.map((b, i) => (
          <button
            key={i}
            type="button"
            title={b.title}
            onMouseDown={(e) => e.preventDefault()} // keep selection/focus in the editor
            onClick={b.onClick}
            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
          >
            {b.icon}
          </button>
        ))}
      </div>
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder}
        className="min-h-[180px] max-h-[360px] overflow-y-auto px-4 py-3 text-sm text-slate-800 outline-none empty:before:pointer-events-none empty:before:text-slate-400 empty:before:content-[attr(data-placeholder)]"
      />
    </div>
  );
});

export default RichTextEditor;
