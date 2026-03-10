# Notifications Module – Backend

## What’s implemented

- **Model:** `Notification` (userId, type, title, body, data, read, actorId, timestamps).
- **API:**
  - `GET /api/notifications` – list (paginated), query: `page`, `limit`, `read` (true/false).
  - `GET /api/notifications/unread-count` – unread count for current user.
  - `PATCH /api/notifications/:id/read` – mark one as read.
  - `PATCH /api/notifications/read-all` – mark all as read.
- **Triggers:** Notifications are created when:
  - Proposal submitted → brand gets “New proposal received”.
  - Proposal accepted → creator gets “Your proposal was accepted”.
  - Proposal rejected → creator gets “Proposal not accepted”.
  - Deliverables submitted → brand gets “Deliverables submitted”.
  - Deliverables approved / order completed → creator gets “Order completed”.
  - Order paid (Stripe or PayPal) → creator gets “Order paid”.

All notification routes require **authentication** (Bearer token).

---

## What you need to provide

### 1. Nothing extra for basic in‑app notifications

- No new env vars.
- No new secrets or API keys.
- Uses your existing **MongoDB** and **JWT auth**.

Just run the API as usual; notifications are stored in MongoDB and returned by the endpoints above.

---

### 2. (Optional) Push notifications later

If you later add **push notifications** (FCM):

- **Firebase project:** Create (or use existing) at [Firebase Console](https://console.firebase.google.com).
- **FCM server key / service account:**  
  Project Settings → Service accounts → Generate new private key (or use Cloud Messaging server key if you use legacy HTTP API).
- **Backend:** Store FCM device tokens per user (e.g. new field or collection) and send a push when you call `createNotification`. No change to the notification model is required; you only add a call to FCM after creating the in‑app notification.

---

## How to get / check things

| Need | How |
|------|-----|
| **MongoDB** | Already in use. Notifications go in the same DB; collection name is derived from the model (e.g. `notifications`). |
| **Auth** | Same as rest of API. Send `Authorization: Bearer <token>` for all notification endpoints. |
| **Test list** | `GET /api/notifications?page=1&limit=20` with a valid token. |
| **Test unread count** | `GET /api/notifications/unread-count` with a valid token. |

---

## Notification types (for app deep links)

Use `data` on each notification for routing:

- `proposal_submitted` – data: `campaignId`, `proposalId`.
- `proposal_accepted` – data: `campaignId`, `proposalId`, `orderId`.
- `proposal_rejected` – data: `campaignId`, `proposalId`.
- `order_paid`, `order_completed`, `order_deliverables_submitted` – data: `orderId`.

The app can open Campaign Details, Proposal, or Order Details from these.
