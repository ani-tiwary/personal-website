// Adaptive camera travel. Coordinates stay in fixed point; motion is measured in
// viewport lengths and zoom octaves (doublings), so deep local moves stay local.
((scope) => {
    const math = scope.FractalMath;
    const clamp = value => Math.max(0, Math.min(1, value));
    const ease = t => clamp(t * t * t * (t * (t * 6 - 15) + 10));
    const LN2 = Math.LN2;
    // Subtracting logarithms loses tiny zoom changes at large magnifications.
    const logRatio = (to, from) => to > from / 2 && to < from * 2
        ? Math.log1p((to - from) / from) : Math.log(to) - Math.log(from);
    function interpolateZoom(from, to, t) {
        if (t <= 0) return from;
        if (t >= 1) return to;
        return Math.max(Math.min(from, to), Math.min(Math.max(from, to),
            from * Math.exp(logRatio(to, from) * t)));
    }

    // One site-wide motion policy, not a duration for each scene. Acceleration and
    // jerk (change of acceleration) prevent short trips from snapping into motion.
    const PAN = Object.freeze({ speed: 0.85, acceleration: 2.8, jerk: 18 });
    function seconds(amount, limits) {
        return Math.max(1.875 * amount / limits.speed,
            Math.sqrt((10 / Math.sqrt(3)) * amount / limits.acceleration),
            Math.cbrt(60 * amount / limits.jerk));
    }
    function derivatives(track, time) {
        const duration = track.end - track.begin;
        const t = clamp((time - track.begin) / duration);
        if (time < track.begin || time > track.end) return [ease(t), 0, 0, 0];
        return [ease(t), 30 * t * t * (1 - t) ** 2 / duration,
            60 * t * (1 - t) * (1 - 2 * t) / duration ** 2,
            (60 - 360 * t + 360 * t * t) / duration ** 3];
    }
    function overlap(baseDuration, octaves, panDuration) {
        if (!baseDuration) return 0;
        // Share motion only within four times the overview magnification.
        const limit = Math.min(1, 2 / octaves);
        let low = 0, high = 1;
        for (let i = 0; i < 32; i++) {
            const middle = (low + high) / 2;
            if (ease(middle) < limit) low = middle;
            else high = middle;
        }
        return Math.min(panDuration * 0.45, baseDuration * low / (1 - low));
    }

    // Measure the *combined* motion. Zoom changes the screen velocity of a pan;
    // checking world-space pan speed alone is unsafe at high magnification.
    function motionAt(tracks, time, initialZoom, distance) {
        let zoom = initialZoom, logSpeed = 0, logAcceleration = 0, logJerk = 0;
        let panSpeed = 0, panAcceleration = 0, panJerk = 0;
        for (const track of tracks) {
            const [position, speed, acceleration, jerk] = derivatives(track, time);
            if (track.kind === 'pan') {
                panSpeed = speed; panAcceleration = acceleration; panJerk = jerk;
            } else if (time >= track.begin) {
                const delta = logRatio(track.to, track.from);
                zoom = interpolateZoom(track.from, track.to, position);
                logSpeed = delta * speed; logAcceleration = delta * acceleration; logJerk = delta * jerk;
            }
        }
        return {
            pan: [distance * zoom * panSpeed,
                distance * zoom * (panAcceleration + panSpeed * logSpeed),
                distance * zoom * (panJerk + 2 * panAcceleration * logSpeed
                    + panSpeed * (logAcceleration + logSpeed ** 2))],
            zoom: [logSpeed / LN2, logAcceleration / LN2, logJerk / LN2]
        };
    }
    function requiredStretch(tracks, start, distance, limits) {
        let stretch = 1;
        // Sample each track separately, including its endpoints. This also checks
        // short overlap regions in very deep trips. Leave 3% numerical headroom.
        for (const track of tracks) for (let i = 0; i <= 64; i++) {
            const time = track.begin + (track.end - track.begin) * i / 64;
            const motion = motionAt(tracks, time, start.zoom, distance);
            for (const [axis, key] of ['speed', 'acceleration', 'jerk'].entries()) {
                const usage = Math.hypot(motion.pan[axis] / limits.pan[key], motion.zoom[axis] / limits.zoom[key]);
                stretch = Math.max(stretch, usage ** (1 / (axis + 1)));
            }
        }
        return stretch * 1.03;
    }

    function plan(start, target, options = {}) {
        const aspect = options.aspect ?? 1;
        const minZoom = options.minZoom ?? 1e-70, maxZoom = options.maxZoom ?? 1e70;
        const minOverviewZoom = options.minOverviewZoom ?? minZoom;
        if (!Number.isFinite(aspect) || aspect <= 0 || !Number.isFinite(minZoom) || minZoom <= 0
            || !Number.isFinite(maxZoom) || maxZoom < minZoom
            || !Number.isFinite(minOverviewZoom) || minOverviewZoom <= 0) throw Error('Invalid camera travel context');
        for (const camera of [start, target]) {
            if (typeof camera.x !== 'bigint' || typeof camera.y !== 'bigint'
                || !Number.isFinite(camera.zoom) || camera.zoom <= 0) throw Error('Invalid travel camera');
        }
        start = { ...start, zoom: Math.max(minZoom, Math.min(maxZoom, start.zoom)) };
        target = { ...target, zoom: Math.max(minZoom, Math.min(maxZoom, target.zoom)) };
        const distance = Math.hypot(math.number(target.x - start.x) / (3 * aspect),
            math.number(target.y - start.y) / 3);
        if (!Number.isFinite(distance)) throw Error('Travel distance is out of range');
        const sameCenter = start.x === target.x && start.y === target.y;
        const upper = Math.min(start.zoom, target.zoom);
        // Relative depth, not the absolute coordinate: a one-screen pan at 1e24
        // should feel like a one-screen pan at 1x. Long dives can cruise faster.
        const depth = Math.max(Math.abs(logRatio(target.zoom, start.zoom)) / LN2,
            Math.log2(1 + distance * Math.max(start.zoom, target.zoom)));
        const zoomSpeed = 6 + Math.min(12, 1.6 * Math.sqrt(depth));
        // Slightly quicker cruising on long dives; retain the gentle acceleration
        // and braking limits so nearby moves and arrivals do not feel rushed.
        const limits = { pan: PAN, zoom: { speed: zoomSpeed * 1.08, acceleration: zoomSpeed * 3, jerk: zoomSpeed * 18 } };

        function candidate(overview) {
            const tracks = [];
            let duration = 0;
            if (sameCenter) {
                if (start.zoom !== target.zoom) {
                    duration = seconds(Math.abs(logRatio(target.zoom, start.zoom)) / LN2, limits.zoom);
                    tracks.push({ kind: 'zoom', begin: 0, end: duration, from: start.zoom, to: target.zoom });
                }
            } else {
                const outOctaves = Math.max(0, logRatio(start.zoom, overview) / LN2);
                const inOctaves = Math.max(0, logRatio(target.zoom, overview) / LN2);
                const outDuration = seconds(outOctaves, limits.zoom), inDuration = seconds(inOctaves, limits.zoom);
                // Keep an imperceptibly small pan representable on a long zoom's
                // timeline instead of rounding its begin/end to the same number.
                const panDuration = Math.max(seconds(distance * overview, limits.pan),
                    (outDuration + inDuration) * 1e-6);
                const panEnd = outDuration + panDuration;
                duration = panEnd + inDuration;
                if (outOctaves) tracks.push({ kind: 'zoom', begin: 0,
                    end: outDuration + overlap(outDuration, outOctaves, panDuration), from: start.zoom, to: overview });
                tracks.push({ kind: 'pan', begin: outDuration, end: panEnd });
                if (inOctaves) tracks.push({ kind: 'zoom',
                    begin: panEnd - overlap(inDuration, inOctaves, panDuration), end: duration, from: overview, to: target.zoom });
            }
            const stretch = requiredStretch(tracks, start, distance, limits);
            return { start, target, overview, duration: duration * stretch * 1000, limits,
                needsZoomOut: overview < start.zoom,
                tracks: tracks.map(track => ({ ...track, begin: track.begin / duration, end: track.end / duration })) };
        }

        let best = candidate(upper);
        if (sameCenter) return best;
        // Stop pulling back once the route fits within 75% of a viewport.
        // Minimizing time alone favours a tiny pan and an unnecessarily wide
        // detour. Keep enough detail to make the sideways journey legible.
        // The site's overview floor also keeps tours inside the Home framing.
        // If either endpoint is already wider, respect it without a forced dive.
        const lower = Math.max(minZoom, Math.min(upper, Math.max(minOverviewZoom, 0.75 / distance)));
        const logUpper = Math.log(upper), logLower = Math.log(lower);
        if (logUpper === logLower) return best;
        const steps = 32, step = (logUpper - logLower) / steps;
        let bestIndex = 0;
        for (let i = 1; i <= steps; i++) {
            const trip = candidate(i === steps ? lower : Math.exp(logUpper - step * i));
            if (trip.duration < best.duration) { best = trip; bestIndex = i; }
        }
        // Refine the winning bracket, retaining the exact no-zoom candidate.
        let low = Math.max(logLower, logUpper - step * (bestIndex + 1));
        let high = Math.min(logUpper, logUpper - step * (bestIndex - 1));
        for (let i = 0; i < 14; i++) {
            const a = low + (high - low) / 3, b = high - (high - low) / 3;
            const first = candidate(Math.exp(a)), second = candidate(Math.exp(b));
            if (first.duration < best.duration) best = first;
            if (second.duration < best.duration) best = second;
            if (first.duration < second.duration) high = b;
            else low = a;
        }
        return best;
    }

    function sample(trip, progress) {
        if (progress <= 0) return { ...trip.start };
        if (progress >= 1 || !trip.tracks.length) return { ...trip.target };
        const { start, target } = trip;
        let x = start.x, y = start.y, zoom = start.zoom;
        for (const track of trip.tracks) {
            const t = clamp((progress - track.begin) / (track.end - track.begin));
            const eased = ease(t);
            if (track.kind === 'pan') {
                const fraction = math.fromNumber(eased);
                x = start.x + (target.x - start.x) * fraction / math.SCALE;
                y = start.y + (target.y - start.y) * fraction / math.SCALE;
            } else if (progress >= track.begin) {
                zoom = interpolateZoom(track.from, track.to, eased);
            }
        }
        return { x, y, zoom };
    }
    scope.CameraTravel = { plan, sample };
})(globalThis);
