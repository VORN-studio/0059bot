let tg = window.Telegram.WebApp;
const uid = new URLSearchParams(window.location.search).get("uid");

let running = false;
let currentMultiplier = 1.00;
let interval = null;

function crashPoint() {
    // իրական crash random (կարող ենք backend-ով փոխել)
    return (Math.random() * 3 + 1).toFixed(2); // min 1x max 4x
}

document.getElementById("play-btn").addEventListener("click", () => {
    if (running) return;

    let bet = Number(document.getElementById("bet").value);
    if (bet <= 0) {
        document.getElementById("status").textContent = "Մուտքագրիր ճիշտ գումար։";
        return;
    }

    running = true;
    currentMultiplier = 1.00;
    document.getElementById("status").textContent = "Խաղը սկսվեց...";

    const point = crashPoint();
    console.log("Crash at:", point);

    interval = setInterval(() => {
        currentMultiplier += 0.05;
        document.getElementById("multiplier").textContent = currentMultiplier.toFixed(2) + "x";

        if (currentMultiplier >= point) {
            clearInterval(interval);
            running = false;
            document.getElementById("multiplier").textContent = point + "x 💥 CRASH";
            document.getElementById("status").textContent = "Դու պարտվեցիր։";
        }
    }, 100);
});
