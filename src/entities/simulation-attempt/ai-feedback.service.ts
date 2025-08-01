import OpenAI from 'openai';
import { TranscriptClean } from '../../shared/types'; // Import the existing type

// Types for the AI feedback system
interface CaseInfo {
  patientName: string;
  diagnosis: string;
  caseTitle: string;
  patientAge?: number;
  patientGender?: string;
}

interface MarkingDomain {
  domain: string;
  score: number;
  feedback: string;
}

interface AIFeedbackResponse {
  overallFeedback: string;
  strengths: string[];
  improvements: string[];
  score: number;
  markingDomains: MarkingDomain[];
}

export class AIFeedbackService {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }

  async generateFeedback(
    transcript: TranscriptClean,
    caseInfo: CaseInfo,
    sessionDuration: number
  ): Promise<{ 
    feedback: AIFeedbackResponse; 
    score: number; 
    prompts: { systemPrompt: string; userPrompt: string; }
  }> {
  
    const systemPrompt = this.buildSystemPrompt(caseInfo);
    const userPrompt = this.buildUserPrompt(transcript, caseInfo, sessionDuration);
  
    try {
      const completion = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.3,
        max_tokens: 2000,
        response_format: { type: "json_object" }
      });
  
      const responseContent = completion.choices[0]?.message?.content;
      if (!responseContent) {
        throw new Error('No response content from OpenAI');
      }
  
      const aiResponse = JSON.parse(responseContent) as AIFeedbackResponse;
      
      // Validate and ensure score is within bounds
      const score = Math.max(0, Math.min(100, aiResponse.score || 0));
  
      return {
        feedback: aiResponse,
        score: score,
        prompts: {
          systemPrompt,
          userPrompt
        }
      };
  
    } catch (error) {
      console.error('Error generating AI feedback:', error);
      throw new Error('Failed to generate AI feedback');
    }
  }

  private buildSystemPrompt(caseInfo: CaseInfo): string {
    return `You are an expert medical examiner evaluating a medical student's performance during a simulated patient consultation for the SCA (Structured Clinical Assessment) exam.

PATIENT CASE CONTEXT:
- Patient Name: ${caseInfo.patientName}
- Case Title: ${caseInfo.caseTitle}
- Diagnosis: ${caseInfo.diagnosis}
${caseInfo.patientAge ? `- Patient Age: ${caseInfo.patientAge}` : ''}
${caseInfo.patientGender ? `- Patient Gender: ${caseInfo.patientGender}` : ''}

EVALUATION CRITERIA:
You must evaluate the student across these key marking domains:
1. **Communication Skills** (25%): Active listening, empathy, clear explanations, appropriate tone
2. **Clinical Assessment** (35%): History taking, physical examination approach, diagnostic reasoning
3. **Professionalism** (20%): Respect, confidentiality, ethical considerations, time management
4. **Patient Safety** (20%): Risk assessment, appropriate follow-up, safety considerations

SCORING GUIDELINES:
- 90-100: Exceptional performance, exceeds expectations
- 80-89: Good performance, meets most expectations with minor gaps
- 70-79: Satisfactory performance, meets basic expectations
- 60-69: Below expectations, significant areas for improvement
- 0-59: Unsatisfactory, major deficiencies

RESPONSE FORMAT:
You must respond with a valid JSON object containing:
{
  "overallFeedback": "Comprehensive overall assessment (2-3 sentences)",
  "strengths": ["List of 2-4 specific strengths observed"],
  "improvements": ["List of 2-4 specific areas for improvement"],
  "score": numeric_score_0_to_100,
  "markingDomains": [
    {
      "domain": "Communication Skills",
      "score": numeric_score_0_to_100,
      "feedback": "Specific feedback for this domain"
    },
    {
      "domain": "Clinical Assessment", 
      "score": numeric_score_0_to_100,
      "feedback": "Specific feedback for this domain"
    },
    {
      "domain": "Professionalism",
      "score": numeric_score_0_to_100,
      "feedback": "Specific feedback for this domain"
    },
    {
      "domain": "Patient Safety",
      "score": numeric_score_0_to_100,
      "feedback": "Specific feedback for this domain"
    }
  ]
}

Be constructive, specific, and educational in your feedback. Focus on actionable improvements.`;
  }

  private buildUserPrompt(
    transcript: TranscriptClean,
    caseInfo: CaseInfo,
    sessionDuration: number
  ): string {
    
    const conversationText = transcript.messages
      .map(msg => {
        // Map speaker names to expected format
        const speaker = msg.speaker.toLowerCase().includes('student') || msg.speaker.toLowerCase().includes('doctor') 
          ? 'STUDENT' 
          : 'AI_PATIENT';
        return `[${msg.timestamp}] ${speaker}: ${msg.message}`;
      })
      .join('\n');

    return `Please evaluate this medical student's consultation performance:

CONSULTATION TRANSCRIPT:
${conversationText}

SESSION DETAILS:
- Total Duration: ${Math.floor(sessionDuration / 60)} minutes ${sessionDuration % 60} seconds
- Total Messages: ${transcript.totalMessages}
- Case: ${caseInfo.caseTitle}

EVALUATION INSTRUCTIONS:
1. Analyze the student's communication approach, clinical questioning, and professionalism
2. Consider how well they gathered relevant history and assessed the patient's concerns
3. Evaluate their diagnostic reasoning and patient safety considerations
4. Provide specific, constructive feedback with examples from the transcript
5. Score each marking domain and calculate an overall weighted score
6. Ensure all feedback is educational and actionable

Please provide your evaluation in the required JSON format.`;
  }
}

// Export both the class and a singleton instance
export const aiFeedbackService = new AIFeedbackService();