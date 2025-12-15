import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js';
import {
  getAuth,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence
} from 'https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js';


const firebaseConfig = {
  apiKey: "AIzaSyDkANMB95-hIl4-I2gla5qtsH3BlH77nU8",
  authDomain: "music-upload-30cc3.firebaseapp.com",
  projectId: "music-upload-30cc3",
  storageBucket: "music-upload-30cc3.firebasestorage.app",
  messagingSenderId: "385597338493",
  appId: "1:385597338493:web:04696d4dc201e8427e1214"
};

// --- Initialize Firebase ---
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// --- DOM Elements ---
const form = document.getElementById('signin-form');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const rememberMeCheckbox = document.getElementById('remember-me');
const forgotPasswordButton = document.getElementById('forgot-password');

// --- Handle Login ---
form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const email = emailInput.value;
  const password = passwordInput.value;

  try {
    // Set persistence based on checkbox
    const persistence = rememberMeCheckbox.checked
      ? browserLocalPersistence
      : browserSessionPersistence;

    await setPersistence(auth, persistence);

    await signInWithEmailAndPassword(auth, email, password);

    alert('Sign in successful!');
    window.location.href = 'dashboard.html'; // ✅ Redirect to dashboard in assess folder
  } catch (error) {
    alert('Error: ' + error.message);
  }
});

// --- Forgot Password Handler ---
forgotPasswordButton.addEventListener('click', async () => {
  const email = emailInput.value;
  if (!email) {
    alert('Please enter your email first.');
    return;
  }

  try {
    await sendPasswordResetEmail(auth, email);
    alert('Password reset email sent!');
  } catch (error) {
    alert('Error: ' + error.message);
  }
});
