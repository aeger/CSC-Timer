let schedule = {};
let currentStatus = 'None';
let escalationActive = false;
let lastAcknowledgedEvent = null;
let userInteracted = false;
const settings = {
    leadTime: 5,
    firstWarn: 2,
    secondWarn: 5,
    enableSounds: true,
    sounds: {
        leadTime: { enable: true, pattern: 'double', volume: 0.5 },
        atEvent: { enable: true, pattern: 'single', volume: 0.5 },
        firstWarn: { enable: true, pattern: 'triple', volume: 0.5 },
        secondWarn: { enable: true, pattern: 'chime', volume: 0.5 }
    },
    enableClicks: true,
    clickVolume: 0.5,
    timeFormat: '12',
    timeZone: 'America/Phoenix',
    notificationRequested: localStorage.getItem('notificationRequested') || false
};
let audioContext = new (window.AudioContext || window.webkitAudioContext)();
let audioInstances = new Set();
let soundDebounce = 0;

document.addEventListener('DOMContentLoaded', () => {
    loadData();
});

function loadData() {
    try {
        const profile = localStorage.getItem('currentProfile') || 'default';
        document.getElementById('profileSwitcher').value = profile;
        if (!schedule[profile] && localStorage.getItem(`schedule_${profile}`)) {
            schedule[profile] = JSON.parse(localStorage.getItem(`schedule_${profile}`)) || [];
        } else if (!schedule[profile]) {
            schedule[profile] = [];
        }
        if (localStorage.getItem('settings')) Object.assign(settings, JSON.parse(localStorage.getItem('settings')));
    } catch (e) {
        console.error('Invalid localStorage data, resetting to defaults:', e);
        schedule = { default: [] };
        settings.timeZone = 'America/Phoenix';
    }
    renderSchedule();
    updateUI();
}

document.addEventListener('click', () => {
    if (!userInteracted && audioContext.state === 'suspended') {
        audioContext.resume().then(() => {
            userInteracted = true;
        }).catch(err => console.error('Audio context resume failed:', err));
    }
}, { once: true });

function getCurrentTime() {
    return new Intl.DateTimeFormat('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: settings.timeFormat === '12',
        timeZone: settings.timeZone
    }).format(new Date());
}

function getCurrentDateTime() {
    return new Date(new Date().toLocaleString('en-US', { timeZone: settings.timeZone }));
}

function formatTime(timeStr) {
    const [hours, minutes] = timeStr.split(':');
    if (settings.timeFormat === '24') return `${hours}:${minutes}`;
    const date = new Date(`1970-01-01T${timeStr}`);
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

setInterval(() => {
    document.getElementById('currentTime').textContent = getCurrentTime();
    document.getElementById('timeZonePreview').textContent = `Preview: ${getCurrentTime()}`;
    if (userInteracted) {
        updateExpectedStatus();
        updateCountdown();
        checkAlerts();
        updateClockColor();
        updateProgressBar();
    }
    renderSchedule();
    updateTimeline();
}, 1000);

document.getElementById('addEvent').addEventListener('click', () => {
    const time = document.getElementById('eventTime').value;
    const type = document.getElementById('eventType').value;
    if (time && type) {
        const profile = document.getElementById('profileSwitcher').value;
        if (!schedule[profile]) schedule[profile] = [];
        schedule[profile].push({ time, type });
        schedule[profile].sort((a, b) => new Date(`1970-01-01T${a.time}`) - new Date(`1970-01-01T${b.time}`));
        saveData();
        renderSchedule();
        document.getElementById('eventTime').value = '';
        document.getElementById('saveChanges').style.display = 'none';
        document.getElementById('cancelChanges').style.display = 'none';
    }
});

document.getElementById('cancelChanges').addEventListener('click', () => {
    document.getElementById('eventTime').value = '';
    document.getElementById('saveChanges').style.display = 'none';
    document.getElementById('cancelChanges').style.display = 'none';
});

function renderSchedule() {
    const container = document.getElementById('scheduleCards');
    container.innerHTML = '';
    const now = getCurrentDateTime();
    const profile = document.getElementById('profileSwitcher').value;
    let scheduleData = schedule[profile] || [];
    let previousWasCurrent = false;
    scheduleData.forEach((event, i) => {
        const card = document.createElement('div');
        card.classList.add('schedule-card');
        const eventTime = new Date(now.toDateString() + ' ' + event.time);
        const diff = (eventTime - now) / 1000 / 60;
        let cardClass = '';
        if (diff < -settings.secondWarn) cardClass = 'overdue-card';
        else if (diff < -settings.firstWarn) cardClass = 'nearing-card';
        else cardClass = 'upcoming-card';
        card.classList.add(cardClass);
        if (event === getCurrentEvent()) {
            card.classList.add('current-card');
            if (!previousWasCurrent && settings.enableSounds && settings.sounds.atEvent.enable && !escalationActive) {
                playSound(settings.sounds.atEvent.pattern, settings.sounds.atEvent.volume);
            }
            previousWasCurrent = true;
        } else {
            previousWasCurrent = false;
        }
        card.innerHTML = `
            <p><strong>Time:</strong> ${formatTime(event.time)}</p>
            <p><strong>Type:</strong> ${event.type}</p>
            <button onclick="editEvent(${i})">Edit</button>
            <button onclick="deleteEvent(${i})">Delete</button>
        `;
        container.appendChild(card);
    });
}

function getCurrentEvent() {
    const now = getCurrentDateTime();
    const profile = document.getElementById('profileSwitcher').value;
    let currentEvent = null;
    let scheduleData = schedule[profile] || [];
    for (let event of scheduleData) {
        const eventTime = new Date(now.toDateString() + ' ' + event.time);
        if (eventTime <= now && (!currentEvent || eventTime > new Date(now.toDateString() + ' ' + currentEvent.time))) {
            currentEvent = event;
        }
    }
    return currentEvent;
}

function editEvent(i) {
    const profile = document.getElementById('profileSwitcher').value;
    const event = (schedule[profile] || [])[i];
    document.getElementById('eventTime').value = event.time;
    document.getElementById('eventType').value = event.type;
    document.getElementById('saveChanges').style.display = 'inline-block';
    document.getElementById('cancelChanges').style.display = 'inline-block';
    document.getElementById('saveChanges').onclick = () => {
        if (confirm('Save changes to this event?')) {
            const newTime = document.getElementById('eventTime').value;
            const newType = document.getElementById('eventType').value;
            if (newTime && newType) {
                schedule[profile][i] = { time: newTime, type: newType };
                schedule[profile].sort((a, b) => new Date(`1970-01-01T${a.time}`) - new Date(`1970-01-01T${b.time}`));
                saveData();
                renderSchedule();
                document.getElementById('eventTime').value = '';
                document.getElementById('saveChanges').style.display = 'none';
                document.getElementById('cancelChanges').style.display = 'none';
            }
        }
    };
}

function deleteEvent(i) {
    const profile = document.getElementById('profileSwitcher').value;
    schedule[profile].splice(i, 1);
    saveData();
    renderSchedule();
}

function updateExpectedStatus() {
    const now = getCurrentDateTime();
    const profile = document.getElementById('profileSwitcher').value;
    let expected = 'None';
    let pastEnd = true;
    let lastRelevantEvent = null;
    let startShiftFound = false;
    let scheduleData = schedule[profile] || [];
    for (let event of scheduleData) {
        const eventTime = new Date(now.toDateString() + ' ' + event.time);
        if (eventTime > now) {
            pastEnd = false;
            break;
        }
        if (event.type === 'Start Shift') {
            startShiftFound = true;
        } else if (startShiftFound && lastRelevantEvent && Math.abs((eventTime - new Date(now.toDateString() + ' ' + lastRelevantEvent.time)) / 1000 / 60) < 1) {
            lastRelevantEvent = event;
        } else {
            lastRelevantEvent = event;
        }
    }
    if (lastRelevantEvent) expected = lastRelevantEvent.type;
    if (pastEnd) expected = 'You are not scheduled to work at this time';
    document.getElementById('expectedStatus').textContent = expected;
    updateStatusColors(expected);
    updateClockColor();
}

function updateCountdown() {
    const now = getCurrentDateTime();
    const profile = document.getElementById('profileSwitcher').value;
    let nextEvent = null;
    let minDiff = Infinity;
    let scheduleData = schedule[profile] || [];
    for (let event of scheduleData) {
        const eventTime = new Date(now.toDateString() + ' ' + event.time);
        const diff = (eventTime - now) / 1000;
        if (diff >= 0 && diff < minDiff) {
            minDiff = diff;
            nextEvent = event;
        }
    }
    const countdownElement = document.getElementById('countdown');
    if (nextEvent) {
        const minutes = Math.floor(minDiff / 60);
        const seconds = Math.floor(minDiff % 60);
        countdownElement.textContent = `${minutes}:${seconds < 10 ? '0' : ''}${seconds} mins (${nextEvent.type})`;
        let colorClass = '';
        if (minutes <= settings.leadTime) colorClass = 'yellow';
        if (minutes <= settings.firstWarn) colorClass = 'red';
        countdownElement.className = 'countdown-text ' + (lastAcknowledgedEvent === getCurrentEvent() ? 'green' : colorClass);
    } else {
        countdownElement.textContent = '--';
        countdownElement.className = 'countdown-text';
    }
}

function checkAlerts() {
    const now = getCurrentDateTime();
    const profile = document.getElementById('profileSwitcher').value;
    let scheduleData = schedule[profile] || [];
    scheduleData.forEach(event => {
        const eventTime = new Date(now.toDateString() + ' ' + event.time);
        const diff = (now - eventTime) / 1000 / 60;
        if (diff > settings.secondWarn && settings.enableSounds && settings.sounds.secondWarn.enable && !escalationActive || (event.type === 'Break' || event.type === 'Meal')) {
            playSound(settings.sounds.secondWarn.pattern, settings.sounds.secondWarn.volume);
        }
    });
}

function updateClockColor() {
    const clock = document.getElementById('currentTime');
    const statusElem = document.getElementById('expectedStatus');
    const countdownElem = document.getElementById('countdown');
    const currentEvent = getCurrentEvent();
    if (!currentEvent) {
        clock.classList.remove('green', 'yellow', 'red');
        statusElem.classList.remove('green', 'yellow', 'red');
        countdownElem.classList.remove('green', 'yellow', 'red');
        return;
    }
    const now = getCurrentDateTime();
    const eventTime = new Date(now.toDateString() + ' ' + currentEvent.time);
    const diff = (now - eventTime) / 1000 / 60;
    let colorClass = '';
    if (currentStatus === currentEvent.type && lastAcknowledgedEvent === currentEvent) {
        colorClass = 'green';
    } else if (diff > settings.secondWarn) {
        colorClass = 'red';
    } else if (diff > settings.firstWarn) {
        colorClass = 'yellow';
    } else {
        colorClass = 'red';
    }
    clock.classList.remove('green', 'yellow', 'red');
    clock.classList.add(colorClass);
    statusElem.classList.remove('green', 'yellow', 'red');
    statusElem.classList.add(colorClass);
    countdownElem.classList.remove('green', 'yellow', 'red');
    countdownElem.classList.add(colorClass);
    updateStatusIcon(colorClass);
}

function updateStatusIcon(colorClass) {
    const icon = document.querySelector('.status-icon');
    icon.innerHTML = '';
    let svg = '';
    if (colorClass === 'green') svg = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>';
    else if (colorClass === 'yellow') svg = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>';
    icon.innerHTML = svg;
}

function updateProgressBar() {
    const now = getCurrentDateTime();
    const profile = document.getElementById('profileSwitcher').value;
    let nextEvent = null;
    let minDiff = Infinity;
    let scheduleData = schedule[profile] || [];
    for (let event of scheduleData) {
        const eventTime = new Date(now.toDateString() + ' ' + event.time);
        const diff = (eventTime - now) / 1000;
        if (diff >= 0 && diff < minDiff) {
            minDiff = diff;
            nextEvent = event;
        }
    }
    if (nextEvent) {
        const totalSeconds = minDiff;
        const progress = (totalSeconds / (settings.leadTime * 60)) * 100 || 0;
        document.documentElement.style.setProperty('--progress', `${progress}%`);
    } else {
        document.documentElement.style.setProperty('--progress', '0%');
    }
}

function updateTimeline() {
    const timeline = document.getElementById('timeline');
    timeline.innerHTML = '';
    const now = getCurrentDateTime();
    const profile = document.getElementById('profileSwitcher').value;
    let scheduleData = schedule[profile] || [];
    let previousTime = now;
    scheduleData.forEach(event => {
        const eventTime = new Date(now.toDateString() + ' ' + event.time);
        const diff = (eventTime - previousTime) / 1000 / 60;
        let color = '#28a745';
        if (eventTime < now) color = '#dc3545';
        const bar = document.createElement('div');
        bar.className = 'timeline-bar';
        bar.style.backgroundColor = color;
        bar.style.width = `${Math.max(50, diff * 2)}px`;
        bar.setAttribute('data-label', `${formatTime(event.time)} - ${event.type}`);
        bar.addEventListener('click', () => {
            const index = scheduleData.indexOf(event);
            document.getElementById('scheduleCards').children[index]?.scrollIntoView({ behavior: 'smooth' });
        });
        timeline.appendChild(bar);
        previousTime = eventTime;
    });
}

function updateStatusColors(expected) {
    document.querySelectorAll('.status').forEach(btn => {
        btn.classList.remove('green-bg', 'orange-bg', 'yellow-bg', 'blue-bg', 'red-bg', 'purple-bg', 'teal-bg');
        if (btn.dataset.type === currentStatus) {
            if (btn.dataset.type === 'On Queue') btn.classList.add('green-bg');
            else if (btn.dataset.type === 'Available') btn.classList.add('orange-bg');
            else if (btn.dataset.type === 'Break') btn.classList.add('yellow-bg');
            else if (btn.dataset.type === 'Meal') btn.classList.add('blue-bg');
            else if (btn.dataset.type === 'Meeting') btn.classList.add('teal-bg');
            else if (btn.dataset.type === 'Busy') btn.classList.add('red-bg');
            else if (btn.dataset.type === 'Shift End') btn.classList.add('red-bg');
            else if (btn.dataset.type === 'C2C') btn.classList.add('purple-bg');
        }
    });
    updateClockColor();
}

function playSound(pattern, volume, ignoreClick = false) {
    if (Date.now() - soundDebounce < 2000 || !settings.enableSounds || !userInteracted) return;
    soundDebounce = Date.now();
    const audioFile = './sounds/click.mp3'; // Use existing click.mp3 for all patterns
    const audio = new Audio(audioFile);
    audio.volume = volume;
    audio.oncanplaythrough = () => audio.play().catch(e => {
        console.error('Audio play failed:', e);
        alert('Audio file not found or unsupported. Please ensure "click.mp3" is in the sounds folder.');
    });
    audio.onerror = () => {
        console.error(`Failed to load ${audioFile}`);
        alert('Audio file not found. Please add "click.mp3" to the sounds folder.');
    };
    if (pattern === 'double') {
        setTimeout(() => audio.play(), 300);
    } else if (pattern === 'triple') {
        setTimeout(() => audio.play(), 300);
        setTimeout(() => audio.play(), 600);
    }
}

document.getElementById('toggleSettings').addEventListener('click', () => {
    console.log('Toggle clicked');
    const panel = document.getElementById('settingsPanel');
    if (panel) {
        panel.classList.toggle('show');
    } else {
        console.error('Settings panel not found');
    }
});

document.getElementById('muteAll').addEventListener('click', () => {
    settings.enableSounds = false;
    document.getElementById('enableSounds').checked = false;
    document.querySelector('.speaker').classList.add('muted');
    saveData();
    document.getElementById('muteAll').style.display = 'none';
});

document.querySelectorAll('.status').forEach(btn => {
    btn.addEventListener('click', () => {
        currentStatus = btn.dataset.type;
        const currentEvent = getCurrentEvent();
        if (currentStatus === currentEvent?.type) {
            lastAcknowledgedEvent = currentEvent;
        }
        updateStatusColors();
        updateClockColor();
        if (settings.enableClicks) playSound('single', settings.clickVolume);
    });
});

document.getElementById('profileSwitcher').addEventListener('change', (e) => {
    const newProfile = e.target.value;
    if (confirm('Switch profile? Unsaved changes may be lost.')) {
        localStorage.setItem('currentProfile', newProfile);
        loadData();
        renderSchedule();
        document.getElementById('scheduleCards').classList.add('fadeIn');
        setTimeout(() => document.getElementById('scheduleCards').classList.remove('fadeIn'), 500);
    } else {
        e.target.value = localStorage.getItem('currentProfile') || 'default';
    }
});

document.getElementById('addSchedule').addEventListener('click', () => {
    document.getElementById('newScheduleInput').style.display = 'flex';
});

document.getElementById('confirmAddProfile').addEventListener('click', () => {
    const newProfile = document.getElementById('newProfileInput').value.trim();
    if (newProfile && !schedule[newProfile]) {
        schedule[newProfile] = [];
        const option = document.createElement('option');
        option.value = newProfile;
        option.textContent = newProfile.charAt(0).toUpperCase() + newProfile.slice(1) + ' Schedule';
        document.getElementById('profileSwitcher').appendChild(option);
        document.getElementById('profileSwitcher').value = newProfile;
        localStorage.setItem('currentProfile', newProfile);
        document.getElementById('newProfileInput').value = '';
        document.getElementById('newScheduleInput').style.display = 'none';
        saveData();
        renderSchedule();
    } else {
        alert('Schedule name invalid or already exists.');
    }
});

document.getElementById('cancelAddProfile').addEventListener('click', () => {
    document.getElementById('newProfileInput').value = '';
    document.getElementById('newScheduleInput').style.display = 'none';
});

document.getElementById('createCustomSchedule').addEventListener('click', () => {
    const newProfile = prompt('Enter new custom schedule name:');
    if (newProfile && !schedule[newProfile]) {
        schedule[newProfile] = [];
        const option = document.createElement('option');
        option.value = newProfile;
        option.textContent = newProfile.charAt(0).toUpperCase() + newProfile.slice(1) + ' Schedule';
        document.getElementById('profileSwitcher').appendChild(option);
        document.getElementById('profileSwitcher').value = newProfile;
        localStorage.setItem('currentProfile', newProfile);
        saveData();
        renderCustomSchedules();
    } else {
        alert('Invalid or existing schedule name.');
    }
});

document.getElementById('lightTheme').addEventListener('click', () => {
    document.body.classList.remove('dark');
    document.body.classList.add('light');
    document.getElementById('darkTheme').classList.remove('active');
    document.getElementById('lightTheme').classList.add('active');
    saveData();
});

document.getElementById('darkTheme').addEventListener('click', () => {
    document.body.classList.remove('light');
    document.body.classList.add('dark');
    document.getElementById('lightTheme').classList.remove('active');
    document.getElementById('darkTheme').classList.add('active');
    saveData();
});

document.getElementById('timeFormat').addEventListener('change', e => {
    settings.timeFormat = e.target.value;
    saveData();
    renderSchedule();
});

document.getElementById('leadTimeSlider').addEventListener('input', e => {
    settings.leadTime = parseInt(e.target.value);
    document.getElementById('leadTime').value = settings.leadTime;
    saveData();
});
document.getElementById('leadTime').addEventListener('change', e => {
    settings.leadTime = parseInt(e.target.value);
    document.getElementById('leadTimeSlider').value = settings.leadTime;
    saveData();
});

document.getElementById('timeZone').addEventListener('change', e => {
    settings.timeZone = e.target.value;
    saveData();
    document.getElementById('currentTimeZone').textContent = `Current: ${settings.timeZone}`;
    renderSchedule();
});

document.getElementById('enableSounds').addEventListener('change', e => {
    settings.enableSounds = e.target.checked;
    document.querySelector('.speaker').classList.toggle('muted', !e.target.checked);
    if (settings.enableSounds) document.getElementById('muteAll').style.display = 'inline-block';
    else document.getElementById('muteAll').style.display = 'none';
    saveData();
});
document.querySelectorAll('.sound-enable').forEach(cb => {
    cb.addEventListener('change', e => {
        settings.sounds[cb.dataset.alert].enable = e.target.checked;
        saveData();
    });
});
document.querySelectorAll('.sound-pattern').forEach(sel => {
    sel.addEventListener('change', e => {
        settings.sounds[sel.dataset.alert].pattern = e.target.value;
        saveData();
    });
});
document.querySelectorAll('.sound-volume').forEach(range => {
    range.addEventListener('change', e => {
        settings.sounds[range.dataset.alert].volume = parseFloat(e.target.value);
        saveData();
    });
});
document.getElementById('uploadSound').addEventListener('click', () => {
    const file = document.getElementById('soundUpload').files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = e => {
            const soundName = file.name;
            localStorage.setItem(`customSound_${soundName}`, e.target.result);
            const option = document.createElement('option');
            option.value = soundName;
            document.getElementById('clickSoundSelect').appendChild(option);
            alert('Sound uploaded (simulated). Refresh to apply.');
        };
        reader.readAsDataURL(file);
    }
});
document.querySelectorAll('.preview-sound').forEach(btn => {
    btn.addEventListener('click', e => {
        const alert = e.target.dataset.alert;
        if (settings.sounds[alert].enable) playSound(settings.sounds[alert].pattern, settings.sounds[alert].volume, true);
    });
});

document.getElementById('enableClicks').addEventListener('change', e => {
    settings.enableClicks = e.target.checked;
    if (settings.enableClicks) document.getElementById('muteAll').style.display = 'inline-block';
    else document.getElementById('muteAll').style.display = 'none';
    saveData();
});
document.getElementById('clickVolume').addEventListener('change', e => {
    settings.clickVolume = parseFloat(e.target.value);
    saveData();
});
document.getElementById('clickPreview').addEventListener('click', () => {
    if (settings.enableClicks) playSound(document.getElementById('clickSoundSelect').value, settings.clickVolume);
});

document.getElementById('sidebarMode').addEventListener('change', e => {
    document.body.classList.toggle('sidebar', e.target.checked);
});
document.getElementById('pinSidebar').addEventListener('click', () => {
    alert('Pin to sidebar via browser settings. In Edge, use "Pin to taskbar" or sidebar extensions.');
});
document.getElementById('installApp').addEventListener('click', () => {
    if ('serviceWorker' in navigator && 'Notification' in window) {
        navigator.serviceWorker.register('./sw.js').then(reg => {
            reg.pushManager.subscribe({ userVisibleOnly: true });
            alert('App installed! Enable notifications in browser settings. In Edge, use "Add to taskbar" or PWA install prompt.');
        }).catch(err => console.error('Service Worker registration failed:', err));
    } else {
        alert('Install via browser: click "Add to Home Screen" or install icon');
    }
});

document.getElementById('exportSchedule').addEventListener('click', () => {
    const profile = document.getElementById('profileSwitcher').value;
    const blob = new Blob([JSON.stringify(schedule[profile])], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `schedule_${profile}.json`;
    a.click();
    URL.revokeObjectURL(url);
});
document.getElementById('importSchedule').addEventListener('click', () => {
    const file = document.getElementById('importFile').files[0];
    const profile = document.getElementById('profileSwitcher').value;
    if (file) {
        const reader = new FileReader();
        reader.onload = e => {
            try {
                schedule[profile] = JSON.parse(e.target.result);
                saveData();
                renderSchedule();
            } catch (err) {
                alert('Invalid schedule file');
            }
        };
        reader.readAsText(file);
    } else {
        alert('Please select a file to import');
    }
});
document.getElementById('resetApp').addEventListener('click', () => {
    if (confirm('Reset all data?')) {
        localStorage.clear();
        location.reload();
    }
});

document.getElementById('openWeekPlanner').addEventListener('click', () => {
    const modal = document.getElementById('weekPlannerModal');
    modal.style.display = 'block';
    modal.setAttribute('tabindex', '-1');
    modal.focus();
    renderWeekPlanner();
});

document.getElementById('closeModal').addEventListener('click', () => {
    document.getElementById('weekPlannerModal').style.display = 'none';
});

document.getElementById('addDailyPlannerEvent').addEventListener('click', () => {
    const time = document.getElementById('dailyPlannerEventTime').value;
    const type = document.getElementById('dailyPlannerEventType').value;
    const selectedDay = document.querySelector('#weekTable td.selected');
    if (time && type && selectedDay) {
        const profile = selectedDay.dataset.day === 'tue' ? 'default' : selectedDay.dataset.day;
        if (!schedule[profile]) schedule[profile] = [];
        schedule[profile].push({ time, type });
        schedule[profile].sort((a, b) => new Date(`1970-01-01T${a.time}`) - new Date(`1970-01-01T${b.time}`));
        saveData();
        renderWeekPlanner();
        document.getElementById('dailyPlannerEventTime').value = '';
    } else {
        alert('Select a day and enter event details.');
    }
});

document.getElementById('addCustomPlannerEvent').addEventListener('click', () => {
    const time = document.getElementById('customPlannerEventTime').value;
    const type = document.getElementById('customPlannerEventType').value;
    const selectedProfile = document.querySelector('#customSchedulesList div.selected');
    if (time && type && selectedProfile) {
        const profile = selectedProfile.dataset.profile;
        if (!schedule[profile]) schedule[profile] = [];
        schedule[profile].push({ time, type });
        schedule[profile].sort((a, b) => new Date(`1970-01-01T${a.time}`) - new Date(`1970-01-01T${b.time}`));
        saveData();
        renderCustomSchedules();
        document.getElementById('customPlannerEventTime').value = '';
    } else {
        alert('Select a custom schedule and enter event details.');
    }
});

document.getElementById('createCustomSchedule').addEventListener('click', () => {
    const newProfile = prompt('Enter new custom schedule name:');
    if (newProfile && !schedule[newProfile]) {
        schedule[newProfile] = [];
        const option = document.createElement('option');
        option.value = newProfile;
        option.textContent = newProfile.charAt(0).toUpperCase() + newProfile.slice(1) + ' Schedule';
        document.getElementById('profileSwitcher').appendChild(option);
        document.getElementById('profileSwitcher').value = newProfile;
        localStorage.setItem('currentProfile', newProfile);
        saveData();
        renderCustomSchedules();
    } else {
        alert('Invalid or existing schedule name.');
    }
});

document.getElementById('dailyTab').addEventListener('click', () => {
    document.getElementById('dailyPlanner').style.display = 'block';
    document.getElementById('customPlanner').style.display = 'none';
    document.getElementById('dailyTab').classList.add('active');
    document.getElementById('customTab').classList.remove('active');
    renderWeekPlanner();
});

document.getElementById('customTab').addEventListener('click', () => {
    document.getElementById('dailyPlanner').style.display = 'none';
    document.getElementById('customPlanner').style.display = 'block';
    document.getElementById('dailyTab').classList.remove('active');
    document.getElementById('customTab').classList.add('active');
    renderCustomSchedules();
});

function renderCustomSchedules() {
    const list = document.getElementById('customSchedulesList');
    list.innerHTML = '';
    Object.keys(schedule).forEach(profile => {
        if (profile !== 'default' && profile !== 'monday' && profile !== 'weekend') {
            const div = document.createElement('div');
            div.textContent = profile;
            div.dataset.profile = profile;
            div.addEventListener('click', () => {
                document.querySelectorAll('#customSchedulesList div').forEach(d => d.classList.remove('selected'));
                div.classList.add('selected');
                document.getElementById('profileSwitcher').value = profile;
                renderSchedule();
            });
            const scheduleDiv = document.createElement('div');
            scheduleDiv.className = 'custom-schedule-content';
            if (schedule[profile]) {
                schedule[profile].forEach((event, i) => {
                    const eventDiv = document.createElement('div');
                    eventDiv.className = 'event-item';
                    eventDiv.textContent = `${formatTime(event.time)} - ${event.type}`;
                    eventDiv.dataset.time = event.time;
                    eventDiv.dataset.type = event.type;
                    eventDiv.dataset.index = i;
                    eventDiv.addEventListener('dblclick', () => editPlannerEvent(profile, i, eventDiv));
                    scheduleDiv.appendChild(eventDiv);
                });
            }
            div.appendChild(scheduleDiv);
            list.appendChild(div);
        }
    });
}

// Add day selection in planner
document.querySelectorAll('#weekTable td').forEach(td => {
    td.addEventListener('click', () => {
        document.querySelectorAll('#weekTable td').forEach(t => t.classList.remove('selected'));
        td.classList.add('selected');
    });
});

function renderWeekPlanner() {
    const table = document.getElementById('weekTable');
    const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
    days.forEach(day => {
        const cell = table.querySelector(`td[data-day="${day}"]`);
        cell.innerHTML = '';
        const profile = day === 'tue' ? 'default' : day;
        if (schedule[profile]) {
            schedule[profile].forEach((event, i) => {
                const eventDiv = document.createElement('div');
                eventDiv.className = 'event-item';
                eventDiv.textContent = `${formatTime(event.time)} - ${event.type}`;
                eventDiv.dataset.time = event.time;
                eventDiv.dataset.type = event.type;
                eventDiv.dataset.index = i;
                eventDiv.addEventListener('dblclick', () => editPlannerEvent(profile, i, eventDiv));
                cell.appendChild(eventDiv);
            });
        }
    });
    new Sortable(table, {
        animation: 150,
        onEnd: function (evt) {
            const item = evt.item;
            const fromCell = evt.from;
            const toCell = evt.to;
            const fromDay = fromCell.dataset.day;
            const toDay = toCell.dataset.day;
            const profileFrom = fromDay === 'tue' ? 'default' : fromDay;
            const profileTo = toDay === 'tue' ? 'default' : toDay;
            if (!schedule[profileFrom]) schedule[profileFrom] = [];
            if (!schedule[profileTo]) schedule[profileTo] = [];
            const event = {
                time: item.dataset.time,
                type: item.dataset.type
            };
            const index = schedule[profileFrom].findIndex(e => e.time === event.time && e.type === event.type);
            if (index !== -1) {
                schedule[profileFrom].splice(index, 1);
                schedule[profileTo].push(event);
                saveData();
                renderWeekPlanner();
            }
        },
        group: 'shared'
    });
}

function editPlannerEvent(profile, i, div) {
    const inputTime = document.createElement('input');
    inputTime.type = 'time';
    inputTime.value = schedule[profile][i].time;
    const selectType = document.createElement('select');
    const options = ['Start Shift', 'Available', 'Break', 'Busy', 'C2C', 'Meal', 'Meeting', 'On Queue', 'Shift End'];
    options.forEach(opt => {
        const option = document.createElement('option');
        option.value = opt;
        option.textContent = opt;
        selectType.appendChild(option);
    });
    selectType.value = schedule[profile][i].type;
    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'Save';
    saveBtn.addEventListener('click', () => {
        schedule[profile][i] = { time: inputTime.value, type: selectType.value };
        saveData();
        renderWeekPlanner();
    });
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => {
        renderWeekPlanner();
    });
    div.innerHTML = '';
    div.appendChild(inputTime);
    div.appendChild(selectType);
    div.appendChild(saveBtn);
    div.appendChild(cancelBtn);
}

function updateUI() {
    document.getElementById('leadTime').value = settings.leadTime;
    document.getElementById('leadTimeSlider').value = settings.leadTime;
    document.getElementById('firstWarn').value = settings.firstWarn;
    document.getElementById('firstWarnSlider').value = settings.firstWarn;
    document.getElementById('secondWarn').value = settings.secondWarn;
    document.getElementById('secondWarnSlider').value = settings.secondWarn;
    document.getElementById('enableSounds').checked = settings.enableSounds;
    document.querySelector('.speaker').classList.toggle('muted', !settings.enableSounds);
    document.getElementById('enableClicks').checked = settings.enableClicks;
    document.getElementById('clickVolume').value = settings.clickVolume;
    document.getElementById('timeFormat').value = settings.timeFormat;
    document.getElementById('timeZone').value = settings.timeZone;
    document.querySelectorAll('.sound-enable').forEach(cb => cb.checked = settings.sounds[cb.dataset.alert].enable);
    document.querySelectorAll('.sound-pattern').forEach(sel => sel.value = settings.sounds[sel.dataset.alert].pattern);
    document.querySelectorAll('.sound-volume').forEach(range => range.value = settings.sounds[range.dataset.alert].volume);
    document.getElementById('lightTheme').classList.toggle('active', document.body.className.includes('light'));
    document.getElementById('darkTheme').classList.toggle('active', document.body.className.includes('dark'));
    document.getElementById('currentTimeZone').textContent = `Current: ${settings.timeZone}`;
}

function saveData() {
    const profile = document.getElementById('profileSwitcher').value;
    localStorage.setItem(`schedule_${profile}`, JSON.stringify(schedule[profile]));
    localStorage.setItem('settings', JSON.stringify(settings));
    localStorage.setItem('currentProfile', profile);
}

document.getElementById('managerEscalation').addEventListener('click', () => {
    escalationActive = !escalationActive;
    const btn = document.getElementById('managerEscalation');
    btn.textContent = escalationActive ? 'Deactivate Manager Escalation' : 'Activate Manager Escalation';
    btn.classList.toggle('red-bg', escalationActive);
    if (settings.enableClicks) playSound('single', settings.clickVolume);
});