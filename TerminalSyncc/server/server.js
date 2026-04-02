import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import authRoutes from './routes/authRoutes.js';
import syncRoutes from './routes/syncRoutes.js';
import helmet from 'helmet';

dotenv.config();

const app = express();

// Middleware
app.use(helmet()); // For security headers
app.use(cors()); // Enable CORS for all origins (adjust in production)
app.use(express.json()); // Parse JSON bodies

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/sync', syncRoutes);

// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, async () => {
    console.log(` TerminalSync Server running on port ${PORT}`);
});