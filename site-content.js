// EDIT WEBSITE TEXT HERE. This is the single source for page copy and interface text.
// After editing, run npm run build and refresh the local site.
// Keep IDs, option keys, and {templateVariables} intact; links live beside their labels.
// The resume document itself is maintained in Overleaf, separately from this copy.
// This file is read by the browser and by the HTML build step.
globalThis.siteContent = {

    // META
    meta: {
        "language": "en",
        "locale": "en",
        "name": "Ani",
        "title": "Ani — software, ML, and data",
        "description": "Ani's software engineering, machine learning, and data science portfolio.",
        "noScript": "This portfolio uses JavaScript to render and navigate an interactive fractal."
    },

    // NAVIGATION
    navigation: {
        "skip": "Skip to content",
        "label": "Primary navigation",
        "goTo": "Go to {scene}",
        "contentRegion": "{scene} content",
        "pageTitle": "{scene} — {name}"
    },

    // INTRO
    intro: {
        "label": "Enter Ani's portfolio",
        "enter": "click to enter",
        "separator": "·",
        "explore": "drag to explore"
    },

    // HEADER
    header: {
        "wordmark": "ani",
        "punctuation": ".",
        "homeLabel": "Ani, home"
    },

    // DISPLAY
    display: {
        "label": "Display",
        "motionLabel": "Animations",
        "motionOptions": {
            "on": "On",
            "off": "Off",
            "auto": "Use device setting"
        },
        "qualityLabel": "Fractal detail",
        "qualityOptions": {
            "auto": "Automatic",
            "low": "Lighter / save battery",
            "high": "High detail",
            "native": "Screen resolution"
        },
        "status": {
            "unavailable": "Fractal animation is unavailable in this browser. All sections are still accessible.",
            "deviceOff": "Animations are off because of your device setting.",
            "off": "Animations are off.",
            "adaptive": "Animations are on. Detail adapts to your device.",
            "on": "Animations are on."
        }
    },

    // SETTINGS
    settings: {
        label: "Settings",
        scrollSensitivity: "Scroll sensitivity",
        minimum: "Min",
        maximum: "Max",
        sensitivityValue: "{value}×",
        juliaPreview: "Julia set at pointer",
        juliaHint: "Preview the Julia set beneath your pointer.",
        juliaTitle: "Julia set"
    },

    // THEME — names, descriptions, and accessible menu messages
    theme: {
        choose: "Choose colour scheme",
        invert: "Invert colours",
        title: "Colour scheme",
        hint: "Find your favourite atmosphere.",
        currentLabel: "Choose colour scheme, current: {name}",
        currentTitle: "Colour scheme: {name}",
        options: {
            light: { label: "Light", description: "Warm paper" },
            rainbow: { label: "Rainbow", description: "Prismatic spectrum" },
            aurora: { label: "Aurora", description: "Mint, cyan & orchid" },
            opal: { label: "Opal", description: "Pastel iridescence" }
        }
    },

    // FOOTER
    footer: {
        "cameraReadout": "{x} / {y} / {zoom}×"
    },

    easterEggs: {
        zoomOut: "hi! you're going the wrong way!"
    },

    // SHARED
    shared: {
        "projectStatus": "{number} / Coming soon",
        "placeholderStatus": "To add",
        "socialLabel": "Social profiles",
        "openResume": "Open PDF",
        "downloadResume": "Download resume",
        "resumeFilename": "Ani-Tiwary-Resume.pdf"
    },

    // AUTHOR
    author: {
        "label": "Author tools",
        "title": "Author mode",
        "shortcut": "D",
        "copy": "Copy scene JSON",
        "copied": "Copied",
        "copyPrompt": "Copy this scene configuration:",
        "newScene": {
            "label": "New scene",
            "eyebrow": "Section",
            "title": "New scene.",
            "body": "Add copy here."
        }
    },

    // PAGE COPY — Home, About, Experience (work), Resume
    pages: {
        "home": {
            "label": "Home",
            "title": "hello. i'm ani.",
            "titleAccent": "ani",
            "body": "I'm a mathematics, computer science, and philosophy student at Rutgers as well as a passionate software engineer. This is my website!",
            "links": [
                {
                    "label": "About me",
                    "scene": "about"
                }
            ],
            "socialLinks": [
                {
                    "label": "Instagram",
                    "icon": "instagram",
                    "href": "https://www.instagram.com/ani_tiwary/"
                },
                {
                    "label": "LinkedIn",
                    "icon": "linkedin",
                    "href": "https://www.linkedin.com/in/ani-tiwary/"
                },
                {
                    "label": "GitHub",
                    "icon": "github",
                    "href": "https://github.com/ani-tiwary"
                }
            ]
        },
        "about": {
            "label": "About",
            "title": "about me.",
            "body": "I'm Ani. I'm passionate about software engineering, machine learning, and data science. Outside of work, I play pickleball and pool, I run/bike, read books, and blog about music.",
            "links": [
                {
                    "label": "See my experience",
                    "scene": "work"
                }
            ]
        },
        "work": {
            "label": "Experience",
            "title": "experience.",
            "experience": [
                {
                    "id": "goldman-sachs",
                    "title": "Goldman Sachs",
                    "role": "2027 SWE Analyst",
                    "description": "AI for liquidity risk.",
                    "icon": "code"
                },
                {
                    "id": "rel",
                    "title": "Rutgers Economics Labs",
                    "role": "Team Lead",
                    "description": "Economic data. Agentic AI.",
                    "icon": "chart"
                },
                {
                    "id": "aresty",
                    "title": "Aresty · NJ Transit",
                    "role": "ML Research Assistant",
                    "description": "Predicting railway track degradation.",
                    "icon": "train"
                },
                {
                    "id": "scarlet-sync",
                    "title": "Scarlet Sync",
                    "role": "Co-founder · Engineer",
                    "description": "Smarter course scheduling.",
                    "icon": "calendar"
                },
                {
                    "id": "parker-lab",
                    "title": "Parker Lab",
                    "role": "DS Research Assistant",
                    "description": "Mouse electrophysiology data science.",
                    "icon": "microscope"
                },
                {
                    "id": "lykke",
                    "title": "Lykke",
                    "role": "Software Engineer",
                    "description": "Multimodal AI retrieval.",
                    "icon": "network"
                }
            ],
            "links": [
                {
                    "label": "View resume",
                    "scene": "resume"
                }
            ]
        },
        "resume": {
            "label": "Resume",
            "title": "the path so far.",
            "body": "My education, experience, and technical skills, all in one place.",
            "resume": {
                "src": "media/resume.pdf",
                "title": "Ani Tiwary’s resume"
            },
            "links": [
                {
                    "label": "Explore my experience",
                    "scene": "work"
                }
            ]
        }
    },
};
