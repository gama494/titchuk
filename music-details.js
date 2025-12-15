
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
  apiKey: "AIzaSyA6S3m7vXt78iaS3r6Z0XAVHcVCm9mroC0",
  authDomain: "titchuke-7fecd.firebaseapp.com",
  projectId: "titchuke-7fecd",
  storageBucket: "titchuke-7fecd.firebasestorage.app",
  messagingSenderId: "538951879592",
  appId: "1:538951879592:web:3047441e4e4b54e2922b9d",
  measurementId: "G-D46Q0962RQ"
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
const copyLinkBtn = document.getElementById("copy-link-btn");

/**
 * Safely retrieves and parses an array from localStorage.
 * This prevents errors from corrupted or non-array data.
 * @param {string} key The localStorage key.
 * @returns {Array} The parsed array or an empty array if an error occurs.
 */
function getArrayFromLocalStorage(key) {
    try {
        const item = localStorage.getItem(key);
        if (!item) return [];
        const parsed = JSON.parse(item);
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        console.warn(`Error parsing localStorage item "${key}". Resetting.`, e);
        localStorage.removeItem(key); // Clear corrupted data
        return [];
    }
}

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
    const localLikedSongs = getArrayFromLocalStorage('likedSongs');
    const isLiked = localLikedSongs.includes(currentSongData.id);
    
    likeBtn.classList.toggle('liked', isLiked);
    likeBtn.querySelector('i').classList.toggle('bxs-heart', isLiked);
    likeBtn.querySelector('i').classList.toggle('bx-heart', !isLiked);
    likeBtn.querySelector('span').innerText = isLiked ? 'Liked' : 'Like';
}

// --- Interaction Handlers ---

// Record view on every play. Firestore handles uniqueness.
async function recordView(songId) {
    if (!currentVisitorId) return;

    try {
        const musicDocRef = doc(db, 'music', songId);
        // arrayUnion is idempotent: it won't add a duplicate visitorId.
        // This is safe and efficient to call on every play event.
        await updateDoc(musicDocRef, { views: arrayUnion(currentVisitorId) });
        
        // To ensure the UI updates if the count changes, we re-fetch the data.
        const updatedDoc = await getDoc(musicDocRef);
        if (updatedDoc.exists()) {
            currentSongData.views = updatedDoc.data().views || [];
            updateStats();
        }
    } catch (error) {
        // Silently fail on view recording to not interrupt user experience.
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
    const localLikedSongs = getArrayFromLocalStorage('likedSongs');
    const isLiked = localLikedSongs.includes(songId);

    likeBtn.disabled = true;

    try {
        if (isLiked) {
            await updateDoc(musicDocRef, { likes: arrayRemove(currentVisitorId) });
            const index = localLikedSongs.indexOf(songId);
            if (index > -1) localLikedSongs.splice(index, 1);
        } else {
            await updateDoc(musicDocRef, { likes: arrayUnion(currentVisitorId) });
            if (!localLikedSongs.includes(songId)) {
                localLikedSongs.push(songId);
            }
        }
        
        localStorage.setItem('likedSongs', JSON.stringify(localLikedSongs));

        const updatedDoc = await getDoc(musicDocRef);
        currentSongData.likes = updatedDoc.data().likes || [];
        
        updateStats();
        updateLikeButtonState();

    } catch (error) {
        console.error("Error toggling like:", error);
        alert("Failed to update like status. Please check your connection and try again.");
    } finally {
        likeBtn.disabled = false;
    }
}


// Handle download and count. Firestore handles uniqueness.
async function handleDownload(e) {
    e.preventDefault();
    if (!currentVisitorId || !currentSongData) return;

    const songId = currentSongData.id;
    downloadBtn.disabled = true;

    try {
        const musicDocRef = doc(db, 'music', songId);
        // Atomically update the download count. arrayUnion prevents duplicates.
        await updateDoc(musicDocRef, { downloads: arrayUnion(currentVisitorId) });

        const updatedDoc = await getDoc(musicDocRef);
        if (updatedDoc.exists()) {
            currentSongData.downloads = updatedDoc.data().downloads || [];
            updateStats(); // Refresh the UI with the new count
        }
    } catch (error) {
        console.error("Error updating download count:", error);
        // Don't block the download even if counting fails.
    } finally {
        downloadBtn.disabled = false;
    }
    
    // Always proceed to the download page for a consistent experience.
    const downloadUrl = `download.html?title=${encodeURIComponent(currentSongData.title)}&artist=${encodeURIComponent(currentSongData.artist)}&poster=${encodeURIComponent(currentSongData.posterUrl)}&audio=${encodeURIComponent(currentSongData.audioUrl)}`;
    window.open(downloadUrl, '_blank');
}

function handleCopyLink() {
    if (!currentSongData) return;
    const detailPageUrl = window.location.href;
    navigator.clipboard.writeText(detailPageUrl).then(() => {
        const btnSpan = copyLinkBtn.querySelector('span');
        const originalText = btnSpan.innerText;
        btnSpan.innerText = 'Copied!';
        copyLinkBtn.classList.add('copied');
        copyLinkBtn.disabled = true;
        setTimeout(() => {
            btnSpan.innerText = originalText;
            copyLinkBtn.classList.remove('copied');
            copyLinkBtn.disabled = false;
        }, 2000);
    }).catch(err => {
        console.error('Failed to copy link: ', err);
        alert('Failed to copy link.');
    });
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

            // Record a view every time the user presses play.
            audioPlayerEl.addEventListener('play', () => recordView(id));
            likeBtn.addEventListener('click', toggleLike);
            downloadBtn.addEventListener('click', handleDownload);
            copyLinkBtn.addEventListener('click', handleCopyLink);

        } else {
            document.body.innerHTML = "<h2>Music not found!</h2><a href='index.html'>Go Home</a>";
        }
    } catch (error) {
        console.error("Error fetching music details:", error);
        document.body.innerHTML = "<h2>Error loading music details.</h2><a href='index.html'>Go Home</a>";
    }
}