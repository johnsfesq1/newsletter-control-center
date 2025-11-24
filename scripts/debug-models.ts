
import { VertexAI } from '@google-cloud/vertexai';
import { GoogleAuth } from 'google-auth-library';

async function listModels() {
  const projectId = process.env.BQ_PROJECT_ID || 'newsletter-control-center';
  const location = 'us-central1';
  
  console.log(`Listing models for ${projectId} in ${location}...`);
  
  const auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });
  const client = await auth.getClient();
  const accessToken = await client.getAccessToken();
  
  if (!accessToken.token) {
    throw new Error('Failed to get access token');
  }

  const endpoint = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models`;
  
  try {
    const response = await fetch(endpoint, {
      headers: {
        Authorization: `Bearer ${accessToken.token}`,
      }
    });
    
    if (!response.ok) {
      console.error(`Error: ${response.status} ${await response.text()}`);
      return;
    }
    
    const data = await response.json();
    const models = data.models || [];
    console.log(`Found ${models.length} models.`);
    
    const geminiModels = models.filter((m: any) => m.name.includes('gemini'));
    console.log('Gemini models:');
    geminiModels.forEach((m: any) => console.log(`- ${m.name}`));
    
  } catch (error) {
    console.error('Failed to list models:', error);
  }
}

listModels();

