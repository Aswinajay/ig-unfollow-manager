// ─────────────────────────────────────────────────────────────────
//  IG Unfollow Manager — popup.js  (v2.0.0)
// ─────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {

  // ── DOM refs ──────────────────────────────────────────────────
  const btnScan       = document.getElementById('btn-scan');
  const btnAction     = document.getElementById('btn-action');
  const btnStop       = document.getElementById('btn-stop');
  const btnSelectAll  = document.getElementById('btn-select-all');
  const btnDeselectAll= document.getElementById('btn-deselect-all');
  const btnExportTxt  = document.getElementById('btn-export-txt');
  const btnExportCsv  = document.getElementById('btn-export-csv');

  const targetInput   = document.getElementById('target-username');
  const thresholdInput= document.getElementById('threshold');
  const whitelistInput= document.getElementById('whitelist');
  const fastScanChk   = document.getElementById('fast-scan');
  const searchInput   = document.getElementById('search');

  const delaySlider   = document.getElementById('delay');
  const delayVal      = document.getElementById('delay-val');

  const statusDiv     = document.getElementById('status');
  const resultsSection= document.getElementById('results-section');
  const actionArea    = document.getElementById('action-area');
  const userList      = document.getElementById('user-list');
  const countShown    = document.getElementById('count-shown');
  const countSkipped  = document.getElementById('count-skipped');
  const updateBanner  = document.getElementById('update-banner');

  // ── State ─────────────────────────────────────────────────────
  let allUsers     = [];   // Full unfiltered scan result
  let visibleUsers = [];   // After filter/search (drives checkboxes)
  let scanMode     = 'unfollow';

  // ── Utils ─────────────────────────────────────────────────────

  function setStatus(text, isError = false) {
    statusDiv.textContent = text;
    statusDiv.className = isError ? 'error' : '';
  }

  function getActiveInstagramTab(cb) {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      const tab = tabs[0];
      if (!tab || !tab.url?.includes('instagram.com')) {
        setStatus('Please open Instagram in this tab first.');
        return;
      }
      cb(tab.id, tab.url);
    });
  }

  function send(action, data = {}) {
    getActiveInstagramTab(tabId => {
      chrome.tabs.sendMessage(tabId, { action, ...data }, res => {
        if (chrome.runtime.lastError) {
          setStatus('Error: Please refresh Instagram and try again.', true);
        }
      });
    });
  }

  // Generate avatar fallback from username initial
  function avatarSVG(username) {
    let hash = 0;
    for (let i = 0; i < username.length; i++) hash = username.charCodeAt(i) + ((hash << 5) - hash);
    const hue = Math.abs(hash) % 360;
    const initial = username[0].toUpperCase();
    return `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='34' height='34'>
      <circle cx='17' cy='17' r='17' fill='hsl(${hue},60%,55%)'/>
      <text x='17' y='22' text-anchor='middle' font-family='sans-serif' font-size='15' font-weight='bold' fill='white'>${initial}</text>
    </svg>`;
  }

  // ── Render ────────────────────────────────────────────────────

  function render() {
    if (!allUsers.length) return;

    const threshold = parseInt(thresholdInput.value, 10) || 10000;
    const wlSet = new Set(
      whitelistInput.value.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
    );
    const searchQ = searchInput.value.toLowerCase().trim();

    // Filter out whitelisted and searched-away
    visibleUsers = allUsers.filter(u => {
      if (wlSet.has(u.username.toLowerCase())) return false;
      if (searchQ && !u.username.toLowerCase().includes(searchQ)) return false;
      return true;
    });

    // Count how many are auto-skipped (mutuals or large accounts)
    const autoChecked = visibleUsers.filter(u => {
      const aboveThreshold = u.follower_count !== null && u.follower_count !== -1 && u.follower_count >= threshold;
      return !u.follows_back && !aboveThreshold;
    });

    countShown.textContent   = visibleUsers.length;
    countSkipped.textContent = visibleUsers.length - autoChecked.length;

    // Preserve scroll position
    const prevScroll = userList.scrollTop;

    userList.innerHTML = '';

    if (visibleUsers.length === 0) {
      userList.innerHTML = '<div class="empty-msg">No accounts match your filters.</div>';
      return;
    }

    visibleUsers.forEach(u => {
      const aboveThreshold = u.follower_count !== null && u.follower_count !== -1 && u.follower_count >= threshold;
      const isChecked = !u.follows_back && !aboveThreshold;
      const dimmed    = !isChecked;

      const followerText = u.follower_count === -1 || u.follower_count === null
        ? 'followers hidden'
        : `${u.follower_count.toLocaleString()} followers`;

      const item = document.createElement('div');
      item.className = 'user-item';
      item.style.opacity = dimmed ? '0.5' : '1';

      item.innerHTML = `
        <input type="checkbox" ${isChecked ? 'checked' : ''} data-user='${JSON.stringify({ pk: u.pk, username: u.username })}'>
        <a href="https://www.instagram.com/${u.username}/" target="_blank" title="View profile" style="display:flex;flex-shrink:0;">
          <img class="user-avatar" src="${u.profile_pic_url || avatarSVG(u.username)}"
               onerror="this.src='${avatarSVG(u.username)}'" alt="${u.username}">
        </a>
        <div class="user-info">
          <a href="https://www.instagram.com/${u.username}/" target="_blank">${u.username}</a>
          <div class="meta">
            <span class="followers">${followerText}</span>
            ${u.follows_back ? '<span class="badge-mutual">Follows You</span>' : ''}
          </div>
        </div>
        <button class="btn-wl" data-uname="${u.username}" title="Add to whitelist">WL</button>
      `;

      // Checkbox dims/brightens on toggle
      const cb = item.querySelector('input[type=checkbox]');
      cb.addEventListener('change', () => {
        item.style.opacity = cb.checked ? '1' : '0.5';
      });

      // Whitelist button
      const wlBtn = item.querySelector('.btn-wl');
      wlBtn.addEventListener('click', () => {
        const existing = whitelistInput.value.split(',').map(s => s.trim()).filter(Boolean);
        if (!existing.includes(u.username)) {
          existing.push(u.username);
          whitelistInput.value = existing.join(', ');
          chrome.storage.local.set({ whitelistPrefs: whitelistInput.value });
          render();
        }
      });

      userList.appendChild(item);
    });

    userList.scrollTop = prevScroll;
  }

  // ── Event Handlers ────────────────────────────────────────────

  delaySlider.addEventListener('input', () => {
    delayVal.textContent = delaySlider.value;
  });

  [searchInput, thresholdInput, whitelistInput].forEach(el => {
    el?.addEventListener('input', render);
  });

  btnSelectAll.addEventListener('click', () => {
    userList.querySelectorAll('input[type=checkbox]').forEach(cb => {
      cb.checked = true;
      cb.closest('.user-item').style.opacity = '1';
    });
  });

  btnDeselectAll.addEventListener('click', () => {
    userList.querySelectorAll('input[type=checkbox]').forEach(cb => {
      cb.checked = false;
      cb.closest('.user-item').style.opacity = '0.5';
    });
  });

  // ── Scan Button ───────────────────────────────────────────────

  btnScan.addEventListener('click', () => {
    allUsers = [];
    visibleUsers = [];
    resultsSection.style.display = 'none';
    actionArea.style.display = 'none';
    setStatus('Starting scan...');

    const wl = whitelistInput.value.split(',').map(s => s.trim()).filter(Boolean);
    chrome.storage.local.set({ whitelistPrefs: whitelistInput.value });

    send('scan', {
      targetUsername: targetInput.value.trim().replace(/^@/, ''),
      threshold:      parseInt(thresholdInput.value, 10) || 10000,
      whitelist:      wl,
      fastScan:       fastScanChk.checked,
      scanMode:       'unfollow'
    });
  });

  // ── Action Button (Unfollow / Remove) ─────────────────────────

  btnAction.addEventListener('click', () => {
    const checked = Array.from(userList.querySelectorAll('input[type=checkbox]:checked'));
    if (checked.length === 0) {
      setStatus('No accounts selected.');
      return;
    }

    const users = checked.map(cb => {
      try { return JSON.parse(cb.dataset.user); } catch { return null; }
    }).filter(Boolean);

    setStatus(`Starting — ${users.length} accounts selected...`);
    send('doAction', {
      users,
      delay:      parseInt(delaySlider.value, 10),
      actionType: scanMode
    });
  });

  btnStop.addEventListener('click', () => {
    send('stop');
    setStatus('Stopped.');
  });

  // ── Export ────────────────────────────────────────────────────

  function downloadFile(content, filename, type) {
    const blob = new Blob([content], { type });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  btnExportTxt.addEventListener('click', () => {
    if (!visibleUsers.length) return;
    const date = new Date().toISOString().split('T')[0];
    downloadFile(
      visibleUsers.map(u => `@${u.username}`).join('\n'),
      `ig_unfollow_${date}.txt`, 'text/plain'
    );
  });

  btnExportCsv.addEventListener('click', () => {
    if (!visibleUsers.length) return;
    const headers = ['Username', 'Full Name', 'Followers', 'Verified', 'Private', 'Follows You', 'URL'];
    const rows = visibleUsers.map(u => [
      u.username,
      `"${(u.full_name || '').replace(/"/g, '""')}"`,
      u.follower_count === -1 ? 'Hidden' : u.follower_count,
      u.is_verified ? 'Yes' : 'No',
      u.is_private  ? 'Yes' : 'No',
      u.follows_back ? 'Yes' : 'No',
      `https://www.instagram.com/${u.username}/`
    ]);
    const date = new Date().toISOString().split('T')[0];
    downloadFile(
      [headers, ...rows].map(r => r.join(',')).join('\r\n'),
      `ig_unfollow_${date}.csv`, 'text/csv'
    );
  });

  // ── Storage Event Listener (from content → background → here) ──

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.lastEvent?.newValue) handleEvent(changes.lastEvent.newValue);
  });

  function handleEvent(ev) {
    switch (ev.type) {
      case 'status':
        setStatus(ev.text);
        break;

      case 'progress':
        if (ev.step === 'fetching') {
          setStatus(`Fetching page ${ev.page} (${ev.count} profiles loaded)...`);
        } else if (ev.step === 'checking') {
          setStatus(`Fetching profile data: ${ev.current}/${ev.total} — @${ev.username}`);
        }
        break;

      case 'partial_scan_result':
        allUsers  = ev.users || [];
        scanMode  = ev.scanMode || 'unfollow';
        btnAction.textContent = scanMode === 'remove' ? '🗑 Remove Selected' : '✂️ Unfollow Selected';
        if (allUsers.length > 0) {
          resultsSection.style.display = 'block';
          actionArea.style.display     = 'block';
          render();
        }
        break;

      case 'scan_result':
        setStatus(ev.text || 'Scan complete!');
        break;

      case 'action_progress': {
        const verb = scanMode === 'remove' ? 'Removing' : 'Unfollowing';
        setStatus(`${verb} ${ev.current}/${ev.total}: @${ev.username} ${ev.success ? '✓' : '✗'}`);
        if (ev.success) {
          const cb = userList.querySelector(`input[data-user*='"username":"${ev.username}"']`);
          if (cb) {
            cb.checked = false;
            cb.disabled = true;
            cb.closest('.user-item').style.opacity = '0.35';
          }
        }
        break;
      }

      case 'action_done':
        setStatus(`Done! ${ev.done}/${ev.total} ${scanMode === 'remove' ? 'removed' : 'unfollowed'}.`);
        break;

      case 'error':
        setStatus(`🛑 ${ev.text}`, true);
        break;
    }
  }

  // ── OTA Update Check ──────────────────────────────────────────

  (async () => {
    try {
      const res = await fetch(
        'https://raw.githubusercontent.com/Aswinajay/ig-unfollow-manager/main/manifest.json',
        { cache: 'no-store' }
      );
      const remote = await res.json();
      const local  = chrome.runtime.getManifest().version;
      if (remote.version !== local) {
        updateBanner.textContent = `🚀 v${remote.version} available (you have v${local}) — click to update`;
        updateBanner.style.display = 'block';
        updateBanner.addEventListener('click', () => {
          chrome.tabs.create({ url: 'https://github.com/Aswinajay/ig-unfollow-manager#update' });
        });
      }
    } catch (_) {}
  })();

  // ── Init: Load saved data & preferences ──────────────────────

  chrome.storage.local.get(['scanResult', 'lastEvent', 'whitelistPrefs'], data => {
    if (data.whitelistPrefs) whitelistInput.value = data.whitelistPrefs;

    if (data.scanResult?.users?.length) {
      allUsers = data.scanResult.users;
      scanMode = data.scanResult.scanMode || 'unfollow';
      btnAction.textContent = scanMode === 'remove' ? '🗑 Remove Selected' : '✂️ Unfollow Selected';
      resultsSection.style.display = 'block';
      actionArea.style.display     = 'block';
      render();
    }

    if (data.lastEvent && Date.now() - data.lastEvent.ts < 600000) {
      handleEvent(data.lastEvent);
    }
  });

  // ── Auto-fill target from current Instagram URL ───────────────

  getActiveInstagramTab((tabId, url) => {
    try {
      const parts = new URL(url).pathname.split('/').filter(Boolean);
      const skip  = new Set(['explore','reels','direct','stories','p','tv','reel','accounts','about','developer']);
      if (parts.length > 0 && !skip.has(parts[0])) {
        if (!targetInput.value) targetInput.value = parts[0];
      }
    } catch (_) {}

    // Check content script is alive
    chrome.tabs.sendMessage(tabId, { action: 'ping' }, res => {
      if (!res) setStatus('Please refresh the Instagram tab first.');
    });
  });

});
