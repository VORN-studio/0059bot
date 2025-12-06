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

// default
hideAll();
