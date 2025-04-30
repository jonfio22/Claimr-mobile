import { NextApiResponse } from 'next';

export const errorHandler = (error: any, res: NextApiResponse) => {
  console.error('API Error:', error);
  
  // Handle known error types
  if (error.code === 'SUPABASE_ERROR') {
    return res.status(500).json({ 
      error: 'Database operation failed',
      message: error.message,
      code: 'DB_ERROR'
    });
  }
  
  if (error.code === 'NOT_FOUND') {
    return res.status(404).json({
      error: 'Resource not found',
      message: error.message,
      code: 'NOT_FOUND'
    });
  }
  
  // Default error response
  return res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'production' 
      ? 'An unexpected error occurred' 
      : error.message,
    code: 'INTERNAL_ERROR'
  });
};
