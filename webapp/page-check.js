// Required Pages Check System
class PageChecker {
    constructor() {
        this.isChecked = false;
        this.hasAccess = false;
        this.requiredPages = [];
        this.missingPages = [];
    }

    async checkUserAccess(userId) {
        if (!userId) return false;
        
        try {
            const response = await fetch('/api/check_required_pages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ user_id: userId })
            });
            
            const data = await response.json();
            
            if (data.ok) {
                this.hasAccess = data.has_access;
                this.requiredPages = data.required_pages || [];
                this.missingPages = data.missing_pages || [];
                this.isChecked = true;
                
                return this.hasAccess;
            }
            
            return false;
        } catch (error) {
            console.error('Error checking page access:', error);
            return false;
        }
    }

    showAccessDeniedMessage() {
        if (this.missingPages.length === 0) return;
        
        const missingText = this.missingPages.map(page => `• ${page}`).join('\n');
        
        // Создаем модальное окно
        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.8);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
        `;
        
        const content = document.createElement('div');
        content.style.cssText = `
            background: white;
            padding: 30px;
            border-radius: 15px;
            max-width: 400px;
            text-align: center;
            margin: 20px;
        `;
        
        content.innerHTML = `
            <h3 style="color: #e74c3c; margin-bottom: 15px;">❌ Доступ ограничен</h3>
            <p style="margin-bottom: 20px;">Для использования бота необходимо подписаться на следующие страницы:</p>
            <div style="text-align: left; background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                <pre style="margin: 0; font-family: inherit; white-space: pre-line;">${missingText}</pre>
            </div>
            <div style="display: flex; gap: 10px; justify-content: center;">
                <button onclick="window.pageChecker.checkAgain()" style="
                    background: #3498db;
                    color: white;
                    border: none;
                    padding: 12px 24px;
                    border-radius: 8px;
                    cursor: pointer;
                    font-size: 16px;
                ">Проверить снова</button>
                <button onclick="window.openLinks()" style="
                    background: #27ae60;
                    color: white;
                    border: none;
                    padding: 12px 24px;
                    border-radius: 8px;
                    cursor: pointer;
                    font-size: 16px;
                ">Открыть ссылки</button>
            </div>
        `;
        
        modal.appendChild(content);
        document.body.appendChild(modal);
        
        // Закрытие модального окна при клике на фон
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });
    }

    async checkAgain() {
        // Закрываем модальное окно
        const modal = document.querySelector('div[style*="position: fixed"]');
        if (modal) modal.remove();
        
        // Проверяем снова
        if (window.CURRENT_USER_ID) {
            await this.enforceAccessCheck(window.CURRENT_USER_ID);
        }
    }

    openLinks() {
        this.missingPages.forEach(page => {
            const link = `https://t.me/${page.replace('@', '')}`;
            window.open(link, '_blank');
        });
    }

    async enforceAccessCheck(userId) {
        const hasAccess = await this.checkUserAccess(userId);
        
        if (!hasAccess) {
            this.showAccessDeniedMessage();
            return false;
        }
        
        return true;
    }
}

// Создаем глобальный экземпляр
window.pageChecker = new PageChecker();

// Функция для открытия ссылок
window.openLinks = function() {
    if (window.pageChecker.missingPages.length > 0) {
        window.pageChecker.openLinks();
    }
};

// Автоматическая проверка при загрузке страницы
document.addEventListener('DOMContentLoaded', async () => {
    // Ждем немного, чтобы CURRENT_USER_ID установился
    setTimeout(async () => {
        if (window.CURRENT_USER_ID) {
            await window.pageChecker.enforceAccessCheck(window.CURRENT_USER_ID);
        }
    }, 1000);
});

// Экспортируем для использования в других файлах
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PageChecker;
}
