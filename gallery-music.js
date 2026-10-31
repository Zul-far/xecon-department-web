(() => {
  const audio = document.getElementById('gallery-audio');
  const button = document.getElementById('music-play');
  const action = document.getElementById('music-action');
  const icon = document.getElementById('music-icon');
  const title = document.getElementById('music-track');
  const status = document.getElementById('music-status');
  const volume = document.getElementById('music-volume');
  let currentTrack = '';
  let busy = false;
  let request = 0;
  audio.volume = Number(volume.value);
  volume.addEventListener('input', () => { audio.volume = Number(volume.value); });

  function updateButton() {
    const playing = !audio.paused && !audio.ended;
    action.textContent = playing ? 'Pause' : 'Play';
    icon.setAttribute('d', playing ? 'M3 2h4v12H3zM9 2h4v12H9z' : 'M4 2.5v11L13 8z');
    button.setAttribute('aria-label', playing ? 'Pause music' : 'Play a random song');
  }

  function validTracks(tracks) {
    if (!Array.isArray(tracks)) return [];
    // Only files inside our music folder may become audio sources.
    return [...new Set(tracks.filter(name => typeof name === 'string' &&
      !/[\\/\x00-\x1f]/.test(name) && /\.(mp3|wav|ogg|m4a|aac|flac|opus|webm)$/i.test(name)))];
  }

  async function discoverTracks() {
    if (location.protocol !== 'file:') {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      try {
        const response = await fetch('./api/music', { cache: 'no-store', signal: controller.signal });
        if (response.ok && response.headers.get('content-type')?.includes('application/json')) {
          return validTracks(await response.json());
        }
      } catch { /* Static hosting uses the generated playlist below. */ }
      finally { clearTimeout(timeout); }
    }
    return validTracks(window.GALLERY_TRACKS);
  }

  async function playRandom() {
    if (busy) return;
    busy = true;
    button.disabled = true;
    const token = ++request;
    status.textContent = 'Finding a song…';
    try {
      const tracks = await discoverTracks();
      if (!tracks.length) {
        title.textContent = 'The sky is quiet for now';
        status.textContent = 'Add songs to music/. See music/README.md to set up playback.';
        return;
      }
      let candidates = tracks.filter(track => track !== currentTrack);
      if (!candidates.length) candidates = tracks.slice();
      // Try each candidate at most once, so a bad file cannot trap playback.
      while (candidates.length && token === request) {
        const index = Math.floor(Math.random() * candidates.length);
        const track = candidates.splice(index, 1)[0];
        audio.src = './music/' + encodeURIComponent(track);
        title.textContent = track.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
        title.title = track;
        try {
          await audio.play();
          currentTrack = track;
          status.textContent = 'Drift away. Next Play picks another random song.';
          return;
        } catch (error) {
          if (error.name === 'NotAllowedError') {
            status.textContent = 'Playback was blocked. Allow audio for this page, then press Play.';
            return;
          }
        }
      }
      status.textContent = 'These songs could not play. Try a browser-supported MP3 or WAV file.';
    } catch {
      status.textContent = 'Could not load music. Press Play to try again.';
    } finally {
      busy = false;
      button.disabled = false;
      updateButton();
    }
  }

  button.addEventListener('click', () => {
    if (!audio.paused && !audio.ended) {
      audio.pause();
      status.textContent = 'Paused. Play will choose a random song.';
    } else {
      void playRandom();
    }
  });
  audio.addEventListener('play', updateButton);
  audio.addEventListener('pause', updateButton);
  audio.addEventListener('ended', () => { updateButton(); void playRandom(); });
  audio.addEventListener('error', () => {
    if (!busy) {
      updateButton();
      status.textContent = 'This song could not play. Press Play to try another.';
    }
  });
})();
