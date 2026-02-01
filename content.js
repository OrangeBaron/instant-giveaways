if (!window.location.href.includes("/giveaway/")) {
    const btn = document.createElement("button");
    btn.innerText = "Partecipa ai Giveaway";
    
    Object.assign(btn.style, {
        position: "fixed",
        bottom: "20px",
        right: "20px",
        zIndex: "9999",
        padding: "15px 20px",
        backgroundColor: "#ff5400",
        color: "white",
        border: "none",
        borderRadius: "5px",
        cursor: "pointer",
        fontWeight: "bold",
        boxShadow: "0 4px 6px rgba(0,0,0,0.3)"
    });

    btn.addEventListener("click", () => {
        if (confirm("Vuoi iniziare la procedura automatica? Verranno aperte e chiuse molte schede.")) {
            chrome.runtime.sendMessage({ action: "start_giveaway_loop" });
            
            btn.innerText = "In corso...";
            btn.disabled = true;
            btn.style.backgroundColor = "#555";
            btn.style.cursor = "wait";
        }
    });

    document.body.appendChild(btn);

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === "loop_completed") {
            btn.innerText = "Finito!";
            btn.style.backgroundColor = "#28a745";
            btn.style.cursor = "default";

            setTimeout(() => {
                btn.innerText = "Partecipa ai Giveaway";
                btn.disabled = false;
                btn.style.backgroundColor = "#ff5400";
                btn.style.cursor = "pointer";
            }, 3000);
        }
    });
}