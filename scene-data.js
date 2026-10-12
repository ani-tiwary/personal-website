// The single source of truth for the fractal camera and portfolio UI.
// Add or reorder scenes here; navigation, URLs, and author tools update automatically.
window.siteScenes = [
    {
        id: "home",
        label: "Home",
        persistent: true,
        camera: { centerX: -1.5, centerY: 0, zoom: 1.35 },
        content: {
            title: "hello. i'm ani.",
            titleAccent: "ani",
            body: "I make thoughtful software and explore the edges of machine learning and data. This is a home for my work, for future teammates and collaborators.",
            align: "left",
            placement: {
                desktop: { x: 0.28, y: 0.5 },
                mobile: { x: 0.5, y: 0.55 }
            },
            links: [{ label: "About me", scene: "about" }],
            socialLinks: [
                { label: "Instagram", icon: "instagram", href: "https://www.instagram.com/ani_tiwary/" },
                { label: "LinkedIn", icon: "linkedin", href: "https://www.linkedin.com/in/ani-tiwary/" },
                { label: "GitHub", icon: "github", href: "https://github.com/ani-tiwary" }
            ]
        }
    },
    {
        id: "about",
        label: "About",
        persistent: true,
        camera: { centerX: -0.6619150588774977, centerY: 0.4626763853121446, zoom: 6252.914748397133 },
        content: {
            eyebrow: "A little context",
            title: "curious by default.",
            body: "I'm Ani. I'm passionate about software engineering, machine learning, and data science. Outside of work, I play chess, run, and blog about music.",
            align: "left",
            surface: true,
            placeholders: [
                { id: "background", title: "My background", description: "Add a short story about what you’re studying, how you got into building software, and the problems you want to work on." }
            ],
            placement: {
                desktop: { x: 0.32, y: 0.5 },
                mobile: { x: 0.5, y: 0.55 }
            },
            links: [{ label: "See my work", scene: "work" }]
        }
    },
    {
        id: "work",
        label: "Work",
        persistent: true,
        camera: { centerX: -0.7510280100616008, centerY: 0.04104642517631003, zoom: 888.1995418015389 },
        content: {
            eyebrow: "Selected work",
            title: "things i've made.",
            body: "A space for selected software, machine learning, and data projects. Case studies are on the way.",
            projects: [
                {
                    id: "project-one", title: "Software project",
                    description: "A useful tool, from the first idea to a working product. Project details and a demo are coming soon.",
                    links: [{ label: "Video preview slot", scene: "media", section: "video" }]
                },
                {
                    id: "project-two", title: "Machine learning project",
                    description: "An experiment in turning data into predictions. Methods, results, and lessons are coming soon.",
                    links: [{ label: "Audio explanation slot", scene: "media", section: "audio" }, { label: "Image slideshow slot", scene: "media", section: "slideshow" }]
                },
                {
                    id: "project-three", title: "Data exploration",
                    description: "A closer look at a question through data and visualization. Findings and a walkthrough are coming soon."
                },
                {
                    id: "project-four", title: "Creative experiment",
                    description: "A space for playful code and ideas worth trying. The story, process, and source are coming soon."
                }
            ],
            align: "right",
            surface: true,
            placement: {
                desktop: { x: 0.68, y: 0.5 },
                mobile: { x: 0.5, y: 0.55 }
            },
            fractalLinks: [
                {
                    label: "Pinwheel",
                    camera: { centerX: -0.7510280100616008, centerY: 0.04104642517631003, zoom: 888.1995418015389 }
                },
                {
                    label: "Seahorse valley",
                    camera: { centerX: -0.743643887037151, centerY: 0.13182590420533, zoom: 1450 }
                },
                {
                    label: "Needle garden",
                    camera: { centerX: -1.250660, centerY: 0.020120, zoom: 1050 }
                },
                {
                    label: "Miniature set",
                    camera: { centerX: -1.748, centerY: 0.0004, zoom: 720 }
                }
            ],
            links: [{ label: "View resume", scene: "resume" }]
        }
    },
    {
        id: "resume",
        label: "Resume",
        persistent: true,
        camera: { centerX: -1.250660, centerY: 0.020120, zoom: 1050 },
        content: {
            eyebrow: "Experience & education",
            title: "the path so far.",
            body: "My education, experience, and technical skills, all in one place.",
            resume: { src: "media/resume.pdf", title: "Ani Tiwary’s resume" },
            align: "left",
            surface: true,
            placement: { desktop: { x: 0.5, y: 0.5 }, mobile: { x: 0.5, y: 0.55 } },
            links: [{ label: "Explore my work", scene: "work" }]
        }
    },
    {
        id: "media",
        label: "Media",
        persistent: true,
        camera: { centerX: -1.748, centerY: 0.0004, zoom: 720 },
        content: {
            eyebrow: "Watch / listen / explore",
            title: "a closer look.",
            body: "Room for demos, explanations, and the process behind my projects. Media samples are still to come.",
            align: "left",
            surface: true,
            placement: { desktop: { x: 0.68, y: 0.5 }, mobile: { x: 0.5, y: 0.55 } },
            links: [{ label: "Video", scene: "media", section: "video" }, { label: "Audio", scene: "media", section: "audio" }, { label: "Slideshow", scene: "media", section: "slideshow" }],
            placeholders: [
                { id: "video", title: "Project walkthrough", medium: "Video to come", description: "Show Project 01 in action. Add an introduction explaining what the demo shows and why it matters, then embed a video with captions.", links: [{ label: "Back to Project 01", scene: "work", section: "project-one" }] },
                { id: "audio", title: "Behind the decisions", medium: "Audio to come", description: "Talk through a decision or finding from Project 02. Add a short introduction, an embedded recording, and a transcript.", links: [{ label: "Back to Project 02", scene: "work", section: "project-two" }] },
                { id: "slideshow", title: "From idea to result", medium: "Image slideshow to come", description: "Collect screenshots, diagrams, or results from Project 02. Add captions explaining the progression, alt text, and slideshow controls.", links: [{ label: "Back to Project 02", scene: "work", section: "project-two" }] }
            ]
        }
    }
];

// Compatibility bridge for the framework-free fractal renderer.
window.sceneCoordinates = window.siteScenes.map(({ id, camera }) => ({ name: id, ...camera }));
