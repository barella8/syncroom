/**
 * SyncRoom - P2P Watch Party JavaScript Logic
 * Fully client-side peer-to-peer synchronization layer using PeerJS and HTML5 Video.
 */

// --- STATE MANAGEMENT ---
let state = {
    peer: null,
    conn: null,              // Guest's connection to Host
    connections: [],         // Host's list of connected Guests
    activeCalls: [],         // Active PeerJS WebRTC stream calls
    username: '',
    role: '',                // 'host' or 'guest'
    roomId: '',
    roomUsers: [],           // List of { id, username, role }
    isVideoLoaded: false,
    isCoControl: false,      // Can guests control playback? (Host setting)
    isSyncing: false,        // Flag to prevent event feedback loops during programmatic updates
    hostPlaying: false,
    hostTime: 0,
    hostDuration: 0,
    lastStreamTime: 0,
    hostFileName: '',
    hostPlaybackRate: 1.0,
    syncTimer: null,         // Timer for broadcasting sync state from Host
    driftCheckTimer: null,   // Timer for Guests to check drift from Host
    activeTab: 'users',      // 'users', 'chat', or 'settings'
};

const SYNC_THRESHOLD = 2.0;  // Allowed drift in seconds before warning

// --- DOM ELEMENTS ---
const elements = {
    // Screens
    screenLobby: document.getElementById('screen-lobby'),
    screenRoom: document.getElementById('screen-room'),

    // Lobby Inputs & Buttons
    inputUsername: document.getElementById('input-username'),
    btnCreateRoom: document.getElementById('btn-create-room'),
    inputRoomId: document.getElementById('input-room-id'),
    btnJoinRoom: document.getElementById('btn-join-room'),
    btnLobbyThemeToggle: document.getElementById('btn-lobby-theme-toggle'),

    // Room Top Bar
    btnLeaveRoom: document.getElementById('btn-leave-room'),
    displayRoomCode: document.getElementById('display-room-code'),
    btnCopyCode: document.getElementById('btn-copy-code'),
    btnThemeToggle: document.getElementById('btn-theme-toggle'),
    btnToggleSidebar: document.getElementById('btn-toggle-sidebar'),
    roomSidebar: document.getElementById('room-sidebar'),

    // Video Player & Controls
    mainVideo: document.getElementById('main-video'),
    dubbingAudio: document.getElementById('dubbing-audio'),
    videoPlaceholder: document.getElementById('video-placeholder'),
    hostFileInfo: document.getElementById('placeholder-host-file-info'),
    hostFilename: document.getElementById('host-filename'),
    videoBuffering: document.getElementById('video-buffering'),
    customControls: document.getElementById('custom-controls'),
    playPauseOverlay: document.getElementById('play-pause-overlay'),
    playerWrapperSize: document.getElementById('player-wrapper-size'),
    
    btnPlayPause: document.getElementById('btn-play-pause'),
    btnMute: document.getElementById('btn-mute'),
    controlSeekbar: document.getElementById('control-seekbar'),
    seekbarProgress: document.getElementById('seekbar-progress'),
    controlVolume: document.getElementById('control-volume'),
    timeCurrent: document.getElementById('time-current'),
    timeDuration: document.getElementById('time-duration'),
    btnFullscreen: document.getElementById('btn-fullscreen'),
    btnPlayerSettings: document.getElementById('btn-player-settings'),
    playerSettingsPopup: document.getElementById('player-settings-popup'),
    quickPlaybackSpeed: document.getElementById('quick-playback-speed'),
    quickPlayerSize: document.getElementById('quick-player-size'),
    badgeDubbing: document.getElementById('badge-dubbing'),
    badgeSubtitles: document.getElementById('badge-subtitles'),
    guestControlNotice: document.getElementById('guest-control-notice'),

    // Sync Warning Alert
    syncWarning: document.getElementById('sync-warning'),
    btnForceSync: document.getElementById('btn-force-sync'),
    btnStreamFromHost: document.getElementById('btn-stream-from-host'),
    containerGuestStreamOption: document.getElementById('container-guest-stream-option'),

    // Media Setup & Config
    inputVideoFile: document.getElementById('input-video-file'),
    labelVideoFile: document.getElementById('label-video-file'),
    inputSubtitleFile: document.getElementById('input-subtitle-file'),
    labelSubtitleFile: document.getElementById('label-subtitle-file'),
    btnClearSubtitle: document.getElementById('btn-clear-subtitle'),
    inputDubbingFile: document.getElementById('input-dubbing-file'),
    labelDubbingFile: document.getElementById('label-dubbing-file'),
    btnClearDubbing: document.getElementById('btn-clear-dubbing'),
    selectPlaybackSpeed: document.getElementById('select-playback-speed'),
    selectPlayerSize: document.getElementById('select-player-size'),

    // Sidebar Panels & Tab Switches
    tabUsers: document.getElementById('tab-users'),
    tabChat: document.getElementById('tab-chat'),
    tabSettings: document.getElementById('tab-settings'),
    
    sidebarUsersPanel: document.getElementById('sidebar-users-panel'),
    sidebarChatPanel: document.getElementById('sidebar-chat-panel'),
    sidebarSettingsPanel: document.getElementById('sidebar-settings-panel'),
    
    userCount: document.getElementById('user-count'),
    userListContainer: document.getElementById('user-list-container'),
    hostSettingsCard: document.getElementById('host-settings-card'),
    toggleCoControl: document.getElementById('toggle-co-control'),
    btnBroadcastSync: document.getElementById('btn-broadcast-sync'),

    btnSidebarThemeToggle: document.getElementById('btn-sidebar-theme-toggle'),
    displayThemeName: document.getElementById('display-theme-name'),

    // Chat
    chatMessages: document.getElementById('chat-messages'),
    chatForm: document.getElementById('chat-form'),
    inputChatMessage: document.getElementById('input-chat-message'),
    toastContainer: document.getElementById('toast-container'),
};

// --- INITIALIZATION ---
window.addEventListener('DOMContentLoaded', () => {
    // Generate Lucide Icons
    lucide.createIcons();

    // Default username from LocalStorage if exists
    if (localStorage.getItem('syncroom_username')) {
        elements.inputUsername.value = localStorage.getItem('syncroom_username');
    }

    // Apply Saved Theme
    initTheme();

    setupEventListeners();

    // Check URL parameters for direct invitation links
    checkUrlQueryParams();
});

window.addEventListener('beforeunload', () => {
    leaveRoom();
});

function checkUrlQueryParams() {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    if (roomParam) {
        if (elements.inputRoomId) {
            elements.inputRoomId.value = roomParam;
            showToast('Room Code filled from invite link!', 'info');
            if (elements.inputUsername) {
                elements.inputUsername.focus();
            }
        }
    }
}

// --- THEME ENGINE (LIGHT/DARK) ---
function initTheme() {
    const savedTheme = localStorage.getItem('syncroom_theme') || 'dark';
    if (savedTheme === 'dark') {
        document.documentElement.classList.add('dark');
    } else {
        document.documentElement.classList.remove('dark');
    }
    updateThemeUI(savedTheme);
}

function toggleTheme() {
    const isDark = document.documentElement.classList.contains('dark');
    const newTheme = isDark ? 'light' : 'dark';
    
    if (newTheme === 'dark') {
        document.documentElement.classList.add('dark');
    } else {
        document.documentElement.classList.remove('dark');
    }
    
    localStorage.setItem('syncroom_theme', newTheme);
    updateThemeUI(newTheme);
    showToast(`Switched to ${newTheme} mode.`, 'info');
}

function updateThemeUI(theme) {
    const isDark = (theme === 'dark');
    
    // Header Icon Toggle
    if (elements.btnThemeToggle) {
        elements.btnThemeToggle.innerHTML = `<i data-lucide="${isDark ? 'sun' : 'moon'}"></i>`;
        lucide.createIcons({ attrs: { class: 'w-5 h-5' } });
    }

    // Lobby Screen Icon Toggle
    if (elements.btnLobbyThemeToggle) {
        elements.btnLobbyThemeToggle.innerHTML = `<i data-lucide="${isDark ? 'sun' : 'moon'}"></i>`;
        lucide.createIcons({ attrs: { class: 'w-5 h-5' } });
    }
    
    // Sidebar Setting text & icon
    if (elements.displayThemeName) {
        elements.displayThemeName.textContent = theme;
    }
    if (elements.btnSidebarThemeToggle) {
        const iconContainer = elements.btnSidebarThemeToggle.querySelector('div');
        iconContainer.innerHTML = `
            <span class="text-[10px] text-slate-500 uppercase font-bold tracking-wider" id="display-theme-name">${theme}</span>
            <i data-lucide="${isDark ? 'moon' : 'sun'}" class="w-4 h-4 text-indigo-600 dark:text-indigo-400"></i>
        `;
        lucide.createIcons({ attrs: { class: 'w-4 h-4' } });
        // Re-assign display element since innerHTML changed it
        elements.displayThemeName = document.getElementById('display-theme-name');
    }
}

// --- TOAST NOTIFICATIONS ---
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `flex items-center gap-3 p-4 rounded-2xl border text-sm shadow-xl transition-all duration-300 transform translate-y-2 opacity-0 max-w-sm w-full`;
    
    let icon = 'info';
    if (type === 'success') {
        toast.className += ' bg-emerald-500/10 border-emerald-500/20 text-emerald-900 dark:text-emerald-200';
        icon = 'check-circle2';
    } else if (type === 'error') {
        toast.className += ' bg-rose-500/10 border-rose-500/20 text-rose-900 dark:text-rose-200';
        icon = 'alert-octagon';
    } else if (type === 'warning') {
        toast.className += ' bg-amber-500/10 border-amber-500/20 text-amber-900 dark:text-amber-200';
        icon = 'alert-triangle';
    } else {
        toast.className += ' bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200';
        icon = 'info';
    }

    toast.innerHTML = `
        <i data-lucide="${icon}" class="w-4 h-4 flex-shrink-0 ${type === 'success' ? 'text-emerald-500' : type === 'error' ? 'text-rose-500' : type === 'warning' ? 'text-amber-500' : 'text-slate-400 dark:text-slate-500'}"></i>
        <div class="flex-grow">${message}</div>
    `;

    elements.toastContainer.appendChild(toast);
    lucide.createIcons({ attrs: { class: 'w-4 h-4' } });

    // Animate in
    requestAnimationFrame(() => {
        toast.classList.remove('translate-y-2', 'opacity-0');
    });

    // Remove after 4 seconds
    setTimeout(() => {
        toast.classList.add('opacity-0', 'translate-y-[-8px]');
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, 4000);
}

// --- SCREEN TRANSITIONS ---
function showScreen(screenId) {
    if (screenId === 'lobby') {
        elements.screenRoom.classList.add('hidden');
        elements.screenLobby.classList.remove('hidden');
    } else if (screenId === 'room') {
        elements.screenLobby.classList.add('hidden');
        elements.screenRoom.classList.remove('hidden');
    }
}

// --- HELPER FUNCTIONS ---
function formatTime(seconds) {
    if (isNaN(seconds) || seconds === Infinity) return '00:00';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    const pad = (num) => String(num).padStart(2, '0');
    if (hrs > 0) {
        return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
    }
    return `${pad(mins)}:${pad(secs)}`;
}

function srtToVtt(srtText) {
    const header = "WEBVTT\n\n";
    const converted = srtText.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
    return header + converted;
}

// --- EVENT LISTENERS REGISTRATION ---
function setupEventListeners() {
    // Username Save
    elements.inputUsername.addEventListener('change', () => {
        localStorage.setItem('syncroom_username', elements.inputUsername.value.trim());
    });

    // Lobby Actions
    elements.btnCreateRoom.addEventListener('click', handleCreateRoom);
    elements.btnJoinRoom.addEventListener('click', handleJoinRoom);
    elements.btnLobbyThemeToggle.addEventListener('click', toggleTheme);

    // Room Actions
    elements.btnLeaveRoom.addEventListener('click', leaveRoom);
    elements.btnCopyCode.addEventListener('click', copyRoomCode);
    elements.btnToggleSidebar.addEventListener('click', toggleSidebar);
    elements.btnThemeToggle.addEventListener('click', toggleTheme);

    // Sidebar Tab Switching
    elements.tabUsers.addEventListener('click', () => switchTab('users'));
    elements.tabChat.addEventListener('click', () => switchTab('chat'));
    elements.tabSettings.addEventListener('click', () => switchTab('settings'));

    // Sidebar Theme Toggle
    elements.btnSidebarThemeToggle.addEventListener('click', toggleTheme);

    // Chat Submission
    elements.chatForm.addEventListener('submit', handleSendChat);

    // File Selections
    elements.inputVideoFile.addEventListener('change', handleVideoFileSelect);
    elements.inputSubtitleFile.addEventListener('change', handleSubtitleFileSelect);
    elements.inputDubbingFile.addEventListener('change', handleDubbingFileSelect);

    // Clear Files
    elements.btnClearSubtitle.addEventListener('click', clearSubtitles);
    elements.btnClearDubbing.addEventListener('click', clearDubbing);

    // Playback Speed & Size Configurations
    elements.selectPlaybackSpeed.addEventListener('change', handlePlaybackSpeedChange);
    elements.selectPlayerSize.addEventListener('change', handlePlayerSizeChange);

    // Gear settings button on player
    elements.btnPlayerSettings.addEventListener('click', (e) => {
        e.stopPropagation();
        elements.playerSettingsPopup.classList.toggle('hidden');
    });

    // Quick settings sync
    elements.quickPlaybackSpeed.addEventListener('change', () => {
        elements.selectPlaybackSpeed.value = elements.quickPlaybackSpeed.value;
        handlePlaybackSpeedChange();
    });

    elements.quickPlayerSize.addEventListener('change', () => {
        elements.selectPlayerSize.value = elements.quickPlayerSize.value;
        handlePlayerSizeChange();
    });

    // Close settings popup when clicking outside
    document.addEventListener('click', (e) => {
        if (elements.playerSettingsPopup && !elements.playerSettingsPopup.classList.contains('hidden')) {
            if (!elements.playerSettingsPopup.contains(e.target) && !elements.btnPlayerSettings.contains(e.target)) {
                elements.playerSettingsPopup.classList.add('hidden');
            }
        }
    });

    // Host Settings
    elements.toggleCoControl.addEventListener('change', handleCoControlToggle);
    elements.btnBroadcastSync.addEventListener('click', () => {
        if (state.role === 'host') {
            broadcastSyncCommand('seek', elements.mainVideo.currentTime);
            showToast('Synchronization forced to all peers.', 'success');
        }
    });

    // Guest Force Sync Button
    elements.btnForceSync.addEventListener('click', syncPlayerToHost);
    elements.btnStreamFromHost.addEventListener('click', requestVideoStreamFromHost);

    // HTML5 Video Playback Listeners
    setupVideoControlsListeners();

    // Keyboard Shortcuts (Keybinds) Listener
    setupKeyboardBinds();

    // Drag & Drop File Loading
    const videoWrapper = elements.mainVideo.parentElement;
    if (videoWrapper) {
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            videoWrapper.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
            }, false);
        });

        ['dragenter', 'dragover'].forEach(eventName => {
            videoWrapper.addEventListener(eventName, () => {
                videoWrapper.classList.add('border-indigo-500', 'border-2');
            }, false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            videoWrapper.addEventListener(eventName, () => {
                videoWrapper.classList.remove('border-indigo-500', 'border-2');
            }, false);
        });

        videoWrapper.addEventListener('drop', (e) => {
            const dt = e.dataTransfer;
            const files = dt.files;
            if (files.length > 0) {
                const file = files[0];
                const name = file.name.toLowerCase();
                if (name.match(/\.(mp4|webm|ogg|mkv|mov|avi)$/i)) {
                    handleVideoFileSelect({ target: { files: [file] } });
                } else if (name.match(/\.(srt|vtt)$/i)) {
                    handleSubtitleFileSelect({ target: { files: [file] } });
                } else if (name.match(/\.(mp3|wav|ogg|aac|m4a|weba)$/i)) {
                    handleDubbingFileSelect({ target: { files: [file] } });
                } else {
                    showToast('Unsupported file type dropped.', 'warning');
                }
            }
        });
    }
}

// --- PLAYBACK CONFIGURATIONS (SPEED & SIZE) ---
function handlePlaybackSpeedChange() {
    if (!state.isVideoLoaded) return;
    
    if (state.role === 'guest' && !state.isCoControl) {
        // Revert dropdown states
        const currentRateStr = String(elements.mainVideo.playbackRate);
        elements.selectPlaybackSpeed.value = currentRateStr;
        if (elements.quickPlaybackSpeed) {
            elements.quickPlaybackSpeed.value = currentRateStr;
        }
        showToast('Playback speed is controlled by the Host.', 'warning');
        return;
    }

    const rate = parseFloat(elements.selectPlaybackSpeed.value);
    
    state.isSyncing = false; // Allow event to broadcast
    elements.mainVideo.playbackRate = rate;
    elements.dubbingAudio.playbackRate = rate;
    
    // Sync quick settings dropdown
    if (elements.quickPlaybackSpeed) {
        elements.quickPlaybackSpeed.value = String(rate);
    }
}

function handlePlayerSizeChange() {
    const size = elements.selectPlayerSize.value;
    
    // Sync quick settings dropdown
    if (elements.quickPlayerSize) {
        elements.quickPlayerSize.value = size;
    }

    const videoWrapper = elements.mainVideo.parentElement;
    if (!videoWrapper) return;

    videoWrapper.classList.remove('render-scale-max', 'render-scale-720p', 'render-scale-480p');

    if (size === 'max') {
        videoWrapper.classList.add('render-scale-max');
    } else if (size === '720p') {
        videoWrapper.classList.add('render-scale-720p');
    } else if (size === '480p') {
        videoWrapper.classList.add('render-scale-480p');
    }

    showToast(`Resolution scale set to ${size === 'max' ? 'Cinematic' : size}.`, 'info');
}

// --- KEYBOARD BINDS (SHORTCUTS) ---
function setupKeyboardBinds() {
    document.addEventListener('keydown', (e) => {
        // Disable shortcuts if user is typing in any input field
        const activeElement = document.activeElement;
        if (activeElement && (
            activeElement.tagName === 'INPUT' || 
            activeElement.tagName === 'TEXTAREA' || 
            activeElement.isContentEditable
        )) {
            return;
        }

        const video = elements.mainVideo;

        switch (e.key.toLowerCase()) {
            case ' ': // Spacebar
            case 'k':
                e.preventDefault();
                if (!state.isVideoLoaded) return;
                
                // Guest control restriction check
                if (state.role === 'guest' && !state.isCoControl) {
                    showToast('Playback is controlled by the Host.', 'warning');
                    return;
                }

                if (video.paused) {
                    video.play();
                } else {
                    video.pause();
                }
                break;

            case 'arrowleft':
                e.preventDefault();
                if (!state.isVideoLoaded) return;
                if (state.role === 'guest' && !state.isCoControl) {
                    showToast('Seeking is controlled by the Host.', 'warning');
                    return;
                }
                seekDelta(-5);
                break;

            case 'arrowright':
                e.preventDefault();
                if (!state.isVideoLoaded) return;
                if (state.role === 'guest' && !state.isCoControl) {
                    showToast('Seeking is controlled by the Host.', 'warning');
                    return;
                }
                seekDelta(5);
                break;

            case 'j':
                e.preventDefault();
                if (!state.isVideoLoaded) return;
                if (state.role === 'guest' && !state.isCoControl) {
                    showToast('Seeking is controlled by the Host.', 'warning');
                    return;
                }
                seekDelta(-10);
                break;

            case 'l':
                e.preventDefault();
                if (!state.isVideoLoaded) return;
                if (state.role === 'guest' && !state.isCoControl) {
                    showToast('Seeking is controlled by the Host.', 'warning');
                    return;
                }
                seekDelta(10);
                break;

            case 'arrowup':
                e.preventDefault();
                adjustVolume(0.05);
                break;

            case 'arrowdown':
                e.preventDefault();
                adjustVolume(-0.05);
                break;
        }
    });
}

function seekDelta(seconds) {
    const video = elements.mainVideo;
    const audio = elements.dubbingAudio;
    let newTime = video.currentTime + seconds;
    if (newTime < 0) newTime = 0;
    if (newTime > video.duration) newTime = video.duration;
    
    state.isSyncing = false; // allow broadcast
    video.currentTime = newTime;
    audio.currentTime = newTime;
}

function adjustVolume(amount) {
    const video = elements.mainVideo;
    const audio = elements.dubbingAudio;
    let newVol = video.volume + amount;
    if (newVol < 0) newVol = 0;
    if (newVol > 1) newVol = 1;
    
    video.volume = newVol;
    audio.volume = newVol;
    elements.controlVolume.value = newVol;
    updateVolumeIcon(newVol, video.muted);
    showToast(`Volume: ${Math.round(newVol * 100)}%`, 'info');
}

// --- CUSTOM PLAY/PAUSE OVERLAY ANIMATION ---
function showPlayPauseOverlayAnimation(isPlaying) {
    const overlay = elements.playPauseOverlay;
    if (!overlay) return;

    // Reset overlay layout and mount fresh Lucide icon so it renders
    const iconName = isPlaying ? 'play' : 'pause';
    overlay.innerHTML = `
        <div class="w-16 h-16 rounded-full bg-black/60 flex items-center justify-center text-white scale-75 transform transition-all duration-300">
            <i data-lucide="${iconName}"></i>
        </div>
    `;
    lucide.createIcons({ attrs: { class: 'w-8 h-8' } });

    overlay.classList.remove('opacity-0');
    overlay.classList.add('opacity-100');

    const inner = overlay.firstElementChild;
    
    // Animate scale up
    setTimeout(() => {
        if (inner) {
            inner.classList.remove('scale-75');
            inner.classList.add('scale-110');
        }
    }, 10);

    // Fade out shortly
    setTimeout(() => {
        overlay.classList.remove('opacity-100');
        overlay.classList.add('opacity-0');
        if (inner) {
            inner.classList.remove('scale-110');
            inner.classList.add('scale-75');
        }
    }, 500);
}

// --- CUSTOM VIDEO PLAYER CONTROLS ---
function setupVideoControlsListeners() {
    const video = elements.mainVideo;
    const audio = elements.dubbingAudio;

    // Custom Play / Pause Button
    elements.btnPlayPause.addEventListener('click', () => {
        if (!state.isVideoLoaded) return;
        if (state.role === 'guest' && !state.isCoControl) {
            showToast('Playback is controlled by the Host.', 'warning');
            return;
        }

        if (video.paused) {
            video.play();
        } else {
            video.pause();
        }
    });

    // Clicking the video element also triggers play/pause toggles
    video.addEventListener('click', () => {
        const container = video.parentElement;
        if (container) {
            container.classList.toggle('show-controls');
        }

        if (!state.isVideoLoaded) return;
        if (state.role === 'guest' && !state.isCoControl) {
            showToast('Playback is controlled by the Host.', 'warning');
            return;
        }
        if (video.paused) {
            video.play();
        } else {
            video.pause();
        }
    });

    // Native Play/Pause hooks to synchronize
    video.addEventListener('play', () => {
        updatePlayPauseButton(true);
        audio.play().catch(() => {});
        
        // Splash overlay animation
        showPlayPauseOverlayAnimation(true);

        if (state.isSyncing) return;

        // Broadcast play command
        if (state.role === 'host') {
            broadcastSyncCommand('play', video.currentTime);
        } else if (state.role === 'guest' && state.isCoControl) {
            sendSyncCommandToHost('play', video.currentTime);
        }
    });

    video.addEventListener('pause', () => {
        updatePlayPauseButton(false);
        audio.pause();

        // Splash overlay animation
        showPlayPauseOverlayAnimation(false);

        if (state.isSyncing) return;

        // Broadcast pause command
        if (state.role === 'host') {
            broadcastSyncCommand('pause', video.currentTime);
        } else if (state.role === 'guest' && state.isCoControl) {
            sendSyncCommandToHost('pause', video.currentTime);
        }
    });

    // Seeking hooks
    video.addEventListener('seeking', () => {
        if (state.isSyncing) return;

        // Sync dubbing audio timeline
        audio.currentTime = video.currentTime;

        if (state.role === 'host') {
            broadcastSyncCommand('seek', video.currentTime);
        } else if (state.role === 'guest' && state.isCoControl) {
            sendSyncCommandToHost('seek', video.currentTime);
        }
    });

    // Update progress bar as video plays
    video.addEventListener('timeupdate', () => {
        let curTime = video.currentTime;
        const isStreaming = !!video.srcObject;
        const dur = isStreaming ? state.hostDuration : video.duration;

        if (isStreaming) {
            curTime = state.hostTime + (video.currentTime - state.lastStreamTime);
            if (curTime < 0) curTime = 0;
            if (dur && curTime > dur) curTime = dur;
        }

        if (dur) {
            const percentage = (curTime / dur) * 100;
            elements.controlSeekbar.value = percentage;
            elements.seekbarProgress.style.width = `${percentage}%`;
            elements.timeCurrent.textContent = formatTime(curTime);
            elements.timeDuration.textContent = formatTime(dur);
        }
    });

    video.addEventListener('durationchange', () => {
        const dur = video.srcObject ? state.hostDuration : video.duration;
        if (dur) {
            elements.timeDuration.textContent = formatTime(dur);
        }
    });

    // Buffering indicator
    video.addEventListener('waiting', () => {
        elements.videoBuffering.classList.remove('hidden');
    });

    video.addEventListener('playing', () => {
        elements.videoBuffering.classList.add('hidden');
    });

    // Seek bar manual change
    elements.controlSeekbar.addEventListener('input', () => {
        if (!state.isVideoLoaded) return;
        const isStreaming = !!video.srcObject;
        const dur = isStreaming ? state.hostDuration : video.duration;
        if (!dur) return;

        if (state.role === 'guest' && !state.isCoControl) {
            // Revert slider value since guest cannot control
            const curTime = isStreaming 
                ? state.hostTime + (video.currentTime - state.lastStreamTime)
                : video.currentTime;
            const percentage = (curTime / dur) * 100;
            elements.controlSeekbar.value = percentage;
            elements.seekbarProgress.style.width = `${percentage}%`;
            showToast('Playback seeking is controlled by the Host.', 'warning');
            return;
        }

        const newTime = (elements.controlSeekbar.value / 100) * dur;
        state.isSyncing = false; // allow seek command broadcast
        
        if (isStreaming) {
            if (state.role === 'guest' && state.isCoControl) {
                sendSyncCommandToHost('seek', newTime);
            }
        } else {
            video.currentTime = newTime;
            audio.currentTime = newTime;
        }
    });

    // Volume controls
    elements.controlVolume.addEventListener('input', () => {
        video.volume = elements.controlVolume.value;
        audio.volume = elements.controlVolume.value;
        updateVolumeIcon(video.volume, video.muted);
    });

    elements.btnMute.addEventListener('click', () => {
        video.muted = !video.muted;
        audio.muted = video.muted;
        updateVolumeIcon(video.volume, video.muted);
    });

    // Fullscreen Mode
    elements.btnFullscreen.addEventListener('click', toggleFullscreen);

    // Audio Dubbing Rate synchronization & Rate Change listeners
    video.addEventListener('ratechange', () => {
        audio.playbackRate = video.playbackRate;
        
        // Sync setting dropdown UI value
        if (elements.selectPlaybackSpeed) {
            elements.selectPlaybackSpeed.value = String(video.playbackRate);
        }

        if (state.isSyncing) return;

        if (state.role === 'host') {
            broadcastSyncCommand('ratechange', video.currentTime);
        } else if (state.role === 'guest' && state.isCoControl) {
            sendSyncCommandToHost('ratechange', video.currentTime);
        }
    });
}

function updatePlayPauseButton(isPlaying) {
    const iconName = isPlaying ? 'pause' : 'play';
    elements.btnPlayPause.innerHTML = `<i data-lucide="${iconName}"></i>`;
    lucide.createIcons({ attrs: { class: 'w-5 h-5' } });
}

function updateVolumeIcon(volume, isMuted) {
    let iconName = 'volume-2';

    if (isMuted || volume === 0) {
        iconName = 'volume-x';
    } else if (volume < 0.4) {
        iconName = 'volume';
    } else if (volume < 0.7) {
        iconName = 'volume-1';
    }

    elements.btnMute.innerHTML = `<i data-lucide="${iconName}"></i>`;
    lucide.createIcons({ attrs: { class: 'w-5 h-5' } });
}

function toggleFullscreen() {
    // Go fullscreen on the room screen wrapper so that headers, controls, and sidebars remain visible
    const container = elements.screenRoom;
    if (!document.fullscreenElement) {
        container.requestFullscreen()
            .then(() => {
                elements.btnFullscreen.innerHTML = `<i data-lucide="minimize"></i>`;
                lucide.createIcons({ attrs: { class: 'w-5 h-5' } });
            })
            .catch(err => {
                showToast(`Unable to enter fullscreen: ${err.message}`, 'error');
            });
    } else {
        document.exitFullscreen();
        elements.btnFullscreen.innerHTML = `<i data-lucide="maximize"></i>`;
        lucide.createIcons({ attrs: { class: 'w-5 h-5' } });
    }
}

// Watch for fullscreen change globally to revert icon state if closed via Escape key
document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) {
        elements.btnFullscreen.innerHTML = `<i data-lucide="maximize"></i>`;
        lucide.createIcons({ attrs: { class: 'w-5 h-5' } });
    }
});

// --- FILE LOADING HANDLERS ---
function handleVideoFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    state.isVideoLoaded = true;
    state.hostFileName = file.name;
    elements.labelVideoFile.textContent = file.name;
    
    // Clear WebRTC stream if active
    if (elements.mainVideo.srcObject) {
        elements.mainVideo.srcObject = null;
        state.activeCalls.forEach(call => call.close());
        state.activeCalls = [];
    }

    // Create local object URL for the video
    const fileUrl = URL.createObjectURL(file);
    elements.mainVideo.src = fileUrl;
    elements.videoPlaceholder.classList.add('hidden');

    showToast(`Loaded "${file.name}"`, 'success');

    // If host, update everyone about the video metadata
    if (state.role === 'host') {
        broadcastFileUpdate(file.name);
    } else if (state.role === 'guest') {
        checkFileAlignmentWithHost();
        requestSyncFromHost();
    }
}

function handleSubtitleFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    elements.labelSubtitleFile.textContent = file.name;
    elements.btnClearSubtitle.classList.remove('hidden');
    elements.badgeSubtitles.classList.remove('hidden');

    const reader = new FileReader();
    reader.onload = function(evt) {
        const arrayBuffer = evt.target.result;
        let content = '';

        // Try decoding as UTF-8 first (fatal mode throws if invalid chars are present)
        try {
            const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
            content = utf8Decoder.decode(arrayBuffer);
        } catch (err) {
            console.warn('UTF-8 decoding failed, falling back to windows-1254 (Turkish) encoding.');
            const trDecoder = new TextDecoder('windows-1254');
            content = trDecoder.decode(arrayBuffer);
        }
        
        // Convert SRT to VTT if necessary
        if (file.name.endsWith('.srt')) {
            content = srtToVtt(content);
        }

        const blob = new Blob([content], { type: 'text/vtt;charset=utf-8' });
        const url = URL.createObjectURL(blob);

        // Remove old track
        const oldTrack = elements.mainVideo.querySelector('track');
        if (oldTrack) oldTrack.remove();

        // Create new track
        const track = document.createElement('track');
        track.kind = 'subtitles';
        track.label = file.name;
        track.srclang = 'tr';
        track.src = url;
        track.default = true;
        
        elements.mainVideo.appendChild(track);
        showToast('Subtitles loaded successfully.', 'success');
    };
    reader.readAsArrayBuffer(file);
}

// Clear subtitles track
function clearSubtitles() {
    elements.inputSubtitleFile.value = '';
    elements.labelSubtitleFile.textContent = 'Select Subtitles...';
    elements.btnClearSubtitle.classList.add('hidden');
    elements.badgeSubtitles.classList.add('hidden');

    const oldTrack = elements.mainVideo.querySelector('track');
    if (oldTrack) oldTrack.remove();
    showToast('Subtitles removed.', 'info');
}

function handleDubbingFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    elements.labelDubbingFile.textContent = file.name;
    elements.btnClearDubbing.classList.remove('hidden');
    elements.badgeDubbing.classList.remove('hidden');

    const url = URL.createObjectURL(file);
    elements.dubbingAudio.src = url;
    
    // Lower main video volume as dubbing acts as external track
    elements.mainVideo.volume = 0.1;
    elements.controlVolume.value = 0.1;
    elements.dubbingAudio.volume = 1.0;
    
    // Synchronize current time
    elements.dubbingAudio.currentTime = elements.mainVideo.currentTime;
    
    showToast('External audio loaded. Video volume lowered.', 'success');
}

function clearDubbing() {
    elements.inputDubbingFile.value = '';
    elements.labelDubbingFile.textContent = 'Select Dubbing...';
    elements.btnClearDubbing.classList.add('hidden');
    elements.badgeDubbing.classList.add('hidden');

    elements.dubbingAudio.src = '';
    elements.mainVideo.volume = 1.0;
    elements.controlVolume.value = 1.0;
    showToast('External audio removed. Video volume restored.', 'info');
}

function checkFileAlignmentWithHost() {
    if (!state.isVideoLoaded || !state.hostFileName) return;

    if (state.hostFileName !== elements.labelVideoFile.textContent) {
        showToast(`Warning: Your video file might differ from Host's! (${state.hostFileName})`, 'warning');
    }
}

// --- SIDEBAR MANAGEMENT ---
function toggleSidebar() {
    elements.roomSidebar.classList.toggle('collapsed');
}

function switchTab(tabId) {
    state.activeTab = tabId;
    
    // Clean tab headers states
    elements.tabUsers.className = elements.tabUsers.className.replace('border-indigo-650 text-indigo-650 dark:border-white dark:text-white', 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white');
    elements.tabChat.className = elements.tabChat.className.replace('border-indigo-650 text-indigo-650 dark:border-white dark:text-white', 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white');
    elements.tabSettings.className = elements.tabSettings.className.replace('border-indigo-655 text-indigo-650 dark:border-white dark:text-white', 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white');
    elements.tabSettings.className = elements.tabSettings.className.replace('border-indigo-650 text-indigo-650 dark:border-white dark:text-white', 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white');

    // Clean panel visibilities
    elements.sidebarUsersPanel.classList.add('hidden');
    elements.sidebarChatPanel.classList.add('hidden');
    elements.sidebarSettingsPanel.classList.add('hidden');

    // Switch active state
    if (tabId === 'users') {
        elements.tabUsers.className = elements.tabUsers.className.replace('border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white', 'border-indigo-650 text-indigo-650 dark:border-white dark:text-white');
        elements.sidebarUsersPanel.classList.remove('hidden');
    } else if (tabId === 'chat') {
        elements.tabChat.className = elements.tabChat.className.replace('border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white', 'border-indigo-650 text-indigo-650 dark:border-white dark:text-white');
        elements.sidebarChatPanel.classList.remove('hidden');
        elements.tabChat.classList.remove('text-indigo-400'); // clear unread indicator
    } else if (tabId === 'settings') {
        elements.tabSettings.className = elements.tabSettings.className.replace('border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white', 'border-indigo-650 text-indigo-650 dark:border-white dark:text-white');
        elements.sidebarSettingsPanel.classList.remove('hidden');
    }
}

// --- USERNAME VALIDATION ---
function validateUsername() {
    const name = elements.inputUsername.value.trim();
    if (!name) {
        showToast('Please enter a username first!', 'error');
        elements.inputUsername.focus();
        return false;
    }
    state.username = name;
    return true;
}

// --- PEERJS: ROOM CREATION (HOST) ---
function handleCreateRoom() {
    if (!validateUsername()) return;

    elements.btnCreateRoom.disabled = true;
    elements.btnCreateRoom.innerHTML = `<span class="w-4 h-4 border-2 border-white border-t-transparent animate-spin rounded-full inline-block"></span> Creating Room...`;

    // Initialize Host Peer
    state.peer = new Peer({
        debug: 1 // Only log warnings and errors
    });

    state.peer.on('open', (id) => {
        state.role = 'host';
        state.roomId = id;
        state.roomUsers = [{ id: id, username: state.username, role: 'host' }];

        elements.displayRoomCode.textContent = id;
        elements.hostSettingsCard.classList.remove('hidden');
        
        updateUserListUI();
        showScreen('room');
        showToast('Room successfully created!', 'success');

        // Setup Connection Listener
        setupHostConnectionListener();

        // Start broadcasting sync status regularly
        startHostSyncTimer();
    });

    state.peer.on('error', (err) => {
        console.error(err);
        showToast(`Connection error: ${err.type}`, 'error');
        elements.btnCreateRoom.disabled = false;
        elements.btnCreateRoom.innerHTML = `<i data-lucide="plus-circle" class="w-4 h-4"></i> Create Room (Host)`;
    });
}

function setupHostConnectionListener() {
    state.peer.on('connection', (conn) => {
        conn.on('open', () => {
            const guestUsername = conn.metadata?.username || 'Guest User';
            
            // Check if connection already handled
            if (state.connections.some(c => c.peer === conn.peer)) return;

            // Save connection
            state.connections.push(conn);

            // Add user to state list
            state.roomUsers.push({ id: conn.peer, username: guestUsername, role: 'guest' });
            
            updateUserListUI();
            addSystemChatMessage(`${guestUsername} joined the room.`);
            showToast(`${guestUsername} joined the room.`, 'success');

            // Send initialization data to the new guest
            conn.send({
                type: 'init',
                state: {
                    playing: !elements.mainVideo.paused,
                    time: elements.mainVideo.currentTime,
                    playbackRate: elements.mainVideo.playbackRate,
                    hostUsername: state.username,
                    hostFileName: state.hostFileName,
                    hostDuration: elements.mainVideo.duration || 0,
                    isCoControl: state.isCoControl,
                    users: state.roomUsers
                }
            });

            // Broadcast the new user list to all other clients
            broadcastUserList();
        });

        // Handle incoming data from Guest
        conn.on('data', (data) => {
            handleIncomingDataFromGuest(conn, data);
        });

        conn.on('close', () => {
            handleGuestDisconnect(conn.peer);
        });

        conn.on('error', (err) => {
            console.error('Guest connection error:', err);
            handleGuestDisconnect(conn.peer);
        });
    });
}

function handleIncomingDataFromGuest(conn, data) {
    const sender = state.roomUsers.find(u => u.id === conn.peer);
    const senderName = sender ? sender.username : 'Guest';

    if (data.type === 'chat') {
        if (sender && sender.isMuted) {
            return;
        }
        broadcastChatMessage(senderName, data.text);
        addChatMessage(senderName, data.text);
    } 
    else if (data.type === 'request_sync') {
        conn.send({
            type: 'sync',
            action: elements.mainVideo.paused ? 'pause' : 'play',
            time: elements.mainVideo.currentTime,
            rate: elements.mainVideo.playbackRate
        });
    }
    else if (data.type === 'sync' && state.isCoControl) {
        applySyncCommand(data.action, data.time, data.rate);
        broadcastSyncCommand(data.action, data.time, conn.peer);
        addSystemChatMessage(`${senderName} updated playback.`);
    }
    else if (data.type === 'request_video_stream') {
        if (!state.isVideoLoaded) {
            conn.send({ type: 'stream_error', message: 'Host has not loaded a video file yet.' });
            return;
        }

        try {
            const videoElement = elements.mainVideo;
            const captureMethod = videoElement.captureStream || videoElement.mozCaptureStream;
            if (!captureMethod) {
                throw new Error('Your browser does not support capturing the video stream.');
            }

            const stream = captureMethod.call(videoElement);
            const call = state.peer.call(conn.peer, stream);
            state.activeCalls.push(call);

            addSystemChatMessage(`Streaming video to ${senderName}.`);
        } catch (err) {
            console.error('Failed to stream video:', err);
            conn.send({ type: 'stream_error', message: 'Host browser failed to capture video stream.' });
        }
    }
}

function handleGuestDisconnect(peerId) {
    const index = state.connections.findIndex(c => c.peer === peerId);
    if (index !== -1) {
        state.connections.splice(index, 1);
    }

    const userIndex = state.roomUsers.findIndex(u => u.id === peerId);
    if (userIndex !== -1) {
        const username = state.roomUsers[userIndex].username;
        state.roomUsers.splice(userIndex, 1);
        
        updateUserListUI();
        addSystemChatMessage(`${username} left the room.`);
        showToast(`${username} left the room.`, 'info');

        // Update list for remaining users
        broadcastUserList();
    }
}

// --- PEERJS: JOIN ROOM (GUEST) ---
function handleJoinRoom() {
    if (!validateUsername()) return;

    const targetRoomId = elements.inputRoomId.value.trim();
    if (!targetRoomId) {
        showToast('Please enter a Room Code to join!', 'error');
        elements.inputRoomId.focus();
        return;
    }

    elements.btnJoinRoom.disabled = true;
    elements.btnJoinRoom.innerHTML = `<span class="w-4 h-4 border-2 border-slate-800 border-t-transparent animate-spin rounded-full inline-block"></span> Connecting...`;

    // Initialize Guest Peer
    state.peer = new Peer({
        debug: 1
    });

    state.peer.on('open', (id) => {
        state.role = 'guest';
        state.roomId = targetRoomId;

        // Listen for incoming media stream call from Host
        state.peer.on('call', (call) => {
            call.answer(); // Answer without sending a local stream
            call.on('stream', (remoteStream) => {
                state.isVideoLoaded = true;
                
                // Assign remote WebRTC stream to main video element
                elements.mainVideo.srcObject = remoteStream;
                elements.videoPlaceholder.classList.add('hidden');
                
                // Show LIVE indicator for length
                elements.timeDuration.textContent = 'LIVE';
                
                // Re-enable and reset stream button
                elements.btnStreamFromHost.disabled = false;
                elements.btnStreamFromHost.innerHTML = `<i data-lucide="tv" class="w-4 h-4"></i> Stream Video from Host`;
                if (window.lucide) {
                    window.lucide.createIcons({ attrs: { class: 'w-4 h-4' } });
                }
                
                showToast('Connected to Host video stream!', 'success');
            });
            state.activeCalls.push(call);
        });

        // Establish connection to host
        state.conn = state.peer.connect(targetRoomId, {
            metadata: { username: state.username }
        });

        setupGuestConnectionListeners();
    });

    state.peer.on('error', (err) => {
        console.error(err);
        showToast('Failed to connect. Please verify room code or status.', 'error');
        elements.btnJoinRoom.disabled = false;
        elements.btnJoinRoom.innerHTML = `<i data-lucide="play-circle" class="w-4 h-4"></i> Join Room`;
    });
}

function setupGuestConnectionListeners() {
    const conn = state.conn;

    conn.on('open', () => {
        elements.displayRoomCode.textContent = state.roomId;
        elements.hostSettingsCard.classList.add('hidden');
        
        showScreen('room');
        showToast('Joined the room successfully!', 'success');

        // Start checking drift from Host periodically
        startGuestDriftCheckTimer();
    });

    conn.on('data', (data) => {
        handleIncomingDataFromHost(data);
    });

    conn.on('close', () => {
        showToast('Room connection lost (Host disconnected).', 'error');
        leaveRoom();
    });

    conn.on('error', (err) => {
        console.error('Host connection error:', err);
        showToast('Connection error occurred.', 'error');
        leaveRoom();
    });
}

function handleIncomingDataFromHost(data) {
    if (data.type === 'init') {
        state.roomUsers = data.state.users;
        state.isCoControl = data.state.isCoControl;
        state.hostFileName = data.state.hostFileName;
        state.hostPlaying = data.state.playing;
        state.hostTime = data.state.time;
        state.hostPlaybackRate = data.state.playbackRate || 1.0;
        state.hostDuration = data.state.hostDuration || 0;
        state.lastStreamTime = elements.mainVideo.currentTime;

        updateUserListUI();
        updateGuestControlsUI();

        // Inform user about host's loaded file
        if (state.hostFileName) {
            elements.hostFileInfo.classList.remove('hidden');
            elements.hostFilename.textContent = state.hostFileName;
            if (state.role === 'guest') {
                elements.containerGuestStreamOption.classList.remove('hidden');
            }
            checkFileAlignmentWithHost();
        }

        // Apply playback states immediately if video loaded
        if (state.isVideoLoaded) {
            syncPlayerToHost();
        }
    } 
    else if (data.type === 'user_list') {
        state.roomUsers = data.users;
        updateUserListUI();
    } 
    else if (data.type === 'chat') {
        addChatMessage(data.username, data.text);
    } 
    else if (data.type === 'sync') {
        state.hostPlaying = (data.action === 'play');
        state.hostTime = data.time;
        state.hostPlaybackRate = data.rate || 1.0;
        applySyncCommand(data.action, data.time, data.rate);
    } 
    else if (data.type === 'co_control') {
        state.isCoControl = data.enabled;
        updateGuestControlsUI();
        showToast(state.isCoControl ? 'Host enabled co-control!' : 'Co-control disabled. Control is now Host-only.', 'info');
    }
    else if (data.type === 'file_update') {
        state.hostFileName = data.fileName;
        elements.hostFileInfo.classList.remove('hidden');
        elements.hostFilename.textContent = data.fileName;
        if (state.role === 'guest') {
            if (data.fileName) {
                elements.containerGuestStreamOption.classList.remove('hidden');
            } else {
                elements.containerGuestStreamOption.classList.add('hidden');
            }
        }
        checkFileAlignmentWithHost();
    }
    else if (data.type === 'ping') {
        state.hostPlaying = data.playing;
        state.hostTime = data.time;
        state.hostPlaybackRate = data.rate || 1.0;
        if (data.duration !== undefined) {
            state.hostDuration = data.duration;
        }
        state.lastStreamTime = elements.mainVideo.currentTime;
        checkDrift();
    }
    else if (data.type === 'stream_error') {
        showToast(data.message, 'error');
        elements.btnStreamFromHost.disabled = false;
        elements.btnStreamFromHost.innerHTML = `<i data-lucide="tv" class="w-4 h-4"></i> Stream Video from Host`;
        if (window.lucide) {
            window.lucide.createIcons({ attrs: { class: 'w-4 h-4' } });
        }
    }
    else if (data.type === 'kick') {
        showToast('You have been kicked from the room by the Host.', 'error');
        leaveRoom();
    }
    else if (data.type === 'mute') {
        state.isMuted = data.muted;
        if (state.isMuted) {
            elements.inputChatMessage.placeholder = 'You have been muted by Host...';
            elements.inputChatMessage.disabled = true;
            showToast('You have been muted by the Host.', 'warning');
        } else {
            elements.inputChatMessage.placeholder = 'Type a message...';
            elements.inputChatMessage.disabled = false;
            showToast('You have been unmuted by the Host.', 'info');
        }
    }
}

function updateGuestControlsUI() {
    if (state.role !== 'guest') return;
    
    if (state.isCoControl) {
        elements.guestControlNotice.classList.add('hidden');
    } else {
        elements.guestControlNotice.classList.remove('hidden');
    }
}

// --- BROADCASTS & SENDERS ---
function broadcastUserList() {
    if (state.role !== 'host') return;
    state.connections.forEach(conn => {
        conn.send({
            type: 'user_list',
            users: state.roomUsers
        });
    });
}

function broadcastFileUpdate(fileName) {
    if (state.role !== 'host') return;
    state.connections.forEach(conn => {
        conn.send({
            type: 'file_update',
            fileName: fileName
        });
    });
}

function broadcastChatMessage(username, text) {
    if (state.role !== 'host') return;
    state.connections.forEach(conn => {
        conn.send({
            type: 'chat',
            username: username,
            text: text
        });
    });
}

function broadcastSyncCommand(action, time, skipPeerId = null) {
    if (state.role !== 'host') return;
    const video = elements.mainVideo;
    state.connections.forEach(conn => {
        if (conn.peer === skipPeerId) return;
        conn.send({
            type: 'sync',
            action: action,
            time: time,
            rate: video.playbackRate
        });
    });
}

function sendSyncCommandToHost(action, time) {
    if (state.role !== 'guest' || !state.conn) return;
    const video = elements.mainVideo;
    state.conn.send({
        type: 'sync',
        action: action,
        time: time,
        rate: video.playbackRate
    });
}

function requestSyncFromHost() {
    if (state.role !== 'guest' || !state.conn) return;
    state.conn.send({
        type: 'request_sync'
    });
}

function requestVideoStreamFromHost() {
    if (state.role !== 'guest' || !state.conn) return;

    elements.btnStreamFromHost.disabled = true;
    elements.btnStreamFromHost.innerHTML = `<span class="w-4 h-4 border-2 border-white border-t-transparent animate-spin rounded-full inline-block"></span> Connecting...`;

    state.conn.send({
        type: 'request_video_stream'
    });

    showToast('Requested video stream from Host, waiting for WebRTC stream...', 'info');
}

// --- SYNC ENGINE (CORE LOGIC) ---
function applySyncCommand(action, time, rate = 1.0) {
    const video = elements.mainVideo;
    const audio = elements.dubbingAudio;

    state.isSyncing = true;

    // Playback Speed rate alignment
    if (rate && Math.abs(video.playbackRate - rate) > 0.01) {
        video.playbackRate = rate;
        audio.playbackRate = rate;
        if (elements.selectPlaybackSpeed) {
            elements.selectPlaybackSpeed.value = String(rate);
        }
    }

    // Time Seek Alignment
    if (Math.abs(video.currentTime - time) > 1.0) {
        video.currentTime = time;
        audio.currentTime = time;
    }

    // Playback State Alignment
    if (action === 'play') {
        video.play()
            .then(() => {
                audio.play().catch(() => {});
            })
            .catch(err => {
                console.warn('Auto play blocked:', err);
                showToast('Playback blocked. Please click on the video area to start.', 'warning');
            });
    } else if (action === 'pause') {
        video.pause();
        audio.pause();
    }

    // Release flag shortly after UI events propagate
    setTimeout(() => {
        state.isSyncing = false;
    }, 500);
}

function checkDrift() {
    if (!state.isVideoLoaded || state.role !== 'guest') return;

    const video = elements.mainVideo;
    if (video.srcObject) {
        elements.syncWarning.classList.add('hidden');
        return;
    }

    const isPlayingLocal = !video.paused;

    // Check states alignment, rate alignment, or time differences
    const drift = Math.abs(video.currentTime - state.hostTime);
    const playStateMismatch = isPlayingLocal !== state.hostPlaying;
    const rateMismatch = Math.abs(video.playbackRate - state.hostPlaybackRate) > 0.01;

    if (drift > SYNC_THRESHOLD || playStateMismatch || rateMismatch) {
        elements.syncWarning.classList.remove('hidden');
    } else {
        elements.syncWarning.classList.add('hidden');
    }
}

function syncPlayerToHost() {
    if (!state.isVideoLoaded) {
        showToast('Please load the same video file first!', 'warning');
        return;
    }

    applySyncCommand(state.hostPlaying ? 'play' : 'pause', state.hostTime, state.hostPlaybackRate);
    elements.syncWarning.classList.add('hidden');
    showToast('Synced with Host.', 'success');
}

// HOST SIDE: Periodically pings everyone with status
function startHostSyncTimer() {
    if (state.syncTimer) clearInterval(state.syncTimer);
    
    state.syncTimer = setInterval(() => {
        if (state.role !== 'host') return;
        
        const time = elements.mainVideo.currentTime;
        const playing = !elements.mainVideo.paused;
        const rate = elements.mainVideo.playbackRate;
        
        state.connections.forEach(conn => {
            conn.send({
                type: 'ping',
                time: time,
                playing: playing,
                rate: rate,
                duration: elements.mainVideo.duration || 0
            });
        });
    }, 3000);
}

// GUEST SIDE: Periodically checks local vs host stats
function startGuestDriftCheckTimer() {
    if (state.driftCheckTimer) clearInterval(state.driftCheckTimer);

    state.driftCheckTimer = setInterval(() => {
        if (state.role !== 'guest') return;
        checkDrift();
    }, 2000);
}

// --- UI UPDATERS ---
function updateUserListUI() {
    elements.userCount.textContent = state.roomUsers.length;
    elements.userListContainer.innerHTML = '';

    state.roomUsers.forEach(user => {
        const item = document.createElement('div');
        item.className = `flex items-center justify-between p-2.5 rounded-xl border transition-colors ${
            user.id === state.peer.id 
                ? 'bg-indigo-600/10 border-indigo-500/30' 
                : 'bg-slate-100/50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 hover:bg-slate-200/50 dark:hover:bg-slate-800/70'
        }`;

        const isMe = user.id === state.peer.id;
        const isHost = user.role === 'host';

        const colors = ['bg-rose-500', 'bg-blue-500', 'bg-emerald-500', 'bg-amber-500', 'bg-violet-500', 'bg-pink-500'];
        const hash = user.username.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
        const avatarBg = colors[hash % colors.length];
        const initial = user.username.charAt(0).toUpperCase();

        item.innerHTML = `
            <div class="flex items-center gap-3 min-w-0">
                <div class="w-8 h-8 rounded-full ${avatarBg} text-white flex items-center justify-center font-bold text-xs">
                    ${initial}
                </div>
                <div class="min-w-0">
                    <span class="text-xs font-semibold text-slate-800 dark:text-slate-200 block truncate">${user.username}</span>
                    <span class="text-[10px] text-slate-500 block truncate">${isHost ? 'Host' : 'Viewer'}${user.isMuted ? ' (Muted)' : ''}</span>
                </div>
            </div>
            <div class="flex items-center gap-1.5 flex-shrink-0">
                ${state.role === 'host' && !isMe ? `
                    <button onclick="toggleMuteUser('${user.id}')" title="${user.isMuted ? 'Unmute' : 'Mute'}" class="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-slate-500 hover:text-indigo-600 transition-colors">
                        <i data-lucide="${user.isMuted ? 'message-square' : 'message-square-off'}" class="w-3.5 h-3.5"></i>
                    </button>
                    <button onclick="kickUser('${user.id}')" title="Kick User" class="p-1 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg text-slate-500 hover:text-rose-600 transition-colors">
                        <i data-lucide="user-x" class="w-3.5 h-3.5"></i>
                    </button>
                ` : ''}
                ${isHost ? '<span class="px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-350 dark:border-slate-700 text-[8px] font-bold uppercase tracking-wider">Host</span>' : ''}
                ${isMe ? '<span class="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 border border-indigo-500/20 text-[8px] font-bold uppercase tracking-wider">You</span>' : ''}
            </div>
        `;

        elements.userListContainer.appendChild(item);
    });

    if (window.lucide) {
        window.lucide.createIcons({ attrs: { class: 'w-3.5 h-3.5' } });
    }
}

// --- LEAVE / DISCONNECT ---
function leaveRoom() {
    // Reset state & elements
    if (state.syncTimer) clearInterval(state.syncTimer);
    if (state.driftCheckTimer) clearInterval(state.driftCheckTimer);

    // Stop Media Elements
    elements.mainVideo.pause();
    elements.mainVideo.src = '';
    elements.mainVideo.playbackRate = 1.0;
    elements.dubbingAudio.pause();
    elements.dubbingAudio.src = '';
    elements.dubbingAudio.playbackRate = 1.0;
    
    // Clear WebRTC streams and calls
    elements.mainVideo.srcObject = null;
    state.activeCalls.forEach(call => call.close());
    state.activeCalls = [];

    // Hide guest stream options
    elements.containerGuestStreamOption.classList.add('hidden');
    elements.btnStreamFromHost.disabled = false;
    elements.btnStreamFromHost.innerHTML = `<i data-lucide="tv" class="w-4 h-4"></i> Stream Video from Host`;
    if (window.lucide) {
        window.lucide.createIcons({ attrs: { class: 'w-4 h-4' } });
    }
    
    // Clear details
    elements.inputVideoFile.value = '';
    elements.labelVideoFile.textContent = 'No Video Selected...';
    elements.videoPlaceholder.classList.remove('hidden');
    elements.hostFileInfo.classList.add('hidden');
    if (elements.selectPlaybackSpeed) {
        elements.selectPlaybackSpeed.value = '1.0';
    }
    if (elements.quickPlaybackSpeed) {
        elements.quickPlaybackSpeed.value = '1.0';
    }
    if (elements.selectPlayerSize) {
        elements.selectPlayerSize.value = 'max';
    }
    if (elements.quickPlayerSize) {
        elements.quickPlayerSize.value = 'max';
    }

    const videoWrapper = elements.mainVideo.parentElement;
    if (videoWrapper) {
        videoWrapper.classList.remove('render-scale-720p', 'render-scale-480p');
        videoWrapper.classList.add('render-scale-max');
    }
    
    clearSubtitles();
    clearDubbing();

    if (state.peer) {
        state.peer.destroy();
    }

    state = {
        peer: null,
        conn: null,
        connections: [],
        activeCalls: [],
        username: '',
        role: '',
        roomId: '',
        roomUsers: [],
        isVideoLoaded: false,
        isCoControl: false,
        isSyncing: false,
        hostPlaying: false,
        hostTime: 0,
        hostFileName: '',
        hostPlaybackRate: 1.0,
        syncTimer: null,
        driftCheckTimer: null,
        activeTab: 'users',
    };

    // UI Reset
    elements.btnCreateRoom.disabled = false;
    elements.btnCreateRoom.innerHTML = `<i data-lucide="plus-circle" class="w-4 h-4"></i> Create Room (Host)`;
    elements.btnJoinRoom.disabled = false;
    elements.btnJoinRoom.innerHTML = `<i data-lucide="play-circle" class="w-4 h-4"></i> Join Room`;
    
    elements.syncWarning.classList.add('hidden');
    elements.chatMessages.innerHTML = `
        <div class="text-center">
            <span class="inline-block px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-[10px] font-medium text-slate-500 dark:text-slate-400">
                Chat Started
            </span>
        </div>
    `;

    // Re-verify theme state UI
    initTheme();

    // Default to Users panel on Lobby reset
    switchTab('users');

    showScreen('lobby');
    showToast('You left the room.', 'info');
}

function copyRoomCode() {
    const code = elements.displayRoomCode.textContent;
    const inviteUrl = `${window.location.origin}${window.location.pathname}?room=${code}`;
    
    if (navigator.clipboard) {
        navigator.clipboard.writeText(inviteUrl)
            .then(() => {
                showToast('Direct invite link copied to clipboard!', 'success');
                // Temporarily change icon
                elements.btnCopyCode.innerHTML = `<i data-lucide="check"></i>`;
                lucide.createIcons({ attrs: { class: 'w-3.5 h-3.5' } });
                setTimeout(() => {
                    elements.btnCopyCode.innerHTML = `<i data-lucide="copy"></i>`;
                    lucide.createIcons({ attrs: { class: 'w-3.5 h-3.5' } });
                }, 2000);
            })
            .catch(err => {
                showToast('Failed to copy: ' + err, 'error');
            });
    } else {
        showToast('Copying is not supported by your browser.', 'error');
    }
}

// --- CHAT SYSTEM ---
function handleSendChat(e) {
    e.preventDefault();
    const text = elements.inputChatMessage.value.trim();
    if (!text) return;

    elements.inputChatMessage.value = '';

    if (state.role === 'host') {
        addChatMessage(state.username, text);
        broadcastChatMessage(state.username, text);
    } else if (state.role === 'guest') {
        if (state.conn) {
            state.conn.send({
                type: 'chat',
                text: text
            });
            addChatMessage(state.username, text);
        }
    }
}

function addChatMessage(username, text) {
    const msgElement = document.createElement('div');
    const isMe = username === state.username;
    
    msgElement.className = `flex flex-col ${isMe ? 'items-end' : 'items-start'} max-w-full`;
    
    // Bubble Styling
    msgElement.innerHTML = `
        <span class="text-[10px] text-slate-500 mb-0.5 px-1">${username}</span>
        <div class="px-3.5 py-2 rounded-2xl text-xs max-w-[85%] break-words ${
            isMe 
                ? 'bg-indigo-600 text-white rounded-tr-sm shadow-md shadow-indigo-600/10' 
                : 'bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-tl-sm border border-slate-200 dark:border-slate-700/30'
        }">
            ${escapeHTML(text)}
        </div>
    `;

    elements.chatMessages.appendChild(msgElement);
    elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;

    // Switch tab indicator if in another panel and receiving chat
    if (state.activeTab !== 'chat' && !isMe) {
        elements.tabChat.classList.add('text-indigo-400');
    }
}

function addSystemChatMessage(text) {
    const msgElement = document.createElement('div');
    msgElement.className = 'text-center my-1';
    msgElement.innerHTML = `
        <span class="inline-block px-2.5 py-1 rounded-full bg-slate-200/60 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-[10px] font-medium text-slate-500 dark:text-slate-400">
            ${text}
        </span>
    `;
    elements.chatMessages.appendChild(msgElement);
    elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
}

function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, 
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag] || tag)
    );
}

// --- CO-CONTROL TOGGLE (HOST ONLY) ---
function handleCoControlToggle() {
    state.isCoControl = elements.toggleCoControl.checked;
    
    state.connections.forEach(conn => {
        conn.send({
            type: 'co_control',
            enabled: state.isCoControl
        });
    });

    addSystemChatMessage(state.isCoControl ? 'Co-control enabled.' : 'Co-control disabled.');
    showToast(state.isCoControl ? 'Co-control enabled.' : 'Co-control disabled.', 'info');
}

// --- HOST ACTION CONTROLS (KICK & MUTE) ---
window.kickUser = function(peerId) {
    if (state.role !== 'host') return;
    
    const user = state.roomUsers.find(u => u.id === peerId);
    const username = user ? user.username : 'User';
    
    const conn = state.connections.find(c => c.peer === peerId);
    if (conn) {
        conn.send({ type: 'kick' });
        setTimeout(() => {
            conn.close();
            handleGuestDisconnect(peerId);
        }, 300);
    }
    showToast(`Kicked ${username}`, 'info');
};

window.toggleMuteUser = function(peerId) {
    if (state.role !== 'host') return;

    const user = state.roomUsers.find(u => u.id === peerId);
    if (user) {
        user.isMuted = !user.isMuted;
        
        const conn = state.connections.find(c => c.peer === peerId);
        if (conn) {
            conn.send({ type: 'mute', muted: user.isMuted });
        }
        
        updateUserListUI();
        broadcastUserList();
        
        showToast(user.isMuted ? `Muted ${user.username}` : `Unmuted ${user.username}`, 'info');
    }
};
