const fs = require('fs');

const { API_KEY, MODEL } = process.env;

const content = `
const GAME_CONFIG = {
  apiKey: "${API_KEY || ''}",
  model: "${MODEL || 'gemini-3.1-flash-lite-preview'}",
  budget: 15000, 
  drinkPrice: 1500, 
  bottlePrice: 8000, 
};
`;

fs.writeFileSync('config.js', content);
console.log('✅ Vercel: config.js generated from environment variables.');
