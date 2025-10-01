// shared-player.js

/**
 * TitchukePlayer: A singleton object to manage the site-wide persistent audio player.
 */
const TitchukePlayer = {
    audio: new Audio(),
    state: {
        playlist: [],
        originalPlaylist: [],
        currentIndex: -1,
        isPlaying: false,
        isShuffling: false,
        repeatMode: 'none', // 'none', 'one', 'all'
        currentTime: 0,
    },
    elements: {},

    /**
     * Initializes the player on page load.
     * It loads state from sessionStorage and renders the player if a playlist exists.
     */
    init() {
        this.loadState();
        if (this.state.playlist.length > 0 && this.state.currentIndex !== -1) {
            this.render();
            document.body.classList.add('player-active');
            
            // Restore playback time
            this.audio.currentTime = this.state.currentTime || 0;
            
            // Autoplay is often blocked, so we set isPlaying to false initially.
            // A user interaction on the new page is required to start playing.
            this.state.isPlaying = false;
            this.updateUI();
        }
        
        // Save state before the user leaves the page.
        window.addEventListener('beforeunload', () => {
            if (this.audio.duration && this.audio.currentTime) {
               this.state.currentTime = this.audio.currentTime;
            }
            this.saveState();
        });
    },

    /**
     * Loads the player state from sessionStorage.
     */
    loadState() {
        const savedState = sessionStorage.getItem('titchukePlayerState');
        if (savedState) {
            const parsedState = JSON.parse(savedState);
            this.state = { ...this.state, ...parsedState };
        }
    },
    
    /**
     * Saves the current player state to sessionStorage.
     */
    saveState() {
        if (this.state.playlist.length > 0) {
            sessionStorage.setItem('titchukePlayerState', JSON.stringify(this.state));
        }
    },
    
    /**
     * Renders the player bar HTML into the container div and caches the elements.
     */
    render() {
        const container = document.getElementById('shared-player-container');
        if (!container || document.getElementById('shared-player-bar')) return;
        
        container.innerHTML = `
            <div id="shared-player-bar">
                <div class="player-track-info">
                    <img src="https://picsum.photos/64" alt="Album Art">
                    <div class="track-details">
                        <p class="track-title">Select a song</p>
                        <p class="track-artist"></p>
                    </div>
                </div>

                <div class="player-center-controls">
                    <div class="top-controls">
                        <button class="control-btn-sm" id="player-shuffle-btn" title="Shuffle"><i class='bx bx-shuffle'></i></button>
                        <button class="control-btn" id="player-prev-btn" title="Previous"><i class='bx bx-skip-previous'></i></button>
                        <button class="control-btn play" id="player-play-pause-btn" title="Play"><i class='bx bx-play'></i></button>
                        <button class="control-btn" id="player-next-btn" title="Next"><i class='bx bx-skip-next'></i></button>
                        <button class="control-btn-sm" id="player-repeat-btn" title="Repeat"><i class='bx bx-repeat'></i></button>
                    </div>
                    <div class="progress-container">
                        <span id="player-current-time">0:00</span>
                        <div id="player-progress-bar-container">
                            <div id="player-progress-bar"></div>
                        </div>
                        <span id="player-total-duration">0:00</span>
                    </div>
                </div>

                <div class="player-right-controls">
                    <!-- Volume/Playlist controls can be added here -->
                </div>
            </div>
        `;
        
        // Cache DOM elements for quick access
        this.elements = {
            bar: document.getElementById('shared-player-bar'),
            coverArt: document.querySelector('#shared-player-bar .player-track-info img'),
            title: document.querySelector('#shared-player-bar .track-title'),
            artist: document.querySelector('#shared-player-bar .track-artist'),
            playPauseBtn: document.getElementById('player-play-pause-btn'),
            shuffleBtn: document.getElementById('player-shuffle-btn'),
            repeatBtn: document.getElementById('player-repeat-btn'),
            progressBar: document.getElementById('player-progress-bar'),
            progressContainer: document.getElementById('player-progress-bar-container'),
            currentTime: document.getElementById('player-current-time'),
            totalDuration: document.getElementById('player-total-duration'),
        };
        
        this.attachListeners();
        this.loadCurrentSong(false); // Load song data but don't play yet
    },

    /**
     * Attaches all necessary event listeners to the player controls and audio element.
     */
    attachListeners() {
        this.elements.playPauseBtn.addEventListener('click', () => this.togglePlayPause());
        document.getElementById('player-next-btn').addEventListener('click', () => this.playNext());
        document.getElementById('player-prev-btn').addEventListener('click', () => this.playPrevious());
        this.elements.shuffleBtn.addEventListener('click', () => this.toggleShuffle());
        this.elements.repeatBtn.addEventListener('click', () => this.cycleRepeatMode());

        this.elements.progressContainer.addEventListener('click', (e) => {
            const rect = this.elements.progressContainer.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const width = rect.width;
            if (this.audio.duration) {
                this.audio.currentTime = (clickX / width) * this.audio.duration;
            }
        });

        this.audio.addEventListener('timeupdate', () => this.onTimeUpdate());
        this.audio.addEventListener('loadedmetadata', () => this.onLoadedMetadata());
        this.audio.addEventListener('ended', () => this.handleSongEnd());
        this.audio.addEventListener('play', () => this.onPlay());
        this.audio.addEventListener('pause', () => this.onPause());
    },
    
    // --- Event Handlers ---
    onTimeUpdate() {
        if (!this.audio.duration) return;
        this.state.currentTime = this.audio.currentTime;
        const progressPercent = (this.audio.currentTime / this.audio.duration) * 100;
        this.elements.progressBar.style.width = `${progressPercent}%`;
        this.elements.currentTime.textContent = this.formatTime(this.audio.currentTime);
    },
    onLoadedMetadata() {
        this.elements.totalDuration.textContent = this.formatTime(this.audio.duration);
    },
    handleSongEnd() {
        if (this.state.repeatMode === 'one') {
            this.audio.currentTime = 0;
            this.audio.play();
        } else {
            this.playNext();
        }
    },
    onPlay() {
        this.state.isPlaying = true;
        this.elements.playPauseBtn.innerHTML = `<i class='bx bx-pause'></i>`;
    },
    onPause() {
        this.state.isPlaying = false;
        this.elements.playPauseBtn.innerHTML = `<i class='bx bx-play'></i>`;
    },

    /**
     * Updates all UI elements to reflect the current state.
     */
    updateUI() {
        if (!this.elements.bar || this.state.currentIndex === -1) return;
        const song = this.state.playlist[this.state.currentIndex];
        if (!song) return;

        this.elements.coverArt.src = song.posterUrl;
        this.elements.title.textContent = song.title;
        this.elements.artist.textContent = song.artist;
        this.elements.totalDuration.textContent = this.formatTime(this.audio.duration || 0);
        this.elements.currentTime.textContent = this.formatTime(this.audio.currentTime || 0);
        this.elements.playPauseBtn.innerHTML = this.state.isPlaying ? `<i class='bx bx-pause'></i>` : `<i class='bx bx-play'></i>`;

        this.elements.shuffleBtn.classList.toggle('active', this.state.isShuffling);
        
        this.elements.repeatBtn.classList.toggle('active', this.state.repeatMode !== 'none');
        if (this.state.repeatMode === 'one') {
            this.elements.repeatBtn.innerHTML = "<i class='bx bx-repeat'></i><span class='repeat-one-indicator'>1</span>";
        } else {
            this.elements.repeatBtn.innerHTML = "<i class='bx bx-repost'></i>";
        }
    },

    /**
     * Public method to start playback of a new playlist.
     * @param {Array} playlist - Array of song objects.
     * @param {number} startIndex - The index of the song to start with.
     */
    playMusic(playlist, startIndex) {
        if (!this.elements.bar) {
            this.render();
        }
        document.body.classList.add('player-active');
        this.state.playlist = playlist;
        this.state.originalPlaylist = [...playlist];
        this.state.currentIndex = startIndex;
        this.state.isPlaying = true;
        this.state.isShuffling = false; // Reset shuffle for a new playlist
        this.loadCurrentSong(true);
    },

    /**
     * Loads the song at the current index into the audio element.
     * @param {boolean} shouldPlay - Whether to start playback immediately.
     */
    loadCurrentSong(shouldPlay = false) {
        if (this.state.currentIndex === -1) return;
        const song = this.state.playlist[this.state.currentIndex];
        this.audio.src = song.audioUrl;
        this.audio.load();
        if (shouldPlay) {
            this.audio.play().catch(e => console.error("Autoplay failed:", e));
        }
        this.updateUI();
        this.saveState();
    },

    togglePlayPause() {
        if (this.audio.paused) {
            this.audio.play();
        } else {
            this.audio.pause();
        }
    },

    playNext() {
        let nextIndex = this.state.currentIndex + 1;
        if (nextIndex >= this.state.playlist.length) {
            if (this.state.repeatMode === 'all') {
                nextIndex = 0;
            } else {
                return; // End of playlist
            }
        }
        this.state.currentIndex = nextIndex;
        this.loadCurrentSong(true);
    },

    playPrevious() {
        if (this.audio.currentTime > 3) {
            this.audio.currentTime = 0;
            return;
        }
        let prevIndex = this.state.currentIndex - 1;
        if (prevIndex < 0) {
            prevIndex = this.state.playlist.length - 1; // Loop to the end
        }
        this.state.currentIndex = prevIndex;
        this.loadCurrentSong(true);
    },
    
    toggleShuffle() {
        this.state.isShuffling = !this.state.isShuffling;
        if (this.state.isShuffling) {
            const currentSong = this.state.playlist[this.state.currentIndex];
            const otherSongs = this.state.playlist.filter(s => s.id !== currentSong.id);
            for (let i = otherSongs.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [otherSongs[i], otherSongs[j]] = [otherSongs[j], otherSongs[i]];
            }
            this.state.playlist = [currentSong, ...otherSongs];
            this.state.currentIndex = 0;
        } else {
            const currentSongId = this.state.playlist[this.state.currentIndex].id;
            this.state.playlist = [...this.state.originalPlaylist];
            this.state.currentIndex = this.state.playlist.findIndex(s => s.id === currentSongId);
        }
        this.updateUI();
    },

    cycleRepeatMode() {
        if (this.state.repeatMode === 'none') this.state.repeatMode = 'all';
        else if (this.state.repeatMode === 'all') this.state.repeatMode = 'one';
        else this.state.repeatMode = 'none';
        this.updateUI();
    },
    
    formatTime(seconds) {
        if (isNaN(seconds)) return '0:00';
        const minutes = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${minutes}:${secs < 10 ? '0' : ''}${secs}`;
    },
};

// Expose to global scope for inline scripts
window.TitchukePlayer = TitchukePlayer;

// Initialize on DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => TitchukePlayer.init());

// Export for module scripts
export const playMusic = (playlist, startIndex) => {
    TitchukePlayer.playMusic(playlist, startIndex);
};
