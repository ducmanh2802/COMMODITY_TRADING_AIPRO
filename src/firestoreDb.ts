import { getFirestore } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import { app } from './firebase';

/**
 * Firestore instance. This module statically imports `firebase/firestore`, so it must only be
 * reached from lazy chunks or via `getFirestoreModules()` — never from the main entry chunk.
 */
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
