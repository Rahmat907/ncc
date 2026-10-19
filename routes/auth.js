import { Router } from 'express';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import { requireAuth, signToken } from '../middleware/auth.js';

const router = Router();
const isStr = (v) => typeof v === 'string';

// Customer self-registration
router.post('/register', async (req, res, next) => {
  try {
    const { name, phone, email, password } = req.body;
    const errors = {};

    if (!isStr(password) || password.length < 8) errors.password = 'Password must be at least 8 characters';
    else if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) errors.password = 'Password must contain letters and numbers';

    const user = new User({
      name, phone,
      email: isStr(email) && email.trim() ? email : undefined,
      role: 'customer',            // role can never be chosen by the client
      passwordHash: 'pending',     // replaced after validation
    });
    try {
      await user.validate();
    } catch (e) {
      if (e.name !== 'ValidationError') throw e;
      Object.values(e.errors).forEach((x) => { if (x.path !== 'passwordHash') errors[x.path] = x.name === 'CastError' ? 'Invalid value' : x.message; });
    }
    if (Object.keys(errors).length) return res.status(400).json({ errors });

    if (await User.exists({ phone: user.phone }))
      return res.status(409).json({ errors: { phone: 'This phone number is already registered. Please log in.' } });
    if (user.email && (await User.exists({ email: user.email })))
      return res.status(409).json({ errors: { email: 'This email is already registered.' } });

    user.passwordHash = await bcrypt.hash(password, 12);
    await user.save();
    res.status(201).json({ token: signToken(user), user });
  } catch (err) { next(err); }
});

router.post('/login', async (req, res, next) => {
  try {
    const { phone, password } = req.body;
    if (!isStr(phone) || !isStr(password) || !phone.trim() || !password)
      return res.status(400).json({ error: 'Phone number and password are required' });

    const user = await User.findOne({ phone: phone.trim() });
    const ok = user && (await bcrypt.compare(password, user.passwordHash));
    if (!ok) return res.status(401).json({ error: 'Invalid phone number or password' });
    res.json({ token: signToken(user), user });
  } catch (err) { next(err); }
});

router.get('/me', requireAuth, (req, res) => res.json({ user: req.user }));

export default router;
