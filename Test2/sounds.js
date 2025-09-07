// Global Howler from CDN
Howler.autoUnlock = true;
Howler.html5PoolSize = 10;

let sounds = {};
let customSounds = {};
const beepSrc = 'sounds/a.mp3';
const clickSrc = 'sounds/click.mp3';

function initSounds() {
    try {
        console.log('Initializing sounds...');
        sounds.beep = new Howl({
            src: [beepSrc],
            preload: true,
            volume: 0.5,
            html5: true,
            onplayerror: (id, err) => console.error('Play error:', err),
            onloaderror: (id, err) => console.error('Load error:', err)
        });
        sounds.click = new Howl({
            src: [clickSrc],
            preload: true,
            volume: 0.5,
            html5: true
        });
        Howler.volume(0.5);
        console.log('Sounds initialized');
    } catch (e) {
        console.error('Sound init failed:', e);
        if ('vibrate' in navigator) navigator.vibrate(200);
    }
}

function playSound(pattern, volume = 0.5, type = 'beep') {
    if (!settings.enableSounds || !sounds[type]) return;
    console.log(`Playing ${pattern} at volume ${volume}`);
    Howler.volume(volume);
    try {
        const id = sounds[type].play();
        switch (pattern) {
            case 'double':
                setTimeout(() => sounds[type].play(), 200);
                break;
            case 'triple':
                setTimeout(() => sounds[type].play(), 200);
                setTimeout(() => sounds[type].play(), 400);
                break;
            case 'chime':
                sounds[type].fade(0.2, 1, 500, id);
                setTimeout(() => sounds[type].play(), 300);
                setTimeout(() => sounds[type].play(), 600);
                setTimeout(() => sounds[type].play(), 900);
                break;
            default:
                break;
        }
    } catch (e) {
        console.error('Howler failed, using fallback:', e);
        const audio = document.getElementById(type === 'beep' ? 'beepFallback' : 'clickFallback');
        audio.volume = volume;
        audio.play();
        if (pattern === 'double') setTimeout(() => audio.play(), 200);
        if (pattern === 'triple') {
            setTimeout(() => audio.play(), 200);
            setTimeout(() => audio.play(), 400);
        }
        if (pattern === 'chime') {
            audio.play();
            setTimeout(() => audio.play(), 300);
            setTimeout(() => audio.play(), 600);
            setTimeout(() => audio.play(), 900);
        }
    }
}

function playClick(volume = 0.5) {
    if (settings.enableClicks) playSound('single', volume, 'click');
}

function uploadCustomSound(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        const name = file.name.split('.')[0];
        customSounds[name] = new Howl({ src: [e.target.result], preload: true, html5: true });
        showToast('Custom sound uploaded!');
    };
    reader.readAsDataURL(file);
}

function shouldPlayAlert(alertType) {
    return !escalationActive || ['break', 'meal'].includes(alertType.toLowerCase());
}