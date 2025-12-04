const url = new URLSearchParams(window.location.search);
const UID = url.get("uid");

// Buttons
const backBtn = document.getElementById("backBtn");
const spinBtn = document.getElementById("spinBtn");
const depositBtn = document.getElementById("depositBtn");
const withdrawBtn = document.getElementById("withdrawBtn");

// Areas
const loader = document.getElementById("loader");
const gameArea = document.getElementById("game-area");

// Load UI after 500ms
setTimeout(() => {
    loader.classList.add("hide");
    gameArea.classList.remove("hide");
}, 500);

// Return to slots lobby
backBtn.onclick = () => {
    window.location.href =
        `${window.location.origin}/webapp/slots.html?uid=${UID}`;
};

// Dummy spin animation (later will add real engine)
spinBtn.onclick = () => {
    document.getElementById("status").textContent = "Պտտում է...";

    let symbols = ["A", "K", "Q", "J", "10", "📕"];
    for (let i = 1; i <= 5; i++) {
        let r = document.getElementById("reel" + i);
        r.innerHTML = "";

        for (let j = 0; j < 3; j++) {
            let s = symbols[Math.floor(Math.random() * symbols.length)];
            let div = document.createElement("div");
            div.textContent = s;
            div.style.padding = "20px 0";
            r.appendChild(div);
        }
    }

    setTimeout(() => {
        document.getElementById("status").textContent = "";
    }, 900);
};
