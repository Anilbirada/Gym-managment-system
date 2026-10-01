CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('admin', 'member', 'trainer') NOT NULL DEFAULT 'member',
  phone VARCHAR(32),
  status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS plans (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  price DECIMAL(10, 2) NOT NULL,
  duration_days INT UNSIGNED NOT NULL,
  description VARCHAR(255) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS memberships (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  plan_id BIGINT UNSIGNED NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status ENUM('active', 'paused', 'expired', 'cancelled') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_memberships_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_memberships_plan FOREIGN KEY (plan_id) REFERENCES plans(id),
  INDEX idx_memberships_user_status (user_id, status)
);

CREATE TABLE IF NOT EXISTS fitness_classes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(120) NOT NULL,
  category VARCHAR(80) NOT NULL,
  trainer_id BIGINT UNSIGNED,
  starts_at DATETIME NOT NULL,
  duration_minutes SMALLINT UNSIGNED NOT NULL DEFAULT 45,
  capacity SMALLINT UNSIGNED NOT NULL DEFAULT 16,
  room VARCHAR(80) NOT NULL DEFAULT 'Studio A',
  CONSTRAINT fk_classes_trainer FOREIGN KEY (trainer_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_classes_starts_at (starts_at)
);

CREATE TABLE IF NOT EXISTS bookings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  class_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  status ENUM('booked', 'attended', 'cancelled') NOT NULL DEFAULT 'booked',
  booked_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_bookings_class FOREIGN KEY (class_id) REFERENCES fitness_classes(id) ON DELETE CASCADE,
  CONSTRAINT fk_bookings_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uq_booking_class_user (class_id, user_id)
);

CREATE TABLE IF NOT EXISTS attendance (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  checked_in_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  source ENUM('mobile', 'admin', 'qr') NOT NULL DEFAULT 'mobile',
  CONSTRAINT fk_attendance_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_attendance_user_date (user_id, checked_in_at)
);

CREATE TABLE IF NOT EXISTS payments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  membership_id BIGINT UNSIGNED,
  amount DECIMAL(10, 2) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  status ENUM('paid', 'pending', 'failed', 'refunded') NOT NULL DEFAULT 'paid',
  paid_at TIMESTAMP NULL,
  reference VARCHAR(100) UNIQUE,
  CONSTRAINT fk_payments_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_payments_membership FOREIGN KEY (membership_id) REFERENCES memberships(id) ON DELETE SET NULL,
  INDEX idx_payments_paid_at (paid_at)
);