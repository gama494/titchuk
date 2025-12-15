
import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js';
import { getFirestore, collection, addDoc, getDocs, query, where, serverTimestamp, deleteDoc, doc } from 'https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js';
import { getAuth, onAuthStateChanged, signInAnonymously } from 'https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js';

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

let currentUser = null;

// Auth Listener
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        loadStreams();
    } else {
        try {
            const result = await signInAnonymously(auth);
            currentUser = result.user;
            loadStreams();
        } catch (e) {
            console.error("Anonymous login failed", e);
        }
    }
});

// Load Streams
async function loadStreams() {
    const activeContainer = document.getElementById('active-streams');
    const pastContainer = document.getElementById('past-streams');
    
    if(!activeContainer || !pastContainer) return;

    try {
        // Active
        const qActive = query(collection(db, 'live_rooms'), where('status', '==', 'live'));
        const snapActive = await getDocs(qActive);
        
        const activeStreams = [];
        snapActive.forEach(doc => activeStreams.push({ id: doc.id, ...doc.data() }));
        activeStreams.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
        
        activeContainer.innerHTML = '';
        if (activeStreams.length === 0) {
            activeContainer.innerHTML = '<p style="color: #64748b; padding: 10px;">No live streams right now.</p>';
        } else {
            activeStreams.forEach(data => {
                activeContainer.appendChild(createStreamCard(data.id, data, true));
            });
        }

        // Past
        const qPast = query(collection(db, 'live_rooms'), where('status', '==', 'ended'));
        const snapPast = await getDocs(qPast);
        
        const pastStreams = [];
        snapPast.forEach(doc => pastStreams.push({ id: doc.id, ...doc.data() }));
        pastStreams.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
        
        pastContainer.innerHTML = '';
        if (pastStreams.length === 0) {
            pastContainer.innerHTML = '<p style="color: #64748b; padding: 10px;">No past broadcasts found.</p>';
        } else {
            pastStreams.forEach(data => {
                pastContainer.appendChild(createStreamCard(data.id, data, false));
            });
        }
    } catch (error) {
        console.error("Error loading streams:", error);
    }
}

function createStreamCard(id, data, isLive) {
    const card = document.createElement('div');
    card.className = `stream-card ${!isLive ? 'ended' : ''}`;
    
    const isOwner = currentUser && currentUser.uid === data.hostId;
    const showDelete = !isLive && isOwner;
    
    const deleteButtonHtml = showDelete 
        ? `<button class="delete-stream-btn" title="Delete Broadcast"><i class='bx bxs-trash'></i></button>` 
        : '';

    const title = data.title || (data.hostName ? `${data.hostName}'s Stream` : 'Live Stream');
    // Use cover image or fallback
    const coverImage = data.coverImage || 'logo.jpg'; 
    
    const imageHtml = `<img src="${coverImage}" alt="${title}" onerror="this.src='logo.jpg'">`;

    card.innerHTML = `
        ${deleteButtonHtml}
        <div class="stream-thumbnail">
            ${imageHtml}
            ${isLive ? '<span class="live-tag">LIVE</span>' : ''}
            ${isLive ? `<div class="viewer-count-badge"><i class='bx bxs-show'></i> ${data.viewers || 0}</div>` : ''}
        </div>
        <div class="stream-info">
            <h3>${title}</h3>
            <p style="color: #cbd5e1; font-size: 0.85rem;">Hosted by ${data.hostName || 'Unknown'}</p>
            <p style="font-size: 0.8rem; margin-top: 5px; color: #F43F5E;"><i class='bx bxs-heart'></i> ${data.likes || 0}</p>
        </div>
    `;
    
    card.addEventListener('click', (e) => {
        if (e.target.closest('.delete-stream-btn')) return;

        // Allow entry if it's live OR if I am the owner (to see stats/delete)
        if(isLive || isOwner) {
            window.location.href = `live-room.html?roomId=${id}`;
        }
    });

    if (showDelete) {
        const deleteBtn = card.querySelector('.delete-stream-btn');
        deleteBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (confirm("Delete this broadcast permanently?")) {
                try {
                    await deleteDoc(doc(db, 'live_rooms', id));
                    loadStreams();
                } catch (error) {
                    alert("Failed to delete.");
                }
            }
        });
    }

    return card;
}

// --- MODAL LOGIC ---
const openModalBtn = document.getElementById('open-create-modal-btn');
const modal = document.getElementById('create-live-modal');
const closeModalBtn = document.getElementById('close-modal-btn');
const confirmBtn = document.getElementById('confirm-go-live-btn');
const coverInput = document.getElementById('live-cover-input');
const coverPreview = document.getElementById('cover-preview');

if(openModalBtn) {
    openModalBtn.addEventListener('click', () => {
        // Guest check
        if (!currentUser || currentUser.isAnonymous) {
            if(confirm("You must be logged in to start a broadcast. Go to login page?")) {
                window.location.href = 'signin.html';
            }
            return;
        }
        modal.style.display = 'flex';
    });
}

if(closeModalBtn) closeModalBtn.addEventListener('click', () => modal.style.display = 'none');

if(coverInput) {
    coverInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (ev) => {
                coverPreview.src = ev.target.result;
                coverPreview.style.display = 'block';
            };
            reader.readAsDataURL(file);
        }
    });
}

if(confirmBtn) {
    confirmBtn.addEventListener('click', async () => {
        const titleInput = document.getElementById('live-title-input');
        const title = titleInput.value.trim() || "Untitled Stream";
        
        confirmBtn.disabled = true;
        confirmBtn.textContent = "Starting...";
        
        let coverImage = null;
        if (coverInput.files[0]) {
            // Simple Base64 for prototype. 
            // NOTE: Firestore doc limit is 1MB. Heavy images will fail. 
            // Ideally upload to Cloudinary first.
            try {
                coverImage = await new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onload = (e) => resolve(e.target.result);
                    reader.readAsDataURL(coverInput.files[0]);
                });
                
                // Simple client-side resize to prevent 1MB limit issue (Optional but recommended safety)
                if(coverImage.length > 800000) {
                     // Use a placeholder if too big for this demo to avoid crash
                     console.warn("Image too large for direct Firestore save, using placeholder");
                     coverImage = null; 
                }
            } catch(e) {
                console.error("Image process error", e);
            }
        }

        let hostName = 'Host';
        if (currentUser.displayName) hostName = currentUser.displayName;
        else if (currentUser.email) hostName = currentUser.email.split('@')[0];

        try {
            const docRef = await addDoc(collection(db, 'live_rooms'), {
                hostId: currentUser.uid,
                hostName: hostName,
                title: title,
                coverImage: coverImage, // Base64 string
                status: 'live',
                viewers: 0,
                likes: 0,
                guestId: null,
                timestamp: serverTimestamp()
            });
            
            window.location.href = `live-room.html?roomId=${docRef.id}&role=host`;
        } catch (e) {
            console.error("Create Room Error:", e);
            alert("Error creating room: " + e.message);
            confirmBtn.disabled = false;
            confirmBtn.textContent = "Start Live";
        }
    });
}
