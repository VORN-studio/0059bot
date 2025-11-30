window.addEventListener("load", () => {

    // Show loading for 1.5 seconds, then show the main app
    setTimeout(() => {
        document.getElementById("loading-screen").classList.add("hidden");
        document.getElementById("main-app").classList.remove("hidden");
    }, 1500);

});
