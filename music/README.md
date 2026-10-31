# Gallery music

Put your audio files directly in this folder. MP3 and WAV are the most portable
choices; OGG, M4A, AAC, FLAC, Opus and WebM also appear in the playlist, but
playback support depends on the browser. Subfolders are not scanned.

## Automatic folder discovery on your computer

From the `xecon-department` folder run:

```sh
node music-server.cjs
```

Open http://localhost:8080/gallery.html. The server rereads this folder whenever
Play is pressed or a song ends, so adding/removing songs needs no restart or edits.
Node.js is required; no packages need installing. The server is local to your computer.

Play chooses a random song, avoiding the previous song when another is available.
Pause stops playback; the next Play chooses again rather than resuming. When a
song ends, another random song plays. With one song it repeats. Nothing autoplays
when the page first opens. The volume slider starts at 45%.

## GitHub Pages, other static hosting, or opening gallery.html directly

Browsers cannot automatically list files in a website folder. After changing
the music files, Windows users can double-click `update-music.cmd` in the
`xecon-department` folder. This generates the playlist using built-in PowerShell;
Node.js is not required for this option.

Alternatively, if Node.js is installed, run:

```sh
node music-server.cjs --index
```

Publish the audio files and generated `music/tracks.js` together with
`gallery.html` and `gallery-music.js`. For direct file opening, use the same
generated playlist. Regenerate it whenever you add, remove, or rename songs.

No music is bundled. Only upload music you have permission to share.
