// ========== Mobile Performance ==========
(function() {
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  
  if (isMobile) {
    console.log('📱 Tasks: Mobile performance mode enabled');
    
    // Disable heavy animations
    const style = document.createElement('style');
    style.textContent = `
      *[class*="Float"],
      *[class*="Glow"],
      *[class*="Pulse"],
      *[class*="Shine"],
      *[class*="Shift"] {
        animation: none !important;
      }
    `;
    
    if (document.head) {
      document.head.appendChild(style);
    } else {
      document.addEventListener('DOMContentLoaded', () => {
        document.head.appendChild(style);
      });
    }
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
    document.getElementById("screen-" + cat).style.display = "block";
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
                  (0.0001).toFixed(6) + " սպասում)</span>";
            } else {
                el.textContent = bal;
            }
        } else {
            el.textContent = "—";
        }
    } catch {
        const el = document.getElementById("tasks-balance");
        if (el) el.textContent = "—";
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
    if (btn) btn.textContent = "⏳ Loading...";

    try {
        const res = await fetch(`/api/task/generate_link`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user_id: uid, task_id: taskId })
        });
        const data = await res.json();
        if (!data.ok) {
            if (btn) btn.textContent = `Выполнитьլ → +${task.reward}`;
            alert("❌ Ошибка при генерации ссылки");
            return;
        }
        const shortU = data.short_url || "";
        const directU = data.direct_url || (task.url || "");
        const attemptId = data.attempt_id || "";
        const safeUrl = `${window.location.origin}/webapp/tasks/safe_go.html?short=${encodeURIComponent(shortU)}&direct=${encodeURIComponent(directU)}&uid=${encodeURIComponent(uid)}&task_id=${encodeURIComponent(taskId)}&attempt_id=${encodeURIComponent(attemptId)}&reward=${encodeURIComponent(task.reward)}`;
        window.location.href = safeUrl;
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
