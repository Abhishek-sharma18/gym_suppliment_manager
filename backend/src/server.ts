import dotenv from 'dotenv';
dotenv.config();

if (!process.env.JWT_SECRET) {
  console.error('JWT_SECRET is not set in backend/.env - refusing to start');
  process.exit(1);
}

import connectDB from './config/db';
import { createApp } from './app';

const app = createApp();
const PORT = Number(process.env.PORT) || 5000;

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  void connectDB();
});
