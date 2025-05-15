function injectAndRunFixer() {
  // Helper function to walk through all text nodes and apply replacements
  function walkTextNodes(node, callback) {
    if (node.nodeType === Node.TEXT_NODE) {
      // Process text node
      callback(node);
    } else {
      // Process child nodes recursively
      for (let i = 0; i < node.childNodes.length; i++) {
        walkTextNodes(node.childNodes[i], callback);
      }
    }
  }

  // Stats object to track replacements
  const stats = {
    emdash: 0,
    apostrophe: 0,
    openQuote: 0,
    closeQuote: 0,
    ellipsis: 0,
  };

  // Find all markdown prose divs
  const markdownDivs = document.querySelectorAll("div.markdown.prose");

  if (markdownDivs.length === 0) {
    console.log("No ChatGPT response content found");
    return stats;
  }

  // Define convertToMarkdown function
  function convertToMarkdown(node) {
    // Try a simple approach first for plain text content
    if (node.textContent && node.children.length === 0) {
      console.log("Using simple text extraction");
      return node.textContent.trim();
    }

    // For simple content with just paragraphs, try a direct approach
    if (
      node.children.length > 0 &&
      node.querySelectorAll("p, hr, pre, code, ul, ol, table, blockquote")
        .length === 0
    ) {
      console.log("Using simplified paragraph extraction");
      return Array.from(node.children)
        .map((child) => child.textContent.trim())
        .filter((text) => text.length > 0)
        .join("\n\n");
    }

    console.log("Using full HTML to Markdown conversion");
    // Get all the HTML content as a string
    const htmlContent = node.innerHTML;

    // Create a more robust markdown conversion
    let markdown = "";

    // Process the DOM tree to generate markdown
    function processNode(node, listPrefix = "") {
      if (!node) return "";

      let result = "";

      // Process based on node type
      switch (node.nodeName) {
        case "H1":
          return `# ${getTextContent(node)}\n\n`;
        case "H2":
          return `## ${getTextContent(node)}\n\n`;
        case "H3":
          return `### ${getTextContent(node)}\n\n`;
        case "H4":
          return `#### ${getTextContent(node)}\n\n`;
        case "H5":
          return `##### ${getTextContent(node)}\n\n`;
        case "H6":
          return `###### ${getTextContent(node)}\n\n`;
        case "P":
          return `${processChildNodes(node)}\n\n`;
        case "BR":
          return "\n";
        case "UL":
          return processListItems(node, "- ");
        case "OL":
          return processOrderedListItems(node);
        case "LI":
          // This should be handled by UL/OL processing
          return `${listPrefix}${processChildNodes(node)}\n`;
        case "BLOCKQUOTE":
          // Process blockquote content with > prefix
          const blockquoteContent = processChildNodes(node);
          return (
            blockquoteContent
              .split("\n")
              .map((line) => `> ${line}`)
              .join("\n") + "\n\n"
          );
        case "PRE":
          // Handle code blocks
          const codeElement = node.querySelector("code");
          if (codeElement) {
            let language = "";
            if (
              codeElement.className &&
              codeElement.className.includes("language-")
            ) {
              language = codeElement.className.replace(
                /.*language-([^\s]+).*/,
                "$1"
              );
            }
            return (
              "```" + language + "\n" + codeElement.textContent + "\n```\n\n"
            );
          } else {
            return "```\n" + node.textContent + "\n```\n\n";
          }
        case "CODE":
          // Handle inline code (not inside a PRE)
          if (node.parentNode.nodeName !== "PRE") {
            return "`" + node.textContent + "`";
          }
          return node.textContent;
        case "STRONG":
        case "B":
          return `**${processChildNodes(node)}**`;
        case "EM":
        case "I":
          return `*${processChildNodes(node)}*`;
        case "A":
          const href = node.getAttribute("href") || "#";
          return `[${processChildNodes(node)}](${href})`;
        case "IMG":
          const src = node.getAttribute("src") || "";
          const alt = node.getAttribute("alt") || "";
          return `![${alt}](${src})`;
        case "TABLE":
          return processTable(node);
        case "HR":
          return "---\n\n";
        case "DIV":
          // For most divs, just process the content
          return processChildNodes(node);
        case "#text":
          // Text node - just return the content
          return node.textContent;
        default:
          // For other elements, process their children
          return processChildNodes(node);
      }
    }

    // Helper function to get text content without extra whitespace
    function getTextContent(node) {
      return node.textContent.trim().replace(/\s+/g, " ");
    }

    // Process child nodes and combine their results
    function processChildNodes(node) {
      let result = "";
      for (const child of node.childNodes) {
        result += processNode(child);
      }
      return result;
    }

    // Process unordered list items
    function processListItems(ulNode, prefix) {
      let result = "\n";
      const items = ulNode.querySelectorAll(":scope > li");
      for (const item of items) {
        result += `${prefix}${processChildNodes(item)}\n`;
      }
      return result + "\n";
    }

    // Process ordered list items
    function processOrderedListItems(olNode) {
      let result = "\n";
      const items = olNode.querySelectorAll(":scope > li");
      let counter = olNode.getAttribute("start") || 1;
      counter = parseInt(counter, 10);

      for (const item of items) {
        result += `${counter}. ${processChildNodes(item)}\n`;
        counter++;
      }
      return result + "\n";
    }

    // Process tables
    function processTable(tableNode) {
      let result = "\n";
      const rows = tableNode.querySelectorAll("tr");
      let hasProcessedHeader = false;

      for (const row of rows) {
        const cells = row.querySelectorAll("th, td");
        if (cells.length === 0) continue;

        // Process cells into a row
        const rowContent = Array.from(cells)
          .map((cell) => {
            return processChildNodes(cell).trim();
          })
          .join(" | ");

        result += `| ${rowContent} |\n`;

        // Add header separator after first row
        if (!hasProcessedHeader) {
          result +=
            "| " +
            Array.from(cells)
              .map(() => "---")
              .join(" | ") +
            " |\n";
          hasProcessedHeader = true;
        }
      }

      return result + "\n";
    }

    // Start processing from the root node
    markdown = processNode(node);

    // Clean up extra line breaks
    markdown = markdown.replace(/\n{3,}/g, "\n\n");

    return markdown.trim();
  }

  // Function to show a brief notification
  function showNotification(message) {
    // Create notification element
    const notification = document.createElement("div");
    notification.className =
      "fixed bottom-4 right-4 bg-green-500 text-white px-4 py-2 rounded shadow-lg z-50";
    notification.textContent = message;

    // Add to document
    document.body.appendChild(notification);

    // Remove after 2 seconds
    setTimeout(() => {
      notification.style.opacity = "0";
      notification.style.transition = "opacity 0.5s";

      // Remove from DOM after fade out
      setTimeout(() => {
        notification.remove();
      }, 500);
    }, 2000);
  }

  // Process each prose div
  markdownDivs.forEach((div) => {
    // Replace characters and count occurrences
    walkTextNodes(div, (node) => {
      const originalText = node.textContent;

      // Replace emdash with hyphen
      node.textContent = node.textContent.replace(/—/g, (match) => {
        stats.emdash += 1;
        return "-";
      });

      // Replace curly apostrophe
      node.textContent = node.textContent.replace(/'/g, (match) => {
        stats.apostrophe += 1;
        return "'";
      });

      // Replace opening curly quotes
      node.textContent = node.textContent.replace(/"/g, (match) => {
        stats.openQuote += 1;
        return '"';
      });

      // Replace closing curly quotes
      node.textContent = node.textContent.replace(/"/g, (match) => {
        stats.closeQuote += 1;
        return '"';
      });

      // Replace ellipsis character
      node.textContent = node.textContent.replace(/…/g, (match) => {
        stats.ellipsis += 1;
        return "...";
      });
    });
  });

  // Get the last markdown div
  const lastDiv = markdownDivs[markdownDivs.length - 1];

  // Convert to markdown
  const markdown = convertToMarkdown(lastDiv);

  // Copy to clipboard
  try {
    navigator.clipboard
      .writeText(markdown)
      .then(() => {
        showNotification("Text fixed and copied to clipboard!");
      })
      .catch((err) => {
        console.error("Clipboard write failed:", err);
        showNotification("Text fixed but could not copy to clipboard");
      });
  } catch (error) {
    console.error("Error copying to clipboard:", error);
    showNotification("Text fixed but could not copy to clipboard");
  }

  console.log("AI text fixed successfully", stats);
  return stats;
}
