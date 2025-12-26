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

        if (data.ok && data.user) {
            document.getElementById("tasks-balance").textContent =
                data.user.balance_usd.toFixed(2) + " $";
        }
    } catch {
        document.getElementById("tasks-balance").textContent = "—";
    }
}

async function loadTasks() {
    const uid = new URLSearchParams(window.location.search).get("uid");

    try {
        const res = await fetch(`/api/tasks/${uid}`);
        const data = await res.json();

        console.log("TASK RESPONSE:", data);

        if (!data.ok || !data.tasks) return;

        // ✔ այստեղ ենք պահում
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

    // Clear old cards
    Object.values(categories).forEach(cat => {
        cat.querySelectorAll(".task-card").forEach(e => e.remove());
    });

    tasks.forEach(task => {
        const card = document.createElement("div");
        card.className = "task-card";

        card.innerHTML = `
            <div><strong>${task.title}</strong></div>
            <div>${task.description}</div>
            <button onclick="performTask(${task.id})">
                Կատարել → +${task.reward}
            </button>
        `;

        const key = task.category || task.type;

        if (categories[key]) {
            categories[key].appendChild(card);
        }
    });
}

async function performTask(taskId) {
    const uid = new URLSearchParams(window.location.search).get("uid");

    const task = window.ALL_TASKS?.find(t => t.id === taskId);

    if (task) {
        // 1. Generate unique link
        try {
            const btn = document.querySelector(`button[onclick="performTask(${taskId})"]`);
            if(btn) btn.textContent = "⏳ Loading...";

            const res = await fetch("/api/task/generate_link", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({user_id: uid, task_id: taskId})
            });
            const data = await res.json();
            
            if(btn) btn.textContent = "Կատարել → +" + task.reward;

            if (data.ok) {
                const shortU = data.short_url || "";
                const directU = data.direct_url || "";
                if (!shortU && !directU) {
                    alert("❌ Link generation failed. Try again.");
                    return;
                }
                const safeUrl = `${window.location.origin}/safe_go?short=${encodeURIComponent(shortU)}&direct=${encodeURIComponent(directU)}&uid=${encodeURIComponent(uid)}&task_id=${encodeURIComponent(taskId)}`;
                
                // 2. Open external - Force external browser to avoid CSRF/cookie issues in Telegram Webview
                if (window.Telegram && window.Telegram.WebApp && typeof window.Telegram.WebApp.openLink === 'function') {
                     // try_instant_view: false ensures it opens in system browser (Chrome/Safari) not internal Telegram browser
                    window.Telegram.WebApp.openLink(safeUrl, {try_instant_view: false});
                } else {
                    // Fallback for non-Telegram environments
                    window.open(safeUrl, "_blank");
                }
            } else {
                alert("❌ Link generation failed. Try again.");
            }
        } catch (e) {
            console.error(e);
            alert("❌ Error: " + e.message);
        }
    }

    // Attempt register (analytics)
    fetch(`/api/task_attempt_create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: uid, task_id: taskId })
    });

}



// --------------------------------------
// Start
// --------------------------------------

hideAll();
loadTasks();
loadBalance();
