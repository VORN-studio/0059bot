// Custom Keyboard System
console.log('🎹 Custom Keyboard loading...');

(function() {
    'use strict';
    
    console.log('🎹 Custom Keyboard initialized!');

    let currentInput = null;
    let currentLang = 'en';
    let capsLock = false;
    let shiftPressed = false;
    let lastShiftTime = 0;
    let clipboardText = '';

    const layouts = {
        en: [
            ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
            ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
            ['shift', 'z', 'x', 'c', 'v', 'b', 'n', 'm', 'backspace']
        ],
        ru: [
            ['й', 'ц', 'у', 'к', 'е', 'н', 'г', 'ш', 'щ', 'з', 'х', 'ъ'],
            ['ф', 'ы', 'в', 'а', 'п', 'р', 'о', 'л', 'д', 'ж', 'э'],
            ['shift', 'я', 'ч', 'с', 'м', 'и', 'т', 'ь', 'б', 'ю', 'backspace']
        ],
        num: [
            ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
            ['-', '/', ':', ';', '(', ')', '$', '&', '@', '"'],
            ['symbols', '.', ',', '?', '!', "'", 'backspace']
        ],
        symbols: [
            ['[', ']', '{', '}', '#', '%', '^', '*', '+', '='],
            ['_', '\\', '|', '~', '<', '>', '€', '£', '¥', '•'],
            ['num', '.', ',', '?', '!', "'", 'backspace']
        ]
    };

    const emojis = [
        '😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣',
        '🥰', '😍', '🤩', '😘', '😗', '😚', '😙', '🥲',
        '😊', '😇', '🙂', '🙃', '😉', '😌', '😔', '😪',
        '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍',
        '🔥', '⭐', '✨', '💫', '🌟', '⚡', '💥', '💯',
        '👍', '👎', '👏', '🙌', '🤝', '💪', '🙏', '✌️'
    ];

    // Create keyboard HTML
    function createKeyboard() {
        const kb = document.createElement('div');
        kb.id = 'custom-keyboard';
        kb.innerHTML = `
            <div class="keyboard-toolbar">
                <button class="keyboard-tool-btn" id="kb-copy">📋</button>
                <button class="keyboard-tool-btn" id="kb-paste">📄</button>
                <button class="keyboard-tool-btn" id="kb-cut">✂️</button>
            </div>
            <div class="keyboard-header">
                <div class="keyboard-lang-switcher">
                    <button class="keyboard-lang-btn active" data-lang="en">EN</button>
                    <button class="keyboard-lang-btn" data-lang="ru">RU</button>
                    <button class="keyboard-lang-btn" data-lang="num">123</button>
                    <button class="keyboard-lang-btn" data-lang="emoji">😀</button>
                </div>
                <button class="keyboard-close-btn">✕</button>
            </div>
            <div id="keyboard-content"></div>
        `;
        document.body.appendChild(kb);

        // Toolbar buttons
        document.getElementById('kb-copy').addEventListener('click', handleCopy);
        document.getElementById('kb-paste').addEventListener('click', handlePaste);
        document.getElementById('kb-cut').addEventListener('click', handleCut);

        // Language switcher
        kb.querySelectorAll('.keyboard-lang-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                kb.querySelectorAll('.keyboard-lang-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentLang = btn.dataset.lang;
                renderKeyboard();
            });
        });

        // Close button - ՖԻՔՍ
        kb.querySelector('.keyboard-close-btn').addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            closeKeyboard();
        });

        renderKeyboard();
    }

    // Clipboard handlers
    function handleCopy() {
        if (!currentInput) return;
        
        const start = currentInput.selectionStart || 0;
        const end = currentInput.selectionEnd || 0;
        
        if (start !== end) {
            clipboardText = currentInput.value.substring(start, end);
            showToast('📋 Copied');
        } else {
            showToast('⚠️ Select text first');
        }
    }

    function handlePaste() {
        if (!currentInput) return;
        
        if (!clipboardText) {
            showToast('⚠️ Clipboard is empty');
            return;
        }
        
        insertText(clipboardText);
        showToast('📄 Pasted');
    }

    function handleCut() {
        if (!currentInput) return;
        
        const start = currentInput.selectionStart || 0;
        const end = currentInput.selectionEnd || 0;
        
        if (start !== end) {
            clipboardText = currentInput.value.substring(start, end);
            currentInput.value = currentInput.value.substring(0, start) + currentInput.value.substring(end);
            currentInput.selectionStart = currentInput.selectionEnd = start;
            currentInput.dispatchEvent(new Event('input', { bubbles: true }));
            showToast('✂️ Cut');
        } else {
            showToast('⚠️ Select text first');
        }
    }

    function showToast(message) {
        const toast = document.createElement('div');
        toast.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0,0,0,0.8);
            color: white;
            padding: 10px 20px;
            border-radius: 20px;
            z-index: 999999;
            font-size: 14px;
        `;
        toast.textContent = message;
        document.body.appendChild(toast);
        
        setTimeout(() => toast.remove(), 1500);
    }

    // Render keyboard layout
    function renderKeyboard() {
        const content = document.getElementById('keyboard-content');
        if (!content) return;
        
        if (currentLang === 'emoji') {
            content.innerHTML = '<div class="keyboard-emoji-grid"></div>';
            const grid = content.querySelector('.keyboard-emoji-grid');
            emojis.forEach(emoji => {
                const item = document.createElement('div');
                item.className = 'keyboard-emoji-item';
                item.textContent = emoji;
                item.addEventListener('click', () => insertText(emoji));
                grid.appendChild(item);
            });
            return;
        }

        const layout = layouts[currentLang];
        content.innerHTML = '';

        layout.forEach(row => {
            const rowDiv = document.createElement('div');
            rowDiv.className = 'keyboard-row';

            row.forEach(key => {
                const keyBtn = document.createElement('button');
                keyBtn.className = 'keyboard-key';

                if (key === 'shift') {
                    keyBtn.textContent = capsLock ? '⇪' : '⬆';
                    keyBtn.classList.add('special');
                    keyBtn.addEventListener('click', handleShift);
                } else if (key === 'backspace') {
                    keyBtn.textContent = '⌫';
                    keyBtn.classList.add('special');
                    keyBtn.addEventListener('click', handleBackspace);
                } else if (key === 'symbols') {
                    keyBtn.textContent = '#+=';
                    keyBtn.classList.add('special');
                    keyBtn.addEventListener('click', () => {
                        currentLang = 'symbols';
                        renderKeyboard();
                    });
                } else if (key === 'num') {
                    keyBtn.textContent = '123';
                    keyBtn.classList.add('special');
                    keyBtn.addEventListener('click', () => {
                        currentLang = 'num';
                        renderKeyboard();
                    });
                } else {
                    let char = key;
                    if ((capsLock || shiftPressed) && (currentLang === 'en' || currentLang === 'ru')) {
                        char = key.toUpperCase();
                    }
                    keyBtn.textContent = char;
                    keyBtn.addEventListener('click', () => insertText(char));
                }

                rowDiv.appendChild(keyBtn);
            });

            content.appendChild(rowDiv);
        });

        // Bottom row (space, enter)
        const bottomRow = document.createElement('div');
        bottomRow.className = 'keyboard-row';
        bottomRow.innerHTML = `
            <button class="keyboard-key space">Space</button>
            <button class="keyboard-key enter">↵</button>
        `;
        content.appendChild(bottomRow);

        bottomRow.querySelector('.space').addEventListener('click', () => insertText(' '));
        bottomRow.querySelector('.enter').addEventListener('click', handleEnter);
    }

    // Insert text
    function insertText(text) {
        if (!currentInput) return;

        const start = currentInput.selectionStart || 0;
        const end = currentInput.selectionEnd || 0;
        const value = currentInput.value || '';

        currentInput.value = value.substring(0, start) + text + value.substring(end);
        currentInput.selectionStart = currentInput.selectionEnd = start + text.length;

        // Auto-capitalize after sentence
        if (text === '.' || text === '!' || text === '?') {
            shiftPressed = true;
            setTimeout(() => {
                shiftPressed = false;
                renderKeyboard();
            }, 50);
        } else if (shiftPressed && !capsLock) {
            shiftPressed = false;
            renderKeyboard();
        }

        currentInput.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // Handle shift (double-tap for caps lock)
    function handleShift() {
        const now = Date.now();
        if (now - lastShiftTime < 300) {
            capsLock = !capsLock;
            shiftPressed = false;
        } else {
            if (!capsLock) {
                shiftPressed = !shiftPressed;
            }
        }
        lastShiftTime = now;
        renderKeyboard();
    }

    // Handle backspace
    function handleBackspace() {
        if (!currentInput) return;

        const start = currentInput.selectionStart || 0;
        const end = currentInput.selectionEnd || 0;
        const value = currentInput.value || '';

        if (start === end && start > 0) {
            currentInput.value = value.substring(0, start - 1) + value.substring(end);
            currentInput.selectionStart = currentInput.selectionEnd = start - 1;
        } else if (start !== end) {
            currentInput.value = value.substring(0, start) + value.substring(end);
            currentInput.selectionStart = currentInput.selectionEnd = start;
        }

        currentInput.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // Handle enter (with vibration)
    function handleEnter() {
        if (navigator.vibrate) {
            navigator.vibrate(50);
        }

        if (currentInput) {
            // Try to find send button
            const sendBtn = 
                document.getElementById('global-send') ||
                document.getElementById('dm-send') ||
                document.getElementById('comment-send') ||
                currentInput.parentElement.querySelector('button[type="submit"], .send-btn, .chat-send-btn');
            
            if (sendBtn) {
                sendBtn.click();
            }
        }
    }

    // Open keyboard
    function openKeyboard(input) {
        currentInput = input;
        const kb = document.getElementById('custom-keyboard');
        if (!kb) return;

        kb.classList.add('active');
        
        // Auto-capitalize first letter
        if ((input.value || '').trim() === '') {
            shiftPressed = true;
            renderKeyboard();
        }

        // Wait for keyboard animation
        setTimeout(() => {
            const kbRect = kb.getBoundingClientRect();
            const inputRect = input.getBoundingClientRect();
            
            // Calculate space needed
            const kbTop = kbRect.top;
            const inputBottom = inputRect.bottom;
            
            // If input is behind keyboard
            if (inputBottom > kbTop - 20) {
                // Add padding to body
                const paddingNeeded = kbRect.height + 20;
                document.body.style.paddingBottom = paddingNeeded + 'px';
                
                // Scroll input into view
                setTimeout(() => {
                    input.scrollIntoView({
                        behavior: 'smooth',
                        block: 'nearest',
                        inline: 'nearest'
                    });
                }, 100);
            }
        }, 350);
    }

    // Close keyboard
    function closeKeyboard() {
        const kb = document.getElementById('custom-keyboard');
        if (!kb) return;

        kb.classList.remove('active');
        
        // Remove body padding
        document.body.style.paddingBottom = '0px';
        
        currentInput = null;
        capsLock = false;
        shiftPressed = false;
    }

    // Global input detection
    document.addEventListener('focusin', (e) => {
        const target = e.target;
        
        if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') return;
        if (target.type === 'password') return;
        if (target.readOnly || target.disabled) return;

        e.preventDefault();
        target.blur();
        
        setTimeout(() => {
            openKeyboard(target);
        }, 100);
    });

    // Initialize on load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', createKeyboard);
    } else {
        createKeyboard();
    }

})();