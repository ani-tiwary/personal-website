// Course-only copy. The original siteContent object is fresh in this document.
(() => {
    const pages = window.siteContent.pages;
    pages.home.body = "I'm a mathematics, computer science, and philosophy student at Rutgers, as well as a passionate software engineer. I built this portfolio to share how I turn questions into software, machine learning experiments, and useful data tools. Employers, collaborators, and fellow students can explore my projects, learn about my background, and get in touch.";
    pages.home.links = [
        { label: 'About me', scene: 'about' },
        { label: 'Explore my projects', scene: 'work' },
        { label: 'Watch the fractal demo', scene: 'media', section: 'video' }
    ];
    pages.home.sections = [
        { title: 'From abstract ideas to everyday tools', text: "Mathematics gives me a way to model a problem; computer science gives me a way to build something with that model; philosophy keeps me asking what the result means and whom it serves. That combination connects the research, products, and visual experiments you'll find here." },
        { title: 'Featured: Scarlet Sync', text: 'Course planning is a problem I know as a student. I co-founded Scarlet Sync to make it easier to compare schedules and handle conflicts. The platform has reached 1,000+ users and generates 5,000+ schedule options in under two seconds.', links: [{ label: 'Read the Scarlet Sync story', scene: 'work', section: 'scarlet-sync' }] },
        { title: 'Featured: mathematics you can explore', text: 'The background is an interactive Mandelbrot renderer built for this portfolio. It brings together numerical precision, graphics, and interface design. Visit Media to watch it, hear a sound interpretation, and browse a gallery of its patterns.', links: [{ label: 'Explore the renderer project', scene: 'work', section: 'portfolio' }, { label: 'Browse the fractal gallery', scene: 'media', section: 'gallery' }] }
    ];
    pages.about.body = "I'm Ani, a Rutgers student interested in the space between mathematical ideas and the people who use the software built from them. I study mathematics, computer science, and philosophy, and work across software engineering, machine learning, and data science.";
    pages.about.sections = [
        { title: 'What draws me to this work', text: "I like problems that invite more than one kind of thinking. A model needs a mathematical foundation, an application needs reliable engineering, and both need a clear reason to exist. Research and product work let me move between those perspectives instead of treating them as separate subjects." },
        { title: 'What experience has taught me', text: "Scheduling software makes a practical lesson concrete: a fast algorithm matters most when someone can use its result. Research brings a different discipline. In railway prediction, chronological validation is a reminder that an impressive score is only useful if the experiment resembles the situation where the model will be used. Across these projects, I keep coming back to clear assumptions, careful evaluation, and understandable results." },
        { title: 'Away from the keyboard', text: "I play pickleball and pool, run and bike, read books, and blog about music. I also play chess through the Rutgers Chess Team. These interests give me room for competition, steady practice, and curiosity outside coursework. Writing about music is another way to pay close attention and explain a personal response in words.", links: [{ label: 'My music blog · @ani_talks_music', href: 'https://www.instagram.com/ani_talks_music/' }] },
        { title: 'Places to start a conversation', text: 'Ask me about course scheduling, research with real-world data, a good run, or the music you have been listening to. Rutgers and its research communities are also a large part of my story.', links: [{ label: 'Rutgers University', href: 'https://www.rutgers.edu/' }, { label: 'Rutgers Economics Labs', href: 'https://www.rutgerseconomics.org/' }, { label: 'Aresty Research Center', href: 'https://aresty.rutgers.edu/' }] }
    ];
    const experience = {
        'goldman-sachs': {
            role: 'Software Engineer Intern · June–August 2026 · Incoming 2027 SWE Analyst',
            description: 'I built an internal Model Context Protocol (MCP) server to aggregate and analyze more than one million liquidity risk data points across Snowflake, AWS S3, and proprietary data lakes. I also engineered an LLM context and retrieval layer to automate approximately 75% of a data pipeline used by hundreds of risk managers.',
            reflection: 'The central challenge was connecting fragmented data to a useful workflow. This work illustrates why retrieval and data integration are as important as the language model itself: an answer can only be useful when the underlying information can be found and understood.',
            links: [{ label: 'Goldman Sachs · organization', href: 'https://www.goldmansachs.com/' }]
        },
        rel: {
            role: 'Research Analyst & AI Lead · September 2024–present',
            description: 'At Rutgers Economics Labs, I developed cohort-based population and labor supply/demand models for work with the New Jersey Department of Labor and HUD. The projections cover 2022–2050 and help identify regional labor gaps for policy and infrastructure planning. I also contributed to RAIL, a modular system for ingesting, cleaning, and structuring economic data.',
            reflection: 'Economic analysis connects technical choices to public questions. Reusable pipelines make it easier to revisit assumptions and compare projections, while team leadership requires explaining what a result does—and does not—support.',
            links: [{ label: 'REL research projects', href: 'https://www.rutgerseconomics.org/projects' }]
        },
        aresty: {
            role: 'ML Research Assistant · May 2025–present',
            description: 'Through Aresty research, I built a Python, Pandas, and Scikit-learn pipeline to predict railway track degradation. I engineered 19 spatial and temporal features and used chronological validation to avoid leaking future information into training. The résumé reports a 73% prediction accuracy result with Ridge Regression and an estimated 25–30% maintenance cost reduction potential; the cost estimate is a potential benefit, not a measured saving.',
            reflection: 'This project made evaluation design part of the engineering problem. A maintenance model needs to work on future observations, so preserving the time order of the data matters as much as selecting the algorithm.',
            links: [{ label: 'Aresty research program · context', href: 'https://aresty.rutgers.edu/programs-funding/research-assistant-program' }]
        },
        'scarlet-sync': {
            role: 'Co-founder · Software Engineer · April 2025–present',
            description: 'I co-founded Scarlet Sync to help Rutgers students build schedules, detect conflicts, and collaborate on course planning. I built a Next.js and Supabase system with OAuth authentication, plus Redis caching and Pub/Sub for timely seat updates. The platform has reached 1,000+ users and can generate 5,000+ schedules in under two seconds.',
            reflection: 'A useful scheduling tool has to connect speed with clarity. Generating options is only part of the job; students also need to understand conflicts and act on current information. This project connects algorithm design, interface decisions, and the responsibility of maintaining a product that people use.',
            links: [{ label: 'Try Scarlet Sync · live application', href: 'https://scarletsync.app/' }]
        },
        'parker-lab': {
            role: 'Data Science Research Assistant · January 2026–present',
            description: 'My work at Parker Lab involves data science with mouse electrophysiology data. This experience connects my interest in computational methods with experimental neuroscience: measurements become useful when their structure and scientific context remain visible during analysis.',
            reflection: 'The broader question that interests me here is how to preserve the meaning of experimental observations while making them easier to examine computationally.'
        },
        lykke: {
            role: 'Software Engineer · January–February 2026',
            description: 'At Lykke, I built a multimodal retrieval-augmented generation pipeline for a conversational AI application. It ingested and structured more than 10 GB of text, documents, and voice data. I also built integration pipelines that brought different sources into a domain-specific knowledge graph for structured queries and retrieval.',
            reflection: 'Different media arrive with different structures. Bringing them into a shared representation is an engineering problem before it is an AI problem. This work reinforced the value of deliberate data modeling when building a useful retrieval system.'
        }
    };
    pages.work.experience.forEach(item => Object.assign(item, experience[item.id]));
    pages.work.experience.push({
        id: 'portfolio', title: 'Interactive fractal portfolio', role: 'Personal software project · October 2026', icon: 'code',
        description: 'I built this portfolio with semantic HTML, CSS, JavaScript, and a WebGL Mandelbrot renderer. A Web Worker prepares high-precision reference calculations for deep zooms. Separate HTML content keeps the portfolio readable and navigable even when WebGL is unavailable.',
        reflection: 'This project brings my mathematical and visual interests together. It also makes a design tradeoff tangible: exploration can be engaging, but navigation still needs to be predictable. Display settings let visitors choose whether camera travel is animated.',
        links: [{ label: 'Renderer source code', href: 'https://github.com/ani-tiwary/personal-website' }, { label: 'Watch the project demo', scene: 'media', section: 'video' }, { label: 'Listen to the audio experiment', scene: 'media', section: 'audio' }]
    });
    pages.work.body = 'Projects and experiences in software, machine learning, and data. Each story explains the problem, my contribution, and why the work matters. Organization links provide context where internal work is not publicly available.';
    pages.resume.body = 'I want to build reliable software and data tools that turn complex questions into useful decisions. My interests in technology and problem-solving connect product engineering, machine learning, and research.';
    // Retain the real, unmodified PDF as an optional download, with readable HTML first.
    pages.resume.resume = undefined;
    pages.resume.links = [];
    pages.resume.sections = [
        { title: 'Anirudh Tiwary', text: 'Software engineering · Machine learning · Data science', links: [{ label: 'Portfolio home', scene: 'home' }, { label: 'Contact me', scene: 'media', section: 'feedback' }] },
        { title: 'Education · 2024–2027', text: 'Rutgers University, New Brunswick, NJ. B.S. Mathematics, Computer Science, and Philosophy; GPA: 3.85. Coursework includes Computer Architecture, Algorithms, Systems Programming, Linear Optimization, and Calculus IV.' },
        { title: 'Technical skills', text: 'Languages: Java, Python, C, JavaScript, TypeScript, SQL, HTML/CSS, and GDScript. ML and data: language models, Pandas, Scikit-learn, TensorFlow, NumPy, and Seaborn. Platforms: Next.js, React, Supabase, Redis, Flask, Node.js, and Tailwind CSS. Tools: Linux, Git, OAuth, and Android Studio.' },
        { title: 'Selected experience', text: 'Goldman Sachs · Software Engineer Intern · June–August 2026: data aggregation and LLM retrieval for liquidity risk. Scarlet Sync · Co-founder / Software Engineer · April 2025–present: a course-planning product serving 1,000+ users. Lykke · Software Engineer · January–February 2026: multimodal ingestion and knowledge-graph integration.' },
        { title: 'Research experience', text: 'Aresty Research Program · ML Research Assistant · May 2025–present: railway degradation prediction, feature engineering, and chronological validation. Rutgers Economics Labs · Research Analyst & AI Lead · September 2024–present: economic projections and reusable AI-assisted data pipelines.' },
        { title: 'What to look for in my work', text: 'Three themes connect these experiences: building products people use, making complex data easier to work with, and evaluating results carefully. The Experience page adds the context behind the concise résumé entries.', links: [{ label: 'Read the project stories', scene: 'work' }] },
        { title: 'Beyond technical work', text: 'My Rutgers involvement includes RAIL, Rutgers Economics Labs, Midway, USACS technical writing, and the Chess Team. Outside that work, I enjoy running, biking, pickleball, pool, books, and music writing. These activities keep communication, curiosity, and steady practice part of my routine.' },
        { title: 'PDF résumé', text: 'Open or download my original professional résumé.', links: [{ label: 'Open résumé PDF', href: '/media/resume.pdf' }] }
    ];
    pages.media = {
        label: 'Media', title: 'see, hear, explore.',
        body: 'A closer look at the mathematics behind this portfolio. Watch a short renderer demo, listen to a sound interpretation of its iteration counts, or browse the gallery in any order. Each sample connects back to the project that produced it.',
        links: [{ label: 'Read about the renderer', scene: 'work', section: 'portfolio' }]
    };
})();
