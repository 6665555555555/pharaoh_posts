/**
 * ═══════════════════════════════════════════════════════════════
 *  بوابتي — Main Application Script  v2.1
 *  Stack : Vanilla ES6+ · Firebase Compat v9 · Font Awesome 6
 * ═══════════════════════════════════════════════════════════════
 *
 *  TABLE OF CONTENTS
 *  ─────────────────
 *   1.  CONFIG               — app-wide constants
 *   2.  ToastService         — toast notifications
 *   3.  AuthService          — Firebase auth + UI state
 *   4.  DataService          — Firestore CRUD + real-time feed
 *   5.  EditorService        — RTE, drag-drop, live preview
 *   6.  ThemeService         — dark / light mode
 *   7.  SidebarService       — mobile hamburger
 *   8.  DraftService         — localStorage auto-save
 *   9.  DateTimePickerService— publish-time tabs
 *  10.  FormValidationService — real-time form validation
 *  11.  Global helpers        — toggleAuthView, switchAuthTab …
 *  12.  Bootstrap             — DOMContentLoaded init
 * ═══════════════════════════════════════════════════════════════
 *
 *  FIX LOG (v2.1)
 *  ──────────────
 *  • All DOM access moved inside DOMContentLoaded — no more
 *    "getElementById returns null" errors on parse.
 *  • Removed duplicate submit-listener registrations that were
 *    causing forms to fire twice.
 *  • Removed dead reference to non-existent #idea-btn element.
 *  • FormValidationService._interceptForms() removed — validation
 *    is now part of the single authoritative submit handler.
 *  • Fixed SidebarService: ESC key listener no longer conflicts
 *    with modal ESC handler.
 *  • Added null-guards on every getElementById call.
 * ═══════════════════════════════════════════════════════════════
 */

/* ─────────────────────────────────────────────────────────────
   1. CONFIG
   ───────────────────────────────────────────────────────────── */
const CONFIG = {
    collections: { posts: 'posts', users: 'users' },
    maxUploadSize: 50 * 1024 * 1024,   // 50 MB
};

/* ─────────────────────────────────────────────────────────────
   2. ToastService
   ───────────────────────────────────────────────────────────── */
const ToastService = {
    /**
     * @param {string} message
     * @param {'info'|'success'|'error'|'warning'} type
     * @param {number} [ttl=5000]
     */
    show(message, type = 'info', ttl = 5000) {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const iconMap = {
            success: '<i class="fa-solid fa-circle-check"         style="color:#4ade80"></i>',
            error: '<i class="fa-solid fa-circle-xmark"         style="color:#ef4444"></i>',
            warning: '<i class="fa-solid fa-triangle-exclamation"  style="color:#fbbf24"></i>',
            info: '<i class="fa-solid fa-bell"                  style="color:#38bdf8"></i>',
        };

        const toast = document.createElement('div');
        toast.className = 'toast';
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
   3. AuthService
   ───────────────────────────────────────────────────────────── */
const AuthService = {
    currentUser: null,
    isGuest: false,
    confirmationResult: null,

    /** Arabic-localised Firebase error messages */
    _errMap: {
        'auth/email-already-in-use': 'هذا البريد مسجّل مسبقاً.',
        'auth/user-not-found': 'الحساب غير موجود.',
        'auth/wrong-password': 'كلمة المرور غير صحيحة.',
        'auth/invalid-credential': 'بيانات الدخول غير صحيحة.',
        'auth/weak-password': 'كلمة المرور ضعيفة جداً (6 أحرف على الأقل).',
        'auth/invalid-email': 'صيغة البريد الإلكتروني غير صحيحة.',
        'auth/too-many-requests': 'تجاوزت عدد المحاولات، حاول لاحقاً.',
        'auth/invalid-phone-number': 'رقم الهاتف غير صالح.',
        'auth/missing-phone-number': 'يرجى إدخال رقم الهاتف.',
    },

    init() {
        /* Bail out if Firebase placeholder config is still in place */
        if (typeof firebaseConfig !== 'undefined' &&
            String(firebaseConfig.apiKey).includes('YOUR_API_KEY')) {
            alert('⚠️ يرجى تحديث firebase-config.js ببيانات مشروعك.');
            return;
        }

        /* Invisible reCAPTCHA (required for Phone Auth) */
        try {
            window.recaptchaVerifier = new firebase.auth.RecaptchaVerifier(
                'recaptcha-container', { size: 'invisible' }
            );
        } catch (e) { console.warn('reCAPTCHA init:', e); }

        /* Auth state observer */
        firebase.auth().onAuthStateChanged(async user => {
            if (user) {
                this.currentUser = user;
                this.isGuest = false;

                /* Fetch extended profile from Firestore */
                try {
                    const snap = await firebase.firestore()
                        .collection(CONFIG.collections.users)
                        .doc(user.uid).get();
                    if (snap.exists) this.currentUser.profile = snap.data();
                } catch (err) { console.warn('Profile fetch:', err); }

                this._updateUI(user);

            } else if (!this.isGuest) {
                this.currentUser = null;
                this._updateUI(null);
            }
        });
    },

    /* ── UI state ─────────────────────────────────────────── */
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
        }
    },

    /* ── Guest ────────────────────────────────────────────── */
    guestLogin() {
        this.isGuest = true;
        this._updateUI(null);
        ToastService.show('أهلاً! أنت تتصفح كزائر.', 'info');
    },

    /* ── Email login ──────────────────────────────────────── */
    async login(email, password) {
        const loadingEl = document.getElementById('loading-overlay');
        const errEl = document.getElementById('auth-error');
        if (loadingEl) loadingEl.style.display = 'flex';
        if (errEl) errEl.textContent = '';
        try {
            await firebase.auth().signInWithEmailAndPassword(email, password);
            ToastService.show('تم تسجيل الدخول بنجاح ✅', 'success');
        } catch (err) {
            this._handleErr(err, errEl);
        } finally {
            if (loadingEl) loadingEl.style.display = 'none';
        }
    },

    /* ── Signup ───────────────────────────────────────────── */
    async signup() {
        const first = document.getElementById('signup-firstname')?.value.trim();
        const last = document.getElementById('signup-lastname')?.value.trim();
        const email = document.getElementById('signup-email')?.value.trim();
        const pass = document.getElementById('signup-password')?.value;
        const confirm = document.getElementById('signup-confirm-password')?.value;
        const errEl = document.getElementById('auth-error');

        /* Client-side checks */
        if (!first || !last)
            return this._handleErr({ message: 'يرجى إدخال الاسم الأول والأخير.' }, errEl);
        if (!email)
            return this._handleErr({ message: 'يرجى إدخال البريد الإلكتروني.' }, errEl);
        if (!pass || pass.length < 6)
            return this._handleErr({ message: 'كلمة المرور 6 أحرف على الأقل.' }, errEl);
        if (pass !== confirm)
            return this._handleErr({ message: 'كلمتا المرور غير متطابقتين.' }, errEl);

        const loadingEl = document.getElementById('loading-overlay');
        if (loadingEl) loadingEl.style.display = 'flex';
        try {
            const cred = await firebase.auth()
                .createUserWithEmailAndPassword(email, pass);

            await firebase.firestore()
                .collection(CONFIG.collections.users)
                .doc(cred.user.uid).set({
                    firstName: first,
                    lastName: last,
                    email: cred.user.email,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                });

            ToastService.show('تم إنشاء الحساب بنجاح 🎉', 'success');
        } catch (err) {
            this._handleErr(err, errEl);
        } finally {
            if (loadingEl) loadingEl.style.display = 'none';
        }
    },

    /* ── Phone: send OTP ──────────────────────────────────── */
    async signInWithPhone() {
        const phone = document.getElementById('auth-phone')?.value.trim();
        const errEl = document.getElementById('auth-error');
        if (!phone || phone.length < 9)
            return this._handleErr({ message: 'يرجى إدخال رقم هاتف صحيح.' }, errEl);

        const loadingEl = document.getElementById('loading-overlay');
        if (loadingEl) loadingEl.style.display = 'flex';
        try {
            this.confirmationResult = await firebase.auth()
                .signInWithPhoneNumber(phone, window.recaptchaVerifier);

            document.getElementById('phone-step-1').style.display = 'none';
            document.getElementById('phone-step-2').style.display = 'block';
            ToastService.show('تم إرسال رمز التحقق 📱', 'success');
        } catch (err) {
            this._handleErr(err, errEl);
            /* Reset reCAPTCHA on failure */
            window.recaptchaVerifier?.render()
                .then(id => window.grecaptcha?.reset(id)).catch(() => { });
        } finally {
            if (loadingEl) loadingEl.style.display = 'none';
        }
    },

    /* ── Phone: verify OTP ────────────────────────────────── */
    async verifyOTP() {
        const code = document.getElementById('auth-otp')?.value.trim();
        const errEl = document.getElementById('auth-error');
        if (!code || code.length < 6)
            return this._handleErr({ message: 'أدخل رمز التحقق المكوّن من 6 أرقام.' }, errEl);

        const loadingEl = document.getElementById('loading-overlay');
        if (loadingEl) loadingEl.style.display = 'flex';
        try {
            await this.confirmationResult.confirm(code);
            ToastService.show('تم تسجيل الدخول بنجاح ✅', 'success');
        } catch (err) {
            this._handleErr({ message: 'رمز التحقق غير صحيح أو منتهي الصلاحية.' }, errEl);
        } finally {
            if (loadingEl) loadingEl.style.display = 'none';
        }
    },

    /* ── Logout ───────────────────────────────────────────── */
    async logout() {
        try {
            this.isGuest = false;
            await firebase.auth().signOut();
            ToastService.show('تم تسجيل الخروج.', 'info');
        } catch (err) {
            ToastService.show('خطأ أثناء تسجيل الخروج.', 'error');
        }
    },

    /* ── Error handler ────────────────────────────────────── */
    _handleErr(err, errEl) {
        const msg = this._errMap[err?.code] || err?.message || 'حدث خطأ غير متوقع.';
        if (errEl) errEl.textContent = msg;
        ToastService.show(msg, 'error');
        console.warn('[AuthService]', err);
    },
};

/*
 * Expose AuthService on window so inline onclick handlers in HTML can call:
 *   onclick="AuthService.guestLogin()"
 *   onclick="AuthService.signInWithPhone()"
 *   onclick="AuthService.verifyOTP()"
 */
window.AuthService = AuthService;

/* ─────────────────────────────────────────────────────────────
   4. DataService
   ───────────────────────────────────────────────────────────── */
const DataService = {
    viewMode: 'feed',    // 'feed' | 'scheduled' | 'drafts'
    postsMap: new Map(),
    _schedulerTimer: null,

    /* ── Create / save a post ─────────────────────────────── */
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

            /* Upload file if provided */
            if (file) {
                if (file.size > CONFIG.maxUploadSize)
                    throw new Error('حجم الملف أكبر من 50 MB.');

                const path = `uploads/${AuthService.currentUser.uid}/${now}_${file.name}`;
                const ref = firebase.storage().ref().child(path);
                await ref.put(file);
                postData.fileUrl = await ref.getDownloadURL();
                postData.fileName = file.name;
            }

            /* Collect checked social platforms */
            const platforms = Array.from(
                document.querySelectorAll('input[name="social_platform"]:checked')
            ).map(cb => cb.value);

            await firebase.firestore()
                .collection(CONFIG.collections.posts)
                .add({
                    ...postData,
                    platforms,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    date: postData.date || firebase.firestore.FieldValue.serverTimestamp(),
                });

            /* Reset the modal */
            document.getElementById('upload-modal')?.classList.add('hidden');
            document.getElementById('upload-form')?.reset();
            const editor = document.getElementById('post-content-editor');
            if (editor) editor.innerHTML = '';
            const previewArea = document.getElementById('media-preview-area');
            if (previewArea) previewArea.style.display = 'none';
            const mediaContent = document.getElementById('media-content');
            if (mediaContent) mediaContent.innerHTML = '';
            EditorService.currentFile = null;
            EditorService.currentType = 'article';

            /* Clear draft from localStorage on publish */
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

    /* ── Real-time feed ───────────────────────────────────── */
    subscribeToFeed() {
        firebase.firestore()
            .collection(CONFIG.collections.posts)
            .orderBy('date', 'desc')
            .limit(50)
            .onSnapshot(
                snap => this._onSnapshot(snap),
                err => console.error('[Feed]', err)
            );
    },

    _onSnapshot(snap) {
        snap.docChanges().forEach(ch => {
            if (ch.type === 'removed') this.postsMap.delete(ch.doc.id);
            else this.postsMap.set(ch.doc.id, { id: ch.doc.id, ...ch.doc.data() });
        });
        this.renderFeed(Array.from(this.postsMap.values()));
    },

    /* ── Render feed ──────────────────────────────────────── */
    renderFeed(posts) {
        const feed = document.getElementById('feed-container');
        if (!feed) return;

        const uid = AuthService.currentUser?.uid;

        const filtered = posts.filter(p => {
            const mine = p.userId === uid;
            if (this.viewMode === 'scheduled') return p.status === 'scheduled' && mine;
            if (this.viewMode === 'drafts') return p.status === 'draft' && mine;
            if (p.status === 'draft' || p.status === 'scheduled') return false;
            return p.visibility === 'public' || (p.visibility === 'private' && mine);
        });

        filtered.sort((a, b) => {
            const ms = p => (p.date?.seconds ? p.date.seconds * 1000 : 0);
            return ms(b) - ms(a);
        });

        feed.innerHTML = filtered.length
            ? filtered.map(p => this._cardHTML(p)).join('')
            : '<p style="text-align:center;opacity:.5;padding:2rem;">لا توجد منشورات بعد ✨</p>';
    },

    /* ── Card HTML ────────────────────────────────────────── */
    _cardHTML(post) {
        const uid = AuthService.currentUser?.uid;
        const mine = post.userId === uid;
        const dateStr = post.date?.seconds
            ? new Date(post.date.seconds * 1000).toLocaleDateString('ar-EG')
            : 'الآن';

        const draftBadge = post.status === 'draft'
            ? '<span class="scheduled-badge" style="background:rgba(255,255,255,.1)">مسودة</span>' : '';
        const schedBadge = post.status === 'scheduled'
            ? '<span class="scheduled-badge"><i class="fa-regular fa-clock"></i> مجدول</span>' : '';

        let body = '';
        if (post.type === 'image')
            body = `<div class="post-image"><img src="${post.fileUrl}" alt="${post.title}" loading="lazy"></div>`;
        else if (post.type === 'file')
            body = `<div class="post-file"><i class="fa-solid fa-file"></i>
                    <a href="${post.fileUrl}" target="_blank" rel="noopener noreferrer">${post.fileName}</a></div>`;
        else
            body = `<p class="post-text">${post.content || ''}</p>`;

        const deleteBtn = mine
            ? `<button class="delete-btn" onclick="DataService.deletePost('${post.id}')" aria-label="حذف">
                 <i class="fa-solid fa-trash"></i></button>` : '';
        const publishBtn = (post.status === 'draft' && mine)
            ? `<button class="delete-btn" style="color:var(--accent-glow)"
                 onclick="DataService.publishDraft('${post.id}')" aria-label="نشر المسودة">
                 <i class="fa-solid fa-upload"></i></button>` : '';

        return `
        <article class="post-card ${post.style || 'classic'}" aria-label="${post.title}">
            <div class="post-header">
                <div>${draftBadge}${schedBadge}<b>${post.title}</b></div>
                <div class="meta">${dateStr}</div>
            </div>
            ${body}
            <div class="post-footer">
                <span class="user-badge">
                    <i class="fa-solid fa-user"></i>
                    ${(post.userEmail || '').split('@')[0] || 'مستخدم'}
                </span>
                <div class="actions">${publishBtn}${deleteBtn}</div>
            </div>
        </article>`;
    },

    /* ── Delete ───────────────────────────────────────────── */
    async deletePost(id) {
        if (!confirm('هل تريد حذف هذا المنشور نهائياً؟')) return;
        try {
            await firebase.firestore()
                .collection(CONFIG.collections.posts).doc(id).delete();
        } catch (err) { ToastService.show('خطأ أثناء الحذف.', 'error'); }
    },

    /* ── Publish draft ────────────────────────────────────── */
    async publishDraft(id) {
        try {
            await firebase.firestore()
                .collection(CONFIG.collections.posts).doc(id).update({
                    status: 'published',
                    date: firebase.firestore.FieldValue.serverTimestamp(),
                });
            ToastService.show('تم نشر المسودة 🎉', 'success');
        } catch (err) { ToastService.show('خطأ أثناء النشر.', 'error'); }
    },

    /* ── Auto-scheduler ───────────────────────────────────── */
    initScheduler() {
        if (this._schedulerTimer) return;   // prevent duplicate intervals
        this._schedulerTimer = setInterval(() => this._checkScheduled(), 60_000);
    },

    _checkScheduled() {
        if (!AuthService.currentUser) return;
        const now = Date.now();
        this.postsMap.forEach((post, id) => {
            if (post.status !== 'scheduled') return;
            if (post.userId !== AuthService.currentUser.uid) return;
            const due = post.scheduledTime || (post.date?.seconds * 1000);
            if (due && due <= now) {
                this._setStatus(id, 'published');
                ToastService.show(`تم نشر "${post.title}" المجدول تلقائياً 🎉`, 'success');
            }
        });
    },

    async _setStatus(id, status) {
        try {
            await firebase.firestore()
                .collection(CONFIG.collections.posts).doc(id).update({
                    status,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                });
        } catch (err) { console.error(err); }
    },
};

/*
 * Expose DataService on window so inline onclick handlers in generated card HTML
 * can call: onclick="DataService.deletePost('id')"
 *            onclick="DataService.publishDraft('id')"
 */
window.DataService = DataService;

/* ─────────────────────────────────────────────────────────────
   5. EditorService
   ───────────────────────────────────────────────────────────── */
const EditorService = {
    currentFile: null,
    currentType: 'article',

    init() {
        this._initRTE();
        this._initDragDrop();
        this._initLivePreview();
        this._initTemplates();
        this._initClearMedia();
        this._initAdvancedToggle();
    },

    /* ── RTE toolbar ──────────────────────────────────────── */
    _initRTE() {
        const toolbar = document.querySelector('.rte-toolbar');
        const editor = document.getElementById('post-content-editor');
        const hiddenTA = document.getElementById('post-content');
        if (!toolbar || !editor) return;

        toolbar.querySelectorAll('[data-cmd]').forEach(btn => {
            btn.addEventListener('click', () => {
                document.execCommand(btn.dataset.cmd, false, null);
                editor.focus();
                if (hiddenTA) hiddenTA.value = editor.innerHTML;
            });
        });

        document.getElementById('rte-link-btn')?.addEventListener('click', () => {
            const url = prompt('أدخل رابط URL:');
            if (url) document.execCommand('createLink', false, url);
            editor.focus();
        });

        editor.addEventListener('input', () => {
            if (hiddenTA) hiddenTA.value = editor.innerHTML;
            this._updatePreview();
        });
    },

    /* ── Drag & drop ──────────────────────────────────────── */
    _initDragDrop() {
        const dz = document.getElementById('drop-zone');
        if (!dz) return;

        dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('drag-over'); });
        dz.addEventListener('dragleave', () => dz.classList.remove('drag-over'));
        dz.addEventListener('drop', e => {
            e.preventDefault();
            dz.classList.remove('drag-over');
            const file = e.dataTransfer.files[0];
            if (file) this._handleFile(file);
        });

        document.getElementById('image-input')?.addEventListener('change', e => {
            if (e.target.files[0]) this._handleFile(e.target.files[0]);
        });
        document.getElementById('file-input')?.addEventListener('change', e => {
            if (e.target.files[0]) this._handleFile(e.target.files[0]);
        });
    },

    _handleFile(file) {
        this.currentFile = file;
        this.currentType = file.type.startsWith('image/') ? 'image' : 'file';

        const area = document.getElementById('media-preview-area');
        const content = document.getElementById('media-content');
        if (area) area.style.display = 'block';
        if (content) content.innerHTML = '';

        if (this.currentType === 'image') {
            const reader = new FileReader();
            reader.onload = ev => {
                if (content) {
                    const img = document.createElement('img');
                    img.src = ev.target.result;
                    img.style.cssText = 'max-width:100%;border-radius:10px;';
                    content.appendChild(img);
                }
                const pm = document.getElementById('preview-media');
                if (pm) {
                    pm.style.display = 'block';
                    pm.innerHTML = `<img src="${ev.target.result}"
                        style="width:100%;border-radius:8px;object-fit:cover;max-height:180px;">`;
                }
            };
            reader.readAsDataURL(file);
        } else {
            if (content) content.innerHTML =
                `<div style="background:rgba(255,255,255,.1);padding:10px;border-radius:8px;">
                    <i class="fa-solid fa-paperclip"></i> ${file.name}
                 </div>`;
        }
    },

    /* ── Clear media ──────────────────────────────────────── */
    _initClearMedia() {
        document.getElementById('clear-media')?.addEventListener('click', () => {
            this.currentFile = null;
            this.currentType = 'article';
            const area = document.getElementById('media-preview-area');
            const content = document.getElementById('media-content');
            const pm = document.getElementById('preview-media');
            if (area) area.style.display = 'none';
            if (content) content.innerHTML = '';
            if (pm) { pm.style.display = 'none'; pm.innerHTML = ''; }
            const ii = document.getElementById('image-input');
            const fi = document.getElementById('file-input');
            if (ii) ii.value = '';
            if (fi) fi.value = '';
        });
    },

    /* ── Live preview ─────────────────────────────────────── */
    _initLivePreview() {
        document.getElementById('post-title')
            ?.addEventListener('input', () => this._updatePreview());
    },

    _updatePreview() {
        const title = document.getElementById('post-title')?.value || 'عنوان المنشور';
        const body = document.getElementById('post-content-editor')?.innerHTML || '';
        const ptEl = document.getElementById('preview-title');
        const pbEl = document.getElementById('preview-body');
        if (ptEl) ptEl.textContent = title;
        if (pbEl) pbEl.innerHTML = body || 'محتوى المنشور سيظهر هنا...';
    },

    /* ── Templates ────────────────────────────────────────── */
    _initTemplates() {
        document.querySelectorAll('.design-option').forEach(opt => {
            opt.addEventListener('click', () => {
                document.querySelectorAll('.design-option').forEach(el => {
                    el.classList.remove('active');
                    el.setAttribute('aria-checked', 'false');
                });
                opt.classList.add('active');
                opt.setAttribute('aria-checked', 'true');

                const style = opt.dataset.style;
                const si = document.getElementById('post-style');
                if (si) si.value = style;

                const preview = document.getElementById('post-live-preview');
                if (preview) preview.className = `post-card ${style} preview-card`;
            });
        });
    },

    /* ── Advanced options toggle ──────────────────────────── */
    _initAdvancedToggle() {
        const btn = document.getElementById('toggle-options-btn');
        const panel = document.getElementById('advanced-options');
        if (!btn || !panel) return;

        btn.addEventListener('click', () => {
            const isOpen = panel.style.display !== 'none';
            panel.style.display = isOpen ? 'none' : 'block';
            btn.setAttribute('aria-expanded', String(!isOpen));
        });
    },
};

/* ─────────────────────────────────────────────────────────────
   6. ThemeService
   ───────────────────────────────────────────────────────────── */
const ThemeService = {
    KEY: 'bawabatyTheme',

    init() {
        const saved = localStorage.getItem(this.KEY);
        const sysDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        this._apply(saved || (sysDark ? 'dark' : 'light'));

        document.getElementById('theme-toggle-btn')
            ?.addEventListener('click', () => {
                const current = document.documentElement.getAttribute('data-theme');
                this._apply(current === 'dark' ? 'light' : 'dark');
            });
    },

    _apply(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem(this.KEY, theme);
    },
};

/* ─────────────────────────────────────────────────────────────
   7. SidebarService
   ───────────────────────────────────────────────────────────── */
const SidebarService = {
    _startX: 0,

    init() {
        const sidebar = document.getElementById('sidebar');
        const hamBtn = document.getElementById('hamburger-btn');
        const closeBtn = document.getElementById('sidebar-close-btn');
        const overlay = document.getElementById('sidebar-overlay');
        if (!hamBtn) return;

        const open = () => {
            sidebar?.classList.add('open');
            overlay?.classList.add('active');
            hamBtn.setAttribute('aria-expanded', 'true');
            document.body.style.overflow = 'hidden';
        };
        const close = () => {
            sidebar?.classList.remove('open');
            overlay?.classList.remove('active');
            hamBtn.setAttribute('aria-expanded', 'false');
            document.body.style.overflow = '';
        };

        hamBtn.addEventListener('click', open);
        closeBtn?.addEventListener('click', close);
        overlay?.addEventListener('click', close);

        /* Close on nav-link tap (mobile) */
        document.querySelectorAll('.nav-links a').forEach(a =>
            a.addEventListener('click', () => { if (window.innerWidth <= 768) close(); })
        );

        /* Swipe-to-close */
        sidebar?.addEventListener('touchstart', e => {
            this._startX = e.touches[0].clientX;
        }, { passive: true });
        sidebar?.addEventListener('touchend', e => {
            /* RTL: swipe right → close */
            if (e.changedTouches[0].clientX - this._startX > 60) close();
        }, { passive: true });
    },
};

/* ─────────────────────────────────────────────────────────────
   8. DraftService
   ───────────────────────────────────────────────────────────── */
const DraftService = {
    KEY: 'bawabatyDraft',
    _timer: null,

    init() {
        /* Manual save button */
        document.getElementById('save-draft-btn')
            ?.addEventListener('click', () => this.save(true));

        /* Auto-save every 3 s while typing */
        const editor = document.getElementById('post-content-editor');
        const title = document.getElementById('post-title');
        const autoSave = () => {
            clearTimeout(this._timer);
            this._timer = setTimeout(() => this.save(false, 'auto'), 3000);
        };
        editor?.addEventListener('input', autoSave);
        title?.addEventListener('input', autoSave);

        /* Show restore banner when modal opens */
        document.getElementById('open-upload-modal')
            ?.addEventListener('click', () => setTimeout(() => this._showBanner(), 250));
    },

    /**
     * @param {boolean} showToast
     * @param {'manual'|'auto'} mode
     */
    save(showToast = true, mode = 'manual') {
        const title = document.getElementById('post-title')?.value || '';
        const editor = document.getElementById('post-content-editor');
        const content = editor ? editor.innerHTML : '';
        const style = document.getElementById('post-style')?.value || 'classic';

        if (!title && !content.trim()) {
            if (showToast) ToastService.show('لا يوجد محتوى للحفظ.', 'warning');
            return;
        }

        localStorage.setItem(this.KEY, JSON.stringify({
            title, content, style, savedAt: new Date().toISOString(),
        }));

        const statusEl = document.getElementById('draft-status');
        const statusTxt = document.getElementById('draft-status-text');

        if (mode === 'auto' && statusEl && statusTxt) {
            statusEl.style.display = 'flex';
            statusTxt.textContent = 'جارٍ الحفظ...';
            setTimeout(() => { statusTxt.textContent = 'تم الحفظ تلقائياً ✓'; }, 800);
        } else if (mode === 'manual') {
            if (statusEl && statusTxt) {
                statusEl.style.display = 'flex';
                statusTxt.textContent = 'تم حفظ المسودة';
            }
            if (showToast) ToastService.show('✅ تم حفظ المسودة', 'success');
        }
    },

    _showBanner() {
        const raw = localStorage.getItem(this.KEY);
        if (!raw) return;

        const draft = JSON.parse(raw);
        const editorCol = document.querySelector('.editor-column');
        if (!editorCol || editorCol.querySelector('.draft-banner')) return;

        const label = new Date(draft.savedAt).toLocaleString('ar-SA', {
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
        });

        const banner = document.createElement('div');
        banner.className = 'draft-banner';
        banner.innerHTML = `
            <span><i class="fa-solid fa-rotate-left"></i> مسودة محفوظة (${label})</span>
            <div class="draft-banner-actions">
                <button class="draft-banner-btn" id="discard-draft-btn">تجاهل</button>
                <button class="draft-banner-btn primary" id="restore-draft-btn">استعادة</button>
            </div>`;
        editorCol.insertBefore(banner, editorCol.firstChild);

        document.getElementById('restore-draft-btn')
            ?.addEventListener('click', () => { this._restore(draft); banner.remove(); });
        document.getElementById('discard-draft-btn')
            ?.addEventListener('click', () => { this.discard(); banner.remove(); });
    },

    _restore(draft) {
        const t = document.getElementById('post-title');
        const e = document.getElementById('post-content-editor');
        if (t) t.value = draft.title;
        if (e) e.innerHTML = draft.content;
        EditorService._updatePreview();
        ToastService.show('✅ تم استعادة المسودة', 'success');
    },

    discard() {
        localStorage.removeItem(this.KEY);
        const s = document.getElementById('draft-status');
        if (s) s.style.display = 'none';
    },
};

/* ─────────────────────────────────────────────────────────────
   9. DateTimePickerService
   ───────────────────────────────────────────────────────────── */
const DateTimePickerService = {
    init() {
        document.querySelectorAll('.pub-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.pub-tab').forEach(t => {
                    t.classList.remove('active');
                    t.setAttribute('aria-selected', 'false');
                });
                tab.classList.add('active');
                tab.setAttribute('aria-selected', 'true');

                const isPub = tab.dataset.pub === 'now';
                const hidden = document.getElementById('publish-type-select');
                const picker = document.getElementById('schedule-picker');
                if (hidden) hidden.value = tab.dataset.pub;
                if (picker) picker.style.display = isPub ? 'none' : 'block';

                if (!isPub) {
                    setTimeout(() =>
                        document.getElementById('schedule-input')?.showPicker?.(), 120);
                }
            });
        });

        const dtInput = document.getElementById('schedule-input');
        const display = document.getElementById('schedule-display');
        if (dtInput && display) {
            display.addEventListener('click', () => dtInput.showPicker?.());
            dtInput.addEventListener('change', () => {
                if (!dtInput.value) { display.textContent = 'اختر تاريخاً ووقتاً'; return; }
                const d = new Date(dtInput.value);
                const label = '📅 ' + d.toLocaleString('ar-SA', {
                    weekday: 'short', month: 'long', day: 'numeric',
                    hour: '2-digit', minute: '2-digit',
                });
                display.textContent = label;
                display.style.color = 'var(--accent-glow)';
                const pd = document.getElementById('preview-date');
                if (pd) pd.textContent = label;
            });
        }
    },
};

/* ─────────────────────────────────────────────────────────────
   10. FormValidationService
   ───────────────────────────────────────────────────────────── */
const FormValidationService = {
    RULES: {
        email: { re: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, msg: 'بريد إلكتروني غير صالح.' },
        phone: { re: /^\+?[0-9]{9,15}$/, msg: 'رقم هاتف غير صالح.' },
    },

    init() {
        this._bindFields();
        this._bindStrength();
        this._bindEyeToggle();
    },

    /* Validate on blur / clear error on input */
    _bindFields() {
        [
            { id: 'auth-email', type: 'email' },
            { id: 'signup-email', type: 'email' },
            { id: 'auth-phone', type: 'phone' },
            { id: 'signup-phone', type: 'phone' },
        ].forEach(({ id, type }) => {
            const el = document.getElementById(id);
            if (!el) return;
            el.addEventListener('blur', () => this._validate(el, type));
            el.addEventListener('input', () => this._clear(el));
        });

        /* Confirm-password match */
        document.getElementById('signup-confirm-password')
            ?.addEventListener('blur', () => {
                const pw = document.getElementById('signup-password')?.value;
                const el = document.getElementById('signup-confirm-password');
                if (!el) return;
                const wrap = el.closest('.input-with-icon') || el.parentElement;
                if (pw && el.value && pw !== el.value)
                    this._invalid(el, 'كلمة المرور غير متطابقة.', wrap);
                else if (pw && el.value && pw === el.value)
                    this._valid(el, wrap);
            });
    },

    _validate(el, type) {
        const val = el.value.trim();
        if (!val) return;
        const wrap = el.closest('.input-with-icon') || el.parentElement;
        const rule = this.RULES[type];
        rule.re.test(val) ? this._valid(el, wrap) : this._invalid(el, rule.msg, wrap);
    },

    _clear(el) {
        const wrap = el.closest('.input-with-icon') || el.parentElement;
        wrap?.classList.remove('valid', 'invalid');
        wrap?.querySelector('.field-error')?.classList.remove('visible');
    },

    _valid(el, wrap) {
        wrap?.classList.replace('invalid', 'valid') || wrap?.classList.add('valid');
        wrap?.querySelector('.field-error')?.classList.remove('visible');
    },

    _invalid(el, msg, wrap) {
        wrap?.classList.replace('valid', 'invalid') || wrap?.classList.add('invalid');
        let err = wrap?.querySelector('.field-error');
        if (!err) {
            err = Object.assign(document.createElement('p'), { className: 'field-error' });
            wrap?.appendChild(err);
        }
        err.textContent = msg;
        err.classList.add('visible');
    },

    /* Password strength meter */
    _bindStrength() {
        const pw = document.getElementById('signup-password');
        if (!pw) return;

        const meter = document.createElement('div');
        meter.className = 'password-strength';
        meter.innerHTML =
            '<div class="strength-bar b1"></div><div class="strength-bar b2"></div>' +
            '<div class="strength-bar b3"></div><div class="strength-bar b4"></div>' +
            '<span class="strength-label"></span>';
        pw.parentElement?.insertAdjacentElement('afterend', meter);

        pw.addEventListener('input', () => {
            const s = this._strength(pw.value);
            const bars = meter.querySelectorAll('.strength-bar');
            const label = meter.querySelector('.strength-label');
            const lv = ['', 'ضعيفة', 'مقبولة', 'جيدة', 'قوية'];
            const cls = ['', 'active-weak', 'active-fair', 'active-good', 'active-strong'];
            bars.forEach((b, i) => {
                b.className = 'strength-bar ' + (i < s ? cls[s] : '');
            });
            label.textContent = pw.value.length ? lv[s] : '';
        });
    },

    _strength(pw) {
        let s = 0;
        if (pw.length >= 6) s++;
        if (pw.length >= 10) s++;
        if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
        if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) s++;
        return Math.min(4, s);
    },

    /* Eye-toggle on every password input */
    _bindEyeToggle() {
        document.querySelectorAll('input[type="password"]').forEach(inp => {
            const wrap = inp.parentElement;
            if (!wrap || wrap.querySelector('.pwd-toggle-btn')) return;
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'pwd-toggle-btn';
            btn.setAttribute('aria-label', 'إظهار/إخفاء كلمة المرور');
            btn.innerHTML = '<i class="fa-regular fa-eye"></i>';
            wrap.appendChild(btn);
            btn.addEventListener('click', () => {
                const show = inp.type === 'password';
                inp.type = show ? 'text' : 'password';
                btn.innerHTML = show
                    ? '<i class="fa-regular fa-eye-slash"></i>'
                    : '<i class="fa-regular fa-eye"></i>';
            });
        });
    },
};

/* ─────────────────────────────────────────────────────────────
   11. Global helpers  (called from inline HTML onclick attrs)
   ───────────────────────────────────────────────────────────── */

/** Toggle between Login and Signup using 3-D card flip */
function toggleAuthView(view) {
    const inner = document.getElementById('auth-card-inner');
    if (!inner) return;

    const goSignup = view === 'signup';
    inner.classList.toggle('flipped', goSignup);

    /* Update ARIA label on the dialog */
    const modal = document.getElementById('auth-modal');
    if (modal) modal.setAttribute('aria-labelledby',
        goSignup ? 'auth-title-signup' : 'auth-title-login');

    /* Clear error boxes */
    document.querySelectorAll('.auth-error-box')
        .forEach(el => el.textContent = '');

    /* After flip completes, focus first visible input */
    setTimeout(() => {
        const face = goSignup
            ? document.querySelector('.auth-card__back  input')
            : document.querySelector('.auth-card__front input:not(.hp-field)');
        face?.focus();
    }, 720);
}

/** Switch between Email and Phone registration in the signup form */
function toggleSignupMethod() {
    const eg = document.getElementById('signup-email-group');
    const pg = document.getElementById('signup-phone-group');
    const tg = document.getElementById('signup-method-toggle');
    if (!eg || !pg) return;
    const useEmail = eg.style.display !== 'none';
    eg.style.display = useEmail ? 'none' : 'flex';
    pg.style.display = useEmail ? 'flex' : 'none';
    if (tg) tg.textContent = useEmail
        ? 'التسجيل بالبريد الإلكتروني بدلاً من الهاتف؟'
        : 'التسجيل برقم الهاتف بدلاً من البريد؟';
}

/** Switch login tab (email ↔ phone) — works with new .auth-tab class */
function switchAuthTab(type) {
    /* Update tab buttons */
    document.querySelectorAll('.auth-tab').forEach(b => {
        const isActive = b.id === `tab-${type}`;
        b.classList.toggle('active', isActive);
        b.setAttribute('aria-selected', String(isActive));
    });

    /* Show matching form */
    document.querySelectorAll('.auth-method-form').forEach(f => {
        f.style.display = 'none';
        f.classList.remove('active');
    });
    const form = document.getElementById(`auth-form-${type}`);
    if (form) {
        form.style.display = 'flex';
        form.style.flexDirection = 'column';
        form.classList.add('active');
    }

    document.querySelectorAll('.auth-error-box').forEach(el => el.textContent = '');
}

/* ─────────────────────────────────────────────────────────────
   12. Bootstrap — everything runs AFTER DOM is ready
   ───────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {

    /* ── Init all services ────────────────────────────────── */
    ThemeService.init();
    SidebarService.init();
    EditorService.init();
    DraftService.init();
    DateTimePickerService.init();
    FormValidationService.init();
    AuthService.init();

    /* ═══════════════════════════════════════════════════════
       AUTH UX — Eye toggle · Spinner · Rate limit · OTP · PW
       ═══════════════════════════════════════════════════════ */

    /* ── Eye (show/hide password) ─────────────────────────── */
    document.querySelectorAll('.auth-eye-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.dataset.target;
            const inp = document.getElementById(id);
            if (!inp) return;
            const show = inp.type === 'password';
            inp.type = show ? 'text' : 'password';
            btn.querySelector('i').className =
                show ? 'fa-regular fa-eye-slash' : 'fa-regular fa-eye';
            btn.setAttribute('aria-pressed', String(show));
        });
    });

    /* ── Button loading spinner helper ────────────────────── */
    function setLoading(btn, state) {
        if (!btn) return;
        btn.classList.toggle('loading', state);
        btn.disabled = state;
    }

    /* ── Client-side rate limiting (5 fails → 30 s lockout) ─ */
    const RATE = { attempts: 0, lockedUntil: 0 };
    const attemptsBar = document.getElementById('login-attempts-bar');

    function checkRateLimit() {
        if (Date.now() < RATE.lockedUntil) {
            const secs = Math.ceil((RATE.lockedUntil - Date.now()) / 1000);
            if (attemptsBar) {
                attemptsBar.style.display = 'flex';
                attemptsBar.innerHTML =
                    `<i class="fa-solid fa-lock"></i> محجوب ${secs}ث — حاول بعد قليل`;
            }
            return false;   // blocked
        }
        return true;
    }

    function recordFailedAttempt() {
        RATE.attempts++;
        const remaining = Math.max(0, 5 - RATE.attempts);
        if (RATE.attempts >= 5) {
            RATE.lockedUntil = Date.now() + 30_000;
            RATE.attempts = 0;
            if (attemptsBar) {
                attemptsBar.style.display = 'flex';
                attemptsBar.innerHTML =
                    '<i class="fa-solid fa-lock"></i> تم التعليق 30 ثانية بسبب كثرة المحاولات';
            }
            // countdown
            const timer = setInterval(() => {
                const secs = Math.ceil((RATE.lockedUntil - Date.now()) / 1000);
                if (secs <= 0) {
                    clearInterval(timer);
                    if (attemptsBar) attemptsBar.style.display = 'none';
                } else if (attemptsBar) {
                    attemptsBar.innerHTML =
                        `<i class="fa-solid fa-lock"></i> محجوب ${secs}ث — حاول بعد قليل`;
                }
            }, 1000);
        } else if (remaining <= 2 && attemptsBar) {
            attemptsBar.style.display = 'flex';
            attemptsBar.innerHTML =
                `<i class="fa-solid fa-triangle-exclamation"></i> تبقى ${remaining} محاولة قبل التعليق`;
        }
    }

    /* ── Email login form with rate limiting + spinner ────── */
    document.getElementById('auth-form-email')
        ?.addEventListener('submit', async e => {
            e.preventDefault();
            if (!checkRateLimit()) return;

            /* Honeypot check */
            if (document.getElementById('hp-field')?.value) return;

            const email = document.getElementById('auth-email')?.value.trim();
            const pass = document.getElementById('auth-password')?.value;
            const errBox = document.querySelector('.auth-card__front .auth-error-box');
            const submitBtn = document.getElementById('email-submit-btn');

            if (!email || !pass) {
                if (errBox) errBox.textContent = 'يرجى ملء جميع الحقول.';
                return;
            }

            setLoading(submitBtn, true);
            try {
                await AuthService.login(email, pass);
                RATE.attempts = 0;   // reset on success
            } catch {
                recordFailedAttempt();
            } finally {
                setLoading(submitBtn, false);
            }
        });

    /* ── Signup form with spinner ─────────────────────────── */
    document.getElementById('signup-form')
        ?.addEventListener('submit', async e => {
            e.preventDefault();

            /* Honeypot check */
            const hp = e.target.querySelector('.hp-field');
            if (hp?.value) return;

            const submitBtn = document.getElementById('signup-submit-btn');
            setLoading(submitBtn, true);
            try {
                await AuthService.signup();
            } finally {
                setLoading(submitBtn, false);
            }
        });

    /* ── Logout ───────────────────────────────────────────── */
    document.getElementById('logout-btn')
        ?.addEventListener('click', () => AuthService.logout());

    /* ── Guest browse button (inside sidebar) ─────────────── */
    document.getElementById('guest-login-btn')
        ?.addEventListener('click', () => {
            document.getElementById('auth-modal')?.classList.add('active');
            toggleAuthView('login');
        });

    /* ── OTP digit auto-advance ───────────────────────────── */
    const otpDigits = document.querySelectorAll('.otp-digit');
    const hiddenOtp = document.getElementById('auth-otp');

    otpDigits.forEach((digit, idx) => {
        digit.addEventListener('input', () => {
            const val = digit.value.replace(/\D/g, '');
            digit.value = val.slice(-1);                // keep 1 digit only

            if (val && idx < otpDigits.length - 1)
                otpDigits[idx + 1].focus();             // jump to next

            digit.classList.toggle('filled', !!digit.value);

            /* Assemble full OTP into hidden input */
            if (hiddenOtp)
                hiddenOtp.value = [...otpDigits].map(d => d.value).join('');
        });

        digit.addEventListener('keydown', e => {
            if (e.key === 'Backspace' && !digit.value && idx > 0)
                otpDigits[idx - 1].focus();             // go back on delete
        });

        /* Allow paste of 6-digit code on first box */
        digit.addEventListener('paste', e => {
            e.preventDefault();
            const pasted = (e.clipboardData.getData('text') || '').replace(/\D/g, '');
            otpDigits.forEach((d, i) => {
                d.value = pasted[i] || '';
                d.classList.toggle('filled', !!d.value);
            });
            if (hiddenOtp) hiddenOtp.value = pasted.slice(0, 6);
            otpDigits[Math.min(pasted.length, 5)].focus();
        });
    });

    /* ── Password requirements live checker ───────────────── */
    const signupPwd = document.getElementById('signup-password');
    const reqItems = document.querySelectorAll('#pw-requirements [data-rule]');

    const PW_RULES = {
        length: pw => pw.length >= 8,
        upper: pw => /[A-Z]/.test(pw),
        number: pw => /[0-9]/.test(pw),
        special: pw => /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>/?]/.test(pw),
    };

    signupPwd?.addEventListener('input', () => {
        const pw = signupPwd.value;
        reqItems.forEach(li => {
            const rule = li.dataset.rule;
            li.classList.toggle('met', !!PW_RULES[rule]?.(pw));
        });
    });

    /* ── Email real-time validation ───────────────────────── */
    document.getElementById('signup-email')?.addEventListener('blur', e => {
        const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.target.value.trim());
        e.target.classList.toggle('valid', valid && !!e.target.value);
        e.target.classList.toggle('invalid', !valid && !!e.target.value);
    });

    document.getElementById('auth-email')?.addEventListener('blur', e => {
        const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.target.value.trim());
        e.target.classList.toggle('valid', valid && !!e.target.value);
        e.target.classList.toggle('invalid', !valid && !!e.target.value);
    });

    /* ── Confirm-password match indicator ─────────────────── */
    document.getElementById('signup-confirm-password')?.addEventListener('input', e => {
        const match = e.target.value === signupPwd?.value;
        e.target.classList.toggle('valid', match && !!e.target.value);
        e.target.classList.toggle('invalid', !match && !!e.target.value);
    });



    /* ── Upload modal: open / close ───────────────────────── */
    document.getElementById('open-upload-modal')
        ?.addEventListener('click', () =>
            document.getElementById('upload-modal')?.classList.remove('hidden'));

    document.getElementById('close-modal')
        ?.addEventListener('click', () =>
            document.getElementById('upload-modal')?.classList.add('hidden'));

    /* Close upload modal on Escape (only if sidebar isn't open) */
    document.addEventListener('keydown', e => {
        if (e.key !== 'Escape') return;
        const modal = document.getElementById('upload-modal');
        if (modal && !modal.classList.contains('hidden'))
            modal.classList.add('hidden');
    });

    /* ── Upload form: publish ─────────────────────────────── */
    document.getElementById('upload-form')
        ?.addEventListener('submit', e => {
            e.preventDefault();
            if (!AuthService.currentUser) {
                ToastService.show('يجب تسجيل الدخول أولاً.', 'warning');
                return;
            }
            const isScheduled =
                document.getElementById('publish-type-select')?.value === 'schedule';

            DataService.createPost({
                title: document.getElementById('post-title')?.value,
                content: document.getElementById('post-content')?.value,
                type: EditorService.currentType,
                visibility: document.getElementById('post-private')?.checked ? 'private' : 'public',
                style: document.getElementById('post-style')?.value || 'classic',
                userId: AuthService.currentUser.uid,
                userEmail: AuthService.currentUser.email,
                scheduleTime: isScheduled
                    ? document.getElementById('schedule-input')?.value
                    : null,
            }, EditorService.currentFile, false);
        });

    /* ── Nav links: animated section transitions ──────────── */
    const feed = document.getElementById('feed-container');

    function transitionFeed(callback) {
        if (!feed) { callback(); return; }
        feed.classList.add('page-exit');
        setTimeout(() => {
            callback();
            feed.classList.remove('page-exit');
            feed.classList.add('page-enter');
            setTimeout(() => feed.classList.remove('page-enter'), 400);
        }, 280);
    }

    function setActiveNav(el) {
        document.querySelectorAll('.nav-links a')
            .forEach(a => { a.classList.remove('active'); a.removeAttribute('aria-current'); });
        if (el) { el.classList.add('active'); el.setAttribute('aria-current', 'page'); }
    }

    function setViewLabel(icon, label) {
        document.querySelector('.view-label')?.remove();
        if (!label || !feed) return;
        const el = document.createElement('div');
        el.className = 'view-label';
        el.innerHTML = `<i class="${icon}"></i> ${label}`;
        feed.parentNode?.insertBefore(el, feed);
    }

    document.querySelectorAll('.nav-links a').forEach(link => {
        link.addEventListener('click', e => {
            e.preventDefault();
            setActiveNav(link);

            const id = link.id || '';
            const hasIcon = cls => !!link.querySelector(`.${cls}`);

            if (id === 'nav-scheduled') {
                transitionFeed(() => {
                    DataService.viewMode = 'scheduled';
                    DataService.renderFeed(Array.from(DataService.postsMap.values()));
                    setViewLabel('fa-regular fa-calendar-check', 'المجدولة');
                });
            } else if (hasIcon('fa-compass')) {
                transitionFeed(() => {
                    DataService.viewMode = 'feed';
                    DataService.renderFeed(Array.from(DataService.postsMap.values()));
                    setViewLabel('fa-solid fa-compass', 'استكشاف');
                });
            } else if (hasIcon('fa-bookmark')) {
                transitionFeed(() => {
                    DataService.viewMode = 'saved';
                    DataService.renderFeed(Array.from(DataService.postsMap.values()));
                    setViewLabel('fa-solid fa-bookmark', 'المحفوظات');
                });
            } else {
                transitionFeed(() => {
                    DataService.viewMode = 'feed';
                    DataService.renderFeed(Array.from(DataService.postsMap.values()));
                    setViewLabel('', '');
                });
            }
        });
    });

    /* ── Ripple effect on all primary / secondary buttons ─── */
    function addRipple(btn) {
        if (btn._rippleAdded) return;
        btn._rippleAdded = true;
        btn.classList.add('ripple-btn');
        btn.addEventListener('click', ev => {
            const r = document.createElement('span');
            r.className = 'ripple';
            const rect = btn.getBoundingClientRect();
            const size = Math.max(rect.width, rect.height);
            r.style.cssText = `
                width:${size}px; height:${size}px;
                left:${ev.clientX - rect.left - size / 2}px;
                top :${ev.clientY - rect.top - size / 2}px;`;
            btn.appendChild(r);
            setTimeout(() => r.remove(), 600);
        });
    }

    document.querySelectorAll('.btn-primary, .btn-secondary, .action-chip')
        .forEach(addRipple);

}); // end DOMContentLoaded
