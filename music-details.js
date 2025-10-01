import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

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

// Helper to format large numbers into K/M format
function formatCount(num) {
    if (num === null || num === undefined) return '0';
    if (num < 1000) return num.toString();
    if (num < 1000000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
    return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
}

// Function to get music details from Firestore by ID
async function getMusicDetails(songId) {
    const musicDocRef = doc(db, "music", songId);
    const docSnap = await getDoc(musicDocRef);

    if (docSnap.exists()) {
        return { id: docSnap.id, ...docSnap.data() };
    } else {
        return null;
    }
}

// Extract music ID from query parameters
const urlParams = new URLSearchParams(window.location.search);
const songId = urlParams.get("id");

if (songId) {
    getMusicDetails(songId).then(music => {
        if (music) {
            document.title = `${music.title} by ${music.artist} - TITCHUKE`;
            document.getElementById("title").innerText = music.title;
            document.getElementById("artist").innerText = music.artist;
            document.getElementById("downloads").innerText = formatCount(music.downloads?.length || 0);
            document.getElementById("views").innerText = formatCount(music.views?.length || 0);
            document.getElementById("poster").src = music.posterUrl;
            document.getElementById("audio-source").src = music.audioUrl;
            document.getElementById("audio-player").load();
        } else {
            document.body.innerHTML = "<h2>Music not found!</h2><a href='index-1.html'>Go Home</a>";
        }
    }).catch(error => {
        console.error("Error fetching music details:", error);
        document.body.innerHTML = "<h2>Error loading music details.</h2><a href='index-1.html'>Go Home</a>";
    });
} else {
    document.body.innerHTML = "<h2>Invalid music link.</h2><a href='index-1.html'>Go Home</a>";
}
