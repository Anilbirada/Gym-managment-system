require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('./db');
const { requireAuth, requireRole } = require('./auth');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected' });
  } catch {
    res.status(503).json({ status: 'error', database: 'unavailable' });
  }
});

app.post('/api/auth/login', async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });
    const [rows] = await pool.execute(
      'SELECT id, name, email, password_hash, role, phone, status FROM users WHERE email = ? LIMIT 1',
      [email],
    );
    const user = rows[0];
    if (!user || user.status !== 'active' || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Email or password is incorrect.' });
    }
    const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET || 'local-only-change-me', { expiresIn: '7d' });
    delete user.password_hash;
    res.json({ token, user });
  } catch (error) {
    next(error);
  }
});

app.get('/api/me', requireAuth, async (req, res, next) => {
  try {
    const [rows] = await pool.execute(
      `SELECT u.id, u.name, u.email, u.role, u.phone, u.status,
              m.id AS membership_id, m.start_date, m.end_date, m.status AS membership_status,
              p.name AS plan_name, p.price AS plan_price
       FROM users u LEFT JOIN memberships m ON m.user_id = u.id AND m.status = 'active'
       LEFT JOIN plans p ON p.id = m.plan_id WHERE u.id = ? LIMIT 1`,
      [req.user.id],
    );
    if (!rows[0]) return res.status(404).json({ error: 'Account not found.' });
    res.json(rows[0]);
  } catch (error) {
    next(error);
  }
});

app.get('/api/dashboard', requireAuth, async (req, res, next) => {
  try {
    if (req.user.role === 'admin') {
      const [[memberCount]] = await pool.query("SELECT COUNT(*) AS total FROM users WHERE role = 'member' AND status = 'active'");
      const [[classCount]] = await pool.query('SELECT COUNT(*) AS total FROM fitness_classes WHERE starts_at >= NOW()');
      const [[attendanceCount]] = await pool.query('SELECT COUNT(*) AS total FROM attendance WHERE DATE(checked_in_at) = CURDATE()');
      const [[revenue]] = await pool.query("SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE status = 'paid' AND MONTH(paid_at) = MONTH(CURDATE()) AND YEAR(paid_at) = YEAR(CURDATE())");
      return res.json({ role: 'admin', members: memberCount.total, upcomingClasses: classCount.total, checkInsToday: attendanceCount.total, monthlyRevenue: revenue.total });
    }
    const [[membership]] = await pool.execute(
      `SELECT p.name AS plan, m.end_date AS renewsOn FROM memberships m
       JOIN plans p ON p.id = m.plan_id WHERE m.user_id = ? AND m.status = 'active' ORDER BY m.end_date DESC LIMIT 1`,
      [req.user.id],
    );
    const [[visits]] = await pool.execute('SELECT COUNT(*) AS total FROM attendance WHERE user_id = ? AND checked_in_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)', [req.user.id]);
    const [[upcoming]] = await pool.execute("SELECT COUNT(*) AS total FROM bookings b JOIN fitness_classes c ON c.id = b.class_id WHERE b.user_id = ? AND b.status = 'booked' AND c.starts_at >= NOW()", [req.user.id]);
    return res.json({ role: req.user.role, membership: membership || null, visitsThisMonth: visits.total, upcomingBookings: upcoming.total });
  } catch (error) {
    next(error);
  }
});

app.get('/api/members', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const search = `%${String(req.query.search || '').trim()}%`;
    const [rows] = await pool.execute(
      `SELECT u.id, u.name, u.email, u.phone, u.status, m.end_date AS membership_end,
              m.status AS membership_status, p.name AS plan_name
       FROM users u LEFT JOIN memberships m ON m.user_id = u.id AND m.status IN ('active', 'paused')
       LEFT JOIN plans p ON p.id = m.plan_id
       WHERE u.role = 'member' AND (u.name LIKE ? OR u.email LIKE ?)
       ORDER BY u.created_at DESC LIMIT 100`, [search, search],
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

app.post('/api/members', requireAuth, requireRole('admin'), async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    const { name, email, phone = '', planId = 1 } = req.body;
    if (!name?.trim() || !email?.trim()) return res.status(400).json({ error: 'Name and email are required.' });
    const passwordHash = await bcrypt.hash('Welcome123!', 10);
    await connection.beginTransaction();
    const [created] = await connection.execute(
      "INSERT INTO users (name, email, password_hash, role, phone) VALUES (?, ?, ?, 'member', ?)",
      [name.trim(), email.trim().toLowerCase(), passwordHash, phone],
    );
    const [[plan]] = await connection.execute('SELECT duration_days FROM plans WHERE id = ? AND active = TRUE', [planId]);
    if (!plan) throw Object.assign(new Error('Selected membership plan is unavailable.'), { status: 400 });
    await connection.execute(
      "INSERT INTO memberships (user_id, plan_id, start_date, end_date) VALUES (?, ?, CURDATE(), DATE_ADD(CURDATE(), INTERVAL ? DAY))",
      [created.insertId, planId, plan.duration_days],
    );
    await connection.commit();
    res.status(201).json({ id: created.insertId, name: name.trim(), email: email.trim().toLowerCase(), status: 'active', plan_id: planId });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
});

app.patch('/api/members/:id/status', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const status = req.body.status === 'inactive' ? 'inactive' : 'active';
    const [result] = await pool.execute("UPDATE users SET status = ? WHERE id = ? AND role = 'member'", [status, req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ error: 'Member not found.' });
    res.json({ id: Number(req.params.id), status });
  } catch (error) {
    next(error);
  }
});

app.get('/api/plans', requireAuth, async (_req, res, next) => {
  try {
    const [rows] = await pool.execute('SELECT id, name, price, duration_days AS durationDays, description FROM plans WHERE active = TRUE ORDER BY price');
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

app.get('/api/classes', requireAuth, async (_req, res, next) => {
  try {
    const [rows] = await pool.execute(
      `SELECT c.id, c.title, c.category, c.starts_at AS startsAt, c.duration_minutes AS durationMinutes,
              c.capacity, c.room, u.name AS trainer,
              (SELECT COUNT(*) FROM bookings b WHERE b.class_id = c.id AND b.status = 'booked') AS booked
       FROM fitness_classes c LEFT JOIN users u ON u.id = c.trainer_id
       WHERE c.starts_at >= DATE_SUB(NOW(), INTERVAL 1 DAY) ORDER BY c.starts_at LIMIT 100`,
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

app.post('/api/classes', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const { title, category, trainerId = null, startsAt, durationMinutes = 45, capacity = 16, room = 'Studio A' } = req.body;
    if (!title?.trim() || !category?.trim() || !startsAt) return res.status(400).json({ error: 'Class name, category, and start time are required.' });
    const [result] = await pool.execute(
      'INSERT INTO fitness_classes (title, category, trainer_id, starts_at, duration_minutes, capacity, room) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [title.trim(), category.trim(), trainerId, startsAt, durationMinutes, capacity, room],
    );
    res.status(201).json({ id: result.insertId, title, category, startsAt, capacity, room });
  } catch (error) {
    next(error);
  }
});

app.get('/api/bookings', requireAuth, async (req, res, next) => {
  try {
    const memberId = req.user.role === 'admin' && req.query.memberId ? req.query.memberId : req.user.id;
    const [rows] = await pool.execute(
      `SELECT b.id, b.status, c.id AS class_id, c.title, c.category, c.starts_at AS startsAt, c.room
       FROM bookings b JOIN fitness_classes c ON c.id = b.class_id WHERE b.user_id = ? ORDER BY c.starts_at`,
      [memberId],
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

app.post('/api/bookings', requireAuth, async (req, res, next) => {
  try {
    const classId = Number(req.body.classId);
    if (!classId) return res.status(400).json({ error: 'Choose a class to book.' });
    const [[fitnessClass]] = await pool.execute('SELECT capacity, starts_at FROM fitness_classes WHERE id = ?', [classId]);
    if (!fitnessClass || new Date(fitnessClass.starts_at) < new Date()) return res.status(404).json({ error: 'This class is no longer available.' });
    const [[count]] = await pool.execute("SELECT COUNT(*) AS total FROM bookings WHERE class_id = ? AND status = 'booked'", [classId]);
    if (count.total >= fitnessClass.capacity) return res.status(409).json({ error: 'This class is full.' });
    const [result] = await pool.execute('INSERT INTO bookings (class_id, user_id) VALUES (?, ?)', [classId, req.user.id]);
    res.status(201).json({ id: result.insertId, classId, status: 'booked' });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'You already have a spot in this class.' });
    next(error);
  }
});

app.delete('/api/bookings/:id', requireAuth, async (req, res, next) => {
  try {
    const [result] = await pool.execute("UPDATE bookings SET status = 'cancelled' WHERE id = ? AND user_id = ? AND status = 'booked'", [req.params.id, req.user.id]);
    if (!result.affectedRows) return res.status(404).json({ error: 'Booking not found.' });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.post('/api/attendance', requireAuth, async (req, res, next) => {
  try {
    const memberId = req.user.role === 'admin' && req.body.userId ? req.body.userId : req.user.id;
    const [[recent]] = await pool.execute('SELECT id FROM attendance WHERE user_id = ? AND checked_in_at >= CURDATE() LIMIT 1', [memberId]);
    if (recent) return res.status(409).json({ error: 'You are already checked in today.' });
    const [result] = await pool.execute('INSERT INTO attendance (user_id, source) VALUES (?, ?)', [memberId, req.user.role === 'admin' ? 'admin' : 'mobile']);
    res.status(201).json({ id: result.insertId, checkedInAt: new Date().toISOString() });
  } catch (error) {
    next(error);
  }
});

app.get('/api/attendance', requireAuth, async (req, res, next) => {
  try {
    const memberId = req.user.role === 'admin' && req.query.memberId ? req.query.memberId : req.user.id;
    const [rows] = await pool.execute('SELECT id, checked_in_at AS checkedInAt, source FROM attendance WHERE user_id = ? ORDER BY checked_in_at DESC LIMIT 30', [memberId]);
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

app.get('/api/payments', requireAuth, async (req, res, next) => {
  try {
    const memberId = req.user.role === 'admin' ? req.query.memberId : req.user.id;
    const [rows] = memberId
      ? await pool.execute('SELECT p.id, u.name, p.amount, p.currency, p.status, p.paid_at AS paidAt, p.reference FROM payments p JOIN users u ON u.id = p.user_id WHERE p.user_id = ? ORDER BY p.paid_at DESC LIMIT 50', [memberId])
      : await pool.execute('SELECT p.id, u.name, p.amount, p.currency, p.status, p.paid_at AS paidAt, p.reference FROM payments p JOIN users u ON u.id = p.user_id ORDER BY p.paid_at DESC LIMIT 50');
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

app.post('/api/payments', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const amount = Number(req.body.amount);
    const currency = String(req.body.currency || 'USD').toUpperCase();
    if (!email || !Number.isFinite(amount) || amount <= 0 || !/^[A-Z]{3}$/.test(currency)) {
      return res.status(400).json({ error: 'Enter a member email and a valid payment amount.' });
    }
    const [[member]] = await pool.execute("SELECT id, name FROM users WHERE email = ? AND role = 'member'", [email]);
    if (!member) return res.status(404).json({ error: 'Member account not found.' });
    const reference = `MAN-${Date.now()}`;
    const [result] = await pool.execute(
      "INSERT INTO payments (user_id, amount, currency, status, paid_at, reference) VALUES (?, ?, ?, 'paid', NOW(), ?)",
      [member.id, amount, currency, reference],
    );
    res.status(201).json({ id: result.insertId, name: member.name, amount, currency, status: 'paid', paidAt: new Date().toISOString(), reference });
  } catch (error) {
    next(error);
  }
});

app.use((error, _req, res, _next) => {
  console.error(error);
  const status = error.status || (error.code === 'ER_DUP_ENTRY' ? 409 : 500);
  const message = error.code === 'ER_DUP_ENTRY' ? 'That email address is already in use.' : (status < 500 ? error.message : 'Something went wrong. Please try again.');
  res.status(status).json({ error: message });
});

async function autoInitDatabase() {
  try {
    const [tables] = await pool.query("SHOW TABLES LIKE 'users'");
    if (tables.length === 0) {
      console.log('Database tables not found. Automatically applying schema.sql...');
      const fs = require('fs');
      const path = require('path');
      const possiblePaths = [
        path.resolve(__dirname, './schema.sql'),
        path.resolve(__dirname, '../../database/schema.sql'),
        path.resolve(__dirname, '../database/schema.sql'),
      ];
      const schemaPath = possiblePaths.find((p) => fs.existsSync(p));
      if (schemaPath) {
        const sql = fs.readFileSync(schemaPath, 'utf8');
        const statements = sql.split(/;\s*$/m).map((s) => s.trim()).filter((s) => s.length > 0);
        for (const statement of statements) {
          await pool.query(statement);
        }
        console.log('All MySQL tables created successfully!');
        const seed = require('./seed');
        await seed(pool);
        console.log('Initial seed data inserted.');
      }
    } else {
      console.log('MySQL database connected and tables verified.');
    }
  } catch (err) {
    console.error('Database connection / init notice:', err.message);
  }
}

const port = Number(process.env.PORT || 4000);
app.listen(port, async () => {
  console.log(`Forge Gym API listening on http://localhost:${port}`);
  await autoInitDatabase();
});