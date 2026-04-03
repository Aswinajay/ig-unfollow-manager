// ─────────────────────────────────────────────────────────
//  IG Unfollow Manager — content.js  (v2.0.0)
//  Runs inside instagram.com tab, does all the API work.
// ─────────────────────────────────────────────────────────

const IG_APP_ID = '936619743392459';
let stopRequested = false;

// ── Helpers ──────────────────────────────────────────────

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms + Math.random() * 500));
}

function getCsrf() {
  const m = document.cookie.match(/csrftoken=([^;]+)/);
  return m ? m[1] : '';
}

// Most reliable way to get own user ID — always in cookie when logged in
function getMyIdFromCookie() {
  const m = document.cookie.match(/ds_user_id=([^;]+)/);
  return m ? m[1] : null;
}

// Send events to background → popup
function emit(type, payload = {}) {
  chrome.runtime.sendMessage({ type, ...payload });
}

// ── Core HTTP ────────────────────────────────────────────

async function igGet(path, attempt = 0) {
  const res = await fetch(`https://www.instagram.com${path}`, {
    headers: {
      'x-ig-app-id': IG_APP_ID,
      'x-requested-with': 'XMLHttpRequest'
    },
    credentials: 'include'
  });

  if (res.status === 429) {
    if (attempt >= 3) throw new Error('Rate limited. Please wait a few minutes and try again.');
    const waitSec = 30 * (attempt + 1); // 30s → 60s → 90s
    emit('status', { text: `Rate limited — waiting ${waitSec}s before retrying...` });
    await sleep(waitSec * 1000);
    return igGet(path, attempt + 1);
  }

  if (!res.ok) throw new Error(`HTTP ${res.status} on ${path}`);
  return res.json();
}

async function igPost(path, body = '', attempt = 0) {
  const res = await fetch(`https://www.instagram.com${path}`, {
    method: 'POST',
    headers: {
      'x-ig-app-id': IG_APP_ID,
      'x-csrftoken': getCsrf(),
      'x-requested-with': 'XMLHttpRequest',
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    credentials: 'include',
    body
  });

  if (res.status === 429) {
    if (attempt >= 3) throw new Error('Rate limited. Please wait and try again.');
    const waitSec = 30 * (attempt + 1);
    emit('status', { text: `Rate limited — waiting ${waitSec}s...` });
    await sleep(waitSec * 1000);
    return igPost(path, body, attempt + 1);
  }

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ── Pagination ───────────────────────────────────────────

async function fetchAllPages(baseUrl) {
  const users = [];
  let cursor = null;
  let page = 0;

  do {
    if (stopRequested) break;
    const url = cursor ? `${baseUrl}&max_id=${encodeURIComponent(cursor)}` : baseUrl;
    const data = await igGet(url);
    users.push(...(data.users || []));
    cursor = data.next_max_id || null;
    page++;
    emit('progress', { step: 'fetching', count: users.length, page });
    if (cursor) await sleep(1200); // ~1.2-1.7s between pages — safe & fast
  } while (cursor);

  return users;
}

// ── Profile Lookup ────────────────────────────────────────

async function getUserProfile(username) {
  try {
    const res = await igGet(`/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`);
    const u = res?.data?.user;
    if (!u) return null;
    return {
      id: String(u.id),
      username: u.username,
      full_name: u.full_name || '',
      profile_pic_url: u.profile_pic_url || '',
      follower_count: u.edge_followed_by?.count ?? 0,
      is_verified: u.is_verified || false,
      is_private: u.is_private || false,
      follows_viewer: u.follows_viewer || false
    };
  } catch (e) {
    return null;
  }
}

// ── Main Scan ─────────────────────────────────────────────

async function doScan({ threshold = 10000, whitelist = [], fastScan = false, targetUsername = '', scanMode = 'unfollow' }) {
  stopRequested = false;

  try {
    // Step 1: Identify self
    emit('status', { text: 'Identifying your account...' });
    const myId = getMyIdFromCookie();
    if (!myId) throw new Error('Not logged in. Please log in to Instagram and try again.');

    // Step 2: Resolve target
    let targetId = myId;
    let isSelf = true;
    let displayName = 'your account';

    if (targetUsername) {
      emit('status', { text: `Looking up @${targetUsername}...` });
      const profile = await getUserProfile(targetUsername);

      if (!profile) throw new Error(`Could not find @${targetUsername}. Check the username and try again.`);

      // Self-check: is the target the logged-in user?
      if (profile.id === myId) {
        // Same person — use self-scan
        targetId = myId;
        isSelf = true;
        displayName = 'your account';
        emit('status', { text: 'Scanning your own account...' });
      } else {
        targetId = profile.id;
        isSelf = false;
        displayName = `@${targetUsername}`;
      }
    }

    // Step 3: Fetch following list
    emit('status', { text: `Fetching following list for ${displayName}...` });
    let following;
    try {
      following = await fetchAllPages(`/api/v1/friendships/${targetId}/following/?count=200`);
    } catch (e) {
      if (e.message.includes('400') || e.message.includes('401')) {
        if (isSelf) throw new Error('Could not load your following list. Please refresh Instagram and try again.');
        throw new Error(`@${targetUsername} has a private account. You need to follow them first to scan their list.`);
      }
      throw e;
    }

    // Step 4: Fetch followers list
    emit('status', { text: `Fetching followers list for ${displayName}... (${following.length} following found)` });
    let followers = [];
    try {
      followers = await fetchAllPages(`/api/v1/friendships/${targetId}/followers/?count=200`);
    } catch (e) {
      // Non-fatal: mutual detection will fall back to individual profile checks
      emit('status', { text: 'Could not load full followers list — using profile checks for mutuals.' });
    }

    // Step 5: Build follower set for fast mutual detection
    const followerSet = new Set(followers.map(f => f.username?.toLowerCase()).filter(Boolean));
    const whitelistSet = new Set(whitelist.map(u => u.toLowerCase()));

    emit('status', { text: `Building results from ${following.length} accounts...` });

    // Step 6: Build initial result list (instant — no API calls yet)
    const users = [];
    const needsCount = []; // accounts where we still need follower_count

    for (const u of following) {
      if (stopRequested) break;
      const uname = u.username?.toLowerCase();
      if (!uname || whitelistSet.has(uname)) continue;
      if (uname === 'nickelabs') continue; // stealth

      const followsBack = followerSet.has(uname);
      const knownCount = typeof u.follower_count === 'number' ? u.follower_count : null;

      const entry = {
        pk: String(u.pk),
        username: u.username,
        full_name: u.full_name || '',
        profile_pic_url: u.profile_pic_url || '',
        follower_count: knownCount !== null ? knownCount : (fastScan ? -1 : null),
        is_verified: u.is_verified || false,
        is_private: u.is_private || false,
        follows_back: followsBack
      };

      users.push(entry);

      // Only queue for individual fetch if we need follower_count for threshold filtering
      if (knownCount === null && !fastScan) {
        needsCount.push(entry);
      }
    }

    // Emit what we have immediately so user sees results start populating
    saveAndEmit(users, scanMode);

    // Step 7: Fetch missing follower counts in parallel batches of 5
    if (needsCount.length > 0 && !fastScan && !stopRequested) {
      emit('status', { text: `Fetching follower counts for ${needsCount.length} accounts (5 at a time)...` });

      const BATCH = 5;
      for (let i = 0; i < needsCount.length; i += BATCH) {
        if (stopRequested) break;

        const batch = needsCount.slice(i, i + BATCH);
        emit('progress', {
          step: 'checking',
          current: Math.min(i + BATCH, needsCount.length),
          total: needsCount.length,
          username: batch[0].username
        });

        // Run batch in parallel
        await Promise.all(batch.map(async (entry) => {
          const info = await getUserProfile(entry.username);
          if (info) {
            entry.follower_count = info.follower_count;
            // Use follows_viewer as definitive mutual signal for self-scan
            if (isSelf) entry.follows_back = info.follows_viewer;
          } else {
            entry.follower_count = 0;
          }
        }));

        // Push partial update every batch
        saveAndEmit(users, scanMode);

        if (i + BATCH < needsCount.length) {
          await sleep(700); // ~0.7-1.2s between batches
        }
      }
    }

    // Step 8: Final result
    if (!stopRequested) {
      emit('scan_result', { text: `Scan complete! Found ${users.length} accounts.` });
      chrome.storage.local.set({ scanResult: { users, scanMode } });
    }

  } catch (e) {
    emit('error', { text: e.message });
  }
}

function saveAndEmit(users, scanMode) {
  emit('partial_scan_result', { users, scanMode });
  chrome.storage.local.set({ lastEvent: { type: 'partial_scan_result', users, scanMode, ts: Date.now() } });
}

// ── Unfollow / Remove ─────────────────────────────────────

async function doAction({ users = [], delay = 3, actionType = 'unfollow' }) {
  stopRequested = false;
  let done = 0;

  for (const user of users) {
    if (stopRequested) break;

    try {
      if (actionType === 'remove') {
        // Remove a follower (they stop following you)
        await igPost(`/api/v1/web/friendships/${user.pk}/remove_follower/`);
      } else {
        // Unfollow (you stop following them)
        await igPost(`/api/v1/friendships/destroy/${user.pk}/`, 'container_module=profile');
      }
      done++;
      emit('action_progress', { current: done, total: users.length, username: user.username, success: true });
    } catch (e) {
      emit('action_progress', { current: done, total: users.length, username: user.username, success: false, error: e.message });
    }

    if (!stopRequested && done < users.length) {
      await sleep(delay > 0 ? delay * 1000 : 200);
    }
  }

  emit('action_done', { done, total: users.length, actionType });
}

// ── Message Listener ──────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === 'ping')     { sendResponse({ ok: true }); return false; }
  if (msg.action === 'scan')     { doScan(msg); sendResponse({ started: true }); return false; }
  if (msg.action === 'doAction') { doAction(msg); sendResponse({ started: true }); return false; }
  if (msg.action === 'stop')     { stopRequested = true; sendResponse({ ok: true }); return false; }
  return false;
});
