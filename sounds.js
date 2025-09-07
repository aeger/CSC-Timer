import { Howl, Howler } from 'howler'; // Assumes global from CDN, but for module

Howler.autoUnlock = true; // Handle mobile

let sounds = {};
let customSounds = {};
const beepSrc = 'sounds/a.mp3';
const clickSrc = 'sounds/click.mp3';

export function initSounds() {
    try {
        sounds.beep = new Howl({
            src: [beepSrc],
            preload: true,
            volume: 0.5,
            onplayerror: handlePlayError
        });
        sounds.click = new Howl({
            src: [clickSrc],
            preload: true,
            volume: 0.5
        });
        Howler.volume(0.5); // Global default
    } catch (e) {
        console.error('Sound init failed:', e);
        // Fallback to Notification or vibration if available
        if ('vibrate' in navigator) navigator.vibrate(200);
    }
}

function handlePlayError(soundId) {
    sounds.beep.once('unlock', () => sounds.beep.play(soundId));
}

export function playSound(pattern, volume = 0.5, type = 'beep') {
    if (!settings.enableSounds || !sounds[type]) return;
    Howler.volume(volume);
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
            sounds[type].fade(0.2, 1, 500, id); // Fade for chime effect
            setTimeout(() => sounds[type].play(), 300);
            setTimeout(() => sounds[type].play(), 600);
            setTimeout(() => sounds[type].play(), 900);
            break;
        default: // single
            break;
    }
}

export function playClick(volume = 0.5) {
    if (settings.enableClicks) playSound('single', volume, 'click');
}

export function uploadCustomSound(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        const name = file.name.split('.')[0];
        customSounds[name] = new Howl({ src: [e.target.result], preload: true });
        showToast('Custom sound uploaded!');
    };
    reader.readAsDataURL(file);
}

// Integrate with escalation: export function to check if should play
export function shouldPlayAlert(alertType) {
    return !escalationActive || ['break', 'meal'].includes(alertType.toLowerCase());
}