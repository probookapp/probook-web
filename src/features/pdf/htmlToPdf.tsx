import React from "react";
import { Text, View } from "@react-pdf/renderer";

interface ParsedNode {
  type: "text" | "element";
  tag?: string;
  content?: string;
  children?: ParsedNode[];
}

function parseSimpleHtml(html: string): ParsedNode[] {
  const nodes: ParsedNode[] = [];

  const tagRegex = /<(\/?)([\w]+)[^>]*>/g;
  let lastIndex = 0;
  let match;
  const stack: { tag: string; children: ParsedNode[] }[] = [{ tag: "root", children: nodes }];

  while ((match = tagRegex.exec(html)) !== null) {
    // Add text before this tag
    if (match.index > lastIndex) {
      const text = html.slice(lastIndex, match.index);
      if (text.trim() || text.includes(" ")) {
        stack[stack.length - 1].children.push({ type: "text", content: text });
      }
    }

    const isClosing = match[1] === "/";
    const tagName = match[2].toLowerCase();

    if (isClosing) {
      // Pop from stack
      if (stack.length > 1) {
        const completed = stack.pop()!;
        stack[stack.length - 1].children.push({
          type: "element",
          tag: completed.tag,
          children: completed.children,
        });
      }
    } else if (tagName === "br") {
      // Self-closing
      stack[stack.length - 1].children.push({ type: "element", tag: "br" });
    } else {
      // Opening tag - push to stack
      stack.push({ tag: tagName, children: [] });
    }

    lastIndex = tagRegex.lastIndex;
  }

  // Add remaining text
  if (lastIndex < html.length) {
    const text = html.slice(lastIndex);
    if (text.trim() || text.includes(" ")) {
      stack[stack.length - 1].children.push({ type: "text", content: text });
    }
  }

  // Close any remaining open tags
  while (stack.length > 1) {
    const completed = stack.pop()!;
    stack[stack.length - 1].children.push({
      type: "element",
      tag: completed.tag,
      children: completed.children,
    });
  }

  return nodes;
}

function renderNode(node: ParsedNode, key: number): React.ReactNode {
  if (node.type === "text") {
    return node.content;
  }

  const children = node.children?.map((child, i) => renderNode(child, i));

  switch (node.tag) {
    case "strong":
    case "b":
      return (
        <Text key={key} style={{ fontFamily: "Helvetica-Bold" }}>
          {children}
        </Text>
      );
    case "em":
    case "i":
      return (
        <Text key={key} style={{ fontFamily: "Helvetica-Oblique" }}>
          {children}
        </Text>
      );
    case "u":
      return (
        <Text key={key} style={{ textDecoration: "underline" }}>
          {children}
        </Text>
      );
    case "p":
      return (
        <Text key={key} style={{ marginBottom: 2 }}>
          {children}
        </Text>
      );
    case "br":
      return <Text key={key}>{"\n"}</Text>;
    case "ul":
      return (
        <View key={key} style={{ marginLeft: 8, marginTop: 2 }}>
          {children}
        </View>
      );
    case "ol":
      return (
        <View key={key} style={{ marginLeft: 8, marginTop: 2 }}>
          {React.Children.map(children, (child, i) => {
            if (React.isValidElement(child)) {
              return (
                <View style={{ flexDirection: "row", marginBottom: 1 }}>
                  <Text style={{ width: 12, fontSize: 9 }}>{i + 1}.</Text>
                  <View style={{ flex: 1 }}>{child}</View>
                </View>
              );
            }
            return child;
          })}
        </View>
      );
    case "li":
      // For unordered lists, add bullet point
      return (
        <View key={key} style={{ flexDirection: "row", marginBottom: 1 }}>
          <Text style={{ width: 8, fontSize: 9 }}>{"\u2022"}</Text>
          <Text style={{ flex: 1, fontSize: 9 }}>{children}</Text>
        </View>
      );
    case "span":
    case "div":
      return <Text key={key}>{children}</Text>;
    default:
      return <Text key={key}>{children}</Text>;
  }
}

export function renderHtmlToPdf(
  html: string | null | undefined
): React.ReactNode {
  if (!html || html === "<p></p>" || html === "<p><br></p>") {
    return null;
  }

  // Clean up common empty patterns
  const cleanedHtml = html
    .replace(/<p><br><\/p>/g, "")
    .replace(/<p>\s*<\/p>/g, "")
    .trim();

  if (!cleanedHtml) {
    return null;
  }

  const nodes = parseSimpleHtml(cleanedHtml);
  return nodes.map((node, i) => renderNode(node, i));
}

// Helper to check if HTML content is effectively empty
export function isHtmlEmpty(html: string | null | undefined): boolean {
  if (!html) return true;
  const stripped = html.replace(/<[^>]*>/g, "").trim();
  return stripped.length === 0;
}
