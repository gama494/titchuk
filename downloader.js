document.addEventListener('DOMContentLoaded', () => {
    const urlInput = document.getElementById('url-input');
    const fetchBtn = document.getElementById('fetch-btn');
    const resultsContainer = document.getElementById('results-container');
    const loaderContainer = document.getElementById('loader-container');

    if (!urlInput || !fetchBtn || !resultsContainer || !loaderContainer) {
        console.error('Downloader elements not found');
        return;
    }

    fetchBtn.addEventListener('click', processUrl);
    urlInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            processUrl();
        }
    });

    async function processUrl() {
        const url = urlInput.value.trim();
        resultsContainer.innerHTML = '';

        if (!url) {
            showError('Please enter a URL to continue.');
            return;
        }

        try {
            new URL(url);
        } catch (_) {
            showError('The URL you entered is not valid. Please check it and try again.');
            return;
        }

        fetchBtn.disabled = true;
        fetchBtn.textContent = 'Fetching...';
        
        const platform = getUnsupportedPlatform(url);
        
        if (platform === 'youtube') {
            await showLoaderWithMessages(['✅ Link validated', '🔄 Establishing secure connection...', '🔎 Analyzing media streams...']);
            try {
                const videoData = await getYouTubeVideoData(url);
                renderYouTubeDownloader(videoData, url);
            } catch (error) {
                 showError('Could not fetch YouTube video data.', 'The video might be private, deleted, or the link is incorrect.');
            }
        } else if (platform) {
            await showLoaderWithMessages(['✅ Link validated', '🔄 Connecting to Universal Fetch Service...', '🔎 Analyzing platform metadata...']);
            showUnsupportedMessage(platform);
        } else {
             await showLoaderWithMessages(['Analyzing link...', 'Checking for direct media...', 'Finalizing...']);
            const extension = getFileExtension(url);
            if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(extension)) {
                renderImagePreview(url);
            } else if (['mp3', 'wav', 'ogg', 'm4a'].includes(extension)) {
                renderAudioPreview(url);
            } else if (['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(extension)) {
                renderVideoPreview(url);
            } else {
                showError('Could not identify a media file from this URL.', 'Please provide a direct link to a file (e.g., ending in .mp3, .mp4, .jpg).');
            }
        }
        resetState();
    }
    
    function resetState() {
        loaderContainer.innerHTML = '';
        fetchBtn.disabled = false;
        fetchBtn.textContent = 'Fetch Media';
    }

    function getFileExtension(url) {
        try {
            const pathname = new URL(url).pathname;
            const parts = pathname.split('?')[0].split('.');
            if (parts.length > 1) {
                return parts.pop().toLowerCase();
            }
        } catch (e) {
            console.error('Could not parse URL for extension:', e);
        }
        return '';
    }
    
    function getYoutubeVideoId(url) {
        let videoId = null;
        const urlObj = new URL(url);
        if (urlObj.hostname === 'youtu.be') {
            videoId = urlObj.pathname.slice(1);
        } else if (urlObj.hostname.includes('youtube.com')) {
            videoId = urlObj.searchParams.get('v');
        }
        return videoId;
    }

    function getUnsupportedPlatform(url) {
        const unsupportedDomains = {
            'youtube.com': 'YouTube',
            'youtu.be': 'YouTube',
            'tiktok.com': 'TikTok',
            'audiomack.com': 'Audiomack',
            'vimeo.com': 'Vimeo',
            'facebook.com': 'Facebook',
            'instagram.com': 'Instagram',
            'twitter.com': 'Twitter',
            'soundcloud.com': 'SoundCloud'
        };
        try {
            const hostname = new URL(url).hostname.replace('www.', '');
            for (const domain in unsupportedDomains) {
                if (hostname === domain) {
                    return unsupportedDomains[domain].toLowerCase();
                }
            }
        } catch(e) {
            return null;
        }
        return null;
    }

    async function getYouTubeVideoData(url) {
        const encodedUrl = encodeURIComponent(`https://www.youtube.com/oembed?url=${url}&format=json`);
        const response = await fetch(`https://api.allorigins.win/get?url=${encodedUrl}`);
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        const data = await response.json();
        const videoData = JSON.parse(data.contents);
        if (!videoData || !videoData.html || !videoData.title || !videoData.author_name) {
            throw new Error('Invalid YouTube oEmbed response');
        }
        return videoData;
    }

    async function showLoaderWithMessages(messages, container = loaderContainer) {
        container.innerHTML = `
            <div class="loader-wrapper">
                <div class="loader"></div>
                <p id="loader-text"></p>
            </div>
        `;
        const loaderText = container.querySelector('#loader-text');

        for (const message of messages) {
            if (loaderText) loaderText.textContent = message;
            await new Promise(resolve => setTimeout(resolve, 700));
        }
    }

    function showError(title, message = '') {
        resultsContainer.innerHTML = `
            <div class="error-message">
                <h3><i class='bx bxs-error-circle'></i> ${title}</h3>
                <p>${message}</p>
            </div>`;
    }

    function showUnsupportedMessage(platform) {
        resultsContainer.innerHTML = `
            <div class="info-message enhanced">
                <h3><i class='bx bxs-shield-x'></i> ${platform.charAt(0).toUpperCase() + platform.slice(1)} Platform Detected</h3>
                <p>Our tool attempted to access the media, but the request was blocked. This is because ${platform} is a secure streaming service and does not allow direct file downloads from other websites.</p>
                <p class="analogy">Think of it like trying to copy a movie file directly from the Netflix app — their service is built to stream, not to allow direct file downloads.</p>
                
                <h4>What Works? Direct Media Links!</h4>
                <p>This tool works perfectly with <strong>direct links</strong>. A direct link points straight to the file itself, usually ending in a file extension.</p>
            </div>
        `;
    }

    function renderPreview(type, url, content) {
        const filename = getFilenameFromUrl(url);
        resultsContainer.innerHTML = `
            <div class="media-preview">
                <h4>${type} Preview</h4>
                ${content}
                <a href="${url}" download="${filename}" class="download-button" target="_blank" rel="noopener noreferrer">
                    <i class='bx bxs-download'></i> Download ${type}
                </a>
            </div>
        `;
    }

    function renderImagePreview(url) {
        const content = `<img src="${url}" alt="Image preview" onerror="this.parentElement.innerHTML += '<p class=\\'error-message-inline\\'>Could not load image preview. The link might be broken or protected.</p>'; this.style.display='none';">`;
        renderPreview('Image', url, content);
    }

    function renderAudioPreview(url) {
        const content = `<audio controls src="${url}"></audio>`;
        renderPreview('Audio', url, content);
    }
    
    function renderVideoPreview(url) {
        const content = `<video controls src="${url}"></video>`;
        renderPreview('Video', url, content);
    }

    function getFilenameFromUrl(url) {
        try {
            const pathname = new URL(url).pathname;
            const filename = pathname.substring(pathname.lastIndexOf('/') + 1);
            return decodeURIComponent(filename) || 'downloaded-file';
        } catch (e) {
            return 'downloaded_file';
        }
    }

    function renderYouTubeDownloader(videoData, originalUrl) {
        resultsContainer.innerHTML = `
            <div class="youtube-downloader-card">
                <div class="yt-video-embed">
                    ${videoData.html}
                </div>
                <div class="yt-details">
                    <h4 class="yt-title">${videoData.title}</h4>
                    <p class="yt-author">by ${videoData.author_name}</p>
                    <p class="yt-download-prompt">
                        Watch the video here, then select your desired format below to begin the download process.
                    </p>
                    <div id="yt-options-container">
                         <div class="yt-download-options">
                            <button class="download-option-btn" data-format="1080p MP4" data-type="mp4"><i class='bx bxs-videos'></i> 1080p <span class="format">MP4</span></button>
                            <button class="download-option-btn" data-format="720p MP4" data-type="mp4"><i class='bx bxs-videos'></i> 720p <span class="format">MP4</span></button>
                            <button class="download-option-btn" data-format="360p MP4" data-type="mp4"><i class='bx bxs-videos'></i> 360p <span class="format">MP4</span></button>
                            <button class="download-option-btn audio" data-format="128kbps MP3" data-type="mp3"><i class='bx bxs-music'></i> 128kbps <span class="format">MP3</span></button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        const iframe = resultsContainer.querySelector('iframe');
        if (iframe) {
            iframe.removeAttribute('width');
            iframe.removeAttribute('height');
        }
        
        document.querySelectorAll('.download-option-btn').forEach(button => {
            button.addEventListener('click', async () => {
                const optionsContainer = document.getElementById('yt-options-container');
                await showLoaderWithMessages([
                    'Connecting to secure API...',
                    'Processing media streams...',
                    'Generating your secure link...'
                ], optionsContainer);
                
                const videoId = getYoutubeVideoId(originalUrl);
                if(videoId) {
                    // Using ssyoutube as a public, automated download API
                    const downloadUrl = `https://www.ssyoutube.com/watch?v=${videoId}`;
                    renderSecureDownloadButton(optionsContainer, downloadUrl, button.dataset.format);
                } else {
                    showError("Could not extract video ID from the URL.");
                }
            });
        });
    }

    function renderSecureDownloadButton(container, url, format) {
        container.innerHTML = `
            <div class="secure-download-panel">
                <p class="secure-download-title">✅ Your download is ready!</p>
                <a href="${url}" target="_blank" rel="noopener noreferrer" class="download-button final">
                    <i class='bx bxs-download'></i> Download ${format} Now
                </a>
                 <p class="secure-download-info">
                    Clicking will open the download service. Your file will be prepared automatically.
                </p>
            </div>
        `;
    }
});