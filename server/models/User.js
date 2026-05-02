import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  full_name: { type: String, default: '' },
  role: { type: String, enum: ['admin', 'user'], default: 'user' },
}, { timestamps: true });

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  obj.id = obj._id.toString();
  obj.created_at = obj.createdAt?.toISOString();
  obj.updated_at = obj.updatedAt?.toISOString();
  return obj;
};

export default mongoose.model('User', userSchema);
