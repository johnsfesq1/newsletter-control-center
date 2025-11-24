/**
 * Intelligence API Endpoint
 * 
 * POST /query
 * Accepts a natural language query and returns an answer generated from newsletter content.
 * Uses Bearer token authentication.
 */

import express from 'express';
import { GoogleAuth } from 'google-auth-library';
import { executeRAGWithAnswer } from '../core/rag-application';

const app = express();
app.use(express.json());

// Initialize auth client
const auth = new GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/cloud-platform'],
});

// Authentication middleware
const requireAuth = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  // Health check bypass
  if (req.path === '/health' || req.path === '/healthz' || req.path === '/health-check') {
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Authentication required. Provide a Bearer token.',
    });
  }
  // In Cloud Run, the platform validates the OIDC token signature
  next();
};

// Route guard
app.use(requireAuth);

interface QueryRequest {
  query: string;
}

app.post('/query', async (req, res) => {
  try {
    const { query } = req.body as QueryRequest;

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Query is required and must be a non-empty string.'
      });
    }

    console.log(`Processing query: "${query.substring(0, 100)}${query.length > 100 ? '...' : ''}"`);

    const result = await executeRAGWithAnswer(query);

    // Return success response (even if confidence is none, it's a valid result)
    res.json(result);

  } catch (error: any) {
    console.error('Error processing query:', error);
    
    // Attempt to provide a structured error response
    const statusCode = error.message.includes('Vertex AI API') ? 502 : 500;
    
    res.status(statusCode).json({
      error: 'Processing Error',
      message: error.message || 'An unexpected error occurred',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Health check endpoints
app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.get('/healthz', (req, res) => res.json({ status: 'ok' }));
app.get('/health-check', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 8080;

// Only start listening if this file is run directly (not imported)
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Intelligence API listening on port ${PORT}`);
  });
}

export default app;
