# Notification System Design

---

## Stage 1

### Overview

This is the REST API contract for the campus notification platform. Students get notified about Placements, Events and Results when they log in.

---

### Authentication

All endpoints require a Bearer token in the Authorization header.

```
Authorization: Bearer <token>
```

---

### Endpoints

#### 1. Get All Notifications for a Student

```
GET /api/notifications?studentId={studentId}
```

**Headers:**
```json
{
  "Authorization": "Bearer <token>"
}
```

**Response (200):**
```json
{
  "notifications": [
    {
      "id": "uuid",
      "studentId": "RA2311032010063",
      "title": "Placement Drive - TCS",
      "message": "TCS is visiting campus on 10th May",
      "type": "Placement",
      "isRead": false,
      "createdAt": "2026-05-01T10:00:00.000Z"
    }
  ]
}
```

---

#### 2. Get Single Notification

```
GET /api/notifications/:id
```

**Response (200):**
```json
{
  "id": "uuid",
  "studentId": "RA2311032010063",
  "title": "Mid Sem Results",
  "message": "Your mid sem results are out",
  "type": "Result",
  "isRead": false,
  "createdAt": "2026-04-22T17:51:30.000Z"
}
```

**Response (404):**
```json
{ "error": "Notification not found" }
```

---

#### 3. Create Notification

```
POST /api/notifications
```

**Request Body:**
```json
{
  "studentId": "RA2311032010063",
  "title": "Farewell Event",
  "message": "Farewell for 2022 batch on 5th May",
  "type": "Event"
}
```

**Response (201):**
```json
{
  "id": "uuid",
  "studentId": "RA2311032010063",
  "title": "Farewell Event",
  "message": "Farewell for 2022 batch on 5th May",
  "type": "Event",
  "isRead": false,
  "createdAt": "2026-05-02T08:00:00.000Z"
}
```

---

#### 4. Mark Notification as Read

```
PATCH /api/notifications/:id/read
```

**Response (200):**
```json
{
  "id": "uuid",
  "isRead": true
}
```

---

#### 5. Delete Notification

```
DELETE /api/notifications/:id
```

**Response (200):**
```json
{ "message": "Deleted successfully" }
```

---

#### 6. Get Priority Notifications (Top N)

```
GET /api/notifications/priority?n=10
```

**Response (200):**
```json
{
  "notifications": [
    {
      "id": "uuid",
      "type": "Placement",
      "title": "Google Hiring",
      "isRead": false,
      "createdAt": "2026-05-02T10:00:00.000Z"
    }
  ]
}
```

---

### Real-Time Notifications

For real-time delivery, the system uses **WebSockets** via Socket.IO.

- When a student logs in, their client connects to the WebSocket server using their studentId as a room identifier.
- When a new notification is created for a student, the server emits it directly to that student's room.
- If the student is offline, the notification is stored in the DB and delivered on next login.

**Socket Event:**
```
Event: "new_notification"
Payload: { id, title, message, type, createdAt }
```

This avoids polling and gives instant delivery without extra HTTP calls.

---

## Stage 2

### Database Choice: PostgreSQL

PostgreSQL is chosen because:
- Notifications have a fixed, predictable structure (studentId, type, message, isRead, timestamp)
- We need reliable reads with filtering and sorting
- It handles concurrent reads well with proper indexing

---

### DB Schema

```sql
CREATE TABLE students (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(150) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id VARCHAR(50) NOT NULL REFERENCES students(id),
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  type VARCHAR(20) CHECK (type IN ('Placement', 'Event', 'Result')) NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

### SQL Queries for the REST APIs

**Get all unread notifications for a student:**
```sql
SELECT * FROM notifications
WHERE student_id = $1 AND is_read = false
ORDER BY created_at DESC;
```

**Get single notification:**
```sql
SELECT * FROM notifications WHERE id = $1;
```

**Create notification:**
```sql
INSERT INTO notifications (student_id, title, message, type)
VALUES ($1, $2, $3, $4)
RETURNING *;
```

**Mark as read:**
```sql
UPDATE notifications SET is_read = true WHERE id = $1 RETURNING *;
```

**Delete notification:**
```sql
DELETE FROM notifications WHERE id = $1;
```

---

### Problems as Data Grows

| Problem | Impact |
|--------|--------|
| Full table scan on every query | Slow response for large datasets |
| No index on `student_id` or `is_read` | DB reads every row unnecessarily |
| Storing all old notifications forever | Table grows unbounded, queries degrade |
| High read traffic on login | Too many DB hits at the same time |

**Solutions:**
- Add composite index on `(student_id, is_read, created_at)` for the most common query pattern
- Archive or soft-delete old/read notifications older than 90 days
- Add pagination to all list endpoints (`LIMIT` + `OFFSET` or cursor-based)
- Use a read cache (Redis) to avoid hitting DB on every login

---

## Stage 3

### Analyzing the Slow Query

Original query:
```sql
SELECT * FROM notifications
WHERE studentID = 1042 AND isRead = false
ORDER BY createdAt DESC;
```

**Why it is slow:**
- With 5,000,000 rows and no index, the database does a full table scan for every request
- `SELECT *` fetches all columns including large text fields not needed for the notification list
- No `LIMIT` means all matching rows come back at once

**What to change:**
```sql
SELECT id, title, message, type, created_at
FROM notifications
WHERE student_id = 1042 AND is_read = false
ORDER BY created_at DESC
LIMIT 20;
```

**Add this index:**
```sql
CREATE INDEX idx_notifications_student_unread
ON notifications (student_id, is_read, created_at DESC);
```

This index covers all three conditions in the query so the DB skips the full scan entirely.

**Estimated cost difference:**
- Without index: O(n) scan over 5M rows
- With index: O(log n) lookup, only matching rows fetched

---

### Should we index every column?

No. Adding an index on every column is wasteful:
- Each index takes extra disk space
- Every INSERT or UPDATE has to update all indexes, slowing writes
- Only index columns that appear in WHERE, ORDER BY or JOIN conditions frequently

---

### Query: Students who got a Placement notification in last 7 days

```sql
SELECT DISTINCT student_id
FROM notifications
WHERE type = 'Placement'
  AND created_at >= NOW() - INTERVAL '7 days';
```

Add this index to support it:
```sql
CREATE INDEX idx_notifications_type_date
ON notifications (type, created_at DESC);
```

---

## Stage 4

### Problem

Every page load triggers a DB query to fetch notifications for the student. At scale with thousands of simultaneous logins, the DB cannot keep up.

---

### Solutions and Tradeoffs

**Option 1: Redis Cache**

Store each student's notification list in Redis with a short TTL (e.g., 60 seconds).

```
Key: notifications:student:{studentId}
Value: JSON array of notifications
TTL: 60 seconds
```

- Reads hit Redis instead of DB
- On write (new notification), invalidate that student's cache key
- Tradeoff: Student might see stale data for up to 60 seconds. Acceptable for non-critical updates.

**Option 2: Pagination**

Instead of fetching all notifications on load, fetch only the first 10 or 20.

```
GET /api/notifications?studentId=X&page=1&limit=10
```

- Dramatically reduces data transferred per request
- DB query is faster with LIMIT
- Tradeoff: Client needs to handle pagination logic

**Option 3: WebSocket Push**

Stop fetching on page load entirely. Push new notifications to connected clients via WebSocket.

- Client only fetches once on first login, then receives updates via socket
- No repeated polling
- Tradeoff: More complex server setup, need to manage socket connections

**Recommended approach:** Use all three together — cache for read speed, pagination for data size, WebSockets for real-time updates.

---

## Stage 5

### Problem with the Original Implementation

```
function notify_all(student_ids: array, message: string):
    for student_id in student_ids:
        send_email(student_id, message)   # calls Email API
        save_to_db(student_id, message)   # DB insert
        push_to_app(student_id, message)  # real-time push
```

Issues:
- Running this in a loop for 50,000 students blocks the server
- If `send_email` fails midway (it failed for 200 students), the loop stops and those students get nothing
- No retry mechanism for failures
- Doing email + DB + push all synchronously is very slow
- If the server restarts mid-loop, we lose track of progress

---

### Redesigned Approach

Use a **message queue (e.g., BullMQ with Redis or RabbitMQ)**:

```
function notify_all(student_ids: array, message: string):
    for student_id in student_ids:
        enqueue_job("notification_job", { student_id, message })
```

Each worker then processes one job at a time:

```
worker.process("notification_job", async (job):
    student_id = job.data.student_id
    message = job.data.message

    save_to_db(student_id, message)       # save first, always
    push_to_app(student_id, message)      # real-time push

    try:
        send_email(student_id, message)
    catch error:
        log_error(student_id, error)
        retry_job(job, max_retries=3)     # retry only email, not db write
```

**Should DB save and email happen together?**

No. They should be separate steps:
- DB save must always succeed first — it is the source of truth
- Email is a side effect and can fail or be retried without affecting the DB record
- Combining them in a transaction means a failed email rolls back the DB write, which is wrong

**Revised Pseudocode:**

```
function notify_all(student_ids: array, message: string):
    for student_id in student_ids:
        enqueue("save_and_push", { student_id, message })
        enqueue("send_email", { student_id, message })

worker "save_and_push":
    save_to_db(student_id, message)
    push_to_app(student_id, message)

worker "send_email":
    try:
        send_email(student_id, message)
    catch:
        retry up to 3 times with exponential backoff
        if still failing: mark as failed in DB, alert admin
```

This way:
- All 50,000 jobs are queued instantly
- Workers process them in parallel
- Email failures do not block DB writes
- Failed jobs are retried automatically
- The server can restart without losing jobs (queue is persistent)

---

## Stage 6

### Priority Inbox — Top N Notifications

**Approach:**

Priority is calculated using two factors:
1. **Type weight** — Placement (3) > Result (2) > Event (1)
2. **Recency** — more recent notifications score higher within the same type

**Sorting logic:**

```
score = typeWeight[type] combined with timestamp
sort descending by weight first, then by createdAt
take first N results
```

**How to handle new notifications coming in efficiently:**

Use a **max-heap (priority queue)** of size N.

- When a new notification arrives, compare it with the smallest item in the heap
- If it has higher priority, remove the smallest and insert the new one
- This keeps the heap at size N at all times
- Insertion cost: O(log N) per new notification
- Much faster than re-sorting the full list every time

**Implementation:** See `notification_app_be/src/services/notification.service.ts` — `fetchTopPriority()` function.

The current implementation sorts unread notifications by weight and timestamp, then slices the top N. For production with streaming data, this would be replaced with a heap-based approach using a library like `heap-js`.
