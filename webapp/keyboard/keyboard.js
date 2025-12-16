// Custom Keyboard System
(function() {
    'use strict';

    let currentInput = null;
    let currentLang = 'en';
    let capsLock = false;
    let shiftPressed = false;
    let lastShiftTime = 0;

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
            <div class="keyboard-header">
                <div class="keyboard-lang-switcher">
                    <button class="keyboard-lang-btn active" data-lang="en">EN</button>
                    <button class="keyboard-lang-btn" data-lang="ru">RU</button>
                    <button class="keyboard-lang-btn" data-lang="emoji">😀</button>
                </div>
                <button class="keyboard-close-btn">✕</button>
            </div>
            <div id="keyboard-content"></div>
        `;
        document.body.appendChild(kb);

        // Language switcher
        kb.querySelectorAll('.keyboard-lang-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                kb.querySelectorAll('.keyboard-lang-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentLang = btn.dataset.lang;
                renderKeyboard();
            });
        });

        // Close button
        kb.querySelector('.keyboard-close-btn').addEventListener('click', closeKeyboard);

        renderKeyboard();
    }

    // Render keyboard layout
    function renderKeyboard() {
        const content = document.getElementById('keyboard-content');
        
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
                } else {
                    let char = key;
                    if (capsLock || shiftPressed) {
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
    function insertText(char) {
        if (!currentInput) return;

        const start = currentInput.selectionStart;
        const end = currentInput.selectionEnd;
        const value = currentInput.value;

        currentInput.value = value.substring(0, start) + char + value.substring(end);
        currentInput.selectionStart = currentInput.selectionEnd = start + char.length;

        // Auto-capitalize after sentence
        if (char === '.' || char === '!' || char === '?') {
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

        const start = currentInput.selectionStart;
        const end = currentInput.selectionEnd;
        const value = currentInput.value;

        if (start === end && start > 0) {
            currentInput.value = value.substring(0, start - 1) + value.substring(end);
            currentInput.selectionStart = currentInput.selectionEnd = start - 1;
        } else {
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
            // Trigger submit if it's in a form
            const form = currentInput.closest('form');
            if (form) {
                form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
            }

            // Trigger click on nearby send button
            const sendBtn = currentInput.parentElement.querySelector('button[type="submit"], .send-btn, #send-btn');
            if (sendBtn) {
                sendBtn.click();
            }
        }

        closeKeyboard();
    }

    // Open keyboard
    function openKeyboard(input) {
        currentInput = input;
        const kb = document.getElementById('custom-keyboard');
        if (kb) {
            kb.classList.add('active');
            
            // Auto-capitalize first letter
            if (input.value.trim() === '') {
                shiftPressed = true;
                renderKeyboard();
            }
        }
    }

    // Close keyboard
    function closeKeyboard() {
        const kb = document.getElementById('custom-keyboard');
        if (kb) {
            kb.classList.remove('active');
        }
        currentInput = null;
        capsLock = false;
        shiftPressed = false;
    }

    // Global input detection
    document.addEventListener('focusin', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            // Ignore password fields
            if (e.target.type === 'password') return;

            e.preventDefault();
            e.target.blur();
            
            setTimeout(() => {
                openKeyboard(e.target);
            }, 100);
        }
    });

    // Initialize on load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', createKeyboard);
    } else {
        createKeyboard();
    }

})();