// --- Configuration & Helpers ---
const CONFIG = {
    demoStorageKey: 'portal_demo_posts',
    isDemo: false // Will be set automatically on auth failure
};

// DOM Elements
const ui = {
    modal: document.getElementById('upload-modal'),
    authModal: document.getElementById('auth-modal'),
    views: {
        feed: document.getElementById('feed-container'),
        userProfile: document.getElementById('user-profile'),
        userEmail: document.getElementById('user-email'),
        loading: document.getElementById('loading-overlay'),
        authError: document.getElementById('auth-error')
    },
    forms: {
        upload: document.getElementById('upload-form'),
        auth: document.getElementById('auth-form')
    },
    inputs: {
        title: document.getElementById('post-title'),
        content: document.getElementById('post-content'),
        private: document.getElementById('post-private'),
        authEmail: document.getElementById('auth-email'),
        authPass: document.getElementById('auth-password'),
        // New Inputs
        ideaBtn: document.getElementById('idea-btn'),
        styleOptions: document.querySelectorAll('.design-option'),
        styleInput: document.getElementById('post-style'),
        scheduleInput: document.getElementById('schedule-input'),
        navScheduled: document.getElementById('nav-scheduled'),
        socialCheckboxes: document.querySelectorAll('input[name="social_platform"]')
    }
};

// --- Toast Notification Service ---
const ToastService = {
    show(message, type = 'info', icon = 'fa-solid fa-bell') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = 'toast';

        let iconHtml = `<i class="${icon}"></i>`;
        if (type === 'success') iconHtml = `<i class="fa-solid fa-circle-check" style="color: #4ade80;"></i>`;
        if (type === 'error') iconHtml = `<i class="fa-solid fa-circle-exclamation" style="color: #ef4444;"></i>`;
        if (type === 'social') iconHtml = `<i class="${icon}" style="color: #38bdf8;"></i>`;

        toast.innerHTML = `
            ${iconHtml}
            <div>
                <h4 style="margin:0; font-size: 0.95rem; font-weight: bold;">إشعار جديد</h4>
                <p style="margin:5px 0 0; font-size: 0.85rem; opacity: 0.9;">${message}</p>
            </div>
        `;

        container.appendChild(toast);

        // Remove after 5 seconds
        setTimeout(() => {
            toast.remove();
        }, 5000);
    }
};

// --- Service Layer (Abstracts Firebase/Demo Logic) ---

const AuthService = {
    currentUser: null,

    init() {
        firebase.auth().onAuthStateChanged(user => {
            this.currentUser = user;
            this.updateUI(user);
        });
    },

    updateUI(user) {
        ui.views.loading.style.display = 'none';
        if (user) {
            ui.authModal.classList.remove('active');
            ui.views.userProfile.style.display = 'flex';
            ui.views.userEmail.textContent = user.email + (user.isAnonymous ? ' (Demo)' : '');
            DataService.subscribeToFeed();
            // Start the scheduler check
            DataService.initScheduler();
        } else {
            ui.authModal.classList.add('active');
            ui.views.userProfile.style.display = 'none';
            ui.views.feed.innerHTML = '';
        }
    },

    async login(email, password, isLogin) {
        ui.views.loading.style.display = 'flex';
        ui.views.authError.style.display = 'none';

        try {
            if (isLogin) await firebase.auth().signInWithEmailAndPassword(email, password);
            else await firebase.auth().createUserWithEmailAndPassword(email, password);
        } catch (error) {
            this.handleAuthError(error, email);
        }
    },

    async logout() {
        if (CONFIG.isDemo) {
            this.currentUser = null;
            this.updateUI(null);
            location.reload();
        } else {
            await firebase.auth().signOut();
        }
    },

    handleAuthError(error, email) {
        if (['auth/invalid-api-key', 'auth/internal-error'].includes(error.code) || error.message.includes('api-key')) {
            alert("تنبيه: دخول في وضع التجربة (Demo Mode) لعدم توفر مفاتيح Firebase.");
            CONFIG.isDemo = true;
            this.currentUser = { uid: 'demo-' + Date.now(), email, isAnonymous: true };
            this.updateUI(this.currentUser);
            return;
        }
        ui.views.authError.textContent = {
            'auth/user-not-found': 'المستخدم غير موجود.',
            'auth/wrong-password': 'كلمة المرور خاطئة.',
            'auth/email-already-in-use': 'البريد مسجل مسبقاً.'
        }[error.code] || error.message;
        ui.views.authError.style.display = 'block';
        ui.views.loading.style.display = 'none';
    }
};

const DataService = {
    viewMode: 'feed', // 'feed' or 'scheduled'

    async createPost(postData, file) {
        ui.views.loading.style.display = 'flex';
        try {
            // Check for Schedule
            const scheduleTime = ui.inputs.scheduleInput.value;
            if (scheduleTime) {
                const scheduledDate = new Date(scheduleTime);
                if (scheduledDate > new Date()) {
                    postData.status = 'scheduled';
                    postData.scheduledTime = scheduledDate.getTime();
                    postData.date = CONFIG.isDemo ? { seconds: scheduledDate.getTime() / 1000 } : firebase.firestore.Timestamp.fromDate(scheduledDate);
                } else {
                    postData.status = 'published';
                }
            } else {
                postData.status = 'published';
            }

            // File Upload logic
            if (file) {
                if (CONFIG.isDemo) {
                    postData.fileUrl = await this.readLocalFile(file);
                } else {
                    const ref = firebase.storage().ref(`uploads/${AuthService.currentUser.uid}/${Date.now()}_${file.name}`);
                    await ref.put(file);
                    postData.fileUrl = await ref.getDownloadURL();
                }
                postData.fileName = file.name;
            }

            // Save Post
            // Collect Selected Social Platforms
            const selectedPlatforms = Array.from(ui.inputs.socialCheckboxes)
                .filter(cb => cb.checked)
                .map(cb => cb.value);

            const finalPostData = {
                ...postData,
                platforms: selectedPlatforms, // Store selected platforms
                date: postData.date || firebase.firestore.FieldValue.serverTimestamp()
            };

            if (CONFIG.isDemo) {
                this.saveLocal(finalPostData);
            } else {
                await firebase.firestore().collection('posts').add(finalPostData);
            }

            ui.modal.classList.remove('active');
            ui.forms.upload.reset();
            document.querySelectorAll('[id$="-preview"]').forEach(el => el.innerHTML = '');
            // Reset styles
            document.querySelectorAll('.design-option').forEach(el => el.classList.remove('active'));
            document.querySelector('[data-style="classic"]')?.classList.add('active');
            ui.inputs.styleInput.value = 'classic';

            if (postData.status === 'scheduled') {
                ToastService.show(`تم جدولة المنشور! سيتم نشره في ${new Date(postData.scheduledTime).toLocaleString('ar-EG')}`, 'success');
            } else {
                ToastService.show('تم نشر المقال بنجاح!', 'success');
            }

        } catch (e) {
            console.error(e);
            alert("فشل النشر: " + e.message);
        } finally {
            ui.views.loading.style.display = 'none';
        }
    },

    subscribeToFeed() {
        if (CONFIG.isDemo) {
            this.renderFeed(JSON.parse(localStorage.getItem(CONFIG.demoStorageKey) || '[]'));
        } else {
            // Realtime Listeners
            const q = firebase.firestore().collection('posts');

            // NOTE: Complex filtering requires separate listeners or client-side filtering 
            // Since filtering by 'status' AND 'visibility' might need composite indexes we don't have,
            // we will fetch all recent posts and filter client-side for this demo.
            q.orderBy('date', 'desc').limit(50).onSnapshot(snap => this.handleSnapshot(snap));
        }
    },

    // Helpers
    postsMap: new Map(),
    handleSnapshot(snap) {
        snap.docChanges().forEach(c => {
            if (c.type === 'removed') this.postsMap.delete(c.doc.id);
            else this.postsMap.set(c.doc.id, { id: c.doc.id, ...c.doc.data() });
        });
        this.renderFeed(Array.from(this.postsMap.values()));
    },

    saveLocal(post) {
        const posts = JSON.parse(localStorage.getItem(CONFIG.demoStorageKey) || '[]');
        if (!post.date || post.status === 'published') {
            post.date = { seconds: Date.now() / 1000 };
        }
        posts.unshift(post);
        localStorage.setItem(CONFIG.demoStorageKey, JSON.stringify(posts));
        this.renderFeed(posts);
    },

    readLocalFile(file) {
        return new Promise(resolve => {
            const r = new FileReader();
            r.onload = e => resolve(e.target.result);
            r.readAsDataURL(file);
        });
    },

    renderFeed(posts) {
        // Filter Logic
        let filteredPosts = posts.filter(post => {
            // If viewing Scheduled tab
            if (this.viewMode === 'scheduled') {
                return post.status === 'scheduled' && post.userId === AuthService.currentUser?.uid;
            }
            // If viewing Main Feed
            else {
                // Must be published OR (mine AND private)
                // Also exclude scheduled posts even if published=false implies it
                // Logic: Show if (Status is 'published' OR undefined) AND (Visible Publicly OR Is Mine)
                const isPublished = !post.status || post.status === 'published';
                if (!isPublished) return false;

                const isMine = post.userId === AuthService.currentUser?.uid;
                if (post.visibility === 'public') return true;
                if (post.visibility === 'private' && isMine) return true;
                return false;
            }
        });

        ui.views.feed.innerHTML = filteredPosts
            .sort((a, b) => (b.date?.seconds || 0) - (a.date?.seconds || 0))
            .map(post => this.createCardHTML(post)).join('');
    },

    createCardHTML(post) {
        const isPrivate = post.visibility === 'private';
        const date = post.date ? new Date(post.date.seconds * 1000).toLocaleDateString('ar-EG') : '';
        const styleClass = post.style || 'classic';
        const isScheduled = post.status === 'scheduled';

        const socialBadge = (post.visibility === 'public' && !isScheduled)
            ? `<span class="social-badge" title="تم النشر تلقائياً"><i class="fa-brands fa-instagram"></i> <i class="fa-brands fa-twitter"></i></span>`
            : '';

        const scheduledBadge = isScheduled
            ? `<span class="scheduled-badge"><i class="fa-regular fa-clock"></i> مجدول</span>`
            : '';

        let content = '';
        if (post.type === 'image') content = `<div class="post-image"><img src="${post.fileUrl}"></div>`;
        else if (post.type === 'file') content = `<div class="post-file"><i class="fa-solid fa-file"></i> ${post.fileName}</div>`;
        else content = `<p class="post-text">${post.content || ''}</p>`;

        return `
        <div class="post-card ${styleClass}">
            <div class="post-header">
                <i class="${post.type === 'image' ? 'fa-regular fa-image' : 'fa-solid fa-align-left'}"></i>
                <div class="meta">
                    ${scheduledBadge}
                    ${isPrivate ? '<span class="privacy-badge"><i class="fa-solid fa-lock"></i> خاص</span>' : ''}
                    <span>${date}</span>
                </div>
            </div>
            <!-- Social Platforms Badge (Simulation) -->
            ${post.platforms && post.platforms.length > 0 ?
                `<div style="margin: 0 15px; display: flex; gap: 5px;">
                    ${post.platforms.map(p => `<span style="font-size: 0.7rem; background: rgba(255,255,255,0.1); padding: 2px 6px; border-radius: 4px; color: var(--text-secondary);"><i class="fa-brands fa-${p === 'twitter' ? 'x-twitter' : p}"></i></span>`).join('')}
                 </div>` : ''
            }
            <h3>${post.title}</h3>
            ${content}
            <div class="post-footer">
                <span class="user-badge"><i class="fa-solid fa-user"></i> ${post.userEmail?.split('@')[0]}</span>
                <div class="actions">
                    ${socialBadge}
                    <i class="fa-regular fa-heart"></i>
                </div>
            </div>
        </div>`;
    },

    // Scheduler Logic (Auto-Publish)
    initScheduler() {
        setInterval(() => {
            this.checkScheduledPosts();
        }, 30000); // Check every 30 seconds
    },

    checkScheduledPosts() {
        if (!AuthService.currentUser) return;
        const now = Date.now();
        let updated = false;

        // We iterate over the in-memory map (which syncs with Firestore/Local)
        // In a real backend app, this would be a server-side Cloud Function.
        this.postsMap.forEach((post, id) => {
            if (post.status === 'scheduled' && post.userId === AuthService.currentUser.uid) {
                const schedTime = post.scheduledTime || (post.date?.seconds * 1000);
                if (schedTime <= now) {
                    // Publish it!
                    // Publish it!
                    this.updatePostStatus(id, 'published');
                    updated = true;

                    // Notify user about local app publish
                    ToastService.show(`تم نشر منشورك المجدول "${post.title}" الآن بالكامل!`, 'success');

                    // Simulate Social Media Publishing
                    if (post.platforms && post.platforms.length > 0) {
                        post.platforms.forEach(platform => {
                            setTimeout(() => {
                                const names = { twitter: 'Twitter', facebook: 'Facebook', instagram: 'Instagram', linkedin: 'LinkedIn' };
                                ToastService.show(`تم النشر تلقائياً على ${names[platform]} بنجاح!`, 'social', `fa-brands fa-${platform === 'twitter' ? 'x-twitter' : platform}`);
                            }, 1500 + Math.random() * 2000); // Stagger notifications
                        });
                    }

                    console.log(`Auto-publishing post: ${post.title}`);
                }
            }
        });

        if (updated && CONFIG.isDemo) {
            // For demo, re-save to localstorage
            this.saveLocalBatch();
        }
    },

    updatePostStatus(id, status) {
        if (CONFIG.isDemo) {
            const post = this.postsMap.get(id);
            if (post) {
                post.status = status;
                // Array updates handled by saveLocalBatch usually, but let's do it direct
                this.postsMap.set(id, post);
            }
        } else {
            firebase.firestore().collection('posts').doc(id).update({ status: status });
        }
    },

    saveLocalBatch() {
        localStorage.setItem(CONFIG.demoStorageKey, JSON.stringify(Array.from(this.postsMap.values())));
        this.renderFeed(Array.from(this.postsMap.values()));
    }
};

// --- Idea Generator ---
const IDEA_PROMPTS = [
    "شاركنا صورة لمكتب العمل الخاص بك اليوم 📸",
    "ما هو أفضل كتاب قرأته مؤخراً؟ 📚",
    "نصيحة برمجية تعلمتها هذا الأسبوع... 💻",
    "صورة لقهوتك الصباحية ☕",
    "مشروع جديد تعمل عليه... أخبرنا بالتفاصيل!",
    "حكمة تؤمن بها في الحياة ✨",
    "صورة من رحلتك الأخيرة ✈️",
    "تحدي واجهته وحللته في العمل 💪",
    "أداة ذكاء اصطناعي أبهرتك مؤخراً 🤖"
];

function generateIdea() {
    const randomIdea = IDEA_PROMPTS[Math.floor(Math.random() * IDEA_PROMPTS.length)];
    ui.inputs.content.value = randomIdea;
}

// --- Event Listeners ---

// Ideas
ui.inputs.ideaBtn.onclick = generateIdea;

// Styles
ui.inputs.styleOptions.forEach(opt => {
    opt.onclick = () => {
        ui.inputs.styleOptions.forEach(el => el.classList.remove('active'));
        opt.classList.add('active');
        ui.inputs.styleInput.value = opt.getAttribute('data-style');
    };
});

// View Switching (Feed vs Scheduled)
ui.inputs.navScheduled.onclick = (e) => {
    e.preventDefault();
    DataService.viewMode = DataService.viewMode === 'feed' ? 'scheduled' : 'feed';

    // Update active state logic (simple CSS toggle needed or just logic)
    if (DataService.viewMode === 'scheduled') {
        ui.inputs.navScheduled.style.color = 'var(--accent-glow)';
        ui.inputs.navScheduled.innerHTML = `<i class="fa-solid fa-calendar-check"></i> العودة للرئيسية`;
    } else {
        ui.inputs.navScheduled.style.color = '';
        ui.inputs.navScheduled.innerHTML = `<i class="fa-regular fa-calendar-check"></i> المجدولة`;
    }

    DataService.renderFeed(Array.from(DataService.postsMap.values()));
};


// Auth
let isLoginMode = true;
document.getElementById('toggle-auth-mode').onclick = (e) => {
    isLoginMode = !isLoginMode;
    const text = isLoginMode ? 'تسجيل الدخول' : 'إنشاء حساب';
    document.getElementById('auth-title').textContent = text;
    document.getElementById('auth-submit-btn').textContent = text;
    e.target.textContent = isLoginMode ? 'إنشاء حساب جديد' : 'تسجيل الدخول';
};

ui.forms.auth.onsubmit = (e) => {
    e.preventDefault();
    AuthService.login(ui.inputs.authEmail.value, ui.inputs.authPass.value, isLoginMode);
};

document.getElementById('logout-btn').onclick = () => AuthService.logout();

// Upload
document.getElementById('open-upload-modal').onclick = () => ui.modal.classList.add('active');
document.getElementById('close-modal').onclick = () => ui.modal.classList.remove('active');

// Tabs
let currentTab = 'article';
document.querySelectorAll('.tab-btn').forEach(btn => btn.onclick = () => {
    document.querySelectorAll('.tab-btn, .tab-content').forEach(el => el.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`${btn.dataset.tab}-section`).classList.add('active');
    currentTab = btn.dataset.tab;
});

// File Previews
['image', 'file'].forEach(type => {
    document.getElementById(`${type}-input`).onchange = (e) => {
        const file = e.target.files[0];
        if (file) document.getElementById(`${type}-preview`).textContent = file.name;
    };
});

// Submit Post
ui.forms.upload.onsubmit = (e) => {
    e.preventDefault();
    if (!AuthService.currentUser) return;

    const fileInput = document.getElementById(`${currentTab}-input`);
    const file = (currentTab !== 'article' && fileInput) ? fileInput.files[0] : null;

    DataService.createPost({
        title: ui.inputs.title.value,
        content: ui.inputs.content.value,
        type: currentTab,
        visibility: ui.inputs.private.checked ? 'private' : 'public',
        style: ui.inputs.styleInput.value,
        userId: AuthService.currentUser.uid,
        userEmail: AuthService.currentUser.email
    }, file);
};

// Initialize
AuthService.init();