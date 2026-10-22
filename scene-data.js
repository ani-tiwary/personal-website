// Camera destinations and panel layout only. Travel is planned automatically.
// Edit text, navigation labels, projects, and links in site-content.js.
window.siteScenes = [
    {
        "id": "home",
        "persistent": true,
        "camera": {
            "centerX": -1.5,
            "centerY": 0,
            "zoom": 1.35
        },
        "content": {
            "align": "left",
            "placement": {
                "desktop": {
                    "x": 0.28,
                    "y": 0.5
                },
                "mobile": {
                    "x": 0.5,
                    "y": 0.55
                }
            }
        }
    },
    {
        "id": "about",
        "persistent": true,
        "camera": {
            "centerX": "-0.8738919128517708934388456266874726662500836783960527637260540245733853",
            "centerY": "0.2553959493522052963641360670241404823996928350620955888716778758862258",
            "zoom": 308067023.03221864
        },
        "content": {
            "align": "left",
            "surface": true,
            "placement": {
                "desktop": {
                    "x": 0.32,
                    "y": 0.5
                },
                "mobile": {
                    "x": 0.5,
                    "y": 0.55
                }
            }
        }
    },
    {
        "id": "work",
        "persistent": true,
        "camera": {
            "centerX": "-0.7325536890704843070011916522355009755868599513855225716212532087681794",
            "centerY": "-0.2411480510610741069207306374003607016429756173660448791380621764348059",
            "zoom": 14652251.863736669
        },
        "content": {
            "align": "right",
            "surface": true,
            "placement": {
                "desktop": {
                    "x": 0.68,
                    "y": 0.5
                },
                "mobile": {
                    "x": 0.5,
                    "y": 0.55
                }
            }
        }
    },
    {
        "id": "resume",
        "persistent": true,
        "camera": {
            "centerX": "-0.10109636384562",
            "centerY": "0.95628651080914",
            "zoom": 1000000000000
        },
        "content": {
            "align": "left",
            "surface": true,
            "placement": {
                "desktop": {
                    "x": 0.5,
                    "y": 0.5
                },
                "mobile": {
                    "x": 0.5,
                    "y": 0.55
                }
            }
        }
    }
].map(scene => {
    const { label, ...copy } = window.siteContent.pages[scene.id];
    return { ...scene, label, content: { ...copy, ...scene.content } };
});

// Compatibility bridge for the framework-free fractal renderer.
window.sceneCoordinates = window.siteScenes.map(({ id, camera }) => ({ name: id, ...camera }));
