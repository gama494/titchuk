
// ✅ Firebase imports
import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js';
import {
  getFirestore,
  collection,
  getDocs,
  updateDoc,
  doc,
  query,
  orderBy,
  arrayUnion,
  arrayRemove,
  getDoc
} from 'https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js';
import {
  getAuth,
  onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js';

// ✅ Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDkANMB95-hIl4-I2gla5qtsH3BlH77nU8",
  authDomain: "music-upload-30cc3.firebaseapp.com",
  projectId: "music-upload-30cc3",
  storageBucket: "music-upload-30cc3.firebasestorage.app",
  messagingSenderId: "385597338493",
  appId: "1:385597338493:web:04696d4dc201e8427e1214"
};

// ✅ Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

let currentVisitorId = null;
let allMusicData = [];
let currentlyDisplayedMusicIds = [];

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

// Get a unique ID for the visitor, whether logged in or a guest
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
  loadAllMusic();
});

// Helper to format large numbers into K/M format
function formatCount(num) {
    if (num === null || num === undefined) return '0';
    if (num < 1000) return num.toString();
    if (num < 1000000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
    return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
}

function handlePlayRedirect(songId) {
    sessionStorage.setItem('currentPlaylist', JSON.stringify(currentlyDisplayedMusicIds));
    window.location.href = `player.html?id=${songId}`;
}

async function handleDownload(song, docId, card) {
    if (!currentVisitorId) return;

    // Immediately attempt to update the count on every download click.
    // Firestore's arrayUnion will prevent duplicates for the same user.
    try {
        const musicDocRef = doc(db, 'music', docId);
        await updateDoc(musicDocRef, { downloads: arrayUnion(currentVisitorId) });

        // Re-fetch to update the card's count accurately and immediately.
        const updatedDoc = await getDoc(musicDocRef);
        if (updatedDoc.exists()) {
            const updatedDownloads = updatedDoc.data().downloads || [];
            if (card) {
                card.querySelector('.download-count').textContent = formatCount(updatedDownloads.length);
            }
        }
    } catch (error) {
        console.error("Error updating download count:", error);
    }
    
    // Always proceed to the download page, even if counting fails.
    const downloadUrl = `download.html?title=${encodeURIComponent(song.title)}&artist=${encodeURIComponent(song.artist)}&poster=${encodeURIComponent(song.posterUrl)}&audio=${encodeURIComponent(song.audioUrl)}`;
    window.open(downloadUrl, '_blank');
}


async function toggleLike(docId, card) {
    if (!currentVisitorId) {
        alert("Please log in to like music.");
        return;
    }

    const musicDocRef = doc(db, 'music', docId);
    const likeBtn = card.querySelector('.like-btn');
    const likeCountSpan = card.querySelector('.like-count');
    const localLikedSongs = getArrayFromLocalStorage('likedSongs');
    const isLiked = localLikedSongs.includes(docId);

    likeBtn.disabled = true;

    try {
        if (isLiked) {
            await updateDoc(musicDocRef, { likes: arrayRemove(currentVisitorId) });
            const index = localLikedSongs.indexOf(docId);
            if (index > -1) localLikedSongs.splice(index, 1);
        } else {
            await updateDoc(musicDocRef, { likes: arrayUnion(currentVisitorId) });
            localLikedSongs.push(docId);
        }
        localStorage.setItem('likedSongs', JSON.stringify(localLikedSongs));

        const updatedDoc = await getDoc(musicDocRef);
        if (updatedDoc.exists()) {
            const updatedLikes = updatedDoc.data().likes || [];
            likeCountSpan.textContent = formatCount(updatedLikes.length);
            likeBtn.classList.toggle('liked', !isLiked);
        }
    } catch (error) {
        console.error("Error toggling like:", error);
        alert("There was an issue liking the song.");
    } finally {
        likeBtn.disabled = false;
    }
}

function handleCopyLink(songId, card) {
  const detailPageUrl = `${window.location.origin}/music-details.html?id=${songId}`;
  const btn = card.querySelector('.copy-link-btn');
  const icon = btn.querySelector('i');

  navigator.clipboard.writeText(detailPageUrl).then(() => {
      icon.className = 'bx bx-check';
      btn.disabled = true;
      setTimeout(() => {
          icon.className = 'bx bx-link';
          btn.disabled = false;
      }, 2000);
  }).catch(err => {
      console.error('Failed to copy link: ', err);
      alert('Could not copy link.');
  });
}

// Main function to load and display all music
async function loadAllMusic() {
  const container = document.querySelector(".music-list .items");
  const carouselTrack = document.querySelector(".carousel-track");
  if (!container || !carouselTrack) return;

  container.innerHTML = '<p>Loading music...</p>';
  carouselTrack.innerHTML = '';

  const musicQuery = query(collection(db, 'music'), orderBy('timestamp', 'desc'));
  const snapshot = await getDocs(musicQuery);

  if (snapshot.empty) {
    container.innerHTML = "<p>No music has been uploaded yet.</p>";
    return;
  }
  
  allMusicData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  currentlyDisplayedMusicIds = allMusicData.map(song => song.id);

  container.innerHTML = '';
  const localLikedSongs = getArrayFromLocalStorage('likedSongs');

  allMusicData.forEach((song) => {
    const { id, title, artist, posterUrl, views = [], downloads = [], likes = [] } = song;
    const isLiked = localLikedSongs.includes(id);

    // Create card for main grid
    const card = document.createElement("div");
    card.className = "music-card";
    card.innerHTML = `
      <div class="poster-container">
        <img class="poster" src="${posterUrl}" alt="${title}" loading="lazy">
        <div class="poster-overlay">
            <i class='bx bx-play-circle'></i>
        </div>
      </div>
      <div class="details">
        <h3>${title}</h3>
        <p>${artist}</p>
      </div>
      <div class="actions">
        <button class="like-btn ${isLiked ? 'liked' : ''}" title="Like">
            <i class='bx ${isLiked ? 'bxs-heart' : 'bx-heart'}'></i> <span class="like-count">${formatCount(likes.length)}</span>
        </button>
        <a href="music-details.html?id=${id}" title="Details">
            <i class='bx bx-show'></i> <span>${formatCount(views.length)}</span>
        </a>
        <button class="download-btn" title="Download">
            <i class='bx bxs-download'></i> <span class="download-count">${formatCount(downloads.length)}</span>
        </button>
        <button class="copy-link-btn" title="Copy Link">
            <i class='bx bx-link'></i>
        </button>
      </div>
    `;
    
    // Attach event listeners
    card.querySelector('.poster-container').addEventListener('click', () => handlePlayRedirect(id));
    card.querySelector('.like-btn').addEventListener('click', () => toggleLike(id, card));
    card.querySelector('.download-btn').addEventListener('click', () => handleDownload(song, id, card));
    card.querySelector('.copy-link-btn').addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent card click event
        handleCopyLink(id, card);
    });

    container.appendChild(card);
  });
  
  // Create cards for Top Hits carousel (e.g., top 10 most liked)
  const topHits = [...allMusicData].sort((a, b) => (b.likes?.length || 0) - (a.likes?.length || 0)).slice(0, 10);
  topHits.forEach(song => {
      const slide = document.createElement('a');
      slide.href = `player.html?id=${song.id}`;
      slide.className = 'carousel-slide';
      slide.innerHTML = `
        <img src="${song.posterUrl}" alt="${song.title}">
        <div class="slide-info">
            <h4>${song.title}</h4>
            <p>${song.artist}</p>
        </div>
      `;
      slide.addEventListener('click', (e) => {
        e.preventDefault();
        handlePlayRedirect(song.id);
      });
      carouselTrack.appendChild(slide);
  });

  initializeCarousel();
}

function initializeCarousel() {
    const track = document.querySelector('.carousel-track');
    const prevBtn = document.querySelector('.carousel-btn.prev');
    const nextBtn = document.querySelector('.carousel-btn.next');
    if (!track || !prevBtn || !nextBtn) return;
    
    let currentIndex = 0;
    
    function updateCarousel() {
        const slideWidth = track.querySelector('.carousel-slide').offsetWidth;
        const gap = parseInt(window.getComputedStyle(track).gap);
        const totalSlideWidth = slideWidth + gap;
        track.style.transform = `translateX(-${currentIndex * totalSlideWidth}px)`;
    }

    nextBtn.addEventListener('click', () => {
        const slides = track.querySelectorAll('.carousel-slide');
        const itemsToShow = Math.floor(track.parentElement.offsetWidth / (slides[0].offsetWidth + 20));
        if (currentIndex < slides.length - itemsToShow) {
            currentIndex++;
            updateCarousel();
        }
    });

    prevBtn.addEventListener('click', () => {
        if (currentIndex > 0) {
            currentIndex--;
            updateCarousel();
        }
    });

    window.addEventListener('resize', () => {
        currentIndex = 0; // Reset on resize
        updateCarousel();
    });
}
