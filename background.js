const JSON_URL = "https://raw.githubusercontent.com/enzomtpyt/instantgaminggiveawaylist/master/json.json";

let giveawayIds = [];
let currentIndex = 0;
let isRunning = false;
let senderTabId = null;

// --- VARIABILI PER LA GESTIONE DELLA CODA ---
const MAX_CONCURRENT_TABS = 10;
const DELAY_BETWEEN_OPENS_MS = 1000;
let activeTabsCount = 0;
let isSpawning = false;

const BUTTON_SELECTOR = "#giveaway-app > div.participation-state > div > button"; 

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "start_giveaway_loop") {
        if (!isRunning) {
            isRunning = true;
            if (sender.tab) {
                senderTabId = sender.tab.id;
            }
            console.log("Avvio procedura in parallelo. Recupero lista giveaway...");
            fetchGiveaways().then(() => {
                if (giveawayIds.length > 0) {
                    currentIndex = 0;
                    activeTabsCount = 0;
                    manageQueue();
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
    activeTabsCount = 0;
    currentIndex = 0;
}

function resetState(reason) {
    console.warn("Procedura fermata:", reason);
    notifyCompletion();
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

// Funzione che gestisce le aperture rispettando il limite massimo e il delay
async function manageQueue() {
    // Evita che più chiamate avviino loop di aperture simultanei sovrapponendosi
    if (isSpawning) return;
    isSpawning = true;

    while (activeTabsCount < MAX_CONCURRENT_TABS && currentIndex < giveawayIds.length) {
        const id = giveawayIds[currentIndex];
        currentIndex++;
        activeTabsCount++;
        
        spawnTab(id);
        
        // Attendi 1 secondo prima di aprire la scheda successiva
        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_OPENS_MS));
    }

    isSpawning = false;
    
    checkCompletion();
}

// Funzione isolata per la singola tab
function spawnTab(id) {
    const url = `https://www.instant-gaming.com/fr/giveaway/${id}?igr=gamer-42eed53`;

    console.log(`Apro tab per (${currentIndex}/${giveawayIds.length}): ${id}`);

    // active: false permette alla tab di aprirsi in background senza darti fastidio
    chrome.tabs.create({ url: url, active: false }, (tab) => {
        const listener = (tabId, changeInfo) => {
            if (tabId === tab.id && changeInfo.status === 'complete') {
                chrome.tabs.onUpdated.removeListener(listener);
                
                chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: processInteraction,
                    args: [BUTTON_SELECTOR]
                }).then(() => {
                    setTimeout(() => {
                        closeTabAndNext(tab.id);
                    }, 1000);
                }).catch(err => {
                    console.error("Errore script:", err);
                    closeTabAndNext(tab.id);
                });
            }
        };
        chrome.tabs.onUpdated.addListener(listener);
    });
}

function closeTabAndNext(tabId) {
    chrome.tabs.remove(tabId, () => {
        if (chrome.runtime.lastError) {
            console.warn("Tab già chiusa o inesistente:", chrome.runtime.lastError.message);
        }
        activeTabsCount--;
        
        // Avvia la prossima tab se c'è spazio e ci sono ID rimanenti
        manageQueue(); 
        
        // Controlla se abbiamo finito del tutto
        checkCompletion(); 
    });
}

function checkCompletion() {
    if (currentIndex >= giveawayIds.length && activeTabsCount === 0) {
        console.log("Tutti i giveaway completati!");
        notifyCompletion();
    }
}

// Funzione iniettata nella pagina
async function processInteraction(selector) {
    const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    if (document.querySelector("span.giveaway-over")) {
        console.log("Giveaway terminato. Passo al prossimo.");
        return;
    }

    const btn = document.querySelector(selector);
    if (btn) {
        btn.click();
    }

    let participatedDiv = null;
    let attempts = 0;
    const maxAttempts = 600;

    while (attempts < maxAttempts) {
        participatedDiv = document.querySelector("div.participated");
        if (participatedDiv) break;
        await wait(100);
        attempts++;
    }

    if (!participatedDiv) return; 

    const rewards = participatedDiv.querySelectorAll("a.button.reward");

    if (rewards.length > 0) {
        rewards.forEach(rewardBtn => {
            if (!rewardBtn.classList.contains("success")) {
                rewardBtn.click();
            }
        });

        let allSuccess = false;
        let rewardAttempts = 0;
        const maxRewardAttempts = 600;

        while (!allSuccess && rewardAttempts < maxRewardAttempts) {
            const currentRewards = participatedDiv.querySelectorAll("a.button.reward");
            const pending = Array.from(currentRewards).filter(r => !r.classList.contains("success"));
            
            if (pending.length === 0) {
                allSuccess = true;
            } else {
                await wait(100);
                rewardAttempts++;
            }
        }
    }
}

// --- AUTO-REFERRAL (Gestito con un Set per supportare il parallelismo) ---
const MY_REFERRAL_CODE = "gamer-42eed53";
const injectedTabs = new Set(); 

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    // Se la tab è già stata processata, salta
    if (injectedTabs.has(tabId)) return;

    if (changeInfo.status === 'loading' && tab.url && tab.url.includes("instant-gaming.com")) {
        try {
            const urlObj = new URL(tab.url);
            const currentReferral = urlObj.searchParams.get("igr");

            if (currentReferral === MY_REFERRAL_CODE) {
                injectedTabs.add(tabId);
                return;
            }

            urlObj.searchParams.set("igr", MY_REFERRAL_CODE);
            chrome.tabs.update(tabId, { url: urlObj.toString() });
            injectedTabs.add(tabId);

        } catch (error) {
            console.error("Errore Auto-Referral:", error);
        }
    }
});

// Pulisci il Set quando le tab vengono chiuse per evitare memory leaks
chrome.tabs.onRemoved.addListener((tabId) => {
    injectedTabs.delete(tabId);
});