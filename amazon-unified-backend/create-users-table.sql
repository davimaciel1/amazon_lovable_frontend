-- Create users table if it doesn't exist
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    full_name VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index on email for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Insert a test user if needed (password: admin123)
-- Password is bcrypt hashed for 'admin123'
INSERT INTO users (email, password, full_name)
VALUES ('admin@amazon.com', '$2a$10$YKxoqVgPPZLHaCDOHthsHuKlOXpXi8QXPsYoMWqPQzWNyYtGUqCGy', 'Admin User')
ON CONFLICT (email) DO NOTHING;