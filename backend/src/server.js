import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import connectDB from './config/db.js';

dotenv.config();

const app = express();

app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:3000' }));
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Gym API is running' });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log('Server running on http://localhost:' + PORT);
  connectDB();
});
