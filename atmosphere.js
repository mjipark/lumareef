// atmosphere.js - Real-time sky, weather and cinematic effects for the reef
//
// The reef follows the visitor's real sky: sunrise/sunset times and the
// current weather come from the Open-Meteo API (free, no key). From those,
// we blend between five looks -- night, dawn, day, golden hour, dusk -- and
// apply them to the sky gradient, fog, water, lights, clouds, glowing
// particles and island lanterns.
//
// Also adds the "immersive" layer: slow camera drift that follows the
// pointer, scroll / swipe down to dive to the tank, a giant word in the sky
// naming the time of day, and stars at night.
//
// Weather: Open-Meteo (temperature, clouds, sunrise/sunset) plus RainViewer
// radar for rain that's actually falling. Both are free and need no key.
//
// Demo overrides (handy for presenting): add ?sky=night (or dawn, day,
// golden, dusk) and/or ?weather=rain (or snow, clear) to the URL.
//
// Depends on globals from app.js: THREE, scene, clouds, waterMaterials,
// ambientLight, directionalLight, activeScene, isSubmerged. Load after app.js.

(function () {
    // ---- 1. Looks for each time of day ------------------------------------
    const LOOKS = {
        night: { // pastel night: periwinkle and lilac rather than black
            skyTop: '#5d6aa8', skyBottom: '#a9b4e0', fog: '#9aa7d8',
            water1: '#6f86c2', water2: '#8195cc',
            ambient: '#c9cff5', ambientI: 0.6, sun: '#dfe4ff', sunI: 0.3,
            cloud: '#c3c9ee', glow: 1.0, stars: 1.0, ink: 'light'
        },
        dawn: {
            skyTop: '#7d8fb8', skyBottom: '#f3c2a6', fog: '#e9c3b0',
            water1: '#7fa9b4', water2: '#94b9c0',
            ambient: '#ffd9c7', ambientI: 0.65, sun: '#ffb996', sunI: 0.5,
            cloud: '#fde3d6', glow: 0.35, stars: 0.15, ink: 'dark'
        },
        day: {
            skyTop: '#bfe6ea', skyBottom: '#9fd3d6', fog: '#a3d6d8',
            water1: '#76abae', water2: '#88bdbd',
            ambient: '#ffffff', ambientI: 0.75, sun: '#ffffff', sunI: 0.55,
            cloud: '#ffffff', glow: 0.0, stars: 0.0, ink: 'dark'
        },
        golden: {
            skyTop: '#9ec5d6', skyBottom: '#f6d29a', fog: '#f0d2a4',
            water1: '#7aa6a2', water2: '#9cb8a8',
            ambient: '#ffe6c2', ambientI: 0.7, sun: '#ffc27a', sunI: 0.65,
            cloud: '#fff1dc', glow: 0.2, stars: 0.0, ink: 'dark'
        },
        dusk: { // lilac to peach
            skyTop: '#8d86c9', skyBottom: '#f4b9a8', fog: '#d9aebb',
            water1: '#8a9fc6', water2: '#9eadcf',
            ambient: '#f0d2e2', ambientI: 0.6, sun: '#ffb7a0', sunI: 0.45,
            cloud: '#f6d3dc', glow: 0.7, stars: 0.4, ink: 'light'
        }
    };
    const PHASE_LABEL = { night: 'Night', dawn: 'Dawn', day: 'Day', golden: 'Golden hour', dusk: 'Dusk' };

    // Rough coordinates for common time zones, so we can ask for local
    // sunrise/sunset without a location permission prompt.
    const TZ_PLACES = {
        'Asia/Seoul': [37.57, 126.98, 'Seoul'], 'Asia/Tokyo': [35.68, 139.69, 'Tokyo'],
        'Asia/Bangkok': [13.76, 100.5, 'Bangkok'], 'Asia/Shanghai': [31.23, 121.47, 'Shanghai'],
        'Asia/Singapore': [1.35, 103.82, 'Singapore'], 'Asia/Hong_Kong': [22.32, 114.17, 'Hong Kong'],
        'Asia/Taipei': [25.03, 121.57, 'Taipei'], 'Asia/Kolkata': [28.61, 77.21, 'Delhi'],
        'Europe/London': [51.51, -0.13, 'London'], 'Europe/Paris': [48.86, 2.35, 'Paris'],
        'Europe/Berlin': [52.52, 13.4, 'Berlin'], 'America/New_York': [40.71, -74.01, 'New York'],
        'America/Chicago': [41.88, -87.63, 'Chicago'], 'America/Los_Angeles': [34.05, -118.24, 'Los Angeles'],
        'America/Toronto': [43.65, -79.38, 'Toronto'], 'Australia/Sydney': [-33.87, 151.21, 'Sydney']
    };

    const params = new URLSearchParams(location.search);
    const forcedPhase = LOOKS[params.get('sky')] ? params.get('sky') : null;
    const forcedWeather = params.get('weather'); // rain | snow | clear

    const state = {
        place: 'your sky', sunrise: null, sunset: null,
        temp: null, cloudCover: 0, weather: 'clear', weatherText: '',
        look: null, phase: 'day', nightFactor: 0,
        parallaxX: 0, parallaxY: 0
    };

    // ---- 2. Colour helpers ------------------------------------------------
    const c = hex => new THREE.Color(hex);
    function mixLook(a, b, t) {
        const out = {};
        for (const k in a) {
            if (typeof a[k] === 'number') out[k] = a[k] + (b[k] - a[k]) * t;
            else if (typeof a[k] === 'string' && a[k][0] === '#') out[k] = '#' + c(a[k]).lerp(c(b[k]), t).getHexString();
            else out[k] = t < 0.5 ? a[k] : b[k];
        }
        return out;
    }

    // ---- 3. Which look for a given moment? -------------------------------
    function fallbackSunTimes(now) {
        const d = new Date(now);
        const sr = new Date(d); sr.setHours(6, 20, 0, 0);
        const ss = new Date(d); ss.setHours(18, 40, 0, 0);
        return [sr.getTime(), ss.getTime()];
    }

    function lookFor(now) {
        if (forcedPhase) return { look: LOOKS[forcedPhase], phase: forcedPhase };
        let [sr, ss] = state.sunrise && state.sunset ? [state.sunrise, state.sunset] : fallbackSunTimes(now);
        const m = 60 * 1000;
        const keys = [
            [sr - 70 * m, 'night'], [sr, 'dawn'], [sr + 90 * m, 'day'],
            [ss - 100 * m, 'day'], [ss - 10 * m, 'golden'], [ss + 35 * m, 'dusk'], [ss + 100 * m, 'night']
        ];
        if (now <= keys[0][0] || now >= keys[keys.length - 1][0]) return { look: LOOKS.night, phase: 'night' };
        for (let i = 0; i < keys.length - 1; i++) {
            const [t0, p0] = keys[i], [t1, p1] = keys[i + 1];
            if (now >= t0 && now < t1) {
                const t = (now - t0) / (t1 - t0);
                return { look: mixLook(LOOKS[p0], LOOKS[p1], t), phase: t < 0.5 ? p0 : p1 };
            }
        }
        return { look: LOOKS.day, phase: 'day' };
    }

    // ---- 4. Real-time data: Open-Meteo -----------------------------------
    function describeWeather(code) {
        if (code == null) return ['clear', ''];
        if ([71, 73, 75, 77, 85, 86].includes(code)) return ['snow', 'Snow'];
        if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99].includes(code)) return ['rain', 'Rain'];
        if ([45, 48].includes(code)) return ['fog', 'Fog'];
        if (code >= 2) return ['clear', 'Cloudy'];
        return ['clear', 'Clear'];
    }

    function localIsoToEpoch(iso, offsetSec) {
        // Open-Meteo returns local wall-clock time ("2026-09-25T06:19") plus the offset
        const [d, t] = iso.split('T');
        const [y, mo, da] = d.split('-').map(Number);
        const [h, mi] = t.split(':').map(Number);
        return Date.UTC(y, mo - 1, da, h, mi) - offsetSec * 1000;
    }

    async function getCoords() {
        try {
            if (navigator.permissions) {
                const p = await navigator.permissions.query({ name: 'geolocation' });
                if (p.state === 'granted') {
                    const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { timeout: 4000 }));
                    return [pos.coords.latitude, pos.coords.longitude, 'your sky'];
                }
            }
        } catch (e) { /* fall through to time zone */ }
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        return TZ_PLACES[tz] || TZ_PLACES['Asia/Seoul'];
    }

    // Live rain from weather radar (RainViewer: free, no key). Forecast models
    // can say "0 mm" while it's pouring; radar sees rain that's actually falling.
    // We read the colour of the latest radar tile at the visitor's location.
    async function radarRainAt(lat, lon) {
        const maps = await fetch('https://api.rainviewer.com/public/weather-maps.json').then(r => r.json());
        const frames = maps.radar && maps.radar.past;
        if (!frames || !frames.length) return null;
        const frame = frames[frames.length - 1];
        const z = 7, n = 2 ** z;
        const xt = (lon + 180) / 360 * n;
        const yr = lat * Math.PI / 180;
        const yt = (1 - Math.log(Math.tan(yr) + 1 / Math.cos(yr)) / Math.PI) / 2 * n;
        const tx = Math.floor(xt), ty = Math.floor(yt);
        const px = Math.floor((xt - tx) * 256), py = Math.floor((yt - ty) * 256);
        const img = new Image();
        img.crossOrigin = 'anonymous';
        await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = `${maps.host}${frame.path}/256/${z}/${tx}/${ty}/2/0_0.png`; });
        const cv = document.createElement('canvas'); cv.width = cv.height = 256;
        const g = cv.getContext('2d'); g.drawImage(img, 0, 0);
        const d = g.getImageData(Math.max(px - 3, 0), Math.max(py - 3, 0), 7, 7).data;
        let wet = 0, warm = 0;
        for (let i = 0; i < d.length; i += 4) {
            if (d[i + 3] > 0) { wet++; if (d[i] > 200) warm++; } // yellow/red = heavier rain
        }
        const total = d.length / 4;
        if (wet / total < 0.3) return { raining: false };
        return { raining: true, heavy: warm / total > 0.4 };
    }

    async function fetchOpenMeteo(lat, lon) {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
            `&current=temperature_2m,cloud_cover,weather_code,precipitation&daily=sunrise,sunset&timezone=auto&forecast_days=1`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('Open-Meteo ' + res.status);
        const data = await res.json();
        const off = data.utc_offset_seconds || 0;
        state.sunrise = localIsoToEpoch(data.daily.sunrise[0], off);
        state.sunset = localIsoToEpoch(data.daily.sunset[0], off);
        state.temp = data.current ? Math.round(data.current.temperature_2m) : null;
        state.cloudCover = data.current ? data.current.cloud_cover / 100 : 0;
        let [kind, text] = describeWeather(data.current && data.current.weather_code);
        if (data.current && data.current.precipitation > 0 && kind === 'clear') { kind = 'rain'; text = 'Rain'; }
        state.weather = kind; state.weatherText = text;
        state.source = 'Open-Meteo';
    }

    async function fetchSky() {
        try {
            const [lat, lon, name] = await getCoords();
            state.place = name;
            await fetchOpenMeteo(lat, lon);
            try {
                const radar = await radarRainAt(lat, lon);
                if (radar && radar.raining) {
                    const cold = state.temp != null && state.temp <= 1;
                    state.weather = cold ? 'snow' : 'rain';
                    state.weatherText = cold ? 'Snow' : (radar.heavy ? 'Heavy rain' : 'Rain');
                    state.cloudCover = Math.max(state.cloudCover, 0.9);
                    state.source = 'radar';
                }
            } catch (radarErr) {
                console.info('[atmosphere] Radar unavailable, using the forecast only:', radarErr);
            }
        } catch (err) {
            console.warn('[atmosphere] Live sky unavailable, using the local clock:', err);
        }
        if (forcedWeather) { state.weather = forcedWeather; state.weatherText = forcedWeather[0].toUpperCase() + forcedWeather.slice(1); }
        applyLook();
        buildWeatherParticles();
    }

    // ---- 5. Scene additions ----------------------------------------------
    // Soft round sprite texture drawn on a canvas (no image file needed)
    function glowTexture() {
        const cv = document.createElement('canvas');
        cv.width = cv.height = 64;
        const g = cv.getContext('2d');
        const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
        grd.addColorStop(0, 'rgba(255,255,255,1)');
        grd.addColorStop(0.25, 'rgba(255,255,255,0.8)');
        grd.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
        return new THREE.CanvasTexture(cv);
    }
    const GLOW_TEX = glowTexture();

    // Fog lets the far ocean melt into the sky -- the single biggest depth cue
    scene.fog = new THREE.Fog(0xa3d6d8, 15, 30);

    // Floating plankton / motes around the island
    const MOTE_COUNT = 260;
    const moteGeo = new THREE.BufferGeometry();
    const motePos = new Float32Array(MOTE_COUNT * 3);
    const moteSeed = [];
    for (let i = 0; i < MOTE_COUNT; i++) {
        const r = 1 + Math.random() * 7, a = Math.random() * Math.PI * 2;
        motePos[i * 3] = 0.3 + Math.cos(a) * r;
        motePos[i * 3 + 1] = -1 + Math.random() * 4.5;
        motePos[i * 3 + 2] = 0.1 + Math.sin(a) * r;
        moteSeed.push({ speed: 0.08 + Math.random() * 0.25, phase: Math.random() * 6.28 });
    }
    moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
    const moteMat = new THREE.PointsMaterial({
        map: GLOW_TEX, size: 7 * Math.min(window.devicePixelRatio || 1, 2), sizeAttenuation: false,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        color: 0xbff7ef, opacity: 0.35, fog: false
    });
    const motes = new THREE.Points(moteGeo, moteMat);
    scene.add(motes);

    // Weather: rain streaks or snowflakes, only when the live data says so
    let weatherPoints = null;
    function buildWeatherParticles() {
        if (weatherPoints) { scene.remove(weatherPoints); weatherPoints = null; }
        if (state.weather === 'rain') {
            // Rain as thin slanted streaks (line segments), not dots
            const n = 700;
            const pos = new Float32Array(n * 6);
            for (let i = 0; i < n; i++) {
                const x = (Math.random() - 0.5) * 18, y = Math.random() * 10 - 1.5, z = (Math.random() - 0.5) * 18;
                pos.set([x, y, z, x + 0.03, y + 0.32, z + 0.03], i * 6);
            }
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
            weatherPoints = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({
                color: 0xe6f3f7, transparent: true, opacity: 0.55, depthWrite: false
            }));
            weatherPoints.userData.kind = 'rain';
            scene.add(weatherPoints);
            return;
        }
        if (state.weather !== 'snow') return;
        const n = 300;
        const geo = new THREE.BufferGeometry();
        const pos = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) {
            pos[i * 3] = (Math.random() - 0.5) * 16;
            pos[i * 3 + 1] = Math.random() * 9 - 1;
            pos[i * 3 + 2] = (Math.random() - 0.5) * 16;
        }
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        weatherPoints = new THREE.Points(geo, new THREE.PointsMaterial({
            map: GLOW_TEX, transparent: true, depthWrite: false, sizeAttenuation: false,
            size: 6 * Math.min(window.devicePixelRatio || 1, 2), color: 0xffffff, opacity: 0.8
        }));
        weatherPoints.userData.kind = 'snow';
        scene.add(weatherPoints);
    }

    // Island lanterns: small warm lights on the terraces that glow after dark,
    // echoing the lit windows in the start-screen illustration
    const lanterns = [];
    const lanternSpots = [[-0.1, -0.18, -0.9], [-0.9, -0.18, -0.05], [0.75, -0.48, -0.75], [1.2, -0.73, 0.5], [0.2, -0.18, -0.1]];
    lanternSpots.forEach(([x, y, z]) => {
        const core = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.06), new THREE.MeshBasicMaterial({ color: 0xfff1c4, transparent: true }));
        core.position.set(x, y, z);
        const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW_TEX, color: 0xffd98a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
        halo.scale.set(0.7, 0.7, 0.7);
        halo.position.copy(core.position);
        scene.add(core); scene.add(halo);
        lanterns.push({ core, halo, phase: Math.random() * 6.28 });
    });
    const lanternLight = new THREE.PointLight(0xffc98a, 0, 6);
    lanternLight.position.set(0, 0.6, 0);
    scene.add(lanternLight);

    // ---- 6. DOM layers: giant sky word, stars, sun/moon glow, live caption --
    const container = document.getElementById('canvas-container');
    const skyLayer = document.createElement('div');
    skyLayer.id = 'sky-layer';
    skyLayer.innerHTML = '<div id="sky-stars"></div><div id="sky-orb"></div>';
    container.appendChild(skyLayer);
    const skyWord = document.createElement('div');
    skyWord.id = 'sky-word';
    container.appendChild(skyWord);
    // Stars: many tiny box-shadows on one element (cheap, no canvas)
    const stars = [];
    for (let i = 0; i < 140; i++) {
        const x = Math.random() * 100, y = Math.random() * 70, s = Math.random() < 0.15 ? 2 : 1;
        stars.push(`${x}vw ${y}vh 0 ${s / 2}px rgba(255,255,255,${0.4 + Math.random() * 0.6})`);
    }
    document.getElementById('sky-stars').style.boxShadow = stars.join(',');

    const uiLayer = document.getElementById('ui-layer');
    const caption = document.createElement('div');
    caption.id = 'sky-caption';
    if (uiLayer) uiLayer.appendChild(caption);

    // Scroll cue at the bottom of the reef
    const cue = document.createElement('div');
    cue.id = 'dive-cue';
    cue.innerHTML = '<span>Scroll to dive</span><i></i>';
    document.body.appendChild(cue);

    // ---- 7. Apply the current look -----------------------------------------
    function applyLook() {
        const { look, phase } = lookFor(Date.now());
        // Heavy cloud cover or fog pulls the fog in closer and greys the sky a little
        const overcast = Math.max(state.cloudCover - 0.4, 0) / 0.6 + (state.weather === 'fog' ? 0.8 : 0) + (state.weather === 'rain' ? 0.4 : 0);
        const grey = Math.min(overcast, 1) * (state.weather === 'rain' ? 0.5 : 0.35);
        const greyed = hex => '#' + c(hex).lerp(c('#9aa9ad'), grey).getHexString();
        state.look = Object.assign({}, look, {
            skyTop: greyed(look.skyTop), skyBottom: greyed(look.skyBottom), fog: greyed(look.fog)
        });
        state.phase = phase;
        state.nightFactor = look.glow;
        state.fogFar = 30 - Math.min(overcast, 1) * 9;

        const L = state.look;
        // The far edge of the ocean dissolves into fog, so the visible sky
        // behind it starts at the fog colour -- no hard wedges in the corners.
        state.skyGradient = `linear-gradient(to bottom, ${L.fog} 0%, ${L.skyBottom} 100%)`;
        // The dive gets darker at night
        state.deepGradient = `linear-gradient(to bottom, #${c('#001524').lerp(c('#000814'), L.glow).getHexString()}, #${c('#003566').lerp(c('#06203a'), L.glow).getHexString()})`;

        scene.fog.color.set(L.fog);
        scene.fog.far = state.fogFar;
        ambientLight.color.set(L.ambient); ambientLight.intensity = L.ambientI;
        directionalLight.color.set(L.sun); directionalLight.intensity = L.sunI;
        [0, 1, 4, 5].forEach(i => waterMaterials[i].color.set(c(L.water1).multiplyScalar(0.8)));
        waterMaterials[3].color.set(c(L.water1).multiplyScalar(0.6));
        clouds.forEach(g => g.children.forEach(m => {
            m.material.color.set(state.weather === 'rain' ? greyed(L.cloud) : L.cloud);
            m.material.transparent = true;
            m.material.opacity = (L.glow > 0.8 ? 0.55 : 0.92) - Math.min(overcast, 1) * 0.15;
        }));
        moteMat.color.set(L.glow > 0.5 ? '#9ff7ea' : '#ffffff');

        document.body.classList.toggle('sky-dark', L.ink === 'light');
        document.documentElement.style.setProperty('--sky-top', L.skyTop);
        document.documentElement.style.setProperty('--sky-bottom', L.skyBottom);
        document.getElementById('sky-stars').style.opacity = L.stars * (1 - Math.min(state.cloudCover, 1) * 0.7);
        // The giant word names the weather when it's raining or snowing, otherwise the time of day
        const wordFor = { rain: 'Rain', snow: 'Snow', fog: 'Mist' }[state.weather];
        document.getElementById('sky-word').textContent = wordFor || (PHASE_LABEL[phase] === 'Golden hour' ? 'Golden' : PHASE_LABEL[phase]);

        // Sun or moon: a soft glow that travels across the sky through the day
        const orb = document.getElementById('sky-orb');
        let sr, ss; [sr, ss] = state.sunrise ? [state.sunrise, state.sunset] : fallbackSunTimes(Date.now());
        const dayT = Math.min(Math.max((Date.now() - sr) / (ss - sr), 0), 1);
        const isNight = phase === 'night' || (forcedPhase === 'night');
        orb.classList.toggle('moon', isNight);
        // Hide the sun/moon behind heavy cloud or rain
        orb.style.opacity = String(1 - Math.min(overcast, 1) * 0.9);
        if (state.weather === 'rain') ambientLight.intensity *= 0.85;
        const t = forcedPhase ? { dawn: 0.05, day: 0.5, golden: 0.9, dusk: 0.98, night: 0.3 }[forcedPhase] : (isNight ? 0.3 : dayT);
        orb.style.left = (12 + t * 76) + 'vw';
        orb.style.top = (30 - Math.sin(t * Math.PI) * 22) + 'vh';

        const time = new Date().toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
        const bits = [`${PHASE_LABEL[phase]} in ${state.place === 'your sky' ? 'your sky' : state.place}`, time];
        if (state.temp != null) bits.push(`${state.temp}°`);
        if (state.weatherText) bits.push(state.weatherText);
        caption.textContent = bits.join(' · ');
    }

    // Public hooks read by app.js's render loop
    window.LumaSky = state;

    // ---- 8. Pointer parallax ----------------------------------------------
    let targetPX = 0, targetPY = 0;
    window.addEventListener('pointermove', e => {
        targetPX = (e.clientX / window.innerWidth) * 2 - 1;
        targetPY = (e.clientY / window.innerHeight) * 2 - 1;
    }, { passive: true });
    window.addEventListener('deviceorientation', e => {
        if (e.gamma == null) return;
        targetPX = Math.max(-1, Math.min(1, e.gamma / 30));
        targetPY = Math.max(-1, Math.min(1, (e.beta - 45) / 30));
    }, { passive: true });

    // ---- 9. Scroll / swipe to dive and to surface ------------------------
    function overlayOpen() {
        const start = document.getElementById('start-overlay');
        if (start && !start.classList.contains('hidden') && !start.classList.contains('fade-out')) return true;
        return !!document.querySelector('.journal-page:not(.hidden), .side-panel:not(.hidden)');
    }
    let diveLock = false;
    function go(section) {
        if (diveLock) return;
        diveLock = true;
        setTimeout(() => { diveLock = false; }, 1600);
        const btn = document.querySelector(`.side-nav [data-nav="${section}"]`);
        if (btn) btn.click();
        document.body.classList.add('has-dived');
    }
    window.addEventListener('wheel', e => {
        if (overlayOpen() || Math.abs(e.deltaY) < 25 || Math.abs(e.deltaY) < Math.abs(e.deltaX)) return;
        if (e.deltaY > 0 && activeScene === 'reef' && !isSubmerged) go('sanctuary');
        else if (e.deltaY < 0 && activeScene === 'tank') go('home');
    }, { passive: true });
    let ty0 = null, tx0 = null;
    window.addEventListener('touchstart', e => { tx0 = e.touches[0].clientX; ty0 = e.touches[0].clientY; }, { passive: true });
    window.addEventListener('touchend', e => {
        if (ty0 == null || overlayOpen()) return;
        const dy = e.changedTouches[0].clientY - ty0, dx = e.changedTouches[0].clientX - tx0;
        ty0 = null;
        if (Math.abs(dy) < 70 || Math.abs(dy) < Math.abs(dx) * 1.5) return;
        if (dy < 0 && activeScene === 'reef' && !isSubmerged) go('sanctuary');  // finger up = dive
        else if (dy > 0 && activeScene === 'tank') go('home');                // finger down = surface
    }, { passive: true });

    // ---- 10. Per-frame animation (called from app.js) ---------------------
    const clock = new THREE.Clock();
    state.tick = function () {
        const t = clock.getElapsedTime();
        state.parallaxX += (targetPX - state.parallaxX) * 0.035;
        state.parallaxY += (targetPY - state.parallaxY) * 0.035;

        const p = moteGeo.attributes.position.array;
        for (let i = 0; i < MOTE_COUNT; i++) {
            const s = moteSeed[i];
            p[i * 3 + 1] += s.speed * 0.004;
            p[i * 3] += Math.sin(t * 0.6 + s.phase) * 0.0015;
            if (p[i * 3 + 1] > 3.6) p[i * 3 + 1] = -1.1;
        }
        moteGeo.attributes.position.needsUpdate = true;
        moteMat.size = (4 + state.nightFactor * 3) * Math.min(window.devicePixelRatio || 1, 2);
        moteMat.opacity = 0.07 + state.nightFactor * 0.7 + Math.sin(t * 0.8) * 0.04;

        if (weatherPoints) {
            const wp = weatherPoints.geometry.attributes.position.array;
            if (weatherPoints.userData.kind === 'rain') {
                for (let i = 0; i < wp.length; i += 6) {
                    wp[i] -= 0.012; wp[i + 3] -= 0.012;          // slight wind slant
                    wp[i + 1] -= 0.16; wp[i + 4] -= 0.16;
                    if (wp[i + 1] < -1.2) {
                        const x = (Math.random() - 0.5) * 18, z = (Math.random() - 0.5) * 18;
                        wp[i] = x; wp[i + 1] = 8.5; wp[i + 2] = z;
                        wp[i + 3] = x + 0.03; wp[i + 4] = 8.82; wp[i + 5] = z + 0.03;
                    }
                }
            } else {
                for (let i = 0; i < wp.length; i += 3) {
                    wp[i + 1] -= 0.012;
                    wp[i] += Math.sin(t + i) * 0.003;
                    if (wp[i + 1] < -1.2) wp[i + 1] = 8;
                }
            }
            weatherPoints.geometry.attributes.position.needsUpdate = true;
        }

        const g = state.nightFactor;
        lanterns.forEach(l => {
            const flicker = 0.85 + Math.sin(t * 2.2 + l.phase) * 0.1 + Math.sin(t * 5.3 + l.phase) * 0.05;
            l.core.material.opacity = 0.25 + g * 0.75;
            l.halo.material.opacity = g * 0.9 * flicker;
        });
        lanternLight.intensity = g * 1.1;

        document.getElementById('sky-word').classList.toggle('show', activeScene === 'reef' && !isSubmerged);
        document.getElementById('dive-cue').classList.toggle('show',
            activeScene === 'reef' && !isSubmerged && !overlayOpen() && document.querySelector('.side-nav.visible') !== null);
    };

    applyLook();
    fetchSky();
    setInterval(applyLook, 60 * 1000);      // follow the clock
    setInterval(fetchSky, 10 * 60 * 1000);  // refresh the weather every 10 minutes
})();
