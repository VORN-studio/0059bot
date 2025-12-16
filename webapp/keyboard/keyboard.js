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

    function createKeyboard() {
        const kb = document.createElement('div');
        kb.id = 'custom-keyboard';
        kb.innerHTML = `
            <div class="keyboard-toolbar">
                <button class="keyboard-tool-btn" id="kb-copy">📋 Copy</button>
                <button class="keyboard-tool-btn" id="kb-paste">📄 Paste</button>
                <button class="keyboard-tool-btn" id="kb-cut">✂️ Cut</button>
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

        document.getElementById('kb-copy').addEventListener('click', handleCopy);
        document.getElementById('kb-paste').addEventListener('click', handlePaste);
        document.getElementById('kb-cut').addEventListener('click', handleCut);

        kb.querySelectorAll('.keyboard-lang-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                kb.querySelectorAll('.keyboard-lang-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentLang = btn.dataset.lang;
                renderKeyboard();
            });
        });

        kb.querySelector('.keyboard-close-btn').addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            closeKeyboard();
        });

        renderKeyboard();
    }

    function handleCopy() {
        if (!currentInput) return;
        
        const value = currentInput.value || '';
        
        if (value.length === 0) {
            showToast('⚠️ Nothing to copy');
            return;
        }
        
        clipboardText = value;
        showToast('📋 Copied: ' + clipboardText.substring(0, 20) + (clipboardText.length > 20 ? '...' : ''));
    }

    function handlePaste() {
        if (!currentInput || !clipboardText) {
            showToast('⚠️ Clipboard is empty');
            return;
        }
        insertText(clipboardText);
        showToast('📄 Pasted');
    }

    function handleCut() {
        if (!currentInput) return;
        
        const value = currentInput.value || '';
        
        if (value.length === 0) {
            showToast('⚠️ Nothing to cut');
            return;
        }
        
        clipboardText = value;
        currentInput.value = '';
        currentInput.selectionStart = currentInput.selectionEnd = 0;
        currentInput.dispatchEvent(new Event('input', { bubbles: true }));
        showToast('✂️ Cut: ' + clipboardText.substring(0, 20) + (clipboardText.length > 20 ? '...' : ''));
    }

    function showToast(message) {
        const toast = document.createElement('div');
        toast.style.cssText = `position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,0.9);color:white;padding:16px 24px;border-radius:12px;z-index:9999999;font-size:15px;font-weight:500;box-shadow:0 4px 12px rgba(0,0,0,0.5);`;
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 1500);
    }

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

        const bottomRow = document.createElement('div');
        bottomRow.className = 'keyboard-row';
        bottomRow.innerHTML = `<button class="keyboard-key space">Space</button><button class="keyboard-key enter">↵</button>`;
        content.appendChild(bottomRow);

        bottomRow.querySelector('.space').addEventListener('click', () => insertText(' '));
        bottomRow.querySelector('.enter').addEventListener('click', handleEnter);
    }

    function insertText(text) {
        if (!currentInput) return;

        const start = currentInput.selectionStart || 0;
        const end = currentInput.selectionEnd || 0;
        const value = currentInput.value || '';

        currentInput.value = value.substring(0, start) + text + value.substring(end);
        currentInput.selectionStart = currentInput.selectionEnd = start + text.length;

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

    function handleEnter() {
        if (navigator.vibrate) {
            navigator.vibrate(50);
        }

        if (currentInput) {
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

    function openKeyboard(input) {
        currentInput = input;
        const kb = document.getElementById('custom-keyboard');
        if (!kb) return;

        kb.classList.add('active');
        
        if ((input.value || '').trim() === '') {
            shiftPressed = true;
            renderKeyboard();
        }

        // ՖԻՔՍ - Input visibility
        setTimeout(() => {
            const chatBox = input.closest('.chat-box, #global-chat');
            if (chatBox) {
                chatBox.style.marginBottom = '0';
            }

            const kbHeight = kb.offsetHeight;
            document.body.style.paddingBottom = kbHeight + 'px';
            
            setTimeout(() => {
                const inputRect = input.getBoundingClientRect();
                const viewportHeight = window.innerHeight;
                
                if (inputRect.top < 100 || inputRect.bottom > viewportHeight - kbHeight - 50) {
                    input.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }, 100);
        }, 350);
    }

    function closeKeyboard() {
        const kb = document.getElementById('custom-keyboard');
        if (!kb) return;

        kb.classList.remove('active');
        document.body.style.paddingBottom = '0px';
        
        currentInput = null;
        capsLock = false;
        shiftPressed = false;
    }

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

    // Block system context menu
    document.addEventListener('contextmenu', (e) => {
        const target = e.target;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
            e.preventDefault();
            e.stopPropagation();
            return false;
        }
    });

    // Block long press selection
    document.addEventListener('selectstart', (e) => {
        const target = e.target;
        if ((target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') && currentInput) {
            e.preventDefault();
            return false;
        }
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', createKeyboard);
    } else {
        createKeyboard();
    }

})();