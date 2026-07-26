// ---------- Markdown rendering ----------
// No markdown library is available to import in this environment, so
// this is a small hand-rolled renderer covering what AI replies
// actually use: fenced code blocks, inline code, bold, italic, links,
// and bullet/numbered lists. It intentionally does NOT try to support
// the full CommonMark spec — tables, nested lists, images, etc. are
// out of scope for a chat bubble.

// Turns inline markdown (bold/italic/code/links) within one line of
// text into an array of strings/React nodes.
function renderInline(text, styles, keyPrefix) {
  // Single combined pattern, checked in priority order: inline code
  // first (so markdown chars inside `code` aren't touched), then
  // links, then bold, then italic.
  const pattern = /(`[^`]+`)|(\[[^\]]+\]\([^)]+\))|(\*\*[^*]+\*\*)|(\*[^*]+\*)/g;
  const nodes = [];
  let lastIndex = 0;
  let match;
  let i = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    const key = `${keyPrefix}-${i++}`;

    if (token.startsWith("`")) {
      nodes.push(
        <code key={key} style={styles.inlineCode}>
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith("[")) {
      const linkMatch = token.match(/\[([^\]]+)\]\(([^)]+)\)/);
      nodes.push(
        <a key={key} href={linkMatch[2]} target="_blank" rel="noopener noreferrer" style={styles.link}>
          {linkMatch[1]}
        </a>
      );
    } else if (token.startsWith("**")) {
      nodes.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    } else {
      nodes.push(<em key={key}>{token.slice(1, -1)}</em>);
    }

    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

// Turns a full message string into an array of block-level React nodes:
// fenced code blocks, headers, lists, and paragraphs.
export function renderMarkdown(content, styles) {
  const lines = content.split("\n");
  const blocks = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block: ```lang ... ```
    if (line.trim().startsWith("```")) {
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing fence
      blocks.push(
        <pre key={key++} style={styles.codeBlock}>
          <code>{codeLines.join("\n")}</code>
        </pre>
      );
      continue;
    }

    // Headers: #, ##, ###
    const headerMatch = line.match(/^(#{1,3})\s+(.*)/);
    if (headerMatch) {
      const level = headerMatch[1].length;
      const size = level === 1 ? 18 : level === 2 ? 16.5 : 15.5;
      blocks.push(
        <div key={key++} style={{ fontWeight: 700, fontSize: size, margin: "4px 0" }}>
          {renderInline(headerMatch[2], styles, `h${key}`)}
        </div>
      );
      i++;
      continue;
    }

    // List block: consecutive "- "/"* " or "1. " lines
    const isBullet = (l) => /^\s*[-*]\s+/.test(l);
    const isNumbered = (l) => /^\s*\d+\.\s+/.test(l);
    if (isBullet(line) || isNumbered(line)) {
      const ordered = isNumbered(line);
      const items = [];
      while (i < lines.length && (ordered ? isNumbered(lines[i]) : isBullet(lines[i]))) {
        const itemText = lines[i].replace(/^\s*([-*]|\d+\.)\s+/, "");
        items.push(<li key={key++}>{renderInline(itemText, styles, `li${key}`)}</li>);
        i++;
      }
      const ListTag = ordered ? "ol" : "ul";
      blocks.push(
        <ListTag key={key++} style={styles.list}>
          {items}
        </ListTag>
      );
      continue;
    }

    // Blank line: skip (acts as paragraph separator)
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Paragraph: consecutive non-empty, non-special lines
    const paraLines = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !lines[i].trim().startsWith("```") &&
      !isBullet(lines[i]) &&
      !isNumbered(lines[i]) &&
      !/^#{1,3}\s+/.test(lines[i])
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    blocks.push(
      <div key={key++} style={{ margin: 0 }}>
        {paraLines.map((l, idx) => (
          <span key={idx}>
            {renderInline(l, styles, `p${key}-${idx}`)}
            {idx < paraLines.length - 1 && <br />}
          </span>
        ))}
      </div>
    );
  }

  return blocks;
}
