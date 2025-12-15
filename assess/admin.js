import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js';
import { getAuth, sendPasswordResetEmail, deleteUser } from 'https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js';
import { getFirestore, doc, updateDoc, deleteDoc, getDocs, getDoc, collection, setDoc } from 'https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js';

// Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyDmaYvNa17qbwVkH2uiiK6PSDInRUoCoAk",
  authDomain: "music-upload-3f7fe.firebaseapp.com",
  projectId: "music-upload-3f7fe",
  storageBucket: "music-upload-3f7fe.appspot.com",
  messagingSenderId: "197791116274",
  appId: "1:197791116274:web:d54d6ad4135968c9cb196b"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const earningsRef = doc(db, "admin", "earnings");

// PayPal API Credentials
const PAYPAL_CLIENT_ID = "AYmwSBz2g8U84Hl0GVhBsEmbRGE2oMC-GPeRwPbjwekUxwV9--cxG2aZn3itYD1CVxiydsG2j_HEpryQ";  // Replace with your PayPal Client ID
const PAYPAL_SECRET = "EDogWTQ2s5egbhZU-Kw_0Mdb0jwUs3ApX210nL1HEorjU7ospEHYMcfgpF2WsDNJ7usZDybb0EnoIGsD";        // Replace with your PayPal Secret

// Function to get PayPal Access Token
async function getPayPalAccessToken() {
  const credentials = `${PAYPAL_CLIENT_ID}:${PAYPAL_SECRET}`;
  const encodedCredentials = btoa(credentials); // Base64 encode Client ID and Secret

  try {
    const response = await fetch("https://api-m.sandbox.paypal.com/v1/oauth2/token", {
      method: "POST",
      headers: {
        "Authorization": `Basic ${encodedCredentials}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: "grant_type=client_credentials"
    });

    const data = await response.json();
    return data.access_token;
  } catch (error) {
    console.error("Error getting PayPal access token:", error);
    return null;
  }
}

// Withdraw Money via PayPal API
window.withdrawMoney = async function () {
  const paypalEmail = document.getElementById("paypal-email").value;
  if (!paypalEmail) {
    alert("Please enter a valid PayPal email!");
    return;
  }

  const earningsSnapshot = await getDoc(earningsRef);
  const totalEarnings = earningsSnapshot.data()?.totalEarnings || 0;

  if (totalEarnings < 500) {
    alert("Minimum withdrawal amount is 500 MK.");
    return;
  }

  const accessToken = await getPayPalAccessToken();
  if (!accessToken) {
    alert("Failed to get PayPal access token. Check your API credentials.");
    return;
  }

  const payoutData = {
    sender_batch_header: { email_subject: "You have received a payment!" },
    items: [{
      recipient_type: "EMAIL",
      amount: { value: (totalEarnings / 1700).toFixed(2), currency: "USD" },
      receiver: paypalEmail
    }]
  };

  try {
    const response = await fetch("https://api-m.sandbox.paypal.com/v1/payments/payouts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${accessToken}`
      },
      body: JSON.stringify(payoutData)
    });

    const result = await response.json();
    if (result.batch_header?.payout_batch_id) {
      console.log("Payout Batch Created:", result.batch_header.payout_batch_id);
      alert("Withdrawal successful!");
      await updateDoc(earningsRef, { totalEarnings: 0 });
      // Call to track the batch status after payout creation
      checkPayoutStatus(result.batch_header.payout_batch_id);
    } else {
      alert("Withdrawal failed. Check PayPal dashboard.");
    }
  } catch (error) {
    console.error("Error processing withdrawal:", error);
    alert("Withdrawal failed. Check console for errors.");
  }
};

// Function to check the status of the payout batch
async function checkPayoutStatus(batchId) {
  const accessToken = await getPayPalAccessToken();
  if (!accessToken) {
    console.error("Failed to get PayPal access token. Check your credentials.");
    return;
  }

  try {
    const response = await fetch(`https://api-m.sandbox.paypal.com/v1/payments/payouts/${batchId}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${accessToken}`
      }
    });

    const result = await response.json();
    console.log("Payout Batch Status:", result);

    if (result.batch_header.batch_status === 'PENDING') {
      console.log("The payout batch is still pending. Checking again in 1 minute.");
      setTimeout(() => checkPayoutStatus(batchId), 60000); // Check again in 1 minute
    } else if (result.batch_header.batch_status === 'SUCCESS') {
      console.log("The payout batch has been successfully processed.");
    } else {
      console.log("Unknown status:", result.batch_header.batch_status);
    }
  } catch (error) {
    console.error("Error checking payout status:", error);
  }
}

// Function to load users and track earnings
async function updateEarnings() {
  const querySnapshot = await getDocs(collection(db, "users"));
  const totalUsers = querySnapshot.size;
  const totalEarnings = totalUsers * 100;

  await setDoc(earningsRef, { totalEarnings }, { merge: true });
  document.getElementById("earnings").innerText = `Total Earnings: ${totalEarnings} MK`;
}

async function loadUsers() {
  const querySnapshot = await getDocs(collection(db, "users"));
  const tableBody = document.getElementById('users-table').getElementsByTagName('tbody')[0];
  tableBody.innerHTML = "";

  querySnapshot.forEach((doc) => {
    const { username, email, gender, age, phone, disabled } = doc.data();
    const row = tableBody.insertRow();
    row.innerHTML = `
      <td>${username}</td>
      <td>${email}</td>
      <td>${gender}</td>
      <td>${age}</td>
      <td>${phone}</td>
      <td>${disabled ? 'Disabled' : 'Active'}</td>
      <td>
        ${disabled ? `<button onclick="enableUser('${doc.id}')">Enable</button>` 
          : `<button onclick="disableUser('${doc.id}')">Disable</button>`}
        <button onclick="deleteUserAccount('${doc.id}')">Delete</button>
        <button onclick="resetPassword('${email}')">Reset Password</button>
      </td>
    `;
  });

  updateEarnings();
}

loadUsers();
// After the payout batch has been successfully processed
if (result.batch_header?.payout_batch_id) {
  console.log("Payout Batch Created:", result.batch_header.payout_batch_id);
  alert("Withdrawal successful!");

  // Reset the total earnings to 0 after successful withdrawal
  await updateDoc(earningsRef, { totalEarnings: 0 });

  // Optionally, you can also update the user's individual earnings to 0 (if necessary)
  // await updateDoc(doc(db, 'users', userId), { earnings: 0 });

  // Log the reset and proceed to the next cycle
  console.log("Total earnings have been reset to 0.");
  
  // Call to track the batch status after payout creation
  checkPayoutStatus(result.batch_header.payout_batch_id);
} else {
  alert("Withdrawal failed. Check PayPal dashboard.");
}
