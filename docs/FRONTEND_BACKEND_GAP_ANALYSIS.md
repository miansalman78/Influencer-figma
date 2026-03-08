# Frontend–Backend Gap Analysis

This document lists places where the React Native frontend and Node/Express backend are **not linked** or where data **does not persist** as expected.

---

## 1. Not linked (frontend calls missing or mismatched backend)

### 1.1 Send Offer to Brand – **FIXED**

| Frontend | Backend |
|----------|---------|
| `services/offers.js`: `sendOfferToBrand(offerId, brandId, message)` → **POST** `/offers/send-to-brand` | **POST** `/offers/send-to-brand` (creator-only); creates **notification** for brand with type `offer_sent` and `data: { offerId, brandId, creatorId, message }`. |

- **Fix applied:** Backend route added; `offerController.sendOfferToBrand` validates offer (creator-owned) and brand, then `createNotification` for the brand. Notification type `offer_sent` added to `Notification` model. Brand sees it in Notifications and can open the offer.

---

### 1.2 Create Earning Transaction – **FIXED**

| Frontend | Backend |
|----------|---------|
| `services/transactions.js`: `createEarningTransaction(body)` → **POST** `/wallet/transactions/earning` with optional `{ orderId, creatorId, brandId, amount, description?, currency? }` | **POST** `/wallet/transactions/earning` in `routes/wallet.js` (brand/admin; body required for creation). |

- **Fix applied:** Frontend now uses **POST** and accepts an optional body. Backend expects full body when called (typically used server-side when order completes).

---

### 1.3 Messages / chat – **Backend not used for message content**

| Frontend | Backend |
|----------|---------|
| `services/chat.js`: all messaging via **Firebase Firestore** (conversations, send message, subscribe, mark read) | `routes/messages.js`: only **GET** `/messages/token` (Firebase custom token placeholder) |

- **Effect:** Conversations and message content **do not persist on your backend**. They live only in Firebase. Backend has no REST API for listing conversations, sending messages, or marking read.
- **Design choice:** If the product is “Firebase-only chat,” this is intentional. If you want messages stored and queryable on your API, you need backend conversation/message models and routes, and the app would need to call them instead of (or in addition to) Firestore.

---

### 1.4 Firebase chat token – **Placeholder only**

| Frontend | Backend |
|----------|---------|
| No frontend code calls **GET** `/messages/token` | `routes/messages.js`: `generateFirebaseToken(userId)` returns a **placeholder** string, not a real Firebase Admin custom token |

- **Effect:** If the app ever starts using this endpoint for secure Firebase chat auth, it would get an invalid token. Real integration requires Firebase Admin SDK and `admin.auth().createCustomToken(uid)`.
- **Fix:** Implement token generation with Firebase Admin SDK when you need server-side chat auth.

---

## 2. Response shape / persistence mismatches

### 2.1 Upload – multiple images/documents response shape – **FIXED**

| Frontend | Backend |
|----------|---------|
| `services/upload.js`: `uploadImages()` / `uploadDocuments()` normalize response to include both `data.files` and `data.urls`. | `uploadController`: returns `data: { files, urls: files.map(f => f.url), count }` for both multiple images and multiple documents. |

- **Fix applied:** Backend now sends `urls` array; frontend derives `urls` from `files` when missing and returns a consistent shape so callers can use either `data.files` or `data.urls`.

---

### 2.2 Profile / auth – two profile sources

| Frontend | Backend |
|----------|---------|
| Full profile: **GET** `/user/profile` (`user.js` → `profileController.getOwnProfile`) | Implemented and used |
| Auth context: **POST** `/auth/login` and **POST** `/auth/signup`; token/user from `response.data` | `authController` returns `{ data: { user, token } }` |

- **Note:** Auth flow is aligned (AuthContext uses `response.data.data.token` / `response.data.data.user`). Profile update and social media links now persist (including `socialMedia` on User) after the recent backend fix. No change needed unless you introduce another profile endpoint.

---

### 2.3 Reviews – getUserReviews path

| Frontend | Backend |
|----------|---------|
| `services/reviews.js`: **GET** `/reviews/user/${userId}?page&limit&type` | **GET** `/reviews/user/:userId` with `validatePagination` |

- **Status:** Path and query params match. No gap.

---

## 3. Persistence and data flow summary

| Area | Persists on backend? | Notes |
|------|----------------------|--------|
| Auth (signup, login, OAuth) | Yes | Token and user stored; profile from `/user/profile` |
| User profile (bio, location, socialMedia, etc.) | Yes | PUT `/user/profile` and GET profile include `socialMedia` |
| Social OAuth (connect/sync) | Yes | Stored in `User.socialAccounts`; profile returns platformReach |
| Notifications | Yes | Notifications API and creator activities used by frontend |
| Campaigns, proposals, orders | Yes | CRUD and actions wired |
| Offers (create, update, publish, purchase) | Yes | Send-to-brand is the only missing route |
| Payments (Stripe, PayPal, direct, etc.) | Yes | Controllers and routes in place |
| Wallet & transactions | Yes | Create earning: fix frontend method (GET → POST) and body if needed |
| Portfolio | Yes | Under `/user/profile/portfolio` |
| Upload (image/document) | Yes | Cloudinary via backend; fix multi-image response usage |
| Messages / chat | No (backend) | Firebase only; backend has no conversation/message storage |
| Categories, services, location | Yes | Used by frontend where implemented |

---

## 4. Recommended fix order

1. **Send to brand:** Add **POST** `/offers/send-to-brand` and implement logic (e.g. create conversation or notification for the brand).
2. **Transactions:** In `services/transactions.js`, call **POST** `/wallet/transactions/earning` with the body expected by `createEarningTransactionAPI` (if the frontend is supposed to create earnings manually; otherwise remove or repurpose the frontend function).
3. **Upload:** Use `data.files` (and optionally add `data.urls`) so list uploads work consistently.
4. **Messages (optional):** If you want chat on your backend, add conversation/message models and REST endpoints and switch (or mirror) the app from Firestore to those APIs.
5. **Firebase token (optional):** When you need it, implement real custom token generation in **GET** `/messages/token` with Firebase Admin SDK.

---

## 5. Stripe – SDK usage

- **Frontend:** Card tokenization and 3DS use **`@stripe/stripe-react-native`** only: `StripeProvider` (in `App.tsx`), `useStripe()`, `CardField`, `createPaymentMethod`, and `handleNextAction` in `AddCardModal.js`, `DirectPayModal.js`, and `CheckoutScreen.js`. No raw Stripe REST calls from the app.
- **Backend:** Uses the official **Stripe Node SDK** (`require('stripe')(process.env.STRIPE_SECRET_KEY)`) for PaymentIntents, customers, refunds, and webhooks. No raw HTTP calls to Stripe.

---

## 6. Quick reference – frontend API usage

- **Base URL:** Same for both: `API_CONFIG.BASE_URL` (e.g. `https://.../api`). Used by `apiRequest()` in `services/api.js` and by `apiClient` (axios) in `services/apiClient.js`.
- **Auth:** Token attached by `apiRequest` (AsyncStorage / in-memory) and by `apiClient` interceptors. Both use the same storage key for the token.
- **Profile:** Main profile and portfolio use **`/user/profile`** (profileController). Auth uses **`/auth/*`** for login/signup/OAuth only.
