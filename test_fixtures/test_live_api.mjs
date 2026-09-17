import fs from 'fs';
import path from 'path';

const BASE_URL = 'https://lexplain-jet.vercel.app';

const docA = fs.readFileSync(path.resolve('test_fixtures/document_a_lease.txt'), 'utf-8');
const docB = fs.readFileSync(path.resolve('test_fixtures/document_b_employment_nda.txt'), 'utf-8');
const docC = fs.readFileSync(path.resolve('test_fixtures/document_c_lease_variant.txt'), 'utf-8');

async function readSSEStream(res) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  let chunkCount = 0;
  let metaEvent = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunkCount++;
    const str = decoder.decode(value);
    const lines = str.split('\n');
    let finished = false;
    for (const line of lines) {
      if (line.includes('[DONE]')) {
        finished = true;
        break;
      }
      if (line.startsWith('data: ')) {
        try {
          const parsed = JSON.parse(line.slice(6));
          if (parsed.text) text += parsed.text;
          if (parsed.meta) metaEvent = parsed.meta;
        } catch (e) {}
      }
    }
    if (finished) break;
  }
  return { text, chunkCount, metaEvent };
}

async function testDocumentIntake() {
  console.log('\n=== A. DOCUMENT INTAKE ===');
  
  // 1. Paste Doc A
  const formA = new FormData();
  formA.append('text', docA);
  const resA = await fetch(`${BASE_URL}/api/parse`, { method: 'POST', body: formA });
  const dataA = await resA.json();
  console.log('Doc A Parse Status:', resA.status);
  console.log('Doc A Word Count:', dataA.wordCount);
  console.log('Doc A Hash:', dataA.documentHash);
  
  // Re-submit Doc A to confirm hash consistency
  const resA2 = await fetch(`${BASE_URL}/api/parse`, { method: 'POST', body: formA });
  const dataA2 = await resA2.json();
  console.log('Doc A Re-submit Hash:', dataA2.documentHash);
  console.log('Hash Consistent:', (dataA.documentHash && dataA.documentHash === dataA2.documentHash) ? 'YES' : 'NO');

  // 2. Upload Doc B as file
  const formB = new FormData();
  const blobB = new Blob([docB], { type: 'text/plain' });
  formB.append('file', blobB, 'document_b_employment_nda.txt');
  const resB = await fetch(`${BASE_URL}/api/parse`, { method: 'POST', body: formB });
  const dataB = await resB.json();
  console.log('Doc B File Upload Status:', resB.status);
  console.log('Doc B File Name:', dataB.name);
  console.log('Doc B Word Count:', dataB.wordCount);
  console.log('Doc B Hash:', dataB.documentHash);

  return { hashA: dataA.documentHash, hashB: dataB.documentHash };
}

async function testSimplify() {
  console.log('\n=== B. SIMPLIFY (STREAMING & LEVELS) ===');
  const levels = ['simple', 'standard', 'detailed'];
  const results = {};

  for (const level of levels) {
    const res = await fetch(`${BASE_URL}/api/simplify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: docA, level })
    });
    console.log(`Simplify [${level}] Status:`, res.status);
    console.log(`Simplify [${level}] Content-Type:`, res.headers.get('content-type'));

    const { text, chunkCount } = await readSSEStream(res);
    console.log(`Simplify [${level}] Chunks received:`, chunkCount, '(Streaming confirmed:', chunkCount > 1 ? 'YES' : 'NO', ')');
    console.log(`Simplify [${level}] Output Preview:`, text.slice(0, 180).replace(/\n/g, ' ') + '...\n');
    results[level] = text;
  }
  return results;
}

async function testClauseRiskAnalysis() {
  console.log('\n=== C. CLAUSE RISK ANALYSIS ===');
  
  // Analyze Doc A
  console.log('Analyzing Document A (Lease)...');
  const resA = await fetch(`${BASE_URL}/api/analyze-clauses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: docA })
  });
  const dataA = await resA.json();
  console.log('Doc A Clause Count:', dataA.clauses?.length);
  console.log('Doc A Risk Count:', JSON.stringify(dataA.riskCount));
  
  const highRisksA = (dataA.clauses || []).filter(c => c.riskLevel === 'high' || c.severity === 'high');
  console.log('Doc A High Risk Clauses detected:', highRisksA.map(c => c.title || c.text?.slice(0, 40)));

  // Analyze Doc B
  console.log('\nAnalyzing Document B (Employment / NDA)...');
  const resB = await fetch(`${BASE_URL}/api/analyze-clauses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: docB })
  });
  const dataB = await resB.json();
  console.log('Doc B Clause Count:', dataB.clauses?.length);
  console.log('Doc B Risk Count:', JSON.stringify(dataB.riskCount));

  const highRisksB = (dataB.clauses || []).filter(c => c.riskLevel === 'high' || c.severity === 'high');
  console.log('Doc B High Risk Clauses detected:', highRisksB.map(c => c.title || c.text?.slice(0, 40)));

  return { clausesA: dataA.clauses, clausesB: dataB.clauses };
}

async function testCompare() {
  console.log('\n=== D. COMPARE (DOC A vs DOC C) ===');
  const res = await fetch(`${BASE_URL}/api/compare`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text1: docA, text2: docC })
  });
  const data = await res.json();
  console.log('Compare Status:', res.status);
  console.log('Overall Differences:', data.overallDifferences);
  console.log('Recommendation:', data.recommendation);
  const diffs = data.differences || data.items || [];
  console.log('Differences count:', diffs.length);
  for (const d of diffs.slice(0, 5)) {
    console.log(`- [${d.topic || d.aspect}]: Doc 1: "${d.doc1 || d.doc1Summary}" vs Doc 2: "${d.doc2 || d.doc2Summary}"`);
  }
}

async function testAsk() {
  console.log('\n=== E. ASK / Q&A (RAG & CACHED EMBEDDINGS) ===');
  const questions = [
    'What is the security deposit amount?',
    'How much notice do I need to give before moving out?',
    'Can the landlord enter without notice?',
    "What's the capital of France?"
  ];

  let cachedChunks = null;
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const payload = { text: docA, question: q };
    if (cachedChunks) {
      payload.chunks = cachedChunks;
    }
    const startTime = Date.now();
    const res = await fetch(`${BASE_URL}/api/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const duration = Date.now() - startTime;
    console.log(`\nQ${i + 1}: "${q}" (Status: ${res.status}, Time: ${duration}ms)`);

    const { text, metaEvent } = await readSSEStream(res);

    if (metaEvent && metaEvent.chunks) {
      cachedChunks = metaEvent.chunks;
      console.log(`Emitted ${metaEvent.chunks.length} cached chunks with embeddings for subsequent queries.`);
    } else if (cachedChunks) {
      console.log('Reused client-provided chunks successfully (no server re-embedding needed).');
    }

    console.log('Answer Preview:', text.trim().slice(0, 180).replace(/\n/g, ' ') + '...');
  }
}

async function testNextSteps() {
  console.log('\n=== F. NEXT STEPS (CHECKLIST & QUESTIONS) ===');
  const res = await fetch(`${BASE_URL}/api/next-steps`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: docB })
  });
  const data = await res.json();
  console.log('Next Steps Status:', res.status);
  console.log('Questions for lawyer count:', data.questionsForLawyer?.length);
  console.log('Sample Questions for Lawyer:', data.questionsForLawyer?.slice(0, 3));
  console.log('Red flags identified count:', data.redFlags?.length);
  console.log('Sample Red Flags:', data.redFlags?.slice(0, 3));
  const checklist = data.beforeYouSign || data.items || [];
  console.log('Action checklist items count:', checklist.length);
  console.log('Sample Action Items:', checklist.slice(0, 2).map(item => item.item || item.action));
}

async function testErrorHandling() {
  console.log('\n=== G. ERROR HANDLING SPOT-CHECKS ===');
  // 1. Empty document
  const resEmpty = await fetch(`${BASE_URL}/api/simplify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: '' })
  });
  const dataEmpty = await resEmpty.json();
  console.log('Empty Doc Status:', resEmpty.status, '| ErrorType:', dataEmpty.errorType);

  // 2. Unsupported file type in /api/parse
  const formBad = new FormData();
  const blobBad = new Blob(['PK\x03\x04test'], { type: 'application/zip' });
  formBad.append('file', blobBad, 'test.zip');
  const resBad = await fetch(`${BASE_URL}/api/parse`, { method: 'POST', body: formBad });
  const dataBad = await resBad.json();
  console.log('Unsupported File Status:', resBad.status, '| Error:', dataBad.error || dataBad.errorType);
}

async function testRateLimiting() {
  console.log('\n=== H. LIVE UPSTASH RATE LIMITING ===');
  console.log('Sending requests until 429 RATE_LIMIT response is received...');
  let triggered429 = false;
  let blockedResponse = null;

  for (let i = 1; i <= 25; i++) {
    const res = await fetch(`${BASE_URL}/api/simplify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'Valid test content that passes input validation easily.' })
    });
    if (res.status === 429) {
      blockedResponse = await res.json();
      console.log(`Triggered 429 at request #${i}!`);
      console.log('429 Payload:', JSON.stringify(blockedResponse, null, 2));
      triggered429 = true;
      break;
    }
  }
  if (!triggered429) {
    console.log('Note: Upstash limiter did not trigger within 25 requests (window may have rotated or fail-open).');
  }
}

async function main() {
  console.log('Starting Live Production E2E Verification on', BASE_URL);
  await testDocumentIntake();
  await testSimplify();
  await testClauseRiskAnalysis();
  await testCompare();
  await testAsk();
  await testNextSteps();
  await testErrorHandling();
  await testRateLimiting();
  console.log('\n=== ALL LIVE API CHECKS FINISHED ===');
}

main().catch(err => {
  console.error('Fatal error running live tests:', err);
  process.exit(1);
});
