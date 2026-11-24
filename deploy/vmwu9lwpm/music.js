export const MUSIC_FILES = Object.freeze({
  explore: 'music-explore.mp3',
  battle: 'music-battle.mp3',
});

import { normalizeVolume, DEFAULT_MUSIC_VOLUME } from './audio-settings.js';
const FADE_SECONDS = 0.4;

export function createMusicPlayer() {
  let context, output, playing, requestedScene, audible = false, revision = 0;
  const buffers = new Map();
  let volume=DEFAULT_MUSIC_VOLUME;

  function loadTrack(scene) {
    if (!buffers.has(scene)) {
      const pending = fetch(new URL(MUSIC_FILES[scene], import.meta.url))
        .then(response => {
          if (!response.ok) throw new Error('无法加载背景音乐');
          return response.arrayBuffer();
        })
        .then(bytes => context.decodeAudioData(bytes))
        .catch(error => {
          buffers.delete(scene);
          throw error;
        });
      buffers.set(scene, pending);
    }
    return buffers.get(scene);
  }

  function switchTrack(scene, buffer) {
    const now = context.currentTime;
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    source.loop = true;
    source.connect(gain);
    gain.connect(output);
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
    };
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(1, now + FADE_SECONDS);
    source.start(now);
    if (playing) {
      const previous = playing.gain.gain;
      const currentVolume = Math.min(1, (now - playing.startedAt) / FADE_SECONDS);
      previous.cancelScheduledValues(now);
      previous.setValueAtTime(currentVolume, now);
      previous.linearRampToValueAtTime(0, now + FADE_SECONDS);
      playing.source.stop(now + FADE_SECONDS);
    }
    playing = { scene, source, gain, startedAt: now };
  }

  return {
    update(scene, { enabled, visible, gesture = false, volume:requestedVolume=DEFAULT_MUSIC_VOLUME }) {
      const nextVolume=normalizeVolume(requestedVolume,DEFAULT_MUSIC_VOLUME);
      volume=nextVolume;
      if(output&&audible)output.gain.setTargetAtTime(volume/100,context.currentTime,.025);
      const shouldPlay = enabled && visible;
      if (scene === requestedScene && shouldPlay === audible && !gesture) return;
      requestedScene = scene;
      audible = shouldPlay;
      const request = ++revision;

      if (!audible) {
        if (context) {
          output.gain.cancelScheduledValues(context.currentTime);
          output.gain.value = 0;
          void context.suspend().catch(() => {});
        }
        return;
      }
      if (!context && gesture && globalThis.AudioContext) {
        try {
          context = new AudioContext();
          output = context.createGain();
          output.connect(context.destination);
        } catch {
          context = undefined;
          return;
        }
      }
      if (!context) return;

      output.gain.setTargetAtTime(volume/100,context.currentTime,.025);
      void context.resume()
        .then(() => {
          if (request !== revision || playing?.scene === scene) return;
          return loadTrack(scene).then(buffer => {
            if (request === revision && playing?.scene !== scene) switchTrack(scene, buffer);
          });
        })
        .catch(() => {
          // A later gesture can retry if the browser blocks playback or loading fails.
        });
    },
  };
}
