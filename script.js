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
  limit
} from 'https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js';
import {
  getAuth,
  onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js';

const firebaseConfig = {
  apiKey: "AIzaSyA6S3m7vXt78iaS3r6Z0XAVHcVCm9mroC0",
  authDomain: "titchuke-7fecd.firebaseapp.com",
  projectId: "titchuke-7fecd",
  storageBucket: "titchuke-7fecd.firebasestorage.app",
  messagingSenderId: "538951879592",
  appId: "1:538951879592:web:3047441e4e4b54e2922b9d",
  measurementId: "G-D46Q0962RQ"
};

// ✅ Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

let currentVisitorId = null;
let allMusicData = [];
let currentlyDisplayedMusicIds = [];

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
    const downloadedSongs = JSON.parse(localStorage.getItem('downloadedSongs') || '{}');
    if (!downloadedSongs[docId]?.includes(currentVisitorId)) {
        const musicDocRef = doc(db, 'music', docId);
        await updateDoc(musicDocRef, { downloads: arrayUnion(currentVisitorId) });

        if(!downloadedSongs[docId]) downloadedSongs[docId] = [];
        downloadedSongs[docId].push(currentVisitorId);
        localStorage.setItem('downloadedSongs', JSON.stringify(downloadedSongs));
        
        if (card) {
          const countEl = card.querySelector('.download-count');
          const currentCount = (song.downloads?.length || 0) + 1;
          countEl.textContent = formatCount(currentCount);
        }
    }
    
    // Open the download page in a new tab
    const downloadUrl = `download.html?title=${encodeURIComponent(song.title)}&artist=${encodeURIComponent(song.artist)}&poster=${encodeURIComponent(song.posterUrl)}&audio=${encodeURIComponent(song.audioUrl)}`;
    window.open(downloadUrl, '_blank');
}

async function handleLike(docId, card, currentLikes) {
    const likedSongs = JSON.parse(localStorage.getItem('likedSongs') || '{}');
    const isLiked = likedSongs[docId]?.includes(currentVisitorId);
    
    const likeBtn = card.querySelector('.like-btn');
    const likeCountEl = card.querySelector('.like-count');
    const musicDocRef = doc(db, 'music', docId);

    likeBtn.disabled = true;

    try {
        if (isLiked) {
            await updateDoc(musicDocRef, { likes: arrayRemove(currentVisitorId) });
            likedSongs[docId] = likedSongs[docId].filter(id => id !== currentVisitorId);
            localStorage.setItem('likedSongs', JSON.stringify(likedSongs));
            likeCountEl.textContent = formatCount(currentLikes - 1);
            likeBtn.classList.remove('liked');
        } else {
            await updateDoc(musicDocRef, { likes: arrayUnion(currentVisitorId) });
            if (!likedSongs[docId]) likedSongs[docId] = [];
            likedSongs[docId].push(currentVisitorId);
            localStorage.setItem('likedSongs', JSON.stringify(likedSongs));
            likeCountEl.textContent = formatCount(currentLikes + 1);
            likeBtn.classList.add('liked');
        }
    } catch (error) {
        console.error("Error updating like:", error);
        alert("Could not update like status.");
    } finally {
        likeBtn.disabled = false;
    }
}

function createMusicCard(song, docId) {
    const { title, artist, posterUrl, likes = [], views = [], downloads = [] } = song;
    
    const card = document.createElement('div');
    card.className = 'music-card';

    const likedSongs = JSON.parse(localStorage.getItem('likedSongs') || '{}');
    const isLiked = likedSongs[docId]?.includes(currentVisitorId);

    card.innerHTML = `
      <div class="poster-container" title="Play ${title}">
        <img src="${posterUrl}" alt="${title}" class="poster" loading="lazy">
        <div class="poster-overlay">
            <i class='bx bx-play-circle'></i>
        </div>
      </div>
      <div class="details">
        <h3>${title}</h3>
        <p>By ${artist}</p>
      </div>
      <div class="actions">
        <button class="like-btn${isLiked ? ' liked' : ''}" aria-label="Like song"><i class='bx bxs-heart'></i> <span class="like-count">${formatCount(likes.length)}</span></button>
        <button class="view-btn" aria-label="Total views" disabled><i class='bx bxs-show'></i> <span>${formatCount(views.length)}</span></button>
        <a href="#" class="download-btn" aria-label="Download song"><i class='bx bxs-download'></i> <span class="download-count">${formatCount(downloads.length)}</span></a>
        <button class="copy-link-btn" aria-label="Copy song link"><i class="fas fa-link"></i></button>
      </div>
    `;
    
    card.addEventListener('click', (e) => {
        // Allow actions to be clickable without triggering navigation
        if (e.target.closest('.actions')) return;
        handlePlayRedirect(docId);
    });
    
    card.querySelector('.like-btn').addEventListener('click', () => handleLike(docId, card, likes.length));
    card.querySelector('.download-btn').addEventListener('click', (e) => {
        e.preventDefault();
        handleDownload(song, docId, card);
    });
    card.querySelector('.copy-link-btn').addEventListener('click', () => {
        const linkToCopy = `${window.location.origin}/music-details.html?id=${docId}`;
        navigator.clipboard.writeText(linkToCopy).then(() => {
            alert('Song link copied to clipboard!');
        }).catch(err => {
            console.error('Failed to copy link: ', err);
        });
    });

    return card;
}

function renderMusic(musicArray) {
    const container = document.querySelector(".music-list .items");
    if (!container) return;
    container.innerHTML = '';

    currentlyDisplayedMusicIds = musicArray.map(item => item.id);

    if (musicArray.length === 0) {
        container.innerHTML = '<p style="color: var(--text-secondary); grid-column: 1 / -1;">No music found.</p>';
        return;
    }
    musicArray.forEach(musicItem => {
        container.appendChild(createMusicCard(musicItem.data, musicItem.id));
    });
}

function renderTopHitsCarousel(musicArray) {
    const topHits = [...musicArray]
      .sort((a, b) => (b.data.likes?.length || 0) - (a.data.likes?.length || 0))
      .slice(0, 10);
    
    const track = document.querySelector('.top-hits-carousel .carousel-track');
    if (!track) return;
    track.innerHTML = '';

    const topHitsIds = topHits.map(h => h.id);

    topHits.forEach(item => {
        const slide = document.createElement('a');
        slide.href = `player.html?id=${item.id}`;
        slide.className = 'carousel-slide';
        slide.innerHTML = `
            <img src="${item.data.posterUrl}" alt="${item.data.title}" loading="lazy">
            <div class="slide-info">
                <h4>${item.data.title}</h4>
                <p>${item.data.artist}</p>
            </div>
        `;
        slide.addEventListener('click', (e) => {
            e.preventDefault();
            sessionStorage.setItem('currentPlaylist', JSON.stringify(topHitsIds));
            window.location.href = slide.href;
        });
        track.appendChild(slide);
    });
    
    setupCarousel('.top-hits-carousel');
}

async function loadAllMusic() {
  const container = document.querySelector(".music-list .items");
  if (!container) return;
  container.innerHTML = '<p style="color: var(--text-secondary);">Loading music...</p>';

  try {
    const musicQuery = query(collection(db, 'music'), orderBy('timestamp', 'desc'));
    const snapshot = await getDocs(musicQuery);
    
    allMusicData = snapshot.docs.map(doc => ({ id: doc.id, data: doc.data() }));
    renderMusic(allMusicData);
    renderTopHitsCarousel(allMusicData);
    
  } catch (error)
{
    console.error("Error loading music:", error);
    container.innerHTML = '<p style="color: var(--danger-color);">Could not load music. Please try again later.</p>';
  }
}

function setupCarousel(selector) {
    const carousel = document.querySelector(selector);
    if (!carousel) return;
    const track = carousel.querySelector('.carousel-track');
    const prevBtn = carousel.querySelector('.carousel-btn.prev');
    const nextBtn = carousel.querySelector('.carousel-btn.next');
    if (!track || !prevBtn || !nextBtn || track.children.length === 0) return;

    let currentIndex = 0;
    const slides = Array.from(track.children);
    const slideWidth = slides[0].getBoundingClientRect().width;
    const gap = 20;

    function moveToSlide(index) {
        if (index < 0) index = slides.length - 1;
        if (index >= slides.length) index = 0;
        track.style.transform = `translateX(-${index * (slideWidth + gap)}px)`;
        currentIndex = index;
    }

    nextBtn.addEventListener('click', () => moveToSlide(currentIndex + 1));
    prevBtn.addEventListener('click', () => moveToSlide(currentIndex - 1));
    
    if (selector === '.top-hits-carousel') {
        setInterval(() => {
          moveToSlide(currentIndex + 1);
        }, 5000);
    }
}

function setupSearch() {
  const input = document.querySelector(".search input");
  if (!input) return;

  input.addEventListener("input", (e) => {
    const keyword = e.target.value.toLowerCase().trim();
    const container = document.querySelector(".music-list .items");
    const musicListHeader = document.querySelector('.music-list .header h3');

    container.innerHTML = ''; 

    if (!keyword) {
      musicListHeader.textContent = 'All Music';
      renderMusic(allMusicData);
      return;
    }

    const filtered = allMusicData.filter(item => {
      const { title, artist, genres } = item.data;
      const genreString = genres ? genres.join(' ').toLowerCase() : '';
      return title.toLowerCase().includes(keyword)
        || artist.toLowerCase().includes(keyword)
        || genreString.includes(keyword);
    });

    musicListHeader.textContent = `Results for "${keyword}"`;

    if (filtered.length > 0) {
      renderMusic(filtered);
    } else {
      const fallbackContainer = document.createElement('div');
      fallbackContainer.className = 'youtube-fallback-container';
      fallbackContainer.innerHTML = `
          <p class="youtube-fallback-message">
              <i class='bx bxl-youtube'></i>
              No matches found in our library.
          </p>
          <a href="https://www.youtube.com/results?search_query=${encodeURIComponent(keyword)}" target="_blank" class="youtube-more-results-link">
              Search for "${keyword}" on YouTube <i class='bx bx-link-external'></i>
          </a>
      `;
      container.appendChild(fallbackContainer);
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  setupSearch();
});
