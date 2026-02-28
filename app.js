// ═════════════════════════════════════════
//  CONSTANTS  ← PUT YOUR KEY ON THE NEXT LINE
// ═════════════════════════════════════════
const API_KEY = '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'; // ← paste your Groq key here
const API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const AI_MODEL = 'llama-3.3-70b-versatile';
const STORAGE_KEY = 'doit_projects_v1';

// ═════════════════════════════════════════
//  FIREBASE
// ═════════════════════════════════════════
import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.4.0/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged }
    from 'https://www.gstatic.com/firebasejs/11.4.0/firebase-auth.js';
import { getDatabase, ref, set, onValue }
    from 'https://www.gstatic.com/firebasejs/11.4.0/firebase-database.js';

const firebaseConfig = {
    apiKey: 'AIzaSyA0YeBa8CS2E07F4PlXbuRjHfwKnQWmbPw',
    authDomain: 'doit-3f2b2.firebaseapp.com',
    databaseURL: 'https://doit-3f2b2-default-rtdb.firebaseio.com',
    projectId: 'doit-3f2b2',
    storageBucket: 'doit-3f2b2.firebasestorage.app',
    messagingSenderId: '745151139496',
    appId: '1:745151139496:web:a89245532b0ba3c83c7c9d',
    measurementId: 'G-K1W6NZ8NX7'
};

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getDatabase(firebaseApp);

let currentUser = null;
let dbUnsubscribe = null; // detach previous DB listener on sign-out

// ═════════════════════════════════════════
//  STATE
// ═════════════════════════════════════════
let projects = loadProjectsLocal();
let confirmCallback = null;

// ═════════════════════════════════════════
//  DOM REFS
// ═════════════════════════════════════════
const topicInput = document.getElementById('topic-input');
const learnBtn = document.getElementById('learn-btn');
const btnInner = document.getElementById('btn-inner');
const heroError = document.getElementById('hero-error');
const heroSection = document.getElementById('hero');
const projectsSection = document.getElementById('projects-section');
const projectsList = document.getElementById('projects-list');
const projectsCount = document.getElementById('projects-count');
const headerStats = document.getElementById('header-stats');
const toast = document.getElementById('toast');
const confirmOverlay = document.getElementById('confirm-overlay');
const confirmMsg = document.getElementById('confirm-msg');
const confirmCancel = document.getElementById('confirm-cancel');
const confirmOk = document.getElementById('confirm-ok');
const authBtn = document.getElementById('auth-btn');
const userInfo = document.getElementById('user-info');
const userAvatar = document.getElementById('user-avatar');
const userName = document.getElementById('user-name');
const signoutBtn = document.getElementById('signout-btn');

// ═════════════════════════════════════════
//  INIT
// ═════════════════════════════════════════
render();
setupEventListeners();

// ═════════════════════════════════════════
//  AUTH STATE
// ═════════════════════════════════════════
onAuthStateChanged(auth, (user) => {
    currentUser = user;

    if (user) {
        // Show user info, hide sign-in button
        authBtn.style.display = 'none';
        userInfo.style.display = 'flex';
        userAvatar.src = user.photoURL || '';
        userAvatar.style.display = user.photoURL ? '' : 'none';
        userName.textContent = user.displayName || user.email;

        // Listen for projects in Realtime DB
        attachDbListener(user.uid);
    } else {
        // Show sign-in button, hide user info
        authBtn.style.display = '';
        userInfo.style.display = 'none';

        // Detach DB listener, fall back to local
        if (dbUnsubscribe) { dbUnsubscribe(); dbUnsubscribe = null; }
        projects = loadProjectsLocal();
        render();
    }
});

function attachDbListener(uid) {
    if (dbUnsubscribe) dbUnsubscribe();
    const projectsRef = ref(db, `users/${uid}/projects`);
    dbUnsubscribe = onValue(projectsRef, (snapshot) => {
        projects = snapshot.exists() ? Object.values(snapshot.val()) : [];
        render();
    });
}

// ═════════════════════════════════════════
//  EVENT LISTENERS
// ═════════════════════════════════════════
function setupEventListeners() {
    learnBtn.addEventListener('click', handleLearn);
    topicInput.addEventListener('keydown', e => { if (e.key === 'Enter') handleLearn(); });

    authBtn.addEventListener('click', () => {
        signInWithPopup(auth, new GoogleAuthProvider()).catch(err => {
            showError('Sign-in failed: ' + err.message);
        });
    });

    signoutBtn.addEventListener('click', () => {
        signOut(auth);
        showToast('Signed out');
    });

    confirmCancel.addEventListener('click', () => {
        confirmOverlay.classList.remove('show');
        confirmCallback = null;
    });

    confirmOk.addEventListener('click', () => {
        if (confirmCallback) confirmCallback();
        confirmOverlay.classList.remove('show');
        confirmCallback = null;
    });
}

// ═════════════════════════════════════════
//  HANDLERS
// ═════════════════════════════════════════
async function handleLearn() {
    const topic = topicInput.value.trim();
    if (!topic) {
        showError('Please enter a topic to learn.');
        topicInput.focus();
        return;
    }
    if (API_KEY === 'YOUR_GROQ_KEY_HERE') {
        showError('No API key. Paste your Groq key in app.js line 4.');
        return;
    }
    hideError();
    setLoading(true);

    try {
        const data = await callAI(topic);
        const project = buildProject(topic, data);
        projects.unshift(project);
        saveProjects();
        topicInput.value = '';
        render();
        showToast(`Project "${project.name}" created`);
    } catch (err) {
        console.error(err);
        showError('API error: ' + (err.message || 'Unknown error. Check console.'));
    } finally {
        setLoading(false);
    }
}

// ═════════════════════════════════════════
//  AI API (Groq)
// ═════════════════════════════════════════
async function callAI(topic) {
    const prompt = `You are a structured learning curriculum designer.

Create a complete, ordered learning roadmap for the topic: "${topic}"

Return ONLY valid JSON (no markdown fences, no extra text) in this exact format:
{
  "projectName": "Short evocative project name (max 5 words)",
  "phases": [
    {
      "phase": "Phase name (e.g. Foundations, Core Concepts, Intermediate, Advanced, Expert)",
      "tasks": [
        "Specific, actionable task description",
        "Another specific task"
      ]
    }
  ]
}

Rules:
- 4 to 6 phases
- 4 to 8 tasks per phase
- Tasks must be specific and actionable
- Order: absolute beginner → expert
- Project name should be evocative and topic-specific`;

    const res = await fetch(API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${API_KEY}`
        },
        body: JSON.stringify({
            model: AI_MODEL,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.7,
            max_tokens: 2048
        })
    });

    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`HTTP ${res.status}: ${errText}`);
    }

    const json = await res.json();
    const raw = json?.choices?.[0]?.message?.content;
    if (!raw) throw new Error('Empty response from AI.');

    const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();

    let parsed;
    try { parsed = JSON.parse(cleaned); }
    catch { throw new Error('AI returned invalid JSON. Try again.'); }

    if (!parsed.projectName || !Array.isArray(parsed.phases))
        throw new Error('Unexpected structure from AI.');

    return parsed;
}

// ═════════════════════════════════════════
//  BUILD PROJECT OBJECT
// ═════════════════════════════════════════
function buildProject(topic, data) {
    const id = 'p_' + Date.now();
    const phases = data.phases.map((ph, pi) => ({
        phase: ph.phase || `Phase ${pi + 1}`,
        tasks: (ph.tasks || []).map((t, ti) => ({
            id: `${id}_${pi}_${ti}`,
            text: t,
            done: false
        }))
    }));
    return { id, name: data.projectName, topic, createdAt: Date.now(), open: true, phases };
}

// ═════════════════════════════════════════
//  RENDER
// ═════════════════════════════════════════
function render() {
    const hasProjects = projects.length > 0;

    heroSection.classList.toggle('compact', hasProjects);
    projectsSection.style.display = hasProjects ? '' : 'none';

    projectsCount.textContent = projects.length + (projects.length === 1 ? ' project' : ' projects');
    const totalTasks = projects.reduce((a, p) => a + countTasks(p), 0);
    const doneTasks = projects.reduce((a, p) => a + countDone(p), 0);
    headerStats.textContent = hasProjects ? `${doneTasks}/${totalTasks} tasks done` : '';

    projectsList.innerHTML = '';
    projects.forEach(project => projectsList.appendChild(renderProject(project)));
}

function renderProject(project) {
    const total = countTasks(project);
    const done = countDone(project);
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;

    const card = document.createElement('div');
    card.className = 'project-card' + (project.open ? ' open' : '');
    card.dataset.id = project.id;

    const date = new Date(project.createdAt).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric'
    });

    card.innerHTML = `
    <div class="project-header" data-action="toggle">
      <span class="project-chevron">▶</span>
      <div class="project-title-wrap">
        <div class="project-name">${escHtml(project.name)}</div>
        <div class="project-meta">${escHtml(project.topic)} &middot; ${date}</div>
      </div>
      <div class="project-progress-wrap">
        <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
        <div class="progress-pct">${pct}%</div>
      </div>
      <button class="project-delete-btn" data-action="delete" title="Delete project">✕</button>
    </div>
    <div class="project-body">${renderPhases(project)}</div>
  `;

    card.querySelector('.project-header').addEventListener('click', (e) => {
        if (e.target.closest('[data-action="delete"]')) return;
        project.open = !project.open;
        saveProjects();
        card.classList.toggle('open', project.open);
    });

    card.querySelector('[data-action="delete"]').addEventListener('click', (e) => {
        e.stopPropagation();
        showConfirm(
            `Delete "${project.name}"?`,
            'All progress will be lost. This cannot be undone.',
            () => {
                projects = projects.filter(p => p.id !== project.id);
                saveProjects();
                render();
                showToast('Project deleted');
            }
        );
    });

    card.querySelectorAll('.task-item').forEach(item => {
        item.addEventListener('click', () => {
            const tid = item.dataset.tid;
            toggleTask(project, tid);
            const task = findTask(project, tid);
            item.classList.toggle('done', task.done);
            const newDone = countDone(project);
            const newPct = total > 0 ? Math.round((newDone / total) * 100) : 0;
            card.querySelector('.progress-fill').style.width = newPct + '%';
            card.querySelector('.progress-pct').textContent = newPct + '%';
            headerStats.textContent = buildHeaderStats();
            saveProjects();
        });
    });

    return card;
}

function renderPhases(project) {
    return project.phases.map(ph => {
        const total = ph.tasks.length;
        const done = ph.tasks.filter(t => t.done).length;
        return `
    <div class="phase-group">
      <div class="phase-label">${escHtml(ph.phase)}<span class="phase-count">${done}/${total}</span></div>
      <ul class="task-list">
        ${ph.tasks.map(task => `
          <li class="task-item${task.done ? ' done' : ''}" data-tid="${task.id}">
            <div class="task-box"><span class="task-box-check">✓</span></div>
            <span class="task-text">${escHtml(task.text)}</span>
          </li>
        `).join('')}
      </ul>
    </div>`;
    }).join('');
}

// ═════════════════════════════════════════
//  HELPERS
// ═════════════════════════════════════════
function countTasks(p) { return p.phases.reduce((a, ph) => a + ph.tasks.length, 0); }
function countDone(p) { return p.phases.reduce((a, ph) => a + ph.tasks.filter(t => t.done).length, 0); }

function findTask(project, tid) {
    for (const ph of project.phases) {
        const t = ph.tasks.find(t => t.id === tid);
        if (t) return t;
    }
    return null;
}

function toggleTask(project, tid) {
    const t = findTask(project, tid);
    if (t) t.done = !t.done;
}

function buildHeaderStats() {
    const total = projects.reduce((a, p) => a + countTasks(p), 0);
    const done = projects.reduce((a, p) => a + countDone(p), 0);
    return projects.length ? `${done}/${total} done` : '';
}

function escHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// ═════════════════════════════════════════
//  PERSISTENCE
// ═════════════════════════════════════════
function loadProjectsLocal() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch { return []; }
}

function saveProjects() {
    // Always save locally
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(projects)); } catch { }

    // Also sync to Firebase if signed in
    if (currentUser) {
        const projectsRef = ref(db, `users/${currentUser.uid}/projects`);
        // Convert array to object keyed by id for Firebase
        const obj = {};
        projects.forEach(p => { obj[p.id] = p; });
        set(projectsRef, obj).catch(err => console.error('DB save failed:', err));
    }
}

// ═════════════════════════════════════════
//  UI HELPERS
// ═════════════════════════════════════════
function setLoading(val) {
    learnBtn.disabled = val;
    topicInput.disabled = val;
    btnInner.innerHTML = val ? '<span class="spinner"></span>BUILDING...' : 'LEARN';
}

function showError(msg) {
    heroError.textContent = msg;
    heroError.style.display = 'block';
}

function hideError() { heroError.style.display = 'none'; }

let toastTimer;
function showToast(msg, duration = 2800) {
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), duration);
}

function showConfirm(title, msg, onOk) {
    document.querySelector('.confirm-title').textContent = title;
    confirmMsg.textContent = msg;
    confirmCallback = onOk;
    confirmOverlay.classList.add('show');
}

