document.addEventListener("DOMContentLoaded", function () {
    const urlInput = document.getElementById("urlInput");
    const descriptionInput = document.getElementById("descriptionInput");
    const saveButton = document.getElementById("saveButton");
    const linkList = document.getElementById("linkList");

    function isValidUrl(url) {
        if (!url) return false;
        try {
            const urlObj = new URL(url);
            const restrictedSchemes = ['chrome:', 'chrome-extension:', 'chrome-search:', 
                'chrome-devtools:', 'about:', 'data:', 'file:', 'view-source:'];
            
            if (restrictedSchemes.some(scheme => urlObj.protocol.startsWith(scheme))) return false;
            
            const googleSearchPatterns = [/google\.[^/]+\/search/, /google\.[^/]+\/webhp/,
                /www\.google\.[^/]+\/?$/, /www\.google\.[^/]+\/\?/];
            
            if (googleSearchPatterns.some(pattern => pattern.test(urlObj.href))) return false;
            
            if (urlObj.hostname === 'newtab' || urlObj.hostname.endsWith('chrome.com') || 
                urlObj.hostname.endsWith('chromium.org')) return false;

            return true;
        } catch {
            return false;
        }
    }

    function clearInputs() {
        urlInput.value = '';
        descriptionInput.value = '';
        descriptionInput.dataset.fullContent = JSON.stringify({
            title: '', metaDescription: '', pageType: ''
        });
    }

    async function populateFromCurrentTab() {
        const tabs = await chrome.tabs.query({ 
            active: true, 
            lastFocusedWindow: true,
            status: 'complete'
        });
        
        const currentTab = tabs[0];
        if (!currentTab?.url || !isValidUrl(currentTab.url)) {
            clearInputs();
            return;
        }

        urlInput.value = currentTab.url;
        
        try {
            const results = await chrome.scripting.executeScript({
                target: { tabId: currentTab.id },
                func: () => {
                    const getMetaContent = (name) => {
                        const meta = document.querySelector(`meta[name="${name}"], meta[property="${name}"]`);
                        return meta?.content || '';
                    };

                    return {
                        title: document.title,
                        description: getMetaContent('description') || 
                                   getMetaContent('og:description') ||
                                   getMetaContent('twitter:description'),
                        type: getMetaContent('og:type') || document.contentType || 'website'
                    };
                }
            });

            if (results?.[0]?.result) {
                const { title, description, type } = results[0].result;
                if (type === 'search' || type === 'system') {
                    clearInputs();
                    return;
                }

                descriptionInput.value = description || '';
                descriptionInput.dataset.fullContent = JSON.stringify({
                    title: title || currentTab.title,
                    metaDescription: description,
                    pageType: type
                });
            }
        } catch {
            clearInputs();
        }
    }

    saveButton.addEventListener('click', async function() {
        console.log("Save button clicked");
        const url = urlInput.value.trim();
        const description = descriptionInput.value.trim();

        if (!url) {
            showCustomDialog('Please enter a URL.', 'warning');
            return;
        }

        try {
            console.log("Processing URL:", url);
            let finalUrl = url;
            if (url === "current") {
                const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                finalUrl = tab.url;
            }

            if (!isValidUrl(finalUrl)) {
                showCustomDialog('Invalid URL. Please enter a valid web address.', 'error');
                return;
            }

            chrome.storage.local.get({ savedLinks: [] }, async function(data) {
                console.log("Current saved links:", data.savedLinks.length);
                
                if (data.savedLinks.some(link => link.url === finalUrl)) {
                    showCustomDialog('This URL is already saved!', 'warning');
                    return;
                }

                const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                if (!tab || !tab.id) {
                    throw new Error("No active tab found");
                }

                console.log("Attempting content extraction from tab:", tab.id);
                
                try {
                    await chrome.scripting.executeScript({
                        target: { tabId: tab.id },
                        files: ['src/lib/Readability.js']
                    });
                    
                    console.log("Readability injected, extracting content...");
                    
                    const results = await chrome.scripting.executeScript({
                        target: { tabId: tab.id },
                        func: () => {
                            try {
                                if (typeof Readability === 'undefined') {
                                    console.error("Readability is not defined!");
                                    return { 
                                        error: true, 
                                        message: "Readability not available" 
                                    };
                                }
                                
                                console.log("Creating document clone");
                                const documentClone = document.cloneNode(true);
                                console.log("Creating Readability object");
                                const reader = new Readability(documentClone);
                                
                                console.log("Parsing content with Readability");
                                const article = reader.parse();
                                
                                if (!article) {
                                    console.error("Readability returned null article");
                                    return { 
                                        error: true, 
                                        message: "Readability couldn't parse content" 
                                    };
                                }
                                
                                console.log("Content extracted successfully:");
                                console.log("- Title:", article.title);
                                console.log("- Content length:", article.textContent.length);
                                
                                return {
                                    error: false,
                                    title: article.title || document.title,
                                    content: article.textContent,
                                    excerpt: article.excerpt || article.textContent.substring(0, 150)
                                };
                            } catch (err) {
                                console.error("Error in content extraction:", err);
                                return { 
                                    error: true, 
                                    message: err.toString(),
                                    stack: err.stack
                                };
                            }
                        }
                    });
                    
                    console.log("Extraction result:", results[0].result);
                    
                    const extractResult = results[0].result;
                    let pageData = {};
                    
                    if (extractResult.error) {
                        console.warn("Content extraction failed:", extractResult.message);
                        
                        const fallbackResults = await chrome.scripting.executeScript({
                            target: { tabId: tab.id },
                            func: () => ({
                                title: document.title,
                                content: document.body.innerText.substring(0, 20000),
                                url: window.location.href
                            })
                        });
                        
                        pageData = {
                            title: fallbackResults[0].result.title,
                            extractedContent: fallbackResults[0].result.content,
                            extractionMethod: "fallback"
                        };
                        
                        console.log("Using fallback extraction with length:", 
                            pageData.extractedContent.length);
                    } else {
                        pageData = {
                            title: extractResult.title,
                            extractedContent: extractResult.content,
                            excerpt: extractResult.excerpt,
                            extractionMethod: "readability"
                        };
                        
                        console.log("Using Readability extraction with length:", 
                            pageData.extractedContent.length);
                    }
                    
                    const newLink = {
                        url: finalUrl,
                        title: pageData.title || "",
                        description: description || "",
                        extractedContent: pageData.extractedContent || "",
                        excerpt: pageData.excerpt || "",
                        dateAdded: new Date().toISOString(),
                        extractionMethod: pageData.extractionMethod
                    };
                    
                    const savedLinks = [...data.savedLinks, newLink];
                    chrome.storage.local.set({ savedLinks }, function() {
                        console.log("Link saved with content, length:", 
                            newLink.extractedContent.length);
                        showCustomDialog('Link saved successfully with content!', 'success');
                        urlInput.value = '';
                        descriptionInput.value = '';
                    });
                    
                } catch (extractError) {
                    console.error("Script execution error:", extractError);
                    
                    const newLink = {
                        url: finalUrl,
                        title: tab.title || "",
                        description: description || "",
                        extractedContent: "",
                        dateAdded: new Date().toISOString(),
                        extractionMethod: "error",
                        extractionError: extractError.toString()
                    };
                    
                    const savedLinks = [...data.savedLinks, newLink];
                    chrome.storage.local.set({ savedLinks }, function() {
                        console.log("Link saved without content due to error");
                        showCustomDialog('Link saved without content extraction.', 'warning');
                        urlInput.value = '';
                        descriptionInput.value = '';
                    });
                }
            });
        } catch (error) {
            console.error("Error in save process:", error);
            showCustomDialog('Error saving link: ' + error.message, 'error');
        }
    });

    chrome.tabs.onActivated.addListener(populateFromCurrentTab);
    chrome.tabs.onUpdated.addListener((_, changeInfo) => {
        if (changeInfo.status === 'complete') populateFromCurrentTab();
    });

    clearInputs();
    populateFromCurrentTab();

    function showCustomDialog(message, type = 'info') {
        const dialog = document.createElement('dialog');
        dialog.className = 'custom-dialog';
        
        const content = document.createElement('div');
        content.className = 'dialog-content';
        
        const icon = document.createElement('img');
        icon.src = '/icon.png';
        icon.alt = 'deX';
        icon.className = 'dialog-icon';
        
        const title = document.createElement('h3');
        title.className = 'dialog-title';
        title.textContent = type === 'error' ? 'Error' : 
                           type === 'warning' ? 'Warning' : 
                           type === 'success' ? 'Success' : 'Notice';
        
        const text = document.createElement('p');
        text.textContent = message;
        
        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'dialog-buttons';
        
        const okButton = document.createElement('button');
        okButton.className = 'ok-button';
        okButton.textContent = 'OK';
        
        buttonContainer.appendChild(okButton);
        content.appendChild(icon);
        content.appendChild(title);
        content.appendChild(text);
        content.appendChild(buttonContainer);
        dialog.appendChild(content);
        
        document.body.appendChild(dialog);
        dialog.showModal();

        const handleClose = () => {
            dialog.addEventListener('animationend', () => {
                dialog.remove();
            });
            dialog.classList.add('dialog-closing');
            dialog.close();
        };

        okButton.addEventListener('click', handleClose);
        dialog.addEventListener('click', (e) => {
            if (e.target === dialog) handleClose();
        });
    }

    function displaySavedLinks() {
        chrome.storage.local.get({ savedLinks: [] }, function (data) {
            const savedLinks = data.savedLinks;
            
            if (savedLinks.length === 0) {
                linkList.innerHTML = "<li>No saved webpages yet.</li>";
                return;
            }

            savedLinks.sort((a, b) => new Date(b.dateAdded) - new Date(a.dateAdded));
            
            linkList.innerHTML = "";
            
            savedLinks.forEach(link => {
                const li = document.createElement("li");
                
                const a = document.createElement("a");
                a.href = link.url;
                a.target = "_blank";
                a.textContent = link.title || link.url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
                
                const description = document.createElement("div");
                description.className = "link-description";
                description.textContent = link.description || link.metaDescription || "No description";
                
                const date = document.createElement("div");
                date.className = "link-date";
                date.textContent = new Date(link.dateAdded).toLocaleDateString();
                
                li.appendChild(a);
                li.appendChild(description);
                li.appendChild(date);
                linkList.appendChild(li);
            });
        });
    }

    displaySavedLinks();
});
