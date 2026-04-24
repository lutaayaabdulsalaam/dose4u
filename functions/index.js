const functions = require('firebase-functions');
const admin = require('firebase-admin');
const axios = require('axios');

// Initialize Firebase Admin SDK
admin.initializeApp();

// ============================================
// OPTION 1: HARDCODE YOUR API KEY HERE (FOR TESTING ONLY)
// ============================================
// ⚠️ WARNING: This will be visible if someone gets access to your code
// ✅ Use this for quick testing/development
// ❌ Not recommended for production
const DEEPSEEK_API_KEY = 'sk-6b120d0c8b7e40acbe9d8b23475a9c2e';

// Fallback dosage calculator (used if API fails)
const calculateFallbackDosage = (medicineType, weight, age) => {
  const isChild = age < 12;
  const weightKg = parseFloat(weight);
  
  const dosageDatabase = {
    'Paracetamol': {
      pediatric: { dosePerKg: 15, maxSingle: 600, frequency: 'every 6-8 hours', maxDaily: '60 mg/kg/day' },
      adult: { minWeight: 50, dose: '500-1000 mg', frequency: 'every 6 hours', maxDaily: '4000 mg/day' }
    },
    'Amoxicillin': {
      pediatric: { dosePerKg: 20, maxSingle: 1000, frequency: 'every 8 hours', maxDaily: '90 mg/kg/day' },
      adult: { minWeight: 40, dose: '500-875 mg', frequency: 'every 12 hours', maxDaily: '3000 mg/day' }
    },
    'Ibuprofen': {
      pediatric: { dosePerKg: 10, maxSingle: 400, frequency: 'every 6-8 hours', maxDaily: '30 mg/kg/day' },
      adult: { minWeight: 50, dose: '400-600 mg', frequency: 'every 8 hours', maxDaily: '2400 mg/day' }
    },
    'Coartem': {
      weightBased: [
        { minWeight: 5, maxWeight: 14, dose: '1 tablet', frequency: 'twice daily for 3 days' },
        { minWeight: 15, maxWeight: 24, dose: '2 tablets', frequency: 'twice daily for 3 days' },
        { minWeight: 25, maxWeight: 34, dose: '3 tablets', frequency: 'twice daily for 3 days' },
        { minWeight: 35, maxWeight: 200, dose: '4 tablets', frequency: 'twice daily for 3 days' }
      ]
    },
    'Albendazole': {
      pediatric: { ageBased: true, under1: '200 mg once', over1: '400 mg once', frequency: 'single dose' },
      adult: { dose: '400 mg', frequency: 'single dose' }
    },
    'Salbutamol': {
      pediatric: { dosePerKg: 0.1, maxSingle: 4, frequency: 'every 6-8 hours as needed', form: 'syrup (2mg/5ml)' },
      adult: { dose: '2-4 mg', frequency: 'every 6-8 hours as needed' }
    }
  };

  const medicine = dosageDatabase[medicineType];
  if (!medicine) return 'Standard dosing: consult physician';

  // Coartem special case (weight-based, not age-based)
  if (medicineType === 'Coartem' && medicine.weightBased) {
    const dose = medicine.weightBased.find(range => 
      weightKg >= range.minWeight && weightKg <= range.maxWeight
    );
    return dose ? `${dose.dose} ${dose.frequency}` : 'Weight out of range - consult specialist';
  }

  // Albendazole age-based special case
  if (medicineType === 'Albendazole') {
    if (age < 1) return `${medicine.pediatric.under1} - ${medicine.pediatric.frequency}`;
    if (age < 12) return `${medicine.pediatric.over1} - ${medicine.pediatric.frequency}`;
    return `${medicine.adult.dose} - ${medicine.adult.frequency}`;
  }

  // For standard pediatric vs adult dosing
  if (isChild && medicine.pediatric) {
    const calculatedDose = medicine.pediatric.dosePerKg * weightKg;
    const finalDose = Math.min(calculatedDose, medicine.pediatric.maxSingle);
    return `${finalDose} mg ${medicine.pediatric.frequency} (max ${medicine.pediatric.maxDaily})`;
  } else if (!isChild && medicine.adult) {
    return `${medicine.adult.dose} ${medicine.adult.frequency} (max ${medicine.adult.maxDaily})`;
  }

  return 'Consult physician for accurate dosing';
};

/**
 * Main function: Generate pediatric prescription using DeepSeek API
 */
exports.generatePrescription = functions
  .runWith({
    timeoutSeconds: 120,
    memory: '512MB',
    minInstances: 0, // Set to 1 for production to reduce cold starts
    maxInstances: 50
  })
  .region('us-central1') // Change to your preferred region
  .https.onCall(async (data, context) => {
    
    // ============================================
    // OPTIONAL: Add authentication check
    // ============================================
    // Uncomment to require Firebase Authentication
    // if (!context.auth) {
    //   throw new functions.https.HttpsError(
    //     'unauthenticated',
    //     'You must be logged in to use this feature'
    //   );
    // }
    
    try {
      // ============================================
      // Validate input data
      // ============================================
      const { patientName, weight, age, medicineType, additionalNotes } = data;
      
      if (!patientName || !weight || !age || !medicineType) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'Missing required fields: patientName, weight, age, medicineType'
        );
      }

      // Validate weight and age ranges
      const weightNum = parseFloat(weight);
      const ageNum = parseInt(age);
      
      if (isNaN(weightNum) || weightNum < 2 || weightNum > 200) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'Weight must be between 2kg and 200kg'
        );
      }

      if (isNaN(ageNum) || ageNum < 0 || ageNum > 120) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'Age must be between 0 and 120 years'
        );
      }

      // ============================================
      // Check if API key is configured
      // ============================================
      if (!DEEPSEEK_API_KEY) {
        console.error('DeepSeek API key not configured');
        
        // Use fallback calculator
        const fallbackDosage = calculateFallbackDosage(medicineType, weightNum, ageNum);
        
        return {
          success: true,
          source: 'fallback',
          prescription: `
📋 **FALLBACK PRESCRIPTION (API Key Not Configured)**

**Patient:** ${patientName}
**Age:** ${ageNum} years
**Weight:** ${weightNum} kg
**Medicine:** ${medicineType}

💊 **Dosage:** ${fallbackDosage}

⚠️ **IMPORTANT NOTES:**
- This is a fallback calculation (DeepSeek API key not set)
- Add your API key in the code or set using Firebase Config
- Consult a healthcare professional before administering

📅 Generated: ${new Date().toLocaleString()}
          `,
          prescriptionId: 'fallback-' + Date.now()
        };
      }

      // ============================================
      // Prepare prompt for DeepSeek API
      // ============================================
      const isPediatric = ageNum < 12;
      const patientType = isPediatric ? 'PEDIATRIC' : 'ADULT';
      
      const systemPrompt = `You are Dose4U AI, a specialized pediatric medical assistant with expertise in medication dosing for children. Your responses must be:

1. **EVIDENCE-BASED**: Use standard pediatric dosing guidelines (mg/kg)
2. **SAFETY-FIRST**: Always include contraindications and warnings
3. **CLEAR FORMAT**: Use emojis and clear sections
4. **AGE-APPROPRIATE**: Distinguish between infant, child, and adult dosing

Format your response exactly like this template:

👤 **PATIENT:** [Name] | Age: [X] years | Weight: [X] kg

💊 **MEDICATION:** [Medicine Name]
📏 **DOSE CALCULATION:**
- Standard dose: [X] mg/kg/dose
- Calculated dose: [X] mg per dose
- Frequency: [every X hours]
- Maximum daily: [X] mg/day

⚠️ **WARNINGS:**
- [Warning 1]
- [Warning 2]

💡 **ADMINISTRATION NOTES:**
- [Note 1]
- [Note 2]

👨‍⚕️ **FOLLOW-UP:**
- [Follow-up instructions]`;

      const userPrompt = `Generate a prescription for:
- Patient: ${patientName}
- Age: ${ageNum} years
- Weight: ${weightNum} kg
- Medication: ${medicineType}
- Type: ${patientType}
${additionalNotes ? `- Additional notes: ${additionalNotes}` : ''}

Please provide safe, accurate dosing based on weight. Include specific mg/kg calculation.`;

      // ============================================
      // Call DeepSeek API
      // ============================================
      console.log(`Calling DeepSeek API for ${patientName} (${patientType})`);
      
      // DEEPSEEK API ENDPOINT
      const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';
      
      const response = await axios.post(
        DEEPSEEK_API_URL,
        {
          model: 'deepseek-chat', // or 'deepseek-reasoner' for complex reasoning
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.3, // Lower = more consistent
          max_tokens: 800,
          top_p: 0.9,
          frequency_penalty: 0.1,
          presence_penalty: 0.1
        },
        {
          headers: {
            'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000 // 30 second timeout
        }
      );

      // Extract prescription from response
      let prescription = response.data.choices[0].message.content;

      // ============================================
      // Store prescription in Firestore (optional)
      // ============================================
      let prescriptionId = null;
      try {
        const prescriptionRef = await admin.firestore()
          .collection('prescriptions')
          .add({
            patientName,
            weight: weightNum,
            age: ageNum,
            medicineType,
            prescription,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            userId: context.auth?.uid || 'anonymous',
            source: 'deepseek-api',
            additionalNotes: additionalNotes || null
          });
        prescriptionId = prescriptionRef.id;
      } catch (dbError) {
        console.error('Failed to store prescription:', dbError);
        // Continue even if storage fails
      }

      // ============================================
      // Return successful response
      // ============================================
      return {
        success: true,
        source: 'deepseek-api',
        prescription,
        prescriptionId,
        patientInfo: {
          name: patientName,
          age: ageNum,
          weight: weightNum,
          type: patientType
        },
        generatedAt: new Date().toISOString()
      };

    } catch (error) {
      // ============================================
      // Handle errors gracefully
      // ============================================
      console.error('DeepSeek API error:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status
      });

      // Try fallback calculation
      try {
        const { medicineType, weight, age, patientName } = data;
        const fallbackDosage = calculateFallbackDosage(medicineType, parseFloat(weight), parseInt(age));
        
        return {
          success: true,
          source: 'fallback',
          prescription: `
⚠️ **AI SERVICE UNAVAILABLE** - Using Safe Fallback Calculator

👤 **Patient:** ${patientName}
📊 **Details:** ${age} years, ${weight}kg
💊 **Medicine:** ${medicineType}

📋 **RECOMMENDED DOSAGE:**
${fallbackDosage}

🔔 **IMPORTANT:**
- AI service temporarily unavailable
- This is a standard reference dose
- Always verify with a healthcare professional
- Error: ${error.message}

📅 Generated: ${new Date().toLocaleString()}
          `,
          prescriptionId: 'fallback-' + Date.now()
        };
      } catch (fallbackError) {
        // If even fallback fails, throw error
        throw new functions.https.HttpsError(
          'internal',
          'Failed to generate prescription. Please try again later.',
          error.message
        );
      }
    }
  });

/**
 * HTTP version of the function (for REST API calls)
 */
exports.generatePrescriptionHttp = functions
  .runWith({
    timeoutSeconds: 120,
    memory: '512MB'
  })
  .region('us-central1')
  .https.onRequest(async (req, res) => {
    // Enable CORS
    res.set('Access-Control-Allow-Origin', '*');
    
    if (req.method === 'OPTIONS') {
      res.set('Access-Control-Allow-Methods', 'POST');
      res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.status(204).send('');
      return;
    }

    // Only allow POST
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    try {
      const data = req.body;
      
      // Reuse the same logic as the callable function
      const result = await exports.generatePrescription.run(data, {
        auth: req.headers.authorization ? { uid: 'http-user' } : null
      });

      res.json(result);
    } catch (error) {
      res.status(error.code || 500).json({
        error: error.message,
        details: error.details
      });
    }
  });

/**
 * Health check endpoint
 */
exports.healthCheck = functions
  .region('us-central1')
  .https.onRequest(async (req, res) => {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        deepseekApi: DEEPSEEK_API_KEY ? 'configured' : 'missing',
        firestore: 'available'
      },
      uptime: process.uptime()
    };
    
    res.json(health);
  });

/**
 * Scheduled cleanup of old prescriptions (runs daily)
 */
exports.cleanupOldPrescriptions = functions.pubsub
  .schedule('0 2 * * *') // 2 AM daily
  .timeZone('UTC')
  .onRun(async (context) => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    try {
      const snapshot = await admin.firestore()
        .collection('prescriptions')
        .where('createdAt', '<', thirtyDaysAgo)
        .limit(500) // Process in batches
        .get();

      if (snapshot.empty) {
        console.log('No old prescriptions to clean up');
        return null;
      }

      const batch = admin.firestore().batch();
      snapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
      });
      
      await batch.commit();
      console.log(`Cleaned up ${snapshot.size} old prescriptions`);
      
    } catch (error) {
      console.error('Cleanup failed:', error);
    }
    
    return null;
  });

// Export for testing
if (process.env.NODE_ENV === 'test') {
  module.exports.calculateFallbackDosage = calculateFallbackDosage;
}
