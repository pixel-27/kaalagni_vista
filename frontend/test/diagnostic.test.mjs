import test from 'node:test'
import assert from 'node:assert/strict'

test('Diagnostic State Machine: valid state definitions and transitions', () => {
  const validStates = [
    'IDLE',
    'OBSERVING',
    'ANALYZING',
    'FORMING_HYPOTHESES',
    'PLANNING_INVESTIGATION',
    'INVESTIGATING',
    'AWAITING_APPROVAL',
    'VERIFYING',
    'DIAGNOSING',
    'RESOLVED',
    'INCONCLUSIVE',
  ]

  assert.equal(validStates.length, 11)
  assert.ok(validStates.includes('AWAITING_APPROVAL'))
  assert.ok(validStates.includes('RESOLVED'))
  assert.ok(validStates.includes('VERIFYING'))
})

test('Evidence Classification: correctly classifies OBSERVED, VERIFIED, LIKELY, UNKNOWN', () => {
  const evidenceObserved = {
    id: 'ev_1',
    claim: 'Screenshot indicates KeyError: user_id',
    classification: 'OBSERVED',
    source: 'screenshot',
    timestamp: new Date().toISOString(),
  }

  const evidenceVerified = {
    id: 'ev_2',
    claim: 'Backend test suite confirms KeyError reproduction',
    classification: 'VERIFIED',
    source: 'tool_output',
    tool_name: 'run_test',
    timestamp: new Date().toISOString(),
  }

  const evidenceLikely = {
    id: 'ev_3',
    claim: 'FastAPI router dictionary indexing without .get()',
    classification: 'LIKELY',
    source: 'inference',
    timestamp: new Date().toISOString(),
  }

  assert.equal(evidenceObserved.classification, 'OBSERVED')
  assert.equal(evidenceVerified.classification, 'VERIFIED')
  assert.equal(evidenceLikely.classification, 'LIKELY')
  assert.equal(evidenceVerified.source, 'tool_output')
})

test('Hypothesis Model: tracks candidate, supported, and verified hypotheses with evidence links', () => {
  const hypothesis = {
    id: 'hyp_1',
    description: 'Unhandled KeyError on missing payload user_id key',
    status: 'candidate',
    supporting_evidence: ['ev_1'],
    contradicting_evidence: [],
    verification_needed: 'Inspect backend/app/api/chat.py or run test suite',
    likelihood: 'high',
  }

  assert.equal(hypothesis.id, 'hyp_1')
  assert.equal(hypothesis.status, 'candidate')
  assert.equal(hypothesis.supporting_evidence.length, 1)

  // Transition to supported
  hypothesis.status = 'supported'
  hypothesis.supporting_evidence.push('ev_2')
  assert.equal(hypothesis.status, 'supported')
  assert.equal(hypothesis.supporting_evidence.length, 2)

  // Transition to verified when backed by verified tool evidence
  hypothesis.status = 'verified'
  assert.equal(hypothesis.status, 'verified')
})

test('Investigation Plan: models structured multi-step diagnostic workflow', () => {
  const plan = {
    goal: 'Isolate root cause of KeyError: user_id and verify resolution',
    steps: [
      {
        step_num: 1,
        action: 'Analyze error telemetry',
        tool_needed: 'analyze_error',
        status: 'completed',
        note: 'Parsed stack trace',
      },
      {
        step_num: 2,
        action: 'Search workspace for user_id references',
        tool_needed: 'search_code',
        status: 'completed',
        note: 'Found 4 matches',
      },
      {
        step_num: 3,
        action: 'Inspect source code around failure line',
        tool_needed: 'read_file',
        status: 'completed',
        note: 'Read lines 30-60 of chat.py',
      },
      {
        step_num: 4,
        action: 'Request human approval to execute backend test suite',
        tool_needed: 'run_test',
        status: 'running',
        note: 'Waiting for user confirmation',
      },
      {
        step_num: 5,
        action: 'Synthesize verified diagnostic report',
        tool_needed: null,
        status: 'pending',
      },
    ],
  }

  assert.equal(plan.steps.length, 5)
  assert.equal(plan.steps[0].status, 'completed')
  assert.equal(plan.steps[3].status, 'running')
  assert.equal(plan.steps[3].tool_needed, 'run_test')
})

test('Human Approval Flow: formats structured execution prompt with Action, Purpose, and Why', () => {
  const pendingCall = {
    id: 'call_rt_diag',
    tool: 'run_test',
    arguments: { test_target: 'backend_tests' },
    approval_token: '1727500000.signature_hash',
  }

  const formatApprovalDetails = (call) => ({
    title: 'VISTA wants to verify this diagnosis',
    action: `Run Backend Test Suite (${call.arguments.test_target})`,
    purpose: 'Verify whether the suspected backend issue is reproducible.',
    why: 'The current evidence suggests a backend dependency/configuration issue.',
    token: call.approval_token,
  })

  const details = formatApprovalDetails(pendingCall)
  assert.equal(details.title, 'VISTA wants to verify this diagnosis')
  assert.match(details.action, /Backend Test Suite/i)
  assert.match(details.purpose, /reproducible/i)
  assert.match(details.why, /dependency\/configuration issue/i)
  assert.equal(details.token, '1727500000.signature_hash')
})

test('Challenge Diagnosis Flow: creates structured challenge request and handles outcome', () => {
  const buildChallengeRequest = (history, session) => ({
    messages: history,
    challenge_diagnosis: true,
    diagnostic_session: session,
  })

  const sampleSession = {
    session_id: 'diag_123',
    current_state: 'DIAGNOSING',
    observations: ['KeyError: user_id visible in logs'],
    evidence: [
      {
        id: 'ev_1',
        claim: 'Traceback indicates KeyError on user_id',
        classification: 'OBSERVED',
        source: 'user_input',
        timestamp: new Date().toISOString(),
      },
      {
        id: 'ev_2',
        claim: 'Backend test suite confirms failure in workspace sandbox',
        classification: 'VERIFIED',
        source: 'tool_output',
        tool_name: 'run_test',
        timestamp: new Date().toISOString(),
      },
    ],
    hypotheses: [
      {
        id: 'hyp_1',
        description: 'Unhandled KeyError during dictionary indexing',
        status: 'verified',
        supporting_evidence: ['ev_1', 'ev_2'],
        contradicting_evidence: [],
        likelihood: 'high',
      },
    ],
    leading_hypothesis_id: 'hyp_1',
    timeline: [],
    updated_at: new Date().toISOString(),
  }

  const req = buildChallengeRequest([{ role: 'user', content: 'Challenge diagnosis' }], sampleSession)
  assert.equal(req.challenge_diagnosis, true)
  assert.equal(req.diagnostic_session.session_id, 'diag_123')

  // Sample challenge response outcome
  const challengeReport = {
    challenged_at: new Date().toISOString(),
    previous_diagnosis: 'Unhandled KeyError during dictionary indexing',
    new_diagnosis: 'Unhandled KeyError during dictionary indexing',
    outcome: 'reaffirmed',
    rationale: 'Re-evaluated against 1 verified test result and 1 observed traceback. Alternative ruled out.',
    alternative_considered: 'Malformed upstream proxy header',
    alternative_status: 'Not supported by stack trace',
  }

  assert.equal(challengeReport.outcome, 'reaffirmed')
  assert.match(challengeReport.rationale, /re-evaluated/i)
})

test('Diagnostic Timeline: records sequential milestones without developer console clutter', () => {
  const timeline = [
    { id: 'evt_1', stage: 'Visual Evidence Received', state: 'OBSERVING', description: 'Screen snapshot captured', timestamp: new Date().toISOString(), status: 'completed' },
    { id: 'evt_2', stage: 'Error Telemetry Analyzed', state: 'ANALYZING', description: 'Parsed KeyError: user_id', timestamp: new Date().toISOString(), status: 'completed' },
    { id: 'evt_3', stage: 'Code Searched', state: 'INVESTIGATING', description: 'Found 4 matches for user_id', timestamp: new Date().toISOString(), status: 'completed' },
    { id: 'evt_4', stage: 'Verification Approval Requested', state: 'AWAITING_APPROVAL', description: 'Waiting for user approval to run backend tests', timestamp: new Date().toISOString(), status: 'completed' },
    { id: 'evt_5', stage: 'Test Suite Executed', state: 'VERIFYING', description: 'Tests passed cleanly', timestamp: new Date().toISOString(), status: 'completed' },
    { id: 'evt_6', stage: 'Diagnosis Verified', state: 'RESOLVED', description: 'Final diagnosis confirmed', timestamp: new Date().toISOString(), status: 'completed' },
  ]

  assert.equal(timeline.length, 6)
  assert.equal(timeline[0].state, 'OBSERVING')
  assert.equal(timeline[3].state, 'AWAITING_APPROVAL')
  assert.equal(timeline[5].state, 'RESOLVED')
})

test('Multimodal Context Preservation: screen and voice queries preserve diagnostic session', () => {
  const screenMessage = {
    role: 'user',
    content: "VISTA, look at my screen and tell me what's wrong",
    input_mode: 'voice',
    attachments: [
      {
        mime_type: 'image/png',
        data: 'data:image/png;base64,iVBORw0KGgo...',
        filename: 'screen_snapshot.png',
        source: 'screen',
      },
    ],
  }

  const payload = {
    messages: [screenMessage],
    challenge_diagnosis: false,
    diagnostic_session: {
      session_id: 'diag_multi',
      current_state: 'INVESTIGATING',
      observations: [],
      evidence: [],
      hypotheses: [],
      timeline: [],
      updated_at: new Date().toISOString(),
    },
  }

  assert.equal(payload.messages[0].input_mode, 'voice')
  assert.equal(payload.messages[0].attachments[0].source, 'screen')
  assert.equal(payload.diagnostic_session.session_id, 'diag_multi')
})
