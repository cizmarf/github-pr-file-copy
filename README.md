# GitHub PR File Copy

A Chrome extension that adds copy buttons next to file paths in GitHub PR review comments. Clicking the button copies the filename with line number in IntelliJ-compatible format (e.g., `Processor.java:92`).

## Features

- Adds a copy icon button next to file paths in PR review comments
- Copies file reference in IntelliJ navigation format: `filename:lineNumber`
- Visual feedback on copy success (green) or error (red)
- Works with GitHub's SPA navigation (dynamically loaded content)
- Minimal, non-intrusive UI that matches GitHub's design

## Installation

### From Source (Developer Mode)

1. Clone or download this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" (toggle in top-right corner)
4. Click "Load unpacked"
5. Select the extension directory

### Dependencies (for development only)

```bash
npm install
```

## Usage

1. Navigate to any GitHub Pull Request page
2. Open the "Files changed" tab or view review comments
3. Look for the small copy icon (📋) next to file paths in review comment headers
4. Click the icon to copy the file reference to your clipboard
5. Paste in IntelliJ's "Navigate to File" dialog (Cmd+Shift+O / Ctrl+Shift+N)

## Project Structure

```
├── manifest.json       # Chrome Manifest V3 configuration
├── content.js          # Content script (DOM manipulation, button injection)
├── styles.css          # Button styling (12x12 icon, states)
├── content.test.js     # Property-based tests using fast-check
├── package.json        # Node.js dependencies and scripts
└── README.md           # This file
```

## How It Works

### Button Injection
- Scans for `summary[role="button"]` elements containing file path links
- Injects a copy button as a sibling after `span.flex-auto` (for right alignment)
- Uses `MutationObserver` to handle GitHub's SPA navigation and dynamically loaded content

### Line Number Extraction
- Uses `closest('details.review-thread-component')` to find the correct diff table for each comment
- Extracts the highest line number from `td.blob-num.blob-num-addition[data-line-number]` cells

### Clipboard Copy
- Uses the Clipboard API (`navigator.clipboard.writeText`)
- Prevents event propagation to avoid collapsing the review thread

## Development

### Running Tests

```bash
npm test
```

The test suite includes 78 property-based tests using [fast-check](https://github.com/dubzzz/fast-check).

**Note:** Tests disconnect the MutationObserver in `beforeEach` to prevent automatic button injection during test setup.

### Test Coverage

- Filename extraction from various path formats
- Line number extraction from diff tables
- Reference formatting
- Button creation and injection
- Click handler behavior
- MutationObserver lifecycle

## Permissions

- `clipboardWrite` - Required to copy file references to clipboard

## Browser Support

- Chrome (Manifest V3)
- Other Chromium-based browsers (Edge, Brave, etc.)

## License

MIT
