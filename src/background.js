chrome.runtime.onInstalled.addListener(() => {
    console.log("deX Installed");
    
    if (chrome.sidePanel) {
        chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
            .catch(error => console.error("Error setting panel behavior:", error));
    }
});

chrome.action.onClicked.addListener(async (tab) => {
    try {
        if (chrome.sidePanel) {
            await chrome.sidePanel.open({ windowId: tab.windowId });
        } else {
            chrome.tabs.create({ url: 'src/finder.html' });
        }
    } catch (error) {
        console.error('Error opening side panel:', error);
        chrome.tabs.create({ url: 'src/finder.html' });
    }
});
