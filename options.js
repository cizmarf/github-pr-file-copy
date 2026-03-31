// Options page script for GitHub PR File Copy extension

const projectRootInput = document.getElementById('projectRoot');
const saveButton = document.getElementById('save');
const statusDiv = document.getElementById('status');

// Load saved settings
chrome.storage.sync.get(['projectRoot'], (result) => {
  if (result.projectRoot) {
    projectRootInput.value = result.projectRoot;
  }
});

// Save settings
saveButton.addEventListener('click', () => {
  const projectRoot = projectRootInput.value.trim();
  
  // Remove trailing slash if present
  const normalizedPath = projectRoot.replace(/\/+$/, '');
  
  chrome.storage.sync.set({ projectRoot: normalizedPath }, () => {
    if (chrome.runtime.lastError) {
      statusDiv.textContent = 'Error saving settings: ' + chrome.runtime.lastError.message;
      statusDiv.className = 'status error';
    } else {
      statusDiv.textContent = 'Settings saved!';
      statusDiv.className = 'status success';
      
      // Update input with normalized path
      projectRootInput.value = normalizedPath;
      
      // Hide status after 2 seconds
      setTimeout(() => {
        statusDiv.className = 'status';
      }, 2000);
    }
  });
});

// Save on Enter key
projectRootInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    saveButton.click();
  }
});
