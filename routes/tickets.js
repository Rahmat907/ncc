import { Router } from 'express';
import Ticket, { Counter, STATUSES, TRANSITIONS } from '../models/Ticket.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const str = (v) => (typeof v === 'string' ? v : undefined); // blocks NoSQL operator injection via query strings

router.use(requireAuth);

// ---------- Customer ----------

// Create a service request
router.post('/', async (req, res, next) => {
  try {
    const { customerName, phone, address, pincode, email, serviceType, acType, description } = req.body; // whitelist
    const ticket = new Ticket({
      user: req.user._id,
      customerName, phone, address, pincode,
      email: typeof email === 'string' && email.trim() ? email : undefined,
      serviceType, acType,
      description: typeof description === 'string' && description.trim() ? description : undefined,
      statusHistory: [{ status: 'OPEN', by: req.user.role === 'admin' ? 'admin' : 'customer' }],
    });
    await ticket.validate(); // validate first so failed requests don't burn a ticket number
    const counter = await Counter.findOneAndUpdate({ _id: 'ticket' }, { $inc: { seq: 1 } }, { new: true, upsert: true });
    ticket.ticketNumber = `TKT-${String(counter.seq).padStart(6, '0')}`;
    await ticket.save();
    res.status(201).json(ticket);
  } catch (err) { next(err); }
});

// My requests
router.get('/mine', async (req, res, next) => {
  try {
    res.json(await Ticket.find({ user: req.user._id }).sort({ createdAt: -1 }));
  } catch (err) { next(err); }
});

// ---------- Admin ----------

// All tickets: ?status=&pincode=&q=
router.get('/', requireRole('admin'), async (req, res, next) => {
  try {
    const status = str(req.query.status), pincode = str(req.query.pincode), q = str(req.query.q);
    const filter = {};
    if (status) filter.status = status;
    if (pincode) filter.pincode = pincode;
    if (q && q.trim()) {
      const rx = new RegExp(escapeRegex(q.trim()), 'i');
      filter.$or = [{ customerName: rx }, { phone: rx }, { ticketNumber: rx }];
    }
    res.json(await Ticket.find(filter).sort({ createdAt: -1 }));
  } catch (err) { next(err); }
});

router.get('/stats/summary', requireRole('admin'), async (_req, res, next) => {
  try {
    const rows = await Ticket.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]);
    const stats = Object.fromEntries(STATUSES.map((s) => [s, 0]));
    rows.forEach((r) => { stats[r._id] = r.count; });
    res.json(stats);
  } catch (err) { next(err); }
});

router.patch('/:id/status', requireRole('admin'), async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!STATUSES.includes(status)) return res.status(400).json({ error: `Status must be one of ${STATUSES.join(', ')}` });
    const t = await Ticket.findById(req.params.id);
    if (!t) return res.status(404).json({ error: 'Ticket not found' });
    if (!TRANSITIONS[t.status].includes(status))
      return res.status(409).json({ error: `Cannot change status from ${t.status} to ${status}` });
    t.status = status;
    t.statusHistory.push({ status, by: 'admin' });
    await t.save();
    res.json(t);
  } catch (err) { next(err); }
});

// ---------- Shared (owner or admin) ----------

router.get('/:id', async (req, res, next) => {
  try {
    const t = await Ticket.findById(req.params.id);
    const allowed = t && (req.user.role === 'admin' || t.user.equals(req.user._id));
    if (!allowed) return res.status(404).json({ error: 'Ticket not found' }); // 404 (not 403) so IDs can't be probed
    res.json(t);
  } catch (err) { next(err); }
});

// Customer cancels their own request (only while still OPEN)
router.patch('/:id/cancel', async (req, res, next) => {
  try {
    const t = await Ticket.findById(req.params.id);
    if (!t || !t.user.equals(req.user._id)) return res.status(404).json({ error: 'Ticket not found' });
    if (t.status !== 'OPEN')
      return res.status(409).json({ error: 'Only open requests can be cancelled online. Please contact support.' });
    t.status = 'CANCELLED';
    t.statusHistory.push({ status: 'CANCELLED', by: 'customer' });
    await t.save();
    res.json(t);
  } catch (err) { next(err); }
});

export default router;
