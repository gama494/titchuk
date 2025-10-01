// ✅ Firebase imports
import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js';
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  query,
  where,
  serverTimestamp,
  doc,
  updateDoc,
  getDoc,
  deleteDoc
} from 'https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js';
import {
  getAuth,
  onAuthStateChanged,
  signOut
} from 'https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js';

// ✅ Firebase Config
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

// ✅ Auth state check
let currentUserId = null;
let totalBalance = 0;
let userMusicData = []; // Cache for song data to use in edit modal

const PREDEFINED_GENRES = ['Gospel', 'Hip Hop', 'Afrobeat', 'R&B', 'Pop', 'Reggae', 'Traditional', 'Amapiano', 'Dancehall', 'Trap'];

onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUserId = user.uid;
    populateGenres();
    await loadUserAlbums();
    await loadMusic();
    setupAlbumFormListeners();
    setupModalListeners();
    setupMusicEventListeners(); // Setup listeners for edit/delete
  } else {
    window.location.href = '../signin.html';
  }
});

function populateGenres() {
    const container = document.getElementById('genre-container');
    container.innerHTML = PREDEFINED_GENRES.map(genre => `
        <div>
            <input type="checkbox" name="genre" value="${genre}" id="genre-${genre.replace(/\s+/g, '')}"> 
            <label for="genre-${genre.replace(/\s+/g, '')}">${genre}</label>
        </div>
    `).join('');
}

function setupAlbumFormListeners() {
    const toggle = document.getElementById('add-to-album-toggle');
    const optionsDiv = document.getElementById('album-options');
    
    toggle.addEventListener('change', () => {
        optionsDiv.style.display = toggle.checked ? 'block' : 'none';
    });

    // New Tab functionality
    const tabContainer = document.querySelector('.album-choice-tabs');
    const contentDivs = document.querySelectorAll('.album-tab-content');
    if (tabContainer) {
        tabContainer.addEventListener('click', (e) => {
            if (e.target.matches('.album-tab-btn')) {
                // Update buttons
                tabContainer.querySelector('.active').classList.remove('active');
                e.target.classList.add('active');
                
                // Update content
                contentDivs.forEach(div => div.classList.remove('active'));
                const contentId = e.target.dataset.tab;
                document.getElementById(contentId).classList.add('active');

                // Clear selection when switching tabs
                if (contentId === 'new-album-section') {
                    document.getElementById('selected-album-id').value = '';
                    document.querySelectorAll('.existing-album-card.selected').forEach(c => c.classList.remove('selected'));
                } else {
                     document.getElementById('album-title').value = '';
                }
            }
        });
    }
}

async function loadUserAlbums() {
    const grid = document.getElementById('existing-albums-list');
    grid.innerHTML = '<p>Loading albums...</p>';
    const q = query(collection(db, 'albums'), where('userId', '==', currentUserId));
    const snapshot = await getDocs(q);

    const existingAlbumTabBtn = document.querySelector('.album-tab-btn[data-tab="existing-album-section"]');

    if (snapshot.empty) {
        grid.innerHTML = '<p>No albums created yet. Use the "Create New" tab.</p>';
        if (existingAlbumTabBtn) existingAlbumTabBtn.disabled = true;
        return;
    }

    if (existingAlbumTabBtn) existingAlbumTabBtn.disabled = false;
    grid.innerHTML = '';
    snapshot.forEach(doc => {
        const album = {id: doc.id, ...doc.data()};
        const card = document.createElement('div');
        card.className = 'existing-album-card';
        card.dataset.id = album.id;
        card.innerHTML = `
            <img src="${album.posterUrl}" alt="${album.title}" loading="lazy">
            <div class="album-card-title">${album.title}</div>
            <button class="edit-album-btn" title="Edit Album"><i class='bx bxs-edit'></i></button>
        `;
        
        card.addEventListener('click', (e) => {
            if (e.target.closest('.edit-album-btn')) return;
            grid.querySelectorAll('.existing-album-card.selected').forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
            document.getElementById('selected-album-id').value = album.id;
            document.getElementById('album-title').value = '';
        });

        card.querySelector('.edit-album-btn').addEventListener('click', () => {
             openEditModal(album);
        });

        grid.appendChild(card);
    });
}

// ---- ALBUM MODAL FUNCTIONS ----
function setupModalListeners() {
    const modal = document.getElementById('edit-album-modal');
    const closeBtn = document.getElementById('close-modal-btn');
    const form = document.getElementById('edit-album-form');
    
    closeBtn.addEventListener('click', closeEditModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeEditModal();
        }
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const albumId = document.getElementById('edit-album-id').value;
        const newTitle = document.getElementById('album-title-edit').value;
        const newArtist = document.getElementById('album-artist-edit').value;
        const posterFile = document.getElementById('album-poster-edit').files[0];
        
        const saveBtn = document.getElementById('save-album-changes-btn');
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';

        try {
            const updateData = {
                title: newTitle,
                artist: newArtist,
            };

            if (posterFile) {
                const newPosterUrl = await uploadToCloudinary(posterFile, 'album-posters');
                updateData.posterUrl = newPosterUrl;
            }

            const albumRef = doc(db, 'albums', albumId);
            await updateDoc(albumRef, updateData);
            
            closeEditModal();
            await loadUserAlbums();
            await loadMusic();

        } catch (error) {
            alert('Error updating album: ' + error.message);
        } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Save Changes';
        }
    });
}

function openEditModal(album) {
    document.getElementById('edit-album-id').value = album.id;
    document.getElementById('album-title-edit').value = album.title;
    document.getElementById('album-artist-edit').value = album.artist;
    document.getElementById('album-poster-edit').value = '';
    document.getElementById('edit-album-modal').style.display = 'flex';
}

function closeEditModal() {
    document.getElementById('edit-album-modal').style.display = 'none';
}

// ✅ Logout
document.getElementById('logout-button').addEventListener('click', async () => {
  await signOut(auth);
  window.location.href = '../signin.html';
});

// ✅ Cloudinary Upload with real filename
async function uploadToCloudinary(file, folder) {
  const formData = new FormData();
  const originalName = file.name.split('.').slice(0, -1).join('.'); // without extension

  formData.append('file', file);
  formData.append('upload_preset', 'music upload');
  formData.append('public_id', originalName); // ✅ use original file name
  if (folder) formData.append('folder', folder);

  const response = await fetch('https://api.cloudinary.com/v1_1/dcmudqqsp/upload', {
    method: 'POST',
    body: formData,
  });

  const data = await response.json();
  if (!data.secure_url) throw new Error(data.error?.message || 'Upload failed');
  return data.secure_url;
}

// ✅ Upload Music Form
document.getElementById('music-upload-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const title = document.getElementById('title').value;
  const artist = document.getElementById('artist').value;
  const posterFile = document.getElementById('poster').files[0];
  const audioFile = document.getElementById('audio').files[0];
  
  const selectedGenres = Array.from(document.querySelectorAll('input[name="genre"]:checked')).map(cb => cb.value);

  if (!posterFile || !audioFile) {
    alert('Please upload both poster and audio file.');
    return;
  }
  if (selectedGenres.length === 0) {
      alert('Please select at least one genre.');
      return;
  }

  try {
    const posterUrl = await uploadToCloudinary(posterFile, 'music-posters');
    const audioUrl = await uploadToCloudinary(audioFile, 'music-audios');

    const musicData = {
      title,
      artist,
      genres: selectedGenres,
      posterUrl,
      audioUrl,
      userId: currentUserId,
      timestamp: serverTimestamp()
    };
    
    // Handle album logic
    const isAlbum = document.getElementById('add-to-album-toggle').checked;
    if(isAlbum) {
        const newAlbumTitle = document.getElementById('album-title').value.trim();
        const selectedAlbumId = document.getElementById('selected-album-id').value;

        if (newAlbumTitle) { // Create new album
            const albumDocRef = await addDoc(collection(db, 'albums'), {
                title: newAlbumTitle,
                artist: artist,
                posterUrl: posterUrl,
                userId: currentUserId,
                timestamp: serverTimestamp()
            });
            musicData.albumId = albumDocRef.id;
            musicData.albumTitle = newAlbumTitle;
        } else if (selectedAlbumId) { // Add to existing album
            musicData.albumId = selectedAlbumId;
            const albumRef = doc(db, 'albums', selectedAlbumId);
            const albumSnap = await getDoc(albumRef);
            if (albumSnap.exists()) {
                musicData.albumTitle = albumSnap.data().title;
            }
        } else {
             alert('Please either create a new album or select an existing one.');
             return;
        }
    }

    await addDoc(collection(db, 'music'), musicData);
    
    const toast = document.getElementById('success-toast');
    toast.style.display = 'block';
    setTimeout(() => {
      toast.style.display = 'none';
    }, 3000);

    e.target.reset();
    document.getElementById('album-options').style.display = 'none';
    await loadUserAlbums();
    await loadMusic();

  } catch (error) {
    alert('Error: ' + error.message);
    console.error(error);
  }
});

// ✅ Load music uploaded by this user and calculate balance
async function loadMusic() {
  const container = document.getElementById('music-list-container');
  container.innerHTML = '';

  totalBalance = 0;
  userMusicData = []; // Clear and repopulate the cache

  const q = query(collection(db, 'music'), where('userId', '==', currentUserId));
  const snapshot = await getDocs(q);

  if (snapshot.empty) {
    container.innerHTML = '<p>You have not uploaded any songs yet.</p>';
  }

  snapshot.forEach((doc) => {
    const song = doc.data();
    userMusicData.push({ id: doc.id, ...song }); // Add song to cache
    
    const { title, artist, posterUrl, audioUrl, albumTitle, likes = [], downloads = [], views = [] } = song;

    const likesMK = likes.length * 5;
    const downloadsMK = downloads.length * 7;
    const viewsMK = Math.floor(views.length / 3) * 0;
    const earnings = likesMK + downloadsMK + viewsMK;

    totalBalance += earnings;

    const card = document.createElement('div');
    card.className = 'dashboard-music-card';
    card.innerHTML = `
      <div class="dashboard-poster-container">
          <img src="${posterUrl}" alt="${title}" class="card-poster">
          <div class="dashboard-card-overlay-actions">
              <button class="edit-music-btn" data-id="${doc.id}" title="Edit Song"><i class='bx bxs-edit'></i></button>
              <button class="delete-music-btn" data-id="${doc.id}" title="Delete Song"><i class='bx bxs-trash'></i></button>
          </div>
      </div>
      <div class="card-content">
          <h4 class="card-title">${title}</h4>
          <p class="card-artist">${artist}</p>
          ${albumTitle ? `<p class="card-album"><i class='bx bxs-album'></i> ${albumTitle}</p>` : ''}
          <div class="card-earnings">
              MK ${earnings.toLocaleString()}
          </div>
      </div>
      <div class="card-actions">
          <a href="${audioUrl}" download="${artist} - ${title}.mp3" title="Download"><i class='bx bxs-download'></i></a>
          <a href="music-details.html?id=${doc.id}" target="_blank" title="View Details"><i class='bx bx-show'></i></a>
          <button class="copy-link-btn" data-id="${doc.id}" title="Copy Link"><i class='bx bx-link'></i></button>
      </div>
    `;
    container.appendChild(card);
  });

  const balanceEl = document.getElementById('balance-amount');
  const withdrawBtn = document.getElementById('header-withdraw-btn');

  balanceEl.textContent = `MK ${totalBalance.toLocaleString()}`;

  if (totalBalance >= 50000) {
    withdrawBtn.disabled = false;
  } else {
    withdrawBtn.disabled = true;
  }
}

// ---- MUSIC MODAL AND ACTIONS ----
function setupMusicEventListeners() {
    const container = document.getElementById('music-list-container');
    const modal = document.getElementById('edit-music-modal');
    const form = document.getElementById('edit-music-form');
    const closeBtn = document.getElementById('close-edit-modal-btn');

    // Event delegation for edit, delete, and copy buttons
    container.addEventListener('click', async (e) => {
        const editBtn = e.target.closest('.edit-music-btn');
        const deleteBtn = e.target.closest('.delete-music-btn');
        const copyBtn = e.target.closest('.copy-link-btn');

        if (editBtn) {
            const songId = editBtn.dataset.id;
            openEditMusicModal(songId);
        }

        if (deleteBtn) {
            const songId = deleteBtn.dataset.id;
            if (confirm('Are you sure you want to permanently delete this song? This action cannot be undone.')) {
                try {
                    await deleteDoc(doc(db, 'music', songId));
                    alert('Song deleted successfully.');
                    loadMusic(); // Refresh the list
                } catch (error) {
                    console.error("Error deleting song:", error);
                    alert('Failed to delete song. Please try again.');
                }
            }
        }

        if (copyBtn) {
            const songId = copyBtn.dataset.id;
            const detailPageUrl = `${window.location.origin}/music-details.html?id=${songId}`;
            navigator.clipboard.writeText(detailPageUrl);
            alert('Link to details page copied!');
        }
    });

    // Modal listeners
    closeBtn.addEventListener('click', closeEditMusicModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeEditMusicModal();
        }
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const songId = document.getElementById('edit-song-id').value;
        const newTitle = document.getElementById('edit-title').value;
        const newArtist = document.getElementById('edit-artist').value;
        const posterFile = document.getElementById('edit-poster').files[0];

        const saveBtn = document.getElementById('save-music-changes-btn');
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';

        try {
            const updateData = {
                title: newTitle,
                artist: newArtist,
            };

            if (posterFile) {
                const newPosterUrl = await uploadToCloudinary(posterFile, 'music-posters');
                updateData.posterUrl = newPosterUrl;
            }

            const songRef = doc(db, 'music', songId);
            await updateDoc(songRef, updateData);
            
            alert('Song updated successfully!');
            closeEditMusicModal();
            await loadMusic(); // Refresh list

        } catch (error) {
            alert('Error updating song: ' + error.message);
        } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Save Changes';
        }
    });
}

function openEditMusicModal(songId) {
    const song = userMusicData.find(s => s.id === songId);
    if (!song) {
        alert('Could not find song data. Please refresh.');
        return;
    }

    document.getElementById('edit-song-id').value = song.id;
    document.getElementById('edit-title').value = song.title;
    document.getElementById('edit-artist').value = song.artist;
    document.getElementById('edit-poster').value = ''; // Clear file input
    document.getElementById('edit-music-modal').style.display = 'flex';
}

function closeEditMusicModal() {
    document.getElementById('edit-music-modal').style.display = 'none';
}


// ✅ Withdraw button event
document.getElementById('header-withdraw-btn').addEventListener('click', () => {
  if (totalBalance < 50000) {
    const warningCard = document.getElementById('withdraw-warning');
    warningCard.style.display = 'block';
    setTimeout(() => {
      warningCard.style.display = 'none';
    }, 4000);
  } else {
    alert('Withdraw request sent. Please wait for admin approval.');
  }
});