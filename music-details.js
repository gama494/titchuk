
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { 
    getFirestore, 
    doc, 
    getDoc, 
    updateDoc, 
    arrayUnion, 
    arrayRemove 
} from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
import { 
    getAuth, 
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";

// ✅ Consistent Firebase Config
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

let currentVisitorId = null;
let currentSongData = null;

// DOM Elements
const titleEl = document.getElementById("title");
const artistEl = document.getElementById("artist");
const downloadsEl = document.getElementById("downloads");
const viewsEl = document.getElementById("views");
const likesEl = document.getElementById("likes");
const posterEl = document.getElementById("poster");
const audioSourceEl = document.getElementById("audio-source");
const audioPlayerEl = document.getElementById("audio-player");
const likeBtn = document.getElementById("like-btn");
const downloadBtn = document.getElementById("download-btn");

// Helper to format numbers like 1000 -> 1K
function formatCount(num) {
    if (num === null || num === undefined) return '0';
    if (num < 1000) return num.toString();
    if (num < 1000000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
    return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
}

// Update UI with song data
function updateUI(music) {
    currentSongData = music;
    document.title = `${music.title} by ${music.artist} - Titchuke`;
    titleEl.innerText = music.title;
    artistEl.innerText = `by ${music.artist}`;
    posterEl.src = music.posterUrl;
    audioSourceEl.src = music.audioUrl;
    audioPlayerEl.load();

    updateStats();
    updateLikeButtonState();
}

function updateStats() {
    if (!currentSongData) return;
    likesEl.innerText = formatCount(currentSongData.likes?.length || 0);
    viewsEl.innerText = formatCount(currentSongData.views?.length || 0);
    downloadsEl.innerText = formatCount(currentSongData.downloads?.length || 0);
}

function updateLikeButtonState() {
    if (!currentSongData || !currentVisitorId) return;
    const isLiked = currentSongData.likes?.includes(currentVisitorId);
    
    likeBtn.classList.toggle('liked', isLiked);
    likeBtn.querySelector('i').classList.toggle('bxs-heart', isLiked);
    likeBtn.querySelector('i').classList.toggle('bx-heart', !isLiked);
    likeBtn.querySelector('span').innerText = isLiked ? 'Liked' : 'Like';
}

// --- Interaction Handlers ---

// Record view (once per browser session)
async function recordView(songId) {
    if (!currentVisitorId) return;

    const viewedSongs = JSON.parse(sessionStorage.getItem('viewedSongs') || '[]');
    if (viewedSongs.includes(songId)) return;

    try {
        const musicDocRef = doc(db, 'music', songId);
        // Pessimistic write to DB
        await updateDoc(musicDocRef, { views: arrayUnion(currentVisitorId) });
        
        // Update local state *after* successful write
        if (!currentSongData.views.includes(currentVisitorId)) {
            currentSongData.views.push(currentVisitorId);
        }
        updateStats();

        // Update session storage to prevent re-counting
        viewedSongs.push(songId);
        sessionStorage.setItem('viewedSongs', JSON.stringify(viewedSongs));
        
    } catch (error) {
        console.error("Error recording view:", error);
    }
}

// Toggle like status (once per person/device)
async function toggleLike() {
    if (!currentVisitorId || !currentSongData) {
        alert("Please sign in or wait for the song to load to like it.");
        return;
    }
    
    const songId = currentSongData.id;
    const musicDocRef = doc(db, 'music', songId);
    const isLiked = currentSongData.likes?.includes(currentVisitorId);

    likeBtn.disabled = true;

    try {
        if (isLiked) {
            await updateDoc(musicDocRef, { likes: arrayRemove(currentVisitorId) });
            currentSongData.likes = currentSongData.likes.filter(id => id !== currentVisitorId);
        } else {
            await updateDoc(musicDocRef, { likes: arrayUnion(currentVisitorId) });
            if (!currentSongData.likes.includes(currentVisitorId)) {
                currentSongData.likes.push(currentVisitorId);
            }
        }
        
        updateStats();
        updateLikeButtonState();

    } catch (error) {
        console.error("Error toggling like:", error);
        alert("Failed to update like status. Please check your connection and try again.");
    } finally {
        likeBtn.disabled = false;
    }
}

// Handle download and count (once per person/device)
async function handleDownload(e) {
    e.preventDefault();
    if (!currentVisitorId || !currentSongData) return;

    const songId = currentSongData.id;
    const downloadedSongs = JSON.parse(localStorage.getItem('downloadedSongs') || '[]');
    const hasBeenCounted = downloadedSongs.includes(songId);

    if (!hasBeenCounted) {
        downloadBtn.disabled = true;
        try {
            const musicDocRef = doc(db, 'music', songId);
            await updateDoc(musicDocRef, { downloads: arrayUnion(currentVisitorId) });

            if (!currentSongData.downloads.includes(currentVisitorId)) {
                currentSongData.downloads.push(currentVisitorId);
            }
            updateStats();

            downloadedSongs.push(songId);
            localStorage.setItem('downloadedSongs', JSON.stringify(downloadedSongs));
            
        } catch (error) {
            console.error("Error updating download count:", error);
        } finally {
            downloadBtn.disabled = false;
        }
    }
    
    const link = document.createElement('a');
    link.href = currentSongData.audioUrl;
    link.download = `${currentSongData.artist} - ${currentSongData.title}.mp3`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// --- Initialization ---
const urlParams = new URLSearchParams(window.location.search);
const songId = urlParams.get("id");

if (!songId) {
    document.body.innerHTML = "<h2>Invalid music link.</h2><a href='index.html'>Go Home</a>";
} else {
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
        loadMusicDetails(songId);
    });
}

async function loadMusicDetails(id) {
    try {
        const musicDocRef = doc(db, "music", id);
        const docSnap = await getDoc(musicDocRef);

        if (docSnap.exists()) {
            const musicData = { id: docSnap.id, ...docSnap.data() };
            // Ensure arrays exist to prevent errors on new songs
            musicData.likes = musicData.likes || [];
            musicData.views = musicData.views || [];
            musicData.downloads = musicData.downloads || [];
            
            updateUI(musicData);

            audioPlayerEl.addEventListener('play', () => recordView(id));
            likeBtn.addEventListener('click', toggleLike);
            downloadBtn.addEventListener('click', handleDownload);

        } else {
            document.body.innerHTML = "<h2>Music not found!</h2><a href='index.html'>Go Home</a>";
        }
    } catch (error) {
        console.error("Error fetching music details:", error);
        document.body.innerHTML = "<h2>Error loading music details.</h2><a href='index.html'>Go Home</a>";
    }
}
