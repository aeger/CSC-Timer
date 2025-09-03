let schedule = [];
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
    notificationRequested: localStorage.getItem('notificationRequested') || false
};
const timeZone = 'America/Phoenix';
let audioContext = new (window.AudioContext || window.webkitAudioContext)();
let audioInstances = new Set();

function loadData() {
    try {
        if (localStorage.getItem('schedule')) schedule = JSON.parse(localStorage.getItem('schedule'));
        if (localStorage.getItem('settings')) Object.assign(settings, JSON.parse(localStorage.getItem('settings')));
    } catch (e) {
        console.error('Invalid localStorage data, resetting to defaults:', e);
        schedule = [];
        // Reset to defaults as in original
    }
    renderSchedule();
    updateUI();
}
loadData();

document.addEventListener('click', () => {
    if (!userInteracted && audioContext.state === 'suspended') {
        audioContext.resume().then(() => {
            userInteracted = true;
            console.log('Audio context unlocked');
        });
    }
}, { once: true });

function getCurrentTime() {
    return new Intl.DateTimeFormat('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: settings.timeFormat === '12',
        timeZone
    }).format(new Date());
}
function getCurrentDateTime() {
    return new Date(new Date().toLocaleString('en-US', { timeZone }));
}
function formatTime(timeStr) {
    const [hours, minutes] = timeStr.split(':');
    if (settings.timeFormat === '24') return `${hours}:${minutes}`;
    const date = new Date(`1970-01-01T${timeStr}`);
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}
setInterval(() => {
    document.getElementById('currentTime').textContent = getCurrentTime();
    if (userInteracted) {
        updateExpectedStatus();
        updateCountdown();
        checkAlerts();
        updateClockColor(); // New: Update clock and status colors every second
    }
    renderSchedule();
}, 1000);

document.getElementById('addEvent').addEventListener('click', () => {
    const time = document.getElementById('eventTime').value;
    const type = document.getElementById('eventType').value;
    if (time && type) {
        schedule.push({ time, type });
        schedule.sort((a, b) => new Date(`1970-01-01T${a.time}`) - new Date(`1970-01-01T${b.time}`));
        saveData();
        renderSchedule();
        document.getElementById('eventTime').value = '';
        document.getElementById('saveChanges').style.display = 'none';
    }
});

function renderSchedule() {
    const container = document.getElementById('scheduleCards');
    container.innerHTML = '';
    const now = getCurrentDateTime();
    let previousWasCurrent = false;
    schedule.forEach((event, i) => {
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
            if (!previousWasCurrent && settings.enableSounds && settings.sounds.atEvent.enable) {
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
    let currentEvent = null;
    for (let event of schedule) {
        const eventTime = new Date(now.toDateString() + ' ' + event.time);
        if (eventTime <= now && (!currentEvent || eventTime > new Date(now.toDateString() + ' ' + currentEvent.time))) {
            currentEvent = event;
        }
    }
    return currentEvent;
}

function editEvent(i) {
    const event = schedule[i];
    document.getElementById('eventTime').value = event.time;
    document.getElementById('eventType').value = event.type;
    document.getElementById('saveChanges').style.display = 'inline-block';
    document.getElementById('saveChanges').onclick = () => {
        if (confirm('Save changes to this event?')) {
            const newTime = document.getElementById('eventTime').value;
            const newType = document.getElementById('eventType').value;
            if (newTime && newType) {
                schedule[i] = { time: newTime, type: newType };
                schedule.sort((a, b) => new Date(`1970-01-01T${a.time}`) - new Date(`1970-01-01T${b.time}`));
                saveData();
                renderSchedule();
                document.getElementById('eventTime').value = '';
                document.getElementById('saveChanges').style.display = 'none';
            }
        }
    };
}

function deleteEvent(i) {
    schedule.splice(i, 1);
    saveData();
    renderSchedule();
}

function updateExpectedStatus() {
    const now = getCurrentDateTime();
    let expected = 'None';
    let pastEnd = true;
    let lastRelevantEvent = null;
    for (let event of schedule) {
        const eventTime = new Date(now.toDateString() + ' ' + event.time);
        if (eventTime > now) {
            pastEnd = false;
            break;
        }
        lastRelevantEvent = event; // Updated to always take the latest past event, handling overlaps
    }
    if (lastRelevantEvent) expected = lastRelevantEvent.type;
    if (pastEnd) expected = 'You are not scheduled to work at this time';
    document.getElementById('expectedStatus').textContent = expected;
    updateStatusColors(expected);
    updateClockColor(); // Ensure colors update after status change
}

function updateCountdown() {
    const now = getCurrentDateTime();
    let nextEvent = null;
    let minDiff = Infinity;
    for (let event of schedule) {
        const eventTime = new Date(now.toDateString() + ' ' + event.time);
        const diff = (eventTime - now) / 1000 / 60;
        if (diff >= 0 && diff < minDiff) {
            minDiff = diff;
            nextEvent = event;
        }
    }
    if (nextEvent) {
        const countdown = Math.max(0, Math.floor(minDiff));
        const countdownElement = document.getElementById('countdown');
        countdownElement.textContent = `${countdown} min${countdown === 1 ? '' : 's'}`;
        countdownElement.className = 'countdown-text';
        if (countdown <= settings.leadTime) countdownElement.classList.add('yellow');
        if (countdown <= settings.firstWarn) countdownElement.classList.add('red');
    } else {
        document.getElementById('countdown').textContent = '--';
    }
}

function checkAlerts() {
    const now = getCurrentDateTime();
    schedule.forEach(event => {
        const eventTime = new Date(now.toDateString() + ' ' + event.time);
        const diff = (now - eventTime) / 1000 / 60;
        if (diff > settings.secondWarn && settings.enableSounds && settings.sounds.secondWarn.enable) {
            playSound(settings.sounds.secondWarn.pattern, settings.sounds.secondWarn.volume);
        }
        // Add similar for other alerts
    });
}

function updateClockColor() {
    const clock = document.getElementById('currentTime');
    const statusElem = document.getElementById('expectedStatus');
    const currentEvent = getCurrentEvent();
    if (!currentEvent) {
        clock.classList.remove('green', 'yellow', 'red');
        statusElem.classList.remove('green', 'yellow', 'red');
        return;
    }
    const now = getCurrentDateTime();
    const eventTime = new Date(now.toDateString() + ' ' + currentEvent.time);
    const diff = (now - eventTime) / 1000 / 60;
    let colorClass = '';
    if (currentStatus === currentEvent.type && lastAcknowledgedEvent === currentEvent) {
        colorClass = 'green'; // Acknowledged: green
    } else if (diff > settings.secondWarn) {
        colorClass = 'red'; // Past second warn: red
    } else if (diff > settings.firstWarn) {
        colorClass = 'yellow'; // Past first warn: yellow
    }
    clock.classList.remove('green', 'yellow', 'red');
    clock.classList.add(colorClass);
    statusElem.classList.remove('green', 'yellow', 'red');
    statusElem.classList.add(colorClass);
}

function updateStatusColors(expected) {
    document.querySelectorAll('.status').forEach(btn => {
        btn.classList.remove('green-bg', 'orange-bg', 'yellow-bg', 'blue-bg', 'red-bg');
        if (btn.dataset.type === currentStatus) {
            if (btn.dataset.type === 'On Queue') btn.classList.add('green-bg');
            else if (btn.dataset.type === 'Off Queue') btn.classList.add('orange-bg');
            else if (btn.dataset.type === 'Break') btn.classList.add('yellow-bg');
            else if (btn.dataset.type === 'Meal') btn.classList.add('blue-bg');
            else if (btn.dataset.type === 'Meeting') btn.classList.add('blue-bg'); // Example
            else if (btn.dataset.type === 'Busy') btn.classList.add('red-bg'); // Example
            else if (btn.dataset.type === 'Shift End') btn.classList.add('red-bg');
        }
    });
    updateClockColor(); // Link button colors to clock/status
}

function playSound(pattern, volume) {
    const audio = new Audio(`sounds/click.mp3`); // Use your click.mp3; expand for patterns
    audio.volume = volume;
    audio.play().catch(e => console.error('Audio play failed:', e));
    if (pattern === 'double') {
        setTimeout(() => audio.play(), 300);
    } else if (pattern === 'triple') {
        setTimeout(() => audio.play(), 300);
        setTimeout(() => audio.play(), 600);
    } // Add chime if you have a separate file
}

document.getElementById('toggleSettings').addEventListener('click', () => {
    const panel = document.getElementById('settingsPanel');
    panel.classList.toggle('show');
});

document.querySelectorAll('.status').forEach(btn => {
    btn.addEventListener('click', () => {
        currentStatus = btn.dataset.type;
        const currentEvent = getCurrentEvent();
        if (currentStatus === currentEvent?.type) {
            lastAcknowledgedEvent = currentEvent; // Acknowledge only if matches
        }
        updateStatusColors();
        updateClockColor(); // Update colors immediately after click
        if (settings.enableClicks) playSound('single', settings.clickVolume);
    });
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
// Add similar listeners for firstWarn, secondWarn as in original

document.getElementById('enableSounds').addEventListener('change', e => {
    settings.enableSounds = e.target.checked;
    document.querySelector('.speaker').classList.toggle('muted', !e.target.checked);
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
document.querySelectorAll('.preview-sound').forEach(btn => {
    btn.addEventListener('click', e => {
        const alert = e.target.dataset.alert;
        if (settings.sounds[alert].enable) playSound(settings.sounds[alert].pattern, settings.sounds[alert].volume);
    });
});

document.getElementById('enableClicks').addEventListener('change', e => {
    settings.enableClicks = e.target.checked;
    saveData();
});
document.getElementById('clickVolume').addEventListener('change', e => {
    settings.clickVolume = parseFloat(e.target.value);
    saveData();
});
document.getElementById('clickPreview').addEventListener('click', () => {
    if (settings.enableClicks) playSound('single', settings.clickVolume);
});

document.getElementById('sidebarMode').addEventListener('change', e => {
    document.body.classList.toggle('sidebar', e.target.checked);
});
document.getElementById('pinSidebar').addEventListener('click', () => {
    alert('Pin to sidebar via browser settings');
});
document.getElementById('installApp').addEventListener('click', () => {
    alert('Install via browser: click "Add to Home Screen" or install icon');
});

document.getElementById('exportSchedule').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(schedule)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'schedule.json';
    a.click();
    URL.revokeObjectURL(url);
});
document.getElementById('importSchedule').addEventListener('click', () => {
    const file = document.getElementById('importFile').files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = e => {
            try {
                schedule = JSON.parse(e.target.result);
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
    document.querySelectorAll('.sound-enable').forEach(cb => cb.checked = settings.sounds[cb.dataset.alert].enable);
    document.querySelectorAll('.sound-pattern').forEach(sel => sel.value = settings.sounds[sel.dataset.alert].pattern);
    document.querySelectorAll('.sound-volume').forEach(range => range.value = settings.sounds[range.dataset.alert].volume);
    document.getElementById('lightTheme').classList.toggle('active', document.body.className.includes('light'));
    document.getElementById('darkTheme').classList.toggle('active', document.body.className.includes('dark'));
}

function saveData() {
    localStorage.setItem('schedule', JSON.stringify(schedule));
    localStorage.setItem('settings', JSON.stringify(settings));
}

document.getElementById('managerEscalation').addEventListener('click', () => {
    escalationActive = !escalationActive;
    const btn = document.getElementById('managerEscalation');
    btn.textContent = escalationActive ? 'Deactivate Manager Escalation' : 'Activate Manager Escalation';
    btn.classList.toggle('red-bg', escalationActive);
    if (settings.enableClicks) playSound('single', settings.clickVolume);
});