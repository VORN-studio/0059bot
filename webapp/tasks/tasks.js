// ========== Mobile Performance ==========
(function() {
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  
  if (isMobile) {
    console.log('📱 Tasks: Mobile performance mode enabled');
    const observe = function(){
      if (!('IntersectionObserver' in window)) return;
      const targets = document.querySelectorAll('.screen, .task-card, .task-btn');
      if (!targets || targets.length === 0) return;
      const io = new IntersectionObserver(function(entries){
        entries.forEach(function(e){
          if (e.isIntersecting) { e.target.classList.remove('effect-off'); }
          else { e.target.classList.add('effect-off'); }
        });
      }, { threshold: 0.01 });
      targets.forEach(function(t){ io.observe(t); });
    };
    if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', observe); }
    else { observe(); }
  }
})();

// ========== Onboarding System ==========
let currentUserData = null;
let onboardingModal = null;

async function checkOnboarding() {
    const uid = new URLSearchParams(window.location.search).get("uid");
    if (!uid) return;
    
    console.log('🔍 Checking onboarding for UID:', uid); // Debug log
    
    try {
        const res = await fetch(`/api/user/${uid}`);
        const data = await res.json();
        
        console.log('📊 Onboarding check response:', data); // Debug log
        
        if (data.ok && data.user) {
            currentUserData = data.user;
            
            // Show onboarding if not completed (handle null/undefined/false)
            const isCompleted = data.user.onboarding_completed === true;
            console.log('✅ Onboarding status:', isCompleted, 'value:', data.user.onboarding_completed);
            
            if (!isCompleted) {
                console.log('🎓 Showing onboarding modal, step:', data.user.onboarding_step);
                showOnboardingModal(data.user.onboarding_step || 0);
            } else {
                console.log('✅ Onboarding already completed, skipping');
            }
        } else {
            console.log('❌ API response error:', data);
        }
    } catch (e) {
        console.error('❌ Error checking onboarding:', e);
    }
}

function showOnboardingModal(currentStep = 0) {
    console.log('🎓 Opening onboarding modal, step:', currentStep);
    
    if (onboardingModal) {
        console.log('⚠️ Onboarding modal already showing, closing it first');
        onboardingModal.remove();
        onboardingModal = null;
    }
    
    onboardingModal = document.createElement('div');
    onboardingModal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.8);
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
    `;
    
    const steps = [
        {
            title: "👋 Добро пожаловать в Domino Bot!!",
            content: `
                <p>Давайте узнаем, как заработать токены DOMIT!</p>
                <p>Все просто: выполняйте простые задания и получайте вознаграждение.</p>
            `,
            action: "Начать обучение →"
        },
        {
            title: "📝 О Tasks",
            content: `
                <p><strong>Tasks</strong> это простые задания.</p>
                <ul style="text-align: left; margin: 10px 0;">
                    <li>🔔 Подписываться на Telegram-каналы</li>
                    <li>🎮 Играть в игры</li>
                    <li>📺 Смотреть видеоролики</li>
                    <li>👥 Приглашать друзей</li>
                </ul>
                <p>Каждый task дает от 0.01 до 0.09 DOMIT.</p>
            `,
            action: "Понятно →"
        },
        {
            title: "🏆 Система Daily Bonus",
            content: `
                <p><strong>Выполняя <strong>ежедневные бонусы</strong>, вы получаете дополнительные средства.</p>
                <p><strong>Levels:</strong></p>
                <ul style="text-align: left; margin: 10px 0;">
                    <li>Level 1-10: 0.25 DOMIT</li>
                    <li>Level 11-30: 0.50 DOMIT</li>
                    <li>Level 31-100: 1.00 DOMIT</li>
                    <li>Level 101-200: 1.50 DOMIT</li>
                    <li>Level 200+: 🔥 2x Multiplier!</li>
                </ul>
            `,
            action: "Понятно →"
        },
        {
            title: "💰 Вывод средств",
            content: `
                <p><strong>Как вывести средства:</p>
                <ol style="text-align: left; margin: 10px 0;">
                    <li>Заработайте минимум 1 DOMIT</li>
                    <li>Найдите раздел Wallet</li>
                    <li>Введите ваш TON-кошелек</li>
                    <li>Нажмите "Withdraw"</li>
                    <li>Получите средства в течение 5-10 минут</li>
                </ol>
                <p>⚠️ Минимум: 1 DOMIT</p>
            `,
            action: "Начать работу →"
        }
    ];
    
    const step = steps[Math.min(currentStep, steps.length - 1)];
    
    onboardingModal.innerHTML = `
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                    border-radius: 20px; padding: 30px; max-width: 400px; 
                    margin: 20px; color: white; text-align: center;">
            <h2 style="margin: 0 0 20px 0; font-size: 24px;">${step.title}</h2>
            <div style="margin: 20px 0; line-height: 1.6; font-size: 16px;">
                ${step.content}
            </div>
            <div style="display: flex; gap: 10px; justify-content: center;">
                ${currentStep > 0 ? `<button onclick="previousOnboardingStep()" 
                    style="background: rgba(255,255,255,0.2); border: none; 
                           padding: 12px 20px; border-radius: 10px; color: white; 
                           cursor: pointer; font-size: 14px;">
                    ← Назад
                </button>` : ''}
                <button onclick="nextOnboardingStep()" 
                    style="background: #4ade80; border: none; 
                           padding: 12px 20px; border-radius: 10px; color: #064e3b; 
                           cursor: pointer; font-size: 14px; font-weight: bold;">
                    ${step.action}
                </button>
            </div>
            <div style="margin-top: 20px; font-size: 12px; opacity: 0.8;">
                ${currentStep + 1} / ${steps.length}
            </div>
        </div>
    `;
    
    document.body.appendChild(onboardingModal);
    
    // Wait a bit for DOM to be ready
    setTimeout(() => {
        console.log('🎯 Modal added to DOM, ready for interaction');
    }, 100);
}

async function nextOnboardingStep() {
    const uid = new URLSearchParams(window.location.search).get("uid");
    
    // Get current step from modal
    const stepElement = onboardingModal.querySelector('div > div:last-child');
    if (!stepElement) {
        console.error('❌ Step element not found');
        return;
    }
    
    const stepText = stepElement.textContent;
    console.log('📝 Step text:', stepText);
    
    const parts = stepText.split(' / ');
    if (parts.length < 2) {
        console.error('❌ Invalid step format:', stepText);
        return;
    }
    
    const currentStep = parseInt(parts[0]) - 1;
    const nextStep = currentStep + 1;
    
    console.log('🔄 Next step:', currentStep, '->', nextStep); // Debug log
    
    // Validate nextStep
    if (isNaN(nextStep) || nextStep < 0) {
        console.error('❌ Invalid nextStep:', nextStep);
        return;
    }
    
    // Update step in database
    try {
        const res = await fetch('/api/onboarding/step', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uid, step: nextStep })
        });
        const data = await res.json();
        console.log('✅ Step update response:', data);
    } catch (e) {
        console.error('❌ Error updating onboarding step:', e);
    }
    
    // Check if this is the last step (we have 4 steps: 0,1,2,3)
    if (nextStep >= 3) {
        completeOnboarding();
    } else {
        onboardingModal.remove();
        onboardingModal = null;
        showOnboardingModal(nextStep);
    }
}

function previousOnboardingStep() {
    const stepElement = onboardingModal.querySelector('div > div:last-child');
    if (!stepElement) {
        console.error('❌ Step element not found in previous');
        return;
    }
    
    const stepText = stepElement.textContent;
    const currentStep = parseInt(stepText.split(' / ')[0]) - 1;
    const prevStep = Math.max(0, currentStep - 1);
    
    console.log('⬅️ Previous step:', currentStep, '->', prevStep);
    
    onboardingModal.remove();
    onboardingModal = null;
    showOnboardingModal(prevStep);
}

async function completeOnboarding() {
    const uid = new URLSearchParams(window.location.search).get("uid");
    
    console.log('Completing onboarding for user:', uid); // Debug log
    
    try {
        const res = await fetch('/api/onboarding/complete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uid })
        });
        const data = await res.json();
        console.log('Onboarding completion response:', data);
        
        // Show completion message
        onboardingModal.innerHTML = `
            <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); 
                        border-radius: 20px; padding: 30px; max-width: 400px; 
                        margin: 20px; color: white; text-align: center;">
                <h2 style="margin: 0 0 20px 0; font-size: 28px;">🎉 Поздравляем!</h2>
                <p style="margin: 20px 0; font-size: 18px;">
                    Вы завершили обучение.
                </p>
                <p style="margin: 20px 0; font-size: 16px;">
                    Теперь вы можете начать зарабатывать DOMIT.
                </p>
                <button onclick="closeOnboarding()" 
                    style="background: white; border: none; 
                           padding: 15px 30px; border-radius: 10px; color: #059669; 
                           cursor: pointer; font-size: 16px; font-weight: bold;">
                    Начать работу →
                </button>
            </div>
        `;
        
        setTimeout(() => {
            closeOnboarding();
            // Show first task hint
            showFirstTaskHint();
        }, 5000);
        
    } catch (e) {
        console.error('Error completing onboarding:', e);
        closeOnboarding();
    }
}

function closeOnboarding() {
    console.log('🔒 Closing onboarding modal');
    if (onboardingModal) {
        onboardingModal.remove();
        onboardingModal = null;
        console.log('✅ Onboarding modal closed');
    } else {
        console.log('⚠️ No onboarding modal to close');
    }
}

function showFirstTaskHint() {
    const hint = document.createElement('div');
    hint.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: linear-gradient(135deg, #3b82f6, #1d4ed8);
        color: white;
        padding: 15px 20px;
        border-radius: 15px;
        font-size: 14px;
        z-index: 9999;
        box-shadow: 0 8px 24px rgba(59, 130, 246, 0.3);
        animation: slideIn 0.5s ease-out;
        max-width: 300px;
    `;
    hint.innerHTML = `
        <div style="font-weight: bold; margin-bottom: 8px;">💡 Совет</div>
        <div>Начните с первого task-а, нажав кнопку "Выполнить".</div>
    `;
    
    document.body.appendChild(hint);
    
    // Add animations if not already present
    if (!document.getElementById('onboarding-animations')) {
        const style = document.createElement('style');
        style.id = 'onboarding-animations';
        style.textContent = `
            @keyframes slideIn {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
            @keyframes slideOut {
                from { transform: translateX(0); opacity: 1; }
                to { transform: translateX(100%); opacity: 0; }
            }
        `;
        document.head.appendChild(style);
    }
    
    setTimeout(() => {
        hint.style.animation = 'slideOut 0.5s ease-in';
        setTimeout(() => {
            if (hint.parentNode) {
                hint.parentNode.removeChild(hint);
            }
        }, 500);
    }, 8000);
}

function closeTasks() {
    window.location.href = "../index.html";
}

function hideAll() {
    document.querySelectorAll(".screen").forEach(s => {
        s.style.display = "none";
    });
}

function openCategory(cat) {
    hideAll();
    var s = document.getElementById("screen-" + cat);
    if (s) {
        s.style.display = "block";
        try { s.scrollIntoView({ behavior: "smooth", block: "start" }); } catch(_){ window.scrollTo({ top: 0, behavior: "smooth" }); }
    }
}



async function loadBalance() {
    const uid = new URLSearchParams(window.location.search).get("uid");

    if (!uid) {
        document.getElementById("tasks-balance").textContent = "—";
        return;
    }

    try {
        // Add cache-busting parameter to force fresh data
        const timestamp = Date.now();
        const res = await fetch(`/api/user/${uid}?t=${timestamp}`);
        const data = await res.json();

        const el = document.getElementById("tasks-balance");
        if (!el) return;
        if (data.ok && data.user) {
            const bal = Number(data.user.balance_usd || 0).toFixed(3) + " DOMIT";
            const pend = Number(data.user.pending_micro_usd || 0);
            if (pend && pend > 0) {
                el.innerHTML = bal +
                  " <span style=\"margin-left:8px;color:#9bd6ff;font-size:12px;\">(" +
                  pend.toFixed(6) + " В ожидании)</span>";
            } else {
                el.textContent = bal;
            }
            
            // Update daily bonus level display
            updateDailyLevelDisplay(data.user);
        } else {
            el.textContent = "—";
        }
    } catch {
        const el = document.getElementById("tasks-balance");
        if (el) el.textContent = "—";
    }
}

function updateDailyLevelDisplay(userData) {
    console.log("🔍 DEBUG: updateDailyLevelDisplay called with:", userData);
    
    const dailyTasksCompleted = userData.daily_tasks_completed || 0;
    const dailyBonusLevel = userData.daily_bonus_level || 1;
    const has2xMultiplier = userData.has_2x_multiplier || false;
    
    console.log(`🔍 DEBUG: dailyTasksCompleted=${dailyTasksCompleted}, level=${dailyBonusLevel}, 2x=${has2xMultiplier}`);
    
    // Update level display
    const levelEl = document.getElementById("daily-level");
    if (levelEl) {
        levelEl.textContent = `Level ${dailyBonusLevel}`;
    }
    
    // Update tasks count
    const tasksCountEl = document.getElementById("daily-tasks-count");
    if (tasksCountEl) {
        const nextMilestone = getNextMilestone(dailyTasksCompleted);
        tasksCountEl.textContent = `${dailyTasksCompleted}/${nextMilestone}`;
    }
    
    // Update progress bar with animation
    const progressEl = document.getElementById("daily-progress");
    if (progressEl) {
        const nextMilestone = getNextMilestone(dailyTasksCompleted);
        const progress = Math.min((dailyTasksCompleted / nextMilestone) * 100, 100);
        
        // Add smooth transition
        progressEl.style.transition = 'width 0.5s ease-in-out';
        progressEl.style.width = `${progress}%`;
        
        // Change color based on progress
        if (progress >= 100) {
            progressEl.style.background = '#ffd700'; // Gold for completed milestone
        } else if (progress >= 75) {
            progressEl.style.background = '#4ade80'; // Green for high progress
        } else if (progress >= 50) {
            progressEl.style.background = '#60a5fa'; // Blue for medium progress
        } else {
            progressEl.style.background = '#4ade80'; // Default green
        }
    }
    
    // Update next bonus text
    const nextBonusEl = document.getElementById("next-bonus-text");
    if (nextBonusEl) {
        const nextBonusInfo = getNextBonusInfo(dailyTasksCompleted);
        nextBonusEl.textContent = nextBonusInfo;
    }
    
    // Show/hide 2x multiplier status
    const twoXStatusEl = document.getElementById("2x-status");
    if (twoXStatusEl) {
        twoXStatusEl.style.display = has2xMultiplier ? "block" : "none";
        if (has2xMultiplier) {
            // Add pulsing animation for 2x multiplier
            twoXStatusEl.style.animation = 'pulse 1.5s infinite';
        }
    }
    
    // Add console log for debugging
    console.log(`📊 Daily Level Updated: Level ${dailyBonusLevel}, Tasks: ${dailyTasksCompleted}, 2x: ${has2xMultiplier}`);
}

function getNextMilestone(currentTasks) {
    if (currentTasks < 10) return 10;
    if (currentTasks < 30) return 30;
    if (currentTasks < 100) return 100;
    if (currentTasks < 200) return 200;
    return currentTasks + 1; // After 200, every task counts
}

function getNextBonusInfo(currentTasks) {
    if (currentTasks < 10) return "Next bonus: 0.25 DOMIT at 10 tasks";
    if (currentTasks < 30) return "Next bonus: 0.50 DOMIT at 30 tasks";
    if (currentTasks < 100) return "Next bonus: 1.00 DOMIT at 100 tasks";
    if (currentTasks < 200) return "Next bonus: 1.50 DOMIT at 200 tasks";
    return "🔥 2x Multiplier active for all tasks!";
}

function showBonusNotification(bonusAmount, newLevel) {
    // Create notification element
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        padding: 20px 30px;
        border-radius: 15px;
        font-size: 18px;
        font-weight: bold;
        z-index: 10000;
        box-shadow: 0 10px 30px rgba(0,0,0,0.3);
        animation: bonusPop 0.5s ease-out;
        text-align: center;
    `;
    
    if (newLevel === 5) {
        notification.innerHTML = `
            <div style="font-size: 24px; margin-bottom: 10px;">🔥</div>
            <div>Daily Bonus Level ${newLevel}!</div>
            <div style="font-size: 14px; margin-top: 5px;">+${bonusAmount} DOMIT</div>
            <div style="font-size: 12px; margin-top: 10px; color: #ffd700;">2x Multiplier Activated!</div>
        `;
    } else {
        notification.innerHTML = `
            <div style="font-size: 24px; margin-bottom: 10px;">🎉</div>
            <div>Daily Bonus Level ${newLevel}!</div>
            <div style="font-size: 14px; margin-top: 5px;">+${bonusAmount} DOMIT</div>
        `;
    }
    
    document.body.appendChild(notification);
    
    // Remove notification after 3 seconds
    setTimeout(() => {
        notification.style.animation = 'bonusFade 0.5s ease-out';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 500);
    }, 3000);
    
    // Add CSS animations if not already added
    if (!document.getElementById('bonus-animations')) {
        const style = document.createElement('style');
        style.id = 'bonus-animations';
        style.textContent = `
            @keyframes bonusPop {
                0% { transform: translate(-50%, -50%) scale(0.5); opacity: 0; }
                50% { transform: translate(-50%, -50%) scale(1.1); }
                100% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
            }
            @keyframes bonusFade {
                0% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
                100% { transform: translate(-50%, -50%) scale(0.8); opacity: 0; }
            }
            @keyframes pulse {
                0% { transform: scale(1); opacity: 1; }
                50% { transform: scale(1.05); opacity: 0.8; }
                100% { transform: scale(1); opacity: 1; }
            }
        `;
        document.head.appendChild(style);
    }
}

// Check for bonus updates after task completion
async function checkBonusUpdate() {
    const uid = new URLSearchParams(window.location.search).get("uid");
    if (!uid) return;
    
    try {
        // Add cache-busting parameter to force fresh data
        const timestamp = Date.now();
        const res = await fetch(`/api/user/${uid}?t=${timestamp}`);
        const data = await res.json();
        
        if (data.ok && data.user) {
            const previousLevel = window.currentDailyLevel || 1;
            const newLevel = data.user.daily_bonus_level || 1;
            
            if (newLevel > previousLevel) {
                // Calculate bonus amount based on level
                let bonusAmount = 0;
                if (newLevel === 2) bonusAmount = 0.25;
                else if (newLevel === 3) bonusAmount = 0.50;
                else if (newLevel === 4) bonusAmount = 1.00;
                else if (newLevel === 5) bonusAmount = 1.50;
                
                showBonusNotification(bonusAmount, newLevel);
                window.currentDailyLevel = newLevel;
            }
            
            updateDailyLevelDisplay(data.user);
        }
    } catch (e) {
        console.error('Error checking bonus update:', e);
    }
}

async function loadTasks() {
    const uid = new URLSearchParams(window.location.search).get("uid");

    try {
        const res = await fetch(`/api/tasks/${uid}`);
        const data = await res.json();

        console.log("TASK RESPONSE:", data);

        if (!data.ok || !data.tasks) return;

        window.ALL_TASKS = data.tasks;

        renderTasks(data.tasks);

    } catch (err) {
        console.error("TASK LOAD ERROR:", err);
    }
}

function renderTasks(tasks) {
    const categories = {
        video: document.getElementById("screen-video"),
        follow: document.getElementById("screen-follow"),
        invite: document.getElementById("screen-invite"),
        game: document.getElementById("screen-game"),
        special: document.getElementById("screen-special")
    };

    // Clear only dynamically rendered cards, keep static buttons (e.g., Monetag)
    Object.values(categories).forEach(cat => {
        if (!cat) return;
        cat.querySelectorAll(".task-card[data-dyn='1']").forEach(e => e.remove());
    });

    tasks.forEach(task => {
        const card = document.createElement("div");
        card.className = "task-card";
        card.setAttribute('data-dyn', '1');

        card.innerHTML = `
            <div><strong>${task.title}</strong></div>
            <div>${task.description}</div>
            <button onclick="performTask(${task.id})">
                Выполнить → +${task.reward}
            </button>
        `;

        const key = task.category || task.type;

        if (categories[key]) {
            categories[key].appendChild(card);
        }
    });
}

function openTaskBrowser(url) {
    var m = document.getElementById("task-browser-modal");
    var f = document.getElementById("task-browser-frame");
    var u = document.getElementById("tb-url");
    if (!m || !f) return false;
    if (u) u.textContent = url;
    m.style.display = "block";
    try { f.src = url; } catch(e){}
    var ext = document.getElementById("tb-external");
    var rel = document.getElementById("tb-reload");
    var cls = document.getElementById("tb-close");
    if (ext) ext.onclick = function(){
        if (window.Telegram && window.Telegram.WebApp && typeof window.Telegram.WebApp.openLink === 'function') {
            try { window.Telegram.WebApp.openLink(url, {try_instant_view: false}); } catch(_){ }
        } else {
            try { window.open(url, "_blank"); } catch(e){ window.location.href = url; }
        }
    };
    if (rel) rel.onclick = function(){
        try { f.contentWindow.location.reload(); } catch(e){ f.src = url; }
    };
    if (cls) cls.onclick = function(){
        m.style.display = "none";
        f.src = "about:blank";
    };
    setTimeout(function(){
        var loaded = false;
        try { loaded = !!(f.contentDocument && f.contentDocument.body && f.contentDocument.body.childElementCount > 0); } catch(_){}
        if (!loaded && ext) ext.click();
    }, 1200);
    return true;
}

async function performTask(taskId) {
    const uid = new URLSearchParams(window.location.search).get("uid");

    const task = window.ALL_TASKS?.find(t => t.id === taskId);

    if (!task) return;

    const btn = document.querySelector(`button[onclick="performTask(${taskId})"]`);
    if (btn) btn.textContent = "⏳ Загрузка...";

    try {
        const res = await fetch(`/api/task/generate_link`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user_id: uid, task_id: taskId })
        });
        const data = await res.json();
        if (!data.ok) {
            if (btn) btn.textContent = `Выполнить → +${task.reward}`;
            alert("❌ Ошибка при генерации ссылки");
            return;
        }
        const shortU = data.short_url || "";
        const directU = data.direct_url || (task.url || "");
        const attemptId = data.attempt_id || "";
        var msg = "Внимание!\n\n1) На открывшейся странице дождитесь завершения таймера.\n2) Нажмите «Get Link».\n3) Нажмите «Open/Открыть».\n4) Если страница не загружается, попробуйте Firefox/Brave/Opera или откройте через внешний браузер.";
        try {
            if (window.Telegram && window.Telegram.WebApp && typeof window.Telegram.WebApp.showPopup === 'function') {
                window.Telegram.WebApp.showPopup({ message: msg });
            } else {
                console.log("INFO:", msg);
            }
        } catch(_pm) {}
        try {
            var isiOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
            if (window.Telegram && window.Telegram.WebApp && typeof window.Telegram.WebApp.openLink === 'function') {
                window.Telegram.WebApp.openLink(directU, { try_instant_view: false });
            } else if (isiOS) {
                window.location.href = directU;
            } else {
                try { window.open(directU, "_blank"); } catch(e) { window.location.href = directU; }
            }
        } catch(_e) { window.location.href = directU; }
        try { openTaskBrowser(directU); } catch(_m) {}
        
        // Start checking for task completion more frequently
        startTaskCompletionMonitoring(taskId);
        
    } catch (e) {
        if (btn) btn.textContent = `Выполнить → +${task.reward}`;
        alert("❌ Ошибка сервера");
        return;
    }
}

function startTaskCompletionMonitoring(taskId) {
    // Check every 1 second for task completion (more responsive)
    const checkInterval = setInterval(async () => {
        try {
            const uid = new URLSearchParams(window.location.search).get("uid");
            const timestamp = Date.now();
            const res = await fetch(`/api/task/status?uid=${uid}&task_id=${taskId}&t=${timestamp}`);
            const data = await res.json();
            
            if (data.completed) {
                clearInterval(checkInterval);
                
                // Force immediate UI update with fresh data
                console.log(`✅ Task ${taskId} completed! Updating UI immediately...`);
                
                // Show completion feedback immediately
                showTaskCompletionFeedback();
                
                // Wait a moment for backend to process, then force update
                setTimeout(async () => {
                    await loadBalance();
                    
                    // Also check for bonus updates
                    await checkBonusUpdate();
                    
                    // Show success message
                    showSuccessMessage(`Task completed! Progress updated.`);
                    
                    // Check if this is first task completed
                    checkFirstTaskCompletion();
                }, 1000); // Wait 1 second for backend processing
            }
        } catch (e) {
            console.error('Error checking task status:', e);
        }
    }, 1000); // Check every 1 second for faster response
    
    // Stop checking after 5 minutes to avoid infinite polling
    setTimeout(() => {
        clearInterval(checkInterval);
    }, 300000);
}

function showTaskCompletionFeedback() {
    // Create a subtle completion indicator
    const feedback = document.createElement('div');
    feedback.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: linear-gradient(135deg, #10b981, #059669);
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 600;
        z-index: 10001;
        box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
        animation: slideIn 0.3s ease-out;
    `;
    feedback.textContent = '✅ Task completed!';
    
    document.body.appendChild(feedback);
    
    // Remove after 2 seconds
    setTimeout(() => {
        feedback.style.animation = 'slideOut 0.3s ease-in';
        setTimeout(() => {
            if (feedback.parentNode) {
                feedback.parentNode.removeChild(feedback);
            }
        }, 300);
    }, 2000);
    
    // Add animations if not already present
    if (!document.getElementById('task-feedback-animations')) {
        const style = document.createElement('style');
        style.id = 'task-feedback-animations';
        style.textContent = `
            @keyframes slideIn {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
            @keyframes slideOut {
                from { transform: translateX(0); opacity: 1; }
                to { transform: translateX(100%); opacity: 0; }
            }
        `;
        document.head.appendChild(style);
    }
}

async function checkFirstTaskCompletion() {
    const uid = new URLSearchParams(window.location.search).get("uid");
    if (!uid) return;
    
    try {
        const res = await fetch(`/api/user/${uid}`);
        const data = await res.json();
        
        if (data.ok && data.user && !data.user.first_task_completed) {
            // Mark first task as completed
            await fetch('/api/first_task/complete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ uid })
            });
            
            // Show celebration
            showFirstTaskCelebration();
        }
    } catch (e) {
        console.error('Error checking first task completion:', e);
    }
}

function showFirstTaskCelebration() {
    const celebration = document.createElement('div');
    celebration.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: linear-gradient(135deg, #fbbf24, #f59e0b);
        color: white;
        padding: 30px;
        border-radius: 20px;
        font-size: 20px;
        font-weight: bold;
        z-index: 10003;
        box-shadow: 0 15px 35px rgba(251, 191, 36, 0.3);
        animation: celebrationPop 0.6s ease-out;
        text-align: center;
        max-width: 350px;
    `;
    celebration.innerHTML = `
        <div style="font-size: 48px; margin-bottom: 15px;">🎊</div>
        <div>Поздравляем!</div>
        <div style="font-size: 16px; margin-top: 10px; font-weight: normal;">
            Вы выполнили свой первый task!<br>
            Бонус +0.01 DOMIT
        </div>
    `;
    
    document.body.appendChild(celebration);
    
    // Add celebration animation
    if (!document.getElementById('celebration-animations')) {
        const style = document.createElement('style');
        style.id = 'celebration-animations';
        style.textContent = `
            @keyframes celebrationPop {
                0% { transform: translate(-50%, -50%) scale(0.3); opacity: 0; }
                50% { transform: translate(-50%, -50%) scale(1.1); }
                100% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
            }
        `;
        document.head.appendChild(style);
    }
    
    setTimeout(() => {
        celebration.style.animation = 'fadeOut 0.5s ease-in';
        setTimeout(() => {
            if (celebration.parentNode) {
                celebration.parentNode.removeChild(celebration);
            }
        }, 500);
    }, 4000);
}

function showSuccessMessage(message) {
    // Create success notification
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: linear-gradient(135deg, #3b82f6, #1d4ed8);
        color: white;
        padding: 16px 24px;
        border-radius: 12px;
        font-size: 15px;
        font-weight: 600;
        z-index: 10002;
        box-shadow: 0 8px 24px rgba(59, 130, 246, 0.3);
        animation: bounceIn 0.5s ease-out;
        text-align: center;
    `;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    // Remove after 3 seconds
    setTimeout(() => {
        notification.style.animation = 'fadeOut 0.3s ease-out';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 3000);
    
    // Add animations if not already present
    if (!document.getElementById('success-message-animations')) {
        const style = document.createElement('style');
        style.id = 'success-message-animations';
        style.textContent = `
            @keyframes bounceIn {
                0% { transform: translateX(-50%) scale(0.8); opacity: 0; }
                50% { transform: translateX(-50%) scale(1.05); }
                100% { transform: translateX(-50%) scale(1); opacity: 1; }
            }
            @keyframes fadeOut {
                from { transform: translateX(-50%) scale(1); opacity: 1; }
                to { transform: translateX(-50%) scale(0.9); opacity: 0; }
            }
        `;
        document.head.appendChild(style);
    }
}



// --------------------------------------
// Start
// --------------------------------------

hideAll();
openCategory('special');
loadTasks();
loadBalance();

// Set up periodic bonus checking (reduced frequency to avoid conflicts)
setInterval(checkBonusUpdate, 5000); // Check every 5 seconds instead of 2

// Also update the display more frequently but with cache-busting
setInterval(() => {
    const uid = new URLSearchParams(window.location.search).get("uid");
    if (uid) {
        loadBalance(); // This will update daily level display with fresh data
    }
}, 4000); // Update every 4 seconds instead of 3

// Store initial level
loadBalance().then(() => {
    const uid = new URLSearchParams(window.location.search).get("uid");
    if (uid) {
        const timestamp = Date.now();
        fetch(`/api/user/${uid}?t=${timestamp}`)
            .then(res => res.json())
            .then(data => {
                if (data.ok && data.user) {
                    window.currentDailyLevel = data.user.daily_bonus_level || 1;
                }
            })
            .catch(e => console.error('Error setting initial level:', e));
    }
    
    // Start onboarding check
    checkOnboarding();
});
