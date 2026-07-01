# SyncRoom - Minimalist P2P Watch Party

SyncRoom is a minimalist, browser-based peer-to-peer watch party application. It allows you to watch local video files synchronously with friends without uploading the video to any server. It also supports real-time WebRTC video/audio streaming from the Host, allowing friends to watch your video without having the file on their computers!

## Features

- **P2P Synchronization**: Pause, play, seek, and playback speed are automatically synchronized between all participants using PeerJS (WebRTC).
- **Host Media Streaming**: Stream your local video file directly to other room members using WebRTC so they can watch without having the video file locally.
- **Drag & Drop File Loader**: Drag and drop videos, subtitles (`.srt`/`.vtt`), and dubbing audio (`.mp3`/`.wav`) directly onto the video player to load them.
- **Direct Invite Links**: Copy a direct join link (e.g., `?room=roomCode`) that auto-fills the room credentials for your friends.
- **Subtitles & Dubbing**: Add custom subtitle files or external audio tracks to synchronize translations or dual audio.
- **Dark Mode**: Switch between dark and light themes seamlessly.
- **No Servers**: Fully client-side logic. Deploys perfectly on GitHub Pages!

## Local Run

To run the application locally, you need to serve the files using a simple local web server (because browsers restrict file URL access for security reasons):

### Python (Recommended)
Open your terminal in the project directory and run:
```bash
python3 -m http.server 8080
```
Then navigate to `http://localhost:8080` in your web browser.

### Node.js (Alternative)
If you have Node.js installed, you can use `http-server`:
```bash
npx http-server -p 8080
```

## GitHub Pages Deployment

Since SyncRoom has no backend, you can host it for free on GitHub Pages:

1. **Create a GitHub Repository**: Create a new repository on GitHub (e.g., named `syncroom`).
2. **Push the Files**: Commit and push the project files (`index.html`, `style.css`, `app.js`, `README.md`) to your repository.
3. **Enable GitHub Pages**:
   - Go to your repository settings on GitHub.
   - Select **Pages** in the sidebar.
   - Under **Build and deployment**, set the source to **Deploy from a branch**.
   - Select your main branch (e.g., `main` or `master`) and folder `/ (root)`.
   - Click **Save**.
4. **Access your site**: Your app will be live at `https://<your-username>.github.io/syncroom/` in a couple of minutes!
