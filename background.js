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

// Funzione iniettata nella pagina
async function processInteraction(selector) {
    const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    // 0. CONTROLLO PER GIVEAWAY TERMINATO
    if (document.querySelector("span.giveaway-over")) {
        console.log("Giveaway terminato (rilevato span.giveaway-over). Passo al prossimo.");
        return;
    }

    // 1. CLICCA PARTECIPA
    const btn = document.querySelector(selector);

    if (btn) {
        console.log("Bottone trovato, clicco...");
        btn.click();
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
        console.warn("Timeout: Il div 'participated' non è apparso (e non sembra terminato).");
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
                console.log("Tutti i reward completati!");
            } else {
                await wait(500);
                rewardAttempts++;
            }
        }
    }
}

// --- AUTO-REFERRAL ---
const MY_REFERRAL_CODE = "gamer-42eed53";
let referralInjected = false;

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (referralInjected) return;

    if (changeInfo.status === 'loading' && tab.url && tab.url.includes("instant-gaming.com")) {
        try {
            const urlObj = new URL(tab.url);
            const currentReferral = urlObj.searchParams.get("igr");

            if (currentReferral === MY_REFERRAL_CODE) {
                referralInjected = true;
                return;
            }

            urlObj.searchParams.set("igr", MY_REFERRAL_CODE);
            
            console.log("[Auto-Referral] Inserimento referral eseguito.");
            
            chrome.tabs.update(tabId, { url: urlObj.toString() });
            referralInjected = true;

        } catch (error) {
            console.error("Errore Auto-Referral:", error);
        }
    }
});