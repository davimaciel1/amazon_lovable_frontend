const express = require('express');
const axios = require('axios');
const { Pool } = require('pg');
const router = express.Router();

// Database connection
const pool = new Pool({
  host: process.env.DB_HOST || '49.12.191.119',
  port: process.env.DB_PORT || 5456,
  database: process.env.DB_NAME || 'amazon_monitor',
  user: process.env.DB_USER || 'saas',
  password: process.env.DB_PASSWORD || 'saas_password_123'
});

// Fallback images map - updated Amazon product images
const fallbackImages = {
  'B0C59YJM4Y': 'https://m.media-amazon.com/images/I/71bnsDdIRAL._AC_SL1500_.jpg',
  'B0C59YL99C': 'https://m.media-amazon.com/images/I/71rOKpz9aWL._AC_SL1500_.jpg',
  'B0C5B45D37': 'https://m.media-amazon.com/images/I/81JQXBnOS8L._AC_SL1500_.jpg',
  'B0C5B4GMLT': 'https://m.media-amazon.com/images/I/71hqOFvYPxL._AC_SL1500_.jpg',
  'B0C5B4R4F7': 'https://m.media-amazon.com/images/I/71K2vOwsMWL._AC_SL1500_.jpg',
  'B0C5B6GSZ4': 'https://m.media-amazon.com/images/I/71EtjsRtTQL._AC_SL1500_.jpg',
  'B0C5B6XJ1C': 'https://m.media-amazon.com/images/I/71K2vOwsMWL._AC_SL1500_.jpg',
  'B0C5B75CDK': 'https://m.media-amazon.com/images/I/71zFjkOHZsL._AC_SL1500_.jpg',
  'B0C5B8GF5M': 'https://m.media-amazon.com/images/I/71EtjsRtTQL._AC_SL1500_.jpg',
  'B0C5B8K1Y2': 'https://m.media-amazon.com/images/I/81JQXBnOS8L._AC_SL1500_.jpg',
  'B0C5B8RH17': 'https://m.media-amazon.com/images/I/71hqOFvYPxL._AC_SL1500_.jpg',
  'B0C5B8RH1V': 'https://m.media-amazon.com/images/I/71rOKpz9aWL._AC_SL1500_.jpg',
  'B0C5B9B3SQ': 'https://m.media-amazon.com/images/I/71K2vOwsMWL._AC_SL1500_.jpg',
  'B0C5BBCG5W': 'https://m.media-amazon.com/images/I/71FQQCMojUL._AC_SL1500_.jpg',
  'B0C5BBCRZQ': 'https://m.media-amazon.com/images/I/71K2vOwsMWL._AC_SL1500_.jpg',
  'B0C5BC5S4R': 'https://m.media-amazon.com/images/I/81KfWKmUwxL._AC_SL1500_.jpg',
  'B0C5BC8JTQ': 'https://m.media-amazon.com/images/I/71K2vOwsMWL._AC_SL1500_.jpg',
  'B0C5BCMH2J': 'https://m.media-amazon.com/images/I/71EtjsRtTQL._AC_SL1500_.jpg',
  'B0C5BFY8VH': 'https://m.media-amazon.com/images/I/71hqOFvYPxL._AC_SL1500_.jpg',
  'B0C5BG5T48': 'https://m.media-amazon.com/images/I/71K2vOwsMWL._AC_SL1500_.jpg',
  'B0C5BJ2B1Q': 'https://m.media-amazon.com/images/I/71bnsDdIRAL._AC_SL1500_.jpg',
  'B0C5BNBBMF': 'https://m.media-amazon.com/images/I/71FQQCMojUL._AC_SL1500_.jpg',
  'B0C5BNC3PH': 'https://m.media-amazon.com/images/I/81KfWKmUwxL._AC_SL1500_.jpg',
  'B0C5BTQLK8': 'https://m.media-amazon.com/images/I/71zFjkOHZsL._AC_SL1500_.jpg',
  'B0C5BV7XQK': 'https://m.media-amazon.com/images/I/71EtjsRtTQL._AC_SL1500_.jpg',
  'B0CLBFSQH1': 'https://m.media-amazon.com/images/I/71-WQJwJYIL._AC_SL1500_.jpg'
};

// Default placeholder image
const PLACEHOLDER_IMAGE = 'https://m.media-amazon.com/images/I/71bnsDdIRAL._AC_SL1500_.jpg';

// Image proxy endpoint - serve placeholder images for now
router.get('/:asin.jpg', async (req, res) => {
  const { asin } = req.params;
  
  try {
    // For now, redirect to a placeholder image service
    // You can replace this with actual product images when available
    const placeholderUrl = `https://via.placeholder.com/300x300.png?text=${asin}`;
    
    // Redirect to placeholder
    res.redirect(placeholderUrl);
    
  } catch (error) {
    console.error(`Error handling image for ASIN ${asin}:`, error.message);
    res.status(404).json({ error: 'Image not found' });
  }
});

module.exports = router;