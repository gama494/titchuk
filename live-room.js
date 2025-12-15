
import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js';
import { getFirestore, doc, onSnapshot, updateDoc, addDoc, collection, serverTimestamp, increment, query, orderBy, limit, getDoc, deleteDoc, where, getDocs } from 'https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js';
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

const urlParams = new URLSearchParams(window.location.search);
const roomId = urlParams.get('roomId');

let currentUser = null;
let currentRole = 'viewer'; // 'host', 'guest', 'viewer'
let peer = null;
let localStream = null;
let dummyStream = null;
let audioContext = null;
let currentFacingMode = 'user';
let activePeers = {};
let isRetryPending = {};
let hasAnnounced = false;

// DOM Elements
const videoStage = document.getElementById('video-stage');
const hostVideo = document.getElementById('host-video');
const guestVideo = document.getElementById('guest-video');
const guestSlot = document.getElementById('guest-slot');
const viewerCountEl = document.getElementById('viewer-count');
const likeCountEl = document.getElementById('like-count');
const requestJoinBtn = document.getElementById('request-join-btn');
const leaveBtn = document.getElementById('leave-btn');
const endBtn = document.getElementById('end-stream-btn');
const deleteBtn = document.getElementById('delete-live-btn');
const mediaControls = document.getElementById('media-controls');
const micBtn = document.getElementById('toggle-mic-btn');
const camBtn = document.getElementById('toggle-cam-btn');
const switchCamBtn = document.getElementById('switch-cam-btn');
const requestsBtn = document.getElementById('requests-btn');
const requestsPanel = document.getElementById('requests-panel');
const reqBadge = document.getElementById('req-badge');

// --- AUTH & INIT ---
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        try {
            const result = await signInAnonymously(auth);
            currentUser = result.user;
        } catch (error) {
            console.error("Auth failed", error);
            alert("Login required to view stream.");
            return;
        }
    } else {
        currentUser = user;
    }

    if (!roomId) {
        window.location.href = 'live.html';
        return;
    }

    await determineRole();
    setupUI();
    announceJoin();
    
    // Initialize media streams BEFORE PeerJS
    if (currentRole === 'host' || currentRole === 'guest') {
        await startLocalStream();
    } else {
        // Viewers create a dummy stream to satisfy PeerJS requirements
        dummyStream = createDummyStream();
    }

    initPeer();
    
    setupRoomListeners();
    setupChat();
    setupLikes(); // Init likes for everyone

    // Join logic
    try {
        if (currentRole === 'viewer') {
             silentUpdateViewerCount(1);
        }
    } catch(e) { }

    window.addEventListener('beforeunload', () => {
        if (currentRole === 'viewer') {
            navigator.sendBeacon ? navigator.sendBeacon("...", "") : silentUpdateViewerCount(-1);
        }
    });
});

async function silentUpdateViewerCount(val) {
    try {
        await updateDoc(doc(db, 'live_rooms', roomId), { viewers: increment(val) });
    } catch (e) {}
}

async function determineRole() {
    try {
        const docSnap = await getDoc(doc(db, 'live_rooms', roomId));
        if (!docSnap.exists()) {
            alert("Stream not found.");
            window.location.href = 'live.html';
            return;
        }
        const data = docSnap.data();

        if (currentUser.uid === data.hostId) {
            currentRole = 'host';
        } else if (currentUser.uid === data.guestId) {
            currentRole = 'guest';
        } else {
            currentRole = 'viewer';
        }
    } catch (e) {
        console.error("Role error", e);
    }
}

async function announceJoin() {
    if(hasAnnounced) return;
    hasAnnounced = true;

    let msg = "";
    if (currentRole === 'host') msg = "Host joined the live";
    else if (currentRole === 'guest') msg = "Guest joined the live";
    else msg = "A viewer joined the live";

    try {
        await addDoc(collection(db, `live_rooms/${roomId}/messages`), {
            text: msg,
            sender: "System",
            system: true,
            timestamp: serverTimestamp()
        });
    } catch (e) { }
}

function setupUI() {
    if (currentRole === 'host') {
        endBtn.style.display = 'block';
        deleteBtn.style.display = 'block';
        mediaControls.style.display = 'flex';
        requestJoinBtn.style.display = 'none';
        requestsBtn.style.display = 'flex';
        setupHostRequestsListener();
    } else if (currentRole === 'guest') {
        leaveBtn.style.display = 'block';
        mediaControls.style.display = 'flex';
        requestJoinBtn.style.display = 'none';
    } else {
        // Viewer
        mediaControls.style.display = 'none';
        checkIfRequestPending();
    }
}

function setupRoomListeners() {
    onSnapshot(doc(db, 'live_rooms', roomId), (docSnap) => {
        if (!docSnap.exists()) return;
        const data = docSnap.data();

        // Calculate Total Participants: Database Viewers + Host(1) + Guest(1 if present)
        const dbViewers = data.viewers || 0;
        const totalCount = dbViewers + 1 + (data.guestId ? 1 : 0);
        viewerCountEl.innerText = totalCount;
        
        // Realtime Likes Update
        const oldLikeCount = parseInt(likeCountEl.innerText) || 0;
        const newLikeCount = data.likes || 0;
        likeCountEl.innerText = newLikeCount;
        
        // Trigger animation if count increased (by anyone)
        if (newLikeCount > oldLikeCount) {
             createFloatingHeart();
        }

        if (data.status === 'ended' && currentRole !== 'host') {
            alert("Stream has ended.");
            window.location.href = 'live.html';
        }

        // Reload if viewer becomes guest
        if (currentRole === 'viewer' && data.guestId === currentUser.uid) {
            window.location.reload();
            return;
        }

        const guestExists = !!data.guestId; 

        if (guestExists) {
            videoStage.classList.add('split');
            guestSlot.style.display = 'flex';
            
            if (currentRole === 'viewer' && peer && !activePeers['guest']) {
                 setTimeout(() => connectToPeer(`titchuke-live-${roomId}-guest`, 'guest'), 1000);
            }

            if (requestJoinBtn) requestJoinBtn.style.display = 'none';

        } else {
            videoStage.classList.remove('split');
            guestSlot.style.display = 'none';
            
            if (activePeers['guest']) {
                if(activePeers['guest'].close) activePeers['guest'].close();
                delete activePeers['guest'];
                guestVideo.srcObject = null;
            }

            if (currentRole === 'viewer' && !currentUser.isAnonymous) {
                if (requestJoinBtn) requestJoinBtn.style.display = 'flex'; 
                checkIfRequestPending(); // Re-check status to ensure button state is correct
            } else {
                if (requestJoinBtn) requestJoinBtn.style.display = 'none';
            }
        }
    });
}

// --- HOST REQUEST MANAGEMENT ---

function setupHostRequestsListener() {
    const q = query(collection(db, `live_rooms/${roomId}/messages`), 
        where('type', '==', 'request'),
        where('status', '==', 'pending')
    );
    
    onSnapshot(q, (snapshot) => {
        const requests = [];
        snapshot.forEach(doc => requests.push({ id: doc.id, ...doc.data() }));
        
        if (reqBadge) {
            reqBadge.innerText = requests.length;
            reqBadge.style.display = requests.length > 0 ? 'block' : 'none';
        }
        
        requestsPanel.innerHTML = '';
        if (requests.length === 0) {
            requestsPanel.innerHTML = '<div style="padding: 5px; text-align: center; color: #94a3b8;">No pending requests.</div>';
        } else {
            requests.forEach(req => {
                const item = document.createElement('div');
                item.className = 'req-item';
                item.innerHTML = `
                    <div class="req-info">${req.sender || 'User'}</div>
                    <div class="req-actions">
                        <button class="req-btn-accept">Accept</button>
                        <button class="req-btn-reject">Reject</button>
                    </div>
                `;
                
                item.querySelector('.req-btn-accept').addEventListener('click', () => acceptGuest(req.userId, req.id));
                item.querySelector('.req-btn-reject').addEventListener('click', () => rejectGuest(req.id));
                
                requestsPanel.appendChild(item);
            });
        }
    });

    requestsBtn.addEventListener('click', () => {
        requestsPanel.style.display = requestsPanel.style.display === 'none' ? 'block' : 'none';
    });
}

async function acceptGuest(userId, requestId) {
    try {
        // 1. Update room to let guest in
        await updateDoc(doc(db, 'live_rooms', roomId), { guestId: userId });
        
        alert("Guest accepted! They will join shortly.");
        requestsPanel.style.display = 'none';

        // 2. Clean up request
        try {
            await deleteDoc(doc(db, `live_rooms/${roomId}/messages`, requestId));
        } catch (e) {
            console.warn("Msg delete failed, updating status instead", e);
            try {
                await updateDoc(doc(db, `live_rooms/${roomId}/messages`, requestId), { status: 'accepted' });
            } catch (e2) {}
        }
    } catch (e) {
        console.error("Accept failed", e);
        alert("Failed to accept guest. " + e.message);
    }
}

async function rejectGuest(requestId) {
    try {
        try {
             await deleteDoc(doc(db, `live_rooms/${roomId}/messages`, requestId));
        } catch(e) {
             await updateDoc(doc(db, `live_rooms/${roomId}/messages`, requestId), { status: 'rejected' });
        }
    } catch (e) {
        console.error("Reject failed", e);
    }
}

// --- VIEWER REQUEST LOGIC ---

async function checkIfRequestPending() {
    if (!currentUser || currentUser.isAnonymous) return;
    
    const q = query(
        collection(db, `live_rooms/${roomId}/messages`), 
        where('type', '==', 'request'),
        where('userId', '==', currentUser.uid),
        where('status', '==', 'pending')
    );
    
    try {
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
            setRequestPendingUI();
        }
    } catch(e) {
        console.log("Error checking request status:", e);
    }
}

function setRequestPendingUI() {
    if (requestJoinBtn) {
        requestJoinBtn.innerHTML = "<i class='bx bx-time'></i> Request Sent";
        requestJoinBtn.classList.add('pending');
        requestJoinBtn.disabled = true;
    }
}

// --- WEBRTC / PEERJS LOGIC ---

async function startLocalStream() {
    try {
        // Attempt to get higher quality video
        const constraints = {
            video: { 
                width: { ideal: 1280 },
                height: { ideal: 720 },
                facingMode: currentFacingMode 
            },
            audio: { 
                echoCancellation: true, 
                noiseSuppression: true,
                autoGainControl: true
            }
        };
        localStream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
        console.warn("Preferred media failed. Trying fallback...", err);
        try {
             // Fallback 1: Basic video/audio
            localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        } catch (err2) {
             console.warn("Video failed. Trying audio only...", err2);
             try {
                 // Fallback 2: Audio Only (If camera missing)
                 localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                 alert("Camera access failed. Switching to audio-only mode.");
                 if(currentRole === 'host') hostVideo.style.opacity = '0'; 
                 else guestVideo.style.opacity = '0';
             } catch (err3) {
                 console.error("All media failed", err3);
                 alert("Could not access camera or microphone. Please check permissions and try again.");
                 return;
             }
        }
    }
    
    // Attach local stream & Handle Muting (Important for preventing echo)
    // We mute OUR OWN video element so we don't hear ourselves, 
    // but the stream sent to peers will still have audio.
    // Also apply mirror class to self.
    
    if (currentRole === 'host') {
        hostVideo.srcObject = localStream;
        hostVideo.muted = true; // Mute myself locally
        hostVideo.classList.add('self-video'); // Mirror me
        
        guestVideo.muted = false; // Hear guest
        guestVideo.classList.remove('self-video');
    } else if (currentRole === 'guest') {
        guestVideo.srcObject = localStream;
        guestVideo.muted = true; // Mute myself locally
        guestVideo.classList.add('self-video'); // Mirror me
        
        hostVideo.muted = false; // Hear host
        hostVideo.classList.remove('self-video');
    }

    setupAudioContext(localStream, currentRole === 'host' ? 'host-slot' : 'guest-slot');
}

function createDummyStream() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = ctx.createOscillator();
        const dst = ctx.createMediaStreamDestination();
        oscillator.connect(dst);
        const audioTrack = dst.stream.getAudioTracks()[0];
        audioTrack.enabled = false; 

        const canvas = document.createElement('canvas');
        canvas.width = 10; canvas.height = 10;
        const ctx2d = canvas.getContext('2d');
        ctx2d.fillStyle = 'black';
        ctx2d.fillRect(0,0,10,10);
        const canvasStream = canvas.captureStream(1);
        const videoTrack = canvasStream.getVideoTracks()[0];
        videoTrack.enabled = false;

        return new MediaStream([audioTrack, videoTrack]);
    } catch(e) {
        return new MediaStream();
    }
}

function initPeer() {
    let myPeerId;
    if (currentRole === 'host') myPeerId = `titchuke-live-${roomId}-host`;
    else if (currentRole === 'guest') myPeerId = `titchuke-live-${roomId}-guest`;
    else myPeerId = `viewer-${currentUser.uid}-${Math.floor(Math.random() * 10000)}`;

    peer = new Peer(myPeerId);

    peer.on('open', (id) => {
        if (currentRole === 'guest' || currentRole === 'viewer') {
            connectToPeer(`titchuke-live-${roomId}-host`, 'host');
        }
        
        const guestSlotVisible = document.getElementById('guest-slot').style.display !== 'none';
        if (currentRole === 'viewer' && guestSlotVisible) {
            connectToPeer(`titchuke-live-${roomId}-guest`, 'guest');
        }
    });

    peer.on('call', (call) => {
        const streamToSend = localStream || dummyStream;
        if (streamToSend) {
            call.answer(streamToSend);
            call.on('stream', (remoteStream) => {
                handleRemoteStream(call.peer, remoteStream);
            });
        }
    });
}

function connectToPeer(peerId, targetRole, retryCount = 0) {
    if (!peer || peer.destroyed) return;
    if (activePeers[targetRole]) return;

    const streamToSend = localStream || dummyStream;
    if (!streamToSend) {
        if (currentRole === 'viewer') dummyStream = createDummyStream();
        if (retryCount < 5) setTimeout(() => connectToPeer(peerId, targetRole, retryCount + 1), 1000);
        return;
    }

    try {
        const call = peer.call(peerId, streamToSend);
        if (call) {
            activePeers[targetRole] = call;
            call.on('stream', (remoteStream) => {
                handleRemoteStream(peerId, remoteStream);
                isRetryPending[targetRole] = false;
            });
            call.on('close', () => { activePeers[targetRole] = null; });
            call.on('error', (e) => {
                activePeers[targetRole] = null;
                handleConnectionError(peerId, targetRole, retryCount);
            });
        } else {
             handleConnectionError(peerId, targetRole, retryCount);
        }
    } catch (e) {
        handleConnectionError(peerId, targetRole, retryCount);
    }
}

function handleConnectionError(peerId, targetRole, retryCount) {
    activePeers[targetRole] = null;
    if (retryCount < 20) { 
        isRetryPending[targetRole] = true;
        setTimeout(() => {
            if(isRetryPending[targetRole]) connectToPeer(peerId, targetRole, retryCount + 1);
        }, 3000);
    }
}

function handleRemoteStream(peerId, stream) {
    if (peerId.startsWith('viewer')) return;

    // Ensure remote streams are NOT muted so we can hear them
    if (peerId.includes('host')) {
        hostVideo.srcObject = stream;
        hostVideo.muted = false; // CRITICAL: Unmute remote stream
        hostVideo.play().catch(() => {});
        setupAudioContext(stream, 'host-slot');
    } else if (peerId.includes('guest')) {
        guestVideo.srcObject = stream;
        guestVideo.muted = false; // CRITICAL: Unmute remote stream
        guestVideo.play().catch(() => {});
        setupAudioContext(stream, 'guest-slot');
    }
}

function setupAudioContext(stream, elementId) {
    if (!window.AudioContext && !window.webkitAudioContext) return;
    if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
    
    if (audioContext.state === 'suspended') {
        const resume = () => {
            audioContext.resume();
            document.removeEventListener('click', resume);
            document.removeEventListener('touchstart', resume);
        };
        document.addEventListener('click', resume);
        document.addEventListener('touchstart', resume);
    }

    try {
        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const el = document.getElementById(elementId);
        
        const checkVolume = () => {
            if (!el) return;
            analyser.getByteFrequencyData(dataArray);
            let sum = 0;
            for(let i = 0; i < dataArray.length; i++) sum += dataArray[i];
            const avg = sum / dataArray.length;
            
            if (avg > 10) el.classList.add('is-speaking');
            else el.classList.remove('is-speaking');
            
            requestAnimationFrame(checkVolume);
        };
        checkVolume();
    } catch (e) {}
}

if(switchCamBtn) switchCamBtn.addEventListener('click', async () => {
    if (!localStream) return;
    switchCamBtn.disabled = true;

    try {
        const tracks = localStream.getVideoTracks();
        if (tracks.length > 0) tracks[0].stop();
        
        currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
        
        const constraints = {
            video: { facingMode: currentFacingMode },
            audio: true
        };
        
        const newStream = await navigator.mediaDevices.getUserMedia(constraints);
        const newVideoTrack = newStream.getVideoTracks()[0];
        const newAudioTrack = newStream.getAudioTracks()[0];

        localStream.removeTrack(tracks[0]);
        localStream.addTrack(newVideoTrack);
        
        const oldAudio = localStream.getAudioTracks()[0];
        if (oldAudio) {
            localStream.removeTrack(oldAudio);
            oldAudio.stop();
        }
        localStream.addTrack(newAudioTrack);
        
        if (currentRole === 'host') {
            hostVideo.srcObject = localStream;
        } else {
            guestVideo.srcObject = localStream;
        }
        
        if (peer && peer.connections) {
            Object.values(peer.connections).forEach(connList => {
                connList.forEach(conn => {
                    const videoSender = conn.peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
                    if (videoSender) videoSender.replaceTrack(newVideoTrack);
                    const audioSender = conn.peerConnection.getSenders().find(s => s.track && s.track.kind === 'audio');
                    if (audioSender) audioSender.replaceTrack(newAudioTrack);
                });
            });
        }
    } catch (e) {
        alert("Unable to switch camera.");
        await startLocalStream();
    } finally {
        switchCamBtn.disabled = false;
    }
});

// --- JOIN / LEAVE / END LOGIC ---

if(requestJoinBtn) requestJoinBtn.addEventListener('click', async () => {
    if (!currentUser || currentUser.isAnonymous) {
        alert("Please login to request to join.");
        return;
    }
    
    requestJoinBtn.disabled = true;
    requestJoinBtn.innerHTML = "<i class='bx bx-loader-alt bx-spin'></i> Sending...";
    
    const username = currentUser.displayName || (currentUser.isAnonymous ? 'User' : currentUser.email.split('@')[0]);
    
    try {
        await addDoc(collection(db, `live_rooms/${roomId}/messages`), {
            text: "REQUEST_JOIN",
            sender: username,
            userId: currentUser.uid,
            type: 'request',
            status: 'pending',
            timestamp: serverTimestamp()
        });
        
        alert("Request sent! Waiting for host approval.");
        setRequestPendingUI();

    } catch (e) {
        console.error("Request Error:", e);
        // If permission denied, maybe alert user
        if(e.code === 'permission-denied') {
             alert("Unable to send request due to permissions.");
        } else {
             alert("Failed to send request: " + e.message);
        }
        requestJoinBtn.disabled = false;
        requestJoinBtn.innerHTML = "<i class='bx bx-video-plus'></i> Request to Join";
    }
});

if(leaveBtn) leaveBtn.addEventListener('click', async () => {
    if (confirm("Leave the stream?")) {
        try {
            await updateDoc(doc(db, 'live_rooms', roomId), { guestId: null });
        } catch(e) { }
        window.location.reload();
    }
});

if(endBtn) endBtn.addEventListener('click', async () => {
    if (confirm("End the broadcast?")) {
        try {
            await updateDoc(doc(db, 'live_rooms', roomId), { status: 'ended', guestId: null });
        } catch(e) { }
        window.location.href = 'live.html';
    }
});

if(deleteBtn) deleteBtn.addEventListener('click', async () => {
    if (confirm("Permanently delete this stream?")) {
        try {
            await deleteDoc(doc(db, 'live_rooms', roomId));
        } catch(e) { }
        window.location.href = 'live.html';
    }
});

if(micBtn) micBtn.addEventListener('click', () => {
    if (localStream) {
        const track = localStream.getAudioTracks()[0];
        if(track) {
            track.enabled = !track.enabled;
            micBtn.innerHTML = track.enabled ? "<i class='bx bx-microphone'></i>" : "<i class='bx bx-microphone-off'></i>";
            micBtn.classList.toggle('off', !track.enabled);
        }
    }
});

if(camBtn) camBtn.addEventListener('click', () => {
    if (localStream) {
        const track = localStream.getVideoTracks()[0];
        if(track) {
            track.enabled = !track.enabled;
            camBtn.innerHTML = track.enabled ? "<i class='bx bx-video'></i>" : "<i class='bx bx-video-off'></i>";
            camBtn.classList.toggle('off', !track.enabled);
            
            const myVideo = currentRole === 'host' ? hostVideo : guestVideo;
            myVideo.style.opacity = track.enabled ? '1' : '0.3';
        }
    }
});

function setupChat() {
    const q = query(collection(db, `live_rooms/${roomId}/messages`), orderBy('timestamp', 'asc'), limit(50));
    onSnapshot(q, (snapshot) => {
        const container = document.getElementById('chat-container');
        if(!container) return;
        
        let shouldScroll = container.scrollTop + container.clientHeight >= container.scrollHeight - 50;
        
        snapshot.docChanges().forEach(change => {
            if (change.type === 'added') {
                const msg = change.doc.data();
                if (msg.type === 'request') return;

                const div = document.createElement('div');
                if (msg.system) {
                    div.className = 'chat-message system-msg';
                    div.textContent = msg.text;
                } else {
                    div.className = 'chat-message';
                    div.innerHTML = `<span class="chat-username">${msg.sender}:</span> <span class="chat-text">${msg.text}</span>`;
                }
                container.appendChild(div);
            }
        });
        if (shouldScroll) container.scrollTop = container.scrollHeight;
    });

    const sendBtn = document.getElementById('send-btn');
    if(sendBtn) sendBtn.addEventListener('click', sendMsg);
}

async function sendMsg() {
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if (!text) return;
    
    const name = currentUser.displayName || (currentUser.isAnonymous ? 'Viewer' : currentUser.email.split('@')[0]);
    try {
        await addDoc(collection(db, `live_rooms/${roomId}/messages`), {
            text, sender: name, senderId: currentUser.uid, timestamp: serverTimestamp(), type: 'chat'
        });
        input.value = '';
    } catch (e) { }
}

function setupLikes() {
    const btn = document.getElementById('like-btn');
    if(!btn) return; 
    btn.addEventListener('click', () => {
        // NOTE: Floating heart is now triggered by database update in onSnapshot, 
        // so we only increment the DB here.
        try {
            updateDoc(doc(db, 'live_rooms', roomId), { likes: increment(1) }).catch(() => {});
        } catch(e) {}
    });
}

// Visual only helper for hearts spawned by DB updates
function createFloatingHeart() {
    const container = document.getElementById('hearts-container');
    if(!container) return;
    const heart = document.createElement('div');
    heart.className = 'floating-heart';
    heart.innerHTML = "<i class='bx bxs-heart'></i>";
    heart.style.left = Math.random() * 80 + 10 + '%';
    container.appendChild(heart);
    setTimeout(() => heart.remove(), 2000);
}
