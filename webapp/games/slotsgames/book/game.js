// back button
document.getElementById("backBtn").onclick = () => {
    window.location.href = `${window.location.origin}/webapp/slots.html${window.location.search}`;
};

// Later we will add full engine here
console.log("Book of Domino loaded successfully");
