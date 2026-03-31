/**
 * GitHub PR File Copy Extension - Content Script
 * 
 * Core utility functions for extracting file references from GitHub PR review comments.
 */

// DOM selectors for GitHub PR review comment structure
const SELECTORS = {
  // File path container - summary element with role="button"
  filePathSummary: 'summary[role="button"]',
  
  // File path link inside summary
  filePathLink: 'a.Link--primary.text-mono.text-small',
  
  // Container for button injection
  buttonContainer: 'span.flex-auto',
  
  // Diff table containing line numbers
  diffTable: 'table.diff-table',
  
  // Line number cells (addition side - right column)
  lineNumberCell: 'td.blob-num.blob-num-addition[data-line-number]'
};

/**
 * Extracts the filename from a file path link within a summary element.
 * 
 * @param {Element} summaryElement - The summary element containing the file path
 * @returns {string|null} The filename (last segment of path) or null if not found
 */
function extractFilename(summaryElement) {
  if (!summaryElement) {
    return null;
  }
  
  const filePathLink = summaryElement.querySelector(SELECTORS.filePathLink);
  if (!filePathLink) {
    return null;
  }
  
  const fullPath = filePathLink.textContent?.trim();
  if (!fullPath) {
    return null;
  }
  
  // Extract the last segment of the path (the filename)
  const segments = fullPath.split('/');
  const filename = segments[segments.length - 1];
  
  return filename || null;
}

/**
 * Extracts the last (highest) line number from the diff table within a comment block.
 * 
 * @param {Element} commentBlock - The parent comment block containing the diff table
 * @returns {number|null} The highest line number value or null if not found
 */
function extractLineNumber(commentBlock) {
  if (!commentBlock) {
    return null;
  }
  
  const diffTable = commentBlock.querySelector(SELECTORS.diffTable);
  if (!diffTable) {
    return null;
  }
  
  const lineNumberCells = diffTable.querySelectorAll(SELECTORS.lineNumberCell);
  if (!lineNumberCells || lineNumberCells.length === 0) {
    return null;
  }
  
  // Find the highest line number from all addition cells
  let maxLineNumber = null;
  
  for (const cell of lineNumberCells) {
    const lineNumberAttr = cell.getAttribute('data-line-number');
    if (lineNumberAttr) {
      const lineNumber = parseInt(lineNumberAttr, 10);
      if (!isNaN(lineNumber) && (maxLineNumber === null || lineNumber > maxLineNumber)) {
        maxLineNumber = lineNumber;
      }
    }
  }
  
  return maxLineNumber;
}

/**
 * Formats a file reference for IntelliJ IDE navigation.
 * 
 * @param {string} filename - The extracted filename
 * @param {number} lineNumber - The extracted line number
 * @returns {string} Formatted string like "UserService.java:42"
 */
function formatReference(filename, lineNumber) {
  return `${filename}:${lineNumber}`;
}

// =============================================================================
// Button Injection System
// =============================================================================

/** CSS class for injected copy buttons */
const COPY_BUTTON_CLASS = 'gh-pr-copy-btn';

/**
 * Creates a copy button element with a copy icon SVG.
 * The click handler is attached in injectButtons() where we have access to the summary element.
 * 
 * @returns {HTMLButtonElement} Configured button element with copy icon
 */
function createCopyButton() {
  const button = document.createElement('button');
  button.className = COPY_BUTTON_CLASS;
  button.type = 'button';
  button.title = 'Copy file reference';
  button.setAttribute('aria-label', 'Copy file reference to clipboard');
  
  // GitHub Octicon copy icon (12x12)
  button.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="12" height="12" fill="currentColor">
      <path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Z"></path>
      <path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z"></path>
    </svg>
  `;
  
  return button;
}

/**
 * Checks if a copy button has already been injected into a container.
 * 
 * @param {Element} container - The container element to check
 * @returns {boolean} True if a copy button already exists
 */
function hasButton(container) {
  if (!container) {
    return false;
  }
  return container.querySelector(`.${COPY_BUTTON_CLASS}`) !== null;
}

/**
 * Scans the document for file path elements and injects copy buttons.
 * 
 * @param {Element|Document} root - The root element to scan (document or mutation target)
 */
function injectButtons(root) {
  if (!root) {
    return;
  }
  
  // Find all summary elements with file paths
  const summaryElements = root.querySelectorAll(SELECTORS.filePathSummary);
  
  for (const summary of summaryElements) {
    // Find the flex-auto span that contains the file path link
    const flexAutoSpan = summary.querySelector(SELECTORS.buttonContainer);
    if (!flexAutoSpan) {
      continue;
    }
    
    // Find the parent d-flex container where we'll inject the button
    const dFlexContainer = flexAutoSpan.parentElement;
    if (!dFlexContainer) {
      continue;
    }
    
    // Skip if button already exists (idempotent) - check in the d-flex container
    if (hasButton(dFlexContainer)) {
      continue;
    }
    
    // Verify this summary has a file path link
    const filePathLink = summary.querySelector(SELECTORS.filePathLink);
    if (!filePathLink) {
      continue;
    }
    
    // Create and inject the button
    const button = createCopyButton();
    
    // Attach click handler with reference to the summary element
    button.addEventListener('click', (event) => handleClick(event, summary));
    
    // Insert button after the flex-auto span (as sibling) to align it to the right
    flexAutoSpan.after(button);
  }
}

// =============================================================================
// Click Handler and Clipboard Functionality
// =============================================================================

/**
 * Copies text to clipboard and provides visual feedback on the button.
 * 
 * @param {string} text - The text to copy to clipboard
 * @param {HTMLButtonElement} button - The button element for visual feedback
 * @returns {Promise<boolean>} True if copy succeeded, false otherwise
 */
async function copyToClipboard(text, button) {
  try {
    await navigator.clipboard.writeText(text);
    
    // Success feedback
    button.classList.add('copied');
    
    // Reset button state after 2 seconds
    setTimeout(() => {
      button.classList.remove('copied');
    }, 2000);
    
    return true;
  } catch (error) {
    console.error('Failed to copy to clipboard:', error);
    
    // Error feedback
    button.classList.add('error');
    
    // Reset button state after 2 seconds
    setTimeout(() => {
      button.classList.remove('error');
    }, 2000);
    
    return false;
  }
}

/**
 * Handles copy button click with event propagation prevention.
 * Extracts file reference and copies to clipboard.
 * 
 * @param {MouseEvent} event - The click event
 * @param {Element} summaryElement - The parent summary element containing file path
 * @returns {Promise<void>}
 */
async function handleClick(event, summaryElement) {
  // Prevent event from propagating to parent elements (Requirement 3.1)
  event.stopPropagation();
  
  // Prevent default collapse behavior (Requirement 3.2)
  event.preventDefault();
  
  const button = event.currentTarget;
  
  // Extract filename from the summary element
  const filename = extractFilename(summaryElement);
  if (!filename) {
    console.warn('Could not extract filename from summary element');
    return;
  }
  
  // Find the parent comment block to extract line number
  // The comment block is the <details> element that contains both the summary and the diff table
  // Structure: <details class="review-thread-component"> -> <summary> + <div class="blob-wrapper">
  const commentBlock = summaryElement.closest('details.review-thread-component') 
    || summaryElement.closest('details')
    || summaryElement.parentElement;
  
  const lineNumber = extractLineNumber(commentBlock);
  if (!lineNumber) {
    console.warn('Could not extract line number from comment block');
    return;
  }
  
  // Format the reference and copy to clipboard
  const reference = formatReference(filename, lineNumber);
  await copyToClipboard(reference, button);
}

// =============================================================================
// MutationObserver for Dynamic Content (GitHub SPA Navigation)
// =============================================================================

/** Reference to the active MutationObserver instance */
let observer = null;

/**
 * Handles mutations detected by the MutationObserver.
 * Triggers button injection for newly added content.
 * 
 * @param {MutationRecord[]} mutations - Array of mutation records
 */
function handleMutations(mutations) {
  try {
    for (const mutation of mutations) {
      // Only process childList mutations (added/removed nodes)
      if (mutation.type !== 'childList') {
        continue;
      }
      
      // Check added nodes for file path elements
      for (const node of mutation.addedNodes) {
        // Only process element nodes
        if (node.nodeType !== Node.ELEMENT_NODE) {
          continue;
        }
        
        // Inject buttons into the added subtree
        injectButtons(node);
      }
    }
  } catch (error) {
    console.error('Error in MutationObserver callback:', error);
  }
}

/**
 * Initializes the MutationObserver to detect dynamically loaded PR comments.
 * Observes the document body for childList and subtree mutations.
 * Also performs initial button injection on page load.
 */
function initObserver() {
  try {
    // Perform initial button injection on existing content
    injectButtons(document);
    
    // Create observer if not already created
    if (!observer) {
      observer = new MutationObserver(handleMutations);
    }
    
    // Configure observer for childList and subtree mutations
    const config = {
      childList: true,
      subtree: true
    };
    
    // Start observing the document body
    observer.observe(document.body, config);
    
  } catch (error) {
    console.error('Failed to initialize MutationObserver:', error);
  }
}

/**
 * Disconnects the MutationObserver and cleans up resources.
 * Useful for testing or when the extension needs to be disabled.
 */
function disconnectObserver() {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
}

// =============================================================================
// Initialization
// =============================================================================

// Initialize the extension when the DOM is ready
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initObserver);
  } else {
    // DOM is already ready
    initObserver();
  }
}

// Export for testing (if running in Node.js environment)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    SELECTORS,
    COPY_BUTTON_CLASS,
    extractFilename,
    extractLineNumber,
    formatReference,
    createCopyButton,
    hasButton,
    injectButtons,
    copyToClipboard,
    handleClick,
    initObserver,
    disconnectObserver,
    handleMutations
  };
}
