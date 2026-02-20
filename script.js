/**
 * ═══════════════════════════════════════════════════════════════
 *  بوابتي — Main Application Script  v4.0 (Unified & Optimized)
 *  Stack : Vanilla ES6+ · Firebase Compat v9 · Font Awesome 6
 * ═══════════════════════════════════════════════════════════════
 */

/* ─────────────────────────────────────────────────────────────
   1. CONFIG
   ───────────────────────────────────────────────────────────── */
const CONFIG = {
    collections: { posts: 'posts', users: 'users' },
    maxUploadSize: 50 * 1024 * 1024,   // 50 MB
};

const PW_RULES = {
    length: pw => pw.length >= 8,
    upper: pw => /[A-Z]/.test(pw),
    lower: pw => /[a-z]/.test(pw),
    number: pw => /[0-9]/.test(pw),
    special: pw => /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(pw),
};

const STRICT_EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

/* ─────────────────────────────────────────────────────────────
   2. ToastService
   ───────────────────────────────────────────────────────────── */
const ToastService = {
    show(message, type = 'info', ttl = 5000) {
        let container = document.getElementById('toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            document.body.appendChild(container);
        }

        const iconMap = {
            success: '<i class="fa-solid fa-circle-check"         style="color:#4ade80"></i>',
            error: '<i class="fa-solid fa-circle-xmark"         style="color:#ef4444"></i>',
            warning: '<i class="fa-solid fa-triangle-exclamation"  style="color:#fbbf24"></i>',
            info: '<i class="fa-solid fa-bell"                  style="color:#38bdf8"></i>',
        };

        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.dataset.type = type;
        toast.setAttribute('role', 'status');
        toast.innerHTML = `
            ${iconMap[type] || iconMap.info}
            <div>
                <h4 style="margin:0;font-size:.9rem;font-weight:700;">إشعار</h4>
                <p  style="margin:3px 0 0;font-size:.82rem;opacity:.9;">${message}</p>
            </div>`;

        container.appendChild(toast);
        setTimeout(() => toast.remove(), ttl);
    },
};

/* ─────────────────────────────────────────────────────────────
   3. AuthService (Firebase Core)
   ───────────────────────────────────────────────────────────── */
const AuthService = {
    currentUser: null,
    isGuest: false,
    confirmationResult: null,

    _errMap: {
        'auth/email-already-in-use': 'هذا البريد مسجّل مسبقاً.',
        'auth/user-not-found': 'بيانات الدخول غير صحيحة.',
        'auth/wrong-password': 'بيانات الدخول غير صحيحة.',
        'auth/invalid-credential': 'بيانات الدخول غير صحيحة.',
        'auth/weak-password': 'كلمة المرور ضعيفة جداً (6 أحرف على الأقل).',
        'auth/invalid-email': 'صيغة البريد الإلكتروني غير صحيحة.',
        'auth/too-many-requests': 'تجاوزت عدد المحاولات، حاول لاحقاً.',
        'auth/invalid-phone-number': 'رقم الهاتف غير صالح.',
        'auth/missing-phone-number': 'يرجى إدخال رقم الهاتف.',
    },

    _sanitize(str) {
        if (typeof str !== 'string') return '';
        return str.replace(/<[^>]*>/g, '').replace(/javascript:/gi, '').replace(/on\w+=/gi, '').trim();
    },

    init() {
        if (typeof firebaseConfig !== 'undefined' && String(firebaseConfig.apiKey).includes('YOUR_API_KEY')) {
            alert('⚠️ يرجى تحديث firebase-config.js ببيانات مشروعك.');
            return;
        }

        try {
            window.recaptchaVerifier = new firebase.auth.RecaptchaVerifier('recaptcha-container', { size: 'invisible' });
        } catch (e) { console.warn('reCAPTCHA init:', e); }

        firebase.auth().onAuthStateChanged(async user => {
            if (user) {
                this.currentUser = user;
                this.isGuest = false;
                try {
                    const snap = await firebase.firestore().collection(CONFIG.collections.users).doc(user.uid).get();
                    if (snap.exists) this.currentUser.profile = snap.data();
                } catch (err) { console.warn('Profile fetch:', err); }
                this._updateUI(user);
            } else if (!this.isGuest) {
                this.currentUser = null;
                this._updateUI(null);
            }
        });
    },

    _updateUI(user) {
        const authModal = document.getElementById('auth-modal');
        const userProfile = document.getElementById('user-profile');
        const guestCtrl = document.getElementById('guest-controls');
        const userEmailEl = document.getElementById('user-email');
        const loadingEl = document.getElementById('loading-overlay');

        if (loadingEl) loadingEl.style.display = 'none';

        if (user) {
            authModal?.classList.remove('active');
            if (userProfile) userProfile.style.display = 'flex';
            if (guestCtrl) guestCtrl.style.display = 'none';

            const name = this.currentUser?.profile
                ? `${this.currentUser.profile.firstName} ${this.currentUser.profile.lastName}`.trim()
                : (user.phoneNumber || user.email || 'مستخدم');
            if (userEmailEl) userEmailEl.textContent = name;

            DataService.subscribeToFeed();
            DataService.initScheduler();
        } else if (this.isGuest) {
            authModal?.classList.remove('active');
            if (userProfile) userProfile.style.display = 'none';
            if (guestCtrl) guestCtrl.style.display = 'flex';
            DataService.subscribeToFeed();
        } else {
            authModal?.classList.add('active');
            if (userProfile) userProfile.style.display = 'none';
            if (guestCtrl) guestCtrl.style.display = 'none';
            const feed = document.getElementById('feed-container');
            if (feed) feed.innerHTML = '';
            if (window.authV4) window.authV4.showView('login');
        }
    },

    async login(email, password) {
        try {
            await firebase.auth().signInWithEmailAndPassword(email, password);
            ToastService.show('تم تسجيل الدخول بنجاح ✅', 'success');
        } catch (err) { this._handleErr(err); throw err; }
    },

    async guestLogin() {
        this.isGuest = true;
        this.currentUser = null;
        this._updateUI(null);
        ToastService.show('تصفح ممتع! أنت الآن في وضع الزائر.', 'info');
    },

    async signup(data) {
        const { first, last, email, password } = data;
        try {
            const cred = await firebase.auth().createUserWithEmailAndPassword(email, password);
            await firebase.firestore().collection(CONFIG.collections.users).doc(cred.user.uid).set({
                firstName: first,
                lastName: last,
                email: cred.user.email,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            });
            ToastService.show('تم إنشاء الحساب بنجاح 🎉', 'success');
        } catch (err) { this._handleErr(err); throw err; }
    },

    // Aliases for authV4
    async signInWithEmail(e, p) { return this.login(e, p); },
    async signUp(payload) {
        return this.signup({
            first: payload.firstName,
            last: payload.lastName,
            email: payload.email || (payload.phone + "@bawabaty.com"),
            password: payload.password
        });
    },

    async logout() {
        try {
            this.isGuest = false;
            await firebase.auth().signOut();
            ToastService.show('تم تسجيل الخروج.', 'info');
        } catch (err) { ToastService.show('خطأ أثناء تسجيل الخروج.', 'error'); }
    },

    _handleErr(err) {
        const msg = this._errMap[err?.code] || err?.message || 'حدث خطأ غير متوقع.';
        ToastService.show(msg, 'error');
        console.warn('[AuthService]', err);
    },
};

/* ─────────────────────────────────────────────────────────────
   4. DataService
   ───────────────────────────────────────────────────────────── */
const DataService = {
    viewMode: 'feed',
    postsMap: new Map(),
    _schedulerTimer: null,
    _feedUnsubscribe: null,

    async createPost(postData, file, isDraft = false) {
        const loadingEl = document.getElementById('loading-overlay');
        if (loadingEl) loadingEl.style.display = 'flex';

        try {
            if (!postData.title?.trim()) throw new Error('يرجى إضافة عنوان للمنشور.');

            const now = Date.now();
            let status = isDraft ? 'draft' : 'published';
            let schedTS = null;

            if (!isDraft && postData.scheduleTime) {
                const sd = new Date(postData.scheduleTime);
                if (sd > new Date()) {
                    status = 'scheduled';
                    schedTS = sd.getTime();
                    postData.date = firebase.firestore.Timestamp.fromDate(sd);
                }
            }

            postData.status = status;
            if (schedTS) postData.scheduledTime = schedTS;

            if (file) {
                if (file.size > CONFIG.maxUploadSize) throw new Error('حجم الملف أكبر من 50 MB.');
                const path = `uploads/${AuthService.currentUser.uid}/${now}_${file.name}`;
                const ref = firebase.storage().ref().child(path);
                await ref.put(file);
                postData.fileUrl = await ref.getDownloadURL();
                postData.fileName = file.name;
            }

            const platforms = Array.from(document.querySelectorAll('input[name="social_platform"]:checked')).map(cb => cb.value);

            await firebase.firestore().collection(CONFIG.collections.posts).add({
                ...postData,
                platforms,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                date: postData.date || firebase.firestore.FieldValue.serverTimestamp(),
            });

            document.getElementById('upload-modal')?.classList.add('hidden');
            document.getElementById('upload-form')?.reset();
            const editor = document.getElementById('post-content-editor');
            if (editor) editor.innerHTML = '';
            EditorService.currentFile = null;

            if (!isDraft) DraftService.discard();
            const msgs = { draft: 'تم حفظ المسودة ✅', scheduled: 'تم الجدولة 📅', published: 'تم النشر 🎉' };
            ToastService.show(msgs[status] || msgs.published, 'success');

        } catch (err) {
            console.error('[DataService.createPost]', err);
            ToastService.show('فشل: ' + err.message, 'error');
        } finally {
            if (loadingEl) loadingEl.style.display = 'none';
        }
    },

    subscribeToFeed() {
        if (this._feedUnsubscribe) { this._feedUnsubscribe(); this._feedUnsubscribe = null; }
        this._feedUnsubscribe = firebase.firestore().collection(CONFIG.collections.posts)
            .orderBy('date', 'desc').limit(50)
            .onSnapshot(snap => this._onSnapshot(snap), err => console.error('[Feed]', err));
    },

    _onSnapshot(snap) {
        snap.docChanges().forEach(ch => {
            if (ch.type === 'removed') this.postsMap.delete(ch.doc.id);
            else this.postsMap.set(ch.doc.id, { id: ch.doc.id, ...ch.doc.data() });
        });
        this.renderFeed(Array.from(this.postsMap.values()));
        this.updateSidebarStats();
    },

    renderFeed(posts) {
        const feed = document.getElementById('feed-container');
        if (!feed) return;

        const uid = AuthService.currentUser?.uid;
        const filtered = posts.filter(p => {
            const mine = p.userId === uid;
            if (this.viewMode === 'scheduled') return p.status === 'scheduled' && mine;
            if (this.viewMode === 'drafts') return p.status === 'draft' && mine;
            if (this.viewMode === 'saved') return p.status === 'published' && mine;
            if (p.status === 'draft' || p.status === 'scheduled') return false;
            return p.visibility === 'public' || (p.visibility === 'private' && mine);
        });

        filtered.sort((a, b) => {
            const ms = p => (p.date?.seconds ? p.date.seconds * 1000 : 0);
            return ms(b) - ms(a);
        });

        if (!filtered.length) {
            feed.innerHTML = this.getEmptyStateHTML(this.viewMode);
        } else {
            feed.innerHTML = filtered.map(p => this._cardHTML(p)).join('');
        }
    },

    _cardHTML(post) {
        const uid = AuthService.currentUser?.uid;
        const mine = post.userId === uid;
        const dateStr = post.date?.seconds ? new Date(post.date.seconds * 1000).toLocaleDateString('ar-EG') : 'الآن';
        const draftBadge = post.status === 'draft' ? '<span class="scheduled-badge" style="background:rgba(255,255,255,.1)">مسودة</span>' : '';
        const schedBadge = post.status === 'scheduled' ? '<span class="scheduled-badge"><i class="fa-regular fa-clock"></i> مجدول</span>' : '';

        const escapeHTML = str => {
            if (typeof str !== 'string') return '';
            return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
        };

        let body = '';
        if (post.type === 'image') body = `<div class="post-image"><img src="${escapeHTML(post.fileUrl)}" alt="${escapeHTML(post.title)}" loading="lazy"></div>`;
        else if (post.type === 'file') body = `<div class="post-file"><i class="fa-solid fa-file"></i> <a href="${escapeHTML(post.fileUrl)}" target="_blank">${escapeHTML(post.fileName)}</a></div>`;
        else body = `<p class="post-text">${escapeHTML(post.content || '')}</p>`;

        const deleteBtn = mine ? `<button class="delete-btn" onclick="DataService.deletePost('${post.id}')"><i class="fa-solid fa-trash"></i></button>` : '';
        const publishBtn = (post.status === 'draft' && mine) ? `<button class="delete-btn" style="color:var(--accent-glow)" onclick="DataService.publishDraft('${post.id}')"><i class="fa-solid fa-upload"></i></button>` : '';

        return `
        <article class="post-card ${post.style || 'classic'}">
            <div class="post-header">
                <div>${draftBadge}${schedBadge}<b>${post.title}</b></div>
                <div class="meta">${dateStr}</div>
            </div>
            ${body}
            <div class="post-footer">
                <span class="user-badge"><i class="fa-solid fa-user"></i> ${(post.userEmail || '').split('@')[0] || 'مستخدم'}</span>
                <div class="actions">${publishBtn}${deleteBtn}</div>
            </div>
        </article>`;
    },

    async deletePost(id) {
        if (!confirm('هل تريد حذف هذا المنشور نهائياً؟')) return;
        try { await firebase.firestore().collection(CONFIG.collections.posts).doc(id).delete(); }
        catch (err) { ToastService.show('خطأ أثناء الحذف.', 'error'); }
    },

    async publishDraft(id) {
        try {
            await firebase.firestore().collection(CONFIG.collections.posts).doc(id).update({ status: 'published', date: firebase.firestore.FieldValue.serverTimestamp() });
            ToastService.show('تم نشر المسودة 🎉', 'success');
        }
        catch (err) { ToastService.show('خطأ أثناء النشر.', 'error'); }
    },

    initScheduler() {
        if (this._schedulerTimer) return;
        this._schedulerTimer = setInterval(() => this._checkScheduled(), 60_000);
    },

    _checkScheduled() {
        if (!AuthService.currentUser) return;
        const now = Date.now();
        this.postsMap.forEach((p, id) => {
            if (p.status === 'scheduled' && p.userId === AuthService.currentUser.uid) {
                const due = p.scheduledTime || (p.date?.seconds * 1000);
                if (due && due <= now) this._setStatus(id, 'published');
            }
        });
    },

    async _setStatus(id, status) {
        try { await firebase.firestore().collection(CONFIG.collections.posts).doc(id).update({ status, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }); }
        catch (err) { console.error(err); }
    },

    updateSidebarStats() {
        const posts = Array.from(this.postsMap.values());
        const uid = AuthService.currentUser?.uid;
        if (!uid) return;
        const pub = posts.filter(p => p.status === 'published' && p.userId === uid).length;
        const drf = posts.filter(p => p.status === 'draft' && p.userId === uid).length;
        const sch = posts.filter(p => p.status === 'scheduled' && p.userId === uid).length;

        const set = (id, v) => {
            const el = document.getElementById(id);
            if (el) el.textContent = v;
        };
        set('stat-published', pub); set('stat-drafts', drf); set('stat-scheduled', sch);
    },

    getEmptyStateHTML(mode) {
        const states = {
            feed: { title: 'لا توجد منشورات', text: 'كن أول من يشارك محتوى!' },
            scheduled: { title: 'لا توجد منشورات مجدولة', text: 'خطط لمنشوراتك القادمة هنا.' },
            drafts: { title: 'لا توجد مسودات', text: 'احفظ أفكارك لمراجعتها لاحقاً.' },
            saved: { title: 'لا توجد محفوظات', text: 'احفظ المنشورات للرجوع إليها.' }
        };
        const s = states[mode] || states.feed;
        return `<div class="empty-state"><h3>${s.title}</h3><p>${s.text}</p></div>`;
    }
};

/* ─────────────────────────────────────────────────────────────
   5. EditorService
   ───────────────────────────────────────────────────────────── */
const EditorService = {
    currentFile: null,
    currentType: 'article',

    init() {
        this._initRTE();
        this._initDragDrop();
        this._initTemplates();
    },

    _initRTE() {
        const editor = document.getElementById('post-content-editor');
        if (!editor) return;
        document.querySelectorAll('[data-cmd]').forEach(btn => {
            btn.addEventListener('click', () => { document.execCommand(btn.dataset.cmd, false, null); editor.focus(); });
        });
        editor.addEventListener('input', () => this._updatePreview());
    },

    _initDragDrop() {
        const dz = document.getElementById('drop-zone');
        if (!dz) return;
        dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('drag-over'); });
        dz.addEventListener('dragleave', () => dz.classList.remove('drag-over'));
        dz.addEventListener('drop', e => {
            e.preventDefault(); dz.classList.remove('drag-over');
            if (e.dataTransfer.files[0]) this._handleFile(e.dataTransfer.files[0]);
        });
        document.getElementById('image-input')?.addEventListener('change', e => { if (e.target.files[0]) this._handleFile(e.target.files[0]); });
    },

    _handleFile(file) {
        this.currentFile = file;
        this.currentType = file.type.startsWith('image/') ? 'image' : 'file';
        const area = document.getElementById('media-preview-area');
        if (area) area.style.display = 'block';
        ToastService.show(`تم اختيار: ${file.name}`, 'info');
    },

    _updatePreview() {
        const title = document.getElementById('post-title')?.value || 'عنوان المنشور';
        const body = document.getElementById('post-content-editor')?.innerHTML || '';
        const pt = document.getElementById('preview-title');
        const pb = document.getElementById('preview-body');
        if (pt) pt.textContent = title;
        if (pb) pb.innerHTML = body || 'محتوى المنشور سيظهر هنا...';
    },

    _initTemplates() {
        document.querySelectorAll('.design-option').forEach(opt => {
            opt.addEventListener('click', () => {
                document.querySelectorAll('.design-option').forEach(el => el.classList.remove('active'));
                opt.classList.add('active');
                const style = opt.dataset.style;
                const si = document.getElementById('post-style');
                if (si) si.value = style;
                const prev = document.getElementById('post-live-preview');
                if (prev) prev.className = `post-card ${style} preview-card`;
            });
        });
    }
};

/* ─────────────────────────────────────────────────────────────
   6. Other Services (Theme, Sidebar, Draft, etc.)
   ───────────────────────────────────────────────────────────── */
const ThemeService = {
    init() {
        const saved = localStorage.getItem('bawabatyTheme');
        document.documentElement.setAttribute('data-theme', saved || 'dark');
        document.getElementById('theme-toggle-btn')?.addEventListener('click', () => {
            const cur = document.documentElement.getAttribute('data-theme');
            const next = cur === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', next);
            localStorage.setItem('bawabatyTheme', next);
        });
    }
};

const SidebarService = {
    init() {
        const sidebar = document.getElementById('sidebar'), ham = document.getElementById('hamburger-btn'), overlay = document.getElementById('sidebar-overlay');
        if (!ham) return;
        const open = () => { sidebar?.classList.add('is-open'); overlay?.classList.add('active'); ham.classList.add('is-open'); };
        const close = () => { sidebar?.classList.remove('is-open'); overlay?.classList.remove('active'); ham.classList.remove('is-open'); };
        ham.addEventListener('click', () => sidebar?.classList.contains('is-open') ? close() : open());
        overlay?.addEventListener('click', close);
        document.getElementById('sidebar-close-btn')?.addEventListener('click', close);
    }
};

const DraftService = {
    discard() { localStorage.removeItem('bawabatyDraft'); }
};

const DateTimePickerService = {
    init() {
        document.querySelectorAll('.pub-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.pub-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                const isPub = tab.dataset.pub === 'now';
                const p = document.getElementById('schedule-picker');
                if (p) p.style.display = isPub ? 'none' : 'block';
                const hidden = document.getElementById('publish-type-select');
                if (hidden) hidden.value = tab.dataset.pub;
            });
        });
    }
};

/* ─────────────────────────────────────────────────────────────
   GLOBAL HELPERS
   ───────────────────────────────────────────────────────────── */
window.DataService = DataService;
window.AuthService = AuthService;

function openAuth() { document.getElementById('auth-modal')?.classList.add('active'); }
function closeAuth() { document.getElementById('auth-modal')?.classList.remove('active'); }

/* ─────────────────────────────────────────────────────────────
   BOOTSTRAP
   ───────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
    ThemeService.init();
    SidebarService.init();
    EditorService.init();
    DateTimePickerService.init();
    AuthService.init();

    // Nav Links
    document.querySelectorAll('.nav-links a').forEach(link => {
        link.addEventListener('click', e => {
            e.preventDefault();
            document.querySelectorAll('.nav-links a').forEach(a => a.classList.remove('active'));
            link.classList.add('active');
            const mode = link.id === 'nav-scheduled' ? 'scheduled' : (link.id === 'nav-drafts' ? 'drafts' : 'feed');
            DataService.viewMode = mode;
            DataService.renderFeed(Array.from(DataService.postsMap.values()));
        });
    });

    // Upload Post
    document.getElementById('open-upload-modal')?.addEventListener('click', () => document.getElementById('upload-modal')?.classList.remove('hidden'));
    document.getElementById('close-modal')?.addEventListener('click', () => document.getElementById('upload-modal')?.classList.add('hidden'));
    document.getElementById('upload-form')?.addEventListener('submit', e => {
        e.preventDefault();
        const isSched = document.getElementById('publish-type-select')?.value === 'schedule';
        DataService.createPost({
            title: document.getElementById('post-title')?.value,
            content: document.getElementById('post-content-editor')?.innerHTML,
            type: EditorService.currentType,
            visibility: document.getElementById('post-private')?.checked ? 'private' : 'public',
            style: document.getElementById('post-style')?.value || 'classic',
            userId: AuthService.currentUser.uid,
            userEmail: AuthService.currentUser.email,
            scheduleTime: isSched ? document.getElementById('schedule-input')?.value : null,
        }, EditorService.currentFile);
    });

    // Logout
    document.getElementById('logout-btn')?.addEventListener('click', () => AuthService.logout());

    // Auth Trigger
    document.getElementById('guest-login-btn')?.addEventListener('click', openAuth);
});

/* ─────────────────────────────────────────────────────────────
   🔐 AUTH UI ENGINE (Modern & Clean)
   ───────────────────────────────────────────────────────────── */
const AuthUI = {
    init() {
        // Close Button
        document.getElementById('auth-close-btn')?.addEventListener('click', closeAuth);

        // Login Submit
        document.getElementById('login-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!this.validateLogin()) return;

            const email = document.getElementById('login-email').value;
            const pass = document.getElementById('login-password').value;

            try {
                await AuthService.login(email, pass);
            } catch (err) {
                this.showMsg('msg-login-password', 'بيانات الدخول غير صحيحة', 'error');
            }
        });

        // Signup Submit
        document.getElementById('signup-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!this.validateSignup()) return;

            const email = document.getElementById('signup-email').value;
            const pass = document.getElementById('signup-password').value;

            try {
                await AuthService.signUp({ email, password: pass, firstName: 'User', lastName: '' });
            } catch (err) {
                this.showMsg('msg-signup-email', err.message, 'error');
            }
        });
    },

    switch(view) {
        // Tabs UI
        document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
        document.getElementById(`tab-${view}`).classList.add('active');

        // Forms UI
        document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
        document.getElementById(`${view}-form`).classList.add('active');

        // Clear Errors
        document.querySelectorAll('.validation-msg').forEach(el => el.textContent = '');
    },

    togglePw(id) {
        const inp = document.getElementById(id);
        inp.type = inp.type === 'password' ? 'text' : 'password';
    },

    validateLogin() {
        const email = document.getElementById('login-email').value;
        const pass = document.getElementById('login-password').value;
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (!emailRegex.test(email)) return this.showMsg('msg-login-email', 'بريد إلكتروني غير صالح', 'error');
        if (pass.length < 1) return this.showMsg('msg-login-password', 'يرجى إدخال كلمة المرور', 'error');
        return true;
    },

    validateSignup() {
        const email = document.getElementById('signup-email').value;
        const pass = document.getElementById('signup-password').value;
        const confirm = document.getElementById('signup-confirm').value;
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (!emailRegex.test(email)) return this.showMsg('msg-signup-email', 'بريد إلكتروني غير صالح', 'error');
        if (pass.length < 8) return this.showMsg('msg-signup-password', 'كلمة المرور يجب أن تكون 8 أحرف على الأقل', 'error');
        if (pass !== confirm) return this.showMsg('msg-signup-confirm', 'كلمات المرور غير متطابقة', 'error');
        return true;
    },

    showMsg(id, text, type) {
        const el = document.getElementById(id);
        el.textContent = text;
        el.className = `validation-msg ${type}`;
        return false;
    },

    // Compatibility with old calls
    showView(v) { this.switch(v === 'signup' ? 'signup' : 'login'); }
};

document.addEventListener('DOMContentLoaded', () => {
    AuthUI.init();
    window.authV4 = AuthUI; // Backward compatibility
});
