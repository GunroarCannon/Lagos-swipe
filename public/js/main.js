/* Boot: platform → saved data → splash (first tap unlocks sound) → first-launch look → game. */
(function (LS) {
  'use strict';
  const { $ } = LS;

  async function boot() {
    const go = $('#splash-go'), note = $('#splash-note');
    // wait for fonts and the paper texture so the first portraits are painted with it
    const ready = Promise.all([
      document.fonts && document.fonts.ready ? Promise.race([document.fonts.ready, LS.sleep(2500)]) : null,
      new Promise(res => { const t = PM.paperTexture; if (!t || t.complete) res(); else { t.onload = t.onerror = res; setTimeout(res, 2500); } }),
    ]);
    await LS.platform.init();
    await ready;
    try { LS.splashStickers(); } catch (e) { console.error(e); }
    // Read their Lagos Life photo while they're still on the splash, so the first portrait is already close
    // to their face. Started, never awaited here: a slow model must not hold up Start.
    const photo = { look: null, pending: null };
    if (LS.platform.player.avatar) photo.pending = LS.avatarLook(LS.platform.player.avatar).then(r => { photo.look = r; return r; });
    const saved = LS.Game.load();
    const meta = Object.assign({ charms: 1, runs: 0, best: 0, endings: {} }, saved && saved.meta);
    LS.look = saved && saved.look;
    note.textContent = LS.platform.mode === 'dev' ? 'Guest mode (open inside Lagos Life to play as you)' : `Playing as ${LS.platform.player.name}`;
    go.disabled = false; go.textContent = saved && saved.run && !saved.run.over ? 'Continue' : 'Start';

    go.onclick = async () => {
      go.disabled = true;
      LS.sound.unlock();
      let look = LS.look;
      if (!look) {
        // the photo's colours and presentation when we already have them, the free on-device sample otherwise
        const colors = photo.look || await LS.sampleAvatar(LS.platform.player.avatar);
        const gender = (photo.look && photo.look.gender) || 'fem';
        const bio = LS.defaultBio();
        bio.looking = LS.opposite(gender);
        look = { genome: LS.playerGenome(LS.platform.player.id, gender, colors), bio, locks: [] };
      }
      LS.Game.look = look; LS.Game.meta = meta;
      const begin = () => {
        $('#splash').classList.add('gone');
        $('#app').dataset.screen = 'game';
        LS.Game.init(LS.Game.look, saved && saved.run, meta);
        LS.social.start().then(() => { LS.Game.updateHud(); LS.social.saveProfile(LS.Game.look, LS.Engine.life(LS.Game.s)); });
      };
      if (!LS.look) {
        $('#splash').classList.add('gone');
        LS.Game.s = null;
        LS.Game.buildHud();
        LS.customize({ intro: true, onSave: begin, photo });
      } else begin();
    };

    $('#btn-life').onclick = () => LS.showLife();
    $('#btn-inbox').onclick = () => LS.showInbox();
    $('#btn-menu').onclick = () => LS.showMenu();
    $('#hud-money').onclick = () => LS.showBank();
    $('#me-corner').onclick = () => LS.customize({ intro: false });
    LS.social.onChange((kind, data) => { if (kind === 'news') LS.Game.toast('New in your inbox ✉'); LS.Game.updateHud && LS.Game.s && LS.Game.updateHud(); });
    LS.platform.onPause(() => { LS.portrait.paused = true; LS.sound.stop(); });
    LS.platform.onResume(() => { LS.portrait.paused = false; });
    document.addEventListener('visibilitychange', () => { if (document.hidden) LS.sound.stop(); });
  }

  boot().catch(e => { console.error(e); $('#splash-note').textContent = 'Something went wrong loading the game.'; });
})(window.LS = window.LS || {});
