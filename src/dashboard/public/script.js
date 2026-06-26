// ==========================================================================
// STATE MANAGEMENT & DOM REFERENCES
// ==========================================================================
let currentUser = null;
let activeGuilds = [];
let selectedGuildId = null;
let currentSettings = null;

const DOM = {
  loadingOverlay: document.getElementById('loading-overlay'),
  loginContainer: document.getElementById('login-container'),
  appContainer: document.getElementById('app-container'),
  
  // User Profile
  userAvatar: document.getElementById('user-avatar'),
  userName: document.getElementById('user-name'),
  
  // Guild Selector
  guildSelect: document.getElementById('guild-select'),
  activeServerBadge: document.getElementById('active-server-badge'),
  pageTitle: document.getElementById('page-title'),
  
  // Navigation Tabs
  navItems: document.querySelectorAll('.nav-item'),
  tabContents: document.querySelectorAll('.tab-content'),
  
  // Overview
  statMembers: document.getElementById('stat-members'),
  statChannels: document.getElementById('stat-channels'),
  statRoles: document.getElementById('stat-roles'),
  logsTbody: document.getElementById('logs-tbody'),
  refreshLogsBtn: document.getElementById('refresh-logs-btn'),
  
  // Limits
  limitsForm: document.getElementById('limits-form'),
  saveLimitsBtn: document.getElementById('save-limits-btn'),
  loggingChannelSelect: document.getElementById('settings-logging-channel'),
  
  // Backups
  createBackupBtn: document.getElementById('btn-create-backup'),
  uploadTriggerBtn: document.getElementById('btn-upload-trigger'),
  fileInput: document.getElementById('backup-file-input'),
  backupsContainer: document.getElementById('backups-container'),
  
  // Templates
  templateNameInput: document.getElementById('template-name-input'),
  createTemplateBtn: document.getElementById('btn-create-template'),
  templatesContainer: document.getElementById('templates-container'),
  
  // Trusted Users
  trustedUserIdInput: document.getElementById('trusted-userid-input'),
  addTrustedBtn: document.getElementById('btn-add-trusted'),
  trustedTbody: document.getElementById('trusted-tbody')
};

// ==========================================================================
// CORE INITIALIZATION
// ==========================================================================
document.addEventListener('DOMContentLoaded', async () => {
  setupNavigation();
  await checkAuthentication();
});

/**
 * Checks OAuth login state and toggles viewport card visibility.
 */
async function checkAuthentication() {
  showLoading('Loading account settings...');
  try {
    const res = await fetch('/api/auth/me');
    if (res.status === 200) {
      currentUser = await res.json();
      DOM.userAvatar.src = currentUser.avatar 
        ? `https://cdn.discordapp.com/avatars/${currentUser.id}/${currentUser.avatar}.png`
        : 'https://cdn.discordapp.com/embed/avatars/0.png';
      DOM.userName.textContent = currentUser.username;
      
      await loadGuilds();
      
      DOM.loginContainer.classList.add('hidden');
      DOM.appContainer.classList.remove('hidden');
    } else {
      DOM.loginContainer.classList.remove('hidden');
      DOM.appContainer.classList.add('hidden');
    }
  } catch (error) {
    console.error('Auth check failed:', error);
    DOM.loginContainer.classList.remove('hidden');
  } finally {
    hideLoading();
  }
}

/**
 * Fetches user owned guilds where bot is present.
 */
async function loadGuilds() {
  try {
    const res = await fetch('/api/guilds');
    activeGuilds = await res.json();
    
    // Clear selector
    DOM.guildSelect.innerHTML = '<option value="" disabled selected>Select a Server...</option>';
    
    activeGuilds.forEach(g => {
      const opt = document.createElement('option');
      opt.value = g.id;
      opt.textContent = g.name;
      DOM.guildSelect.appendChild(opt);
    });

    // Auto-select first guild if available
    if (activeGuilds.length > 0) {
      DOM.guildSelect.selectedIndex = 1;
      await handleGuildChange(activeGuilds[0].id);
    }
    
    // Dropdown change listener
    DOM.guildSelect.addEventListener('change', async (e) => {
      await handleGuildChange(e.target.value);
    });

  } catch (error) {
    console.error('Failed to load guilds:', error);
  }
}

/**
 * Handles reloading dashboard context when the active server changes.
 */
async function handleGuildChange(guildId) {
  selectedGuildId = guildId;
  const activeGuild = activeGuilds.find(g => g.id === guildId);
  if (!activeGuild) return;
  
  DOM.activeServerBadge.textContent = activeGuild.name;
  
  showLoading(`Loading settings for ${activeGuild.name}...`);
  await Promise.all([
    loadOverviewStats(),
    loadIncidentLogs(),
    loadSecurityLimits(),
    loadBackupsList(),
    loadTemplatesList(),
    loadTrustedUsers()
  ]);
  hideLoading();
}

// ==========================================================================
// SPA NAVIGATION ENGINE
// ==========================================================================
function setupNavigation() {
  DOM.navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      
      const targetTab = item.dataset.tab;
      
      // Update Navigation styling
      DOM.navItems.forEach(nav => nav.classList.remove('active'));
      item.classList.add('active');
      
      // Update page title
      DOM.pageTitle.textContent = item.textContent.trim();
      
      // Toggle Sections
      DOM.tabContents.forEach(content => {
        if (content.id === `tab-${targetTab}`) {
          content.classList.remove('hidden');
        } else {
          content.classList.add('hidden');
        }
      });
    });
  });

  // Action listeners
  DOM.refreshLogsBtn.addEventListener('click', loadIncidentLogs);
  DOM.saveLimitsBtn.addEventListener('click', saveSecurityLimitsSettings);
  DOM.createBackupBtn.addEventListener('click', createGuildBackup);
  
  DOM.uploadTriggerBtn.addEventListener('click', () => DOM.fileInput.click());
  DOM.fileInput.addEventListener('change', uploadBackupFile);
  
  DOM.createTemplateBtn.addEventListener('click', createServerTemplate);
  DOM.addTrustedBtn.addEventListener('click', addTrustedUserAction);
}

// ==========================================================================
// API CLIENT CALLS & RENDERERS
// ==========================================================================

/* --- 1. OVERVIEW & STATS --- */

async function loadOverviewStats() {
  try {
    const res = await fetch(`/api/guilds/${selectedGuildId}`);
    if (res.ok) {
      const stats = await res.json();
      DOM.statMembers.textContent = stats.memberCount.toLocaleString();
      DOM.statChannels.textContent = stats.channelsCount;
      DOM.statRoles.textContent = stats.rolesCount;
    }
  } catch (error) {
    console.error('Failed to load stats:', error);
  }
}

async function loadIncidentLogs() {
  try {
    DOM.logsTbody.innerHTML = '<tr><td colspan="6" class="table-empty">Loading logs...</td></tr>';
    const res = await fetch(`/api/guilds/${selectedGuildId}/logs`);
    if (res.ok) {
      const logs = await res.json();
      if (logs.length === 0) {
        DOM.logsTbody.innerHTML = '<tr><td colspan="6" class="table-empty">No security incidents logged. Server is clean!</td></tr>';
        return;
      }

      DOM.logsTbody.innerHTML = logs.map(log => {
        const severityClass = `severity-${log.severity}`;
        const date = new Date(log.timestamp).toLocaleString();
        return `
          <tr>
            <td>${date}</td>
            <td><strong>${log.action}</strong></td>
            <td><code>${log.executorTag}</code></td>
            <td>${log.targetName ? `${log.targetName} (${log.targetId})` : '-'}</td>
            <td><span class="severity-badge ${severityClass}">${log.severity}</span></td>
            <td style="max-width: 250px; overflow: hidden; text-overflow: ellipsis;">${log.reason}</td>
          </tr>
        `;
      }).join('');
    }
  } catch (error) {
    DOM.logsTbody.innerHTML = '<tr><td colspan="6" class="table-empty">Failed to retrieve logs.</td></tr>';
  }
}

/* --- 2. SECURITY LIMITS --- */

async function loadSecurityLimits() {
  try {
    const res = await fetch(`/api/guilds/${selectedGuildId}/settings`);
    if (res.ok) {
      const data = await res.json();
      currentSettings = data.settings;
      
      // Populate logging selection
      DOM.loggingChannelSelect.innerHTML = '<option value="">No log channel selected</option>';
      data.channels.forEach(ch => {
        const opt = document.createElement('option');
        opt.value = ch.id;
        opt.textContent = `#${ch.name}`;
        if (currentSettings.loggingChannelId === ch.id) {
          opt.selected = true;
        }
        DOM.loggingChannelSelect.appendChild(opt);
      });

      // Populate auto backup options
      const intervalSelect = document.getElementsByName('autoBackupInterval')[0];
      intervalSelect.value = currentSettings.autoBackupInterval;

      const retentionInput = document.getElementsByName('backupRetentionDays')[0];
      retentionInput.value = currentSettings.backupRetentionDays;

      // Map values to form inputs dynamically
      const form = DOM.limitsForm;
      
      // Rate limits mapping helper
      const populateLimit = (key, nodeName) => {
        const rule = currentSettings.limits[key];
        form.querySelector(`[name="limits.${nodeName}.limit"]`).value = rule.limit;
        form.querySelector(`[name="limits.${nodeName}.window"]`).value = rule.window;
        form.querySelector(`[name="limits.${nodeName}.enabled"]`).checked = rule.enabled;
      };

      populateLimit('channelDelete', 'channelDelete');
      populateLimit('channelCreate', 'channelCreate');
      populateLimit('roleDelete', 'roleDelete');
      populateLimit('roleCreate', 'roleCreate');
      populateLimit('memberBan', 'memberBan');
      populateLimit('memberKick', 'memberKick');

      // Advanced toggles
      form.querySelector('[name="limits.dangerousPermissionGrant.enabled"]').checked = currentSettings.limits.dangerousPermissionGrant.enabled;
      form.querySelector('[name="limits.unauthorizedBotAdd.enabled"]').checked = currentSettings.limits.unauthorizedBotAdd.enabled;
      form.querySelector('[name="limits.dangerousWebhookCreate.enabled"]').checked = currentSettings.limits.dangerousWebhookCreate.enabled;
    }
  } catch (error) {
    console.error('Failed to load settings:', error);
  }
}

async function saveSecurityLimitsSettings(e) {
  e.preventDefault();
  
  if (!selectedGuildId) return;

  const form = DOM.limitsForm;
  const payload = {
    loggingChannelId: form.querySelector('[name="loggingChannelId"]').value || null,
    autoBackupInterval: form.querySelector('[name="autoBackupInterval"]').value,
    backupRetentionDays: parseInt(form.querySelector('[name="backupRetentionDays"]').value, 10),
    limits: {
      channelDelete: {
        limit: parseInt(form.querySelector('[name="limits.channelDelete.limit"]').value, 10),
        window: parseInt(form.querySelector('[name="limits.channelDelete.window"]').value, 10),
        enabled: form.querySelector('[name="limits.channelDelete.enabled"]').checked
      },
      channelCreate: {
        limit: parseInt(form.querySelector('[name="limits.channelCreate.limit"]').value, 10),
        window: parseInt(form.querySelector('[name="limits.channelCreate.window"]').value, 10),
        enabled: form.querySelector('[name="limits.channelCreate.enabled"]').checked
      },
      roleDelete: {
        limit: parseInt(form.querySelector('[name="limits.roleDelete.limit"]').value, 10),
        window: parseInt(form.querySelector('[name="limits.roleDelete.window"]').value, 10),
        enabled: form.querySelector('[name="limits.roleDelete.enabled"]').checked
      },
      roleCreate: {
        limit: parseInt(form.querySelector('[name="limits.roleCreate.limit"]').value, 10),
        window: parseInt(form.querySelector('[name="limits.roleCreate.window"]').value, 10),
        enabled: form.querySelector('[name="limits.roleCreate.enabled"]').checked
      },
      memberBan: {
        limit: parseInt(form.querySelector('[name="limits.memberBan.limit"]').value, 10),
        window: parseInt(form.querySelector('[name="limits.memberBan.window"]').value, 10),
        enabled: form.querySelector('[name="limits.memberBan.enabled"]').checked
      },
      memberKick: {
        limit: parseInt(form.querySelector('[name="limits.memberKick.limit"]').value, 10),
        window: parseInt(form.querySelector('[name="limits.memberKick.window"]').value, 10),
        enabled: form.querySelector('[name="limits.memberKick.enabled"]').checked
      },
      dangerousPermissionGrant: {
        enabled: form.querySelector('[name="limits.dangerousPermissionGrant.enabled"]').checked
      },
      unauthorizedBotAdd: {
        enabled: form.querySelector('[name="limits.unauthorizedBotAdd.enabled"]').checked
      },
      dangerousWebhookCreate: {
        enabled: form.querySelector('[name="limits.dangerousWebhookCreate.enabled"]').checked
      }
    }
  };

  showLoading('Saving settings...');
  try {
    const res = await fetch(`/api/guilds/${selectedGuildId}/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      alert('Settings updated successfully!');
      await loadSecurityLimits();
    } else {
      alert('Failed to save settings.');
    }
  } catch (error) {
    console.error('Failed to save settings:', error);
    alert('Error saving settings.');
  } finally {
    hideLoading();
  }
}

/* --- 3. BACKUPS MANAGER --- */

async function loadBackupsList() {
  try {
    DOM.backupsContainer.innerHTML = '<div class="table-empty">Loading backups...</div>';
    const res = await fetch(`/api/guilds/${selectedGuildId}/backups`);
    if (res.ok) {
      const backups = await res.json();
      if (backups.length === 0) {
        DOM.backupsContainer.innerHTML = '<div class="table-empty">No backups saved for this server. Click "Create Backup" to save.</div>';
        return;
      }

      DOM.backupsContainer.innerHTML = backups.map(b => {
        const date = new Date(b.createdAt).toLocaleString();
        const typeClass = b.type === 'manual' ? 'badge-manual' : 'badge-auto';
        return `
          <div class="item-row">
            <div class="item-details">
              <h4>Backup ID: ${b.backupId} <span class="badge ${typeClass}">${b.type}</span></h4>
              <p>Created on: ${date} | Roles: ${b.data.roles.length} | Channels: ${b.data.channels.length}</p>
            </div>
            <div class="item-actions">
              <button class="btn btn-secondary btn-sm" onclick="downloadBackup('${b.backupId}')"><i class="fa-solid fa-download"></i> Download</button>
              <button class="btn btn-primary btn-sm" onclick="restoreBackup('${b.backupId}')"><i class="fa-solid fa-clock-rotate-left"></i> Restore</button>
            </div>
          </div>
        `;
      }).join('');
    }
  } catch (error) {
    DOM.backupsContainer.innerHTML = '<div class="table-empty">Failed to load backups.</div>';
  }
}

async function createGuildBackup() {
  if (!selectedGuildId) return;
  showLoading('Creating server backup...');
  try {
    const res = await fetch(`/api/guilds/${selectedGuildId}/backups`, { method: 'POST' });
    if (res.ok) {
      alert('Backup created successfully!');
      await loadBackupsList();
    } else {
      alert('Failed to create backup.');
    }
  } catch (error) {
    console.error('Failed to create backup:', error);
    alert('Error creating backup.');
  } finally {
    hideLoading();
  }
}

window.downloadBackup = function(backupId) {
  if (!selectedGuildId || !backupId) return;
  window.open(`/api/guilds/${selectedGuildId}/backups/${backupId}/download`, '_blank');
};

window.restoreBackup = async function(backupId) {
  if (!selectedGuildId || !backupId) return;
  
  const confirmRestore = confirm(
    "⚠️ CRITICAL ACTION WARNING!\n\nRestoring a backup will DESTRUCTIVELY rebuild your server. All current channels and non-bot roles will be deleted.\n\nAre you sure you want to proceed with restore?"
  );
  
  if (!confirmRestore) return;

  showLoading('Initiating server rebuild...');
  try {
    const res = await fetch(`/api/guilds/${selectedGuildId}/backups/${backupId}/restore`, { method: 'POST' });
    if (res.ok) {
      alert('Rebuild initiated! Real-time restoration logs will be sent to the owner\'s DMs.');
    } else {
      alert('Failed to initiate restore.');
    }
  } catch (error) {
    console.error('Failed to restore backup:', error);
    alert('Error running restore.');
  } finally {
    hideLoading();
  }
};

async function uploadBackupFile(e) {
  const file = e.target.files[0];
  if (!file || !selectedGuildId) return;

  const reader = new FileReader();
  reader.onload = async (event) => {
    const fileText = event.target.result;
    showLoading('Uploading backup data...');
    try {
      const res = await fetch(`/api/guilds/${selectedGuildId}/backups/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ backupJson: fileText })
      });

      if (res.ok) {
        alert('Backup JSON uploaded and saved successfully!');
        await loadBackupsList();
      } else {
        const err = await res.json();
        alert(`Failed to upload backup: ${err.error || 'Unknown error'}`);
      }
    } catch (error) {
      alert('Error parsing or sending backup file.');
    } finally {
      hideLoading();
      DOM.fileInput.value = ''; // Reset input file
    }
  };
  reader.readAsText(file);
}

/* --- 4. TEMPLATES MANAGER --- */

async function loadTemplatesList() {
  try {
    DOM.templatesContainer.innerHTML = '<div class="table-empty">Loading templates...</div>';
    const res = await fetch(`/api/guilds/${selectedGuildId}/templates`);
    if (res.ok) {
      const templates = await res.json();
      if (templates.length === 0) {
        DOM.templatesContainer.innerHTML = '<div class="table-empty">No templates saved. Save the current layout as a template above.</div>';
        return;
      }

      DOM.templatesContainer.innerHTML = templates.map(t => {
        const date = new Date(t.createdAt).toLocaleString();
        return `
          <div class="item-row">
            <div class="item-details">
              <h4>Template Name: ${t.templateId}</h4>
              <p>Saved on: ${date} | Roles: ${t.data.roles.length} | Channels: ${t.data.channels.length}</p>
            </div>
            <div class="item-actions">
              <button class="btn btn-danger btn-sm" onclick="deleteTemplate('${t.templateId}')"><i class="fa-solid fa-trash"></i> Delete</button>
              <button class="btn btn-primary btn-sm" onclick="applyTemplate('${t.templateId}')"><i class="fa-solid fa-rocket"></i> Apply</button>
            </div>
          </div>
        `;
      }).join('');
    }
  } catch (error) {
    DOM.templatesContainer.innerHTML = '<div class="table-empty">Failed to load templates.</div>';
  }
}

async function createServerTemplate() {
  const name = DOM.templateNameInput.value.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '');
  if (!name) {
    alert('Please enter a valid template name (alphanumeric, hyphens or underscores).');
    return;
  }

  showLoading('Saving template...');
  try {
    const res = await fetch(`/api/guilds/${selectedGuildId}/templates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ templateId: name })
    });

    if (res.ok) {
      alert(`Successfully saved layout as template "${name}"!`);
      DOM.templateNameInput.value = '';
      await loadTemplatesList();
    } else {
      alert('Failed to save template.');
    }
  } catch (error) {
    console.error('Failed to create template:', error);
    alert('Error saving template.');
  } finally {
    hideLoading();
  }
}

window.applyTemplate = async function(templateId) {
  if (!selectedGuildId || !templateId) return;

  const confirmApply = confirm(
    `⚠️ TEMPLATE WARNING!\n\nApplying template "${templateId}" will delete all current channels and roles to rebuild the server layout.\n\nAre you sure you want to proceed?`
  );

  if (!confirmApply) return;

  showLoading('Applying template...');
  try {
    const res = await fetch(`/api/guilds/${selectedGuildId}/templates/${templateId}/apply`, { method: 'POST' });
    if (res.ok) {
      alert('Template application started! Rebuild logs will be sent to the owner\'s DMs.');
    } else {
      alert('Failed to apply template.');
    }
  } catch (error) {
    console.error('Failed to apply template:', error);
    alert('Error applying template.');
  } finally {
    hideLoading();
  }
};

window.deleteTemplate = async function(templateId) {
  if (!selectedGuildId || !templateId) return;

  const confirmDelete = confirm(`Are you sure you want to delete template "${templateId}"?`);
  if (!confirmDelete) return;

  showLoading('Deleting template...');
  try {
    const res = await fetch(`/api/guilds/${selectedGuildId}/templates/${templateId}`, { method: 'DELETE' });
    if (res.ok) {
      alert('Template deleted.');
      await loadTemplatesList();
    } else {
      alert('Failed to delete template.');
    }
  } catch (error) {
    console.error('Failed to delete template:', error);
    alert('Error deleting template.');
  } finally {
    hideLoading();
  }
};

/* --- 5. TRUSTED USERS --- */

async function loadTrustedUsers() {
  try {
    DOM.trustedTbody.innerHTML = '<tr><td colspan="5" class="table-empty">Loading trusted list...</td></tr>';
    const res = await fetch(`/api/guilds/${selectedGuildId}/trusted`);
    if (res.ok) {
      const trusted = await res.json();
      if (trusted.length === 0) {
        DOM.trustedTbody.innerHTML = '<tr><td colspan="5" class="table-empty">No trusted users added. Add one above.</td></tr>';
        return;
      }

      DOM.trustedTbody.innerHTML = trusted.map(u => {
        const date = new Date(u.addedAt).toLocaleDateString();
        return `
          <tr>
            <td><strong>${u.username}</strong></td>
            <td><code>${u.userId}</code></td>
            <td>${u.addedBy}</td>
            <td>${date}</td>
            <td>
              <button class="btn btn-danger btn-sm" onclick="removeTrustedUser('${u.userId}')">
                <i class="fa-solid fa-user-minus"></i> Untrust
              </button>
            </td>
          </tr>
        `;
      }).join('');
    }
  } catch (error) {
    DOM.trustedTbody.innerHTML = '<tr><td colspan="5" class="table-empty">Failed to load trusted users.</td></tr>';
  }
}

async function addTrustedUserAction() {
  const userId = DOM.trustedUserIdInput.value.trim();
  if (!userId || !/^\d{17,19}$/.test(userId)) {
    alert('Please enter a valid Discord User ID (17-19 numerical digits).');
    return;
  }

  showLoading('Adding user to trusted list...');
  try {
    const res = await fetch(`/api/guilds/${selectedGuildId}/trusted`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId })
    });

    if (res.ok) {
      alert('Successfully added user to trusted list!');
      DOM.trustedUserIdInput.value = '';
      await loadTrustedUsers();
    } else {
      const err = await res.json();
      alert(`Failed to add user: ${err.error || 'Unknown error'}`);
    }
  } catch (error) {
    console.error('Failed to add trusted user:', error);
    alert('Error adding trusted user.');
  } finally {
    hideLoading();
  }
}

window.removeTrustedUser = async function(userId) {
  if (!selectedGuildId || !userId) return;

  const confirmRemove = confirm(`Are you sure you want to untrust user ID ${userId}?`);
  if (!confirmRemove) return;

  showLoading('Removing trusted user...');
  try {
    const res = await fetch(`/api/guilds/${selectedGuildId}/trusted/${userId}`, { method: 'DELETE' });
    if (res.ok) {
      alert('User removed from trusted list.');
      await loadTrustedUsers();
    } else {
      alert('Failed to untrust user.');
    }
  } catch (error) {
    console.error('Failed to remove trusted user:', error);
    alert('Error untrusting user.');
  } finally {
    hideLoading();
  }
};

// ==========================================================================
// LOADING STATE HELPERS
// ==========================================================================
function showLoading(msg = 'Processing Request...') {
  DOM.loadingOverlay.querySelector('p').textContent = msg;
  DOM.loadingOverlay.classList.remove('hidden');
}

function hideLoading() {
  DOM.loadingOverlay.classList.add('hidden');
}
