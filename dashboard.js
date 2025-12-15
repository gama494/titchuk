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
  setDoc,
  getDoc,
  updateDoc,
  deleteDoc
} from 'https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js';
import {
  getAuth,
  onAuthStateChanged,
  signOut
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
// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// PayChangu Config - REPLACE WITH YOUR VALUES
const PAYCHANGU_SECRET_KEY = 'SEC-O4cX'; // From PayChangu dashboard (e.g., SEC-O4cXo36nSiGf7zihVYvFsHOw6cuFapFp)
const PAYCHANGU_MOBILE_UUID = '20'; // Fallback Airtel UUID; update if TNM
const YOUR_MOBILE_NUMBER = '0981467345'; // Your 9-digit mobile linked to PayChangu (e.g., 0991234567)
const FEE_PERCENTAGE = 0.03; // 3% fee estimate for mobile money

// Global variables
let currentUserId = null;
let totalBalance = 0;
let userMusicData = [];
const PREDEFINED_GENRES = ['Gospel', 'Hip Hop', 'Afrobeat', 'R&B', 'Pop', 'Reggae', 'Traditional', 'Amapiano', 'Dancehall', 'Trap'];

// Auth state check
onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUserId = user.uid;
    populateGenres();
    await loadUserAlbums();
    await loadMusic();
    await loadWithdrawals();
    setupAlbumFormListeners();
    setupModalListeners();
    setupMusicEventListeners();
    setupWithdrawModal();
  } else {
    window.location.href = '../signin.html';
  }
});

// Populate Genres
function populateGenres() {
  const container = document.getElementById('genre-container');
  if (container) {
    container.innerHTML = PREDEFINED_GENRES.map(genre => `
      <div>
        <input type="checkbox" name="genre" value="${genre}" id="genre-${genre.replace(/\s+/g, '')}">
        <label for="genre-${genre.replace(/\s+/g, '')}">${genre}</label>
      </div>
    `).join('');
  }
}

// Album Form Listeners
function setupAlbumFormListeners() {
  const toggle = document.getElementById('add-to-album-toggle');
  const optionsDiv = document.getElementById('album-options');
  
  if (toggle && optionsDiv) {
    toggle.addEventListener('change', () => {
      optionsDiv.style.display = toggle.checked ? 'block' : 'none';
    });
  }

  const tabContainer = document.querySelector('.album-choice-tabs');
  const contentDivs = document.querySelectorAll('.album-tab-content');
  if (tabContainer) {
    tabContainer.addEventListener('click', (e) => {
      if (e.target.matches('.album-tab-btn')) {
        const activeBtn = tabContainer.querySelector('.active');
        if (activeBtn) activeBtn.classList.remove('active');
        e.target.classList.add('active');
        
        contentDivs.forEach(div => div.classList.remove('active'));
        const contentId = e.target.dataset.tab;
        const contentEl = document.getElementById(contentId);
        if (contentEl) contentEl.classList.add('active');

        if (contentId === 'new-album-section') {
          const selectedIdEl = document.getElementById('selected-album-id');
          if (selectedIdEl) selectedIdEl.value = '';
          document.querySelectorAll('.existing-album-card.selected').forEach(c => c.classList.remove('selected'));
        } else {
          const albumTitleEl = document.getElementById('album-title');
          if (albumTitleEl) albumTitleEl.value = '';
        }
      }
    });
  }
}

// Load User Albums
async function loadUserAlbums() {
  const grid = document.getElementById('existing-albums-list');
  if (!grid) return;
  grid.innerHTML = '<p>Loading albums...</p>';
  
  try {
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
      const album = { id: doc.id, ...doc.data() };
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
        const selectedIdEl = document.getElementById('selected-album-id');
        if (selectedIdEl) selectedIdEl.value = album.id;
        const albumTitleEl = document.getElementById('album-title');
        if (albumTitleEl) albumTitleEl.value = '';
      });

      const editBtn = card.querySelector('.edit-album-btn');
      if (editBtn) {
        editBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          openEditModal(album);
        });
      }

      grid.appendChild(card);
    });
  } catch (error) {
    console.error('Error loading albums:', error);
    grid.innerHTML = '<p>Error loading albums. Try again.</p>';
  }
}

// Album Modal Functions
function setupModalListeners() {
  const modal = document.getElementById('edit-album-modal');
  const closeBtn = document.getElementById('close-modal-btn');
  const form = document.getElementById('edit-album-form');
  
  if (closeBtn) closeBtn.addEventListener('click', closeEditModal);
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeEditModal();
    });
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const albumIdEl = document.getElementById('edit-album-id');
      const newTitleEl = document.getElementById('album-title-edit');
      const newArtistEl = document.getElementById('album-artist-edit');
      const posterFileInput = document.getElementById('album-poster-edit');
      
      const albumId = albumIdEl?.value;
      const newTitle = newTitleEl?.value;
      const newArtist = newArtistEl?.value;
      const posterFile = posterFileInput?.files[0];
      
      const saveBtn = document.getElementById('save-album-changes-btn');
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';
      }

      try {
        const updateData = { title: newTitle, artist: newArtist };
        if (posterFile) {
          updateData.posterUrl = await uploadToCloudinary(posterFile, 'album-posters');
        }

        const albumRef = doc(db, 'albums', albumId);
        await updateDoc(albumRef, updateData);
        
        closeEditModal();
        await loadUserAlbums();
        await loadMusic();
        alert('Album updated successfully!');
      } catch (error) {
        alert('Error updating album: ' + error.message);
      } finally {
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.textContent = 'Save Changes';
        }
      }
    });
  }
}

function openEditModal(album) {
  const idEl = document.getElementById('edit-album-id');
  const titleEl = document.getElementById('album-title-edit');
  const artistEl = document.getElementById('album-artist-edit');
  const posterEl = document.getElementById('album-poster-edit');
  const modal = document.getElementById('edit-album-modal');
  
  if (idEl) idEl.value = album.id;
  if (titleEl) titleEl.value = album.title;
  if (artistEl) artistEl.value = album.artist;
  if (posterEl) posterEl.value = '';
  if (modal) modal.style.display = 'flex';
}

function closeEditModal() {
  const modal = document.getElementById('edit-album-modal');
  if (modal) modal.style.display = 'none';
}

// Logout
const logoutBtn = document.getElementById('logout-button');
if (logoutBtn) {
  logoutBtn.addEventListener('click', async () => {
    await signOut(auth);
    window.location.href = '../signin.html';
  });
}

// Cloudinary Upload
async function uploadToCloudinary(file, folder) {
  const formData = new FormData();
  const originalName = file.name.split('.').slice(0, -1).join('.');
  
  formData.append('file', file);
  formData.append('upload_preset', 'voice upload');
  formData.append('public_id', originalName);
  if (folder) formData.append('folder', folder);

  const response = await fetch('https://api.cloudinary.com/v1_1/dwd1r0es0/upload', {
    method: 'POST',
    body: formData,
  });

  const data = await response.json();
  if (!data.secure_url) throw new Error(data.error?.message || 'Upload failed');
  return data.secure_url;
}

// Upload Music Form
const uploadForm = document.getElementById('music-upload-form');
if (uploadForm) {
  uploadForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const titleEl = document.getElementById('title');
    const artistEl = document.getElementById('artist');
    const posterInput = document.getElementById('poster');
    const audioInput = document.getElementById('audio');
    
    const title = titleEl?.value;
    const artist = artistEl?.value;
    const posterFile = posterInput?.files[0];
    const audioFile = audioInput?.files[0];
    
    const selectedGenres = Array.from(document.querySelectorAll('input[name="genre"]:checked')).map(cb => cb.value);

    if (!title || !artist || !posterFile || !audioFile || selectedGenres.length === 0) {
      alert('Please fill all required fields and select at least one genre.');
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
        timestamp: serverTimestamp(),
        likes: [],
        downloads: [],
        views: []
      };
      
      const albumToggle = document.getElementById('add-to-album-toggle');
      const isAlbum = albumToggle?.checked;
      
      if (isAlbum) {
        const albumTitleEl = document.getElementById('album-title');
        const selectedAlbumIdEl = document.getElementById('selected-album-id');
        const newAlbumTitle = albumTitleEl?.value.trim();
        const selectedAlbumId = selectedAlbumIdEl?.value;

        if (newAlbumTitle) {
          const albumDocRef = await addDoc(collection(db, 'albums'), {
            title: newAlbumTitle,
            artist: artist,
            posterUrl: posterUrl,
            userId: currentUserId,
            timestamp: serverTimestamp()
          });
          musicData.albumId = albumDocRef.id;
          musicData.albumTitle = newAlbumTitle;
        } else if (selectedAlbumId) {
          musicData.albumId = selectedAlbumId;
          const albumRef = doc(db, 'albums', selectedAlbumId);
          const albumSnap = await getDoc(albumRef);
          if (albumSnap.exists()) {
            musicData.albumTitle = albumSnap.data().title;
          }
        } else {
          alert('Please create or select an album.');
          return;
        }
      }

      await addDoc(collection(db, 'music'), musicData);
      
      const toast = document.getElementById('success-toast');
      if (toast) {
        toast.style.display = 'block';
        setTimeout(() => toast.style.display = 'none', 3000);
      }

      e.target.reset();
      const albumOptions = document.getElementById('album-options');
      if (albumOptions) albumOptions.style.display = 'none';
      await loadUserAlbums();
      await loadMusic();

    } catch (error) {
      alert('Upload error: ' + error.message);
      console.error(error);
    }
  });
}

// Load Music and Calculate Balance
async function loadMusic() {
  const container = document.getElementById('music-list-container');
  if (!container) return;
  
  container.innerHTML = '';
  totalBalance = 0;
  userMusicData = [];

  try {
    // Calculate earnings from music
    const musicQuery = query(collection(db, 'music'), where('userId', '==', currentUserId));
    const musicSnapshot = await getDocs(musicQuery);
    let totalEarnings = 0;

    if (musicSnapshot.empty) {
      container.innerHTML = '<p>You have not uploaded any songs yet.</p>';
    } else {
      musicSnapshot.forEach((doc) => {
        const song = doc.data();
        userMusicData.push({ id: doc.id, ...song });
        
        const { title, artist, posterUrl, audioUrl, albumTitle, likes = [], downloads = [], views = [] } = song;
        const likesMK = likes.length * 5;
        const downloadsMK = downloads.length * 7;
        const viewsMK = Math.floor(views.length / 3) * 0;
        const earnings = likesMK + downloadsMK + viewsMK;
        totalEarnings += earnings;

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
            <div class="card-earnings">MK ${earnings.toLocaleString()}</div>
          </div>
          <div class="card-actions">
            <a href="${audioUrl}" download="${artist} - ${title}.mp3" title="Download"><i class='bx bxs-download'></i></a>
            <a href="music-details.html?id=${doc.id}" target="_blank" title="View Details"><i class='bx bx-show'></i></a>
            <button class="copy-link-btn" data-id="${doc.id}" title="Copy Link"><i class='bx bx-link'></i></button>
          </div>
        `;
        container.appendChild(card);
      });
    }

    // Get balance from userBalances
    const balanceRef = doc(db, 'userBalances', currentUserId);
    const balanceSnap = await getDoc(balanceRef);
    let withdrawn = 0;
    if (balanceSnap.exists()) {
      withdrawn = balanceSnap.data().withdrawn || 0;
      totalEarnings = balanceSnap.data().earnings || totalEarnings;
    } else {
      // Initialize userBalances if it doesn't exist
      await setDoc(balanceRef, {
        userId: currentUserId,
        earnings: totalEarnings,
        withdrawn: 0,
        availableBalance: totalEarnings
      });
    }

    totalBalance = totalEarnings - withdrawn;

    const balanceEl = document.getElementById('balance-amount');
    if (balanceEl) balanceEl.textContent = `MK ${totalBalance.toLocaleString()}`;

    const withdrawBtn = document.getElementById('header-withdraw-btn');
    if (withdrawBtn) withdrawBtn.disabled = totalBalance <= 0;

  } catch (error) {
    console.error('Error loading music:', error);
    container.innerHTML = '<p>Error loading music. Try again.</p>';
  }
}

// Load Withdrawals
async function loadWithdrawals() {
  const container = document.getElementById('withdrawal-history-container');
  if (!container) return;

  container.innerHTML = '<p>Loading withdrawals...</p>';

  try {
    const q = query(collection(db, 'withdrawals'), where('userId', '==', currentUserId));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      container.innerHTML = '<p>No withdrawals yet.</p>';
      return;
    }

    container.innerHTML = `
      <table style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr style="border-bottom: 1px solid #ccc;">
            <th style="padding: 8px; text-align: left;">Amount</th>
            <th style="padding: 8px; text-align: left;">Method</th>
            <th style="padding: 8px; text-align: left;">Status</th>
            <th style="padding: 8px; text-align: left;">Reference</th>
            <th style="padding: 8px; text-align: left;">Date</th>
          </tr>
        </thead>
        <tbody>
          ${snapshot.docs.map(doc => {
            const data = doc.data();
            const date = data.timestamp ? new Date(data.timestamp.toDate()).toLocaleString() : 'N/A';
            return `
              <tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 8px;">MK ${Number(data.amount).toLocaleString()}</td>
                <td style="padding: 8px;">${data.method === 'paychangu_wallet' ? 'PayChangu Wallet' : 'Mobile Money'}</td>
                <td style="padding: 8px;">${data.status}</td>
                <td style="padding: 8px;">${data.reference}</td>
                <td style="padding: 8px;">${date}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;
  } catch (error) {
    console.error('Error loading withdrawals:', error);
    container.innerHTML = '<p>Error loading withdrawals. Try again.</p>';
  }
}

// Music Event Listeners
function setupMusicEventListeners() {
  const container = document.getElementById('music-list-container');
  const modal = document.getElementById('edit-music-modal');
  const form = document.getElementById('edit-music-form');
  const closeBtn = document.getElementById('close-edit-music-btn');

  if (container) {
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
        if (confirm('Delete this song permanently?')) {
          try {
            await deleteDoc(doc(db, 'music', songId));
            alert('Song deleted successfully.');
            await loadMusic();
          } catch (error) {
            alert('Failed to delete song: ' + error.message);
          }
        }
      }

      if (copyBtn) {
        const songId = copyBtn.dataset.id;
        const detailPageUrl = `${window.location.origin}/music-details.html?id=${songId}`;
        await navigator.clipboard.writeText(detailPageUrl);
        alert('Link copied!');
      }
    });
  }

  if (closeBtn) closeBtn.addEventListener('click', closeEditMusicModal);
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeEditMusicModal();
    });
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const songIdEl = document.getElementById('edit-song-id');
      const newTitleEl = document.getElementById('edit-title');
      const newArtistEl = document.getElementById('edit-artist');
      const posterInput = document.getElementById('edit-poster');
      
      const songId = songIdEl?.value;
      const newTitle = newTitleEl?.value;
      const newArtist = newArtistEl?.value;
      const posterFile = posterInput?.files[0];

      const saveBtn = document.getElementById('save-music-changes-btn');
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';
      }

      try {
        const updateData = { title: newTitle, artist: newArtist };
        if (posterFile) {
          updateData.posterUrl = await uploadToCloudinary(posterFile, 'music-posters');
        }

        const songRef = doc(db, 'music', songId);
        await updateDoc(songRef, updateData);
        
        alert('Song updated successfully!');
        closeEditMusicModal();
        await loadMusic();
      } catch (error) {
        alert('Error updating song: ' + error.message);
      } finally {
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.textContent = 'Save Changes';
        }
      }
    });
  }
}

function openEditMusicModal(songId) {
  const song = userMusicData.find(s => s.id === songId);
  if (!song) {
    alert('Song not found. Please refresh.');
    return;
  }

  const idEl = document.getElementById('edit-song-id');
  const titleEl = document.getElementById('edit-title');
  const artistEl = document.getElementById('edit-artist');
  const posterEl = document.getElementById('edit-poster');
  const modal = document.getElementById('edit-music-modal');
  
  if (idEl) idEl.value = song.id;
  if (titleEl) titleEl.value = song.title;
  if (artistEl) artistEl.value = song.artist;
  if (posterEl) posterEl.value = '';
  if (modal) modal.style.display = 'flex';
}

function closeEditMusicModal() {
  const modal = document.getElementById('edit-music-modal');
  if (modal) modal.style.display = 'none';
}

// Check PayChangu Balance
async function checkPayChanguBalance() {
  try {
    const response = await fetch('https://api.paychangu.com/balance', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${PAYCHANGU_SECRET_KEY}`,
        'Accept': 'application/json'
      }
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Failed to fetch balance');
    return data.data?.available_balance || 0; // In MWK
  } catch (error) {
    console.error('Balance Check Error:', error);
    return 0;
  }
}

// PayChangu Payout Function - Wallet Claim or External Payout
async function initiatePayChanguPayout(amount, details, method) {
  if (!currentUserId) throw new Error('User not authenticated. Please sign in again.');
  
  const chargeId = `PC-WD-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

  // Update userBalances
  const balanceRef = doc(db, 'userBalances', currentUserId);
  const balanceSnap = await getDoc(balanceRef);
  let currentWithdrawn = balanceSnap.exists() ? balanceSnap.data().withdrawn || 0 : 0;
  let currentEarnings = balanceSnap.exists() ? balanceSnap.data().earnings || 0 : totalBalance;

  try {
    await setDoc(balanceRef, {
      userId: currentUserId,
      earnings: currentEarnings,
      withdrawn: currentWithdrawn + amount,
      availableBalance: currentEarnings - (currentWithdrawn + amount)
    }, { merge: true });
    console.log('Balance updated:', { earnings: currentEarnings, withdrawn: currentWithdrawn + amount });
  } catch (dbError) {
    console.error('Firestore Balance Error:', dbError.code, dbError.message, dbError.details);
    throw new Error(`Failed to update balance: ${dbError.message}`);
  }

  // Log withdrawal to Firestore
  const withdrawalData = {
    userId: currentUserId,
    amount: Number(amount),
    method,
    status: method === 'paychangu_wallet' ? 'claimed' : 'pending',
    reference: chargeId,
    details: {
      phone: String(details.phone || 'N/A'),
      accountHolder: String(details.accountHolder || 'User'),
      email: String(details.email || 'user@example.com')
    },
    timestamp: serverTimestamp()
  };

  try {
    await addDoc(collection(db, 'withdrawals'), withdrawalData);
    console.log('Withdrawal logged:', withdrawalData);
  } catch (dbError) {
    console.error('Firestore Withdrawal Error:', dbError.code, dbError.message, dbError.details);
    throw new Error(`Failed to log withdrawal: ${dbError.message}`);
  }

  if (method === 'paychangu_wallet') {
    // Internal claim: No external payout
    return { reference: chargeId, status: 'claimed' };
  } else if (method === 'paychangu') {
    // External Payout to PayChangu-linked Mobile
    let rawMobile = details.phone.replace(/\D/g, '');
    if (rawMobile.startsWith('265')) {
      rawMobile = rawMobile.slice(3);
    }
    if (rawMobile.length !== 9 || !/^\d{9}$/.test(rawMobile)) {
      throw new Error('Invalid mobile number: Must be 9 digits (e.g., 0991234567).');
    }

    // Check balance before payout
    const balance = await checkPayChanguBalance();
    const totalWithFee = amount * (1 + FEE_PERCENTAGE);
    if (balance < totalWithFee) {
      throw new Error(`Insufficient PayChangu balance: Need MK ${totalWithFee.toLocaleString()} (incl. ~3% fee), have MK ${balance.toLocaleString()}. Top up at dashboard.paychangu.com.`);
    }

    return await initiateExternalPayout(amount, { ...details, phone: rawMobile }, chargeId);
  } else {
    throw new Error('Unsupported method. Use "paychangu_wallet" or "paychangu".');
  }
}

// Helper: Initiate External Payout
async function initiateExternalPayout(amount, details, chargeId) {
  const payload = {
    mobile_money_operator_ref_id: PAYCHANGU_MOBILE_UUID,
    mobile: details.phone,
    amount: amount.toString(),
    charge_id: chargeId
  };

  try {
    const response = await fetch('https://api.paychangu.com/mobile-money/payouts/initialize', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PAYCHANGU_SECRET_KEY}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const responseText = await response.text();
    console.log('PayChangu Response:', { status: response.status, body: responseText });

    if (!response.ok) {
      const errorData = JSON.parse(responseText || '{}');
      throw new Error(`Payout failed: ${response.status} - ${errorData.message || 'Server Error'}`);
    }

    const result = JSON.parse(responseText);
    console.log('Payout Initiated:', result);

    // Update withdrawal status in Firestore
    const withdrawalQuery = query(collection(db, 'withdrawals'), where('reference', '==', chargeId));
    const withdrawalSnap = await getDocs(withdrawalQuery);
    if (!withdrawalSnap.empty) {
      const withdrawalDoc = withdrawalSnap.docs[0];
      await updateDoc(doc(db, 'withdrawals', withdrawalDoc.id), { status: result.data?.status || 'pending' });
    }

    // Poll status for up to 5 minutes
    let attempts = 0;
    const maxAttempts = 5;
    const pollStatus = async () => {
      if (attempts >= maxAttempts) {
        console.log('Max status checks reached. Check dashboard manually.');
        return result;
      }
      attempts++;
      try {
        const statusResponse = await fetch(`https://api.paychangu.com/mobile-money/payouts/${chargeId}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${PAYCHANGU_SECRET_KEY}`,
            'Accept': 'application/json'
          }
        });
        const statusData = await statusResponse.json();
        console.log(`Status Check (${attempts}/${maxAttempts}):`, statusData);
        if (statusData.data?.status === 'completed') {
          // Update Firestore status
          const withdrawalQuery = query(collection(db, 'withdrawals'), where('reference', '==', chargeId));
          const withdrawalSnap = await getDocs(withdrawalQuery);
          if (!withdrawalSnap.empty) {
            const withdrawalDoc = withdrawalSnap.docs[0];
            await updateDoc(doc(db, 'withdrawals', withdrawalDoc.id), { status: 'completed' });
          }
          alert(`Payout confirmed! Amount: MK ${amount.toLocaleString()} sent to mobile wallet. Check Airtel/TNM.`);
          await loadWithdrawals();
          return statusData;
        } else if (statusData.data?.status === 'failed') {
          // Update Firestore status
          const withdrawalQuery = query(collection(db, 'withdrawals'), where('reference', '==', chargeId));
          const withdrawalSnap = await getDocs(withdrawalQuery);
          if (!withdrawalSnap.empty) {
            const withdrawalDoc = withdrawalSnap.docs[0];
            await updateDoc(doc(db, 'withdrawals', withdrawalDoc.id), { status: 'failed' });
          }
          alert('Payout failed: Funds returned to PayChangu balance. Check dashboard or contact support@paychangu.com.');
          await loadWithdrawals();
          return statusData;
        } else {
          setTimeout(pollStatus, 60000); // Check again in 1 minute
        }
      } catch (statusError) {
        console.error('Status Check Error:', statusError);
        if (attempts < maxAttempts) setTimeout(pollStatus, 60000);
      }
    };
    setTimeout(pollStatus, 60000); // Start polling after 1 minute

    return result;
  } catch (error) {
    console.error('PayChangu API Error:', error);
    // Update Firestore status on failure
    const withdrawalQuery = query(collection(db, 'withdrawals'), where('reference', '==', chargeId));
    const withdrawalSnap = await getDocs(withdrawalQuery);
    if (!withdrawalSnap.empty) {
      const withdrawalDoc = withdrawalSnap.docs[0];
      await updateDoc(doc(db, 'withdrawals', withdrawalDoc.id), { status: 'failed' });
    }
    await loadWithdrawals();
    throw error;
  }
}

// Setup Withdrawal Modal
function setupWithdrawModal() {
  const modal = document.getElementById('withdraw-modal');
  if (!modal) return;

  const closeBtn = document.getElementById('close-withdraw-modal');
  const methodSelect = document.getElementById('payout-method');
  const form = document.getElementById('withdraw-form');
  const amountInput = document.getElementById('withdraw-amount-input');
  const amountDisplay = document.getElementById('withdraw-amount-display');
  const maxAmountSpan = document.getElementById('withdraw-max-amount');

  // Set payout method options
  if (methodSelect) {
    methodSelect.innerHTML = `
      <option value="paychangu_wallet">PayChangu Wallet (Claim)</option>
      <option value="paychangu">PayChangu (External)</option>
    `;
    methodSelect.value = 'paychangu_wallet';
  }

  // Remove required attributes
  document.querySelectorAll('#withdraw-form input, #withdraw-form select').forEach(el => el.required = false);

  if (closeBtn) closeBtn.addEventListener('click', () => modal.style.display = 'none');
  if (modal) modal.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });

  if (amountInput && amountDisplay) {
    amountInput.addEventListener('input', () => {
      amountDisplay.textContent = amountInput.value || '0';
    });
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const amountEl = document.getElementById('withdraw-amount-input');
      let amount = parseInt(amountEl?.value || '0');
      
      if (isNaN(amount) || amount <= 0) {
        alert('Enter a valid amount greater than 0.');
        amountEl?.focus();
        return;
      }
      
      if (amount > totalBalance) {
        alert(`Cannot exceed balance: MK ${totalBalance.toLocaleString()}.`);
        amountEl?.focus();
        return;
      }

      const method = methodSelect?.value || 'paychangu_wallet';
      const phone = document.getElementById('phone-number')?.value.trim() || YOUR_MOBILE_NUMBER;
      const fullName = document.getElementById('full-name')?.value.trim() || 'User';
      const email = document.getElementById('email')?.value.trim() || 'user@example.com';

      if (method === 'paychangu' && (!phone || !/^265\d{9}$/.test(phone.replace(/\D/g, '')))) {
        alert('Enter valid mobile number (265 + 9 digits, e.g., 2650991234567).');
        document.getElementById('phone-number')?.focus();
        return;
      }

      const payoutDetails = { phone, accountHolder: fullName, email };

      const submitBtn = document.getElementById('submit-withdraw-btn');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = method === 'paychangu_wallet' ? 'Claiming...' : 'Processing...';
      }

      try {
        const result = await initiatePayChanguPayout(amount, payoutDetails, method);
        
        totalBalance -= amount;
        const balanceEl = document.getElementById('balance-amount');
        if (balanceEl) balanceEl.textContent = `MK ${totalBalance.toLocaleString()}`;
        
        const withdrawBtn = document.getElementById('header-withdraw-btn');
        if (withdrawBtn) withdrawBtn.disabled = totalBalance <= 0;

        const toast = document.getElementById('withdraw-success-toast');
        if (toast) {
          toast.style.display = 'block';
          setTimeout(() => toast.style.display = 'none', 5000);
        }

        modal.style.display = 'none';
        form.reset();
        if (amountDisplay) amountDisplay.textContent = '0';

        await loadWithdrawals();

        const ref = result.reference || result.id || 'N/A';
        const message = method === 'paychangu_wallet'
          ? `Claim logged! To make it real money, add MK ${amount.toLocaleString()} to your PayChangu wallet at dashboard.paychangu.com. Ref: ${ref}`
          : `Payout initiated to mobile! Check Airtel/TNM in 1-30 minutes. Ref: ${ref}`;
        alert(`Success! Amount: MK ${amount.toLocaleString()}\n${message}\nIf no funds in 30 min, check dashboard 'Pending' tab or email support@paychangu.com with Ref: ${ref}.`);
        
      } catch (error) {
        console.error('Error:', error);
        alert(`Failed: ${error.message}\nFor external: Top up PayChangu balance or verify KYC. For internal: Fund wallet manually. Contact support@paychangu.com.`);
        await loadWithdrawals();
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Submit';
        }
      }
    });
  }
}

// Withdraw Button - Open Modal
const withdrawHeaderBtn = document.getElementById('header-withdraw-btn');
if (withdrawHeaderBtn) {
  withdrawHeaderBtn.addEventListener('click', () => {
    if (totalBalance <= 0) {
      alert('Balance is 0. Earn more to withdraw.');
      return;
    }
    
    const amountInput = document.getElementById('withdraw-amount-input');
    const maxSpan = document.getElementById('withdraw-max-amount');
    const modal = document.getElementById('withdraw-modal');
    
    if (amountInput) amountInput.max = totalBalance;
    if (maxSpan) maxSpan.textContent = totalBalance.toLocaleString();
    if (modal) modal.style.display = 'flex';
  });
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    if (currentUserId) {
      loadMusic();
      loadWithdrawals();
    }
  }, 100);

});
