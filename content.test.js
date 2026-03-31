/**
 * Property-based tests for GitHub PR File Copy Extension
 * 
 * Uses fast-check library for property-based testing.
 * Feature: github-pr-file-copy
 * 
 * @jest-environment jsdom
 */

const fc = require('fast-check');
const { extractFilename, extractLineNumber, formatReference, SELECTORS } = require('./content');

/**
 * Helper to create a mock summary element with a file path link
 * @param {string} filePath - The full file path to display
 * @returns {Element} A mock summary element
 */
function createMockSummaryElement(filePath) {
  const container = document.createElement('div');
  container.innerHTML = `
    <summary role="button">
      <div class="d-flex flex-items-center">
        <span class="flex-auto">
          <a class="Link--primary text-mono text-small" href="#">${filePath}</a>
        </span>
      </div>
    </summary>
  `;
  return container.querySelector('summary');
}

/**
 * Arbitrary for generating valid file extensions
 */
const fileExtensionArb = fc.constantFrom(
  '.js', '.ts', '.java', '.py', '.rb', '.go', '.rs', '.cpp', '.c', '.h',
  '.jsx', '.tsx', '.vue', '.svelte', '.html', '.css', '.scss', '.json',
  '.xml', '.yaml', '.yml', '.md', '.txt', '.sh', '.bash', '.sql'
);

/**
 * Arbitrary for generating valid filename characters (alphanumeric, dash, underscore)
 */
const filenameCharArb = fc.constantFrom(
  ...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_'.split('')
);

/**
 * Arbitrary for generating valid filenames (without extension)
 */
const filenameBaseArb = fc.array(filenameCharArb, { minLength: 1, maxLength: 50 })
  .map(chars => chars.join(''));

/**
 * Arbitrary for generating valid filenames with extensions
 */
const filenameArb = fc.tuple(filenameBaseArb, fileExtensionArb)
  .map(([base, ext]) => base + ext);

/**
 * Arbitrary for generating valid directory names
 */
const dirNameArb = fc.array(filenameCharArb, { minLength: 1, maxLength: 30 })
  .map(chars => chars.join(''));

/**
 * Arbitrary for generating file paths with varying depths
 */
const filePathArb = fc.tuple(
  fc.array(dirNameArb, { minLength: 0, maxLength: 10 }),
  filenameArb
).map(([dirs, filename]) => {
  if (dirs.length === 0) {
    return filename;
  }
  return [...dirs, filename].join('/');
});

describe('Property 2: Filename Extraction Correctness', () => {
  /**
   * Feature: github-pr-file-copy, Property 2: Filename Extraction Correctness
   * 
   * For any valid file path string (e.g., "src/main/java/com/example/MyClass.java"),
   * the extractFilename function should return the last path segment (e.g., "MyClass.java").
   * The extraction should handle paths with any number of segments and various file extensions.
   * 
   * Validates: Requirements 2.1
   */
  test('extractFilename returns the last path segment for any valid file path', () => {
    fc.assert(
      fc.property(filePathArb, (filePath) => {
        const summaryElement = createMockSummaryElement(filePath);
        const result = extractFilename(summaryElement);
        
        // The expected filename is the last segment after splitting by '/'
        const segments = filePath.split('/');
        const expectedFilename = segments[segments.length - 1];
        
        return result === expectedFilename;
      }),
      { numRuns: 100 }
    );
  });

  test('extractFilename handles paths with single segment (just filename)', () => {
    fc.assert(
      fc.property(filenameArb, (filename) => {
        const summaryElement = createMockSummaryElement(filename);
        const result = extractFilename(summaryElement);
        
        return result === filename;
      }),
      { numRuns: 100 }
    );
  });

  test('extractFilename handles paths with multiple dots in filename', () => {
    const multiDotFilenameArb = fc.tuple(
      filenameBaseArb,
      fc.constantFrom('.test', '.spec', '.config', '.min'),
      fileExtensionArb
    ).map(([base, middle, ext]) => base + middle + ext);

    const multiDotPathArb = fc.tuple(
      fc.array(dirNameArb, { minLength: 1, maxLength: 5 }),
      multiDotFilenameArb
    ).map(([dirs, filename]) => [...dirs, filename].join('/'));

    fc.assert(
      fc.property(multiDotPathArb, (filePath) => {
        const summaryElement = createMockSummaryElement(filePath);
        const result = extractFilename(summaryElement);
        
        const segments = filePath.split('/');
        const expectedFilename = segments[segments.length - 1];
        
        return result === expectedFilename;
      }),
      { numRuns: 100 }
    );
  });

  test('extractFilename returns null for null summaryElement', () => {
    const result = extractFilename(null);
    expect(result).toBeNull();
  });

  test('extractFilename returns null when file path link is missing', () => {
    const container = document.createElement('div');
    container.innerHTML = `
      <summary role="button">
        <span class="flex-auto"></span>
      </summary>
    `;
    const summaryElement = container.querySelector('summary');
    const result = extractFilename(summaryElement);
    expect(result).toBeNull();
  });

  test('extractFilename returns null for empty file path', () => {
    const summaryElement = createMockSummaryElement('');
    const result = extractFilename(summaryElement);
    expect(result).toBeNull();
  });

  test('extractFilename handles whitespace-padded paths correctly', () => {
    fc.assert(
      fc.property(filePathArb, (filePath) => {
        // Add whitespace padding
        const paddedPath = `  ${filePath}  `;
        const summaryElement = createMockSummaryElement(paddedPath);
        const result = extractFilename(summaryElement);
        
        // Should trim and extract correctly
        const segments = filePath.split('/');
        const expectedFilename = segments[segments.length - 1];
        
        return result === expectedFilename;
      }),
      { numRuns: 100 }
    );
  });
});

/**
 * Arbitrary for generating positive line numbers (typical range in source files)
 */
const lineNumberArb = fc.integer({ min: 1, max: 100000 });

/**
 * Arbitrary for generating arrays of unique positive line numbers (sorted ascending)
 */
const lineNumbersArb = fc.array(lineNumberArb, { minLength: 1, maxLength: 50 })
  .map(nums => [...new Set(nums)].sort((a, b) => a - b));

/**
 * Helper to create a mock comment block with a diff table containing line numbers
 * @param {number[]} lineNumbers - Array of line numbers to include in the diff table
 * @returns {Element} A mock comment block element
 */
function createMockCommentBlock(lineNumbers) {
  const container = document.createElement('div');
  
  const lineNumberCells = lineNumbers
    .map(num => `<td class="blob-num blob-num-addition" data-line-number="${num}"></td>`)
    .join('\n');
  
  container.innerHTML = `
    <div class="comment-block">
      <table class="diff-table">
        <tbody>
          ${lineNumbers.map(num => `
            <tr>
              <td class="blob-num blob-num-deletion"></td>
              <td class="blob-num blob-num-addition" data-line-number="${num}"></td>
              <td class="blob-code">some code</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
  return container.querySelector('.comment-block');
}

/**
 * Helper to create a mock comment block with only deletion lines (no additions)
 * @returns {Element} A mock comment block element with only deletions
 */
function createMockCommentBlockWithDeletionsOnly() {
  const container = document.createElement('div');
  container.innerHTML = `
    <div class="comment-block">
      <table class="diff-table">
        <tbody>
          <tr>
            <td class="blob-num blob-num-deletion" data-line-number="10"></td>
            <td class="blob-num"></td>
            <td class="blob-code">deleted code</td>
          </tr>
        </tbody>
      </table>
    </div>
  `;
  return container.querySelector('.comment-block');
}

/**
 * Helper to create a mock comment block without a diff table
 * @returns {Element} A mock comment block element without diff table
 */
function createMockCommentBlockWithoutDiffTable() {
  const container = document.createElement('div');
  container.innerHTML = `
    <div class="comment-block">
      <p>This is a comment without a diff table</p>
    </div>
  `;
  return container.querySelector('.comment-block');
}

describe('Property 3: Line Number Extraction', () => {
  /**
   * Feature: github-pr-file-copy, Property 3: Line Number Extraction
   * 
   * For any diff table containing td.blob-num.blob-num-addition cells with data-line-number
   * attributes, the extractLineNumber function should return the highest (last) line number
   * value from those cells.
   * 
   * Validates: Requirements 2.2
   */
  test('extractLineNumber returns the highest line number from diff table addition cells', () => {
    fc.assert(
      fc.property(lineNumbersArb, (lineNumbers) => {
        const commentBlock = createMockCommentBlock(lineNumbers);
        const result = extractLineNumber(commentBlock);
        
        // The expected result is the maximum line number
        const expectedMax = Math.max(...lineNumbers);
        
        return result === expectedMax;
      }),
      { numRuns: 100 }
    );
  });

  test('extractLineNumber handles single line number correctly', () => {
    fc.assert(
      fc.property(lineNumberArb, (lineNumber) => {
        const commentBlock = createMockCommentBlock([lineNumber]);
        const result = extractLineNumber(commentBlock);
        
        return result === lineNumber;
      }),
      { numRuns: 100 }
    );
  });

  test('extractLineNumber handles unsorted line numbers and returns the maximum', () => {
    // Generate unsorted arrays of line numbers
    const unsortedLineNumbersArb = fc.array(lineNumberArb, { minLength: 2, maxLength: 20 })
      .map(nums => [...new Set(nums)]) // Remove duplicates but keep unsorted
      .filter(nums => nums.length >= 2);

    fc.assert(
      fc.property(unsortedLineNumbersArb, (lineNumbers) => {
        const commentBlock = createMockCommentBlock(lineNumbers);
        const result = extractLineNumber(commentBlock);
        
        const expectedMax = Math.max(...lineNumbers);
        
        return result === expectedMax;
      }),
      { numRuns: 100 }
    );
  });

  test('extractLineNumber returns null for null commentBlock', () => {
    const result = extractLineNumber(null);
    expect(result).toBeNull();
  });

  test('extractLineNumber returns null when diff table is missing', () => {
    const commentBlock = createMockCommentBlockWithoutDiffTable();
    const result = extractLineNumber(commentBlock);
    expect(result).toBeNull();
  });

  test('extractLineNumber returns null when only deletion lines exist (no additions)', () => {
    const commentBlock = createMockCommentBlockWithDeletionsOnly();
    const result = extractLineNumber(commentBlock);
    expect(result).toBeNull();
  });

  test('extractLineNumber returns null for empty diff table', () => {
    const container = document.createElement('div');
    container.innerHTML = `
      <div class="comment-block">
        <table class="diff-table">
          <tbody></tbody>
        </table>
      </div>
    `;
    const commentBlock = container.querySelector('.comment-block');
    const result = extractLineNumber(commentBlock);
    expect(result).toBeNull();
  });

  test('extractLineNumber handles large line numbers correctly', () => {
    const largeLineNumberArb = fc.integer({ min: 10000, max: 100000 });
    const largeLineNumbersArb = fc.array(largeLineNumberArb, { minLength: 1, maxLength: 10 })
      .map(nums => [...new Set(nums)]);

    fc.assert(
      fc.property(largeLineNumbersArb, (lineNumbers) => {
        const commentBlock = createMockCommentBlock(lineNumbers);
        const result = extractLineNumber(commentBlock);
        
        const expectedMax = Math.max(...lineNumbers);
        
        return result === expectedMax;
      }),
      { numRuns: 100 }
    );
  });

  test('extractLineNumber ignores cells with invalid data-line-number attributes', () => {
    const container = document.createElement('div');
    container.innerHTML = `
      <div class="comment-block">
        <table class="diff-table">
          <tbody>
            <tr>
              <td class="blob-num blob-num-addition" data-line-number="invalid"></td>
              <td class="blob-code">code</td>
            </tr>
            <tr>
              <td class="blob-num blob-num-addition" data-line-number="42"></td>
              <td class="blob-code">code</td>
            </tr>
            <tr>
              <td class="blob-num blob-num-addition" data-line-number=""></td>
              <td class="blob-code">code</td>
            </tr>
          </tbody>
        </table>
      </div>
    `;
    const commentBlock = container.querySelector('.comment-block');
    const result = extractLineNumber(commentBlock);
    expect(result).toBe(42);
  });
});

/**
 * Helper to parse a formatted reference back into filename and line number
 * @param {string} reference - The formatted reference (e.g., "MyClass.java:92")
 * @returns {{filename: string, lineNumber: number}|null} Parsed components or null if invalid
 */
function parseReference(reference) {
  if (!reference || typeof reference !== 'string') {
    return null;
  }
  
  // Find the last colon (to handle filenames that might contain colons)
  const lastColonIndex = reference.lastIndexOf(':');
  if (lastColonIndex === -1 || lastColonIndex === 0 || lastColonIndex === reference.length - 1) {
    return null;
  }
  
  const filename = reference.substring(0, lastColonIndex);
  const lineNumberStr = reference.substring(lastColonIndex + 1);
  const lineNumber = parseInt(lineNumberStr, 10);
  
  if (isNaN(lineNumber)) {
    return null;
  }
  
  return { filename, lineNumber };
}

describe('Property 4: Reference Format Round-Trip', () => {
  /**
   * Feature: github-pr-file-copy, Property 4: Reference Format Round-Trip
   * 
   * For any filename string and positive integer line number, the formatReference function
   * should produce a string in the format "{filename}:{lineNumber}" that can be parsed back
   * to recover the original filename and line number.
   * 
   * Validates: Requirements 2.3
   */
  test('formatReference produces output that can be parsed back to original values', () => {
    fc.assert(
      fc.property(filenameArb, lineNumberArb, (filename, lineNumber) => {
        const formatted = formatReference(filename, lineNumber);
        const parsed = parseReference(formatted);
        
        return parsed !== null &&
               parsed.filename === filename &&
               parsed.lineNumber === lineNumber;
      }),
      { numRuns: 100 }
    );
  });

  test('formatReference produces correct format "{filename}:{lineNumber}"', () => {
    fc.assert(
      fc.property(filenameArb, lineNumberArb, (filename, lineNumber) => {
        const formatted = formatReference(filename, lineNumber);
        const expected = `${filename}:${lineNumber}`;
        
        return formatted === expected;
      }),
      { numRuns: 100 }
    );
  });

  test('formatReference handles filenames with multiple dots', () => {
    const multiDotFilenameArb = fc.tuple(
      filenameBaseArb,
      fc.constantFrom('.test', '.spec', '.config', '.min'),
      fileExtensionArb
    ).map(([base, middle, ext]) => base + middle + ext);

    fc.assert(
      fc.property(multiDotFilenameArb, lineNumberArb, (filename, lineNumber) => {
        const formatted = formatReference(filename, lineNumber);
        const parsed = parseReference(formatted);
        
        return parsed !== null &&
               parsed.filename === filename &&
               parsed.lineNumber === lineNumber;
      }),
      { numRuns: 100 }
    );
  });

  test('formatReference handles edge case line numbers', () => {
    const edgeCaseLineNumbers = fc.constantFrom(1, 10, 100, 1000, 10000, 99999);
    
    fc.assert(
      fc.property(filenameArb, edgeCaseLineNumbers, (filename, lineNumber) => {
        const formatted = formatReference(filename, lineNumber);
        const parsed = parseReference(formatted);
        
        return parsed !== null &&
               parsed.filename === filename &&
               parsed.lineNumber === lineNumber;
      }),
      { numRuns: 100 }
    );
  });

  test('formatReference handles various file extensions correctly', () => {
    fc.assert(
      fc.property(filenameBaseArb, fileExtensionArb, lineNumberArb, (base, ext, lineNumber) => {
        const filename = base + ext;
        const formatted = formatReference(filename, lineNumber);
        const parsed = parseReference(formatted);
        
        return parsed !== null &&
               parsed.filename === filename &&
               parsed.lineNumber === lineNumber;
      }),
      { numRuns: 100 }
    );
  });

  test('formatReference with specific examples produces expected output', () => {
    // Test specific examples from the requirements
    expect(formatReference('UserService.java', 42)).toBe('UserService.java:42');
    expect(formatReference('MyClass.java', 1)).toBe('MyClass.java:1');
    expect(formatReference('index.ts', 100)).toBe('index.ts:100');
    expect(formatReference('app.test.js', 42)).toBe('app.test.js:42');
    expect(formatReference('config.min.css', 999)).toBe('config.min.css:999');
  });

  test('parseReference correctly parses formatted references', () => {
    // Verify the parse helper works correctly
    expect(parseReference('MyClass.java:92')).toEqual({ filename: 'MyClass.java', lineNumber: 92 });
    expect(parseReference('app.test.js:1')).toEqual({ filename: 'app.test.js', lineNumber: 1 });
    expect(parseReference('file:with:colons.txt:100')).toEqual({ filename: 'file:with:colons.txt', lineNumber: 100 });
  });

  test('parseReference returns null for invalid inputs', () => {
    expect(parseReference(null)).toBeNull();
    expect(parseReference('')).toBeNull();
    expect(parseReference('nolineumber')).toBeNull();
    expect(parseReference(':123')).toBeNull();
    expect(parseReference('file:')).toBeNull();
    expect(parseReference('file:notanumber')).toBeNull();
  });
});


// Import button injection functions
const { createCopyButton, hasButton, injectButtons, COPY_BUTTON_CLASS } = require('./content');

// =============================================================================
// Button Injection System Tests
// =============================================================================

/**
 * Helper to create a mock file path summary element for button injection testing
 * @param {string} filePath - The file path to display
 * @param {boolean} includeButton - Whether to pre-inject a button
 * @returns {Element} A mock summary element
 */
function createMockSummaryForInjection(filePath, includeButton = false) {
  const container = document.createElement('div');
  container.innerHTML = `
    <summary role="button">
      <div class="d-flex flex-items-center">
        <span class="flex-auto">
          <a class="Link--primary text-mono text-small" href="#">${filePath}</a>
        </span>
        ${includeButton ? `<button class="${COPY_BUTTON_CLASS}"></button>` : ''}
      </div>
    </summary>
  `;
  return container.querySelector('summary');
}

/**
 * Helper to create a mock document root with multiple file path elements
 * @param {string[]} filePaths - Array of file paths
 * @returns {Element} A mock root element
 */
function createMockRoot(filePaths) {
  const root = document.createElement('div');
  filePaths.forEach(filePath => {
    const summary = createMockSummaryForInjection(filePath);
    root.appendChild(summary.parentElement);
  });
  return root;
}

describe('createCopyButton', () => {
  test('creates a button element', () => {
    const button = createCopyButton();
    expect(button).toBeInstanceOf(HTMLButtonElement);
  });

  test('button has the correct CSS class', () => {
    const button = createCopyButton();
    expect(button.className).toBe(COPY_BUTTON_CLASS);
  });

  test('button has type="button" to prevent form submission', () => {
    const button = createCopyButton();
    expect(button.type).toBe('button');
  });

  test('button has accessible title attribute', () => {
    const button = createCopyButton();
    expect(button.title).toBe('Click to copy • Cmd+Click to open in IntelliJ');
  });

  test('button has aria-label for screen readers', () => {
    const button = createCopyButton();
    expect(button.getAttribute('aria-label')).toBe('Copy file reference to clipboard, or Cmd+Click to open in IntelliJ');
  });

  test('button contains an SVG icon', () => {
    const button = createCopyButton();
    const svg = button.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg.getAttribute('viewBox')).toBe('0 0 16 16');
  });

  test('SVG has correct dimensions', () => {
    const button = createCopyButton();
    const svg = button.querySelector('svg');
    expect(svg.getAttribute('width')).toBe('12');
    expect(svg.getAttribute('height')).toBe('12');
  });
});

describe('hasButton', () => {
  test('returns false for null container', () => {
    expect(hasButton(null)).toBe(false);
  });

  test('returns false for container without button', () => {
    const container = document.createElement('span');
    container.className = 'flex-auto';
    expect(hasButton(container)).toBe(false);
  });

  test('returns true for container with copy button', () => {
    const container = document.createElement('span');
    container.className = 'flex-auto';
    const button = document.createElement('button');
    button.className = COPY_BUTTON_CLASS;
    container.appendChild(button);
    expect(hasButton(container)).toBe(true);
  });

  test('returns false for container with different button class', () => {
    const container = document.createElement('span');
    container.className = 'flex-auto';
    const button = document.createElement('button');
    button.className = 'other-button';
    container.appendChild(button);
    expect(hasButton(container)).toBe(false);
  });
});

describe('injectButtons', () => {
  test('does nothing for null root', () => {
    // Should not throw
    expect(() => injectButtons(null)).not.toThrow();
  });

  test('injects button into summary element with file path', () => {
    const root = createMockRoot(['src/main/java/MyClass.java']);
    
    injectButtons(root);
    
    const buttons = root.querySelectorAll(`.${COPY_BUTTON_CLASS}`);
    expect(buttons.length).toBe(1);
  });

  test('injects buttons into multiple summary elements', () => {
    const filePaths = [
      'src/main/java/MyClass.java',
      'src/test/java/MyClassTest.java',
      'src/main/resources/config.yaml'
    ];
    const root = createMockRoot(filePaths);
    
    injectButtons(root);
    
    const buttons = root.querySelectorAll(`.${COPY_BUTTON_CLASS}`);
    expect(buttons.length).toBe(3);
  });

  test('does not inject duplicate buttons (idempotent)', () => {
    const root = createMockRoot(['src/main/java/MyClass.java']);
    
    // Inject twice
    injectButtons(root);
    injectButtons(root);
    
    const buttons = root.querySelectorAll(`.${COPY_BUTTON_CLASS}`);
    expect(buttons.length).toBe(1);
  });

  test('skips summary elements without file path link', () => {
    const root = document.createElement('div');
    root.innerHTML = `
      <summary role="button">
        <span class="flex-auto"></span>
      </summary>
    `;
    
    injectButtons(root);
    
    const buttons = root.querySelectorAll(`.${COPY_BUTTON_CLASS}`);
    expect(buttons.length).toBe(0);
  });

  test('skips summary elements without button container', () => {
    const root = document.createElement('div');
    root.innerHTML = `
      <summary role="button">
        <a class="Link--primary text-mono text-small" href="#">file.java</a>
      </summary>
    `;
    
    injectButtons(root);
    
    const buttons = root.querySelectorAll(`.${COPY_BUTTON_CLASS}`);
    expect(buttons.length).toBe(0);
  });

  test('button is appended after the flex-auto container', () => {
    const root = createMockRoot(['src/MyClass.java']);
    
    injectButtons(root);
    
    const flexAutoSpan = root.querySelector('span.flex-auto');
    const dFlexContainer = flexAutoSpan.parentElement;
    const button = dFlexContainer.querySelector(`.${COPY_BUTTON_CLASS}`);
    expect(button).not.toBeNull();
    // Button should be a sibling of flex-auto span, not inside it
    expect(button.parentElement).toBe(dFlexContainer);
    expect(flexAutoSpan.nextElementSibling).toBe(button);
  });
});

describe('Property 1: Button Injection Completeness', () => {
  /**
   * Feature: github-pr-file-copy, Property 1: Button Injection Completeness
   * 
   * For any DOM tree containing file path elements (summary elements with role="button"
   * containing a.Link--primary.text-mono.text-small links), after the button injector runs,
   * each file path element's span.flex-auto container should contain exactly one copy button
   * with the class gh-pr-copy-btn.
   * 
   * Validates: Requirements 1.1, 1.4
   */

  /**
   * Arbitrary for generating arrays of file paths (1-30 paths)
   */
  const filePathsForCompletenessArb = fc.array(filePathArb, { minLength: 1, maxLength: 30 });

  test('every valid file path element receives exactly one copy button', () => {
    fc.assert(
      fc.property(filePathsForCompletenessArb, (filePaths) => {
        const root = createMockRoot(filePaths);
        
        // Run injection
        injectButtons(root);
        
        // Count file path elements (summary elements with file path links)
        const summaryElements = root.querySelectorAll(SELECTORS.filePathSummary);
        const validSummaries = Array.from(summaryElements).filter(summary => {
          const hasLink = summary.querySelector(SELECTORS.filePathLink) !== null;
          const hasContainer = summary.querySelector(SELECTORS.buttonContainer) !== null;
          return hasLink && hasContainer;
        });
        
        // Count total buttons
        const totalButtons = root.querySelectorAll(`.${COPY_BUTTON_CLASS}`).length;
        
        // Should have exactly one button per valid file path element
        return totalButtons === validSummaries.length && totalButtons === filePaths.length;
      }),
      { numRuns: 100 }
    );
  });

  test('each file path container contains exactly one button after injection', () => {
    fc.assert(
      fc.property(filePathsForCompletenessArb, (filePaths) => {
        const root = createMockRoot(filePaths);
        
        // Run injection
        injectButtons(root);
        
        // Check each d-flex container (parent of flex-auto) has exactly one button
        const flexAutoSpans = root.querySelectorAll(SELECTORS.buttonContainer);
        for (const flexAutoSpan of flexAutoSpans) {
          const dFlexContainer = flexAutoSpan.parentElement;
          if (!dFlexContainer) continue;
          const buttonCount = dFlexContainer.querySelectorAll(`.${COPY_BUTTON_CLASS}`).length;
          if (buttonCount !== 1) {
            return false;
          }
        }
        
        return true;
      }),
      { numRuns: 100 }
    );
  });

  test('button injection covers all file path elements regardless of DOM depth', () => {
    /**
     * Arbitrary for generating nested DOM structures with file paths at various depths
     */
    const nestedDepthArb = fc.integer({ min: 1, max: 5 });
    
    fc.assert(
      fc.property(filePathsForCompletenessArb, nestedDepthArb, (filePaths, depth) => {
        // Create a nested root structure
        const root = document.createElement('div');
        let currentLevel = root;
        
        // Create nested wrapper divs
        for (let i = 0; i < depth; i++) {
          const wrapper = document.createElement('div');
          wrapper.className = `level-${i}`;
          currentLevel.appendChild(wrapper);
          currentLevel = wrapper;
        }
        
        // Add file path elements at the deepest level
        filePaths.forEach(filePath => {
          const wrapper = document.createElement('div');
          wrapper.innerHTML = `
            <summary role="button">
              <a class="Link--primary text-mono text-small" href="#">${filePath}</a>
              <span class="flex-auto"></span>
            </summary>
          `;
          currentLevel.appendChild(wrapper);
        });
        
        // Run injection from root
        injectButtons(root);
        
        // Count buttons
        const totalButtons = root.querySelectorAll(`.${COPY_BUTTON_CLASS}`).length;
        
        return totalButtons === filePaths.length;
      }),
      { numRuns: 100 }
    );
  });

  test('button injection handles mixed valid and invalid file path elements', () => {
    fc.assert(
      fc.property(
        fc.array(filePathArb, { minLength: 1, maxLength: 10 }),
        fc.integer({ min: 0, max: 5 }),
        (validFilePaths, invalidCount) => {
          const root = document.createElement('div');
          
          // Add valid file path elements
          validFilePaths.forEach(filePath => {
            const wrapper = document.createElement('div');
            wrapper.innerHTML = `
              <summary role="button">
                <a class="Link--primary text-mono text-small" href="#">${filePath}</a>
                <span class="flex-auto"></span>
              </summary>
            `;
            root.appendChild(wrapper);
          });
          
          // Add invalid elements (missing file path link)
          for (let i = 0; i < invalidCount; i++) {
            const wrapper = document.createElement('div');
            wrapper.innerHTML = `
              <summary role="button">
                <span class="flex-auto"></span>
              </summary>
            `;
            root.appendChild(wrapper);
          }
          
          // Add invalid elements (missing button container)
          for (let i = 0; i < invalidCount; i++) {
            const wrapper = document.createElement('div');
            wrapper.innerHTML = `
              <summary role="button">
                <a class="Link--primary text-mono text-small" href="#">invalid-${i}.java</a>
              </summary>
            `;
            root.appendChild(wrapper);
          }
          
          // Run injection
          injectButtons(root);
          
          // Should only inject buttons for valid elements
          const totalButtons = root.querySelectorAll(`.${COPY_BUTTON_CLASS}`).length;
          
          return totalButtons === validFilePaths.length;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('injected buttons have the correct CSS class', () => {
    fc.assert(
      fc.property(filePathsForCompletenessArb, (filePaths) => {
        const root = createMockRoot(filePaths);
        
        // Run injection
        injectButtons(root);
        
        // All buttons should have the correct class
        const buttons = root.querySelectorAll('button');
        const copyButtons = root.querySelectorAll(`.${COPY_BUTTON_CLASS}`);
        
        // Every button in the containers should be a copy button
        const containers = root.querySelectorAll(SELECTORS.buttonContainer);
        for (const container of containers) {
          const containerButtons = container.querySelectorAll('button');
          for (const button of containerButtons) {
            if (!button.classList.contains(COPY_BUTTON_CLASS)) {
              return false;
            }
          }
        }
        
        return copyButtons.length === filePaths.length;
      }),
      { numRuns: 100 }
    );
  });

  test('button injection works with empty root (no file paths)', () => {
    const root = document.createElement('div');
    
    // Should not throw
    expect(() => injectButtons(root)).not.toThrow();
    
    // Should have no buttons
    const buttons = root.querySelectorAll(`.${COPY_BUTTON_CLASS}`);
    expect(buttons.length).toBe(0);
  });

  test('button injection handles large number of file path elements', () => {
    // Test with a larger set of file paths
    const largeFilePathsArb = fc.array(filePathArb, { minLength: 50, maxLength: 100 });
    
    fc.assert(
      fc.property(largeFilePathsArb, (filePaths) => {
        const root = createMockRoot(filePaths);
        
        // Run injection
        injectButtons(root);
        
        // Count buttons
        const totalButtons = root.querySelectorAll(`.${COPY_BUTTON_CLASS}`).length;
        
        return totalButtons === filePaths.length;
      }),
      { numRuns: 20 } // Fewer runs due to larger DOM size
    );
  });

  test('button is placed inside the correct container element', () => {
    fc.assert(
      fc.property(filePathsForCompletenessArb, (filePaths) => {
        const root = createMockRoot(filePaths);
        
        // Run injection
        injectButtons(root);
        
        // Verify each button is inside a d-flex container (sibling of flex-auto span)
        const buttons = root.querySelectorAll(`.${COPY_BUTTON_CLASS}`);
        for (const button of buttons) {
          const parent = button.parentElement;
          // Button should be in the d-flex container (parent of flex-auto span)
          if (!parent || !parent.classList.contains('d-flex')) {
            return false;
          }
          // Button should be a sibling of flex-auto span
          const flexAutoSpan = parent.querySelector(SELECTORS.buttonContainer);
          if (!flexAutoSpan || flexAutoSpan.nextElementSibling !== button) {
            return false;
          }
        }
        
        return true;
      }),
      { numRuns: 100 }
    );
  });
});

describe('Property 7: Idempotent Button Injection', () => {
  /**
   * Feature: github-pr-file-copy, Property 7: Idempotent Button Injection
   * 
   * For any file path element that already has a copy button injected, running the button
   * injector again should not add duplicate buttons. The hasButton check should prevent
   * multiple injections.
   * 
   * Validates: Requirements 1.1, 1.4, 5.1
   */

  /**
   * Arbitrary for generating arrays of file paths (1-20 paths)
   */
  const filePathsArb = fc.array(filePathArb, { minLength: 1, maxLength: 20 });

  /**
   * Arbitrary for generating number of injection iterations (2-10)
   */
  const iterationsArb = fc.integer({ min: 2, max: 10 });

  test('multiple injections result in exactly one button per file path element', () => {
    fc.assert(
      fc.property(filePathsArb, iterationsArb, (filePaths, iterations) => {
        const root = createMockRoot(filePaths);
        
        // Run injection multiple times
        for (let i = 0; i < iterations; i++) {
          injectButtons(root);
        }
        
        // Count total buttons
        const totalButtons = root.querySelectorAll(`.${COPY_BUTTON_CLASS}`).length;
        
        // Should have exactly one button per file path
        return totalButtons === filePaths.length;
      }),
      { numRuns: 100 }
    );
  });

  test('each file path container has at most one button after multiple injections', () => {
    fc.assert(
      fc.property(filePathsArb, iterationsArb, (filePaths, iterations) => {
        const root = createMockRoot(filePaths);
        
        // Run injection multiple times
        for (let i = 0; i < iterations; i++) {
          injectButtons(root);
        }
        
        // Check each container has at most one button
        const containers = root.querySelectorAll('span.flex-auto');
        for (const container of containers) {
          const buttonCount = container.querySelectorAll(`.${COPY_BUTTON_CLASS}`).length;
          if (buttonCount > 1) {
            return false;
          }
        }
        
        return true;
      }),
      { numRuns: 100 }
    );
  });

  test('hasButton correctly detects existing buttons preventing duplicates', () => {
    fc.assert(
      fc.property(filePathArb, (filePath) => {
        const root = createMockRoot([filePath]);
        const flexAutoSpan = root.querySelector('span.flex-auto');
        const dFlexContainer = flexAutoSpan.parentElement;
        
        // Before injection, hasButton should return false
        const beforeInjection = hasButton(dFlexContainer);
        
        // Inject button
        injectButtons(root);
        
        // After injection, hasButton should return true
        const afterInjection = hasButton(dFlexContainer);
        
        // Second injection should not add another button
        injectButtons(root);
        const buttonCount = dFlexContainer.querySelectorAll(`.${COPY_BUTTON_CLASS}`).length;
        
        return beforeInjection === false && 
               afterInjection === true && 
               buttonCount === 1;
      }),
      { numRuns: 100 }
    );
  });

  test('injection is idempotent regardless of DOM tree size', () => {
    // Test with varying numbers of file paths
    const varyingSizeArb = fc.integer({ min: 1, max: 50 }).chain(size =>
      fc.tuple(
        fc.array(filePathArb, { minLength: size, maxLength: size }),
        iterationsArb
      )
    );

    fc.assert(
      fc.property(varyingSizeArb, ([filePaths, iterations]) => {
        const root = createMockRoot(filePaths);
        
        // Run injection multiple times
        for (let i = 0; i < iterations; i++) {
          injectButtons(root);
        }
        
        const totalButtons = root.querySelectorAll(`.${COPY_BUTTON_CLASS}`).length;
        return totalButtons === filePaths.length;
      }),
      { numRuns: 100 }
    );
  });

  test('pre-existing buttons are preserved and not duplicated', () => {
    fc.assert(
      fc.property(filePathArb, iterationsArb, (filePath, iterations) => {
        // Create a root with a pre-existing button
        const root = document.createElement('div');
        root.innerHTML = `
          <summary role="button">
            <a class="Link--primary text-mono text-small" href="#">${filePath}</a>
            <span class="flex-auto">
              <button class="${COPY_BUTTON_CLASS}">Pre-existing</button>
            </span>
          </summary>
        `;
        
        // Run injection multiple times
        for (let i = 0; i < iterations; i++) {
          injectButtons(root);
        }
        
        // Should still have exactly one button
        const buttons = root.querySelectorAll(`.${COPY_BUTTON_CLASS}`);
        return buttons.length === 1;
      }),
      { numRuns: 100 }
    );
  });

  test('mixed DOM with some pre-existing buttons maintains correct count', () => {
    fc.assert(
      fc.property(
        fc.array(filePathArb, { minLength: 2, maxLength: 10 }),
        fc.integer({ min: 0, max: 9 }),
        iterationsArb,
        (filePaths, preExistingIndex, iterations) => {
          // Ensure preExistingIndex is within bounds
          const safeIndex = preExistingIndex % filePaths.length;
          
          // Create root with mixed state (some with buttons, some without)
          const root = document.createElement('div');
          filePaths.forEach((filePath, index) => {
            const hasPreExisting = index === safeIndex;
            const wrapper = document.createElement('div');
            wrapper.innerHTML = `
              <summary role="button">
                <a class="Link--primary text-mono text-small" href="#">${filePath}</a>
                <span class="flex-auto">${hasPreExisting ? `<button class="${COPY_BUTTON_CLASS}"></button>` : ''}</span>
              </summary>
            `;
            root.appendChild(wrapper);
          });
          
          // Run injection multiple times
          for (let i = 0; i < iterations; i++) {
            injectButtons(root);
          }
          
          // Should have exactly one button per file path
          const totalButtons = root.querySelectorAll(`.${COPY_BUTTON_CLASS}`).length;
          return totalButtons === filePaths.length;
        }
      ),
      { numRuns: 100 }
    );
  });
});


// =============================================================================
// Click Handler and Event Isolation Tests
// =============================================================================

// Import click handler function
const { handleClick } = require('./content');

/**
 * Helper to set up clipboard mock for testing
 * Must be called inside each test iteration for property-based tests
 * @param {boolean} shouldFail - Whether the clipboard operation should fail
 */
function setupClipboardMock(shouldFail = false) {
  Object.assign(navigator, {
    clipboard: {
      writeText: shouldFail 
        ? jest.fn().mockRejectedValue(new Error('Clipboard access denied'))
        : jest.fn().mockResolvedValue(undefined)
    }
  });
}

/**
 * Helper to create a mock MouseEvent with spies for stopPropagation and preventDefault
 * @returns {{event: object, wasStopPropagationCalled: () => boolean, wasPreventDefaultCalled: () => boolean}}
 */
function createMockClickEvent() {
  const event = {
    stopPropagation: jest.fn(),
    preventDefault: jest.fn(),
    currentTarget: null
  };
  
  return {
    event,
    // Use functions to check if methods were called via jest mock
    wasStopPropagationCalled: () => event.stopPropagation.mock.calls.length > 0,
    wasPreventDefaultCalled: () => event.preventDefault.mock.calls.length > 0
  };
}

/**
 * Helper to create a complete mock DOM structure for click handler testing
 * @param {string} filePath - The file path to display
 * @param {number[]} lineNumbers - Array of line numbers for the diff table
 * @returns {{root: Element, summary: Element, button: HTMLButtonElement}}
 */
function createMockDOMForClickHandler(filePath, lineNumbers) {
  const root = document.createElement('div');
  root.className = 'js-comment';
  
  const lineNumberCells = lineNumbers
    .map(num => `
      <tr>
        <td class="blob-num blob-num-deletion"></td>
        <td class="blob-num blob-num-addition" data-line-number="${num}"></td>
        <td class="blob-code">some code</td>
      </tr>
    `).join('');
  
  root.innerHTML = `
    <summary role="button">
      <a class="Link--primary text-mono text-small" href="#">${filePath}</a>
      <span class="flex-auto"></span>
    </summary>
    <table class="diff-table">
      <tbody>
        ${lineNumberCells}
      </tbody>
    </table>
  `;
  
  const summary = root.querySelector('summary');
  const container = root.querySelector('span.flex-auto');
  const button = createCopyButton();
  container.appendChild(button);
  
  return { root, summary, button };
}

describe('Property 6: Event Isolation', () => {
  /**
   * Feature: github-pr-file-copy, Property 6: Event Isolation
   * 
   * For any click event on a copy button, both stopPropagation() and preventDefault()
   * should be called on the event object, ensuring no parent elements receive the click
   * event and no default browser behavior occurs.
   * 
   * Validates: Requirements 3.1, 3.2
   */

  test('handleClick calls stopPropagation on the event', async () => {
    await fc.assert(
      fc.asyncProperty(filePathArb, lineNumbersArb, async (filePath, lineNumbers) => {
        setupClipboardMock();
        const { root, summary, button } = createMockDOMForClickHandler(filePath, lineNumbers);
        const { event, wasStopPropagationCalled } = createMockClickEvent();
        event.currentTarget = button;
        
        await handleClick(event, summary);
        
        return wasStopPropagationCalled() === true;
      }),
      { numRuns: 100 }
    );
  });

  test('handleClick calls preventDefault on the event', async () => {
    await fc.assert(
      fc.asyncProperty(filePathArb, lineNumbersArb, async (filePath, lineNumbers) => {
        setupClipboardMock();
        const { root, summary, button } = createMockDOMForClickHandler(filePath, lineNumbers);
        const { event, wasPreventDefaultCalled } = createMockClickEvent();
        event.currentTarget = button;
        
        await handleClick(event, summary);
        
        return wasPreventDefaultCalled() === true;
      }),
      { numRuns: 100 }
    );
  });

  test('handleClick calls both stopPropagation and preventDefault for any valid input', async () => {
    await fc.assert(
      fc.asyncProperty(filePathArb, lineNumbersArb, async (filePath, lineNumbers) => {
        setupClipboardMock();
        const { root, summary, button } = createMockDOMForClickHandler(filePath, lineNumbers);
        const { event, wasStopPropagationCalled, wasPreventDefaultCalled } = createMockClickEvent();
        event.currentTarget = button;
        
        await handleClick(event, summary);
        
        // Both methods must be called to ensure complete event isolation
        return wasStopPropagationCalled() === true && wasPreventDefaultCalled() === true;
      }),
      { numRuns: 100 }
    );
  });

  test('event isolation occurs before any other processing', async () => {
    // This test verifies that stopPropagation and preventDefault are called
    // even if subsequent operations fail (e.g., filename extraction fails)
    setupClipboardMock();
    const { event, wasStopPropagationCalled, wasPreventDefaultCalled } = createMockClickEvent();
    const button = createCopyButton();
    event.currentTarget = button;
    
    // Create a summary element without a file path link (will cause extraction to fail)
    const invalidSummary = document.createElement('summary');
    invalidSummary.setAttribute('role', 'button');
    invalidSummary.innerHTML = '<span class="flex-auto"></span>';
    
    await handleClick(event, invalidSummary);
    
    // Event isolation should still occur even though filename extraction failed
    expect(wasStopPropagationCalled()).toBe(true);
    expect(wasPreventDefaultCalled()).toBe(true);
  });

  test('event isolation prevents parent click handlers from firing', async () => {
    await fc.assert(
      fc.asyncProperty(filePathArb, lineNumbersArb, async (filePath, lineNumbers) => {
        setupClipboardMock();
        const { root, summary, button } = createMockDOMForClickHandler(filePath, lineNumbers);
        
        // Track if parent received the click
        let parentClickReceived = false;
        root.addEventListener('click', () => {
          parentClickReceived = true;
        });
        
        // Create a real-ish event that we can control
        const { event, wasStopPropagationCalled } = createMockClickEvent();
        event.currentTarget = button;
        
        await handleClick(event, summary);
        
        // Verify stopPropagation was called (which would prevent parent from receiving)
        return wasStopPropagationCalled() === true;
      }),
      { numRuns: 100 }
    );
  });

  test('event isolation is consistent across different file types', async () => {
    // Test with various file extensions to ensure event isolation is universal
    const fileExtensions = ['.js', '.ts', '.java', '.py', '.rb', '.go', '.rs', '.cpp', '.vue'];
    
    for (const ext of fileExtensions) {
      setupClipboardMock();
      const filePath = `src/main/MyClass${ext}`;
      const lineNumbers = [42];
      const { root, summary, button } = createMockDOMForClickHandler(filePath, lineNumbers);
      const { event, wasStopPropagationCalled, wasPreventDefaultCalled } = createMockClickEvent();
      event.currentTarget = button;
      
      await handleClick(event, summary);
      
      expect(wasStopPropagationCalled()).toBe(true);
      expect(wasPreventDefaultCalled()).toBe(true);
    }
  });

  test('event isolation works with deeply nested DOM structures', async () => {
    await fc.assert(
      fc.asyncProperty(
        filePathArb,
        lineNumbersArb,
        fc.integer({ min: 1, max: 10 }),
        async (filePath, lineNumbers, nestingDepth) => {
          setupClipboardMock();
          // Create deeply nested structure
          const outermost = document.createElement('div');
          let current = outermost;
          
          for (let i = 0; i < nestingDepth; i++) {
            const wrapper = document.createElement('div');
            wrapper.className = `nesting-level-${i}`;
            current.appendChild(wrapper);
            current = wrapper;
          }
          
          // Add the comment structure at the deepest level
          const { root, summary, button } = createMockDOMForClickHandler(filePath, lineNumbers);
          current.appendChild(root);
          
          const { event, wasStopPropagationCalled, wasPreventDefaultCalled } = createMockClickEvent();
          event.currentTarget = button;
          
          await handleClick(event, summary);
          
          return wasStopPropagationCalled() === true && wasPreventDefaultCalled() === true;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('event isolation is maintained even when clipboard operation fails', async () => {
    await fc.assert(
      fc.asyncProperty(filePathArb, lineNumbersArb, async (filePath, lineNumbers) => {
        // Mock clipboard to fail for this iteration
        setupClipboardMock(true);
        const { root, summary, button } = createMockDOMForClickHandler(filePath, lineNumbers);
        const { event, wasStopPropagationCalled, wasPreventDefaultCalled } = createMockClickEvent();
        event.currentTarget = button;
        
        // Should not throw even if clipboard fails
        await handleClick(event, summary);
        
        // Event isolation should still occur
        return wasStopPropagationCalled() === true && wasPreventDefaultCalled() === true;
      }),
      { numRuns: 100 }
    );
  });
});

describe('handleClick unit tests', () => {
  beforeEach(() => {
    setupClipboardMock();
  });

  test('handleClick extracts correct file reference and copies to clipboard', async () => {
    const filePath = 'src/main/java/com/example/MyClass.java';
    const lineNumbers = [10, 20, 30, 42];
    const { root, summary, button } = createMockDOMForClickHandler(filePath, lineNumbers);
    const { event } = createMockClickEvent();
    event.currentTarget = button;
    
    await handleClick(event, summary);
    
    // Should copy the filename with the highest line number
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('MyClass.java:42');
  });

  test('handleClick adds copied class on successful copy', async () => {
    const filePath = 'src/MyClass.java';
    const lineNumbers = [10];
    const { root, summary, button } = createMockDOMForClickHandler(filePath, lineNumbers);
    const { event } = createMockClickEvent();
    event.currentTarget = button;
    
    await handleClick(event, summary);
    
    expect(button.classList.contains('copied')).toBe(true);
  });

  test('handleClick adds error class on failed copy', async () => {
    setupClipboardMock(true);
    
    const filePath = 'src/MyClass.java';
    const lineNumbers = [10];
    const { root, summary, button } = createMockDOMForClickHandler(filePath, lineNumbers);
    const { event } = createMockClickEvent();
    event.currentTarget = button;
    
    await handleClick(event, summary);
    
    expect(button.classList.contains('error')).toBe(true);
  });

  test('handleClick does not copy when filename cannot be extracted', async () => {
    const { event } = createMockClickEvent();
    const button = createCopyButton();
    event.currentTarget = button;
    
    // Summary without file path link
    const invalidSummary = document.createElement('summary');
    invalidSummary.setAttribute('role', 'button');
    
    await handleClick(event, invalidSummary);
    
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
  });

  test('handleClick does not copy when line number cannot be extracted', async () => {
    const { event } = createMockClickEvent();
    const button = createCopyButton();
    event.currentTarget = button;
    
    // Summary with file path but no diff table
    const container = document.createElement('div');
    container.innerHTML = `
      <summary role="button">
        <a class="Link--primary text-mono text-small" href="#">src/MyClass.java</a>
        <span class="flex-auto"></span>
      </summary>
    `;
    const summary = container.querySelector('summary');
    
    await handleClick(event, summary);
    
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
  });
});

/**
 * Integration test using real GitHub PR comment HTML
 * 
 * This test validates the extension works correctly against actual GitHub DOM structure
 * captured from a real PR review comment.
 */
describe('Real-world GitHub PR Comment Integration', () => {
  // Real HTML from GitHub PR comment (UserService.java review)
  const REAL_GITHUB_PR_COMMENT_HTML = `
<turbo-frame id="review-thread-or-comment-id-2011660696" target="_top">
    <details-collapsible>
      <details-toggle data-catalyst="">
    <details data-resolved="false" data-target="details-collapsible.detailsElement details-toggle.detailsTarget" data-view-component="true" class="review-thread-component js-comment-container js-resolvable-timeline-thread-container Details-element details-reset mb-3 border rounded-2" open="">
      <summary role="button" data-target="details-collapsible.summaryElement details-toggle.summaryTarget" data-action="click:details-collapsible#toggle click:details-toggle#toggle" data-aria-label-closed="Expand comment thread" data-aria-label-open="Collapse comment thread" aria-expanded="true" aria-label="Collapse comment thread" data-view-component="true" class="py-2 px-3 rounded-2 color-bg-subtle">
        <div class="d-flex flex-items-center">
          <span class="flex-auto tmp-mr-3 d-flex flex-items-center">
            <a href="/example-org/example-repo/pull/123/files/abc123#diff-xyz" class="text-mono text-small Link--primary wb-break-all mr-2">...rc/main/java/com/example/services/UserService.java</a>
          </span>
        </div>
      </summary>
      <div data-view-component="true">
        <div class="blob-wrapper border-bottom">
          <deferred-diff-lines class="" data-url="/example-org/example-repo/pull/123/review_thread_syntax_highlighted_diff_lines" data-catalyst="">
            <input type="hidden" name="pull_request_review_thread_id" value="2011660696" data-targets="deferred-diff-lines.inputs" autocomplete="off">
            <table class="diff-table tab-size js-diff-table" data-tab-size="4" data-paste-markdown-skip="">
              <tbody>
                <tr>
                  <td data-line-number="40" class="blob-num blob-num-context"></td>
                  <td data-line-number="40" class="blob-num blob-num-context"></td>
                  <td class="blob-code blob-code-context">
                    <span class="blob-code-inner blob-code-marker-context">    }</span>
                  </td>
                </tr>
                <tr>
                  <td data-line-number="41" class="blob-num blob-num-context"></td>
                  <td data-line-number="41" class="blob-num blob-num-context"></td>
                  <td class="blob-code blob-code-context">
                    <span class="blob-code-inner blob-code-marker-context"><br></span>
                  </td>
                </tr>
                <tr>
                  <td data-line-number="42" class="blob-num blob-num-deletion"></td>
                  <td class="blob-num blob-num-deletion empty-cell"></td>
                  <td class="blob-code blob-code-deletion">
                    <span class="blob-code-inner blob-code-marker-deletion">    public User findById(Long id) {</span>
                  </td>
                </tr>
                <tr>
                  <td class="blob-num blob-num-addition empty-cell"></td>
                  <td data-line-number="42" class="blob-num blob-num-addition"></td>
                  <td class="blob-code blob-code-addition">
                    <span class="blob-code-inner blob-code-marker-addition">    public User findById(Long id<span class="x x-first x-last">, boolean includeDeleted</span>) {</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </deferred-diff-lines>
        </div>
      </div>
    </details>
      </details-toggle>
    </details-collapsible>
</turbo-frame>
  `;

  let container;

  beforeEach(() => {
    // Disconnect the MutationObserver to prevent automatic button injection
    // when we append the container to the document body
    const { disconnectObserver } = require('./content');
    disconnectObserver();
    
    container = document.createElement('div');
    container.innerHTML = REAL_GITHUB_PR_COMMENT_HTML;
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  test('extractFilename correctly extracts filename from real GitHub DOM', () => {
    const { extractFilename } = require('./content');
    
    const summaryElement = container.querySelector('summary[role="button"]');
    expect(summaryElement).not.toBeNull();
    
    const filename = extractFilename(summaryElement);
    
    // The file path in the HTML is:
    // ...rc/main/java/com/example/services/UserService.java
    // extractFilename should return the last segment
    expect(filename).toBe('UserService.java');
  });

  test('extractLineNumber correctly extracts line number from real GitHub DOM', () => {
    const { extractLineNumber } = require('./content');
    
    // The comment block is the details element containing the diff table
    const commentBlock = container.querySelector('details.review-thread-component');
    expect(commentBlock).not.toBeNull();
    
    const lineNumber = extractLineNumber(commentBlock);
    
    // The diff table has addition line number 42 (the highest addition line)
    expect(lineNumber).toBe(42);
  });

  test('formatReference produces correct IntelliJ-compatible format', () => {
    const { formatReference } = require('./content');
    
    const reference = formatReference('UserService.java', 42);
    
    expect(reference).toBe('UserService.java:42');
  });

  test('injectButtons adds copy button to real GitHub DOM structure', () => {
    const { injectButtons, hasButton, SELECTORS } = require('./content');
    
    // Verify the flex-auto container exists
    const flexAutoSpan = container.querySelector('span.flex-auto');
    expect(flexAutoSpan).not.toBeNull();
    
    // Get the d-flex container (parent of flex-auto)
    const dFlexContainer = flexAutoSpan.parentElement;
    expect(dFlexContainer).not.toBeNull();
    
    // Initially no button
    expect(hasButton(dFlexContainer)).toBe(false);
    
    // Inject buttons
    injectButtons(container);
    
    // Now button should exist in the d-flex container
    expect(hasButton(dFlexContainer)).toBe(true);
    
    // Verify button has correct class and is a sibling of flex-auto span
    const button = dFlexContainer.querySelector('.gh-pr-copy-btn');
    expect(button).not.toBeNull();
    expect(button.tagName).toBe('BUTTON');
    expect(flexAutoSpan.nextElementSibling).toBe(button);
  });

  test('full end-to-end flow: inject button, click, and verify reference format', async () => {
    const { injectButtons, handleClick, extractFilename, extractLineNumber, formatReference } = require('./content');
    
    // Setup clipboard mock
    const clipboardWriteText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: clipboardWriteText },
      writable: true,
      configurable: true
    });
    
    // Inject buttons
    injectButtons(container);
    
    // Find the injected button
    const button = container.querySelector('.gh-pr-copy-btn');
    expect(button).not.toBeNull();
    
    // Find the summary element (parent context for the button)
    const summaryElement = container.querySelector('summary[role="button"]');
    expect(summaryElement).not.toBeNull();
    
    // Create a mock click event with currentTarget (used by handleClick to get button)
    const event = {
      stopPropagation: jest.fn(),
      preventDefault: jest.fn(),
      target: button,
      currentTarget: button  // handleClick uses event.currentTarget to get the button
    };
    
    // Trigger the click handler
    await handleClick(event, summaryElement);
    
    // Verify event propagation was stopped
    expect(event.stopPropagation).toHaveBeenCalled();
    expect(event.preventDefault).toHaveBeenCalled();
    
    // Verify clipboard was called with correct format
    expect(clipboardWriteText).toHaveBeenCalledWith('UserService.java:42');
  });

  test('button injection is idempotent on real GitHub DOM', () => {
    const { injectButtons, SELECTORS } = require('./content');
    
    // Inject multiple times
    injectButtons(container);
    injectButtons(container);
    injectButtons(container);
    
    // Should still have exactly one button
    const buttons = container.querySelectorAll('.gh-pr-copy-btn');
    expect(buttons.length).toBe(1);
  });

  test('handles GitHub DOM with truncated file path (ellipsis prefix)', () => {
    const { extractFilename } = require('./content');
    
    const summaryElement = container.querySelector('summary[role="button"]');
    const filePathLink = summaryElement.querySelector('a.Link--primary.text-mono.text-small');
    
    // The real GitHub DOM shows truncated path with "..." prefix
    // e.g., "...rc/main/java/com/example/services/UserService.java"
    const displayedPath = filePathLink.textContent;
    expect(displayedPath).toContain('...');
    
    // extractFilename should still correctly extract the filename
    const filename = extractFilename(summaryElement);
    expect(filename).toBe('UserService.java');
  });

  test('correctly identifies addition vs deletion line numbers', () => {
    const { extractLineNumber } = require('./content');
    
    const commentBlock = container.querySelector('details.review-thread-component');
    
    // The diff table has:
    // - Context lines: 40, 41 (left) / 40, 41 (right)
    // - Deletion line: 42 (left only)
    // - Addition line: 42 (right only)
    // extractLineNumber should return the highest ADDITION line number (42)
    const lineNumber = extractLineNumber(commentBlock);
    expect(lineNumber).toBe(42);
  });

  test('handles real GitHub DOM selectors correctly', () => {
    const { SELECTORS } = require('./content');
    
    // Verify all expected selectors match elements in real GitHub DOM
    const summaryElement = container.querySelector(SELECTORS.filePathSummary);
    expect(summaryElement).not.toBeNull();
    
    const filePathLink = container.querySelector(SELECTORS.filePathLink);
    expect(filePathLink).not.toBeNull();
    
    const buttonContainer = container.querySelector(SELECTORS.buttonContainer);
    expect(buttonContainer).not.toBeNull();
    
    const diffTable = container.querySelector(SELECTORS.diffTable);
    expect(diffTable).not.toBeNull();
    
    // Line number cells - should find addition cells
    const lineNumberCells = container.querySelectorAll(SELECTORS.lineNumberCell);
    expect(lineNumberCells.length).toBeGreaterThan(0);
  });
});
