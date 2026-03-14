// ===== Internationalization (i18n) =====
let currentLang = localStorage.getItem('yourlab_lang') || 'en';

const translations = {
    en: {
        // Header
        tagline: 'Your Ideas Into Reality',
        // About
        aboutHeading: 'About YourLab',
        aboutLead: 'Fail small. Learn fast. Launch smart.',
        aboutBody: "Every year, over 30,000 new products are launched \u2014 and more than 90% of them fail. The biggest risk isn't having a bad idea; it's investing everything before validating on your business.",
        aboutBody2: "At YourLab, we help you build lean solutions so you can test your concept in the real market, learn what works, and iterate \u2014 fail smaller and pivot sooner.",
        statLabel1: 'of new products fail',
        statLabel2: 'of organisations struggle to innovate',
        aboutCta: 'The solution? Don\'t build everything \u2014 build the <strong>right thing first</strong>. That\'s what an MVP does.',
        // Journey
        journeyIdea: 'Idea',
        journeyIdeaDesc: 'You share your vision and business concept with us',
        journeyStrategy: 'Strategy',
        journeyStrategyDesc: 'We define the roadmap, scope, and core features',
        journeyBuild: 'Build',
        journeyBuildDesc: 'Our team designs and develops your product rapidly',
        journeyLaunch: 'Launch MVP',
        journeyLaunchDesc: 'Your product is ready to meet real users and grow',

        // Conclusion
        conclusionHeading: 'Why we are different?',
        conclusionBody: "We apply disciplined requirements engineering to transform your ideas into structured, measurable outcomes. Every request becomes a defined requirement, and every requirement carries a validation metric — so you always know what is being built and why. We don’t build for you; we build with you. This isn’t our lab — it’s YourLab. A place to test, measure, iterate, and grow. If you’re ready to move from assumption to validation, let’s start building the right thing.",
 
        // Chat
        chatHeading: "Let's Talk About Your Idea",
        chatDescription: 'Have a business idea? Our AI agent is here to listen and help you shape your vision. Just describe your idea and leave your contact information.',
        chatGreeting: "Hi there! I'm the YourLab Agent. Tell me about your business idea and share your contact info so we can reach out to discuss it further.",
        inputPlaceholder: 'Type your message here...',
        sendBtn: 'Send',
        // Footer
        footerText: '\u00A9 2025 YourLab. All rights reserved.',
        // Chat bot responses
        bot: {
            r0: 'Great! Tell me more about your business idea. What problem are you solving?',
            r1: 'That sounds interesting. How do you plan to differentiate from competitors?',
            r2: 'Excellent vision! Now, could you please share your name so we can contact you?',
            askEmail: "Thanks! What's your email address? We'll use this to reach out to you.",
            askPhone: "Perfect! And what's the best phone number to reach you at?",
            saved: (name) => `Excellent, ${name}. We've received your business idea and saved your contact information. Our team will review your idea and get back to you shortly. Thanks for choosing YourLab.`,
            askMissing: (email, phone) => "I want to make sure we can reach you. Could you provide:\n" + (email ? "" : "- Your email\n") + (phone ? "" : "- Your phone number\n") + "?",
            moreInfo: "Thanks for sharing! Is there anything else you'd like to tell us about your business idea?",
            generic: [
                "That's an interesting point! Tell me more.",
                "I see \u2014 how will you approach this?",
                "Fascinating! What's your target market?",
                "Great idea! What's the timeline for launch?",
                "I like your thinking! How can we help you with this?"
            ]
        }
    },
    pt: {
        // Header
        tagline: 'Transforme as Suas Ideias de Neg\u00F3cio em Realidade',
        // About
        aboutHeading: 'Sobre a YourLab',
        aboutLead: 'Erre pequeno. Aprenda r\u00E1pido. Lance com intelig\u00EAncia.',
        aboutBody: 'Todos os anos, mais de 30.000 novos produtos s\u00E3o lan\u00E7ados \u2014 e mais de 90% deles falham. O maior risco n\u00E3o \u00E9 ter uma m\u00E1 ideia; \u00E9 investir tudo antes de a validar. Na YourLab, ajudamos-te a construir MVPs lean para que possas testar o teu conceito no mercado real, aprender o que funciona e iterar \u2014 sem apostar todo o neg\u00F3cio no primeiro dia.',
        statLabel1: 'dos novos produtos falham',
        statLabel2: 'das organiza\u00E7\u00F5es t\u00EAm dificuldade em inovar',
        aboutCta: 'A solu\u00E7\u00E3o? N\u00E3o construas tudo \u2014 constr\u00F3i <strong>a coisa certa primeiro</strong>. \u00C9 isso que um MVP faz.',
        // Journey
        journeyIdea: 'Ideia',
        journeyIdeaDesc: 'Partilhas a tua vis\u00E3o e conceito de neg\u00F3cio connosco',
        journeyStrategy: 'Estrat\u00E9gia',
        journeyStrategyDesc: 'Definimos o roadmap, o \u00E2mbito e as funcionalidades essenciais',
        journeyBuild: 'Constru\u00E7\u00E3o',
        journeyBuildDesc: 'A nossa equipa desenha e desenvolve o teu produto rapidamente',
        journeyLaunch: 'Lan\u00E7ar MVP',
        journeyLaunchDesc: 'O teu produto est\u00E1 pronto para chegar a utilizadores reais',
        // Chat
        chatHeading: 'Vamos Falar Sobre a Tua Ideia',
        chatDescription: 'Tens uma ideia de neg\u00F3cio? O nosso agente de IA est\u00E1 aqui para ouvir e ajudar-te a moldar a tua vis\u00E3o. Basta descrever a tua ideia e deixar as tuas informa\u00E7\u00F5es de contacto.',
        chatGreeting: 'Ol\u00E1! Sou o Agente da YourLab. Fala-me da tua ideia de neg\u00F3cio e partilha as tuas informa\u00E7\u00F5es de contacto para podermos entrar em contacto contigo.',
        inputPlaceholder: 'Escreve a tua mensagem aqui...',
        sendBtn: 'Enviar',
        // Footer
        footerText: '\u00A9 2025 YourLab. Todos os direitos reservados.',
        // Chat bot responses
        bot: {
            r0: '\u00D3timo! Conta-me mais sobre a tua ideia de neg\u00F3cio. Que problema est\u00E1s a resolver?',
            r1: 'Parece interessante. Como pensas diferenciar-te da concorr\u00EAncia?',
            r2: 'Excelente vis\u00E3o! Podes partilhar o teu nome para podermos contactar-te?',
            askEmail: 'Obrigado! Qual \u00E9 o teu email? Vamos us\u00E1-lo para entrar em contacto contigo.',
            askPhone: 'Perfeito! E qual \u00E9 o melhor n\u00FAmero de telefone para te contactar?',
            saved: (name) => `Excelente, ${name}. Recebemos a tua ideia de neg\u00F3cio e guard\u00E1mos as tuas informa\u00E7\u00F5es de contacto. A nossa equipa vai analisar a tua ideia e entrar\u00E1 em contacto em breve. Obrigado por escolheres a YourLab.`,
            askMissing: (email, phone) => "Quero ter a certeza de que te conseguimos contactar. Podes fornecer:\n" + (email ? "" : "- O teu email\n") + (phone ? "" : "- O teu n\u00FAmero de telefone\n") + "?",
            moreInfo: 'Obrigado por partilhares! H\u00E1 mais alguma coisa que gostarias de nos contar sobre a tua ideia de neg\u00F3cio?',
            generic: [
                '\u00C9 um ponto interessante! Conta-me mais.',
                'Compreendo \u2014 como pensas abordar isto?',
                'Fascinante! Qual \u00E9 o teu mercado-alvo?',
                '\u00D3tima ideia! Qual \u00E9 o timing para o lan\u00E7amento?',
                'Gosto da tua vis\u00E3o! Como podemos ajudar-te com isto?'
            ]
        }
    }
};

function setLanguage(lang) {
    currentLang = lang;
    localStorage.setItem('yourlab_lang', lang);
    document.documentElement.lang = lang;

    // Update toggle UI
    document.querySelectorAll('.lang-option').forEach(opt => {
        opt.classList.toggle('active', opt.dataset.lang === lang);
    });

    // Translate all elements with data-i18n
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        const text = translations[lang][key];
        if (text !== undefined) {
            if (el.getAttribute('data-i18n-html') === 'true') {
                el.innerHTML = text;
            } else {
                el.textContent = text;
            }
        }
    });

    // Translate placeholders
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        const text = translations[lang][key];
        if (text !== undefined) {
            el.placeholder = text;
        }
    });
}

// Language toggle click handler
document.getElementById('langToggle').addEventListener('click', () => {
    setLanguage(currentLang === 'en' ? 'pt' : 'en');
});

// Apply saved language on load
setLanguage(currentLang);

// Helper to get current bot translations
function getBotText() {
    return translations[currentLang].bot;
}

const chatForm = document.getElementById('chatForm');
const userInput = document.getElementById('userInput');
const chatMessages = document.getElementById('chatMessages');

// Store conversations
let currentConversation = {
    messages: [],
    contact: {
        name: '',
        email: '',
        phone: ''
    },
    businessIdea: ''
};

// Initial bot greeting
function addBotMessage(text) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message bot-message';
    messageDiv.innerHTML = `<p>${text}</p>`;
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function addUserMessage(text) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message user-message';
    messageDiv.innerHTML = `<p>${text}</p>`;
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Parse user input to extract contact information
function parseInput(text) {
    const emailRegex = /[\w\.-]+@[\w\.-]+\.\w+/g;
    const phoneRegex = /(\+?\d{1,3}[-.\s]?)?\(?\d{1,4}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,9}/g;
    const nameRegex = /(?:name is|i'm|i am|call me|chamo-me|meu nome é|sou o|sou a)\s+([a-zA-ZÀ-ÿ\s]+)(?:[,.]|$)/i;

    const emails = text.match(emailRegex);
    const phones = text.match(phoneRegex);
    const nameMatch = text.match(nameRegex);

    if (emails) currentConversation.contact.email = emails[0];
    if (phones) currentConversation.contact.phone = phones[0];
    if (nameMatch) currentConversation.contact.name = nameMatch[1].trim();

    currentConversation.businessIdea += ' ' + text;
}

// Chat logic with conversation flow
function processUserMessage(userText) {
    addUserMessage(userText);
    parseInput(userText);

    let botResponse = '';
    const messageCount = currentConversation.messages.length;
    const bot = getBotText();

    // Check if we have collected enough information
    const hasName = currentConversation.contact.name;
    const hasEmail = currentConversation.contact.email;
    const hasPhone = currentConversation.contact.phone;
    const hasIdea = currentConversation.businessIdea.trim().length > 20;

    if (messageCount === 0) {
        botResponse = bot.r0;
    } else if (messageCount === 1) {
        botResponse = bot.r1;
    } else if (messageCount === 2) {
        botResponse = bot.r2;
    } else if (!hasEmail) {
        botResponse = bot.askEmail;
    } else if (!hasPhone) {
        botResponse = bot.askPhone;
    } else if (hasName && hasEmail && hasPhone && hasIdea) {
        // Save the conversation
        saveConversation();
        botResponse = bot.saved(currentConversation.contact.name);
    } else if (messageCount > 5) {
        // If user hasn't provided all info after many messages
        if (!hasEmail || !hasPhone) {
            botResponse = bot.askMissing(hasEmail, hasPhone);
        } else {
            botResponse = bot.moreInfo;
        }
    } else {
        botResponse = bot.generic[messageCount % bot.generic.length];
    }

    currentConversation.messages.push({
        user: userText,
        bot: botResponse,
        timestamp: new Date().toISOString()
    });

    setTimeout(() => {
        addBotMessage(botResponse);
    }, 500);

    userInput.value = '';
    userInput.focus();
}

// Save conversation to local storage and send to backend
function saveConversation() {
    const data = {
        timestamp: new Date().toISOString(),
        contact: currentConversation.contact,
        businessIdea: currentConversation.businessIdea.trim(),
        messages: currentConversation.messages
    };

    // Save to local storage
    let conversations = JSON.parse(localStorage.getItem('yourlab_conversations') || '[]');
    conversations.push(data);
    localStorage.setItem('yourlab_conversations', JSON.stringify(conversations));

    // Send to backend (if available)
    fetch('/api/save-inquiry', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
    }).catch(err => {
        console.log('Backend not available, saved locally:', err);
    });

    // Reset conversation
    currentConversation = {
        messages: [],
        contact: {
            name: '',
            email: '',
            phone: ''
        },
        businessIdea: ''
    };
}

// Form submission
chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const userText = userInput.value.trim();
    if (userText) {
        processUserMessage(userText);
    }
});

// Allow Enter key to send (Shift+Enter for new line)
userInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        chatForm.dispatchEvent(new Event('submit'));
    }
});

// Debug: Show saved conversations in console
function showSavedConversations() {
    const conversations = JSON.parse(localStorage.getItem('yourlab_conversations') || '[]');
    console.log('Saved Conversations:', conversations);
    return conversations;
}

console.log('YourLab Chat Agent Ready! Type "showSavedConversations()" in console to view all saved inquiries.');

// ===== Scroll Reveal & Counter Animation =====
(function () {
    const revealEls = document.querySelectorAll('.reveal-up');
    const statNumbers = document.querySelectorAll('.stat-number[data-target]');
    let statsAnimated = false;

    // Intersection Observer for reveal animations
    const revealObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry, i) => {
            if (entry.isIntersecting) {
                // Stagger the reveal for sequential elements
                const delay = Array.from(revealEls).indexOf(entry.target) * 120;
                setTimeout(() => {
                    entry.target.classList.add('revealed');
                }, delay);
                revealObserver.unobserve(entry.target);
            }
        });
    }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });

    revealEls.forEach(el => revealObserver.observe(el));

    // Counter animation for stat numbers
    function animateCounters() {
        if (statsAnimated) return;
        statsAnimated = true;

        statNumbers.forEach(num => {
            const target = parseInt(num.dataset.target, 10);
            const duration = 2000;
            const start = performance.now();

            function update(now) {
                const elapsed = now - start;
                const progress = Math.min(elapsed / duration, 1);
                // Ease-out cubic
                const eased = 1 - Math.pow(1 - progress, 3);
                num.textContent = Math.round(target * eased);
                if (progress < 1) requestAnimationFrame(update);
            }

            requestAnimationFrame(update);
        });
    }

    const statsSection = document.querySelector('.about-stats');
    if (statsSection) {
        const statsObserver = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) {
                animateCounters();
                statsObserver.unobserve(statsSection);
            }
        }, { threshold: 0.5 });
        statsObserver.observe(statsSection);
    }
})();

// ===== Immersive Slideshow =====
(function () {
    const slides = document.querySelectorAll('.slideshow-section .slide');
    const dots = document.querySelectorAll('.slideshow-section .dot');
    const prevBtn = document.querySelector('.slide-prev');
    const nextBtn = document.querySelector('.slide-next');
    const progressBar = document.querySelector('.slide-progress-bar');
    if (!slides.length) return;

    let current = 0;
    const total = slides.length;
    const INTERVAL = 30000; // ms per slide
    let timer = null;
    let progressStart = null;
    let rafId = null;

    function goTo(index) {
        slides[current].classList.remove('active');
        dots[current].classList.remove('active');
        current = (index + total) % total;
        slides[current].classList.add('active');
        dots[current].classList.add('active');
        resetProgress();
    }

    function next() { goTo(current + 1); }
    function prev() { goTo(current - 1); }

    // Progress bar animation
    function animateProgress(timestamp) {
        if (!progressStart) progressStart = timestamp;
        const elapsed = timestamp - progressStart;
        const pct = Math.min((elapsed / INTERVAL) * 100, 100);
        progressBar.style.width = pct + '%';
        if (pct < 100) {
            rafId = requestAnimationFrame(animateProgress);
        }
    }

    function resetProgress() {
        cancelAnimationFrame(rafId);
        progressBar.style.width = '0%';
        progressStart = null;
        rafId = requestAnimationFrame(animateProgress);
        clearInterval(timer);
        timer = setInterval(next, INTERVAL);
    }

    // Events
    nextBtn.addEventListener('click', next);
    prevBtn.addEventListener('click', prev);
    dots.forEach(dot => {
        dot.addEventListener('click', () => goTo(Number(dot.dataset.index)));
    });

    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
        const rect = document.querySelector('.slideshow-section').getBoundingClientRect();
        const inView = rect.top < window.innerHeight && rect.bottom > 0;
        if (!inView) return;
        if (e.key === 'ArrowRight') next();
        if (e.key === 'ArrowLeft') prev();
    });

    // Touch / swipe support
    let touchStartX = 0;
    const container = document.querySelector('.slideshow-container');
    container.addEventListener('touchstart', (e) => {
        touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });
    container.addEventListener('touchend', (e) => {
        const diff = e.changedTouches[0].screenX - touchStartX;
        if (Math.abs(diff) > 50) {
            diff < 0 ? next() : prev();
        }
    }, { passive: true });

    // Pause on hover
    container.addEventListener('mouseenter', () => {
        clearInterval(timer);
        cancelAnimationFrame(rafId);
    });
    container.addEventListener('mouseleave', () => {
        resetProgress();
    });

    // Start
    resetProgress();
})();

// ===== About Background: Interactive Dot Mountain Landscape =====
(function () {
    const section = document.getElementById('about');
    const canvas = document.getElementById('terrainDotsCanvas');
    if (!section || !canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const MIN_COLS = 96;
    const MIN_ROWS = 60;
    const MAX_COLS = 170;
    const MAX_ROWS = 110;
    const points = [];
    const mountains = [
        { x: -0.75, z: 0.52, a: 1.15, sx: 0.22, sz: 0.15 },
        { x: -0.18, z: 0.60, a: 1.55, sx: 0.26, sz: 0.16 },
        { x: 0.46, z: 0.50, a: 1.25, sx: 0.22, sz: 0.14 },
        { x: 0.10, z: 0.83, a: 0.72, sx: 0.38, sz: 0.22 }
    ];

    let width = 0;
    let height = 0;
    let dpr = 1;
    let cols = MIN_COLS;
    let rows = MIN_ROWS;
    let running = false;
    let rafId = null;
    let lastTime = performance.now();

    function terrainHeight(x, z) {
        let h = 0;
        for (let i = 0; i < mountains.length; i += 1) {
            const m = mountains[i];
            const dx = x - m.x;
            const dz = z - m.z;
            h += m.a * Math.exp(-((dx * dx) / m.sx + (dz * dz) / m.sz));
        }
        // Broad ridges so the field reads clearly as a landscape.
        h += 0.24 * Math.exp(-Math.pow((z - 0.64), 2) / 0.13) * (0.45 + 0.55 * Math.cos((x + 0.15) * 7.2));
        h += 0.15 * Math.exp(-Math.pow((z - 0.42), 2) / 0.09) * (0.5 + 0.5 * Math.sin((x - 0.35) * 5.8));
        // Slight valley shaping keeps visible mountain contrast.
        h -= Math.max(0, (Math.abs(x) - 0.95)) * 0.35;
        return Math.max(0, h);
    }

    function buildGrid() {
        points.length = 0;
        for (let row = 0; row < rows; row += 1) {
            const z = row / (rows - 1);
            for (let col = 0; col < cols; col += 1) {
                const jitterX = (Math.random() - 0.5) * 0.012;
                const jitterZ = (Math.random() - 0.5) * 0.010;
                const x = ((col / (cols - 1)) * 2 - 1) + jitterX;
                const sampleZ = Math.min(1, Math.max(0, z + jitterZ));
                const h = terrainHeight(x, sampleZ);
                points.push({
                    x,
                    z: sampleZ,
                    base: h,
                    offset: 0,
                    vel: 0
                });
            }
        }
    }

    function resizeCanvas() {
        const rect = section.getBoundingClientRect();
        width = Math.max(320, rect.width);
        height = Math.max(340, rect.height);
        dpr = Math.min(window.devicePixelRatio || 1, 2);

        canvas.width = Math.floor(width * dpr);
        canvas.height = Math.floor(height * dpr);
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        cols = Math.max(MIN_COLS, Math.min(MAX_COLS, Math.floor(width / 8)));
        rows = Math.max(MIN_ROWS, Math.min(MAX_ROWS, Math.floor(height / 7)));
        buildGrid();
        render(0);
    }

    function disturb(nx, ny) {
        const worldX = (nx * 2 - 1);
        const worldZ = Math.min(Math.max((ny - 0.18) / 0.82, 0), 1);
        const radius = 0.13;
        const radiusSq = radius * radius;

        for (let i = 0; i < points.length; i += 1) {
            const p = points[i];
            const dx = p.x - worldX;
            const dz = p.z - worldZ;
            const distSq = dx * dx + dz * dz;
            if (distSq > radiusSq) continue;
            const influence = 1 - (distSq / radiusSq);
            p.vel += influence * 0.05;
        }

        if (!running && !prefersReducedMotion) {
            running = true;
            lastTime = performance.now();
            rafId = requestAnimationFrame(step);
        } else if (prefersReducedMotion) {
            render(0);
        }
    }

    function simulate(dt) {
        let energy = 0;
        for (let i = 0; i < points.length; i += 1) {
            const p = points[i];
            p.vel += -p.offset * 0.15 * dt;
            p.vel *= 0.88;
            p.offset += p.vel * dt;
            energy += Math.abs(p.vel) + Math.abs(p.offset);
        }
        return energy / points.length;
    }

    function render(time) {
        ctx.clearRect(0, 0, width, height);

        const horizonY = height * 0.22;
        const floorY = height * 0.96;

        const haze = ctx.createLinearGradient(0, horizonY, 0, floorY);
        haze.addColorStop(0, 'rgba(232, 213, 183, 0.00)');
        haze.addColorStop(0.52, 'rgba(232, 213, 183, 0.03)');
        haze.addColorStop(1, 'rgba(232, 213, 183, 0.08)');
        ctx.fillStyle = haze;
        ctx.fillRect(0, horizonY, width, floorY - horizonY);

        for (let i = 0; i < points.length; i += 1) {
            const p = points[i];
            const depth = p.z;
            const perspective = 0.5 + depth * 1.45;
            const spread = width * (0.12 + depth * 0.45);
            const groundY = horizonY + Math.pow(depth, 1.06) * (floorY - horizonY);
            const heightDisplacement = (p.base + p.offset) * height * (0.024 + depth * 0.112);

            const sx = width * 0.5 + p.x * spread;
            const sy = groundY - heightDisplacement;
            if (sx < -10 || sx > width + 10 || sy < horizonY - 10 || sy > height + 10) continue;

            const size = 0.34 + depth * 1.25 + p.base * 0.2;
            const alpha = 0.03 + depth * 0.17 + p.base * 0.05;

            ctx.beginPath();
            ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(0.32, alpha).toFixed(4)})`;
            ctx.arc(sx, sy, size, 0, Math.PI * 2);
            ctx.fill();

            if (p.base > 0.95 && p.z > 0.14) {
                ctx.beginPath();
                ctx.fillStyle = `rgba(232, 213, 183, ${Math.min(0.18, alpha * 0.58).toFixed(4)})`;
                ctx.arc(sx, sy, size * 0.55, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }

    function step(now) {
        const dt = Math.min(2, (now - lastTime) / 16.67);
        lastTime = now;
        const energy = simulate(dt);
        render(now);

        if (energy > 0.0009) {
            rafId = requestAnimationFrame(step);
        } else {
            running = false;
            rafId = null;
        }
    }

    section.addEventListener('pointermove', (event) => {
        const rect = section.getBoundingClientRect();
        const nx = (event.clientX - rect.left) / rect.width;
        const ny = (event.clientY - rect.top) / rect.height;
        disturb(nx, ny);
    });

    window.addEventListener('resize', resizeCanvas);

    resizeCanvas();

    window.addEventListener('beforeunload', () => {
        if (rafId) cancelAnimationFrame(rafId);
    });
})();
