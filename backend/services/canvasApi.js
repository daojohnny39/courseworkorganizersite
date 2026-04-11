/**
 * Canvas LMS REST API wrapper.
 * Uses native fetch (Node 18+) with pagination and rate-limit handling.
 */

const RATE_LIMIT_THRESHOLD = 100;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

// ── Pagination helper ──────────────────────────────────────────────────────────

function parseNextLink(linkHeader) {
  if (!linkHeader) return null;
  const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
  return match ? match[1] : null;
}

async function fetchAllPages(url, accessToken) {
  const results = [];
  let nextUrl = url;

  while (nextUrl) {
    const res = await fetchWithRateLimit(nextUrl, accessToken);
    const data = await res.json();
    if (Array.isArray(data)) {
      results.push(...data);
    } else {
      results.push(data);
    }
    nextUrl = parseNextLink(res.headers.get('link'));
  }

  return results;
}

async function fetchWithRateLimit(url, accessToken, retries = 0) {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });

  const remaining = res.headers.get('x-rate-limit-remaining');
  if (remaining && Number(remaining) < RATE_LIMIT_THRESHOLD) {
    await sleep(1000);
  }

  if (res.status === 403 && retries < MAX_RETRIES) {
    const retryAfter = res.headers.get('retry-after');
    const delay = retryAfter ? Number(retryAfter) * 1000 : RETRY_DELAY_MS * (retries + 1);
    await sleep(delay);
    return fetchWithRateLimit(url, accessToken, retries + 1);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Canvas API ${res.status}: ${body}`);
  }

  return res;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── API functions ──────────────────────────────────────────────────────────────

async function getCanvasUser(instanceUrl, accessToken) {
  const res = await fetchWithRateLimit(
    `${instanceUrl}/api/v1/users/self/profile`,
    accessToken
  );
  return res.json();
}

async function getCanvasCourses(instanceUrl, accessToken) {
  return fetchAllPages(
    `${instanceUrl}/api/v1/courses?enrollment_state=active&include[]=term&include[]=total_scores&per_page=100`,
    accessToken
  );
}

async function getCanvasAssignments(instanceUrl, accessToken, canvasCourseId) {
  return fetchAllPages(
    `${instanceUrl}/api/v1/courses/${canvasCourseId}/assignments?per_page=100&include[]=submission`,
    accessToken
  );
}

module.exports = {
  getCanvasUser,
  getCanvasCourses,
  getCanvasAssignments,
};
