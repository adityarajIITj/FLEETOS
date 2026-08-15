const { Router } = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');
const Joi = require('joi');
const { run, get, all } = require('../../config/database');
const { authenticate, requireRole } = require('../../middleware/auth');

const router = Router();

const createUserSchema = Joi.object({
  name: Joi.string().min(2).max(100).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
  role: Joi.string().valid('admin', 'dispatcher', 'driver', 'client').required(),
  phone: Joi.string().allow('', null),
});

const updateUserSchema = Joi.object({
  name: Joi.string().min(2).max(100),
  email: Joi.string().email(),
  password: Joi.string().min(6).allow('', null),
  role: Joi.string().valid('admin', 'dispatcher', 'driver', 'client'),
  phone: Joi.string().allow('', null),
  is_active: Joi.number().valid(0, 1),
});

// GET /api/v1/users — Admin only: list all users
router.get('/', authenticate, requireRole('admin'), (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = Math.min(parseInt(req.query.limit) || 50, 100);
  const offset = (page - 1) * limit;
  const role = req.query.role;
  const search = req.query.search;

  const conditions = [];
  const params = [];

  if (role) {
    conditions.push('role = ?');
    params.push(role);
  }

  if (search) {
    conditions.push('(name LIKE ? OR email LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const total = get(`SELECT COUNT(*) as count FROM users ${where}`, params);
  
  params.push(limit, offset);
  const users = all(
    `SELECT id, name, email, phone, role, is_active, created_at, updated_at FROM users ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    params
  );

  res.json({
    success: true,
    data: users,
    meta: { page, limit, total: total ? total.count : 0 },
  });
});

// POST /api/v1/users — Admin only: create a new user
router.post('/', authenticate, requireRole('admin'), async (req, res) => {
  const { error, value } = createUserSchema.validate(req.body);
  if (error) {
    return res.status(400).json({ success: false, error: { code: 'VALIDATION', message: error.details[0].message } });
  }

  const existing = get('SELECT id FROM users WHERE email = ?', [value.email]);
  if (existing) {
    return res.status(409).json({ success: false, error: { code: 'DUPLICATE', message: 'Email is already in use.' } });
  }

  const hashedPassword = await bcrypt.hash(value.password, 10);
  const id = uuid();

  run(
    'INSERT INTO users (id, name, email, phone, password, role, is_active) VALUES (?, ?, ?, ?, ?, ?, 1)',
    [id, value.name, value.email, value.phone || null, hashedPassword, value.role]
  );

  const newUser = get('SELECT id, name, email, phone, role, is_active, created_at FROM users WHERE id = ?', [id]);
  res.status(201).json({ success: true, data: newUser });
});

// GET /api/v1/users/:id — Admin or self
router.get('/:id', authenticate, (req, res) => {
  if (req.user.role !== 'admin' && req.user.id !== req.params.id) {
    return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Unauthorized access' } });
  }

  const user = get('SELECT id, name, email, phone, role, is_active, created_at FROM users WHERE id = ?', [req.params.id]);
  if (!user) {
    return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } });
  }

  res.json({ success: true, data: user });
});

// PUT /api/v1/users/:id — Admin only: update user
router.put('/:id', authenticate, requireRole('admin'), async (req, res) => {
  const { error, value } = updateUserSchema.validate(req.body);
  if (error) {
    return res.status(400).json({ success: false, error: { code: 'VALIDATION', message: error.details[0].message } });
  }

  const existing = get('SELECT id, password FROM users WHERE id = ?', [req.params.id]);
  if (!existing) {
    return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } });
  }

  const updates = ['updated_at = datetime("now")'];
  const params = [];

  if (value.name !== undefined) { updates.push('name = ?'); params.push(value.name); }
  if (value.email !== undefined) { updates.push('email = ?'); params.push(value.email); }
  if (value.phone !== undefined) { updates.push('phone = ?'); params.push(value.phone); }
  if (value.role !== undefined) { updates.push('role = ?'); params.push(value.role); }
  if (value.is_active !== undefined) { updates.push('is_active = ?'); params.push(value.is_active); }

  if (value.password) {
    const hashedPassword = await bcrypt.hash(value.password, 10);
    updates.push('password = ?');
    params.push(hashedPassword);
  }

  params.push(req.params.id);
  run(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);

  const updatedUser = get('SELECT id, name, email, phone, role, is_active, updated_at FROM users WHERE id = ?', [req.params.id]);
  res.json({ success: true, data: updatedUser });
});

// DELETE /api/v1/users/:id — Admin only: delete user
router.delete('/:id', authenticate, requireRole('admin'), (req, res) => {
  if (req.user.id === req.params.id) {
    return res.status(400).json({ success: false, error: { code: 'SELF_DELETE', message: 'You cannot delete your own account.' } });
  }

  const existing = get('SELECT id FROM users WHERE id = ?', [req.params.id]);
  if (!existing) {
    return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } });
  }

  run('DELETE FROM users WHERE id = ?', [req.params.id]);
  res.json({ success: true, data: { message: 'User deleted successfully' } });
});

module.exports = router;
