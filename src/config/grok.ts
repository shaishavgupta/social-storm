export const grokConfig = {
  apiKey: process.env.GROK_API_KEY || '',
  apiUrl: process.env.GROK_API_URL || 'https://api.x.ai/v1',
  model: 'grok-beta', // Default Grok model
  maxTokens: 150,
  temperature: 0.7,
};

if (!grokConfig.apiKey) {
  console.warn('GROK_API_KEY is not set. Comment generation will fail.');
}

