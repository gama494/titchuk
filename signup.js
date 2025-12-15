import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js';
import { getAuth, createUserWithEmailAndPassword } from 'https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js';
import { getFirestore, doc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js';


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
const auth = getAuth(app);
const db = getFirestore(app);

const form = document.getElementById('signup-form');
const usernameInput = document.getElementById('username');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const genderInput = document.getElementById('gender');
const ageInput = document.getElementById('age');
const nationalityInput = document.getElementById('nationality');
const phoneInput = document.getElementById('phone');

form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const username = usernameInput.value;
    const email = emailInput.value;
    const password = passwordInput.value;
    const gender = genderInput.value;
    const age = ageInput.value;
    const nationality = nationalityInput.value;
    const phone = phoneInput.value;

    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        await setDoc(doc(db, 'users', user.uid), {
            username,
            email,
            gender,
            age,
            nationality,
            phone,
            createdAt: serverTimestamp()
        });

        alert('User signed up successfully! Redirecting to dashboard...');
        window.location.href = 'dashboard.html'; 

    } catch (error) {
        console.error('Error signing up:', error);
        alert('Error: ' + error.message);
    }
});
