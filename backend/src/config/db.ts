import dns from 'node:dns';
import mongoose from 'mongoose';

// On this machine Node's DNS resolver points at 127.0.0.1 (a local proxy that
// doesn't answer), which breaks the mongodb+srv SRV lookup even though normal
// browsing works. Resolve through public DNS instead.
dns.setServers(['8.8.8.8', '1.1.1.1']);

const connectDB = async (): Promise<void> => {
  const uri = process.env.MONGO_URI;

  if (!uri || uri.includes('your_mongodb_connection_string')) {
    console.warn('MONGO_URI is not set in backend/.env - the API is running WITHOUT a database.');
    return;
  }

  try {
    const conn = await mongoose.connect(uri);
    console.log(`MongoDB connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`MongoDB connection failed: ${(error as Error).message}`);
  }
};

export default connectDB;
