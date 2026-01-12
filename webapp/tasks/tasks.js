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
        const res = await fetch(`/api/user/${uid}`);
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
    const dailyTasksCompleted = userData.daily_tasks_completed || 0;
    const dailyBonusLevel = userData.daily_bonus_level || 1;
    const has2xMultiplier = userData.has_2x_multiplier || false;
    
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
    
    // Update progress bar
    const progressEl = document.getElementById("daily-progress");
    if (progressEl) {
        const nextMilestone = getNextMilestone(dailyTasksCompleted);
        const progress = Math.min((dailyTasksCompleted / nextMilestone) * 100, 100);
        progressEl.style.width = `${progress}%`;
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
    }
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
        `;
        document.head.appendChild(style);
    }
}

// Check for bonus updates after task completion
async function checkBonusUpdate() {
    const uid = new URLSearchParams(window.location.search).get("uid");
    if (!uid) return;
    
    try {
        const res = await fetch(`/api/user/${uid}`);
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
    } catch (e) {
        if (btn) btn.textContent = `Выполнить → +${task.reward}`;
        alert("❌ Ошибка сервера");
        return;
    }
}



// --------------------------------------
// Start
// --------------------------------------

hideAll();
openCategory('special');
loadTasks();
loadBalance();

// Set up periodic bonus checking
setInterval(checkBonusUpdate, 5000); // Check every 5 seconds

// Store initial level
loadBalance().then(() => {
    const uid = new URLSearchParams(window.location.search).get("uid");
    if (uid) {
        fetch(`/api/user/${uid}`)
            .then(res => res.json())
            .then(data => {
                if (data.ok && data.user) {
                    window.currentDailyLevel = data.user.daily_bonus_level || 1;
                }
            })
            .catch(e => console.error('Error setting initial level:', e));
    }
});
