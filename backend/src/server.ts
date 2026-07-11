import dotenv from 'dotenv';
dotenv.config();

import connectDB from './config/db';
import { createApp } from './app';

const app = createApp();
const PORT = Number(process.env.PORT) || 5000;

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  void connectDB();
});
