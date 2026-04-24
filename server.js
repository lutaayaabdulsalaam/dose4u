
  // Import the functions you need from the SDKs you need
  import { initializeApp } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js";
  import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-analytics.js";
  // TODO: Add SDKs for Firebase products that you want to use
  // https://firebase.google.com/docs/web/setup#available-libraries

  // Your web app's Firebase configuration
  // For Firebase JS SDK v7.20.0 and later, measurementId is optional
  const firebaseConfig = {
    apiKey: "AIzaSyDVP4umc2k6eymoQz5R5oWF9RiCRQ9VqlE",
    authDomain: "dose4u-b6085.firebaseapp.com",
    projectId: "dose4u-b6085",
    storageBucket: "dose4u-b6085.firebasestorage.app",
    messagingSenderId: "22806799455",
    appId: "1:22806799455:web:0bd56d584622b1d31127ea",
    measurementId: "G-M808P3TLKL"
  };

  // Initialize Firebase
  const app = initializeApp(firebaseConfig);
  const analytics = getAnalytics(app);
