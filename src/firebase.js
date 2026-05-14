import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore, enableIndexedDbPersistence } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBvuM19wOGLqtrw5QhG7tyqQRAJ-8jUAUc",
  authDomain: "presupuesto-familiar-f3d0a.firebaseapp.com",
  projectId: "presupuesto-familiar-f3d0a",
  storageBucket: "presupuesto-familiar-f3d0a.firebasestorage.app",
  messagingSenderId: "364554557392",
  appId: "1:364554557392:web:7a503af9d21f8b09d58bd5"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Offline persistence — guarda en el dispositivo y sincroniza al volver la conexión
enableIndexedDbPersistence(db).catch((err) => {
  if (err.code === "failed-precondition") {
    console.warn("Persistencia offline no disponible: múltiples tabs abiertas");
  } else if (err.code === "unimplemented") {
    console.warn("El navegador no soporta persistencia offline");
  }
});
