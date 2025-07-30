import { getAllActivePersonas, createPersona } from './lib/db/queries.js';

async function testPersonaAPI() {
  try {
    console.log('🔍 Testing persona API...');
    
    // Get all personas
    const personas = await getAllActivePersonas();
    console.log('✅ Found personas:', personas.length);
    
    // Try creating a test persona
    const testPersona = await createPersona({
      name: 'Test Persona',
      description: 'A test persona for validation',
      systemPrompt: 'You are a test assistant.',
      avatar: '🧪',
      color: 'bg-green-500',
      createdBy: '00000000-0000-0000-0000-000000000000' // placeholder user ID
    });
    
    console.log('✅ Created test persona:', testPersona.name);
    console.log('🎉 Persona API is working correctly!');
    
  } catch (error) {
    console.error('❌ Persona API test failed:', error);
  }
}

testPersonaAPI();
