// Configuração do Firebase para React Native/Expo
// Substitua os valores abaixo pelas suas credenciais do Firebase
// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDFOZITJ8YNb8XuIaXZQ_u1yut9xhFF9eE",
  authDomain: "arouca-food.firebaseapp.com",
  projectId: "arouca-food",
  storageBucket: "arouca-food.appspot.com",
  messagingSenderId: "271556033301",
  appId: "1:271556033301:web:0ef7c5d7ca86a9fbc0471c",
  measurementId: "G-F0RK7ZB3CJ"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const db = getFirestore(app);

export { app, analytics, db };  
