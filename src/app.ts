import express from 'express';
import { handleIngestion } from './api/ingestion';

const app = express();
app.use(express.json());

// The single, clean endpoint for all fitness data
app.post('/sync/:provider', handleIngestion);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[sd] Odometer engine running on port ${PORT}`);
});