# Security Specification - Phonogram Flashcards

This security specification details the access control constraints for our Firebase Firestore database to protect user profiles, card tracking data, and practice history.

## Data Invariants

1.  **Strict Owner Ownership**:
    A user can only read, create, update, or delete their own data under the `/users/{userId}/` path hierarchy. Accessing other users' paths is strictly forbidden.
2.  **Verified Email Requirement**:
    To prevent bot manipulation, users must be signed in with a verified email account (`request.auth.token.email_verified == true`).
3.  **Strict Schema Validation**:
    Any status must be one of the four defined values: `Not Known`, `Needs Work`, `Known`, or `Remove`.
4.  **Temporal Integrity**:
    All timestamp updates (`updatedAt` and `endTime`) must be tied directly to the server's authoritative clock (`request.time`).
5.  **Immutable IDs**:
    The document paths use structured user and card/session IDs that cannot contain arbitrary, malicious payloads.

---

## The "Dirty Dozen" Payloads

Here are 12 specific payloads or actions designed to breach the database's rules and how the validator protects them.

| # | Target Path | Payload / Action Description | Intended Outcome | Protection Mechanism |
|---|-------------|------------------------------|------------------|----------------------|
| 1 | `/users/userABC/cards/a` | Read card status of `userABC` as `userXYZ` | **REJECTED** | Check `request.auth.uid == userId` |
| 2 | `/users/userABC/cards/a` | Write card status without being signed in | **REJECTED** | Check `request.auth != null` |
| 3 | `/users/userABC/cards/a` | Write card status with unverified email | **REJECTED** | Check `request.auth.token.email_verified == true` |
| 4 | `/users/userABC/cards/a` | Write a card status set to `"Mastered"` (invalid enum) | **REJECTED** | Define valid status enum values in custom helper |
| 5 | `/users/userABC/cards/a` | Write a status payload containing a ghost/shadow field `cheat: true` | **REJECTED** | Keys checklist check: `keys().hasAll()` and exact size checks |
| 6 | `/users/userABC/cards/a` | Update card status but change the immutable parent node (hijack path) | **REJECTED** | Check document IDs matches format `isValidId` and keys immutable |
| 7 | `/users/userABC/cards/malicious-long-card-id-string-with-1000-chars` | Create card document with an arbitrarily long, poisoned ID string | **REJECTED** | Validate document ID matches safe regex length <= 128 |
| 8 | `/users/userABC/sessions/sess1` | Create session with `startTime` set to a future date in the client's payload | **REJECTED** | Check `incoming().startTime == request.time` or `incoming().endTime == request.time` |
| 9 | `/users/userABC/sessions/sess1` | Delete another user's practice session history | **REJECTED** | Check `request.auth.uid == userId` |
| 10 | `/users/userABC/sessions/sess1` | Update the `score` field of an already ended session | **REJECTED** | Block any update to a finished session unless it matches specific state change rules, or default lock completed sessions |
| 11 | `/users/userABC/sessions/sess1` | Write a session payload with a negative `cardCount` value | **REJECTED** | Range limits validation `incoming().cardCount >= 0` |
| 12 | `/users/userABC/cards/a` | Set card status to null or empty string | **REJECTED** | Validate fields are proper types (`is string`) and size is not empty |

---

## Security Implementation Plan

We will create a rigid `firestore.rules` containing explicit Match blocks, global verification primitives, schema helpers, and strict ownership checks. Let's draft this next.
