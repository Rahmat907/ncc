import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import app from './app.js';
import User from './models/User.js';

if (!process.env.JWT_SECRET) {
  console.error('JWT_SECRET is missing. Copy .env.example to .env and set it.');
  process.exit(1);
}

async function seedAdmin() {
  const { ADMIN_PHONE: phone, ADMIN_PASSWORD: password, ADMIN_NAME } = process.env;
  if (!phone || !password) return;
  if (await User.exists({ phone })) return;
  await User.create({
    name: ADMIN_NAME || 'Administrator',
    phone,
    passwordHash: await bcrypt.hash(password, 12),
    role: 'admin',
  });
  console.log(`Admin account created (phone ${phone})`);
}

const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/accrm';

mongoose
  .connect(MONGO_URI)
  .then(async () => {
    console.log('MongoDB connected');
    await seedAdmin();
    app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`));
  })
  .catch((e) => { console.error('Startup failed:', e.message); process.exit(1); });
