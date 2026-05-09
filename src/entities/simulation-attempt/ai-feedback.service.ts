import OpenAI from 'openai';
import Groq from 'groq-sdk';
import { TranscriptClean } from '../../shared/types';
import { FastifyBaseLogger } from 'fastify';

// Add provider enum
enum AIProvider {
  OPENAI = 'openai',
  GROQ = 'groq'
}

interface CaseInfo {
  patientName: string;
  diagnosis: string;
  caseTitle: string;
  patientAge?: number;
  patientGender?: string;
}

interface CaseTabs {
  doctorsNote: string[];
  patientScript: string[];
  medicalNotes: string[];
}

interface MarkingCriterionResult {
  criterionId: string;
  criterionText: string;
  points: number;
  achievedPoints: number;
  status: 'MET' | 'PARTIALLY_MET' | 'NOT_MET';
  transcriptReferences: string[];
  feedback: string;
}

interface MarkingDomainResult {
  domainId: string;
  domainName: string;
  totalPossiblePoints: number;
  achievedPoints: number;
  percentageScore: number;
  criteria: MarkingCriterionResult[];
}

enum PerformanceClassification {
  CLEAR_PASS = 'CLEAR_PASS',
  BORDERLINE_PASS = 'BORDERLINE_PASS',
  BORDERLINE_FAIL = 'BORDERLINE_FAIL',
  CLEAR_FAIL = 'CLEAR_FAIL'
}

interface OverallResult {
  classification: PerformanceClassification;
  classificationLabel: string;
  percentageMet: number;
  totalPoints: number;
  achievedPoints: number;
  totalCriteria: number;
  criteriaMet: number;
  criteriaPartiallyMet: number;
  criteriaNotMet: number;
  description: string;
}

interface AIFeedbackResponse {
  overallFeedback: string;
  overallResult: OverallResult;
  markingDomains: MarkingDomainResult[];
}

interface MarkingDomainWithCriteria {
  domainId: string;
  domainName: string;
  criteria: {
    id: string;
    text: string;
    points: number;
    displayOrder: number;
  }[];
}

// Configuration interface for service initialization
interface AIFeedbackServiceConfig {
  provider?: AIProvider;
  apiKey?: string;
  model?: string;
  log: FastifyBaseLogger;
}

export class AIFeedbackService {
  private openai?: OpenAI;
  private groq?: Groq;
  private provider: AIProvider;
  private model: string;
  private log: FastifyBaseLogger;

  constructor(config: AIFeedbackServiceConfig) {
    this.log = config.log;
    this.provider = config.provider || AIProvider.OPENAI;
    
    // Initialize the appropriate client based on provider
    if (this.provider === AIProvider.OPENAI) {
      this.openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
      });
      this.model = 'gpt-4o';
    } else if (this.provider === AIProvider.GROQ) {
      this.groq = new Groq({
        apiKey:  process.env.GROQ_API_KEY
      });
      this.model = 'openai/gpt-oss-120b';
    } else {
      throw new Error(`Unsupported AI provider: ${this.provider}`);
    }
  }

  private calculatePerformanceClassification(percentageMet: number): {
    classification: PerformanceClassification;
    label: string;
    description: string;
  } {
    if (percentageMet > 75) {
      return {
        classification: PerformanceClassification.CLEAR_PASS,
        label: 'Clear Pass',
        description: 'More than 75% of total points achieved'
      };
    } else if (percentageMet >= 50) {
      return {
        classification: PerformanceClassification.BORDERLINE_PASS,
        label: 'Borderline Pass',
        description: '50% - 75% of total points achieved'
      };
    } else if (percentageMet >= 25) {
      return {
        classification: PerformanceClassification.BORDERLINE_FAIL,
        label: 'Borderline Fail',
        description: '25% - 50% of total points achieved'
      };
    } else {
      return {
        classification: PerformanceClassification.CLEAR_FAIL,
        label: 'Clear Fail',
        description: 'Less than 25% of total points achieved'
      };
    }
  }

  // Helper method to clean JSON response from markdown code blocks
  private cleanJsonResponse(response: string): string {
    // Remove markdown code blocks if present
    let cleaned = response.trim();
    
    // Check for ```json or ``` blocks
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.replace(/^```json\s*/i, '');
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```\s*/, '');
    }
    
    // Remove closing ``` if present
    if (cleaned.endsWith('```')) {
      cleaned = cleaned.replace(/```\s*$/, '');
    }
    
    // Also handle case where the model might add other text before/after JSON
    // Try to extract JSON object between first { and last }
    const jsonStart = cleaned.indexOf('{');
    const jsonEnd = cleaned.lastIndexOf('}');
    
    if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
      cleaned = cleaned.substring(jsonStart, jsonEnd + 1);
    }
    
    return cleaned.trim();
  }

  // New method to handle completions across providers
  private async getCompletion(systemPrompt: string, userPrompt: string): Promise<string> {
    const log = this.log;
    const messages = [
      { role: "system" as const, content: systemPrompt },
      { role: "user" as const, content: userPrompt }
    ];

    const totalPromptLength = systemPrompt.length + userPrompt.length;
    const estimatedTokens = Math.ceil(totalPromptLength / 4); // Rough estimate

    log.info('[AI-API] Preparing completion request', {
      provider: this.provider,
      model: this.model,
      systemPromptLength: systemPrompt.length,
      userPromptLength: userPrompt.length,
      totalPromptLength,
      estimatedInputTokens: estimatedTokens,
      messagesCount: messages.length,
      lifecycle: 'AI_FEEDBACK',
      stage: 'AI_API_CALL',
      step: '3/5',
      action: 'AI_REQUEST_PREPARE',
    });

    if (this.provider === AIProvider.OPENAI && this.openai) {
      log.info('[AI-API] Calling OpenAI API', {
        model: this.model,
        temperature: 0.3,
        maxTokens: 20000,
        responseFormat: 'json_object',
        endpoint: 'chat.completions.create',
        lifecycle: 'AI_FEEDBACK',
        stage: 'AI_API_CALL',
        step: '3/5',
        action: 'OPENAI_API_CALL_START',
      });

      const startTime = Date.now();

      try {
        const completion = await this.openai.chat.completions.create({
          model: this.model,
          messages,
          temperature: 0.3,
          max_tokens: 20000,
          response_format: { type: "json_object" }
        });

        const durationMs = Date.now() - startTime;
        const responseContent = completion.choices[0]?.message?.content;

        log.info('[AI-API] OpenAI API response received', {
          model: this.model,
          durationMs,
          hasContent: !!responseContent,
          responseLength: responseContent?.length || 0,
          promptTokens: completion.usage?.prompt_tokens,
          completionTokens: completion.usage?.completion_tokens,
          totalTokens: completion.usage?.total_tokens,
          finishReason: completion.choices[0]?.finish_reason,
          choicesCount: completion.choices?.length,
          tokensPerSecond: completion.usage?.completion_tokens ? Math.round((completion.usage.completion_tokens / durationMs) * 1000) : null,
          costEstimate: completion.usage?.total_tokens ? `~$${((completion.usage.prompt_tokens || 0) * 0.00001 + (completion.usage.completion_tokens || 0) * 0.00003).toFixed(4)}` : null,
          lifecycle: 'AI_FEEDBACK',
          stage: 'AI_API_CALL',
          step: '3/5',
          action: 'OPENAI_API_CALL_SUCCESS',
        });

        if (!responseContent) {
          log.error('[AI-API] OpenAI returned empty response content', null, {
            model: this.model,
            durationMs,
            finishReason: completion.choices[0]?.finish_reason,
            choicesCount: completion.choices?.length,
            promptTokens: completion.usage?.prompt_tokens,
            completionTokens: completion.usage?.completion_tokens,
            lifecycle: 'AI_FEEDBACK',
            stage: 'AI_API_CALL',
            step: '3/5',
            action: 'OPENAI_EMPTY_RESPONSE',
          });
          throw new Error(`OpenAI returned empty response. Model: ${this.model}, Finish reason: ${completion.choices[0]?.finish_reason}`);
        }
        return responseContent;

      } catch (openaiError) {
        const durationMs = Date.now() - startTime;
        log.error('[AI-API] OpenAI API call FAILED', openaiError, {
          model: this.model,
          durationMs,
          errorType: openaiError instanceof Error ? openaiError.constructor.name : 'Unknown',
          errorMessage: openaiError instanceof Error ? openaiError.message : String(openaiError),
          errorStack: openaiError instanceof Error ? openaiError.stack?.substring(0, 500) : undefined,
          estimatedInputTokens: estimatedTokens,
          lifecycle: 'AI_FEEDBACK',
          stage: 'AI_API_CALL',
          step: '3/5',
          action: 'OPENAI_API_CALL_ERROR',
        });
        throw openaiError;
      }

    } else if (this.provider === AIProvider.GROQ && this.groq) {
      log.info('[AI-API] Calling Groq API', {
        model: this.model,
        temperature: 0.3,
        maxTokens: 20000,
        endpoint: 'chat.completions.create',
        lifecycle: 'AI_FEEDBACK',
        stage: 'AI_API_CALL',
        step: '3/5',
        action: 'GROQ_API_CALL_START',
      });

      const startTime = Date.now();

      try {
        const completion = await this.groq.chat.completions.create({
          model: this.model,
          messages,
          temperature: 0.3,
          max_tokens: 20000
        });

        const durationMs = Date.now() - startTime;
        const responseContent = completion.choices[0]?.message?.content;

        log.info('[AI-API] Groq API response received', {
          model: this.model,
          durationMs,
          hasContent: !!responseContent,
          responseLength: responseContent?.length || 0,
          promptTokens: completion.usage?.prompt_tokens,
          completionTokens: completion.usage?.completion_tokens,
          totalTokens: completion.usage?.total_tokens,
          finishReason: completion.choices[0]?.finish_reason,
          choicesCount: completion.choices?.length,
          tokensPerSecond: completion.usage?.completion_tokens ? Math.round((completion.usage.completion_tokens / durationMs) * 1000) : null,
          lifecycle: 'AI_FEEDBACK',
          stage: 'AI_API_CALL',
          step: '3/5',
          action: 'GROQ_API_CALL_SUCCESS',
        });

        if (!responseContent) {
          log.error('[AI-API] Groq returned empty response content', null, {
            model: this.model,
            durationMs,
            finishReason: completion.choices[0]?.finish_reason,
            choicesCount: completion.choices?.length,
            promptTokens: completion.usage?.prompt_tokens,
            completionTokens: completion.usage?.completion_tokens,
            lifecycle: 'AI_FEEDBACK',
            stage: 'AI_API_CALL',
            step: '3/5',
            action: 'GROQ_EMPTY_RESPONSE',
          });
          throw new Error(`Groq returned empty response. Model: ${this.model}, Finish reason: ${completion.choices[0]?.finish_reason}`);
        }

        // Clean the response from markdown code blocks for Groq
        const cleanedResponse = this.cleanJsonResponse(responseContent);
        const wasMarkdownWrapped = cleanedResponse.length !== responseContent.length;
        const bytesRemoved = responseContent.length - cleanedResponse.length;

        log.debug('[AI-API] Groq response cleaned', {
          originalLength: responseContent.length,
          cleanedLength: cleanedResponse.length,
          bytesRemoved,
          wasMarkdownWrapped,
          responseStartsWith: cleanedResponse.substring(0, 30),
          responseEndsWith: cleanedResponse.substring(cleanedResponse.length - 30),
          lifecycle: 'AI_FEEDBACK',
          stage: 'AI_API_CALL',
          step: '3/5',
          action: 'GROQ_RESPONSE_CLEANED',
        });

        return cleanedResponse;

      } catch (groqError) {
        const durationMs = Date.now() - startTime;
        log.error('[AI-API] Groq API call FAILED', groqError, {
          model: this.model,
          durationMs,
          errorType: groqError instanceof Error ? groqError.constructor.name : 'Unknown',
          errorMessage: groqError instanceof Error ? groqError.message : String(groqError),
          errorStack: groqError instanceof Error ? groqError.stack?.substring(0, 500) : undefined,
          estimatedInputTokens: estimatedTokens,
          lifecycle: 'AI_FEEDBACK',
          stage: 'AI_API_CALL',
          step: '3/5',
          action: 'GROQ_API_CALL_ERROR',
        });
        throw groqError;
      }

    } else {
      log.error('[AI-API] Provider not properly initialized', null, {
        provider: this.provider,
        hasOpenAI: !!this.openai,
        hasGroq: !!this.groq,
        lifecycle: 'AI_FEEDBACK',
        stage: 'AI_API_CALL',
        step: '3/5',
        action: 'PROVIDER_NOT_INITIALIZED',
      });
      throw new Error(`AI provider ${this.provider} not properly initialized. Check API keys and configuration.`);
    }
  }

  async generateFeedback(
    transcript: TranscriptClean,
    caseInfo: CaseInfo,
    caseTabs: CaseTabs,
    sessionDuration: number,
    markingDomainsWithCriteria: MarkingDomainWithCriteria[]
  ): Promise<{
    feedback: AIFeedbackResponse;
    score: number;
    prompts: { systemPrompt: string; userPrompt: string; };
    markingStructure: MarkingDomainWithCriteria[];
  }> {
    const log = this.log;
    const startTime = Date.now();

    const totalCriteria = markingDomainsWithCriteria.reduce((sum, d) => sum + d.criteria.length, 0);
    const totalPossiblePoints = markingDomainsWithCriteria.reduce(
      (sum, d) => sum + d.criteria.reduce((cs, c) => cs + c.points, 0), 0
    );

    log.info('[AI-FEEDBACK] === FEEDBACK GENERATION STARTED ===', {
      provider: this.provider,
      model: this.model,
      caseTitle: caseInfo.caseTitle,
      patientName: caseInfo.patientName,
      diagnosis: caseInfo.diagnosis,
      transcriptMessages: transcript.totalMessages,
      transcriptDuration: transcript.duration,
      sessionDuration,
      markingDomainsCount: markingDomainsWithCriteria.length,
      totalCriteria,
      totalPossiblePoints,
      lifecycle: 'AI_FEEDBACK',
      stage: 'INIT',
      step: '1/5',
      action: 'FEEDBACK_GENERATION_START',
    });

    // Log detailed case context for debugging
    log.debug('[AI-FEEDBACK] [STEP 1/5] Case context details', {
      caseTitle: caseInfo.caseTitle,
      patientName: caseInfo.patientName,
      diagnosis: caseInfo.diagnosis,
      patientAge: caseInfo.patientAge,
      patientGender: caseInfo.patientGender,
      hasDoctorsNote: caseTabs.doctorsNote.length > 0,
      doctorsNoteItems: caseTabs.doctorsNote.length,
      doctorsNotePreview: caseTabs.doctorsNote.length > 0 ? caseTabs.doctorsNote[0]?.substring(0, 100) : null,
      hasPatientScript: caseTabs.patientScript.length > 0,
      patientScriptItems: caseTabs.patientScript.length,
      patientScriptPreview: caseTabs.patientScript.length > 0 ? caseTabs.patientScript[0]?.substring(0, 100) : null,
      hasMedicalNotes: caseTabs.medicalNotes.length > 0,
      medicalNotesItems: caseTabs.medicalNotes.length,
      medicalNotesPreview: caseTabs.medicalNotes.length > 0 ? caseTabs.medicalNotes[0]?.substring(0, 100) : null,
      lifecycle: 'AI_FEEDBACK',
      stage: 'CONTEXT_ANALYSIS',
      step: '1/5',
      action: 'CASE_CONTEXT_DETAILS',
    });

    // Log transcript details
    log.debug('[AI-FEEDBACK] [STEP 1/5] Transcript analysis', {
      totalMessages: transcript.totalMessages,
      duration: transcript.duration,
      firstMessageTimestamp: transcript.messages?.[0]?.timestamp,
      lastMessageTimestamp: transcript.messages?.[transcript.messages?.length - 1]?.timestamp,
      studentMessageCount: transcript.messages?.filter((m: any) => m.speaker === 'student').length || 0,
      aiPatientMessageCount: transcript.messages?.filter((m: any) => m.speaker === 'ai_patient').length || 0,
      averageMessageLength: transcript.messages?.length > 0
        ? Math.round(transcript.messages.reduce((sum: number, m: any) => sum + (m.message?.length || 0), 0) / transcript.messages.length)
        : 0,
      lifecycle: 'AI_FEEDBACK',
      stage: 'CONTEXT_ANALYSIS',
      step: '1/5',
      action: 'TRANSCRIPT_ANALYSIS',
    });

    // Log marking domains structure
    log.debug('[AI-FEEDBACK] [STEP 1/5] Marking domains structure', {
      domainsCount: markingDomainsWithCriteria.length,
      domains: markingDomainsWithCriteria.map(d => ({
        domainId: d.domainId,
        domainName: d.domainName,
        criteriaCount: d.criteria.length,
        points: d.criteria.reduce((sum, c) => sum + c.points, 0),
        criteriaIds: d.criteria.map(c => c.id),
      })),
      lifecycle: 'AI_FEEDBACK',
      stage: 'CONTEXT_ANALYSIS',
      step: '1/5',
      action: 'MARKING_DOMAINS_STRUCTURE',
    });

    // =========================================================================
    // STEP 2: Build AI Prompts
    // =========================================================================
    log.info('[AI-FEEDBACK] [STEP 2/5] Building AI prompts', {
      lifecycle: 'AI_FEEDBACK',
      stage: 'PROMPT_BUILD',
      step: '2/5',
      action: 'PROMPT_BUILD_START',
    });
    const promptBuildStart = Date.now();

    const systemPrompt = this.buildSystemPrompt(caseInfo, caseTabs, markingDomainsWithCriteria);
    const userPrompt = this.buildUserPrompt(transcript, caseInfo, sessionDuration);

    const promptBuildDurationMs = Date.now() - promptBuildStart;
    const estimatedTokens = Math.ceil((systemPrompt.length + userPrompt.length) / 4);

    log.info('[AI-FEEDBACK] [STEP 2/5] Prompts built successfully', {
      systemPromptLength: systemPrompt.length,
      userPromptLength: userPrompt.length,
      totalPromptLength: systemPrompt.length + userPrompt.length,
      estimatedInputTokens: estimatedTokens,
      promptBuildDurationMs,
      systemPromptPreview: systemPrompt.substring(0, 200),
      userPromptPreview: userPrompt.substring(0, 200),
      lifecycle: 'AI_FEEDBACK',
      stage: 'PROMPT_BUILD',
      step: '2/5',
      action: 'PROMPT_BUILD_SUCCESS',
    });

    try {
      // =========================================================================
      // STEP 3: Call AI Provider API
      // =========================================================================
      log.info('[AI-FEEDBACK] [STEP 3/5] Sending request to AI provider', {
        provider: this.provider,
        model: this.model,
        estimatedInputTokens: estimatedTokens,
        maxOutputTokens: 20000,
        temperature: 0.3,
        lifecycle: 'AI_FEEDBACK',
        stage: 'AI_API_CALL',
        step: '3/5',
        action: 'AI_REQUEST_START',
      });

      const aiCallStart = Date.now();
      const responseContent = await this.getCompletion(systemPrompt, userPrompt);
      const aiCallDurationMs = Date.now() - aiCallStart;

      log.info('[AI-FEEDBACK] [STEP 3/5] AI response received', {
        provider: this.provider,
        model: this.model,
        responseLength: responseContent.length,
        estimatedOutputTokens: Math.ceil(responseContent.length / 4),
        aiCallDurationMs,
        tokensPerSecond: Math.round((Math.ceil(responseContent.length / 4) / aiCallDurationMs) * 1000),
        lifecycle: 'AI_FEEDBACK',
        stage: 'AI_API_CALL',
        step: '3/5',
        action: 'AI_RESPONSE_RECEIVED',
      });

      // =========================================================================
      // STEP 4: Parse AI Response
      // =========================================================================
      log.info('[AI-FEEDBACK] [STEP 4/5] Parsing AI response JSON', {
        responseLength: responseContent.length,
        responseStartsWith: responseContent.substring(0, 50),
        responseEndsWith: responseContent.substring(responseContent.length - 50),
        lifecycle: 'AI_FEEDBACK',
        stage: 'RESPONSE_PARSE',
        step: '4/5',
        action: 'JSON_PARSE_START',
      });

      let rawResponse: any;
      const parseStart = Date.now();
      try {
        rawResponse = JSON.parse(responseContent);
      } catch (parseError) {
        const parseDurationMs = Date.now() - parseStart;
        log.error('[AI-FEEDBACK] [STEP 4/5] JSON parse FAILED', parseError, {
          responseLength: responseContent.length,
          responsePreview: responseContent.substring(0, 500),
          responseMiddle: responseContent.substring(Math.floor(responseContent.length / 2) - 100, Math.floor(responseContent.length / 2) + 100),
          responseEnd: responseContent.substring(responseContent.length - 300),
          parseDurationMs,
          errorType: parseError instanceof Error ? parseError.constructor.name : 'Unknown',
          errorMessage: parseError instanceof Error ? parseError.message : String(parseError),
          lifecycle: 'AI_FEEDBACK',
          stage: 'RESPONSE_PARSE',
          step: '4/5',
          action: 'JSON_PARSE_ERROR',
        });
        throw new Error(`Failed to parse AI response as JSON: ${parseError instanceof Error ? parseError.message : 'Unknown parse error'}`);
      }
      const parseDurationMs = Date.now() - parseStart;

      log.info('[AI-FEEDBACK] [STEP 4/5] AI response parsed successfully', {
        hasOverallFeedback: !!rawResponse.overallFeedback,
        overallFeedbackLength: rawResponse.overallFeedback?.length || 0,
        overallFeedbackPreview: rawResponse.overallFeedback?.substring(0, 200) || null,
        markingDomainsCount: rawResponse.markingDomains?.length || 0,
        rawResponseKeys: Object.keys(rawResponse),
        parseDurationMs,
        lifecycle: 'AI_FEEDBACK',
        stage: 'RESPONSE_PARSE',
        step: '4/5',
        action: 'JSON_PARSE_SUCCESS',
      });

      // =========================================================================
      // STEP 5: Calculate Statistics and Build Response
      // =========================================================================
      log.info('[AI-FEEDBACK] [STEP 5/5] Calculating feedback statistics', {
        lifecycle: 'AI_FEEDBACK',
        stage: 'STATISTICS',
        step: '5/5',
        action: 'STATISTICS_CALCULATION_START',
      });

      const statsStart = Date.now();

      // Calculate overall statistics from the raw response
      let totalCriteriaCount = 0;
      let criteriaMetCount = 0;
      let criteriaPartiallyMetCount = 0;
      let totalPossiblePointsCalc = 0;
      let totalAchievedPoints = 0;

      // Keep the full structure with points
      const fullDomains: MarkingDomainResult[] = rawResponse.markingDomains.map((domain: any, domainIndex: number) => {
        let domainAchievedPoints = 0;
        let domainTotalPoints = 0;
        let domainCriteriaMet = 0;

        log.debug(`[AI-FEEDBACK] [STEP 5/5] Processing domain ${domainIndex + 1}/${rawResponse.markingDomains.length}: ${domain.domainName}`, {
          domainId: domain.domainId,
          domainName: domain.domainName,
          criteriaCount: domain.criteria?.length || 0,
          lifecycle: 'AI_FEEDBACK',
          stage: 'STATISTICS',
          step: '5/5',
          action: 'DOMAIN_PROCESSING',
        });

        const fullCriteria: MarkingCriterionResult[] = domain.criteria.map((criterion: any) => {
          totalCriteriaCount++;

          // Use the points value echoed by the LLM — it reads directly from the
          // prompt template where the DB value is baked in ("points": N), so
          // this is always the correct DB value without needing a separate lookup.
          const points = typeof criterion.points === 'number' ? criterion.points : 0;
          totalPossiblePointsCalc += points;
          domainTotalPoints += points;

          // Normalise status — accept legacy boolean `met` from older LLM responses
          const rawStatus: string = criterion.status ?? (criterion.met === true ? 'MET' : 'NOT_MET');
          const status: 'MET' | 'PARTIALLY_MET' | 'NOT_MET' =
            rawStatus === 'MET' ? 'MET'
            : rawStatus === 'PARTIALLY_MET' ? 'PARTIALLY_MET'
            : 'NOT_MET';

          let earned = 0;
          if (status === 'MET') {
            earned = points;
            criteriaMetCount++;
            domainCriteriaMet++;
          } else if (status === 'PARTIALLY_MET') {
            earned = points * 0.5;
            criteriaPartiallyMetCount++;
          }

          totalAchievedPoints += earned;
          domainAchievedPoints += earned;

          return {
            criterionId: criterion.criterionId,
            criterionText: criterion.criterionText,
            points,
            achievedPoints: earned,
            status,
            transcriptReferences: criterion.transcriptReferences,
            feedback: criterion.feedback
          };
        });

        log.debug(`[AI-FEEDBACK] [STEP 5/5] Domain "${domain.domainName}" processed`, {
          domainId: domain.domainId,
          domainName: domain.domainName,
          totalPoints: domainTotalPoints,
          achievedPoints: domainAchievedPoints,
          percentageScore: domainTotalPoints > 0 ? Math.round((domainAchievedPoints / domainTotalPoints) * 100) : 0,
          criteriaCount: fullCriteria.length,
          criteriaMet: domainCriteriaMet,
          criteriaNotMet: fullCriteria.length - domainCriteriaMet,
          lifecycle: 'AI_FEEDBACK',
          stage: 'STATISTICS',
          step: '5/5',
          action: 'DOMAIN_PROCESSED',
        });

        return {
          domainId: domain.domainId,
          domainName: domain.domainName,
          totalPossiblePoints: domainTotalPoints,
          achievedPoints: domainAchievedPoints,
          percentageScore: domainTotalPoints > 0
            ? Math.round((domainAchievedPoints / domainTotalPoints) * 100)
            : 0,
          criteria: fullCriteria
        };
      });

      // Core scoring: points achieved / total points possible
      const percentageMet = totalPossiblePointsCalc > 0
        ? (totalAchievedPoints / totalPossiblePointsCalc) * 100
        : 0;
      const score = Math.round(percentageMet);
      const classification = this.calculatePerformanceClassification(percentageMet);
      const statsDurationMs = Date.now() - statsStart;

      log.info('[AI-FEEDBACK] [STEP 5/5] Feedback statistics calculated', {
        totalCriteria: totalCriteriaCount,
        criteriaMet: criteriaMetCount,
        criteriaPartiallyMet: criteriaPartiallyMetCount,
        criteriaNotMet: totalCriteriaCount - criteriaMetCount - criteriaPartiallyMetCount,
        percentageMet: Math.round(percentageMet * 10) / 10,
        totalPoints: totalPossiblePointsCalc,
        achievedPoints: totalAchievedPoints,
        score,
        classification: classification.classification,
        classificationLabel: classification.label,
        domainsProcessed: fullDomains.length,
        statsDurationMs,
        lifecycle: 'AI_FEEDBACK',
        stage: 'STATISTICS',
        step: '5/5',
        action: 'STATISTICS_CALCULATED',
      });

      // Log per-domain results for debugging
      log.debug('[AI-FEEDBACK] [STEP 5/5] Per-domain breakdown', {
        domains: fullDomains.map(d => ({
          domainId: d.domainId,
          domainName: d.domainName,
          achievedPoints: d.achievedPoints,
          totalPossiblePoints: d.totalPossiblePoints,
          percentageScore: d.percentageScore,
          criteriaCount: d.criteria.length,
          criteriaMet: d.criteria.filter(c => c.status === 'MET').length,
          criteriaPartiallyMet: d.criteria.filter(c => c.status === 'PARTIALLY_MET').length,
          criteriaNotMet: d.criteria.filter(c => c.status === 'NOT_MET').length,
        })),
        lifecycle: 'AI_FEEDBACK',
        stage: 'STATISTICS',
        step: '5/5',
        action: 'DOMAIN_BREAKDOWN',
      });

      // Log criteria not fully met for debugging
      const unmetCriteria = fullDomains.flatMap(d =>
        d.criteria.filter(c => c.status !== 'MET').map(c => ({
          domainName: d.domainName,
          criterionId: c.criterionId,
          criterionText: c.criterionText.substring(0, 100),
          status: c.status,
          points: c.points,
          achievedPoints: c.achievedPoints,
          feedback: c.feedback?.substring(0, 100),
        }))
      );

      if (unmetCriteria.length > 0) {
        log.debug('[AI-FEEDBACK] [STEP 5/5] Criteria not fully met', {
          count: unmetCriteria.length,
          criteria: unmetCriteria.slice(0, 10),
          lifecycle: 'AI_FEEDBACK',
          stage: 'STATISTICS',
          step: '5/5',
          action: 'UNMET_CRITERIA',
        });
      }

      const aiResponse: AIFeedbackResponse = {
        overallFeedback: rawResponse.overallFeedback,
        overallResult: {
          classification: classification.classification,
          classificationLabel: classification.label,
          percentageMet: Math.round(percentageMet * 10) / 10,
          totalPoints: totalPossiblePointsCalc,
          achievedPoints: Math.round(totalAchievedPoints * 10) / 10,
          totalCriteria: totalCriteriaCount,
          criteriaMet: criteriaMetCount,
          criteriaPartiallyMet: criteriaPartiallyMetCount,
          criteriaNotMet: totalCriteriaCount - criteriaMetCount - criteriaPartiallyMetCount,
          description: classification.description
        },
        markingDomains: fullDomains
      };

      const totalDurationMs = Date.now() - startTime;

      log.info('[AI-FEEDBACK] === FEEDBACK GENERATION COMPLETED SUCCESSFULLY ===', {
        provider: this.provider,
        model: this.model,
        score,
        classification: classification.classification,
        classificationLabel: classification.label,
        criteriaMet: criteriaMetCount,
        criteriaPartiallyMet: criteriaPartiallyMetCount,
        criteriaNotMet: totalCriteriaCount - criteriaMetCount - criteriaPartiallyMetCount,
        totalCriteria: totalCriteriaCount,
        percentageMet: Math.round(percentageMet * 10) / 10,
        totalPoints: totalPossiblePointsCalc,
        achievedPoints: totalAchievedPoints,
        overallFeedbackLength: aiResponse.overallFeedback?.length || 0,
        domainsCount: fullDomains.length,
        // Timing breakdown
        totalDurationMs,
        promptBuildDurationMs,
        aiCallDurationMs,
        parseDurationMs,
        statsDurationMs,
        // Performance metrics
        tokensPerSecond: Math.round((Math.ceil(responseContent.length / 4) / aiCallDurationMs) * 1000),
        lifecycle: 'AI_FEEDBACK',
        stage: 'COMPLETE',
        step: 'COMPLETE',
        action: 'FEEDBACK_GENERATION_SUCCESS',
      });

      return {
        feedback: aiResponse,
        score: score,
        prompts: {
          systemPrompt,
          userPrompt
        },
        markingStructure: markingDomainsWithCriteria
      };

    } catch (error) {
      const totalDurationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      const errorType = error instanceof Error ? error.constructor.name : 'Unknown';

      log.error('[AI-FEEDBACK] === FEEDBACK GENERATION FAILED ===', error, {
        provider: this.provider,
        model: this.model,
        caseTitle: caseInfo.caseTitle,
        patientName: caseInfo.patientName,
        diagnosis: caseInfo.diagnosis,
        transcriptMessages: transcript.totalMessages,
        transcriptDuration: transcript.duration,
        sessionDuration,
        markingDomainsCount: markingDomainsWithCriteria.length,
        totalCriteria,
        totalPossiblePoints,
        errorType,
        errorMessage,
        errorStack: errorStack?.substring(0, 1500),
        totalDurationMs,
        lifecycle: 'AI_FEEDBACK',
        stage: 'ERROR',
        step: 'ERROR',
        action: 'FEEDBACK_GENERATION_ERROR',
      });

      // Re-throw with more context
      throw new Error(
        `AI feedback generation failed after ${totalDurationMs}ms. ` +
        `Provider: ${this.provider}, Model: ${this.model}. ` +
        `Error: ${errorMessage}`
      );
    }
  }
  
  private buildSystemPrompt(
    caseInfo: CaseInfo,
    caseTabs: CaseTabs,
    markingDomainsWithCriteria: MarkingDomainWithCriteria[]
  ): string {

    const totalPossiblePoints = markingDomainsWithCriteria.reduce((sum, domain) =>
      sum + domain.criteria.reduce((domainSum, criterion) => domainSum + criterion.points, 0), 0
    );

    const totalCriteria = markingDomainsWithCriteria.reduce((sum, domain) =>
      sum + domain.criteria.length, 0
    );

    // Add explicit JSON instruction for Groq since it doesn't have response_format
    const jsonInstruction = this.provider === AIProvider.GROQ
      ? '\n\nCRITICAL: Return ONLY the raw JSON object. Do NOT wrap it in markdown code blocks (no ```json or ```). Do NOT add any text before or after the JSON. Start directly with { and end with }.'
      : '';

    return `You are an expert medical examiner evaluating a medical student's performance during a simulated patient consultation.

PATIENT CASE CONTEXT:
- Patient Name: ${caseInfo.patientName}
- Case Title: ${caseInfo.caseTitle}
- Diagnosis: ${caseInfo.diagnosis}
${caseInfo.patientAge ? `- Patient Age: ${caseInfo.patientAge}` : ''}
${caseInfo.patientGender ? `- Patient Gender: ${caseInfo.patientGender}` : ''}

================================
MARKING CRITERIA:
================================
Total Possible Points: ${totalPossiblePoints}
Total Criteria to Evaluate: ${totalCriteria}

${markingDomainsWithCriteria.map((domain, index) => {
  const domainPoints = domain.criteria.reduce((sum, c) => sum + c.points, 0);
  return `
DOMAIN ${index + 1}: ${domain.domainName}
Domain ID: ${domain.domainId}
Total Points in Domain: ${domainPoints}
Number of Criteria: ${domain.criteria.length}
Criteria to Evaluate:
${domain.criteria.map((criterion, cIndex) => `
  ${cIndex + 1}. [ID: ${criterion.id}] ${criterion.text}
     Points: ${criterion.points}
     Evaluate as MET, PARTIALLY_MET, or NOT_MET based on the transcript.`).join('')}`;
}).join('\n')}

================================
PERFORMANCE CLASSIFICATION RULES:
================================
Based on total points achieved / total points possible:
- Clear Pass: More than 75% of total points achieved
- Borderline Pass: 50% - 75% of total points achieved
- Borderline Fail: 25% - 50% of total points achieved
- Clear Fail: Less than 25% of total points achieved


EVALUATION INSTRUCTIONS:
1. For EACH criterion assign one of three statuses:
  - MET: The student clearly and sufficiently demonstrated this criterion. Full points awarded.
  - PARTIALLY_MET: The student showed some evidence but the demonstration was incomplete (e.g., asked about a symptom but did not follow up, mentioned a diagnosis but did not explain it). Half points awarded.
  - NOT_MET: No evidence in the transcript. Zero points awarded.
  - Provide 1-3 EXACT quotes from the transcript supporting your decision
  - Provide feedback explaining your decision

2. Points: MET = full points, PARTIALLY_MET = half points (rounded down if odd), NOT_MET = 0 points

3. ASSESS CLINICAL INTENT OVER EXACT TERMINOLOGY: If the student conveys the correct clinical concept using different, indirect, or implied language, the criterion MUST be marked as MET or PARTIALLY_MET according to context. Students often communicate clinical concepts conversationally rather than in textbook language — this is acceptable and professional. Do NOT require explicit or textbook phrasing. If the underlying clinical message was communicated, even indirectly or implicitly, mark as MET. Only mark NOT_MET if the clinical concept was genuinely absent from the consultation.

4. INFORMATION ALREADY PROVIDED BY PATIENT = CRITERION MET: If a criterion requires the student to "ask about X" but the patient has already mentioned X at any point in the conversation (unprompted or in response to another question), mark that criterion as MET. The student does NOT need to re-ask for information already disclosed by the patient. Example: criterion says "Asks about duration of symptoms" but the patient already said "I've had this for 3 days" earlier in the conversation → mark MET even if the student never specifically asked about duration.

5. TEXT TRANSCRIPT ONLY — you cannot assess tone of voice, facial expressions, or body language. For interpersonal and communication criteria, simple verbal acknowledgments ARE sufficient (e.g., "I'm sorry", "I understand", "That must be difficult"). Brief empathetic statements COUNT as meeting empathy criteria.


RESPONSE FORMAT:${jsonInstruction}
You must respond with a valid JSON object in this exact structure:
{
 "overallFeedback": "2-3 sentence summary of the student's performance",
 "markingDomains": [
${markingDomainsWithCriteria.map(domain => {
 const domainPoints = domain.criteria.reduce((sum, c) => sum + c.points, 0);
 return `    {
     "domainId": "${domain.domainId}",
     "domainName": "${domain.domainName}",
     "totalPossiblePoints": ${domainPoints},
     "achievedPoints": sum_of_met_criteria_points,
     "percentageScore": domain_percentage,
     "criteria": [
${domain.criteria.map(criterion => `        {
         "criterionId": "${criterion.id}",
         "criterionText": "${criterion.text}",
         "points": ${criterion.points},
         "status": "MET" | "PARTIALLY_MET" | "NOT_MET",
         "transcriptReferences": ["exact quote 1", "exact quote 2"],
         "feedback": "Explanation of your evaluation decision"
       }`).join(',\n')}
     ]
   }`}).join(',\n')}
 ]
}`;
 }


 private buildUserPrompt(
   transcript: TranscriptClean,
   caseInfo: CaseInfo,
   sessionDuration: number
 ): string {

   const conversationText = transcript.messages
     .map(msg => {
       const speaker = msg.speaker.toLowerCase().includes('student') || msg.speaker.toLowerCase().includes('doctor')
         ? 'STUDENT'
         : 'PATIENT';
       return `[${msg.timestamp}] ${speaker}: ${msg.message}`;
     })
     .join('\n');


   // Additional JSON reminder for Groq
   const jsonReminder = this.provider === AIProvider.GROQ
     ? '\n\nFINAL REMINDER: Output ONLY the raw JSON object starting with { and ending with }. No markdown, no code blocks, no explanations.'
     : '';


   return `Please evaluate this medical student's consultation performance:


CONSULTATION TRANSCRIPT:
${conversationText}


SESSION DETAILS:
- Total Duration: ${Math.floor(sessionDuration / 60)} minutes ${sessionDuration % 60} seconds
- Total Messages: ${transcript.totalMessages}
- Case: ${caseInfo.caseTitle}


CRITICAL INSTRUCTIONS:
1. Evaluate EACH criterion as MET (full points), PARTIALLY_MET (half points), or NOT_MET (0 points)
2. Provide 1-3 EXACT quotes from the transcript for each criterion
3. CLINICAL INTENT: Award MET if the correct clinical concept was communicated — even if phrased conversationally or indirectly. Do NOT penalise for non-textbook language.
4. PATIENT-DISCLOSED INFO: If the patient has already mentioned information relevant to a criterion at any point in the conversation, mark that criterion as MET — the student does not need to ask again.
5. TEXT ONLY: Verbal acknowledgments are sufficient for empathy and communication criteria.

Remember:
- Clear Pass: >75% of total points
- Borderline Pass: 50–75%
- Borderline Fail: 25–50%
- Clear Fail: <25%


Please provide your evaluation in the required JSON format.${jsonReminder}`;
 }

  // ===========================================================================
  // Phase 6: Mock-exam cross-station summary
  // ===========================================================================
  // Produces a 2-3 paragraph examiner-tone narrative + 3-5 specific
  // recommendations across an entire finished mock exam. Caller is
  // MockExamAttemptService.getSummary; cached by the caller in
  // MockExamAttempt.aiSummary on success. Failed generation throws and
  // the caller propagates a 502 — failed generation does NOT cache.

  async generateMockExamSummary(input: MockExamSummaryInput): Promise<MockExamSummaryResponse> {
    const log = this.log;
    const startTime = Date.now();

    log.info('[AI-API] generateMockExamSummary START', {
      examTitle: input.examTitle,
      stationCount: input.stations.length,
      successfulStations: input.stations.filter(s => s.analysisStatus === 'success').length,
      failedStations: input.stations.filter(s => s.analysisStatus === 'failed').length,
      lifecycle: 'MOCK_EXAM_SUMMARY',
      stage: 'GENERATE',
      action: 'START',
    });

    const systemPrompt = this.buildMockExamSummarySystemPrompt();
    const userPrompt = this.buildMockExamSummaryUserPrompt(input);

    const responseContent = await this.getCompletion(systemPrompt, userPrompt);

    let parsed: unknown;
    try {
      parsed = JSON.parse(responseContent);
    } catch (err) {
      log.error('[AI-API] generateMockExamSummary failed to parse JSON', err, {
        responsePreview: responseContent.substring(0, 200),
      });
      throw new Error(`Mock exam summary returned invalid JSON: ${err instanceof Error ? err.message : String(err)}`);
    }

    const result = parsed as Partial<MockExamSummaryResponse>;
    if (!result || typeof result.summary !== 'string' || !Array.isArray(result.recommendations)) {
      throw new Error(`Mock exam summary missing required fields. Got keys: ${Object.keys(result || {}).join(', ')}`);
    }

    // Coerce recommendations to strings, trim, drop empties.
    const recommendations = (result.recommendations as unknown[])
      .map((r) => (typeof r === 'string' ? r.trim() : ''))
      .filter((r) => r.length > 0);

    if (recommendations.length === 0) {
      throw new Error('Mock exam summary returned no recommendations');
    }

    const durationMs = Date.now() - startTime;
    log.info('[AI-API] generateMockExamSummary SUCCESS', {
      durationMs,
      summaryLength: result.summary.length,
      recommendationsCount: recommendations.length,
      lifecycle: 'MOCK_EXAM_SUMMARY',
      stage: 'GENERATE',
      action: 'SUCCESS',
    });

    return {
      summary: result.summary.trim(),
      recommendations,
      generatedAt: new Date().toISOString(),
    };
  }

  private buildMockExamSummarySystemPrompt(): string {
    return `You are an OSCE examiner giving a post-circuit debrief to a medical student who has just finished a mock exam. You will receive structured JSON describing their performance across multiple stations, including per-domain scores aggregated across the whole exam. Write a concise, actionable debrief in the tone of a clinical examiner — direct, professional, encouraging where deserved, honest where needed.

OUTPUT FORMAT — return ONLY a JSON object with these exact keys:
{
  "summary": "<string>",
  "recommendations": ["<string>", "<string>", ...]
}

CONTENT RULES:
1. summary: 2–3 paragraphs of natural-language prose structured as follows:
   - Paragraph 1: Overall impression across the circuit — what the student did consistently well and where they consistently fell short. Reference domains by name (e.g. "Clinical Reasoning", "Communication Skills"). Use the domainBreakdown STRENGTH/MODERATE/WEAKNESS categories to anchor your observations.
   - Paragraph 2: Domain-level analysis — for each domain that is WEAKNESS or MODERATE, describe what was missing in specific clinical terms (e.g. "In History Taking, you frequently omitted follow-up questions after identifying a presenting complaint" rather than "you scored poorly in History Taking"). For STRENGTH domains, briefly acknowledge the consistency.
   - Paragraph 3: Cross-station patterns — note any recurring behaviours across stations (e.g. "safety-netting was absent in the majority of stations", "your examination technique was methodical but lacked verbal commentary"). Note trajectories if visible. Avoid restating numbers — the student already sees those in the breakdown.

2. recommendations: 3–5 specific, prioritised action items. Each must:
   - Reference a named domain AND a specific clinical behaviour to change
   - Be actionable — tell the student exactly what to do differently next time
   - NOT use generic phrases like "practice more", "revise X", "review the marking criteria"
   - Be 1–2 sentences maximum

STRICT RULES:
- DO NOT fabricate cross-station patterns from a single data point. If only 2 stations are present, frame observations cautiously.
- DO NOT mention stations whose analysisStatus is "failed" as if you evaluated them. If failed stations exist, acknowledge the gap ("This summary is based on the N stations that were successfully graded").
- DO NOT use bullet lists, headings, or markdown inside the "summary" field — continuous prose only.
- DO NOT include raw scores or percentages in the summary — describe performance qualitatively.
- DO maintain examiner tone: direct, clinical, no exclamation marks, no emoji, no "You did great!".
- DO NOT invent criteria, domains, or behaviours not present in the input data.
- The domainBreakdown field shows aggregated performance across ALL stations — this is your primary signal for domain-level strengths and weaknesses. Use it.

Return only the JSON object. No prose before or after.`;
  }

  private buildMockExamSummaryUserPrompt(input: MockExamSummaryInput): string {
    return `Mock exam debrief input (structured JSON below).

${JSON.stringify(input, null, 2)}

Write the JSON response described in the system prompt now.`;
  }
}

// ===========================================================================
// Phase 6 types — exported for callers
// ===========================================================================

export interface MockExamSummaryStationDomain {
  domainName: string;
  achievedPoints: number;
  totalPossiblePoints: number;
  percentage: number;
}

export interface MockExamSummaryStation {
  displayOrder: number;
  caseTitle: string;
  score: number | null;
  classificationLabel: string | null;
  overallFeedback: string | null;
  analysisStatus: 'success' | 'failed';
  domains: MockExamSummaryStationDomain[];
}

export interface MockExamSummaryDomainBreakdown {
  domainName: string;
  percentage: number;
  category: 'STRENGTH' | 'MODERATE' | 'WEAKNESS';
}

export interface MockExamSummaryInput {
  examTitle: string;
  overallScore: number | null;
  stations: MockExamSummaryStation[];
  domainBreakdown: MockExamSummaryDomainBreakdown[];
}

export interface MockExamSummaryResponse {
  summary: string;
  recommendations: string[];
  generatedAt: string;
}


// Export both the class and the enum for external use
export { AIProvider };

// Factory function for easier instantiation
export function createAIFeedbackService(config: AIFeedbackServiceConfig): AIFeedbackService {
  return new AIFeedbackService(config);
}

export function aiFeedbackService(log: FastifyBaseLogger): AIFeedbackService {
  return new AIFeedbackService({ log });
}