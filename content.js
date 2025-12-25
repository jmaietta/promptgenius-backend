// PromptGenius - AI-Powered Prompt Optimizer
// Version 1.3.0 - Multi-version output

class PromptGenius {
  constructor() {
    this.panel = null;
    this.isOpen = false;
    this.platform = null;
    this.currentVersions = null;
    this.selectedVersion = 'structured';
    this.init();
  }

  init() {
    console.log('PromptGenius: Initializing...');
    this.detectPlatform();
    this.createFloatingButton();
    this.createPanel();
    this.setupEvents();
    this.setupKeyboardShortcut();
  }

  detectPlatform() {
    const hostname = window.location.hostname;

    const platforms = {
      'claude.ai': {
        name: 'claude',
        selector: 'div[contenteditable="true"].ProseMirror, div[contenteditable="true"]'
      },
      'chatgpt.com': {
        name: 'chatgpt',
        selector: '#prompt-textarea, div[id="prompt-textarea"], textarea[data-id="root"], div[contenteditable="true"][data-placeholder]'
      },
      'chat.openai.com': {
        name: 'chatgpt',
        selector: '#prompt-textarea, div[id="prompt-textarea"], textarea[data-id="root"], div[contenteditable="true"][data-placeholder]'
      },
      'gemini.google.com': {
        name: 'gemini',
        selector: 'rich-textarea div[contenteditable="true"], div[contenteditable="true"]'
      },
      'copilot.microsoft.com': {
        name: 'copilot',
        selector: 'textarea, div[contenteditable="true"]'
      }
    };

    for (const [domain, config] of Object.entries(platforms)) {
      if (hostname.includes(domain)) {
        this.platform = config.name;
        this.chatSelector = config.selector;
        return;
      }
    }

    this.platform = 'unknown';
    this.chatSelector = 'textarea, div[contenteditable="true"]';
  }

  createFloatingButton() {
    const existing = document.getElementById('promptgenius-btn');
    if (existing) existing.remove();

    const button = document.createElement('button');
    button.id = 'promptgenius-btn';
    button.innerHTML = `
      <img src="${chrome.runtime.getURL('icon48.png')}" width="18" height="18" style="margin-right: 8px;">
      PromptGenius
    `;
    button.title = 'Open PromptGenius (Ctrl+Shift+P)';
    button.style.cssText = `
      position: fixed !important;
      top: 20px !important;
      right: 20px !important;
      z-index: 999999 !important;
      background: #1a1a2e !important;
      color: #e2e8f0 !important;
      border: 1px solid #374151 !important;
      padding: 10px 16px !important;
      border-radius: 6px !important;
      font-weight: 500 !important;
      cursor: pointer !important;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15) !important;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important;
      font-size: 13px !important;
      display: flex !important;
      align-items: center !important;
      transition: all 0.2s ease !important;
    `;

    button.addEventListener('mouseenter', () => {
      button.style.background = '#252542';
      button.style.borderColor = '#4f46e5';
    });

    button.addEventListener('mouseleave', () => {
      button.style.background = '#1a1a2e';
      button.style.borderColor = '#374151';
    });

    button.addEventListener('click', () => this.togglePanel());
    document.body.appendChild(button);
  }

  createPanel() {
    const existing = document.getElementById('promptgenius-panel');
    if (existing) existing.remove();

    this.panel = document.createElement('div');
    this.panel.id = 'promptgenius-panel';
    this.panel.innerHTML = `
      <div class="pg-header">
        <div class="pg-header-left">
          <img src="${chrome.runtime.getURL('icon48.png')}" width="20" height="20" style="margin-right: 2px;">
          <span class="pg-title">PromptGenius</span>
        </div>
        <div class="pg-header-right">
          <span class="pg-shortcut">Ctrl+Shift+P</span>
          <button class="pg-close" title="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      </div>
      
      <div class="pg-content">
        <div class="pg-section">
          <div class="pg-section-header">
            <label class="pg-label">Input Prompt</label>
            <button id="pg-grab" class="pg-text-btn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
              Grab from chat
            </button>
          </div>
          <textarea id="pg-input" placeholder="Enter your prompt here..."></textarea>
          <button id="pg-optimize" class="pg-btn pg-btn-primary">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="pg-btn-icon">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
            </svg>
            <span class="pg-btn-text">Optimize Prompt</span>
          </button>
        </div>
        
        <div class="pg-divider"></div>
        
        <div class="pg-section">
          <label class="pg-label">Optimized Versions</label>
          <div id="pg-status" class="pg-status" style="display: none;"></div>
          
          <div id="pg-versions" class="pg-versions" style="display: none;">
            <div class="pg-version-tabs">
              <button class="pg-tab active" data-version="structured">
                <span class="pg-tab-title">Structured</span>
                <span class="pg-tab-desc">Step-by-step</span>
              </button>
              <button class="pg-tab" data-version="detailed">
                <span class="pg-tab-title">Detailed</span>
                <span class="pg-tab-desc">Expert context</span>
              </button>
              <button class="pg-tab" data-version="concise">
                <span class="pg-tab-title">Concise</span>
                <span class="pg-tab-desc">Brief &amp; clear</span>
              </button>
            </div>
            <textarea id="pg-output" readonly></textarea>
          </div>
          
          <div id="pg-placeholder" class="pg-placeholder">
            Click "Optimize Prompt" to generate three optimized versions
          </div>
          
          <button id="pg-apply" class="pg-btn pg-btn-secondary" style="display: none;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="pg-btn-icon">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            <span class="pg-btn-text">Apply to Chat</span>
          </button>
        </div>
      </div>
      
      <div class="pg-footer">
        <a href="https://tek2dayholdings.com/" target="_blank" rel="noopener">TEK2day Holdings</a>
      </div>
    `;

    this.panel.style.cssText = `
      position: fixed;
      top: 60px;
      right: 20px;
      width: 440px;
      max-height: calc(100vh - 80px);
      background: #0f0f1a;
      border: 1px solid #1e1e3a;
      border-radius: 8px;
      box-shadow: 0 20px 50px rgba(0,0,0,0.4);
      z-index: 999998;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      color: #e2e8f0;
      display: none;
      overflow: hidden;
    `;

    const style = document.createElement('style');
    style.id = 'promptgenius-styles';
    style.textContent = `
      #promptgenius-panel * {
        box-sizing: border-box;
      }
      
      #promptgenius-panel .pg-header {
        background: #1a1a2e;
        padding: 14px 16px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 1px solid #1e1e3a;
      }
      
      #promptgenius-panel .pg-header-left {
        display: flex;
        align-items: center;
        gap: 10px;
        color: #e2e8f0;
      }
      
      #promptgenius-panel .pg-title {
        font-size: 15px;
        font-weight: 600;
        letter-spacing: -0.01em;
      }
      
      #promptgenius-panel .pg-header-right {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      
      #promptgenius-panel .pg-shortcut {
        font-size: 11px;
        color: #6b7280;
        background: #1e1e3a;
        padding: 4px 8px;
        border-radius: 4px;
        font-family: 'SF Mono', Monaco, monospace;
      }
      
      #promptgenius-panel .pg-close {
        background: none;
        border: none;
        color: #6b7280;
        cursor: pointer;
        padding: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 4px;
        transition: all 0.15s ease;
      }
      
      #promptgenius-panel .pg-close:hover {
        background: #252542;
        color: #e2e8f0;
      }
      
      #promptgenius-panel .pg-content {
        padding: 20px;
        overflow-y: auto;
        max-height: calc(100vh - 200px);
      }
      
      #promptgenius-panel .pg-section {
        margin-bottom: 0;
      }
      
      #promptgenius-panel .pg-section-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 10px;
      }
      
      #promptgenius-panel .pg-label {
        font-size: 12px;
        font-weight: 500;
        color: #9ca3af;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        display: block;
        margin-bottom: 10px;
      }
      
      #promptgenius-panel .pg-section-header .pg-label {
        margin-bottom: 0;
      }
      
      #promptgenius-panel .pg-text-btn {
        background: none;
        border: none;
        color: #6366f1;
        font-size: 12px;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 4px 8px;
        border-radius: 4px;
        transition: all 0.15s ease;
      }
      
      #promptgenius-panel .pg-text-btn:hover {
        background: #1e1e3a;
        color: #818cf8;
      }
      
      #promptgenius-panel #pg-input {
        width: 100%;
        min-height: 100px;
        padding: 12px 14px;
        border: 1px solid #1e1e3a;
        border-radius: 6px;
        background: #0a0a14;
        color: #e2e8f0;
        font-family: inherit;
        font-size: 14px;
        line-height: 1.6;
        resize: vertical;
        outline: none;
        transition: border-color 0.15s ease;
      }
      
      #promptgenius-panel #pg-input:focus {
        border-color: #4f46e5;
      }
      
      #promptgenius-panel #pg-input::placeholder {
        color: #4b5563;
      }
      
      #promptgenius-panel .pg-divider {
        height: 1px;
        background: #1e1e3a;
        margin: 20px 0;
      }
      
      #promptgenius-panel .pg-placeholder {
        color: #4b5563;
        font-size: 13px;
        text-align: center;
        padding: 30px 20px;
        border: 1px dashed #1e1e3a;
        border-radius: 6px;
        background: #0a0a14;
      }
      
      #promptgenius-panel .pg-versions {
        margin-bottom: 12px;
      }
      
      #promptgenius-panel .pg-version-tabs {
        display: flex;
        gap: 8px;
        margin-bottom: 12px;
      }
      
      #promptgenius-panel .pg-tab {
        flex: 1;
        background: #0a0a14;
        border: 1px solid #1e1e3a;
        border-radius: 6px;
        padding: 10px 8px;
        cursor: pointer;
        transition: all 0.15s ease;
        text-align: center;
      }
      
      #promptgenius-panel .pg-tab:hover {
        background: #1a1a2e;
        border-color: #2d2d52;
      }
      
      #promptgenius-panel .pg-tab.active {
        background: #1e1e3a;
        border-color: #4f46e5;
      }
      
      #promptgenius-panel .pg-tab-title {
        display: block;
        font-size: 12px;
        font-weight: 600;
        color: #e2e8f0;
        margin-bottom: 2px;
      }
      
      #promptgenius-panel .pg-tab-desc {
        display: block;
        font-size: 10px;
        color: #6b7280;
      }
      
      #promptgenius-panel .pg-tab.active .pg-tab-title {
        color: #818cf8;
      }
      
      #promptgenius-panel #pg-output {
        width: 100%;
        min-height: 140px;
        padding: 12px 14px;
        border: 1px solid #1e1e3a;
        border-radius: 6px;
        background: #0a0a14;
        color: #e2e8f0;
        font-family: inherit;
        font-size: 14px;
        line-height: 1.6;
        resize: vertical;
        outline: none;
      }
      
      #promptgenius-panel .pg-btn {
        width: 100%;
        padding: 12px 16px;
        border: none;
        border-radius: 6px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        margin-top: 12px;
        transition: all 0.15s ease;
      }
      
      #promptgenius-panel .pg-btn-icon {
        flex-shrink: 0;
      }
      
      #promptgenius-panel .pg-btn-primary {
        background: #4f46e5;
        color: white;
      }
      
      #promptgenius-panel .pg-btn-primary:hover:not(:disabled) {
        background: #4338ca;
      }
      
      #promptgenius-panel .pg-btn-secondary {
        background: #1e1e3a;
        color: #e2e8f0;
        border: 1px solid #2d2d52;
      }
      
      #promptgenius-panel .pg-btn-secondary:hover:not(:disabled) {
        background: #252542;
        border-color: #3d3d6a;
      }
      
      #promptgenius-panel .pg-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      
      #promptgenius-panel .pg-status {
        padding: 10px 12px;
        border-radius: 6px;
        margin-bottom: 12px;
        font-size: 13px;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      
      #promptgenius-panel .pg-status.loading {
        background: #1e1e3a;
        color: #818cf8;
        border: 1px solid #2d2d52;
      }
      
      #promptgenius-panel .pg-status.success {
        background: #052e16;
        color: #4ade80;
        border: 1px solid #14532d;
      }
      
      #promptgenius-panel .pg-status.error {
        background: #2c0a0a;
        color: #f87171;
        border: 1px solid #450a0a;
      }
      
      #promptgenius-panel .pg-status.fallback {
        background: #1c1a05;
        color: #fbbf24;
        border: 1px solid #3d3405;
      }
      
      #promptgenius-panel .pg-footer {
        padding: 12px 16px;
        text-align: center;
        border-top: 1px solid #1e1e3a;
        background: #0a0a14;
      }
      
      #promptgenius-panel .pg-footer a {
        color: #6b7280;
        text-decoration: none;
        font-size: 11px;
        transition: color 0.15s ease;
      }
      
      #promptgenius-panel .pg-footer a:hover {
        color: #9ca3af;
      }
      
      @keyframes pg-spin {
        to { transform: rotate(360deg); }
      }
      
      #promptgenius-panel .pg-spinner {
        width: 14px;
        height: 14px;
        border: 2px solid #4f46e5;
        border-top-color: transparent;
        border-radius: 50%;
        animation: pg-spin 0.8s linear infinite;
      }
    `;

    const oldStyle = document.getElementById('promptgenius-styles');
    if (oldStyle) oldStyle.remove();

    document.head.appendChild(style);
    document.body.appendChild(this.panel);
  }

  setupEvents() {
    this.panel.querySelector('.pg-close').addEventListener('click', () => {
      this.closePanel();
    });

    document.getElementById('pg-grab').addEventListener('click', () => {
      this.grabFromChat();
    });

    document.getElementById('pg-optimize').addEventListener('click', () => {
      this.optimizeWithAI();
    });

    document.getElementById('pg-apply').addEventListener('click', () => {
      this.applyToChat();
    });

    // Tab switching
    this.panel.querySelectorAll('.pg-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        this.selectVersion(tab.dataset.version);
      });
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) {
        this.closePanel();
      }
    });
  }

  setupKeyboardShortcut() {
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        this.togglePanel();
      }
    });
  }

  selectVersion(version) {
    this.selectedVersion = version;
    
    // Update tabs
    this.panel.querySelectorAll('.pg-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.version === version);
    });
    
    // Update output
    if (this.currentVersions && this.currentVersions[version]) {
      document.getElementById('pg-output').value = this.currentVersions[version];
    }
  }

  togglePanel() {
    if (this.isOpen) {
      this.closePanel();
    } else {
      this.openPanel();
    }
  }

  openPanel() {
    this.panel.style.display = 'block';
    this.isOpen = true;
    const btn = document.getElementById('promptgenius-btn');
    if (btn) btn.style.display = 'none';
    setTimeout(() => {
      document.getElementById('pg-input').focus();
    }, 100);
  }

  closePanel() {
    this.panel.style.display = 'none';
    this.isOpen = false;
    const btn = document.getElementById('promptgenius-btn');
    if (btn) btn.style.display = 'flex';
  }

  grabFromChat() {
    const chatInput = this.findChatInput();
    if (chatInput) {
      const text = chatInput.value || chatInput.textContent || chatInput.innerText || '';
      if (text.trim()) {
        document.getElementById('pg-input').value = text.trim();
        this.showStatus('Text imported from chat', 'success');
      } else {
        this.showStatus('Chat input is empty', 'error');
      }
    } else {
      this.showStatus('Could not locate chat input', 'error');
    }
  }

  findChatInput() {
    const selectors = this.chatSelector.split(', ');
    for (const selector of selectors) {
      const element = document.querySelector(selector.trim());
      if (element) return element;
    }
    return null;
  }

  showStatus(message, type = 'info') {
    const status = document.getElementById('pg-status');
    status.innerHTML = type === 'loading'
      ? `<div class="pg-spinner"></div><span>${message}</span>`
      : `<span>${message}</span>`;
    status.className = `pg-status ${type}`;
    status.style.display = 'flex';

    if (type !== 'loading') {
      setTimeout(() => {
        status.style.display = 'none';
      }, 3000);
    }
  }

  hideStatus() {
    document.getElementById('pg-status').style.display = 'none';
  }

  async optimizeWithAI() {
    const input = document.getElementById('pg-input');
    const optimizeBtn = document.getElementById('pg-optimize');
    const versionsContainer = document.getElementById('pg-versions');
    const placeholder = document.getElementById('pg-placeholder');
    const applyBtn = document.getElementById('pg-apply');

    const prompt = input.value.trim();

    if (!prompt) {
      this.showStatus('Please enter a prompt', 'error');
      return;
    }

    if (prompt.length < 3) {
      this.showStatus('Prompt is too short', 'error');
      return;
    }

    // Reset UI
    optimizeBtn.disabled = true;
    optimizeBtn.innerHTML = `<div class="pg-spinner"></div><span class="pg-btn-text">Optimizing...</span>`;
    this.showStatus('Generating three optimized versions...', 'loading');
    versionsContainer.style.display = 'none';
    placeholder.style.display = 'block';
    applyBtn.style.display = 'none';

    try {
      const result = await this.callBackendWithTimeout(prompt, 30000);

      if (result.versions) {
        this.currentVersions = result.versions;
        this.selectedVersion = 'structured';
        
        // Show versions UI
        placeholder.style.display = 'none';
        versionsContainer.style.display = 'block';
        applyBtn.style.display = 'flex';
        
        // Reset tabs and show structured version
        this.panel.querySelectorAll('.pg-tab').forEach(tab => {
          tab.classList.toggle('active', tab.dataset.version === 'structured');
        });
        document.getElementById('pg-output').value = this.currentVersions.structured;
        
        this.showStatus('Three versions generated', 'success');
      } else {
        throw new Error('Invalid response format');
      }
    } catch (error) {
      console.error('PromptGenius: Backend error:', error);
      
      // Fallback to local optimization
      const enhanced = this.localOptimize(prompt);
      this.currentVersions = {
        structured: enhanced,
        detailed: enhanced,
        concise: enhanced
      };
      
      placeholder.style.display = 'none';
      versionsContainer.style.display = 'block';
      applyBtn.style.display = 'flex';
      document.getElementById('pg-output').value = enhanced;
      
      this.showStatus('Using offline optimization', 'fallback');
    } finally {
      optimizeBtn.disabled = false;
      optimizeBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="pg-btn-icon">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
        </svg>
        <span class="pg-btn-text">Optimize Prompt</span>
      `;
    }
  }

  callBackendWithTimeout(prompt, timeoutMs) {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Request timed out'));
      }, timeoutMs);

      chrome.runtime.sendMessage(
        { action: 'optimizePrompt', prompt: prompt },
        (response) => {
          clearTimeout(timeoutId);

          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }

          if (response && response.success) {
            resolve(response);
          } else {
            reject(new Error(response?.error || 'Unknown error'));
          }
        }
      );
    });
  }

  localOptimize(prompt) {
    let optimized = prompt;

    const spellingFixes = {
      'recieve': 'receive', 'seperate': 'separate', 'definately': 'definitely',
      'occured': 'occurred', 'begining': 'beginning', 'thier': 'their',
      'freind': 'friend', 'wierd': 'weird', 'neccessary': 'necessary',
      'accomodate': 'accommodate', 'embarass': 'embarrass', 'priviledge': 'privilege'
    };

    for (const [wrong, right] of Object.entries(spellingFixes)) {
      const regex = new RegExp(`\\b${wrong}\\b`, 'gi');
      optimized = optimized.replace(regex, right);
    }

    if (optimized.length > 0 && /^[a-z]/.test(optimized)) {
      optimized = optimized.charAt(0).toUpperCase() + optimized.slice(1);
    }

    return optimized;
  }

  applyToChat() {
    const output = document.getElementById('pg-output');
    const optimized = output.value.trim();

    if (!optimized) {
      this.showStatus('No optimized prompt to apply', 'error');
      return;
    }

    const chatInput = this.findChatInput();
    if (!chatInput) {
      this.showStatus('Could not locate chat input', 'error');
      return;
    }

    try {
      if (chatInput.tagName === 'TEXTAREA' || chatInput.tagName === 'INPUT') {
        chatInput.value = optimized;
        chatInput.dispatchEvent(new Event('input', { bubbles: true }));
      } else if (chatInput.contentEditable === 'true') {
        chatInput.focus();
        chatInput.textContent = optimized;
        chatInput.dispatchEvent(new Event('input', { bubbles: true }));
        chatInput.dispatchEvent(new Event('change', { bubbles: true }));
        chatInput.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));
        chatInput.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
      }

      this.showNotification('Prompt applied successfully');
      this.closePanel();
    } catch (error) {
      console.error('PromptGenius: Apply error:', error);
      this.showStatus('Failed to apply - try copying manually', 'error');
    }
  }

  showNotification(message) {
    const existing = document.querySelector('.pg-notification');
    if (existing) existing.remove();

    const notification = document.createElement('div');
    notification.className = 'pg-notification';
    notification.textContent = message;
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #1a1a2e;
      color: #4ade80;
      padding: 12px 20px;
      border-radius: 6px;
      border: 1px solid #14532d;
      z-index: 1000000;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-weight: 500;
      font-size: 13px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.3);
    `;

    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
  }
}

function initPromptGenius() {
  setTimeout(() => {
    new PromptGenius();
  }, 500);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPromptGenius);
} else {
  initPromptGenius();
}
