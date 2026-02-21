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
  met: boolean;
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
  totalCriteria: number;
  criteriaMet: number;
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
        description: 'More than 75% of checklist items met'
      };
    } else if (percentageMet >= 50) {
      return {
        classification: PerformanceClassification.BORDERLINE_PASS,
        label: 'Borderline Pass',
        description: '50% - 75% of checklist items met'
      };
    } else if (percentageMet >= 25) {
      return {
        classification: PerformanceClassification.BORDERLINE_FAIL,
        label: 'Borderline Fail',
        description: '25% - 50% of checklist items met'
      };
    } else {
      return {
        classification: PerformanceClassification.CLEAR_FAIL,
        label: 'Clear Fail',
        description: 'Less than 25% of checklist items met'
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
          totalPossiblePointsCalc += criterion.points;
          domainTotalPoints += criterion.points;

          if (criterion.met) {
            criteriaMetCount++;
            totalAchievedPoints += criterion.points;
            domainAchievedPoints += criterion.points;
            domainCriteriaMet++;
          }

          return {
            criterionId: criterion.criterionId,
            criterionText: criterion.criterionText,
            points: criterion.points,
            met: criterion.met,
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

      const percentageMet = totalCriteriaCount > 0 ? (criteriaMetCount / totalCriteriaCount) * 100 : 0;
      const classification = this.calculatePerformanceClassification(percentageMet);
      const statsDurationMs = Date.now() - statsStart;

      log.info('[AI-FEEDBACK] [STEP 5/5] Feedback statistics calculated', {
        totalCriteria: totalCriteriaCount,
        criteriaMet: criteriaMetCount,
        criteriaNotMet: totalCriteriaCount - criteriaMetCount,
        percentageMet: Math.round(percentageMet * 10) / 10,
        classification: classification.classification,
        classificationLabel: classification.label,
        classificationDescription: classification.description,
        totalPossiblePoints: totalPossiblePointsCalc,
        totalAchievedPoints,
        scorePercentage: totalPossiblePointsCalc > 0 ? Math.round((totalAchievedPoints / totalPossiblePointsCalc) * 100) : 0,
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
          criteriaMet: d.criteria.filter(c => c.met).length,
          criteriaNotMet: d.criteria.filter(c => !c.met).length,
        })),
        lifecycle: 'AI_FEEDBACK',
        stage: 'STATISTICS',
        step: '5/5',
        action: 'DOMAIN_BREAKDOWN',
      });

      // Log criteria that were NOT met for debugging
      const unmetCriteria = fullDomains.flatMap(d =>
        d.criteria.filter(c => !c.met).map(c => ({
          domainName: d.domainName,
          criterionId: c.criterionId,
          criterionText: c.criterionText.substring(0, 100),
          points: c.points,
          feedback: c.feedback?.substring(0, 100),
        }))
      );

      if (unmetCriteria.length > 0) {
        log.debug('[AI-FEEDBACK] [STEP 5/5] Criteria NOT met', {
          unmetCount: unmetCriteria.length,
          unmetCriteria: unmetCriteria.slice(0, 10), // Limit to first 10
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
          totalCriteria: totalCriteriaCount,
          criteriaMet: criteriaMetCount,
          criteriaNotMet: totalCriteriaCount - criteriaMetCount,
          description: classification.description
        },
        markingDomains: fullDomains
      };

      const score = totalPossiblePointsCalc > 0
        ? Math.round((totalAchievedPoints / totalPossiblePointsCalc) * 100)
        : 0;

      const totalDurationMs = Date.now() - startTime;

      log.info('[AI-FEEDBACK] === FEEDBACK GENERATION COMPLETED SUCCESSFULLY ===', {
        provider: this.provider,
        model: this.model,
        score,
        classification: classification.classification,
        classificationLabel: classification.label,
        criteriaMet: criteriaMetCount,
        criteriaNotMet: totalCriteriaCount - criteriaMetCount,
        totalCriteria: totalCriteriaCount,
        percentageMet: Math.round(percentageMet * 10) / 10,
        totalPossiblePoints: totalPossiblePointsCalc,
        totalAchievedPoints,
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
     Evaluate if MET or NOT MET based on the transcript.`).join('')}`;
}).join('\n')}

================================
PERFORMANCE CLASSIFICATION RULES:
================================
Based on the percentage of criteria MET:
- Clear Pass: More than 75% of criteria met
- Borderline Pass: 50% - 75% of criteria met
- Borderline Fail: 25% - 50% of criteria met
- Clear Fail: Less than 25% of criteria met


EVALUATION INSTRUCTIONS:
1. For EACH criterion:
  - Determine if it was MET (demonstrated) or NOT MET (not/partially demonstrated). If a criterion is partially demonstrated at >75% completion, accept it as MET.
  - Provide 1-3 EXACT quotes from the transcript supporting your decision
  - Provide feedback explaining your decision

2. Criteria are binary - either MET (full points) or NOT MET (0 points)
3. Be strict but fair - the student must demonstrate competency based on the expected standards
4. Count the total number of criteria MET vs NOT MET for classification
5. This evaluation is based on TEXT TRANSCRIPT ONLY - you cannot assess tone of voice, facial expressions, or body language. So in any interpersonal skills marking criteria, simple verbal acknowledgments ARE sufficient (e.g., "I'm sorry", "I understand", "That must be difficult"). Brief empathetic statements COUNT as meeting empathy criteria.
6. If information is volunteered by the patient without the student asking, the student does not need to gather this information again - the criterion can still be met.


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
         "met": true_or_false,
         "transcriptReferences": ["exact quote 1", "exact quote 2"],
         "feedback": "Explanation of your evaluation"
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
1. Compare the student's performance against the marking criteria provided
2. Evaluate EACH criterion as either MET or NOT MET (binary decision). If a criterion is partially demonstrated at >75% completion, accept it as MET
3. Provide 1-3 EXACT quotes from the transcript for each criterion
4. Calculate points: MET = full points, NOT MET = 0 points
5. Be aware that the overall classification depends on the percentage of criteria MET
6. This evaluation is based on TEXT TRANSCRIPT ONLY - you cannot assess tone of voice, facial expressions, or body language. So in any interpersonal skills marking criteria, simple verbal acknowledgments ARE sufficient (e.g., "I'm sorry", "I understand", "That must be difficult"). Brief empathetic statements COUNT as meeting empathy criteria.


Remember:
- Clear Pass requires >75% of criteria MET
- Borderline Pass requires 50-75% of criteria MET
- Borderline Fail requires 25-50% of criteria MET
- Clear Fail is <25% of criteria MET


Please provide your evaluation in the required JSON format.${jsonReminder}`;
 }
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