require('dotenv').config();
const bcrypt = require('bcryptjs');
const defaultPool = require('./db');

async function seed(pool = defaultPool) {
  const connection = await pool.getConnection();
  try {
    const passwordHash = await bcrypt.hash('gym1234', 10);
    await connection.beginTransaction();
    await connection.execute(
      `INSERT INTO plans (id, name, price, duration_days, description) VALUES
       (1, 'Essential', 39, 30, 'Full gym access, any time.'),
       (2, 'Unlimited', 69, 30, 'Gym access plus unlimited classes.'),
       (3, 'Annual', 599, 365, 'A full year of training, best value.')
       ON DUPLICATE KEY UPDATE name = VALUES(name)`,
    );
    await connection.execute(
      `INSERT INTO users (name, email, password_hash, role, phone) VALUES
       ('Jordan Lee', 'admin@forgegym.com', ?, 'admin', '+1 555 0101'),
       ('Alex Morgan', 'member@forgegym.com', ?, 'member', '+1 555 0102'),
       ('Sam Rivera', 'sam@forgegym.com', ?, 'trainer', '+1 555 0103')
       ON DUPLICATE KEY UPDATE name = VALUES(name), password_hash = VALUES(password_hash)`,
      [passwordHash, passwordHash, passwordHash],
    );
    await connection.execute(
      `INSERT INTO memberships (user_id, plan_id, start_date, end_date, status)
       SELECT u.id, 2, CURDATE(), DATE_ADD(CURDATE(), INTERVAL 24 DAY), 'active'
       FROM users u LEFT JOIN memberships m ON m.user_id = u.id AND m.status = 'active'
       WHERE u.email = 'member@forgegym.com' AND m.id IS NULL`,
    );
    await connection.execute(
      `INSERT INTO fitness_classes (title, category, trainer_id, starts_at, duration_minutes, capacity, room)
       SELECT 'Strength circuit', 'Strength', u.id, TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL 1 DAY), '07:30:00'), 50, 16, 'Studio A'
       FROM users u WHERE u.email = 'sam@forgegym.com'
       AND NOT EXISTS (SELECT 1 FROM fitness_classes WHERE title = 'Strength circuit' AND DATE(starts_at) = DATE_ADD(CURDATE(), INTERVAL 1 DAY))`,
    );
    await connection.execute(
      `INSERT INTO fitness_classes (title, category, trainer_id, starts_at, duration_minutes, capacity, room)
       SELECT 'Flow & mobility', 'Recovery', u.id, TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL 1 DAY), '12:15:00'), 45, 18, 'Studio B'
       FROM users u WHERE u.email = 'sam@forgegym.com'
       AND NOT EXISTS (SELECT 1 FROM fitness_classes WHERE title = 'Flow & mobility' AND DATE(starts_at) = DATE_ADD(CURDATE(), INTERVAL 1 DAY))`,
    );
    await connection.commit();
    console.log('Seeded plans, demo accounts, membership, and classes. Password for all accounts: gym1234');
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

if (require.main === module) {
  seed()
    .then(() => defaultPool.end())
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = seed;