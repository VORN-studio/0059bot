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

const API_BASE = "https://domino-backend-iavj.onrender.com";

async function loadBalance() {
    const uid = new URLSearchParams(window.location.search).get("uid");

    if (!uid) {
        document.getElementById("tasks-balance").textContent = "—";
        return;
    }

    try {
        const res = await fetch(`${API_BASE}/api/user/${uid}`);
        const data = await res.json();

        if (data.ok && data.user) {
            document.getElementById("tasks-balance").textContent =
                data.user.balance_usd.toFixed(2) + " $";
        }
    } catch {
        document.getElementById("tasks-balance").textContent = "—";
    }
}

async function addReward(amount) {
    const uid = new URLSearchParams(window.location.search).get("uid");

    const res = await fetch(`${API_BASE}/api/task_reward`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            user_id: uid,
            amount: amount
        })
    });

    const data = await res.json();

    if (data.ok) {
        // update balance display
        document.getElementById("tasks-balance").textContent =
            data.new_balance.toFixed(2) + " $";
    }
}

async function loadTasks() {
    const uid = new URLSearchParams(window.location.search).get("uid");

    try {
        const res = await fetch(`${API_BASE}/api/tasks/${uid}`);
        const data = await res.json();

        console.log("TASK RESPONSE:", data);

        if (!data.ok || !data.tasks) return;

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

    // clean each screen
    Object.values(categories).forEach(cat => {
        cat.querySelectorAll(".task-card").forEach(e => e.remove());
    });

    tasks.forEach(task => {
        const el = document.createElement("div");
        el.className = "task-card";
        el.innerHTML = `
            <div><strong>${task.title}</strong></div>
            <div>${task.description}</div>
            <button onclick="performTask(${task.id})">Perform</button>
        `;

        if (categories[task.type]) {
            categories[task.type].appendChild(el);
        }
    });
}

// load tasks when page opens
loadTasks();


addReward();
loadBalance();
// default
hideAll();
