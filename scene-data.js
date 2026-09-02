// The single source of truth for the fractal camera and portfolio UI.
// Add or reorder scenes here; navigation, URLs, and author tools update automatically.
window.siteScenes = [
    {
        id: "home",
        label: "Home",
        camera: { centerX: -1.5, centerY: 0, zoom: 1.35 },
        content: {
            eyebrow: "Portfolio / 2026",
            title: "hello. i'm ani.",
            body: "I make thoughtful software and explore the edges of machine learning and data.",
            align: "left",
            placement: {
                desktop: { x: 0.28, y: 0.5 },
                mobile: { x: 0.5, y: 0.67 }
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
        camera: { centerX: -0.6619150588774977, centerY: 0.4626763853121446, zoom: 6252.914748397133 },
        content: {
            eyebrow: "A little context",
            title: "curious by default.",
            body: "I'm Ani. I'm passionate about software engineering, machine learning, and data science. Outside of work, I play chess, run, and blog about music.",
            align: "left",
            surface: true,
            placement: {
                desktop: { x: 0.32, y: 0.5 },
                mobile: { x: 0.5, y: 0.63 }
            },
            links: [{ label: "See my work", scene: "work" }]
        }
    },
    {
        id: "work",
        label: "Work",
        camera: { centerX: -0.7510280100616008, centerY: 0.04104642517631003, zoom: 888.1995418015389 },
        content: {
            eyebrow: "Selected work",
            title: "things i've made.",
            body: "Projects and experiments live here. The scene is ready for case studies, links, images, and whatever comes next.",
            align: "right",
            surface: true,
            placement: {
                desktop: { x: 0.68, y: 0.5 },
                mobile: { x: 0.5, y: 0.64 }
            },
            links: [{ label: "Start over", scene: "home" }]
        }
    }
];

// Compatibility bridge for the framework-free fractal renderer.
window.sceneCoordinates = window.siteScenes.map(({ id, camera }) => ({ name: id, ...camera }));
