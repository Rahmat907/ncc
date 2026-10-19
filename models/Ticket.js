import mongoose from 'mongoose';

export const SERVICE_TYPES = ['INSTALLATION', 'REPAIR', 'SERVICE'];
export const AC_TYPES = ['SPLIT', 'WINDOW', 'VRF'];
export const STATUSES = ['OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];

// Allowed status changes (enforced on the server)
export const TRANSITIONS = {
  OPEN: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

// Auto-increment counter -> TKT-000001, TKT-000002 ...
const counterSchema = new mongoose.Schema({ _id: String, seq: { type: Number, default: 0 } });
export const Counter = mongoose.models.Counter || mongoose.model('Counter', counterSchema);

const historySchema = new mongoose.Schema(
  {
    status: { type: String, enum: STATUSES, required: true },
    at: { type: Date, default: Date.now },
    by: { type: String, enum: ['customer', 'admin'], default: 'admin' },
  },
  { _id: false }
);

const ticketSchema = new mongoose.Schema(
  {
    ticketNumber: { type: String, unique: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    // Contact + location for THIS visit (can differ from the account details)
    customerName: { type: String, required: [true, 'Customer name is required'], trim: true },
    phone: {
      type: String,
      required: [true, 'Phone number is required'],
      match: [/^[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number'],
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      validate: { validator: (v) => !v || /^\S+@\S+\.\S+$/.test(v), message: 'Invalid email' },
    },
    address: { type: String, required: [true, 'Address is required'], trim: true, maxlength: 500 },
    pincode: { type: String, required: [true, 'Pincode is required'], match: [/^\d{6}$/, 'Pincode must be 6 digits'] },

    serviceType: {
      type: String,
      required: [true, 'Service type is required'],
      enum: { values: SERVICE_TYPES, message: `Service type must be one of ${SERVICE_TYPES.join(', ')}` },
    },
    acType: {
      type: String,
      required: [true, 'AC type is required'],
      enum: { values: AC_TYPES, message: `AC type must be one of ${AC_TYPES.join(', ')}` },
    },
    description: { type: String, trim: true, maxlength: [500, 'Description can be at most 500 characters'] },

    status: { type: String, enum: STATUSES, default: 'OPEN' },
    statusHistory: [historySchema],
  },
  { timestamps: true }
);

export default mongoose.model('Ticket', ticketSchema);
