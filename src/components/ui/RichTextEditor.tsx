import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import FontFamily from "@tiptap/extension-font-family";
import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  List,
  ListOrdered,
  Undo,
  Redo,
  Palette,
  Type,
  ChevronDown,
} from "lucide-react";
import DOMPurify from "dompurify";
import { cn } from "@/lib/utils";

function ToolbarButton({
  onClick,
  isActive,
  disabled,
  children,
  title,
}: {
  onClick: () => void;
  isActive?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "p-1.5 rounded transition-colors",
        isActive
          ? "bg-primary-100 dark:bg-primary-900/50 text-primary-700 dark:text-primary-300"
          : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-200",
        disabled && "opacity-50 cursor-not-allowed"
      )}
    >
      {children}
    </button>
  );
}

interface RichTextEditorProps {
  content: string;
  onChange: (html: string, text: string) => void;
  placeholder?: string;
  className?: string;
  minHeight?: string;
}

const COLOR_KEYS = [
  { key: "black", value: "#000000" },
  { key: "darkGray", value: "#4B5563" },
  { key: "gray", value: "#9CA3AF" },
  { key: "red", value: "#DC2626" },
  { key: "orange", value: "#EA580C" },
  { key: "yellow", value: "#CA8A04" },
  { key: "green", value: "#16A34A" },
  { key: "blue", value: "#2563EB" },
  { key: "purple", value: "#7C3AED" },
  { key: "pink", value: "#DB2777" },
];

const FONT_OPTIONS = [
  { key: "defaultFont", value: "" },
  { name: "Arial", value: "Arial, sans-serif" },
  { name: "Times New Roman", value: "Times New Roman, serif" },
  { name: "Georgia", value: "Georgia, serif" },
  { name: "Courier New", value: "Courier New, monospace" },
  { name: "Verdana", value: "Verdana, sans-serif" },
  { name: "Trebuchet MS", value: "Trebuchet MS, sans-serif" },
  { name: "Comic Sans MS", value: "Comic Sans MS, cursive" },
];

export function RichTextEditor({
  content,
  onChange,
  placeholder,
  className,
  minHeight = "100px",
}: RichTextEditorProps) {
  const { t } = useTranslation("common");

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Underline,
      TextStyle,
      Color,
      FontFamily,
    ],
    content,
    editorProps: {
      attributes: {
        class: cn(
          "prose prose-sm dark:prose-invert max-w-none focus:outline-none p-3",
          "min-h-[inherit]"
        ),
      },
    },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      const text = editor.getText();
      onChange(html, text);
    },
  });

  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showFontPicker, setShowFontPicker] = useState(false);
  const colorPickerRef = useRef<HTMLDivElement>(null);
  const fontPickerRef = useRef<HTMLDivElement>(null);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (colorPickerRef.current && !colorPickerRef.current.contains(event.target as Node)) {
        setShowColorPicker(false);
      }
      if (fontPickerRef.current && !fontPickerRef.current.contains(event.target as Node)) {
        setShowFontPicker(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (!editor) {
    return null;
  }

  const currentColor = editor.getAttributes("textStyle").color || "#000000";
  const currentFont = editor.getAttributes("textStyle").fontFamily || "";

  return (
    <div
      className={cn(
        "border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-900",
        className
      )}
    >
      <div className="flex items-center gap-1 px-2 py-1 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          isActive={editor.isActive("bold")}
          title={t("editor.bold")}
        >
          <Bold className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          isActive={editor.isActive("italic")}
          title={t("editor.italic")}
        >
          <Italic className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          isActive={editor.isActive("underline")}
          title={t("editor.underline")}
        >
          <UnderlineIcon className="h-4 w-4" />
        </ToolbarButton>
        <div className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-1" />
        {/* Color Picker */}
        <div className="relative" ref={colorPickerRef}>
          <button
            type="button"
            onClick={() => {
              setShowColorPicker(!showColorPicker);
              setShowFontPicker(false);
            }}
            title={t("editor.textColor")}
            className={cn(
              "flex items-center gap-0.5 p-1.5 rounded transition-colors",
              showColorPicker
                ? "bg-primary-100 dark:bg-primary-900/50 text-primary-700 dark:text-primary-300"
                : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-200"
            )}
          >
            <Palette className="h-4 w-4" />
            <div
              className="w-3 h-3 rounded-sm border border-gray-300 dark:border-gray-600"
              style={{ backgroundColor: currentColor }}
            />
            <ChevronDown className="h-3 w-3" />
          </button>
          {showColorPicker && (
            <div className="absolute top-full left-0 mt-1 p-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50">
              <div className="grid grid-cols-5 gap-1">
                {COLOR_KEYS.map((color) => (
                  <button
                    key={color.value}
                    type="button"
                    title={t(`editor.colors.${color.key}`)}
                    onClick={() => {
                      editor.chain().focus().setColor(color.value).run();
                      setShowColorPicker(false);
                    }}
                    className={cn(
                      "w-6 h-6 rounded border-2 transition-transform hover:scale-110",
                      currentColor === color.value
                        ? "border-primary-500"
                        : "border-gray-200 dark:border-gray-600"
                    )}
                    style={{ backgroundColor: color.value }}
                  />
                ))}
              </div>
              <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => {
                    editor.chain().focus().unsetColor().run();
                    setShowColorPicker(false);
                  }}
                  className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                >
                  {t("editor.reset")}
                </button>
              </div>
            </div>
          )}
        </div>
        {/* Font Picker */}
        <div className="relative" ref={fontPickerRef}>
          <button
            type="button"
            onClick={() => {
              setShowFontPicker(!showFontPicker);
              setShowColorPicker(false);
            }}
            title={t("editor.font")}
            className={cn(
              "flex items-center gap-0.5 p-1.5 rounded transition-colors",
              showFontPicker
                ? "bg-primary-100 dark:bg-primary-900/50 text-primary-700 dark:text-primary-300"
                : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-200"
            )}
          >
            <Type className="h-4 w-4" />
            <ChevronDown className="h-3 w-3" />
          </button>
          {showFontPicker && (
            <div className="absolute top-full left-0 mt-1 py-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50 min-w-40">
              {FONT_OPTIONS.map((font) => (
                <button
                  key={font.key || font.name}
                  type="button"
                  onClick={() => {
                    if (font.value) {
                      editor.chain().focus().setFontFamily(font.value).run();
                    } else {
                      editor.chain().focus().unsetFontFamily().run();
                    }
                    setShowFontPicker(false);
                  }}
                  className={cn(
                    "w-full px-3 py-1.5 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-900 dark:text-gray-100",
                    currentFont === font.value && "bg-primary-50 dark:bg-primary-900/50 text-primary-700 dark:text-primary-300"
                  )}
                  style={{ fontFamily: font.value || "inherit" }}
                >
                  {font.key ? t(`editor.${font.key}`) : font.name}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-1" />
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          isActive={editor.isActive("bulletList")}
          title={t("editor.bulletList")}
        >
          <List className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          isActive={editor.isActive("orderedList")}
          title={t("editor.orderedList")}
        >
          <ListOrdered className="h-4 w-4" />
        </ToolbarButton>
        <div className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-1" />
        <ToolbarButton
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          title={t("editor.undo")}
        >
          <Undo className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          title={t("editor.redo")}
        >
          <Redo className="h-4 w-4" />
        </ToolbarButton>
      </div>
      <div style={{ minHeight }}>
        <EditorContent
          editor={editor}
          placeholder={placeholder || t("editor.placeholder")}
        />
      </div>
    </div>
  );
}

// Allowed CSS properties for rich text (whitelist approach for security)
const ALLOWED_CSS_PROPERTIES = new Set([
  "color",
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "text-decoration",
  "text-align",
  "line-height",
]);

// Configure DOMPurify hook to filter CSS properties
DOMPurify.addHook("uponSanitizeAttribute", (_node, data) => {
  if (data.attrName === "style" && data.attrValue) {
    // Parse and filter CSS properties
    const filteredStyles = data.attrValue
      .split(";")
      .map((rule) => rule.trim())
      .filter((rule) => {
        if (!rule) return false;
        const colonIndex = rule.indexOf(":");
        if (colonIndex === -1) return false;
        const property = rule.substring(0, colonIndex).trim().toLowerCase();
        return ALLOWED_CSS_PROPERTIES.has(property);
      })
      .join("; ");
    data.attrValue = filteredStyles;
  }
});

// Simple HTML renderer for displaying rich text content with XSS protection
export function RichTextDisplay({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  if (!content || content === "<p></p>") {
    return null;
  }

  // Sanitize HTML to prevent XSS attacks
  const sanitizedContent = DOMPurify.sanitize(content, {
    ALLOWED_TAGS: [
      "p", "br", "strong", "b", "em", "i", "u", "s", "strike",
      "ul", "ol", "li", "h1", "h2", "h3", "h4", "h5", "h6",
      "span", "div", "blockquote", "code", "pre"
    ],
    ALLOWED_ATTR: ["style", "class"],
  });

  return (
    <div
      className={cn("prose prose-sm dark:prose-invert max-w-none", className)}
      dangerouslySetInnerHTML={{ __html: sanitizedContent }}
    />
  );
}
