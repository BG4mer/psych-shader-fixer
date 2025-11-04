/* script.js
   GODLIKE Shader Fixer — universal interaction layer
   - auto-detects UI elements (creates safe fallbacks)
   - GSAP (dynamically loaded) for animations (falls back to CSS transforms)
   - shader fixer + fix-with-logs
   - interactive WebGL preview
   - comment system (online-ready via Firebase if FIREBASE_CONFIG present)
   - exposes window.GODFIX_UI
*/

// --------------------------- Boot / Utils ---------------------------
(() => {
  'use strict';

  // Helper: create element with attrs
  const $ = (tag, attrs = {}, parent = null) => {
    const el = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'html') el.innerHTML = v;
      else el.setAttribute(k, v);
    });
    if (parent) parent.appendChild(el);
    return el;
  };

  // Load GSAP dynamically (returns promise)
  function loadGSAP() {
    if (window.gsap) return Promise.resolve(window.gsap);
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/gsap.min.js';
      s.onload = () => resolve(window.gsap);
      s.onerror = () => reject(new Error('GSAP load failed'));
      document.head.appendChild(s);
    });
  }

  // Safe query with fallback
  function q(idOrSel) {
    return document.querySelector(idOrSel);
  }

  // Ensure an element exists by id; create fallback if not
  function ensureElement(id, createOptions = {}) {
    let el = document.getElementById(id);
    if (el) return el;
    // create fallback (panel) and append to body bottom
    const wrapper = document.body || document.documentElement;
    const panel = $('div', { id: id, class: createOptions.class || 'godfix-fallback' }, wrapper);
    if (createOptions.html) panel.innerHTML = createOptions.html;
    return panel;
  }

  // Small safe-escape for HTML insertion
  function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  // --------------------------- Bindings: find or create key UI nodes ---------------------------
  // Common ids used in the index.html earlier; we attempt to wire into them if present.
  const ids = {
    fileIn: '#fileIn',
    code: '#code',
    fixBtn: '#fixBtn',
    previewBtn: '#previewBtn',
    runPreview: '#runPreview',
    stopPreview: '#stopPreview',
    downloadBtn: '#downloadBtn',
    injectBtn: '#injectBtn',
    mainLog: '#mainLog',
    compileLog: '#compileLog',
    logsInput: '#logsInput',
    applyLogsBtn: '#applyLogsBtn',
    applyLogFixBtn: '#applyLogFixBtn',
    copyLogsForFix: '#copyLogsForFix',
    pasteLogsToFix: '#pasteLogsToFix',
    copyCompileLog: '#copyLog',
    clearCompileLog: '#clearMainLog',
    glcanvas: '#glcanvas',
    confettiCanvas: '#confettiCanvas',
    commentNick: '#nick',
    commentEmail: '#email',
    commentText: '#commentText',
    postComment: '#postComment',
    commentList: '#commentList',
    connectDemo: '#connectDemo',
  };

  // resolved elements map
  const el = {};

  // ensure nodes (create minimal fallbacks when missing)
  Object.entries(ids).forEach(([key, sel]) => {
    let found = document.querySelector(sel);
    if (!found) {
      // create fallback with minimal usable structure in a floating panel at the end
      const fallbackHTML = {
        fileIn: '<label class="btn">Upload Shader <input id="fileIn" type="file" accept=".frag,.hx,.glsl,.txt" style="display:none"></label>',
        code: '<div id="code" contenteditable="true" class="codeArea" style="min-height:200px;font-family:monospace;padding:10px;">// paste shader here</div>',
        fixBtn: '<button id="fixBtn" class="btn">AUTO-FIX</button>',
        previewBtn: '<button id="previewBtn" class="btn ghost">Preview</button>',
        glcanvas: '<canvas id="glcanvas" width="640" height="360" style="border-radius:8px;background:#000"></canvas>',
        mainLog: '<div id="mainLog" class="log" style="min-height:80px;">logs...</div>',
        compileLog: '<div id="compileLog" class="log" style="min-height:80px;">compile logs...</div>',
        logsInput: '<textarea id="logsInput" placeholder="Paste logs to fix..." style="min-height:100px;width:100%"></textarea>',
        applyLogsBtn: '<button id="applyLogsBtn" class="btn">Apply fixes</button>',
        applyLogFixBtn: '<button id="applyLogFixBtn" class="btn ghost">Fix it with Logs</button>',
        copyLogsForFix: '<button id="copyLogsForFix" class="btn ghost">Copy logs</button>',
        pasteLogsToFix: '<button id="pasteLogsToFix" class="btn">Paste logs → Fix</button>',
        copyCompileLog: '<button id="copyLog" class="btn ghost">Copy compile log</button>',
        clearCompileLog: '<button id="clearMainLog" class="btn ghost">Clear compile log</button>',
        downloadBtn: '<button id="downloadBtn" class="btn" style="display:none">Download Fixed</button>',
        injectBtn: '<button id="injectBtn" class="btn ghost">Inject Example</button>',
        runPreview: '<button id="runPreview" class="btn ghost">Compile & Run</button>',
        stopPreview: '<button id="stopPreview" class="btn ghost">Stop</button>',
        confettiCanvas: '<canvas id="confettiCanvas" class="confetti" style="position:fixed;left:0;top:0;pointer-events:none;"></canvas>',
        commentNick: '<input id="nick" placeholder="nickname" />',
        commentEmail: '<input id="email" placeholder="email" />',
        commentText: '<textarea id="commentText" placeholder="comment"></textarea>',
        postComment: '<button id="postComment" class="btn">Post Comment</button>',
        commentList: '<div id="commentList" style="min-height:150px" class="commentList"></div>',
        connectDemo: '<button id="connectDemo" class="btn ghost">Enable Demo Mode</button>'
      }[key] || `<div id="${sel.replace('#','')}" class="godfix-fallback">${sel}</div>`;

      const container = document.createElement('div');
      container.style.position = 'fixed';
      container.style.right = '18px';
      container.style.bottom = (20 + (Object.keys(el).length * 10)) + 'px';
      container.style.zIndex = '99999';
      container.style.maxWidth = '360px';
      container.innerHTML = fallbackHTML;
      document.body.appendChild(container);
      found = container.querySelector(sel) || container.querySelector('*');
    }
    el[key] = found;
  });

  // important ones: code & logs
  el.code = el.code || ensureElement('code', { html: '<div id="code" contenteditable="true" class="codeArea">// shader here</div>' });

  // convenience: if code is a contentEditable div, ensure it has monospace style
  if (el.code && el.code.contentEditable !== 'true') {
    // if it's a container (from fallback) get the inner code element
    if (el.code.querySelector && el.code.querySelector('[contenteditable="true"]')) {
      el.code = el.code.querySelector('[contenteditable="true"]');
    }
  }

  // --------------------------- Basic UI animations (GSAP if available) ---------------------------
  let gsapAvailable = false;
  loadGSAP().then(gsap => {
    gsapAvailable = true;
    // simple entrance animation for all buttons/fallbacks that were auto-created or exist
    const btns = Array.from(document.querySelectorAll('button, .btn')).filter(b => b.offsetParent !== null);
    gsap.from(btns, { scale: 0.96, opacity: 0, duration: 0.45, stagger: 0.03, ease: "power2.out" });
    // subtle background pulse
    gsap.to('body', { '--ui-scale': 1.00, duration: 6, repeat: -1, yoyo: true, ease: 'sine.inOut' });
  }).catch(() => {
    // fallback: small CSS pulse for available buttons
    document.querySelectorAll('button, .btn').forEach(b => {
      b.style.transition = 'transform .12s ease, box-shadow .12s ease';
    });
  });

  // small helper to animate a button on click (ripple + scale)
  function animateButtonClick(btn) {
    try {
      if (gsapAvailable && window.gsap) {
        window.gsap.fromTo(btn, { scale: 0.985 }, { scale: 1.02, duration: 0.08, yoyo: true, repeat: 1, ease: "power2.inOut" });
      } else {
        btn.style.transform = 'scale(0.98)';
        setTimeout(() => btn.style.transform = '', 120);
      }
      // small ripple: create transient element if supported
      const r = document.createElement('span');
      r.style.position = 'absolute';
      r.style.left = '50%';
      r.style.top = '50%';
      r.style.transform = 'translate(-50%,-50%)';
      r.style.width = r.style.height = '8px';
      r.style.borderRadius = '50%';
      r.style.background = 'rgba(255,255,255,0.12)';
      r.style.pointerEvents = 'none';
      r.style.opacity = '0.9';
      r.style.transition = 'all 420ms cubic-bezier(.18,.9,.25,1)';
      r.className = 'godfix-ripple';
      btn.style.position = 'relative';
      btn.appendChild(r);
      requestAnimationFrame(() => {
        r.style.width = '220%';
        r.style.height = '220%';
        r.style.opacity = '0';
      });
      setTimeout(() => r.remove(), 520);
    } catch (e) { /* ignore animation errors */ }
  }

  // Attach generic hover and click interactions to all .btn elements (live)
  function initGlobalButtons() {
    document.addEventListener('mouseover', e => {
      const b = e.target.closest('.btn');
      if (!b) return;
      b.style.transform = 'translateY(-3px)';
      b.style.boxShadow = '0 18px 48px rgba(103,80,200,0.14)';
    });
    document.addEventListener('mouseout', e => {
      const b = e.target.closest('.btn');
      if (!b) return;
      b.style.transform = '';
      b.style.boxShadow = '';
    });
    document.addEventListener('click', e => {
      const b = e.target.closest('.btn');
      if (!b) return;
      animateButtonClick(b);
    });
  }
  initGlobalButtons();

  // --------------------------- Editor basic behavior ---------------------------
  function updateLineNumbers() {
    try {
      const codeText = (el.code.innerText || '').replace(/\t/g, '    ');
      const lines = codeText.split('\n');
      const lnContainer = ensureElement('lineNumbers', { html: '<pre id="lineNumbers" class="ln"></pre>' });
      let html = '';
      for (let i = 1; i <= lines.length; i++) html += i + '\n';
      // use existing lineNumbers element if present
      const lnEl = document.getElementById('lineNumbers') || lnContainer;
      if (lnEl) lnEl.textContent = html;
      // update counters if available
      const lineCountEl = document.getElementById('lineCount');
      const charCountEl = document.getElementById('charCount');
      if (lineCountEl) lineCountEl.textContent = lines.length;
      if (charCountEl) charCountEl.textContent = codeText.length;
    } catch (e) { /* ignore */ }
  }

  // minimal highlight without breaking caret too much (we'll apply periodically)
  function applyMinimalHighlight() {
    try {
      const raw = el.code.innerText || '';
      // simple replacements
      let html = raw
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/(\/\/.*?$)/gm, '<span style="color:#8f99a6;font-style:italic">$1</span>')
        .replace(/(\b\d+(\.\d+)?\b)/g, '<span style="color:#a5ffc9">$1</span>')
        .replace(/\b(void|float|vec2|vec3|vec4|uniform|precision|if|else|for|while|return|main|varying|attribute|in|out|sampler2D|gl_FragColor)\b/g, '<span style="color:#7ec7ff">$1</span>')
        .replace(/(\b[a-zA-Z_]\w*(?=\())/g, '<span style="color:#ffd88e">$1</span>');
      el.code.innerHTML = html;
      placeCaretToEnd(el.code);
    } catch (e) { /* ignore highlight errors */ }
  }

  function placeCaretToEnd(contentEditableElement) {
    try {
      contentEditableElement.focus();
      const range = document.createRange();
      range.selectNodeContents(contentEditableElement);
      range.collapse(false);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    } catch (e) {}
  }

  // periodic update
  setInterval(() => {
    try { updateLineNumbers(); applyMinimalHighlight(); } catch (e) {}
  }, 1500);

  // --------------------------- File upload wiring ---------------------------
  if (el.fileIn) {
    el.fileIn.addEventListener('change', async (ev) => {
      try {
        const f = ev.target.files[0];
        if (!f) return;
        const text = await f.text();
        el.code.innerText = text;
        updateLineNumbers();
        (document.getElementById('statusLabel') || {}).textContent = 'Status: File loaded';
        // show download button later
        if (el.downloadBtn) el.downloadBtn.style.display = 'none';
        logMain(`Loaded ${f.name}`);
      } catch (err) {
        logMain('File load failed: ' + err.message, 'err');
      }
    });
  }

  // --------------------------- Logger helpers ---------------------------
  function logMain(msg, level='OK') {
    const ln = new Date().toLocaleTimeString() + ' [' + level + '] ' + msg + '\n';
    if (el.mainLog) el.mainLog.textContent = ln + (el.mainLog.textContent || '');
    // also mirror to console
    if (level === 'ERR' || level === 'ERROR') console.error(msg); else console.log(msg);
  }
  function logCompile(msg, level='OK') {
    const ln = new Date().toLocaleTimeString() + ' [' + level + '] ' + msg + '\n';
    if (el.compileLog) el.compileLog.textContent = ln + (el.compileLog.textContent || '');
    // store last compile log for possible "fix with logs"
    window.GODFIX_LAST_COMPILE_LOG = el.compileLog ? el.compileLog.textContent : (window.GODFIX_LAST_COMPILE_LOG || '');
  }

  // If compileLog and mainLog weren't present earlier, create simple fallbacks
  if (!el.mainLog) el.mainLog = ensureElement('mainLog', { html: '<div id="mainLog" class="log"></div>' });
  if (!el.compileLog) el.compileLog = ensureElement('compileLog', { html: '<div id="compileLog" class="log"></div>' });

  // --------------------------- Smart shader fixer (same heuristics as index flavor) ---------------------------
  function smartFixShader(code) {
    try {
      logMain('Starting smartFixShader pass');
      let out = (code || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

      // 1. add precision if missing
      if (!/precision\s+(lowp|mediump|highp)\s+float\s*;/.test(out)) {
        out = 'precision mediump float;\n' + out;
        logMain('Inserted precision mediump float;');
      }

      // 2. common uniforms (also interactive ones)
      const uniforms = [
        { rx: /\buniform\s+float\s+uTime\b/, decl: 'uniform float uTime;' },
        { rx: /\buniform\s+vec2\s+uResolution\b/, decl: 'uniform vec2 uResolution;' },
        { rx: /\buniform\s+sampler2D\s+uSampler\b/, decl: 'uniform sampler2D uSampler;' },
        { rx: /\buniform\s+float\s+uRotate\b/, decl: 'uniform float uRotate;' },
        { rx: /\buniform\s+float\s+uZoom\b/, decl: 'uniform float uZoom;' },
        { rx: /\buniform\s+float\s+uColorOffset\b/, decl: 'uniform float uColorOffset;' },
      ];
      let added = 0;
      uniforms.forEach(u => {
        if (!u.rx.test(out)) { out = u.decl + '\n' + out; added++; }
      });
      if (added) logMain(`Added ${added} uniform(s)`);

      // 3. texture2D -> texture
      if (/texture2D\(/.test(out)) {
        out = out.replace(/texture2D\(/g, 'texture(');
        logMain('Converted texture2D -> texture');
      }

      // 4. semicolon insertion (safe-ish)
      out = out.split('\n').map(ln => {
        const t = ln.trim();
        if (!t) return ln;
        if (t.startsWith('//') || t.startsWith('/*') || t.startsWith('*') || t.startsWith('#')) return ln;
        if (/\)\s*{/.test(t) || /\{$/.test(t) || /\}$/.test(t)) return ln;
        if (/[;,\)\{\}]$/.test(t)) return ln;
        if (/^(uniform|attribute|varying|in|out|const)\b/.test(t) && !t.endsWith(';')) return ln + ';';
        if (/=/.test(t) && !/==/.test(t) && !t.endsWith(';')) return ln + ';';
        return ln;
      }).join('\n');
      logMain('Smart semicolons pass complete');

      // 5. division guards
      out = out.replace(/\/\s*\(?([a-zA-Z_]\w*(?:\.[xyzw]{1,4})?)(\)?)/g, (m, g1, g2) => {
        if (/^\d/.test(g1)) return '/' + g1 + g2;
        return '/ max(' + g1 + ', 0.000001)' + g2;
      });
      logMain('Inserted division guards');

      // 6. close braces/parens
      const opens = (out.match(/\{/g) || []).length;
      const closes = (out.match(/\}/g) || []).length;
      if (opens > closes) { out += '\n' + '}'.repeat(opens - closes); logMain(`Closed ${opens - closes} missing braces`); }
      const opar = (out.match(/\(/g) || []).length;
      const cpar = (out.match(/\)/g) || []).length;
      if (opar > cpar) { out += ')'.repeat(opar - cpar); logMain(`Closed ${opar - cpar} missing parentheses`); }

      // 7. fix placeholders
      out = out.replace(/\bundefined\b/g, '0.0').replace(/\bNULL\b/g, '0.0');

      // 8. type mismatch - simple numeric -> vec wrapper
      out = out.replace(/\b(vec[234])\s+([a-zA-Z_]\w*)\s*=\s*([0-9]+(?:\.[0-9]+)?)\s*;/g, '$1 $2 = $1($3);');

      // 9. ensure main
      if (!/\bvoid\s+main\s*\(/.test(out)) {
        out += '\nvoid main(){ gl_FragColor = vec4(0.0); }';
        logMain('Appended fallback main()');
      }

      logMain('smartFixShader done');
      window.GODFIX_FIXED = out;
      return out;
    } catch (e) {
      logMain('smartFixShader error: ' + (e.message || e), 'ERR');
      return code;
    }
  }

  // --------------------------- Parse compile logs & apply heuristics (fix-with-logs) ---------------------------
  function parseErrorsAndFix(code, logsText) {
    try {
      logMain('parseErrorsAndFix: analyzing logs');
      const lines = (logsText || '').split('\n').map(s => s.trim()).filter(Boolean);
      const errors = lines.filter(l => /error|failed|undefined|undeclared|expected|missing|unmatched|link error/i.test(l));
      const candidateErrors = errors.length ? errors : lines.slice(0, 20);

      let patched = code;

      candidateErrors.forEach(err => {
        // missing semicolon typical formats
        if (/expected ';'|missing ';'|syntax error.*expected ';'/i.test(err) || /';'/.test(err)) {
          patched = patched.split('\n').map(ln => {
            const t = ln.trim();
            if (!t) return ln;
            if (t.startsWith('//') || t.startsWith('#') || t.endsWith(';') || t.endsWith('{') || t.endsWith('}')) return ln;
            if (/[;,\)\{\}]$/.test(t)) return ln;
            if (/=/.test(t) && !/==/.test(t)) return ln + ';';
            return ln;
          }).join('\n');
          logMain('Applied semicolon heuristic (from logs)');
        }

        // undeclared identifier patterns
        const mUndeclared = err.match(/'(.*?)'\s*:\s*undeclared identifier|undeclared identifier\s*'(.*?)'|error: '(.*?)' undeclared/i);
        if (mUndeclared) {
          const id = (mUndeclared[1] || mUndeclared[2] || mUndeclared[3] || '').replace(/[^a-zA-Z0-9_]/g, '');
          if (id) {
            patched = `uniform float ${id};\n` + patched;
            logMain(`Declared ${id} as uniform float (heuristic)`);
          }
        }

        // implicit conversion: integer -> float
        if (/implicitly convert|cannot convert|conversion from 'int' to 'float'|to 'float'/i.test(err)) {
          patched = patched.replace(/\b([0-9]+)\b/g, '$1.0');
          logMain('Converted integer literals to floats (heuristic)');
        }

        // texture2D issues
        if (/texture2D\(|texture\(/i.test(err) && patched.includes('texture2D(')) {
          patched = patched.replace(/texture2D\(/g, 'texture(');
          logMain('Converted texture2D->texture (from logs)');
        }

        // missing main / link errors
        if (/undefined reference.*main|no main function|no symbol main/i.test(err)) {
          if (!/\bvoid\s+main\s*\(/.test(patched)) {
            patched += '\nvoid main(){ gl_FragColor = vec4(0.0); }';
            logMain('Appended fallback main() (from logs)');
          }
        }

        // unmatched braces/parentheses
        if (/unmatched|missing.*brace|missing.*parenth/i.test(err)) {
          const opens = (patched.match(/\{/g) || []).length;
          const closes = (patched.match(/\}/g) || []).length;
          if (opens > closes) { patched += '\n' + '}'.repeat(opens - closes); logMain('Auto-closed braces (from logs)'); }
          const opar = (patched.match(/\(/g) || []).length;
          const cpar = (patched.match(/\)/g) || []).length;
          if (opar > cpar) { patched += ')'.repeat(opar - cpar); logMain('Auto-closed parentheses (from logs)'); }
        }
      });

      // final pass: run smartFixShader to standardize and add uniforms, semicolons, etc.
      patched = smartFixShader(patched);
      logMain('parseErrorsAndFix completed');
      return patched;
    } catch (e) {
      logMain('parseErrorsAndFix error: ' + (e.message || e), 'ERR');
      return code;
    }
  }

  // --------------------------- Wire fix + fix-with-logs buttons ---------------------------
  if (el.fixBtn) {
    el.fixBtn.addEventListener('click', () => {
      try {
        animateButtonClick(el.fixBtn);
        const src = (el.code && el.code.innerText) ? el.code.innerText : '';
        const fixed = smartFixShader(src);
        if (el.code) el.code.innerText = fixed;
        updateLineNumbers();
        if (el.downloadBtn) el.downloadBtn.style.display = 'inline-block';
        logCompile('Auto-fix applied');
        // confetti
        animateConfetti();
      } catch (e) {
        logCompile('Auto-fix crashed: ' + e.message, 'ERR');
      }
    });
  }

  // Fix-with-logs wiring
  if (el.applyLogsBtn) {
    el.applyLogsBtn.addEventListener('click', () => {
      try {
        animateButtonClick(el.applyLogsBtn);
        const logsText = (el.logsInput && el.logsInput.value) ? el.logsInput.value : (el.compileLog ? el.compileLog.textContent : '');
        if (!logsText) return alert('Paste logs into the Logs input first or compile to produce logs.');
        const src = (el.code && el.code.innerText) ? el.code.innerText : '';
        const patched = parseErrorsAndFix(src, logsText);
        if (el.code) el.code.innerText = patched;
        updateLineNumbers();
        if (el.downloadBtn) el.downloadBtn.style.display = 'inline-block';
        logCompile('Applied fixes derived from logs');
        animateConfetti();
      } catch (e) {
        logCompile('Fix-with-logs error: ' + (e.message || e), 'ERR');
      }
    });
  }

  // copy / paste helpers
  if (el.copyLogsForFix) {
    el.copyLogsForFix.addEventListener('click', async () => {
      if (!el.compileLog) return;
      try {
        await navigator.clipboard.writeText(el.compileLog.textContent || '');
        logMain('Compile logs copied to clipboard');
      } catch (e) {
        logMain('Copy failed: ' + e.message, 'ERR');
      }
    });
  }
  if (el.pasteLogsToFix) {
    el.pasteLogsToFix.addEventListener('click', async () => {
      try {
        const txt = await navigator.clipboard.readText();
        if (!txt) return alert('Clipboard empty or permission denied.');
        if (!el.logsInput) {
          const area = ensureElement('logsInput', { html: '<textarea id="logsInput"></textarea>' });
          el.logsInput = area.querySelector('#logsInput') || area;
        }
        el.logsInput.value = txt;
        logMain('Pasted clipboard to logs input');
      } catch (e) {
        logMain('Paste failed: ' + e.message, 'ERR');
      }
    });
  }
  if (el.copyCompileLog) {
    el.copyCompileLog.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(el.compileLog.textContent || '');
        logMain('Compile log copied to clipboard');
      } catch (e) {
        logMain('Copy compile log failed: ' + e.message, 'ERR');
      }
    });
  }
  if (el.clearCompileLog) {
    el.clearCompileLog.addEventListener('click', () => {
      if (el.compileLog) el.compileLog.textContent = '';
      logMain('Compile log cleared');
    });
  }

  // download fixed shader
  if (el.downloadBtn) {
    el.downloadBtn.addEventListener('click', () => {
      try {
        const txt = (el.code && el.code.innerText) ? el.code.innerText : (window.GODFIX_FIXED || '');
        const blob = new Blob([txt], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = (window.FIXED_FILENAME || 'fixed_shader.frag');
        a.click();
        URL.revokeObjectURL(url);
        logMain('Downloaded fixed shader');
      } catch (e) {
        logMain('Download failed: ' + e.message, 'ERR');
      }
    });
  }

  // inject example
  if (el.injectBtn) {
    el.injectBtn.addEventListener('click', () => {
      const sample = `// Example interactive shader (injected)
precision mediump float;
uniform float uTime;
uniform vec2 uResolution;
uniform float uRotate;
uniform float uZoom;
uniform float uColorOffset;
void main(){
  vec2 uv = (gl_FragCoord.xy / uResolution.xy) - 0.5;
  float cr = cos(uRotate), sr = sin(uRotate);
  mat2 R = mat2(cr, -sr, sr, cr);
  uv = R * uv * uZoom;
  float r = length(uv);
  vec3 col = 0.5 + 0.5*cos(uTime + uv.xyx*6.0 + vec3(0,2+uColorOffset,4));
  col *= smoothstep(1.3, 0.0, r);
  gl_FragColor = vec4(col,1.0);
}`;
      el.code.innerText = sample;
      updateLineNumbers();
      logMain('Injected example shader');
    });
  }

  // --------------------------- WebGL preview engine (interactive uniforms) ---------------------------
  const webgl = {};
  (function initWebGLPreview() {
    webgl.canvas = el.glcanvas;
    if (!webgl.canvas) {
      webgl.canvas = ensureElement('glcanvas', { html: '<canvas id="glcanvas" width="640" height="360"></canvas>' });
      webgl.canvas = document.getElementById('glcanvas');
    }
    // context
    try {
      webgl.gl = webgl.canvas.getContext('webgl') || webgl.canvas.getContext('experimental-webgl');
    } catch (e) {
      webgl.gl = null;
    }
    if (!webgl.gl) {
      logCompile('WebGL not available — interactive preview disabled', 'ERR');
      if (el.runPreview) el.runPreview.disabled = true;
      return;
    }

    // state for interaction
    webgl.interaction = { rotation: 0, zoom: 1, colorOffset: 0, dragging: false, lastX: 0, lastY: 0, pinchDist: 0 };
    webgl.program = null;
    webgl.animReq = null;
    webgl.startTime = performance.now();

    function resizeGLCanvas() {
      // fit available width but keep reasonable pixel size
      try {
        const parent = webgl.canvas.parentElement || document.body;
        const cssW = Math.min(parent.clientWidth - 40, 720);
        const cssH = Math.floor(cssW * (9 / 16));
        webgl.canvas.style.width = cssW + 'px';
        webgl.canvas.style.height = cssH + 'px';
        webgl.canvas.width = Math.max(1, Math.floor(cssW * devicePixelRatio));
        webgl.canvas.height = Math.max(1, Math.floor(cssH * devicePixelRatio));
      } catch (e) { /* ignore */ }
    }

    // compile helper
    function compileShader(type, src) {
      const g = webgl.gl;
      const s = g.createShader(type);
      g.shaderSource(s, src);
      g.compileShader(s);
      if (!g.getShaderParameter(s, g.COMPILE_STATUS)) {
        const info = g.getShaderInfoLog(s);
        g.deleteShader(s);
        throw new Error(info);
      }
      return s;
    }

    function compileAndRun(src) {
      if (!webgl.gl) return;
      resizeGLCanvas();
      const g = webgl.gl;
      const vs = `attribute vec2 aPos; void main(){ gl_Position = vec4(aPos,0.0,1.0); }`;
      try {
        const vsS = compileShader(g.VERTEX_SHADER, vs);
        const fsS = compileShader(g.FRAGMENT_SHADER, src);
        if (webgl.program) { try { g.deleteProgram(webgl.program); } catch (e) {} webgl.program = null; }
        const p = g.createProgram();
        g.attachShader(p, vsS);
        g.attachShader(p, fsS);
        g.linkProgram(p);
        if (!g.getProgramParameter(p, g.LINK_STATUS)) {
          const info = g.getProgramInfoLog(p);
          g.deleteProgram(p);
          throw new Error('Link error: ' + info);
        }
        webgl.program = p;
        webgl.startTime = performance.now();
        if (webgl.animReq) cancelAnimationFrame(webgl.animReq);

        function render() {
          resizeGLCanvas();
          g.viewport(0, 0, webgl.canvas.width, webgl.canvas.height);
          g.clearColor(0, 0, 0, 1); g.clear(g.COLOR_BUFFER_BIT);
          g.useProgram(webgl.program);

          const tLoc = g.getUniformLocation(webgl.program, 'uTime');
          const rLoc = g.getUniformLocation(webgl.program, 'uResolution');
          const rotLoc = g.getUniformLocation(webgl.program, 'uRotate');
          const zoomLoc = g.getUniformLocation(webgl.program, 'uZoom');
          const colOffsetLoc = g.getUniformLocation(webgl.program, 'uColorOffset');
          const samplerLoc = g.getUniformLocation(webgl.program, 'uSampler');

          const t = (performance.now() - webgl.startTime) / 1000;
          if (tLoc) g.uniform1f(tLoc, t);
          if (rLoc) g.uniform2f(rLoc, webgl.canvas.width / devicePixelRatio, webgl.canvas.height / devicePixelRatio);
          if (rotLoc) g.uniform1f(rotLoc, webgl.interaction.rotation);
          if (zoomLoc) g.uniform1f(zoomLoc, webgl.interaction.zoom);
          if (colOffsetLoc) g.uniform1f(colOffsetLoc, webgl.interaction.colorOffset);

          if (samplerLoc) {
            const tex = g.createTexture();
            g.bindTexture(g.TEXTURE_2D, tex);
            g.texImage2D(g.TEXTURE_2D, 0, g.RGBA, 1, 1, 0, g.RGBA, g.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
            g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.NEAREST);
            g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.NEAREST);
            g.activeTexture(g.TEXTURE0); g.bindTexture(g.TEXTURE_2D, tex); g.uniform1i(samplerLoc, 0);
          }

          // simple quad draw
          const verts = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
          const vbo = g.createBuffer();
          g.bindBuffer(g.ARRAY_BUFFER, vbo);
          g.bufferData(g.ARRAY_BUFFER, verts, g.STREAM_DRAW);
          const posLoc = g.getAttribLocation(webgl.program, 'aPos');
          if (posLoc >= 0) {
            g.enableVertexAttribArray(posLoc);
            g.vertexAttribPointer(posLoc, 2, g.FLOAT, false, 0, 0);
          }
          g.drawArrays(g.TRIANGLE_STRIP, 0, 4);
          g.deleteBuffer(vbo);

          webgl.animReq = requestAnimationFrame(render);
        }
        render();
        logCompile('Compiled & preview running');
        (document.getElementById('statusLabel') || {}).textContent = 'Status: Preview running';
      } catch (err) {
        // capture compile/link info in compileLog
        logCompile('Compile/Link failed: ' + err.message, 'ERR');
        (document.getElementById('statusLabel') || {}).textContent = 'Status: Compile Error';
      }
    }

    function stopPreview() {
      try {
        if (webgl.animReq) cancelAnimationFrame(webgl.animReq);
        if (webgl.program && webgl.gl) webgl.gl.deleteProgram(webgl.program);
        webgl.program = null;
        logCompile('Preview stopped');
        (document.getElementById('statusLabel') || {}).textContent = 'Status: Preview stopped';
      } catch (e) { /* ignore */ }
    }

    // wire run/stop if buttons exist
    if (el.runPreview) el.runPreview.addEventListener('click', () => {
      animateButtonClick(el.runPreview);
      const src = (el.code && el.code.innerText) ? el.code.innerText : '';
      compileAndRun(src);
    });
    if (el.stopPreview) el.stopPreview.addEventListener('click', () => { animateButtonClick(el.stopPreview); stopPreview(); });

    // interactive controls on the canvas: drag rotate, wheel zoom, click color offset, touch pinch
    const c = webgl.canvas;
    c.addEventListener('pointerdown', (ev) => {
      c.setPointerCapture(ev.pointerId);
      webgl.interaction.dragging = true;
      webgl.interaction.lastX = ev.clientX;
      webgl.interaction.lastY = ev.clientY;
    });
    c.addEventListener('pointermove', (ev) => {
      if (!webgl.interaction.dragging) return;
      const dx = ev.clientX - webgl.interaction.lastX;
      webgl.interaction.lastX = ev.clientX;
      // update rotation scaled by viewport size
      webgl.interaction.rotation += (dx / Math.max(c.clientWidth, c.clientHeight)) * Math.PI * 1.1;
    });
    c.addEventListener('pointerup', (ev) => { try { c.releasePointerCapture(ev.pointerId); } catch (e) {} webgl.interaction.dragging = false; });
    c.addEventListener('pointercancel', () => webgl.interaction.dragging = false);

    c.addEventListener('wheel', (ev) => {
      ev.preventDefault();
      webgl.interaction.zoom = Math.max(0.18, Math.min(6.0, webgl.interaction.zoom * (1 - ev.deltaY * 0.0018)));
    }, { passive: false });

    c.addEventListener('click', () => { webgl.interaction.colorOffset += 0.7; });

    // touch handlers: pinch & drag
    c.addEventListener('touchstart', (ev) => {
      if (ev.touches.length === 2) {
        webgl.interaction.pinchDist = Math.hypot(
          ev.touches[0].clientX - ev.touches[1].clientX,
          ev.touches[0].clientY - ev.touches[1].clientY
        );
      } else if (ev.touches.length === 1) {
        webgl.interaction.dragging = true;
        webgl.interaction.lastX = ev.touches[0].clientX;
        webgl.interaction.lastY = ev.touches[0].clientY;
      }
    }, { passive: true });

    c.addEventListener('touchmove', (ev) => {
      if (ev.touches.length === 2 && webgl.interaction.pinchDist) {
        const nd = Math.hypot(
          ev.touches[0].clientX - ev.touches[1].clientX,
          ev.touches[0].clientY - ev.touches[1].clientY
        );
        const scale = nd / webgl.interaction.pinchDist;
        webgl.interaction.zoom = Math.max(0.18, Math.min(6.0, webgl.interaction.zoom * scale));
        webgl.interaction.pinchDist = nd;
      } else if (ev.touches.length === 1 && webgl.interaction.dragging) {
        const dx = ev.touches[0].clientX - webgl.interaction.lastX;
        webgl.interaction.lastX = ev.touches[0].clientX;
        webgl.interaction.rotation += (dx / Math.max(c.clientWidth, c.clientHeight)) * Math.PI * 1.1;
      }
    }, { passive: true });

    c.addEventListener('touchend', () => { webgl.interaction.dragging = false; webgl.interaction.pinchDist = 0; });

    // expose compileAndRun externally
    webgl.compileAndRun = compileAndRun;
    webgl.stopPreview = stopPreview;
    webgl.resizeGLCanvas = resizeGLCanvas;
    window.GODFIX_WEBGL = webgl;
  })();

  // --------------------------- Confetti visual (lightweight) ---------------------------
  function animateConfetti() {
    try {
      const canvas = el.confettiCanvas || ensureElement('confettiCanvas', { html: '<canvas id="confettiCanvas" class="confetti"></canvas>' });
      const ctx = (canvas.getContext && canvas.getContext('2d')) ? canvas.getContext('2d') : null;
      if (!ctx) return;
      canvas.width = window.innerWidth; canvas.height = window.innerHeight;
      let particles = [];
      function spawn(n = 26) {
        for (let i = 0; i < n; i++) {
          particles.push({
            x: Math.random() * canvas.width,
            y: -20 - Math.random() * 200,
            vx: (Math.random() - 0.5) * 6,
            vy: 1 + Math.random() * 4,
            size: 6 + Math.random() * 12,
            rot: Math.random() * 360,
            spin: (Math.random() - 0.5) * 10,
            color: ['#ff6b6b', '#6ef0a2', '#6b3dff', '#4ee0ff', '#ffd88e'][Math.floor(Math.random() * 5)],
            life: 120 + Math.random() * 180
          });
        }
      }
      spawn();
      (function step() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        for (let i = particles.length - 1; i >= 0; i--) {
          const p = particles[i];
          p.x += p.vx; p.y += p.vy; p.vy += 0.04; p.rot += p.spin; p.life--;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot * Math.PI / 180);
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
          ctx.restore();
          if (p.y > canvas.height + 50 || p.life <= 0) particles.splice(i, 1);
        }
        if (particles.length > 0) requestAnimationFrame(step);
        else ctx.clearRect(0, 0, canvas.width, canvas.height);
      })();
      setTimeout(() => { try { canvas.width = 0; canvas.height = 0; } catch (e) {} }, 3500);
    } catch (e) { /* ignore */ }
  }

  // --------------------------- Comments: online-ready via dynamic Firebase (modular v9) ---------------------------
  (function initComments() {
    const connectBtn = el.connectDemo;
    const nick = el.commentNick || null;
    const email = el.commentEmail || null;
    const textArea = el.commentText || null;
    const postBtn = el.postComment || null;
    const commentList = el.commentList || null;

    let firestore = null;
    let firebaseApp = null;
    let unsubscribe = null;
    let demoLocal = true;
    const localComments = [];

    async function tryInitFirebase() {
      if (!window.FIREBASE_CONFIG) { logMain('No FIREBASE_CONFIG - comments in demo/local mode'); demoLocal = true; return; }
      try {
        const { initializeApp } = await import('https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js');
        const { getFirestore, collection, addDoc, onSnapshot, query, orderBy, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js');
        firebaseApp = initializeApp(window.FIREBASE_CONFIG);
        firestore = getFirestore(firebaseApp);
        const q = query(collection(firestore, 'shader_comments'), orderBy('ts', 'desc'));
        unsubscribe = onSnapshot(q, snap => {
          // clear and repopulate
          if (!commentList) return;
          commentList.innerHTML = '';
          snap.forEach(docSnap => {
            const d = docSnap.data();
            appendCommentUI(d.nick || 'anon', d.text || '', d.ts ? new Date(d.ts.toMillis()).toLocaleString() : new Date().toLocaleString());
          });
        });
        demoLocal = false;
        logMain('Connected: Firebase Firestore comments enabled (live)');
      } catch (e) {
        console.warn('Firebase init failed', e);
        logMain('Firebase init failed — comments in demo/local mode', 'ERR');
        demoLocal = true;
      }
    }
    tryInitFirebase();

    function appendCommentUI(nickText, text, ts) {
      if (!commentList) return;
      const d = document.createElement('div');
      d.className = 'comment';
      d.style.marginBottom = '8px';
      d.innerHTML = `<div style="display:flex;justify-content:space-between"><strong>${esc(nickText)}</strong><span class="small">${esc(ts)}</span></div><div style="margin-top:6px;white-space:pre-wrap">${esc(text)}</div>`;
      commentList.prepend(d);
    }

    async function postCommentHandler() {
      const nickVal = (nick && nick.value) ? nick.value.trim() : 'anon';
      const emailVal = (email && email.value) ? email.value.trim() : '';
      const textVal = (textArea && textArea.value) ? textArea.value.trim() : '';
      if (!textVal) return alert('Write a comment before posting.');

      if (!demoLocal && firestore) {
        try {
          const { collection, addDoc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js');
          await addDoc(collection(firestore, 'shader_comments'), { nick: nickVal, email: emailVal, text: textVal, ts: serverTimestamp() });
          if (textArea) textArea.value = '';
          logMain('Comment posted (online)');
          return;
        } catch (e) {
          console.warn('post online failed', e);
          logMain('Posting online failed — saved locally', 'ERR');
        }
      }
      // demo local fallback
      const now = new Date();
      localComments.unshift({ nick: nickVal, email: emailVal, text: textVal, ts: now });
      appendCommentUI(nickVal, textVal, now.toLocaleString());
      if (textArea) textArea.value = '';
      logMain('Comment posted (local demo)');
    }

    if (postBtn) postBtn.addEventListener('click', postCommentHandler);
    if (connectBtn) connectBtn.addEventListener('click', async () => {
      await tryInitFirebase();
      alert(demoLocal ? 'Demo local comments active. Add FIREBASE_CONFIG to enable online mode.' : 'Connected to Firebase Firestore for comments.');
    });

    // small sample comment for local demo
    if (demoLocal && commentList) appendCommentUI('System', 'Demo comments enabled. To go live, add FIREBASE_CONFIG into index.html and reload.', new Date().toLocaleString());
  })();

  // --------------------------- Expose public API ---------------------------
  window.GODFIX_UI = {
    smartFixShader,
    parseErrorsAndFix,
    compileAndRunPreview: () => (window.GODFIX_WEBGL && window.GODFIX_WEBGL.compileAndRun) ? window.GODFIX_WEBGL.compileAndRun(el.code.innerText || '') : null,
    stopPreview: () => (window.GODFIX_WEBGL && window.GODFIX_WEBGL.stopPreview) ? window.GODFIX_WEBGL.stopPreview() : null,
    animateConfetti,
    loadGSAP,
    getCompileLog: () => (el.compileLog && el.compileLog.textContent) || '',
    getMainLog: () => (el.mainLog && el.mainLog.textContent) || ''
  };

  // final small boot logs
  logMain('script.js loaded — UI interactions wired.');
  logCompile('compile log ready.');

})();