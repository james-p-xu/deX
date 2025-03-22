document.addEventListener("DOMContentLoaded", function() {
    console.log("Finder.js loaded");
    
    const urlInput = document.getElementById("urlInput");
    const descriptionInput = document.getElementById("descriptionInput");
    const saveButton = document.getElementById("saveButton");
    const searchQuery = document.getElementById("searchQuery");
    const searchButton = document.getElementById("search");
    const randomSearchButton = document.getElementById("randomSearch");
    const exportDataBtn = document.getElementById("exportData");
    const themeToggle = document.getElementById("themeToggle");
    const linkList = document.getElementById("linkList");
    
    console.log("DOM elements:", {
        urlInput: !!urlInput,
        descriptionInput: !!descriptionInput,
        saveButton: !!saveButton,
        searchQuery: !!searchQuery,
        searchButton: !!searchButton,
        randomSearchButton: !!randomSearchButton,
        exportDataBtn: !!exportDataBtn,
        themeToggle: !!themeToggle,
        linkList: !!linkList
    });
    
    function showToast(message, type = 'info') {
        let toastContainer = document.querySelector('.toast-container');
        if (!toastContainer) {
            toastContainer = document.createElement('div');
            toastContainer.className = 'toast-container';
            toastContainer.style.position = 'fixed';
            toastContainer.style.bottom = '20px';
            toastContainer.style.left = '50%';
            toastContainer.style.transform = 'translateX(-50%)';
            toastContainer.style.zIndex = '9999';
            document.body.appendChild(toastContainer);
        }
        
        const existingToasts = toastContainer.querySelectorAll('.toast');
        if (existingToasts.length >= 2) {
            existingToasts[0].remove(); // Remove the oldest toast
        }
        
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.style.background = type === 'error' ? '#f44336' : 
                                type === 'warning' ? '#ff9800' : 
                                type === 'success' ? '#4CAF50' : '#2196F3';
        toast.style.color = '#fff';
        toast.style.padding = '12px 20px';
        toast.style.marginTop = '10px';
        toast.style.borderRadius = '4px';
        toast.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)';
        toast.style.minWidth = '250px';
        toast.style.textAlign = 'center';
        toast.style.animation = 'fadeInOut 3s forwards';
        toast.textContent = message;
        
        if (!document.querySelector('#toast-animations')) {
            const style = document.createElement('style');
            style.id = 'toast-animations';
            style.textContent = `
                @keyframes fadeInOut {
                    0% { opacity: 0; transform: translateY(20px); }
                    10% { opacity: 1; transform: translateY(0); }
                    80% { opacity: 1; transform: translateY(0); }
                    100% { opacity: 0; transform: translateY(-20px); }
                }
            `;
            document.head.appendChild(style);
        }
        
        toastContainer.appendChild(toast);
        
        setTimeout(() => {
            toast.remove();
            if (toastContainer.children.length === 0) {
                toastContainer.remove();
            }
        }, 3000);
    }
    
    if (themeToggle) {
        themeToggle.onclick = function() {
            document.body.classList.toggle('dark-theme');
            const isDark = document.body.classList.contains('dark-theme');
            localStorage.setItem('theme', isDark ? 'dark' : 'light');
            showToast(`Theme switched to ${isDark ? 'dark' : 'light'} mode`, 'info');
        };
    }
    
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-theme');
    }
    
    if (saveButton) {
        saveButton.onclick = async function() {
            const url = urlInput ? urlInput.value.trim() : "";
            const description = descriptionInput ? descriptionInput.value.trim() : "";
            
            if (!url) {
                showToast("Please enter a URL", "warning");
                return;
            }
            
            if (url.startsWith('chrome://') || 
                url.startsWith('chrome-extension://') || 
                url.startsWith('about:') ||
                url.startsWith('edge://') ||
                url.startsWith('brave://') ||
                url.startsWith('view-source:')) {
                showToast("Cannot save browser internal pages", "error");
                return;
            }
            
            try {
                const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
                
                if (!tab || !tab.id) {
                    throw new Error("No active tab found");
                }
                
                chrome.storage.local.get({savedLinks: []}, async function(data) {
                    if (data.savedLinks.some(link => link.url === url)) {
                        showToast("This URL is already saved!", "warning");
                        return;
                    }
                    
                    try {
                        const [result] = await chrome.scripting.executeScript({
                            target: {tabId: tab.id},
                            function: extractPageContent
                        });
                        
                        const newLink = {
                            url: url,
                            title: tab.title || url,
                            description: description,
                            extractedContent: result.result.content || "",
                            extractedText: result.result.textContent || "",
                            dateAdded: new Date().toISOString(),
                            extractionMethod: "readability",
                            read: false
                        };
                        
                        const savedLinks = [...data.savedLinks, newLink];
                        chrome.storage.local.set({savedLinks}, function() {
                            showToast("Link saved successfully!", "success");
                            if (urlInput) urlInput.value = "";
                            if (descriptionInput) descriptionInput.value = "";
                            displayLinks();
                        });
                    } catch (error) {
                        console.error("Error in content extraction:", error);
                        
                        const newLink = {
                            url: url,
                            title: tab.title || "",
                            description: description || "",
                            extractedContent: "",
                            extractedText: "",
                            dateAdded: new Date().toISOString(),
                            extractionMethod: "error",
                            read: false
                        };
                        
                        const savedLinks = [...data.savedLinks, newLink];
                        chrome.storage.local.set({savedLinks}, function() {
                            showToast("Link saved without content extraction", "warning");
                            if (urlInput) urlInput.value = "";
                            if (descriptionInput) descriptionInput.value = "";
                            displayLinks();
                        });
                    }
                });
            } catch (error) {
                console.error("Save error:", error);
                showToast("Error saving link: " + error.message, "error");
            }
        };
    }
    
    if (searchButton) {
        searchButton.onclick = function() {
            const query = searchQuery ? searchQuery.value.trim() : "";
            if (!query) {
                showToast("Please enter a search term", "warning");
                return;
            }
            searchByKeywordWithTfIdf(query);
        };
    }
    
    if (randomSearchButton) {
        randomSearchButton.onclick = function() {
            displayRandomLink();
        };
    }
    
    if (exportDataBtn) {
        exportDataBtn.onclick = function() {
            exportLinks();
        };
    }
    
    if (searchQuery) {
        searchQuery.onkeydown = function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                const query = searchQuery.value.trim();
                if (!query) {
                    showToast("Please enter a search term", "warning");
                    return;
                }
                searchByKeywordWithTfIdf(query);
            }
        };
    }
    
    function displayLinks() {
        if (!linkList) return;
        
        chrome.storage.local.get({savedLinks: []}, function(data) {
            if (!data.savedLinks.length) {
                linkList.innerHTML = "<li>No saved webpages yet.</li>";
                return;
            }
            
            // Update and save any links that don't have a read property
            const updatedLinks = data.savedLinks.map(link => ({
                ...link,
                read: link.read !== undefined ? link.read : false
            }));
            if (JSON.stringify(updatedLinks) !== JSON.stringify(data.savedLinks)) {
                chrome.storage.local.set({savedLinks: updatedLinks});
            }
            
            updatedLinks.sort((a, b) => new Date(b.dateAdded) - new Date(a.dateAdded));
            
            linkList.innerHTML = "";
            updatedLinks.forEach(link => {
                const li = document.createElement("li");
                li.className = "link-item";
                li.innerHTML = `
                    <div class="link-header">
                        <a href="${link.url}" target="_blank">${link.title || link.url}</a>
                        <button class="delete-button">×</button>
                    </div>
                    <div class="link-description">${link.description || "<No description>"}</div>
                    <div class="link-footer">
                        <div class="link-date">${new Date(link.dateAdded).toLocaleDateString()}</div>
                        <label class="read-toggle">
                            <input type="checkbox" ${link.read ? 'checked' : ''} title="${link.read ? 'Mark as unread' : 'Mark as read'}">
                        </label>
                    </div>
                `;
                
                const toggleCheckbox = li.querySelector('input[type="checkbox"]');
                if (toggleCheckbox) {
                    toggleCheckbox.onchange = function(e) {
                        const newReadState = e.target.checked;
                        chrome.storage.local.get({savedLinks: []}, function(data) {
                            const updatedLinks = data.savedLinks.map(l => 
                                l.url === link.url ? {...l, read: newReadState} : l
                            );
                            chrome.storage.local.set({savedLinks: updatedLinks}, function() {
                                showToast(`Marked as ${newReadState ? 'read' : 'unread'}`, 'info');
                            });
                        });
                    };
                }
                
                const deleteBtn = li.querySelector(".delete-button");
                if (deleteBtn) {
                    deleteBtn.onclick = function(e) {
                        e.preventDefault();
                        e.stopPropagation();
                        deleteLink(link.url);
                    };
                }
                
                linkList.appendChild(li);
            });
        });
    }
    
    // TF-IDF Search Implementation {https://www.geeksforgeeks.org/understanding-tf-idf-term-frequency-inverse-document-frequency/}
    function searchByKeywordWithTfIdf(query) {
        if (!linkList || !query) return;
        
        chrome.storage.local.get({savedLinks: []}, function(data) {
            linkList.innerHTML = "";
            
            const showAllContainer = document.createElement("div");
            showAllContainer.className = "show-all-container";
            const showAllBtn = document.createElement("button");
            showAllBtn.textContent = "Show All Links";
            showAllBtn.className = "show-all-button";
            showAllBtn.onclick = displayLinks;
            showAllContainer.appendChild(showAllBtn);
            linkList.appendChild(showAllContainer);
            
            if (!data.savedLinks.length) {
                const li = document.createElement("li");
                li.textContent = "No saved links yet.";
                linkList.appendChild(li);
                return;
            }
            
            const searchTerms = query.toLowerCase()
                .split(/\s+/)
                .filter(term => term.length > 1); 
            
            if (!searchTerms.length) {
                showToast("Please enter valid search terms", "warning");
                return;
            }
            
            const documents = data.savedLinks.map(link => {
                const textContent = [
                    link.title || "",
                    link.description || "",
                    link.extractedText || ""
                ].join(" ").toLowerCase();
                
                return {
                    link: link,
                    text: textContent,
                    tf: calculateTermFrequency(textContent, searchTerms)
                };
            });
            
            const idf = calculateInverseDocumentFrequency(documents, searchTerms);
            
            const results = documents.map(doc => {
                let score = 0;
                searchTerms.forEach(term => {
                    const tfIdfScore = doc.tf[term] * (idf[term] || 0);
                    score += tfIdfScore;
                });
                
                // Boost score for title and description matches
                searchTerms.forEach(term => {
                    if (doc.link.title && doc.link.title.toLowerCase().includes(term)) {
                        score += 2;
                    }
                    if (doc.link.description && doc.link.description.toLowerCase().includes(term)) {
                        score += 1;
                    }
                });
                
                return {
                    link: doc.link,
                    score: score
                };
            })
            .filter(result => result.score > 0)
            .sort((a, b) => b.score - a.score);
            
            if (!results.length) {
                const li = document.createElement("li");
                li.className = "link-item";
                li.innerHTML = `<div class="no-results">No results found for "${query}"</div>`;
                linkList.appendChild(li);
                showToast("No matching links found", "info");
                return;
            }
            
            results.forEach(item => {
                const link = item.link;
                const li = document.createElement("li");
                li.className = "link-item search-result";
                
                // Highlight matching terms in title and description
                let highlightedTitle = link.title || link.url;
                let highlightedDescription = link.description || "<No description>";
                
                searchTerms.forEach(term => {
                    const regex = new RegExp('(\\b' + escapeRegExp(term) + '\\b)', 'gi');
                    highlightedTitle = highlightedTitle.replace(regex, '<span class="highlight">$1</span>');
                    highlightedDescription = highlightedDescription.replace(regex, '<span class="highlight">$1</span>');
                });
                
                li.innerHTML = `
                    <div class="link-header">
                        <a href="${link.url}" target="_blank">${highlightedTitle}</a>
                        <button class="delete-button">×</button>
                    </div>
                    <div class="link-description">${highlightedDescription}</div>
                    <div class="link-date">${new Date(link.dateAdded).toLocaleDateString()}</div>
                    <div class="relevance-score">Relevance: ${Math.round(item.score * 100) / 100}</div>
                `;
                
                const deleteBtn = li.querySelector(".delete-button");
                if (deleteBtn) {
                    deleteBtn.onclick = function(e) {
                        e.preventDefault();
                        e.stopPropagation();
                        deleteLink(link.url);
                    };
                }
                
                linkList.appendChild(li);
            });
            
            showToast(`Found ${results.length} results using TF-IDF`, "success");
        });
    }
    
    function escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
    
    function calculateTermFrequency(text, terms) {
        const wordCount = text.split(/\s+/).length;
        const termFrequency = {};
        
        terms.forEach(term => {
            const regex = new RegExp('\\b' + escapeRegExp(term) + '\\b', 'gi');
            const matches = text.match(regex) || [];
            termFrequency[term] = matches.length / wordCount;
        });
        
        return termFrequency;
    }
    
    function calculateInverseDocumentFrequency(documents, terms) {
        const idf = {};
        const totalDocuments = documents.length;
        
        terms.forEach(term => {
            const documentsWithTerm = documents.filter(doc => 
                doc.text.includes(term)
            ).length;
            
            // Calculate IDF with smoothing to avoid division by zero
            idf[term] = Math.log((totalDocuments + 1) / (documentsWithTerm + 1)) + 1;
        });
        
        return idf;
    }
    
    function displayRandomLink() {
        chrome.storage.local.get({savedLinks: []}, function(data) {
            if (!data.savedLinks.length) {
                showToast("No saved links yet", "warning");
                return;
            }
            
            const randomIndex = Math.floor(Math.random() * data.savedLinks.length);
            const randomLink = data.savedLinks[randomIndex];
            
            linkList.innerHTML = "";
            
            const showAllContainer = document.createElement("div");
            showAllContainer.className = "show-all-container";
            const showAllBtn = document.createElement("button");
            showAllBtn.textContent = "Show All Links";
            showAllBtn.className = "show-all-button";
            showAllBtn.onclick = displayLinks;
            showAllContainer.appendChild(showAllBtn);
            linkList.appendChild(showAllContainer);
            
            const li = document.createElement("li");
            li.className = "link-item random-link";
            li.innerHTML = `
                <div class="link-header">
                    <a href="${randomLink.url}" target="_blank">${randomLink.title || randomLink.url}</a>
                    <button class="delete-button">×</button>
                </div>
                <div class="link-description">${randomLink.description || "No description"}</div>
                <div class="link-date">${new Date(randomLink.dateAdded).toLocaleDateString()}</div>
            `;
            
            const deleteBtn = li.querySelector(".delete-button");
            if (deleteBtn) {
                deleteBtn.onclick = function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    deleteLink(randomLink.url);
                };
            }
            
            linkList.appendChild(li);
            showToast("Here's a random link for you!", "success");
        });
    }
    
    function deleteLink(url) {
        chrome.storage.local.get({savedLinks: []}, function(data) {
            const newLinks = data.savedLinks.filter(link => link.url !== url);
            chrome.storage.local.set({savedLinks: newLinks}, function() {
                showToast("Link deleted", "success");
                displayLinks();
            });
        });
    }
    
    function exportLinks() {
        chrome.storage.local.get({savedLinks: []}, function(data) {
            if (!data.savedLinks.length) {
                showToast("No links to export", "warning");
                return;
            }
            
            const jsonData = JSON.stringify(data.savedLinks, null, 2);
            const blob = new Blob([jsonData], {type: 'application/json'});
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.download = 'dex_saved_links.json';
            a.href = url;
            a.click();
            
            URL.revokeObjectURL(url);
            showToast("Data exported successfully", "success");
        });
    }
    
    displayLinks();
    
    populateUrlFromActiveTab();
    
    try {
        chrome.tabs.onActivated.addListener(function(activeInfo) {
            console.log("Tab changed, updating URL");
            populateUrlFromActiveTab();
        });
    } catch (e) {
        console.log("Could not add tab change listener:", e);
    }
    
    function addHighlightStyles() {
        if (!document.querySelector('#highlight-styles')) {
            const style = document.createElement('style');
            style.id = 'highlight-styles';
            style.textContent = `
                .highlight {
                    background-color: rgba(255, 215, 0, 0.3);
                    padding: 0 2px;
                    border-radius: 2px;
                    font-weight: bold;
                }
                .relevance-score {
                    font-size: 12px;
                    color: var(--text-secondary);
                    margin-top: 5px;
                }
                .search-result {
                    border-left: 3px solid var(--accent-color);
                }
            `;
            document.head.appendChild(style);
        }
    }
    
    addHighlightStyles();
});

function populateUrlFromActiveTab() {
    try {
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            if (tabs && tabs[0] && tabs[0].url && urlInput) {
                const url = tabs[0].url;
                
                // Skip restricted browser URLs
                if (url.startsWith('chrome://') || 
                    url.startsWith('chrome-extension://') || 
                    url.startsWith('about:') ||
                    url.startsWith('edge://') ||
                    url.startsWith('brave://') ||
                    url.startsWith('view-source:')) {
                    console.log("Skipping browser URL, clearing input");
                    urlInput.value = "";
                    return;
                }
                
                // Skip Google search queries
                if (url.includes('google.com/search') || 
                    url.includes('google.com/webhp') ||
                    url.includes('google.com/?') ||
                    url.includes('google.com/#q=')) {
                    console.log("Skipping Google search URL, clearing input");
                    urlInput.value = "";
                    return;
                }
                
                console.log("Setting URL input to:", url);
                urlInput.value = url;
            }
        });
    } catch (e) {
        console.log("Could not get active tab:", e);
    }
}

function extractPageContent() {
    try {
        const documentClone = document.cloneNode(true);
        const article = new Readability(documentClone).parse();
        
        return {
            title: article.title,
            content: article.content,
            textContent: article.textContent,
            excerpt: article.excerpt,
            byline: article.byline,
            success: true
        };
    } catch (error) {
        // Fallback extraction if Readability fails
        return {
            title: document.title,
            content: document.body.innerHTML,
            textContent: document.body.textContent,
            excerpt: document.body.textContent.substring(0, 200),
            byline: "",
            success: false
        };
    }
}

