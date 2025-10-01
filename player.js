
import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js';
import { getFirestore, collection, getDocs, query, where, documentId, doc, updateDoc, arrayUnion } from 'https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js';


const firebaseConfig = {
    apiKey: "AIzaSyDkANMB95-hIl4-I2gla5qtsH3BlH77nU8",
    authDomain: "music-upload-30cc3.firebaseapp.com",
    projectId: "music-upload-30cc3",
    storageBucket: "music-upload-30cc3.firebasestorage.app",
    messagingSenderId: "385597338493",
    appId: "1:385597338493:web:04696d4dc201e8427e1214"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// --- STATE MANAGEMENT ---
let audio = new Audio();
let playlist = [];
let originalPlaylist = [];
let currentIndex = -1;
let isPlaying = false;
let isShuffling = false;
let repeatMode = 'none'; // 'none', 'one', 'all'
let currentVisitorId = null;

// --- AUTH STATE ---
onAuthStateChanged(auth, (user) => {
  if (user) {
    currentVisitorId = user.uid;
  } else {
    if (!localStorage.getItem('guestId')) {
      const randomId = 'guest_' + Math.random().toString(36).substring(2, 15);
      localStorage.setItem('guestId', randomId);
    }
    currentVisitorId = localStorage.getItem('guestId');
  }
});


// --- DOM ELEMENTS ---
const backgroundEl = document.getElementById('player-background');
const contentWrapper = document.getElementById('player-content-wrapper');

async function recordView(songId) {
    // wait a moment for currentVisitorId to be set by onAuthStateChanged
    if (!currentVisitorId) {
        setTimeout(() => recordView(songId), 500);
        return;
    }

    const viewedSongs = JSON.parse(sessionStorage.getItem('viewedSongs') || '[]');
    if (viewedSongs.includes(songId)) {
        return; // Already viewed in this session
    }

    try {
        const musicDocRef = doc(db, 'music', songId);
        await updateDoc(musicDocRef, {
            views: arrayUnion(currentVisitorId)
        });
        
        viewedSongs.push(songId);
        sessionStorage.setItem('viewedSongs', JSON.stringify(viewedSongs));
        console.log(`View recorded for song ${songId}`);
    } catch (error) {
        console.error("Error recording view:", error);
    }
}

function formatTime(seconds) {
    if (isNaN(seconds)) return '0:00';
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes}:${secs < 10 ? '0' : ''}${secs}`;
}

function renderPlayerUI() {
    contentWrapper.innerHTML = `
        <div class="player-container">
            <div class="player-poster">
                <img id="poster-img" src="" alt="Album Art">
            </div>
            <div class="player-details">
                <h1 id="song-title"></h1>
                <p id="song-artist"></p>
            </div>
            <div class="player-progress">
                <div id="progress-bar-container">
                    <div id="progress-bar"></div>
                </div>
                <div class="time-labels">
                    <span id="current-time">0:00</span>
                    <span id="total-duration">0:00</span>
                </div>
            </div>
            <div class="player-controls">
                <button id="shuffle-btn" class="control-btn secondary" title="Shuffle"><i class='bx bx-shuffle'></i></button>
                <button id="prev-btn" class="control-btn" title="Previous"><i class='bx bx-skip-previous'></i></button>
                <button id="play-pause-btn" class="control-btn main" title="Play"><i class='bx bx-play'></i></button>
                <button id="next-btn" class="control-btn" title="Next"><i class='bx bx-skip-next'></i></button>
                <button id="repeat-btn" class="control-btn secondary" title="Repeat"><i class='bx bx-repeat'></i></button>
            </div>
        </div>
        <div class="playlist-container">
            <h4>Up Next</h4>
            <div id="playlist-list"></div>
        </div>
    `;
    attachEventListeners();
}

function updateUIForCurrentSong() {
    if (currentIndex < 0 || !playlist[currentIndex]) return;
    const song = playlist[currentIndex];
    
    document.title = `${song.title} by ${song.artist} - Titchuke`;
    document.getElementById('poster-img').src = song.posterUrl;
    document.getElementById('song-title').textContent = song.title;
    document.getElementById('song-artist').textContent = song.artist;
    backgroundEl.style.backgroundImage = `url(${song.posterUrl})`;

    updatePlaylistUI();
}

function updatePlaylistUI() {
    const playlistEl = document.getElementById('playlist-list');
    if (!playlistEl) return;
    
    playlistEl.innerHTML = '';
    const upcomingSongs = playlist.slice(currentIndex + 1);
    if (repeatMode === 'all' && upcomingSongs.length === 0) {
        upcomingSongs.push(...playlist);
    }

    upcomingSongs.forEach((song, index) => {
        const item = document.createElement('div');
        item.className = 'playlist-item';
        item.innerHTML = `
            <img src="${song.posterUrl}" alt="${song.title}">
            <div>
                <h5>${song.title}</h5>
                <p>${song.artist}</p>
            </div>
        `;
        // This click handler needs to find the song in the *main* playlist array
        item.addEventListener('click', () => {
            const originalIndex = playlist.findIndex(pSong => pSong.id === song.id);
            if (originalIndex !== -1) {
                loadSong(originalIndex);
            }
        });
        playlistEl.appendChild(item);
    });
}

function attachEventListeners() {
    // Player controls
    document.getElementById('play-pause-btn').addEventListener('click', togglePlayPause);
    document.getElementById('next-btn').addEventListener('click', playNext);
    document.getElementById('prev-btn').addEventListener('click', playPrevious);
    document.getElementById('shuffle-btn').addEventListener('click', toggleShuffle);
    document.getElementById('repeat-btn').addEventListener('click', cycleRepeatMode);

    // Progress bar
    const progressContainer = document.getElementById('progress-bar-container');
    progressContainer.addEventListener('click', (e) => {
        if (!isNaN(audio.duration)) {
            const rect = progressContainer.getBoundingClientRect();
            const clickPosition = (e.clientX - rect.left) / rect.width;
            audio.currentTime = clickPosition * audio.duration;
        }
    });

    // Audio element events
    audio.addEventListener('timeupdate', () => {
        if (!isNaN(audio.duration)) {
            document.getElementById('progress-bar').style.width = `${(audio.currentTime / audio.duration) * 100}%`;
            document.getElementById('current-time').textContent = formatTime(audio.currentTime);
        }
    });
    audio.addEventListener('loadedmetadata', () => {
        document.getElementById('total-duration').textContent = formatTime(audio.duration);
    });
    audio.addEventListener('ended', handleSongEnd);
    audio.addEventListener('play', () => {
        isPlaying = true;
        document.getElementById('play-pause-btn').innerHTML = `<i class='bx bx-pause'></i>`;
    });
    audio.addEventListener('pause', () => {
        isPlaying = false;
        document.getElementById('play-pause-btn').innerHTML = `<i class='bx bx-play'></i>`;
    });
}

function loadSong(index) {
    currentIndex = index;
    updateUIForCurrentSong();
    
    const song = playlist[currentIndex];
    recordView(song.id); // Record view when a new song is loaded
    audio.src = song.audioUrl;
    audio.load();
    if (isPlaying) {
        audio.play().catch(e => console.error("Error playing audio:", e));
    }
}

function togglePlayPause() {
    if (audio.paused) {
        audio.play().catch(e => console.error("Error playing audio:", e));
    } else {
        audio.pause();
    }
}

function playNext() {
    let nextIndex = currentIndex + 1;
    if (nextIndex >= playlist.length) {
        if (repeatMode === 'all') {
            nextIndex = 0;
        } else {
            // Stop playback
            isPlaying = false;
            audio.pause();
            loadSong(0); // Reset to first song but paused
            return;
        }
    }
    loadSong(nextIndex);
}

function playPrevious() {
    let prevIndex = currentIndex - 1;
    if (prevIndex < 0) {
        prevIndex = playlist.length - 1; // Loop to the end
    }
    loadSong(prevIndex);
}

function toggleShuffle() {
    isShuffling = !isShuffling;
    document.getElementById('shuffle-btn').classList.toggle('active', isShuffling);

    if (isShuffling) {
        // Save current song
        const currentSong = playlist[currentIndex];
        // Shuffle the rest of the playlist
        const otherSongs = playlist.filter(s => s.id !== currentSong.id);
        for (let i = otherSongs.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [otherSongs[i], otherSongs[j]] = [otherSongs[j], otherSongs[i]];
        }
        // Re-create playlist with current song at the beginning
        playlist = [currentSong, ...otherSongs];
        currentIndex = 0;
    } else {
        // Restore original order
        const currentSongId = playlist[currentIndex].id;
        playlist = [...originalPlaylist];
        currentIndex = playlist.findIndex(s => s.id === currentSongId);
    }
    updatePlaylistUI();
}

function cycleRepeatMode() {
    const repeatBtn = document.getElementById('repeat-btn');
    if (repeatMode === 'none') {
        repeatMode = 'all';
        repeatBtn.classList.add('active');
        repeatBtn.innerHTML = "<i class='bx bx-repost'></i>";
    } else if (repeatMode === 'all') {
        repeatMode = 'one';
        repeatBtn.classList.add('active');
        repeatBtn.innerHTML = "<i class='bx bx-repeat'></i><span class='repeat-one-indicator'>1</span>";
    } else {
        repeatMode = 'none';
        repeatBtn.classList.remove('active');
        repeatBtn.innerHTML = "<i class='bx bx-repeat'></i>";
    }
    updatePlaylistUI();
}

function handleSongEnd() {
    if (repeatMode === 'one') {
        audio.currentTime = 0;
        audio.play();
    } else {
        playNext();
    }
}

async function initializePlayer() {
    const urlParams = new URLSearchParams(window.location.search);
    const songId = urlParams.get('id');
    const playlistIdsStr = sessionStorage.getItem('currentPlaylist');

    if (!songId || !playlistIdsStr) {
        contentWrapper.innerHTML = `
            <div class="player-error">
                <h2>Playback Error</h2>
                <p>No song or playlist was selected. Please go back and select a song to play.</p>
                <a href="index-1.html" class="back-link">Go to Discover</a>
            </div>`;
        return;
    }
    
    contentWrapper.innerHTML = `<div class="player-loading"><div class="loader"></div><p>Loading your music...</p></div>`;

    try {
        const playlistIds = JSON.parse(playlistIdsStr);
        
        const songsQuery = query(collection(db, 'music'), where(documentId(), 'in', playlistIds));
        const snapshot = await getDocs(songsQuery);
        
        const fetchedSongs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // Re-order fetched songs to match the original playlist order
        playlist = playlistIds.map(id => fetchedSongs.find(song => song.id === id)).filter(Boolean);
        originalPlaylist = [...playlist];

        const initialIndex = playlist.findIndex(s => s.id === songId);

        if (initialIndex === -1) {
            throw new Error("Selected song not found in the playlist.");
        }

        renderPlayerUI();
        isPlaying = true; // Autoplay on load
        loadSong(initialIndex);

    } catch (error) {
        console.error("Error initializing player:", error);
        contentWrapper.innerHTML = `
            <div class="player-error">
                <h2>Playback Error</h2>
                <p>Could not load the selected song or playlist. Please try again.</p>
                 <a href="index-1.html" class="back-link">Go to Discover</a>
            </div>`;
    }
}

document.addEventListener('DOMContentLoaded', initializePlayer);
