import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js';
import {
  getFirestore,
  collection,
  getDocs,
  query,
  where,
  documentId,
  doc,
  updateDoc,
  arrayUnion,
  arrayRemove
} from 'https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js';

// --- FIREBASE CONFIG ---
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

// --- VIEW TRACKER ---
async function recordView(songId) {
  if (!currentVisitorId) {
    setTimeout(() => recordView(songId), 500);
    return;
  }

  const viewedSongs = JSON.parse(sessionStorage.getItem('viewedSongs') || '[]');
  if (viewedSongs.includes(songId)) return;

  try {
    const musicDocRef = doc(db, 'music', songId);
    await updateDoc(musicDocRef, { views: arrayUnion(currentVisitorId) });
    viewedSongs.push(songId);
    sessionStorage.setItem('viewedSongs', JSON.stringify(viewedSongs));
    console.log(`✅ View recorded for ${songId}`);
  } catch (error) {
    console.error("Error recording view:", error);
  }
}

// --- UTILITIES ---
function formatTime(seconds) {
  if (isNaN(seconds)) return '0:00';
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${minutes}:${secs < 10 ? '0' : ''}${secs}`;
}

// --- PLAYER UI ---
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
        <button id="like-btn" class="control-btn secondary" title="Like"><i class='bx bx-heart'></i></button>
        <button id="shuffle-btn" class="control-btn secondary" title="Shuffle"><i class='bx bx-shuffle'></i></button>
        <button id="prev-btn" class="control-btn" title="Previous"><i class='bx bx-skip-previous'></i></button>
        <button id="play-pause-btn" class="control-btn main" title="Play"><i class='bx bx-play'></i></button>
        <button id="next-btn" class="control-btn" title="Next"><i class='bx bx-skip-next'></i></button>
        <button id="repeat-btn" class="control-btn secondary" title="Repeat"><i class='bx bx-repeat'></i></button>
        <button id="download-btn" class="control-btn secondary" title="Download"><i class='bx bxs-download'></i></button>
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
  
  const likedSongs = JSON.parse(localStorage.getItem('likedSongs') || '{}');
  const isLiked = likedSongs[song.id]?.includes(currentVisitorId);
  const likeBtn = document.getElementById('like-btn');
  if (likeBtn) {
      likeBtn.classList.toggle('active', isLiked);
      likeBtn.innerHTML = isLiked ? "<i class='bx bxs-heart'></i>" : "<i class='bx bx-heart'></i>";
  }

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

  upcomingSongs.forEach((song) => {
    const item = document.createElement('div');
    item.className = 'playlist-item';
    item.innerHTML = `
      <img src="${song.posterUrl}" alt="${song.title}">
      <div>
        <h5>${song.title}</h5>
        <p>${song.artist}</p>
      </div>
    `;
    item.addEventListener('click', () => {
      const originalIndex = playlist.findIndex(p => p.id === song.id);
      if (originalIndex !== -1) loadSong(originalIndex);
    });
    playlistEl.appendChild(item);
  });
}

// --- CONTROLS ---
function attachEventListeners() {
  document.getElementById('play-pause-btn').addEventListener('click', togglePlayPause);
  document.getElementById('next-btn').addEventListener('click', playNext);
  document.getElementById('prev-btn').addEventListener('click', playPrevious);
  document.getElementById('shuffle-btn').addEventListener('click', toggleShuffle);
  document.getElementById('repeat-btn').addEventListener('click', cycleRepeatMode);
  document.getElementById('like-btn').addEventListener('click', toggleLike);
  document.getElementById('download-btn').addEventListener('click', handleDownload);

  const progressContainer = document.getElementById('progress-bar-container');
  progressContainer.addEventListener('click', (e) => {
    if (!isNaN(audio.duration)) {
      const rect = progressContainer.getBoundingClientRect();
      const clickPosition = (e.clientX - rect.left) / rect.width;
      audio.currentTime = clickPosition * audio.duration;
    }
  });

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
  const song = playlist[currentIndex];
  recordView(song.id);
  updateUIForCurrentSong();
  audio.src = song.audioUrl;
  audio.load();
  if (isPlaying) audio.play().catch(e => console.error("Error playing audio:", e));
}

function togglePlayPause() {
  if (audio.paused) audio.play().catch(e => console.error("Error playing audio:", e));
  else audio.pause();
}

function playNext() {
  let nextIndex = currentIndex + 1;
  if (nextIndex >= playlist.length) {
    if (repeatMode === 'all') nextIndex = 0;
    else {
      isPlaying = false;
      audio.pause();
      loadSong(0);
      return;
    }
  }
  loadSong(nextIndex);
}

function playPrevious() {
  let prevIndex = currentIndex - 1;
  if (prevIndex < 0) prevIndex = playlist.length - 1;
  loadSong(prevIndex);
}

async function toggleLike() {
    if (!currentVisitorId || currentIndex < 0) return;

    const song = playlist[currentIndex];
    const songId = song.id;
    const musicDocRef = doc(db, 'music', songId);

    const likedSongs = JSON.parse(localStorage.getItem('likedSongs') || '{}');
    const isLiked = likedSongs[songId]?.includes(currentVisitorId);

    const likeBtn = document.getElementById('like-btn');
    likeBtn.disabled = true;

    try {
        if (isLiked) {
            await updateDoc(musicDocRef, { likes: arrayRemove(currentVisitorId) });
            if (likedSongs[songId]) {
                likedSongs[songId] = likedSongs[songId].filter(id => id !== currentVisitorId);
            }
        } else {
            await updateDoc(musicDocRef, { likes: arrayUnion(currentVisitorId) });
            if (!likedSongs[songId]) {
                likedSongs[songId] = [];
            }
            likedSongs[songId].push(currentVisitorId);
        }
        localStorage.setItem('likedSongs', JSON.stringify(likedSongs));
        updateUIForCurrentSong(); // Re-render button state
    } catch (error) {
        console.error("Error toggling like:", error);
    } finally {
        likeBtn.disabled = false;
    }
}

async function handleDownload() {
    if (!currentVisitorId || currentIndex < 0) return;
    
    const song = playlist[currentIndex];
    const songId = song.id;

    const downloadedSongs = JSON.parse(localStorage.getItem('downloadedSongs') || '{}');
    if (!downloadedSongs[songId]?.includes(currentVisitorId)) {
        try {
            const musicDocRef = doc(db, 'music', songId);
            await updateDoc(musicDocRef, { downloads: arrayUnion(currentVisitorId) });

            if(!downloadedSongs[songId]) downloadedSongs[songId] = [];
            downloadedSongs[songId].push(currentVisitorId);
            localStorage.setItem('downloadedSongs', JSON.stringify(downloadedSongs));
        } catch (error) {
            console.error("Error updating download count:", error);
        }
    }

    const link = document.createElement('a');
    link.href = song.audioUrl;
    link.download = `${song.artist} - ${song.title}.mp3`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function toggleShuffle() {
  isShuffling = !isShuffling;
  document.getElementById('shuffle-btn').classList.toggle('active', isShuffling);
  const currentSongId = playlist[currentIndex]?.id;
  if (isShuffling) {
    const currentSong = playlist[currentIndex];
    const otherSongs = playlist.filter(s => s.id !== currentSong.id);
    for (let i = otherSongs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [otherSongs[i], otherSongs[j]] = [otherSongs[j], otherSongs[i]];
    }
    playlist = [currentSong, ...otherSongs];
    currentIndex = 0;
  } else {
    playlist = [...originalPlaylist];
    currentIndex = playlist.findIndex(s => s.id === currentSongId);
  }
  updatePlaylistUI();
}

function cycleRepeatMode() {
  const repeatBtn = document.getElementById('repeat-btn');
  if (repeatMode === 'none') {
    repeatMode = 'all';
    repeatBtn.innerHTML = "<i class='bx bx-repost'></i>";
  } else if (repeatMode === 'all') {
    repeatMode = 'one';
    repeatBtn.innerHTML = "<i class='bx bx-repeat'></i><span class='repeat-one-indicator'>1</span>";
  } else {
    repeatMode = 'none';
    repeatBtn.innerHTML = "<i class='bx bx-repeat'></i>";
  }
}

function handleSongEnd() {
  if (repeatMode === 'one') {
    audio.currentTime = 0;
    audio.play();
  } else {
    playNext();
  }
}

// --- INITIALIZATION ---
async function initializePlayer() {
  const urlParams = new URLSearchParams(window.location.search);
  const songId = urlParams.get('id');
  const playlistIdsStr = sessionStorage.getItem('currentPlaylist');

  if (!songId || !playlistIdsStr) {
    contentWrapper.innerHTML = `
      <div class="player-error">
        <h2>Playback Error</h2>
        <p>No song or playlist selected.</p>
        <a href="index-1.html" class="back-link">Go to Discover</a>
      </div>`;
    return;
  }

  contentWrapper.innerHTML = `<div class="player-loading"><div class="loader"></div><p>Loading your music...</p></div>`;

  try {
    const playlistIds = JSON.parse(playlistIdsStr);
    const fetchedSongs = [];

    // 🔧 FIX: Split into chunks of 10 for Firestore 'in' query
    for (let i = 0; i < playlistIds.length; i += 10) {
      const chunk = playlistIds.slice(i, i + 10);
      const songsQuery = query(collection(db, 'music'), where(documentId(), 'in', chunk));
      const snapshot = await getDocs(songsQuery);
      snapshot.docs.forEach(doc => fetchedSongs.push({ id: doc.id, ...doc.data() }));
    }

    playlist = playlistIds.map(id => fetchedSongs.find(s => s.id === id)).filter(Boolean);
    originalPlaylist = [...playlist];

    const initialIndex = playlist.findIndex(s => s.id === songId);
    if (initialIndex === -1) throw new Error("Selected song not found.");

    renderPlayerUI();
    isPlaying = true;
    loadSong(initialIndex);

  } catch (error) {
    console.error("Error initializing player:", error);
    contentWrapper.innerHTML = `
      <div class="player-error">
        <h2>Playback Error</h2>
        <p>Could not load the selected song or playlist.</p>
        <a href="index.html" class="back-link">Go to Discover</a>
      </div>`;
  }
}

document.addEventListener('DOMContentLoaded', initializePlayer);
