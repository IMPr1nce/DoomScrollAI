/*
 * datafolder.js — the game's "data" folder on this laptop, where every CSV is saved.
 *
 *   data/
 *     Kai_Moreno/            one folder per player (logger.js): Kai_Moreno_tutorial.csv, Kai_Moreno_round1.csv...
 *     leaderboard/           leaderboard.csv (leaderboard.js)
 *
 * A page opened by double-clicking index.html (file://) can't touch the disk on its own. Chrome and Edge can,
 * once a person picks a folder and allows it (the File System Access API: showDirectoryPicker). So the name
 * screen has a "Choose data folder" button. The teacher picks the game's `data` folder, or the game's own
 * folder (a `data` folder is made inside it), and Chrome asks once to allow editing it.
 *
 * Chrome forgets the permission when the page is closed, so it is chosen again each time the game is opened
 * (once per class, not per student: "Log out" keeps it). Remembering it would need browser storage, which the
 * game doesn't use. The `id` below does make Chrome open the picker where the folder was chosen last time.
 *
 * Browser-only (it has nothing to do in Node), but it never touches the page: ui and game.js do that.
 */
(function () {
  'use strict';

  var DS = window.DS = window.DS || {};
  var DATA_DIR = 'data';

  var root = null;                // the data folder, once chosen (a FileSystemDirectoryHandle)

  var folder = {};
  folder.DATA_DIR = DATA_DIR;

  // Firefox and Safari can't write to a folder. There the game falls back to downloads at "Log out".
  folder.supported = function () { return typeof window.showDirectoryPicker === 'function'; };
  folder.ready = function () { return !!root; };

  // Asks for the folder. Must be called from a click (the browser insists). Resolves true once it's ready,
  // false if the person closed the picker, and rejects if the folder can't be used (it's read-only, say).
  folder.choose = function () {
    return window.showDirectoryPicker({ id: 'doomscroll-data', mode: 'readwrite' }).then(function (picked) {
      // The game's own folder was picked: use (or make) the data folder inside it.
      return picked.name === DATA_DIR ? picked : picked.getDirectoryHandle(DATA_DIR, { create: true });
    }).then(function (dir) {
      root = dir;
      return true;
    }, function (e) {
      if (e && e.name === 'AbortError') return false;     // closed the picker: nothing changes
      throw e;
    });
  };

  function sub(name) { return root.getDirectoryHandle(name, { create: true }); }
  function notFound(e) { return e && (e.name === 'NotFoundError' || e.name === 'TypeMismatchError'); }

  // Write a whole file (replacing it), making the sub-folder if needed. Chrome writes to a temporary file
  // and swaps it in on close(), so a half-written CSV never replaces a good one.
  folder.write = function (dirName, fileName, text) {
    return sub(dirName).then(function (dir) {
      return dir.getFileHandle(fileName, { create: true });
    }).then(function (file) {
      return file.createWritable();
    }).then(function (out) {
      return Promise.resolve(out.write(text)).then(function () { return out.close(); });
    });
  };

  // The file's text, or null if it isn't there yet.
  folder.read = function (dirName, fileName) {
    return sub(dirName).then(function (dir) {
      return dir.getFileHandle(fileName);
    }).then(function (file) {
      return file.getFile();
    }).then(function (f) {
      return f.text();
    }, function (e) {
      if (notFound(e)) return null;
      throw e;
    });
  };

  folder.exists = function (dirName, fileName) {
    return sub(dirName).then(function (dir) {
      return dir.getFileHandle(fileName);
    }).then(function () { return true; }, function (e) {
      if (notFound(e)) return false;
      throw e;
    });
  };

  DS.dataFolder = folder;
})();
