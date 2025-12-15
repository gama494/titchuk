import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js';
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  query,
  where,
  updateDoc,
  doc,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js';
import {
  getAuth,
  onAuthStateChanged,
  signOut
} from 'https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js';

// --- Firebase Configs ---
const firebaseConfig1 = {
  apiKey: "AIzaSyDmaYvNa17qbwVkH2uiiK6PSDInRUoCoAk",
  authDomain: "music-upload-3f7fe.firebaseapp.com",
  projectId: "music-upload-3f7fe",
  storageBucket: "music-upload-3f7fe.appspot.com",
  messagingSenderId: "197791116274",
  appId: "1:197791116274:web:d54d6ad4135968c9cb196b"
};

const firebaseConfig2 = {
  apiKey: "AIzaSyDkANMB95-hIl4-I2gla5qtsH3BlH77nU8",
  authDomain: "music-upload-30cc3.firebaseapp.com",
  projectId: "music-upload-30cc3",
  storageBucket: "music-upload-30cc3.firebasestorage.app",
  messagingSenderId: "385597338493",
  appId: "1:385597338493:web:04696d4dc201e8427e1214"
};

// --- Initialize Two Apps ---
const app1 = initializeApp(firebaseConfig1, "app1"); // for public
const app2 = initializeApp(firebaseConfig2, "app2"); // for uploads/dashboard

// --- Firestore & Auth ---
const db1 = getFirestore(app1);
const auth1 = getAuth(app1);

const db2 = getFirestore(app2);
const auth2 = getAuth(app2);

// --- Working with db2 for user upload ---
let userId = null;

onAuthStateChanged(auth2, async (user) => {
  if (user) {
    userId = user.uid;
    await tagOldSongsWithUserId(userId);
    loadMusic();
  } else {
    window.location.href = 'dashboard.html';
  }
});

document.getElementById('logout-button').addEventListener('click', async () => {
  await signOut(auth2);
  window.location.href = 'signin.html';
});

async function uploadToCloudinary(file, folder) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', 'voice upload');
  if (folder) formData.append('folder', folder);

  try {
    const response = await fetch('https://api.cloudinary.com/v1_1/dksjgmzvm/upload', {
      method: 'POST',
      body: formData,
    });
    const data = await response.json();
    if (!data.secure_url) throw new Error(data.error?.message || 'Upload failed');
    return data.secure_url;
  } catch (error) {
    console.error('Upload failed:', error.message);
    alert('Upload failed: ' + error.message);
    throw error;
  }
}

document.getElementById('music-upload-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const title = document.getElementById('title').value;
  const artist = document.getElementById('artist').value;
  const genres = document.getElementById('genres').value.split(',').map(g => g.trim());
  const posterFile = document.getElementById('poster').files[0];
  const audioFile = document.getElementById('audio').files[0];

  if (!posterFile || !audioFile) {
    alert('Please upload both a music poster and an audio file.');
    return;
  }

  try {
    const posterUrl = await uploadToCloudinary(posterFile, 'music-posters');
    const audioUrl = await uploadToCloudinary(audioFile, 'music-audios');

    await addDoc(collection(db2, 'music'), {
      title,
      artist,
      genres,
      posterUrl,
      audioUrl,
      userId,
      timestamp: serverTimestamp()
    });

    alert('Music uploaded successfully!');
    loadMusic();
  } catch (error) {
    console.error('Error uploading music:', error);
    alert('Error uploading music: ' + error.message);
  }
});

async function loadMusic() {
  const container = document.getElementById('music-list-container');
  container.innerHTML = '';

  const musicRef = collection(db2, 'music');
  const q = query(musicRef, where('userId', '==', userId));
  const querySnapshot = await getDocs(q);

  querySnapshot.forEach((doc) => {
    const { title, artist, posterUrl, audioUrl } = doc.data();
    const card = document.createElement('div');
    card.className = 'music-card';
    card.innerHTML = `
      <img src="${posterUrl}" alt="${title}">
      <div class="music-card-details">
        <div class="music-card-title">${title}</div>
        <div class="music-card-artist">${artist}</div>
      </div>
      <div class="music-card-icons">
        <a href="${audioUrl}" download><i class="fas fa-download"></i></a>
        <a href="${audioUrl}" target="_blank"><i class="fas fa-eye"></i></a>
        <a href="#" class="copy-link-btn"><i class="fas fa-link"></i> Copy Link</a>
        <a href="#"><i class="fas fa-heart"></i></a>
      </div>
    `;

    card.querySelector('.copy-link-btn').addEventListener('click', (e) => {
      e.preventDefault();
      const input = document.createElement('input');
      input.value = audioUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      alert('Link copied to clipboard!');
    });

    container.appendChild(card);
  });
}

async function tagOldSongsWithUserId(userId) {
  const snapshot = await getDocs(collection(db2, 'music'));
  for (const docSnap of snapshot.docs) {
    const data = docSnap.data();
    if (!data.userId && data.artist.toLowerCase() === "your name".toLowerCase()) {
      await updateDoc(doc(db2, 'music', docSnap.id), { userId });
      console.log(`Tagged song "${data.title}" with userId`);
    }
  }
}
