export const ROLES = Object.freeze({
  planner: Object.freeze({
    name: 'Planner',
    description: 'Analyzes requirements, decomposes tasks into hierarchical DAGs, and specifies acceptance criteria',
    defaultTools: { read: true, glob: true, grep: true, write: false, bash: false },
    weights: { reasoning: 0.45, context: 0.30, toolCalling: 0.15, speed: 0.10, coding: 0.0 }
  }),
  implementer: Object.freeze({
    name: 'Implementer',
    description: 'Writes clean code, creates files, and implements features according to plan',
    defaultTools: { read: true, write: true, glob: true, grep: true, bash: false },
    weights: { coding: 0.45, toolCalling: 0.25, reasoning: 0.20, speed: 0.10, context: 0.0 }
  }),
  researcher: Object.freeze({
    name: 'Researcher',
    description: 'Explores repositories, scans dependencies, and investigates documentation/APIs',
    defaultTools: { read: true, glob: true, grep: true, write: false, bash: false },
    weights: { speed: 0.35, context: 0.35, reasoning: 0.20, toolCalling: 0.10, coding: 0.0 }
  }),
  debugger: Object.freeze({
    name: 'Debugger',
    description: 'Investigates test failures, runtime errors, and inspects logs to fix defects',
    defaultTools: { read: true, write: true, glob: true, grep: true, bash: true },
    weights: { reasoning: 0.35, coding: 0.30, toolCalling: 0.25, speed: 0.10, context: 0.0 }
  }),
  tester: Object.freeze({
    name: 'Tester',
    description: 'Runs unit and integration test suites, parses test outputs, and checks assertions',
    defaultTools: { read: true, bash: true, glob: true, grep: true, write: false },
    weights: { speed: 0.40, toolCalling: 0.30, coding: 0.20, reasoning: 0.10, context: 0.0 }
  }),
  reviewer: Object.freeze({
    name: 'Reviewer',
    description: 'Reviews code diffs, verifies acceptance criteria, and enforces style guidelines',
    defaultTools: { read: true, glob: true, grep: true, write: false, bash: false },
    weights: { reasoning: 0.40, context: 0.25, coding: 0.25, speed: 0.10, toolCalling: 0.0 }
  })
});

export const POLICIES = Object.freeze({
  FREE_ONLY: 'free_only',
  FREE_PREFERRED: 'free_preferred',
  PAID_ALLOWED: 'paid_allowed'
});

export const qualifyModelId = (provider, modelId) => `${provider}/${modelId}`;

export function parseModelId(qualifiedOrModelId, defaultProvider = null) {
  if (typeof qualifiedOrModelId !== 'string') return null;
  const parts = qualifiedOrModelId.split('/');
  if (parts.length >= 2 && ['gemini', 'groq', 'openrouter', 'ollama'].includes(parts[0])) {
    return { provider: parts[0], modelId: parts.slice(1).join('/') };
  }
  return defaultProvider ? { provider: defaultProvider, modelId: qualifiedOrModelId } : null;
}

export function getAllModels(catalog) {
  if (!catalog?.providers) return [];
  const result = [];
  for (const [provider, entry] of Object.entries(catalog.providers)) {
    if (!entry.enabled || !entry.allowed) continue;
    if (entry.modelsDetailed) {
      for (const [modelId, details] of Object.entries(entry.modelsDetailed)) {
        result.push({
          ...details,
          qualifiedId: qualifyModelId(provider, modelId)
        });
      }
    } else if (Array.isArray(entry.models)) {
      for (const modelId of entry.models) {
        const cap = entry.capabilities?.[modelId] || {};
        result.push({
          id: modelId,
          qualifiedId: qualifyModelId(provider, modelId),
          provider,
          name: modelId,
          tier: 'free',
          freeTierVerified: true,
          pricing: { prompt: 0, completion: 0, request: 0 },
          contextWindow: cap.contextWindow || 8192,
          maxOutputTokens: cap.maxOutputTokens || 1800,
          tools: cap.tools !== false,
          capabilities: {
            reasoning: 3.5,
            coding: cap.codingApproved ? 4.0 : 3.0,
            speed: 4.0,
            context: (cap.contextWindow || 8192) >= 32768 ? 4.0 : 3.0,
            toolCalling: cap.tools !== false
          },
          isVerified: true,
          source: cap.source || `${provider}-legacy-catalog`
        });
      }
    }
  }
  return result;
}

export function getModel(catalog, qualifiedOrProviderId, modelId = null) {
  const all = getAllModels(catalog);
  if (modelId) {
    const qid = qualifyModelId(qualifiedOrProviderId, modelId);
    return all.find(m => m.qualifiedId === qid || (m.provider === qualifiedOrProviderId && m.id === modelId)) || null;
  }
  return all.find(m => m.qualifiedId === qualifiedOrProviderId || m.id === qualifiedOrProviderId) || null;
}

export function filterModelsByPolicy(models, policy = POLICIES.FREE_ONLY) {
  if (!Array.isArray(models)) return [];
  if (policy === POLICIES.FREE_ONLY) {
    return models.filter(m => m.tier === 'free' && m.freeTierVerified === true &&
      m.pricing?.prompt === 0 && m.pricing?.completion === 0);
  }
  return models;
}

export function scoreModelForRole(model, roleName, policy = POLICIES.FREE_ONLY) {
  const role = ROLES[roleName] || ROLES.implementer;
  const caps = model.capabilities || {};
  const weights = role.weights;

  // Base capabilities (normalized 0 to 100)
  const reasoningScore = (caps.reasoning || 3.0) * 20;
  const codingScore = (caps.coding || 3.0) * 20;
  const speedScore = (caps.speed || 3.0) * 20;
  const contextScore = (caps.context || 3.0) * 20;

  // Tool requirement penalty: if role requires tools and model doesn't support them, harsh penalty
  const toolScore = model.tools ? 100 : 0;
  if (!model.tools && (roleName === 'implementer' || roleName === 'debugger' || roleName === 'tester')) {
    return 0; // Ineligible for roles requiring tool executions
  }

  let totalScore =
    (reasoningScore * weights.reasoning) +
    (codingScore * weights.coding) +
    (speedScore * weights.speed) +
    (contextScore * weights.context) +
    (toolScore * weights.toolCalling);

  // Policy bonus / penalty:
  if (policy === POLICIES.FREE_PREFERRED) {
    if (model.tier === 'free') {
      totalScore += 25; // Significant bonus for free models under free-preferred
    }
  }

  return Math.min(100, Math.max(0, Math.round(totalScore)));
}

export function recommendModel({
  role = 'implementer',
  policy = POLICIES.FREE_ONLY,
  contextNeeded = 8192,
  preferredProvider = null,
  catalog
}) {
  const allModels = getAllModels(catalog);
  const eligibleByPolicy = filterModelsByPolicy(allModels, policy);

  // Filter by context and tool requirements
  const roleConfig = ROLES[role] || ROLES.implementer;
  const requiresTools = roleConfig.defaultTools.write || roleConfig.defaultTools.bash;

  let candidates = eligibleByPolicy.filter(m => {
    if (m.contextWindow < contextNeeded) return false;
    if (requiresTools && !m.tools) return false;
    return true;
  });

  if (candidates.length === 0) {
    // If strict context filter yielded nothing, fall back to max available context
    candidates = eligibleByPolicy.filter(m => !requiresTools || m.tools);
  }

  if (candidates.length === 0) {
    return {
      recommended: null,
      score: 0,
      role,
      policy,
      reason: 'no_eligible_models_matching_policy_and_requirements',
      isVerified: false,
      alternatives: [],
      fallbackChain: []
    };
  }

  // Score each candidate
  const scored = candidates.map(model => {
    let score = scoreModelForRole(model, role, policy);
    if (preferredProvider && model.provider === preferredProvider) {
      score += 5; // Slight affinity if user specified preferred provider
    }
    return { model, score };
  }).sort((a, b) => b.score - a.score);

  const top = scored[0].model;
  const topScore = scored[0].score;
  const alternatives = scored.slice(1, 4).map(s => s.model);

  // Generate an evidence-based rationale string
  const tierDesc = top.tier === 'free' ? 'verified free tier ($0.00)' : `paid tier ($${(top.pricing.prompt * 1e6).toFixed(2)}/M input)`;
  const reason = `${top.name} (${top.provider}) recommended for ${roleConfig.name}: ${tierDesc}, ` +
    `context ${Math.round(top.contextWindow / 1024)}K, coding rating ${top.capabilities?.coding || 3}/5, reasoning ${top.capabilities?.reasoning || 3}/5.`;

  // Build a default fallback chain (top + best distinct alternatives)
  const fallbackChain = [top];
  for (const alt of alternatives) {
    if (alt.provider !== top.provider || alt.id !== top.id) {
      fallbackChain.push(alt);
    }
    if (fallbackChain.length >= 3) break;
  }

  return {
    recommended: top,
    score: topScore,
    role,
    policy,
    reason,
    isVerified: top.isVerified,
    alternatives,
    fallbackChain
  };
}

export function buildFallbackChain({
  primaryId,
  fallbackIds = [],
  policy = POLICIES.FREE_ONLY,
  catalog
}) {
  const primary = getModel(catalog, primaryId);
  if (!primary) throw new Error(`primary_model_not_found: ${primaryId}`);

  if (policy === POLICIES.FREE_ONLY && primary.tier !== 'free') {
    throw new Error(`model_violates_free_only_policy: ${primary.qualifiedId}`);
  }

  const chain = [primary];
  const seen = new Set([primary.qualifiedId]);

  for (const fid of fallbackIds) {
    const model = getModel(catalog, fid);
    if (!model) throw new Error(`fallback_model_not_found: ${fid}`);
    if (seen.has(model.qualifiedId)) continue; // ignore duplicates

    if (policy === POLICIES.FREE_ONLY && model.tier !== 'free') {
      throw new Error(`fallback_model_violates_free_only_policy: ${model.qualifiedId}`);
    }

    chain.push(model);
    seen.add(model.qualifiedId);
  }

  return chain;
}

export function validateModelAssignment({
  role = 'implementer',
  modelId,
  policy = POLICIES.FREE_ONLY,
  catalog
}) {
  const model = getModel(catalog, modelId);
  if (!model) return { valid: false, reason: 'model_not_found' };

  if (policy === POLICIES.FREE_ONLY && model.tier !== 'free') {
    return { valid: false, reason: 'paid_model_forbidden_under_free_only_policy' };
  }

  const roleConfig = ROLES[role] || ROLES.implementer;
  const requiresTools = roleConfig.defaultTools.write || roleConfig.defaultTools.bash;
  if (requiresTools && !model.tools) {
    return { valid: false, reason: 'model_lacks_required_tool_calling' };
  }

  return { valid: true, model };
}

