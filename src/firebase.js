// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth } from "firebase/auth";

// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBHgIDnNCR4CqA4PrY74K1Wz7-p1F3HLIo",
  authDomain: "darkspark-83550.firebaseapp.com",
  projectId: "darkspark-83550",
  storageBucket: "darkspark-83550.appspot.com",
  messagingSenderId: "280329930795",
  appId: "1:280329930795:web:a0c08789092603d7c0026e",
  measurementId: "G-34TL5ZZV52"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const auth = getAuth(app);


export {app, analytics, auth};



