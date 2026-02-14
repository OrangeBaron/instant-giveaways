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
            console.error("Il formato del JSON non è corretto.");
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
        notifyCompletion();
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
                    func: processInteraction,
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

// Funzione principale iniettata nella pagina
async function processInteraction(selector) {
    const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    // 1. CLICCA PARTECIPA
    const btn = document.querySelector(selector);
    let clickSuccessful = false;

    if (btn) {
        console.log("Bottone trovato, clicco...");
        btn.click();
        clickSuccessful = true;
    } else {
        const allButtons = document.querySelectorAll('button, a.button');
        for (let b of allButtons) {
            if (b.innerText.toLowerCase().includes("participer")) {
                b.click();
                clickSuccessful = true;
                break;
            }
        }
    }

    if (!clickSuccessful) {
        console.log("Nessun bottone di partecipazione trovato. Controllo se ho già partecipato...");
    }

    // 2. ATTENDI COMPARSA DI <div class="participated">
    console.log("Attendo conferma partecipazione e caricamento reward...");
    
    let participatedDiv = null;
    let attempts = 0;
    const maxAttempts = 20;

    while (attempts < maxAttempts) {
        participatedDiv = document.querySelector("div.participated");
        if (participatedDiv) break;
        
        await wait(500);
        attempts++;
    }

    if (!participatedDiv) {
        console.warn("Timeout: Il div 'participated' non è apparso. Passo al prossimo.");
        return; 
    }

    // 3. GESTIONE REWARD
    const rewards = participatedDiv.querySelectorAll("a.button.reward");

    if (rewards.length > 0) {
        console.log(`Trovati ${rewards.length} reward. Clicco tutto in parallelo.`);
        
        rewards.forEach(rewardBtn => {
            if (!rewardBtn.classList.contains("success")) {
                rewardBtn.click();
            }
        });

        // 4. ATTENDI CHE TUTTI SIANO SUCCESS
        let allSuccess = false;
        let rewardAttempts = 0;
        const maxRewardAttempts = 30;

        while (!allSuccess && rewardAttempts < maxRewardAttempts) {
            const currentRewards = participatedDiv.querySelectorAll("a.button.reward");
            const pending = Array.from(currentRewards).filter(r => !r.classList.contains("success"));
            
            if (pending.length === 0) {
                allSuccess = true;
                console.log("Tutti i reward completati (success)!");
            } else {
                await wait(500);
                rewardAttempts++;
            }
        }

        if (!allSuccess) {
            console.warn("Timeout: Alcuni reward non si sono completati in tempo.");
        }
    } else {
        console.log("Nessun bottone reward trovato nel div.");
    }
}