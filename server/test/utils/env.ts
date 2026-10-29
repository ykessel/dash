// Test environment: local docker DB "pane_test", in-memory mailer (see app.ts).
process.env.NODE_ENV = 'test'
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgres://pane:pane@localhost:5434/pane_test'
process.env.DATABASE_URL_DIRECT = process.env.DATABASE_URL
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-123'
process.env.APP_URL = 'http://localhost:5173'
process.env.API_URL = 'http://localhost:3000'
process.env.SMTP_URL = 'smtp://localhost:1025'
process.env.MAIL_FROM = 'Pane <no-reply@pane.local>'
process.env.COOKIE_SECURE = 'false'
process.env.REMINDER_TICK_MS = '0'
