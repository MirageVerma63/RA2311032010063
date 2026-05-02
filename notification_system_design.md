# Notification System Design

## Stage 1

A frontend developer asked me to design the REST API for the campus notification platform. Students should be able to see their notifications (placements, events, results) when they log in.

Here's what I came up with:

---

All API calls need an Authorization header like this:
```
Authorization: Bearer <token>
```

---

**Get notifications for a student**
```
GET /api/notifications?studentId={studentId}
```

Response:
```json
{
  "notifications": [
    {
      "id": "uuid",
      "studentId": "RA2311032010063",
      "title": "TCS Placement Drive",
      "message": "TCS is visiting campus on 10th May",
      "type": "Placement",
      "isRead": false,
      "createdAt": "2026-05-01T10:00:00.000Z"
    }
  ]
}
```

---

**Get a single notification**
```
GET /api/notifications/:id
```

Response if not found:
```json
{ "error": "Notification not found" }
```

---

**Create a notification**
```
POST /api/notifications
```

Body:
```json
{
  "studentId": "RA2311032010063",
  "title": "Farewell",
  "message": "Farewell for 2022 batch on 5th May",
  "type": "Event"
}
```

---

**Mark as read**
```
PATCH /api/notifications/:id/read
```

---

**Delete a notification**
```
DELETE /api/notifications/:id
```

---

**Get top N priority notifications**
```
GET /api/notifications/priority?n=10
```

---

**Real time notifications**

I went with WebSockets for this. When a student logs in, they connect to the socket server with their studentId. If a new notification comes in for them, the server pushes it directly to their connection. This way there's no need to keep refreshing or polling.

If the student is offline, the notification just sits in the DB and they get it next time they log in.

Socket event looks like:
```
Event: "new_notification"
Data: { id, title, message, type, createdAt }
```

---

## Stage 2

For the database I went with PostgreSQL. The notification data is pretty structured - we always know the fields ahead of time, and we need to filter and sort by multiple columns. PostgreSQL handles that well.

**Schema:**

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

**Queries for each API:**

Get all unread for a student:
```sql
SELECT * FROM notifications
WHERE student_id = $1 AND is_read = false
ORDER BY created_at DESC;
```

Create:
```sql
INSERT INTO notifications (student_id, title, message, type)
VALUES ($1, $2, $3, $4)
RETURNING *;
```

Mark as read:
```sql
UPDATE notifications SET is_read = true WHERE id = $1 RETURNING *;
```

Delete:
```sql
DELETE FROM notifications WHERE id = $1;
```

**Problems that will come up as data grows:**

The main issue is that without proper indexes, every query will scan the whole table. With 50,000 students and millions of notifications that gets slow fast. Also storing old read notifications forever will bloat the table. Pagination is another thing that needs to be added since returning all notifications at once doesn't scale.

Fix is to add proper indexes, paginate responses, and archive old data after a few months.

---

## Stage 3

The slow query:
```sql
SELECT * FROM notifications
WHERE studentID = 1042 AND isRead = false
ORDER BY createdAt DESC;
```

This is slow because there's no index on studentID or isRead, so the DB scans every single row in the table. With 5 million rows that's a problem. Also SELECT * is pulling all columns when we probably only need a few.

Better version:
```sql
SELECT id, title, message, type, created_at
FROM notifications
WHERE student_id = 1042 AND is_read = false
ORDER BY created_at DESC
LIMIT 20;
```

And add this index:
```sql
CREATE INDEX idx_student_unread
ON notifications (student_id, is_read, created_at DESC);
```

With this index the DB goes straight to the matching rows instead of scanning everything. Huge difference.

**Should we index every column?**

No, that's not a good idea. Every index takes up disk space and slows down inserts and updates because all indexes need to be updated too. Only index the columns you actually filter or sort by.

**Find students who got a placement notification in last 7 days:**
```sql
SELECT DISTINCT student_id
FROM notifications
WHERE type = 'Placement'
  AND created_at >= NOW() - INTERVAL '7 days';
```

---

## Stage 4

The problem here is that every time a student opens the app, it hits the DB. At peak times with thousands of students logging in at once, the DB gets overwhelmed.

A few things that can help:

**Caching with Redis** - store each student's notifications in Redis for 60 seconds. Most students won't get new notifications every minute so this works fine. When a new notification is created, just clear that student's cache. Downside is data can be 60 seconds stale.

**Pagination** - instead of loading all notifications at once, load 10 or 20 at a time. Smaller queries, faster responses.

**WebSocket push** - stop fetching on page load entirely. Student loads once and then gets pushed updates. This is the cleanest solution but takes more work to set up.

Honestly using all three together is the right move for production.

---

## Stage 5

The original code does this for 50,000 students:
```
for each student:
    send_email()
    save_to_db()
    push_to_app()
```

Problems with this:
- It runs one student at a time, very slow
- If send_email fails halfway through, the remaining students get nothing
- No way to retry failed emails
- If server crashes midway, no way to know where it stopped

Better approach is to use a job queue like BullMQ. Instead of doing everything in the loop, just add jobs to the queue and let workers handle them:

```
for each student:
    add job to queue

worker picks up job:
    save_to_db()        <- do this first always
    push_to_app()
    try send_email()
    if email fails: retry 3 times, then mark as failed
```

Should DB save and email happen together in a transaction? No. DB save should always go through. Email is just a side effect - if it fails we retry it separately. Rolling back the DB write because email failed would mean the student loses their notification entirely which is worse.

---

## Stage 6

For the priority inbox I sorted notifications using two things - the type and how recent it is.

Placement is most important, then Result, then Event. Within the same type, newer ones come first.

```
Placement = weight 3
Result = weight 2
Event = weight 1

sort by weight first, then by timestamp
take top N
```

For handling new notifications coming in without re-sorting the whole list every time, a max-heap of size N works well. When a new notification arrives, compare it with the lowest priority item in the heap. If it's more important, swap it in. This keeps the top N updated in O(log N) time instead of re-sorting everything.

The code for this is in `notification_app_be/src/services/notification.service.ts` in the `fetchTopPriority` function.