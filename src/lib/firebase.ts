import { initializeApp } from 'firebase/app'
import { getAuth, setPersistence, browserSessionPersistence } from 'firebase/auth'

/**
 * The same Blorbmart project every other app signs into.
 *
 * There is no separate admin user pool: an administrator is an ordinary
 * Firebase account with `role: 'admin'` on their user document, which is what
 * `requireAdmin` on the server checks. That keeps one identity per person
 * rather than a second set of credentials nobody rotates.
 */
const firebaseConfig = {
  apiKey: 'AIzaSyAGGDTIx4YY8_7cwuPBDkJV-plZpr-IhWs',
  authDomain: 'blorbmart-b29b7.firebaseapp.com',
  projectId: 'blorbmart-b29b7',
  storageBucket: 'blorbmart-b29b7.firebasestorage.app',
  messagingSenderId: '840596799490',
  appId: '1:840596799490:web:b4b2e30afc4efedbe6671b',
}

export const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)

/**
 * Session persistence, not local.
 *
 * This console can suspend a vendor, refund an order and mark a payout
 * settled. Closing the browser should end that authority rather than leave it
 * sitting in localStorage on a shared or unattended machine — the cost is one
 * sign-in per session, which is the right trade for what these credentials do.
 */
setPersistence(auth, browserSessionPersistence).catch(() => {
  /* Private-mode browsers reject this; auth still works in-memory. */
})
