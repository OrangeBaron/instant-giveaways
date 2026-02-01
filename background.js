const JSON_URL = "https://raw.githubusercontent.com/enzomtpyt/instantgaminggiveawaylist/master/json.json";

let giveawayIds = [];
let currentIndex = 0;
let isRunning = false;
let senderTabId = null;

const BUTTON_SELECTOR = "#giveaway-app > div.participation-state > div > button"; 

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "start_giveaway_loop") {
        if (!isRunning) {
            isRunning = true;
            
            if (sender.tab) {
                senderTabId = sender.tab.id;
            }

            console.log("Avvio procedura. Recupero lista giveaway...");
            
            fetchGiveaways().then(() => {
                if (giveawayIds.length > 0) {
                    currentIndex = 0;
                    processNextGiveaway();
                } else {
                    console.log("Nessun giveaway trovato o errore nel recupero.");
                    resetState("Errore o nessun giveaway");
                }
            });
        }
    }
});

function notifyCompletion() {
    if (senderTabId) {
        chrome.tabs.sendMessage(senderTabId, { action: "loop_completed" })
            .catch(() => console.log("La tab originale sembra essere stata chiusa."));
    }
    isRunning = false;
    senderTabId = null;
}

async function fetchGiveaways() {
    try {
        const response = await fetch(JSON_URL);
        if (!response.ok) throw new Error("Network response was not ok");
        
        const data = await response.json();
        
        if (data.alive && Array.isArray(data.alive)) {
            giveawayIds = data.alive;
            console.log(`Lista recuperata con successo: ${giveawayIds.length} giveaway attivi.`);
        } else {
            console.error("Il formato del JSON non è corretto (manca la chiave 'alive').");
            giveawayIds = [];
        }
    } catch (error) {
        console.error("Errore durante il fetch del JSON:", error);
        giveawayIds = [];
    }
}

function processNextGiveaway() {
    if (currentIndex >= giveawayIds.length) {
        console.log("Tutti i giveaway completati!");
        notifyCompletion(); // <--- Qui avvisiamo il content script
        return;
    }

    const id = giveawayIds[currentIndex];
    const url = `https://www.instant-gaming.com/fr/giveaway/${id}?igr=gamer-42eed53`;

    console.log(`Processando (${currentIndex + 1}/${giveawayIds.length}): ${id}`);

    chrome.tabs.create({ url: url, active: true }, (tab) => {
        const listener = (tabId, changeInfo) => {
            if (tabId === tab.id && changeInfo.status === 'complete') {
                chrome.tabs.onUpdated.removeListener(listener);
                
                chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: clickParticipate,
                    args: [BUTTON_SELECTOR]
                }).then(() => {
                    setTimeout(() => {
                        chrome.tabs.remove(tab.id);
                        currentIndex++;
                        processNextGiveaway();
                    }, 1000);
                }).catch(err => {
                    console.error("Errore script:", err);
                    chrome.tabs.remove(tab.id);
                    currentIndex++;
                    processNextGiveaway();
                });
            }
        };
        chrome.tabs.onUpdated.addListener(listener);
    });
}

function clickParticipate(selector) {
    const btn = document.querySelector(selector);
    if (btn) {
        console.log("Bottone trovato, clicco...");
        btn.click();
    } else {
        console.log("Bottone 'Partecipa' non trovato con il selettore:", selector);
        const allButtons = document.querySelectorAll('button, a.button');
        for (let b of allButtons) {
            if (b.innerText.toLowerCase().includes("participer")) {
                b.click();
                break;
            }
        }
    }
}