import { firebase } from '@react-native-firebase/app';
import firestore from '@react-native-firebase/firestore';

// Use getApp() to avoid namespaced API warnings if needed, 
// but usually firestore() is fine if the import is correct.
const db = firestore();

// Enable offline persistence using the newer syntax pattern
// The warning suggests using settings() as a function that might return/set
db.settings({
  persistence: true,
  cacheSizeBytes: firestore.CACHE_SIZE_UNLIMITED,
});

export { firebase, db };
export default db;
